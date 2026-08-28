/**
 * Projects Dashboard Message Handlers
 *
 * Handles messages from the Projects Dashboard webview.
 * Follows Pattern B: Returns response data (doesn't use sendMessage).
 *
 * Complex operations are delegated to services:
 * - settingsTransferService: Import/export/copy settings
 * - projectDeletionService: Project deletion with retry logic
 */

import * as vscode from 'vscode';
import {
    extractSettingsFromProject,
    importSettingsFromFile,
    copySettingsFromProject,
    exportProjectSettings,
    deleteProject,
    renameProjectCore,
} from '../services';
import { BaseWebviewCommand } from '@/core/base';
import { ServiceLocator } from '@/core/di';
import { executeCommandForProject } from '@/core/handlers';
import { buildOrgTargetFromProjectAdobe, withOrgContext } from '@/core/shell';
import { hasMeshDeploymentRecord } from '@/core/state/appBuilderComponentState';
import { sessionUIState } from '@/core/state/sessionUIState';
import { openInIncognito } from '@/core/utils';
import { validateProjectPath, validateURL } from '@/core/validation';
import {
    getEwCanvasBranch,
    resolveProjectAuthoringExperience,
} from '@/features/eds/handlers/edsHelpers';
import { determineMeshStatus } from '@/features/mesh/services/meshStatusResolver';
import { detectMeshChanges } from '@/features/mesh/services/stalenessDetector';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { MessageHandler, HandlerContext, HandlerResponse } from '@/types/handlers';
import {
    getMeshComponentInstance,
    getEdsLiveUrl,
    getEdsDaLiveUrl,
    getAdminPanelUrl,
} from '@/types/typeGuards';

/**
 * Get all projects from StateManager
 *
 * Loads the list of projects and enriches with full project data.
 * Also includes current config for initial render.
 */
export const handleGetProjects: MessageHandler = async (
    context: HandlerContext,
): Promise<HandlerResponse> => {
    try {
        // Get list of project paths
        const projectList = await context.stateManager.getAllProjects();

        // Load full project data for each (read-only, don't persist)
        const projects: Project[] = [];
        for (const item of projectList) {
            const project = await context.stateManager.loadProjectFromPath(item.path, undefined, {
                persistAfterLoad: false,
            });
            if (project) {
                projects.push(project);
            }
        }

        // Enrich projects with mesh staleness status (full fidelity check)
        for (const project of projects) {
            const meshComponent = getMeshComponentInstance(project);
            if (meshComponent && project.componentConfigs) {
                try {
                    if (hasMeshDeploymentRecord(project)) {
                        // Org-targeted PER PROJECT. detectMeshChanges reaches the
                        // `aio` CLI whenever the staleness baseline is empty, and an
                        // unwrapped call inherits the CLI's process-global console
                        // selection — which this extension deliberately stopped
                        // writing, so it holds whatever an earlier session left
                        // there. Wrapping the LOOP instead of each iteration would
                        // be worse than nothing: every project would be queried
                        // against the first one's org.
                        // Captured, not asserted: the enclosing `if` narrows
                        // componentConfigs, but the closure below loses it.
                        const configs = project.componentConfigs;
                        const status = await withOrgContext(
                            buildOrgTargetFromProjectAdobe(project.adobe),
                            async () => {
                                const meshChanges = await detectMeshChanges(project, configs);
                                return determineMeshStatus(meshChanges, meshComponent, project);
                            },
                        );
                        project.meshStatusSummary = status === 'config-changed' ? 'stale' : status;
                    } else {
                        project.meshStatusSummary = 'not-deployed';
                    }
                    await context.stateManager.saveProject(project);
                } catch {
                    project.meshStatusSummary = 'unknown';
                }
            }
        }

        // Pinned projects first, then alphabetical within each group.
        // (mtime-based scanner order is unstable after mesh enrichment writes,
        // so we always re-sort to make the rendered order deterministic.)
        projects.sort((a, b) => {
            const aPinned = a.pinned ? 1 : 0;
            const bPinned = b.pinned ? 1 : 0;
            if (aPinned !== bPinned) return bPinned - aPinned;
            return a.name.localeCompare(b.name);
        });

        // Include config in response (avoids race condition with init message)
        // Session override takes precedence over VS Code setting
        const config = vscode.workspace.getConfiguration('demoBuilder');
        const configViewMode = config.get<'cards' | 'rows'>('projectsViewMode', 'cards');
        const projectsViewMode = sessionUIState.viewModeOverride ?? configViewMode;

        // Find running project path (if any)
        const runningProject = projects.find((p) => p.status === 'running');
        const runningProjectPath = runningProject?.path;

        return {
            success: true,
            data: { projects, projectsViewMode, runningProjectPath },
        };
    } catch (error) {
        context.logger.error('Failed to load projects', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to load projects',
        };
    }
};

