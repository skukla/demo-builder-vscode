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
} from '../services';
import { BaseWebviewCommand } from '@/core/base';
import { COMPONENT_IDS } from '@/core/constants';
import { ServiceLocator } from '@/core/di';
import { executeCommandForProject } from '@/core/handlers';
import { getLogger } from '@/core/logging';
import { sessionUIState } from '@/core/state/sessionUIState';
import { openInIncognito } from '@/core/utils';
import { validateProjectPath } from '@/core/validation';
import { hasMeshDeploymentRecord, determineMeshStatus } from '@/features/dashboard/handlers/meshStatusHelpers';
import { detectMeshChanges } from '@/features/mesh/services/stalenessDetector';
import { DaLiveAuthService } from '@/features/eds/services/daLiveAuthService';
import { generateFstabContent } from '@/features/eds/services/fstabGenerator';
import { showDaLiveAuthQuickPick } from '@/features/eds/handlers/edsHelpers';
import { GitHubAppNotInstalledError } from '@/features/eds/services/types';
import demoPackagesConfig from '@/features/project-creation/config/demo-packages.json';
import type { Project } from '@/types/base';
import type { MessageHandler, HandlerContext, HandlerResponse } from '@/types/handlers';
import { getMeshComponentInstance, getEdsLiveUrl, getEdsDaLiveUrl } from '@/types/typeGuards';

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
            const project = await context.stateManager.loadProjectFromPath(
                item.path,
                undefined,
                { persistAfterLoad: false },
            );
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
                        const meshChanges = await detectMeshChanges(project, project.componentConfigs);
                        const status = await determineMeshStatus(meshChanges, meshComponent, project);
                        project.meshStatusSummary =
                            status === 'config-changed' ? 'stale' : status;
                    } else {
                        project.meshStatusSummary = 'not-deployed';
                    }
                    await context.stateManager.saveProject(project);
                } catch {
                    project.meshStatusSummary = 'unknown';
                }
            }
        }

        // Include config in response (avoids race condition with init message)
        // Session override takes precedence over VS Code setting
        const config = vscode.workspace.getConfiguration('demoBuilder');
        const configViewMode = config.get<'cards' | 'rows'>('projectsViewMode', 'cards');
        const projectsViewMode = sessionUIState.viewModeOverride ?? configViewMode;

        // Find running project path (if any)
        const runningProject = projects.find(p => p.status === 'running');
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
 * Select a project by path
 *
 * Loads the project and sets it as the current project.
 */