/**
 * Select a project by path.
 *
 * Loads the project and sets it as the current project (the persisted
 * `currentProjectPath` pointer that `StateManager.getCurrentProject()` reads).
 * Browsing/selecting a project NO LONGER anchors the VS Code workspace — the
 * dashboard, component tree, and auth cache all work off that pointer, so a
 * plain selection just surfaces the dashboard webview in-place with no reload.
 *
 * Nothing anchors the workspace to a project subdir in the always-root home
 * model — dashboards render in-place off the current-project pointer.
 *
 * Behavior:
 *   - plain selection (`forceNewWindow` falsy), regardless of whether the
 *     current workspace already matches → surface the project dashboard webview
 *     in-place. No reload, ever.
 *   - `forceNewWindow: true` (shift/cmd-click) → open the project in a NEW
 *     VS Code window; the current window is left alone (still on the projects
 *     list). Note: that new window opens at the project subdir, so its
 *     activation `shouldReHomeToRoot` check re-homes it back to the projects
 *     root (home-on-launch) — the always-root invariant still holds.
 */
export const handleSelectProject: MessageHandler<{
    projectPath: string;
    forceNewWindow?: boolean;
    surface?: 'integrations';
}> = async (
    context: HandlerContext,
    payload?: { projectPath: string; forceNewWindow?: boolean; surface?: 'integrations' },
): Promise<HandlerResponse> => {
    try {
        if (!payload?.projectPath) {
            return {
                success: false,
                error: 'Project path is required',
            };
        }

        // SECURITY: Validate path is within demo-builder projects directory
        try {
            validateProjectPath(payload.projectPath);
        } catch (validationError) {
            context.logger.error(
                'Path validation failed',
                validationError instanceof Error ? validationError : undefined,
            );
            return {
                success: false,
                error: 'Invalid project path',
            };
        }

        const project = await context.stateManager.loadProjectFromPath(payload.projectPath);

        if (!project) {
            return {
                success: false,
                error: 'Project not found',
            };
        }

        // Set as current project in state
        await context.stateManager.saveProject(project);
        context.logger.info(`Selected project: ${project.name}`);

        const forceNewWindow = payload.forceNewWindow === true;

        if (forceNewWindow) {
            // Shift/cmd-click: open the project in a NEW VS Code window and
            // leave the current one alone (still on the projects list). This is
            // the only path that still anchors a workspace on selection.
            try {
                await vscode.commands.executeCommand(
                    'vscode.openFolder',
                    vscode.Uri.file(project.path),
                    true,
                );
            } catch (openError) {
                context.logger.error(
                    'Failed to open project folder in new window',
                    openError instanceof Error ? openError : undefined,
                );
            }
        } else {
            // Plain selection: surface the dashboard webview in-place. We never
            // reload the window on browse — the persisted current-project
            // pointer (set by saveProject above) is what the dashboard reads,
            // so a reload is unnecessary. The workspace only anchors later, on
            // demand, when the user launches a workspace-requiring action.
            //
            // Mark a webview transition so the outgoing Projects List's
            // dispose() doesn't fight the dashboard handoff.
            //
            // `surface` picks WHICH webview opens. Selection is otherwise
            // identical — path validation, load, set-current — so the project
            // kebab's "Integrations…" rides this handler rather than forking it.
            await BaseWebviewCommand.startWebviewTransition();
            try {
                await vscode.commands.executeCommand(
                    payload.surface === 'integrations'
                        ? 'demoBuilder.showIntegrations'
                        : 'demoBuilder.showProjectDashboard',
                );
            } catch (navError) {
                context.logger.error(
                    'Failed to navigate to dashboard',
                    navError instanceof Error ? navError : undefined,
                );
            } finally {
                BaseWebviewCommand.endWebviewTransition();
            }
        }

        return {
            success: true,
            data: { project },
        };
    } catch (error) {
        context.logger.error(
            'Failed to select project',
            error instanceof Error ? error : undefined,
        );
        return {
            success: false,
            error: 'Failed to select project',
        };
    }
};

/**
 * Trigger project creation wizard
 */
export const handleCreateProject: MessageHandler = async (
    context: HandlerContext,
): Promise<HandlerResponse> => {
    try {
        context.logger.info('Creating new project from dashboard');
        await vscode.commands.executeCommand('demoBuilder.createProject');
        return {
            success: true,
        };
    } catch (error) {
        context.logger.error(
            'Failed to start project creation',
            error instanceof Error ? error : undefined,
        );
        return {
            success: false,
            error: 'Failed to start project creation',
        };
    }
};

/**
 * Open help/support URL
 */
export const handleOpenHelp: MessageHandler = async (
    context: HandlerContext,
): Promise<HandlerResponse> => {
    try {
        const helpUrl = 'https://github.com/anthropics/demo-builder-vscode/issues';
        await vscode.env.openExternal(vscode.Uri.parse(helpUrl));
        return { success: true };
    } catch (error) {
        context.logger.error('Failed to open help', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to open help',
        };
    }
};

/**
 * Open VS Code settings for this extension
 */
export const handleOpenSettings: MessageHandler = async (
    context: HandlerContext,
): Promise<HandlerResponse> => {
    try {
        await vscode.commands.executeCommand(
            'workbench.action.openSettings',
            '@ext:adobe.demo-builder',
        );
        return { success: true };
    } catch (error) {
        context.logger.error('Failed to open settings', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to open settings',
        };
    }
};

/**
 * Set view mode override for the session
 */
export const handleSetViewModeOverride: MessageHandler<{ viewMode: 'cards' | 'rows' }> = async (
    _context: HandlerContext,
    payload?: { viewMode: 'cards' | 'rows' },
): Promise<HandlerResponse> => {
    if (payload?.viewMode) {
        sessionUIState.viewModeOverride = payload.viewMode;
    }
    return { success: true };
};

// ============================================================================
// Settings Import/Export Handlers (delegated to settingsTransferService)
// ============================================================================

/**
 * Import settings from a JSON file
 */
export const handleImportFromFile: MessageHandler = async (
    context: HandlerContext,
): Promise<HandlerResponse> => {
    return importSettingsFromFile(context);
};

/**
 * Copy settings from an existing project
 */
export const handleCopyFromExisting: MessageHandler = async (
    context: HandlerContext,
): Promise<HandlerResponse> => {
    return copySettingsFromProject(context);
};

/**
 * Export project settings to a file
 */
export const handleExportProject: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
): Promise<HandlerResponse> => {
    if (!payload?.projectPath) {
        return {
            success: false,
            error: 'No project path provided',
        };
    }

    try {
        validateProjectPath(payload.projectPath);
    } catch {
        return {
            success: false,
            error: 'Invalid project path',
        };
    }

    const project = await context.stateManager.loadProjectFromPath(payload.projectPath, undefined, {
        persistAfterLoad: false,
    });
    if (!project) {
        return {
            success: false,
            error: 'Project not found',
        };
    }

    return exportProjectSettings(context, project);
};