export const handleSelectProject: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
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

        // Navigate to project dashboard
        await BaseWebviewCommand.startWebviewTransition();
        try {
            await vscode.commands.executeCommand('demoBuilder.showProjectDashboard');
        } catch (navError) {
            context.logger.error(
                'Failed to navigate to dashboard',
                navError instanceof Error ? navError : undefined,
            );
        } finally {
            BaseWebviewCommand.endWebviewTransition();
        }

        return {
            success: true,
            data: { project },
        };
    } catch (error) {
        context.logger.error('Failed to select project', error instanceof Error ? error : undefined);
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
        context.logger.error('Failed to start project creation', error instanceof Error ? error : undefined);
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
        await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:adobe.demo-builder');
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

/**
 * Reset view mode session state - for testing
 * @internal
 * @deprecated Use sessionUIState.reset() instead
 */
export function resetViewModeOverride(): void {
    sessionUIState.viewModeOverride = undefined;
}

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

    const project = await context.stateManager.loadProjectFromPath(
        payload.projectPath,
        undefined,
        { persistAfterLoad: false },
    );
    if (!project) {
        return {
            success: false,
            error: 'Project not found',
        };
    }

    return exportProjectSettings(context, project);
};

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
        if (!payload?.projectPath) {
            return {
                success: false,
                error: 'Project path is required',
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

        const project = await context.stateManager.loadProjectFromPath(
            payload.projectPath,
            undefined,
            { persistAfterLoad: false },
        );
        if (!project) {
            return {
                success: false,
                error: 'Project not found',
            };
        }

        return deleteProject(context, project);
    } catch (error) {
        context.logger.error('Failed to delete project', error instanceof Error ? error : undefined);
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
        if (!payload?.projectPath) {
            return {
                success: false,
                error: 'Project path is required',
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

        const project = await context.stateManager.loadProjectFromPath(
            payload.projectPath,
            undefined,
            { persistAfterLoad: false },
        );
        if (!project) {
            return {
                success: false,
                error: 'Project not found',
            };
        }

        // Note: Edit menu is only shown when project is not running (UI enforces this)
        // Extract settings for edit mode (include secrets for local edit)
        const settings = extractSettingsFromProject(project, true);

        context.logger.info(`Opening edit wizard for project: ${project.name}`);
        context.logger.debug(`[Edit] Project package/stack: ${project.selectedPackage}/${project.selectedStack}`);
        context.logger.debug(`[Edit] Settings package/stack: ${settings.selectedPackage}/${settings.selectedStack}`);

        // Debug: Log EDS config extraction for troubleshooting
        const edsStorefront = project.componentInstances?.['eds-storefront'];
        context.logger.debug(`[Edit] EDS storefront instance exists: ${!!edsStorefront}`);
        if (edsStorefront) {
            context.logger.debug(`[Edit] EDS storefront has metadata: ${!!edsStorefront.metadata}`);
            if (edsStorefront.metadata) {
                const metadata = edsStorefront.metadata as Record<string, unknown>;
                context.logger.debug(`[Edit] EDS metadata keys: [${Object.keys(metadata).join(', ')}]`);
                context.logger.debug(`[Edit] EDS metadata.githubRepo: ${metadata.githubRepo}`);
                context.logger.debug(`[Edit] EDS metadata.daLiveOrg: ${metadata.daLiveOrg}`);
                context.logger.debug(`[Edit] EDS metadata.daLiveSite: ${metadata.daLiveSite}`);
            }
        }
        context.logger.debug(`[Edit] Extracted edsConfig: ${settings.edsConfig ? JSON.stringify(settings.edsConfig) : 'undefined'}`);
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
                projectName: project.name,
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
    try {
        if (!payload?.projectPath || !payload?.newName) {
            return {
                success: false,
                error: 'Project path and new name are required',
            };
        }

        const newName = payload.newName.trim();
        if (!newName) {
            return {
                success: false,
                error: 'Project name cannot be empty',
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
        const project = await context.stateManager.loadProjectFromPath(
            payload.projectPath,
            undefined,
            { persistAfterLoad: true },
        );
        if (!project) {
            return {
                success: false,
                error: 'Project not found',
            };
        }

        const oldName = project.name;

        // Update the name
        project.name = newName;

        // Save the updated project
        await context.stateManager.saveProject(project);

        context.logger.info(`Renamed project: "${oldName}" → "${newName}"`);

        return {
            success: true,
            data: { success: true, newName },
        };
    } catch (error) {
        context.logger.error('Failed to rename project', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to rename project',
        };
    }
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
 * Open EDS live site in browser
 *
 * Opens in incognito/private browsing mode to ensure a clean session
 * without cached content or logged-in states that could affect the demo.
 */
export const handleOpenLiveSite: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
): Promise<HandlerResponse> => {
    if (!payload?.projectPath) {
        return { success: false, error: 'Project path is required' };
    }

    const project = await context.stateManager.loadProjectFromPath(
        payload.projectPath,
        undefined,
        { persistAfterLoad: false },
    );
    if (!project) {
        return { success: false, error: 'Project not found' };
    }

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
    if (!payload?.projectPath) {
        return { success: false, error: 'Project path is required' };
    }

    const project = await context.stateManager.loadProjectFromPath(
        payload.projectPath,
        undefined,
        { persistAfterLoad: false },
    );
    if (!project) {
        return { success: false, error: 'Project not found' };
    }

    const daLiveUrl = getEdsDaLiveUrl(project);

    if (!daLiveUrl) {
        return { success: false, error: 'DA.live URL not available' };
    }

    await vscode.env.openExternal(vscode.Uri.parse(daLiveUrl));
    return { success: true };
};

// ============================================================================
// EDS Actions Handler (Reset)
// ============================================================================

/**
 * Reset EDS project to template state
 *
 * Resets the repository contents to match the template without deleting the repo.
 * This preserves the repo URL, settings, webhooks, and GitHub App installation.
 *
 * Uses bulk Git Tree API operations for efficiency (4 API calls vs thousands).
 *
 * Steps:
 * 1. Reset repo to template using bulk tree operations
 * 2. Waits for code sync
 * 3. Copies demo content to DA.live
 * 4. Publishes all content to CDN
 */
/**
 * Republishes all content from DA.live to CDN for an EDS project.
 * This syncs config.json and all authored content to preview and live CDN.
 *
 * Useful when:
 * - Configuration changes need to propagate (e.g., config.json folder mappings)
 * - Content gets out of sync between DA.live and CDN
 * - After manual content edits in DA.live
 */
export const handleRepublishContent: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
): Promise<HandlerResponse> => {
    if (!payload?.projectPath) {
        return { success: false, error: 'Project path is required' };
    }

    try {
        validateProjectPath(payload.projectPath);
    } catch {
        return { success: false, error: 'Invalid project path' };
    }

    const project = await context.stateManager.loadProjectFromPath(
        payload.projectPath,
        undefined,
        { persistAfterLoad: false },
    );
    if (!project) {
        return { success: false, error: 'Project not found' };
    }

    // Get EDS metadata from component instance (project-specific data)
    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    const repoFullName = edsInstance?.metadata?.githubRepo as string | undefined;
    const daLiveOrg = edsInstance?.metadata?.daLiveOrg as string | undefined;
    const daLiveSite = edsInstance?.metadata?.daLiveSite as string | undefined;

    if (!repoFullName) {
        return { success: false, error: 'Repository information not found. Republish is only available for EDS projects.' };
    }

    const [repoOwner, repoName] = repoFullName.split('/');
    if (!repoOwner || !repoName) {
        return { success: false, error: 'Invalid repository format' };
    }

    // Use daLiveOrg/daLiveSite from metadata, fallback to repo owner/name
    const effectiveDaLiveOrg = daLiveOrg || repoOwner;
    const effectiveDaLiveSite = daLiveSite || repoName;

    // Pre-check DA.live authentication
    // Token must be valid to list and publish content from DA.live
    const daLiveAuthService = new DaLiveAuthService(context.context);
    const isDaLiveAuthenticated = await daLiveAuthService.isAuthenticated();

    if (!isDaLiveAuthenticated) {
        context.logger.info('[ProjectsList] republishContent: DA.live token expired or missing');

        // Show notification with Sign In action
        const signInButton = 'Sign In';
        const selection = await vscode.window.showWarningMessage(
            'Your DA.live session has expired. Please sign in to continue.',
            signInButton,
        );

        if (selection === signInButton) {
            // User clicked "Sign In" - invoke QuickPick auth flow
            const authResult = await showDaLiveAuthQuickPick(context);
            if (authResult.cancelled || !authResult.success) {
                return {
                    success: false,
                    error: authResult.error || 'DA.live authentication required',
                    errorType: 'DALIVE_AUTH_REQUIRED',
                    cancelled: authResult.cancelled,
                };
            }
            // Token is now valid - continue with republish
        } else {
            // User dismissed notification - abort operation
            return {
                success: false,
                error: 'DA.live authentication required',
                errorType: 'DALIVE_AUTH_REQUIRED',
            };
        }
    }

    // Set project status to 'republishing' so UI shows transitional state
    const originalStatus = project.status;
    project.status = 'republishing';
    await context.stateManager.saveProject(project);

    try {
        return await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Republishing ${project.name}`,
            cancellable: false,
        },
        async (progress) => {
            try {
                context.logger.info(`[ProjectsList] Republishing content for ${repoFullName}`);

                // Initialize services
                const { HelixService } = await import('@/features/eds/services/helixService');
                const { getGitHubServices } = await import('@/features/eds/handlers/edsHelpers');

                const { tokenService: githubTokenService } = getGitHubServices(context);
                const authService = ServiceLocator.getAuthenticationService();

                // Create TokenProvider adapter for DA.live operations
                // Required to list and publish content from DA.live
                const daLiveTokenProvider = {
                    getAccessToken: async () => {
                        return await daLiveAuthService.getAccessToken();
                    },
                };

                // Create HelixService with GitHub token for Admin API and DA.live token for content operations
                const helixService = new HelixService(context.logger, githubTokenService, daLiveTokenProvider);

                // Step 1: Sync all code files (includes config.json, patches, scripts)
                progress.report({ message: 'Step 1/2: Syncing code to CDN...' });
                await helixService.previewCode(repoOwner, repoName, '/*');
                context.logger.debug('[ProjectsList] Code synced to CDN');

                // Step 2: Publish all content
                progress.report({ message: 'Step 2/2: Publishing content to CDN...' });
                await helixService.publishAllSiteContent(
                    repoFullName,
                    'main',
                    effectiveDaLiveOrg,
                    effectiveDaLiveSite,
                    (info) => {
                        progress.report({ message: `Step 2/2: ${info.message}` });
                    },
                );

                context.logger.info(`[ProjectsList] Content republished for ${repoFullName}`);

                // Show auto-dismissing success notification (2 seconds)
                void vscode.window.withProgress(
                    { location: vscode.ProgressLocation.Notification, title: `Content republished for "${project.name}"` },
                    async () => new Promise(resolve => setTimeout(resolve, 2000)),
                );

                return { success: true };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                context.logger.error('[ProjectsList] Republish failed', error as Error);
                vscode.window.showErrorMessage(`Failed to republish content: ${errorMessage}`);
                return { success: false, error: errorMessage };
            }
        },
        );
    } finally {
        // Reset status back to original (typically 'ready' for EDS projects, shown as "Published")
        project.status = originalStatus;
        await context.stateManager.saveProject(project);
    }
};

export const handleResetEds: MessageHandler<{ projectPath: string }> = async (
    context: HandlerContext,
    payload?: { projectPath: string },
): Promise<HandlerResponse> => {
    if (!payload?.projectPath) {
        return { success: false, error: 'Project path is required' };
    }

    try {
        validateProjectPath(payload.projectPath);
    } catch {
        return { success: false, error: 'Invalid project path' };
    }

    const project = await context.stateManager.loadProjectFromPath(
        payload.projectPath,
        undefined,
        { persistAfterLoad: false },
    );
    if (!project) {
        return { success: false, error: 'Project not found' };
    }

    // Get EDS metadata from component instance (project-specific data)
    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    const repoFullName = edsInstance?.metadata?.githubRepo as string | undefined;
    const daLiveOrg = edsInstance?.metadata?.daLiveOrg as string | undefined;
    const daLiveSite = edsInstance?.metadata?.daLiveSite as string | undefined;

    // Derive template config from brand+stack (source of truth)
    const pkg = demoPackagesConfig.packages.find((p: { id: string }) => p.id === project.selectedPackage);
    const storefronts = pkg?.storefronts as Record<string, {
        templateOwner?: string;
        templateRepo?: string;
        contentSource?: { org: string; site: string; indexPath?: string };
        patches?: string[];
        contentPatches?: string[];
    }> | undefined;
    const storefront = project.selectedStack ? storefronts?.[project.selectedStack] : undefined;
    const templateOwner = storefront?.templateOwner;
    const templateRepo = storefront?.templateRepo;
    const contentSourceConfig = storefront?.contentSource;
    const patches = storefront?.patches;
    const contentPatches = storefront?.contentPatches;

    if (!repoFullName) {
        const errorMsg = 'EDS metadata missing - no GitHub repository configured';
        context.logger.error(`[ProjectsList] resetEds: ${errorMsg}`);
        vscode.window.showErrorMessage(`Cannot reset: ${errorMsg}`);
        return { success: false, error: errorMsg };
    }

    const [repoOwner, repoName] = repoFullName.split('/');
    if (!repoOwner || !repoName) {
        const errorMsg = 'Invalid repository format';
        context.logger.error(`[ProjectsList] resetEds: ${errorMsg}`);
        return { success: false, error: errorMsg };
    }

    if (!daLiveOrg || !daLiveSite) {
        const errorMsg = 'DA.live configuration missing';
        context.logger.error(`[ProjectsList] resetEds: ${errorMsg}`);
        vscode.window.showErrorMessage(`Cannot reset: ${errorMsg}`);
        return { success: false, error: errorMsg };
    }

    if (!templateOwner || !templateRepo) {
        const errorMsg = 'Template configuration missing. Cannot reset without knowing the template repository.';
        context.logger.error(`[ProjectsList] resetEds: ${errorMsg}`);
        vscode.window.showErrorMessage(`Cannot reset: ${errorMsg}`);
        return { success: false, error: errorMsg };
    }

    if (!contentSourceConfig) {
        const errorMsg = 'Content source configuration missing. Cannot reset without knowing where demo content comes from.';
        context.logger.error(`[ProjectsList] resetEds: ${errorMsg}`);
        vscode.window.showErrorMessage(`Cannot reset: ${errorMsg}`);
        return { success: false, error: errorMsg };
    }

    // Pre-check DA.live authentication
    // Token must be valid to copy demo content during reset
    const daLiveAuthService = new DaLiveAuthService(context.context);
    const isDaLiveAuthenticated = await daLiveAuthService.isAuthenticated();

    if (!isDaLiveAuthenticated) {
        context.logger.info('[ProjectsList] resetEds: DA.live token expired or missing');

        // Show notification with Sign In action (follows GitHubAppNotInstalledError pattern)
        const signInButton = 'Sign In';
        const selection = await vscode.window.showWarningMessage(
            'Your DA.live session has expired. Please sign in to continue.',
            signInButton,
        );

        if (selection === signInButton) {
            // User clicked "Sign In" - invoke QuickPick auth flow
            const authResult = await showDaLiveAuthQuickPick(context);
            if (authResult.cancelled || !authResult.success) {
                return {
                    success: false,
                    error: authResult.error || 'DA.live authentication required',
                    errorType: 'DALIVE_AUTH_REQUIRED',
                    cancelled: authResult.cancelled,
                };
            }
            // Token is now valid - continue to confirmation dialog below
        } else {
            // User dismissed notification - abort operation
            return {
                success: false,
                error: 'DA.live authentication required',
                errorType: 'DALIVE_AUTH_REQUIRED',
            };
        }
    }

    // Show confirmation dialog
    const confirmButton = 'Reset Project';
    const confirmation = await vscode.window.showWarningMessage(
        `Are you sure you want to reset "${project.name}"? This will reset all code to the template state and re-copy demo content.`,
        { modal: true },
        confirmButton,
    );

    if (confirmation !== confirmButton) {
        context.logger.info('[ProjectsList] resetEds: User cancelled reset');
        return { success: false, cancelled: true };
    }

    // Check if AEM Code Sync app is installed
    // This is required for Helix to sync code changes from GitHub
    const { getGitHubServices } = await import('@/features/eds/handlers/edsHelpers');
    const { tokenService: preCheckTokenService } = getGitHubServices(context);
    const { GitHubAppService } = await import('@/features/eds/services/githubAppService');
    const appService = new GitHubAppService(preCheckTokenService, context.logger);
    const appCheck = await appService.isAppInstalled(repoOwner, repoName);

    if (!appCheck.isInstalled) {
        context.logger.warn(`[ProjectsList] AEM Code Sync app not installed on ${repoFullName}`);

        const installButton = 'Install App';
        const continueButton = 'Continue Anyway';
        const appWarning = await vscode.window.showWarningMessage(
            'The AEM Code Sync GitHub App is not installed on this repository. ' +
            'Without it, code changes will not sync to the CDN and the site may not work correctly.',
            installButton,
            continueButton,
        );

        if (appWarning === installButton) {
            // Open the GitHub app installation page
            const installUrl = appService.getInstallUrl(repoOwner, repoName);
            await vscode.env.openExternal(vscode.Uri.parse(installUrl));

            // Wait for user to install and continue
            const afterInstall = await vscode.window.showInformationMessage(
                'After installing the app, click Continue to proceed with the reset.',
                'Continue',
                'Cancel',
            );

            if (afterInstall !== 'Continue') {
                context.logger.info('[ProjectsList] resetEds: User cancelled after app installation prompt');
                return { success: false, cancelled: true };
            }
        } else if (appWarning !== continueButton) {
            // User dismissed the dialog
            context.logger.info('[ProjectsList] resetEds: User cancelled at app check');
            return { success: false, cancelled: true };
        }
    }

    // Set project status to 'resetting' so UI shows transitional state
    const originalStatus = project.status;
    project.status = 'resetting';
    await context.stateManager.saveProject(project);

    // Show progress notification
    try {
        return await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Resetting EDS Project',
                cancellable: false,
            },
            async (progress) => {
                try {
                    context.logger.info(`[ProjectsList] Resetting EDS project: ${repoFullName}`);

                // Create service dependencies
                // Note: ServiceLocator is statically imported at top of file
                const { HelixService } = await import('@/features/eds/services/helixService');
                const { DaLiveContentOperations } = await import('@/features/eds/services/daLiveContentOperations');
                const { getGitHubServices } = await import('@/features/eds/handlers/edsHelpers');

                const { tokenService: githubTokenService, fileOperations: githubFileOps } = getGitHubServices(context);
                const authService = ServiceLocator.getAuthenticationService();

                // Create TokenProvider adapter for DA.live operations
                // IMPORTANT: Use DA.live token (not Adobe IMS token) for content operations
                const tokenProvider = {
                    getAccessToken: async () => {
                        return await daLiveAuthService.getAccessToken();
                    },
                };

                const daLiveContentOps = new DaLiveContentOperations(tokenProvider, context.logger);

                // Determine total steps (5 base + 1 if mesh needs redeployment)
                const meshComponent = getMeshComponentInstance(project);
                const hasMesh = !!meshComponent?.path;
                const totalSteps = hasMesh ? 6 : 5;

                // ============================================
                // Step 1: Reset repo to template (bulk operation)
                // ============================================
                // Uses Git Tree API for efficiency: 4 API calls instead of 2*N for N files
                progress.report({ message: `Step 1/${totalSteps}: Resetting code repository...` });
                context.logger.info(`[ProjectsList] Resetting repo using bulk tree operations`);

                // Build fstab.yaml content using centralized generator (single source of truth)
                const fstabContent = generateFstabContent({
                    daLiveOrg,
                    daLiveSite,
                });

                // Create file overrides map (files with custom content)
                const fileOverrides = new Map<string, string>();
                fileOverrides.set('fstab.yaml', fstabContent);

                // Apply template patches from centralized registry
                // Patches to apply are specified in the project's EDS metadata (from demo-packages.json)
                const { applyTemplatePatches } = await import('@/features/eds/services/templatePatchRegistry');
                const patchResults = await applyTemplatePatches(
                    templateOwner,
                    templateRepo,
                    patches || [],
                    fileOverrides,
                    context.logger,
                );

                // Log patch results
                for (const result of patchResults) {
                    if (!result.applied) {
                        context.logger.warn(`[ProjectsList] Patch '${result.patchId}' not applied: ${result.reason}`);
                    }
                }

                // Generate demo-config.json with Commerce configuration
                // This ensures the storefront has proper Commerce backend settings after reset
                const { generateConfigJson, extractConfigParams } = await import('@/features/eds/services/configGenerator');
                const configParams = {
                    githubOwner: repoOwner,
                    repoName,
                    daLiveOrg,
                    daLiveSite,
                    ...extractConfigParams(project),
                };

                const configResult = generateConfigJson(
                    configParams as import('@/features/eds/services/configGenerator').ConfigGeneratorParams,
                    context.logger,
                );

                if (configResult.success && configResult.content) {
                    // Generate both config.json (used by storefront) and demo-config.json (template default)
                    fileOverrides.set('config.json', configResult.content);
                    fileOverrides.set('demo-config.json', configResult.content);
                    context.logger.info('[ProjectsList] Generated config.json for reset');
                } else {
                    context.logger.warn(`[ProjectsList] Failed to generate demo-config.json: ${configResult.error}`);
                    // Continue without demo-config.json - site will show configuration error but can be manually fixed
                }

                // Copy placeholder JSON files from source to GitHub as code files
                // DA.live's source API doesn't support programmatic spreadsheet creation,
                // so we commit placeholders as JSON code files that Helix serves directly.
                // Authors can later create DA.live spreadsheets to override (Content > Code).
                const placeholderPaths = [
                    'placeholders/global',
                    'placeholders/auth',
                    'placeholders/cart',
                    'placeholders/recommendations',
                    'placeholders/wishlist',
                ];

                for (const placeholderPath of placeholderPaths) {
                    try {
                        const sourceUrl = `https://main--${templateRepo}--${templateOwner}.aem.live/${placeholderPath}.json`;
                        const response = await fetch(sourceUrl, {
                            signal: AbortSignal.timeout(10000),
                        });

                        if (response.ok) {
                            const jsonContent = await response.text();
                            fileOverrides.set(`${placeholderPath}.json`, jsonContent);
                            context.logger.info(`[ProjectsList] Added ${placeholderPath}.json to code files`);
                        }
                    } catch {
                        context.logger.warn(`[ProjectsList] Failed to fetch ${placeholderPath}.json from source`);
                    }
                }

                // Perform bulk reset
                const resetResult = await githubFileOps.resetRepoToTemplate(
                    templateOwner,
                    templateRepo,
                    repoOwner,
                    repoName,
                    fileOverrides,
                    'main',
                );

                context.logger.info(`[ProjectsList] Repository reset complete: ${resetResult.fileCount} files, commit ${resetResult.commitSha.substring(0, 7)}`);
                progress.report({ message: `Step 1/${totalSteps}: Reset ${resetResult.fileCount} files` });

                // ============================================
                // Step 2: Sync code to CDN
                // ============================================
                // Actively trigger code sync via Helix Admin API (POST /code/*)
                // This is more reliable than passive polling - the POST completes when sync is done
                progress.report({ message: `Step 2/${totalSteps}: Syncing code to CDN...` });

                // Create HelixService for code sync (need GitHub token for Admin API)
                const helixServiceForCodeSync = new HelixService(context.logger, githubTokenService, tokenProvider);

                try {
                    await helixServiceForCodeSync.previewCode(repoOwner, repoName, '/*');
                    context.logger.info('[ProjectsList] Code synced to CDN');
                    progress.report({ message: `Step 2/${totalSteps}: Code synchronized` });
                } catch (codeSyncError) {
                    // Log warning but continue - the GitHub App may also trigger sync
                    context.logger.warn(`[ProjectsList] Code sync request failed: ${(codeSyncError as Error).message}, continuing anyway`);
                    progress.report({ message: `Step 2/${totalSteps}: Code sync pending...` });
                }

                // Build full content source with index URL from explicit config
                const indexPath = contentSourceConfig.indexPath || '/full-index.json';
                const contentSource = {
                    org: contentSourceConfig.org,
                    site: contentSourceConfig.site,
                    indexUrl: `https://main--${contentSourceConfig.site}--${contentSourceConfig.org}.aem.live${indexPath}`,
                };

                // ============================================
                // Step 3: Copy demo content to DA.live
                // ============================================
                // Content HTML is uploaded with absolute image URLs pointing to source CDN.
                // The Admin API will download images during preview and store in Media Bus.
                progress.report({ message: `Step 3/${totalSteps}: Copying demo content...` });

                context.logger.info(`[ProjectsList] Copying content from ${contentSourceConfig.org}/${contentSourceConfig.site} to ${daLiveOrg}/${daLiveSite}`);

                // Progress callback to show per-file progress (with support for init messages)
                const onContentProgress = (info: { processed: number; total: number; currentFile?: string; message?: string }) => {
                    // Use custom message if provided (during initialization), otherwise show file count
                    const statusMessage = info.message || `Copying content (${info.processed}/${info.total})`;
                    progress.report({ message: `Step 3/${totalSteps}: ${statusMessage}` });
                };

                const contentResult = await daLiveContentOps.copyContentFromSource(
                    contentSource,
                    daLiveOrg,
                    daLiveSite,
                    onContentProgress,
                    contentPatches,
                );

                if (!contentResult.success) {
                    throw new Error(`Content copy failed: ${contentResult.failedFiles.length} files failed`);
                }

                progress.report({ message: `Step 3/${totalSteps}: Copied ${contentResult.totalFiles} content files` });
                context.logger.info(`[ProjectsList] DA.live content populated: ${contentResult.totalFiles} files`);

                // Configure Block Library (part of content step)
                progress.report({ message: `Step 3/${totalSteps}: Configuring block library...` });
                const libResult = await daLiveContentOps.createBlockLibraryFromTemplate(
                    daLiveOrg,
                    daLiveSite,
                    templateOwner,
                    templateRepo,
                    (owner, repo, path) => githubFileOps.getFileContent(owner, repo, path),
                );
                if (libResult.blocksCount > 0) {
                    progress.report({ message: `Step 3/${totalSteps}: Configured ${libResult.blocksCount} blocks` });
                    context.logger.info(`[ProjectsList] Block library: ${libResult.blocksCount} blocks configured`);
                }

                // ============================================
                // Step 4: Publish all content to CDN
                // ============================================
                progress.report({ message: `Step 4/${totalSteps}: Publishing to CDN...` });
                context.logger.info(`[ProjectsList] Publishing content to CDN for ${repoOwner}/${repoName}`);

                // IMPORTANT: Pass DA.live token provider to HelixService for x-content-source-authorization
                // DA.live uses separate IMS auth from Adobe Console - must use DA.live token
                const helixService = new HelixService(context.logger, githubTokenService, tokenProvider);

                // Progress callback to update notification with publish details
                const onPublishProgress = (info: {
                    phase: string;
                    message: string;
                    current?: number;
                    total?: number;
                    currentPath?: string;
                }) => {
                    if (info.current !== undefined && info.total !== undefined) {
                        progress.report({ message: `Step 4/${totalSteps}: Publishing (${info.current}/${info.total} pages)` });
                    } else {
                        progress.report({ message: `Step 4/${totalSteps}: ${info.message}` });
                    }
                };

                await helixService.publishAllSiteContent(`${repoOwner}/${repoName}`, 'main', undefined, undefined, onPublishProgress);

                // Explicitly publish block library paths (may be missed by publishAllSiteContent due to .da folder)
                if (libResult.paths.length > 0) {
                    progress.report({ message: `Step 4/${totalSteps}: Publishing block library...` });
                    context.logger.debug(`[ProjectsList] Publishing ${libResult.paths.length} block library paths`);
                    for (const libPath of libResult.paths) {
                        try {
                            await helixService.previewAndPublishPage(repoOwner, repoName, libPath, 'main');
                        } catch (libPublishError) {
                            context.logger.debug(`[ProjectsList] Failed to publish ${libPath}: ${(libPublishError as Error).message}`);
                        }
                    }
                }

                context.logger.info('[ProjectsList] Content published to CDN successfully');

                // ============================================
                // Step 5: Verify config.json on CDN
                // ============================================
                progress.report({ message: `Step 5/${totalSteps}: Verifying configuration...` });
                const { verifyConfigOnCdn } = await import('@/features/eds/services/configSyncService');
                const configVerified = await verifyConfigOnCdn(repoOwner, repoName, context.logger);
                if (configVerified) {
                    progress.report({ message: `Step 5/${totalSteps}: Configuration verified` });
                    context.logger.info('[ProjectsList] config.json verified on CDN');
                } else {
                    progress.report({ message: `Step 5/${totalSteps}: Configuration propagating...` });
                    context.logger.warn('[ProjectsList] config.json CDN verification timed out - may need more time to propagate');
                }

                // ============================================
                // Step 6: Redeploy API Mesh (if project has mesh component)
                // ============================================
                // Redeploy mesh to refresh GraphQL schema. The existing .env file
                // in the local mesh directory is reused (not regenerated).

                if (hasMesh) {
                    // Pre-check Adobe I/O authentication before mesh deployment
                    // Mesh deployment requires valid Adobe I/O credentials
                    const isAdobeAuthenticated = await authService.isAuthenticated();

                    if (!isAdobeAuthenticated) {
                        context.logger.info('[ProjectsList] resetEds: Adobe I/O token expired or missing');

                        // Show notification with Sign In action
                        const signInButton = 'Sign In';
                        const selection = await vscode.window.showWarningMessage(
                            'Your Adobe I/O session has expired. Please sign in to continue.',
                            signInButton,
                        );

                        if (selection === signInButton) {
                            progress.report({ message: `Step 6/${totalSteps}: Opening browser for authentication...` });
                            const loginSuccess = await authService.login();

                            if (!loginSuccess) {
                                context.logger.error('[ProjectsList] Adobe I/O login failed or cancelled');
                                vscode.window.showErrorMessage('Reset failed: Adobe I/O authentication is required for mesh deployment.');
                                return { success: false, error: 'Adobe I/O authentication required' };
                            }
                        } else {
                            // User dismissed notification
                            context.logger.info('[ProjectsList] User cancelled Adobe I/O authentication');
                            return { success: false, error: 'Adobe I/O authentication required', cancelled: true };
                        }
                    }

                    // Set Adobe CLI context before mesh deployment
                    progress.report({ message: `Step 6/${totalSteps}: Setting Adobe context...` });

                    if (project.adobe?.organization) {
                        await authService.selectOrganization(project.adobe.organization);
                    }
                    if (project.adobe?.projectId && project.adobe?.organization) {
                        await authService.selectProject(project.adobe.projectId, project.adobe.organization);
                    }
                    if (project.adobe?.workspace && project.adobe?.projectId) {
                        await authService.selectWorkspace(project.adobe.workspace, project.adobe.projectId);
                    }

                    progress.report({ message: `Step 6/${totalSteps}: Redeploying API Mesh...` });
                    context.logger.info(`[ProjectsList] Redeploying mesh for ${repoFullName}`);

                    try {
                        const { deployMeshComponent } = await import('@/features/mesh/services/meshDeployment');
                        const existingMeshId = (meshComponent.metadata?.meshId as string) || '';
                        const commandManager = ServiceLocator.getCommandExecutor();

                        const meshDeployResult = await deployMeshComponent(
                            meshComponent.path!, // hasMesh guarantees path exists
                            commandManager,
                            context.logger,
                            (msg, sub) => progress.report({ message: `Step 6/${totalSteps}: ${sub || msg}` }),
                            existingMeshId,
                        );

                        if (meshDeployResult.success && meshDeployResult.data?.endpoint) {
                            const { updateMeshState } = await import('@/features/mesh/services/stalenessDetector');
                            await updateMeshState(project, meshDeployResult.data.endpoint);
                            await context.stateManager.saveProject(project);
                            context.logger.info(`[ProjectsList] Mesh redeployed: ${meshDeployResult.data.endpoint}`);
                        } else {
                            throw new Error(meshDeployResult.error || 'Mesh deployment failed');
                        }
                    } catch (meshError) {
                        context.logger.error('[ProjectsList] Mesh redeployment error', meshError as Error);
                        vscode.window.showWarningMessage(
                            `Reset completed but mesh redeployment failed: ${(meshError as Error).message}. ` +
                            `Commerce features may not work until mesh is manually redeployed.`
                        );
                    }
                }

                context.logger.info('[ProjectsList] EDS project reset successfully');

                // Show auto-dismissing success notification (2 seconds)
                void vscode.window.withProgress(
                    { location: vscode.ProgressLocation.Notification, title: `"${project.name}" reset successfully` },
                    async () => new Promise(resolve => setTimeout(resolve, 2000)),
                );

                return { success: true };
            } catch (error) {
                // Handle GitHub App not installed error specifically
                if (error instanceof GitHubAppNotInstalledError) {
                    context.logger.info(`[ProjectsList] GitHub App not installed: ${error.message}`);

                    // Show error message with button to install GitHub App
                    const installButton = 'Install GitHub App';
                    const selection = await vscode.window.showErrorMessage(
                        `Cannot reset EDS project: The AEM Code Sync GitHub App is not installed on ${error.owner}/${error.repo}. ` +
                        `Please install the app and try again.`,
                        installButton,
                    );

                    if (selection === installButton) {
                        await vscode.env.openExternal(vscode.Uri.parse(error.installUrl));
                    }

                    return {
                        success: false,
                        error: error.message,
                        errorType: 'GITHUB_APP_NOT_INSTALLED',
                        errorDetails: {
                            owner: error.owner,
                            repo: error.repo,
                            installUrl: error.installUrl,
                        },
                    };
                }

                const errorMessage = (error as Error).message;
                context.logger.error('[ProjectsList] resetEds failed', error as Error);
                vscode.window.showErrorMessage(
                    `Failed to reset EDS project: ${errorMessage}`,
                    'Show Logs',
                ).then(selection => {
                    if (selection === 'Show Logs') {
                        getLogger().show(false);
                    }
                });
                return { success: false, error: errorMessage };
            }
        },
    );
    } finally {
        // Reset status back to original (typically 'ready' for EDS projects, shown as "Published")
        project.status = originalStatus;
        await context.stateManager.saveProject(project);
    }
};