/**
 * Resolve the target project from a `{ projectPath }` payload WITHOUT touching
 * the current-project pointer: required-path check, the projects-directory
 * security validation, and a non-persisting load.
 *
 * One home for what was the same prologue in seven handlers (2026-08-27 dedup
 * sweep, PL-8 item 2). `handleSelectProject` deliberately does NOT use it —
 * selecting persists the loaded project as the pointer, which is the one
 * behavior this helper exists to not have.
 */
async function resolveProjectFromPath(
    context: HandlerContext,
    payload: { projectPath?: string } | undefined,
): Promise<{ ok: true; project: Project } | { ok: false; error: HandlerResponse }> {
    if (!payload?.projectPath) {
        return { ok: false, error: { success: false, error: 'Project path is required' } };
    }
    // SECURITY: Validate path is within demo-builder projects directory
    try {
        validateProjectPath(payload.projectPath);
    } catch {
        return { ok: false, error: { success: false, error: 'Invalid project path' } };
    }
    const project = await context.stateManager.loadProjectFromPath(payload.projectPath, undefined, {
        persistAfterLoad: false,
    });
    if (!project) {
        return { ok: false, error: { success: false, error: 'Project not found' } };
    }
    return { ok: true, project };
}

// ============================================================================
// Delete Project Handler (delegated to projectDeletionService)
// ============================================================================

/**
 * Delete a project by path
 *
 * Delegates to projectDeletionService which handles confirmation, cleanup, and retry logic.
 */
export const handleDeleteProject: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
): Promise<HandlerResponse> => {
    try {
        const resolved = await resolveProjectFromPath(context, payload);
        if (!resolved.ok) {
            return resolved.error;
        }
        const { project } = resolved;

        const result = await deleteProject(context, project);

        // Notify UI to refresh (handles timeout scenarios)
        // Cast data to expected shape - deleteProject returns { success: boolean }
        const resultData = result.data as { success?: boolean } | undefined;
        if (result.success && resultData?.success) {
            context.sendMessage?.('projectDeleted', {});
        }

        return result;
    } catch (error) {
        context.logger.error(
            'Failed to delete project',
            error instanceof Error ? error : undefined,
        );
        return {
            success: false,
            error: 'Failed to delete project',
        };
    }
};

// ============================================================================
// Edit Project Handler
// ============================================================================

/**
 * Edit an existing project
 *
 * Checks if demo is running and opens wizard in edit mode.
 */
export const handleEditProject: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
): Promise<HandlerResponse> => {
    try {
        const resolved = await resolveProjectFromPath(context, payload);
        if (!resolved.ok) {
            return resolved.error;
        }
        const { project } = resolved;

        // Note: Edit menu is only shown when project is not running (UI enforces this)
        // Extract settings for edit mode (include secrets for local edit)
        const settings = extractSettingsFromProject(project, true);

        context.logger.info(`Opening edit wizard for project: ${project.name}`);
        context.logger.debug(
            `[Edit] Project package/stack: ${project.selectedPackage}/${project.selectedStack}`,
        );
        context.logger.debug(
            `[Edit] Settings package/stack: ${settings.selectedPackage}/${settings.selectedStack}`,
        );

        // Debug: Log EDS config extraction for troubleshooting
        const edsStorefront = project.componentInstances?.['eds-storefront'];
        context.logger.debug(`[Edit] EDS storefront instance exists: ${!!edsStorefront}`);
        if (edsStorefront) {
            context.logger.debug(`[Edit] EDS storefront has metadata: ${!!edsStorefront.metadata}`);
            if (edsStorefront.metadata) {
                const metadata = edsStorefront.metadata as Record<string, unknown>;
                context.logger.debug(
                    `[Edit] EDS metadata keys: [${Object.keys(metadata).join(', ')}]`,
                );
                context.logger.debug(`[Edit] EDS metadata.githubRepo: ${metadata.githubRepo}`);
                context.logger.debug(`[Edit] EDS metadata.daLiveOrg: ${metadata.daLiveOrg}`);
                context.logger.debug(`[Edit] EDS metadata.daLiveSite: ${metadata.daLiveSite}`);
            }
        }
        context.logger.debug(
            `[Edit] Extracted edsConfig: ${settings.edsConfig ? JSON.stringify(settings.edsConfig) : 'undefined'}`,
        );
        if (settings.edsConfig) {
            context.logger.debug(`[Edit] edsConfig.githubOwner: ${settings.edsConfig.githubOwner}`);
            context.logger.debug(`[Edit] edsConfig.repoName: ${settings.edsConfig.repoName}`);
            context.logger.debug(`[Edit] edsConfig.daLiveOrg: ${settings.edsConfig.daLiveOrg}`);
            context.logger.debug(`[Edit] edsConfig.daLiveSite: ${settings.edsConfig.daLiveSite}`);
        }

        // Open wizard in edit mode
        await vscode.commands.executeCommand('demoBuilder.createProject', {
            editProject: {
                projectPath: project.path,
                // The SLUG stays the identity (`editOriginalName` compares against
                // it, so the dedupe check still allows keeping the current name).
                projectName: project.name,
                // ...and the TITLE seeds the field, so editing a project shows
                // what the user called it rather than its folder.
                projectTitle: project.title,
                settings,
            },
        });

        return {
            success: true,
            data: { success: true },
        };
    } catch (error) {
        context.logger.error('Failed to edit project', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to edit project',
        };
    }
};

// ============================================================================
// Rename Project Handler
// ============================================================================

/**
 * Rename an existing project
 *
 * Updates the project name in the manifest without requiring the full edit wizard.
 */
export const handleRenameProject: MessageHandler<{ projectPath: string; newName: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string; newName: string },
): Promise<HandlerResponse> => {
    if (!payload?.projectPath || !payload?.newName) {
        return {
            success: false,
            error: 'Project path and new name are required',
        };
    }

    try {
        validateProjectPath(payload.projectPath);
    } catch {
        return {
            success: false,
            error: 'Invalid project path',
        };
    }

    // Load project (persist after load since we'll be saving changes)
    const project = await context.stateManager.loadProjectFromPath(payload.projectPath, undefined, {
        persistAfterLoad: true,
    });
    if (!project) {
        return {
            success: false,
            error: 'Project not found',
        };
    }

    // Shared rename core (folder rename + path updates + recent-projects + save)
    return renameProjectCore(context, project, payload.newName);
};

// ============================================================================
// Demo Control Handlers (Start/Stop/Open)
// ============================================================================

/**
 * Start a demo for a project
 */
export const handleStartDemo: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
): Promise<HandlerResponse> => {
    return executeCommandForProject(context, payload?.projectPath, 'demoBuilder.startDemo');
};

/**
 * Stop a demo for a project
 */
export const handleStopDemo: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
): Promise<HandlerResponse> => {
    return executeCommandForProject(context, payload?.projectPath, 'demoBuilder.stopDemo');
};

/**
 * Open a running demo in browser
 */
export const handleOpenBrowser: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
): Promise<HandlerResponse> => {
    return executeCommandForProject(context, payload?.projectPath, 'demoBuilder.openBrowser');
};

/**
 * Open the configured AI chat surface for a specific project — home-grid kebab
 * "Open AI" wiring. AI = chat (the Claude Code terminal tab), not the Prompt
 * Library.
 *
 * Always-root home model: the home Chat launches at the projects root, not the
 * project subdir, so nothing anchors the workspace here. We only set the
 * current-project pointer; the home Chat resolves "the active project" from that
 * pointer via the `get_current_project` MCP tool.
 *
 * Flow:
 *   1. Load the project for the given path and set it as the current-project
 *      pointer (`saveProject`).
 *   2. Dispatch `demoBuilder.openInClaude` with NO project arg — the command
 *      always launches the home Chat at the projects root.
 */
export const handleOpenAiForProject: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
): Promise<HandlerResponse> => {
    const resolved = await resolveProjectFromPath(context, payload);
    if (!resolved.ok) {
        return resolved.error;
    }
    const { project } = resolved;

    // Set the current-project pointer so the dashboard / state reads and the
    // home Chat's `get_current_project` tool resolve to this project. No
    // workspace anchor — the home Chat launches at the projects root.
    await context.stateManager.saveProject(project);
    await vscode.commands.executeCommand('demoBuilder.openInClaude');
    return { success: true };
};

/**
 * Open EDS live site in browser
 *
 * Opens in incognito/private browsing mode to ensure a clean session
 * without cached content or logged-in states that could affect the demo.
 */
export const handleOpenLiveSite: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
): Promise<HandlerResponse> => {
    const resolved = await resolveProjectFromPath(context, payload);
    if (!resolved.ok) {
        return resolved.error;
    }
    const { project } = resolved;

    const liveUrl = getEdsLiveUrl(project);

    if (!liveUrl) {
        return { success: false, error: 'EDS live URL not available' };
    }

    // Show progress notification while browser is opening
    // Incognito mode can take a moment to launch
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Opening in private browser...',
            cancellable: false,
        },
        async () => {
            // Validate URL before shell execution (defense against injection via stored URLs)
            try {
                validateURL(liveUrl);
            } catch {
                throw new Error(`Invalid live URL: ${liveUrl}`);
            }
            // Open in incognito mode for clean demo experience (no cached content/cookies)
            // Falls back to normal browser if incognito mode is not available
            await openInIncognito(liveUrl);
        },
    );

    return { success: true };
};

/**
 * Open DA.live for authoring
 */
export const handleOpenDaLive: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
): Promise<HandlerResponse> => {
    const resolved = await resolveProjectFromPath(context, payload);
    if (!resolved.ok) {
        return resolved.error;
    }
    const { project } = resolved;

    const daLiveUrl = getEdsDaLiveUrl(
        project,
        resolveProjectAuthoringExperience(project),
        getEwCanvasBranch(),
    );

    if (!daLiveUrl) {
        return { success: false, error: 'DA.live URL not available' };
    }

    await vscode.env.openExternal(vscode.Uri.parse(daLiveUrl));
    return { success: true };
};

/**
 * Open the Adobe Commerce Admin Panel for a project.
 *
 * The admin URL resolves via getAdminPanelUrl: an explicit
 * ADOBE_COMMERCE_ADMIN_URL (PaaS Configure field / override) wins, otherwise
 * SaaS projects derive it from the ACCS tenant endpoint. When unresolvable,
 * a notification offers a jump to the Configure screen instead of failing.
 */
export const handleOpenAdminPanel: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
): Promise<HandlerResponse> => {
    const resolved = await resolveProjectFromPath(context, payload);
    if (!resolved.ok) {
        return resolved.error;
    }
    const { project } = resolved;

    const url = getAdminPanelUrl(project);

    if (!url) {
        // No URL configured — offer the Configure screen. Fire-and-forget so the
        // webview response isn't held on the user's notification choice. The
        // saveProject sets the current-project pointer, which configureProject
        // resolves from (mirrors handleOpenAiForProject).
        void vscode.window
            .showInformationMessage('No Admin Panel URL is set for this project.', 'Open Configure')
            .then(async (selection) => {
                if (selection === 'Open Configure') {
                    await context.stateManager.saveProject(project);
                    await vscode.commands.executeCommand('demoBuilder.configureProject');
                }
            })
            .then(undefined, (error) => {
                context.logger.error(
                    '[ProjectsList] Failed to open Configure from admin-panel prompt',
                    error as Error,
                );
            });
        return { success: true };
    }

    // Validate URL before opening (defense against injection via stored URLs).
    // Generic error only — the stored URL may embed credentials, never echo it.
    // http is allowed alongside https — the Configure field accepts both, and
    // the localhost/private-IP blocks still apply (mirrors configureHandlers).
    try {
        validateURL(url, ['https', 'http']);
    } catch (validationError) {
        context.logger.error(
            '[ProjectsList] Admin Panel URL validation failed',
            validationError as Error,
        );
        return { success: false, error: 'Invalid URL', code: ErrorCode.CONFIG_INVALID };
    }

    await vscode.env.openExternal(vscode.Uri.parse(url));
    return { success: true };
};

/**
 * Handle 'resetProject' message - Reset project to initial state
 *
 * Dispatches to the appropriate reset service based on project type:
 * - EDS projects: resetEdsProjectWithUI (template-based reset)
 * - Headless projects: resetProjectWithUI (component re-clone)
 */
export const handleResetProject: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
): Promise<HandlerResponse> => {
    const resolved = await resolveProjectFromPath(context, payload);
    if (!resolved.ok) {
        return resolved.error;
    }
    const { project } = resolved;

    const { isEdsProject } = await import('@/types/typeGuards');

    if (isEdsProject(project)) {
        const { resetEdsProjectWithUI } = await import('@/features/eds/services/reset/edsResetUI');
        return resetEdsProjectWithUI({
            project,
            context,
            logPrefix: '[ProjectsList]',
            includeBlockLibrary: true,
            verifyCdn: true,
            showLogsOnError: true,
        });
    }

    const { resetProjectWithUI } = await import(
        '@/features/lifecycle/services/projectResetService'
    );
    return resetProjectWithUI({
        commandManager: ServiceLocator.getCommandExecutor(),
        project,
        context,
        logPrefix: '[ProjectsList]',
    });
};

// ============================================================================
// Project Pinning
// ============================================================================

/**
 * Set the pinned flag on a project.
 *
 * Pinned projects render first on the projects dashboard (alphabetical
 * within the pinned and unpinned groups). The flag is persisted to the
 * project's `.demo-builder.json` manifest via `stateManager.saveProject`.
 */
export const handleSetProjectPinned: MessageHandler<{
    projectPath: string;
    pinned: boolean;
}> = async (
    context: HandlerContext,
    payload?: { projectPath: string; pinned: boolean },
): Promise<HandlerResponse> => {
    if (!payload?.projectPath || typeof payload.pinned !== 'boolean') {
        return { success: false, error: 'projectPath and pinned (boolean) are required' };
    }

    try {
        validateProjectPath(payload.projectPath);
    } catch {
        return { success: false, error: 'Invalid project path' };
    }

    try {
        const project = await context.stateManager.loadProjectFromPath(
            payload.projectPath,
            undefined,
            { persistAfterLoad: false },
        );
        if (!project) {
            return { success: false, error: 'Project not found' };
        }
        // Use saveProjectConfigOnly — saveProject would replace currentProject
        // and fire onProjectChanged, side effects we don't want from the
        // home-screen kebab.
        await context.stateManager.saveProjectConfigOnly({ ...project, pinned: payload.pinned });
        // Report the resulting state rather than a bare success.
        //
        // The webview ignores this (the kebab re-reads the list), but
        // `set_project_pinned` does not: `defaultShape` renders a bare success as
        // the literal "{}", and — measured live 2026-08-17 — that is a 2-byte
        // answer an agent has NO other way to confirm, because nothing else
        // reported pinned state at all. `list_projects` now carries it too, so the
        // pair is a write that says what it did and a read that can check it.
        return {
            success: true,
            pinned: { projectPath: payload.projectPath, pinned: payload.pinned },
            // NAME the confirming read. The tier-2 battery run (2026-08-28)
            // measured an agent burning 13 shell calls looking for this state
            // on DISK after a successful pin — it lives in extension storage,
            // where ls can never see it, and nothing said so.
            verify:
                'Confirmed. Pinned state lives in extension storage (not a file) — ' +
                're-check with list_projects, never the filesystem.',
        };
    } catch (error) {
        context.logger.error(
            'Failed to set project pinned state',
            error instanceof Error ? error : undefined,
        );
        return { success: false, error: 'Failed to set project pinned state' };
    }
};

// The per-project authoring-experience control is a setup-time preference set
// in the Configure webview (EDS-only radio group with an explicit Save), not an
// on-the-fly action. The handler that flipped it from this surface was removed,
// and menu/tile labels are STATIC ("Author Content") — the resolved experience
// only decides WHERE the Author action opens (resolved at open time).
