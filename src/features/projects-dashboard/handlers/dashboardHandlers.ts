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

import * as fsPromises from 'fs/promises';
import * as path from 'path';
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
import { openInIncognito, TIMEOUTS } from '@/core/utils';
import { validateProjectPath, validateProjectNameSecurity } from '@/core/validation';
import { hasMeshDeploymentRecord, determineMeshStatus } from '@/features/dashboard/handlers/meshStatusHelpers';
import { detectMeshChanges } from '@/features/mesh/services/stalenessDetector';
import { DaLiveAuthService } from '@/features/eds/services/daLiveAuthService';
import { showDaLiveAuthQuickPick, configureDaLivePermissions } from '@/features/eds/handlers/edsHelpers';
import { republishStorefrontConfig, needsStorefrontRepublish } from '@/features/eds';
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

        const result = await deleteProject(context, project);

        // Notify UI to refresh (handles timeout scenarios)
        // Cast data to expected shape - deleteProject returns { success: boolean }
        const resultData = result.data as { success?: boolean } | undefined;
        if (result.success && resultData?.success) {
            context.sendMessage?.('projectDeleted', {});
        }

        return result;
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

        // Check if demo is running - cannot rename while running
        if (project.status === 'running') {
            return {
                success: false,
                error: 'Cannot rename project while demo is running. Stop the demo first.',
            };
        }

        // Validate new name (same rules as project creation)
        try {
            validateProjectNameSecurity(newName);
        } catch (validationError) {
            return {
                success: false,
                error: validationError instanceof Error ? validationError.message : 'Invalid project name',
            };
        }

        const oldName = project.name;
        const oldPath = project.path;

        // Use name directly as folder (consistent with project creation)
        const projectsRoot = path.dirname(oldPath);
        const newPath = path.join(projectsRoot, newName);

        // Rename folder if path changes
        if (newPath !== oldPath) {
            // Check if new folder already exists
            try {
                await fsPromises.access(newPath);
                return {
                    success: false,
                    error: `A project folder named "${newName}" already exists`,
                };
            } catch {
                // Folder doesn't exist, which is what we want
            }

            // Rename the folder on disk
            await fsPromises.rename(oldPath, newPath);

            // Update project.path and componentInstances paths
            project.path = newPath;
            if (project.componentInstances) {
                for (const componentId of Object.keys(project.componentInstances)) {
                    const component = project.componentInstances[componentId];
                    if (component.path?.startsWith(oldPath)) {
                        component.path = component.path.replace(oldPath, newPath);
                    }
                }
            }

            // Update recent projects list
            await context.stateManager.removeFromRecentProjects(oldPath);
        }

        // Update the name
        project.name = newName;

        // Save the updated project (at the new location)
        await context.stateManager.saveProject(project);

        context.logger.info(`Renamed project: "${oldName}" → "${newName}"`);

        return {
            success: true,
            data: { success: true, newName, newPath },
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
        vscode.window.showErrorMessage('Project path is required');
        return { success: false, error: 'Project path is required' };
    }

    try {
        validateProjectPath(payload.projectPath);
    } catch {
        vscode.window.showErrorMessage('Invalid project path');
        return { success: false, error: 'Invalid project path' };
    }

    const project = await context.stateManager.loadProjectFromPath(
        payload.projectPath,
        undefined,
        { persistAfterLoad: false },
    );
    if (!project) {
        vscode.window.showErrorMessage('Project not found');
        return { success: false, error: 'Project not found' };
    }

    // Get EDS metadata from component instance (project-specific data)
    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    const repoFullName = edsInstance?.metadata?.githubRepo as string | undefined;
    const daLiveOrg = edsInstance?.metadata?.daLiveOrg as string | undefined;
    const daLiveSite = edsInstance?.metadata?.daLiveSite as string | undefined;

    if (!repoFullName) {
        vscode.window.showErrorMessage('Repository information not found. Republish is only available for EDS projects.');
        return { success: false, error: 'Repository information not found. Republish is only available for EDS projects.' };
    }

    const [repoOwner, repoName] = repoFullName.split('/');
    if (!repoOwner || !repoName) {
        vscode.window.showErrorMessage('Invalid repository format');
        return { success: false, error: 'Invalid repository format' };
    }

    // Use daLiveOrg/daLiveSite from metadata, fallback to repo owner/name
    const effectiveDaLiveOrg = daLiveOrg || repoOwner;
    const effectiveDaLiveSite = daLiveSite || repoName;

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

                // Check DA.live authentication (inside progress for immediate feedback)
                progress.report({ message: 'Checking authentication...' });
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

                // Initialize services
                const { HelixService } = await import('@/features/eds/services/helixService');
                const { getGitHubServices } = await import('@/features/eds/handlers/edsHelpers');

                const { tokenService: githubTokenService } = getGitHubServices(context);

                // Create TokenProvider adapter for DA.live operations
                // Required to list and publish content from DA.live
                const daLiveTokenProvider = {
                    getAccessToken: async () => {
                        return await daLiveAuthService.getAccessToken();
                    },
                };

                // Create HelixService with GitHub token for Admin API and DA.live token for content operations
                const helixService = new HelixService(context.logger, githubTokenService, daLiveTokenProvider);

                // Step 1: Apply EDS org config (AEM Assets, Universal Editor)
                progress.report({ message: 'Step 1/5: Applying EDS configuration...' });
                const { DaLiveContentOperations } = await import('@/features/eds/services/daLiveContentOperations');
                const { applyDaLiveOrgConfigSettings } = await import('@/features/eds/handlers/edsHelpers');
                const daLiveContentOps = new DaLiveContentOperations(daLiveTokenProvider, context.logger);
                await applyDaLiveOrgConfigSettings(daLiveContentOps, effectiveDaLiveOrg, effectiveDaLiveSite, context.logger);

                // Step 2: Regenerate and sync config.json (picks up env var changes)
                progress.report({ message: 'Step 2/5: Regenerating storefront configuration...' });
                const configResult = await republishStorefrontConfig({
                    project,
                    secrets: context.context.secrets,
                    logger: context.logger,
                    onProgress: (message) => progress.report({ message: `Step 2/5: ${message}` }),
                });
                if (!configResult.success) {
                    context.logger.warn(`[ProjectsList] Config regeneration warning: ${configResult.error}`);
                    // Continue with republish even if config regeneration has issues
                } else {
                    context.logger.debug('[ProjectsList] Config.json regenerated and synced');
                }

                // Step 3: Sync all code files to CDN
                progress.report({ message: 'Step 3/5: Syncing code to CDN...' });
                await helixService.previewCode(repoOwner, repoName, '/*');
                context.logger.debug('[ProjectsList] Code synced to CDN');

                // Configure permissions via DA.live Config API (part of Step 3)
                progress.report({ message: 'Step 3/5: Configuring site permissions...' });
                const userEmail = await daLiveAuthService.getUserEmail();
                if (userEmail) {
                    await configureDaLivePermissions(daLiveTokenProvider, effectiveDaLiveOrg, effectiveDaLiveSite, userEmail, context.logger);
                } else {
                    context.logger.warn('[ProjectsList] No user email available for permissions');
                }

                // Step 4: Publish all content (with cache purge for republish scenarios)
                progress.report({ message: 'Step 4/5: Purging stale cache...' });
                await helixService.purgeCacheAll(repoOwner, repoName, 'main');

                progress.report({ message: 'Step 4/5: Publishing content to CDN...' });
                await helixService.publishAllSiteContent(
                    repoFullName,
                    'main',
                    effectiveDaLiveOrg,
                    effectiveDaLiveSite,
                    (info) => {
                        progress.report({ message: `Step 4/5: ${info.message}` });
                    },
                );

                // Step 5: Verify CDN accessibility
                progress.report({ message: 'Step 5/5: Verifying CDN...' });
                const { verifyConfigOnCdn } = await import('@/features/eds/services/configSyncService');
                const cdnVerified = await verifyConfigOnCdn(repoOwner, repoName, context.logger);
                if (!cdnVerified) {
                    context.logger.warn('[ProjectsList] CDN verification timed out - content may still be propagating');
                }

                context.logger.info(`[ProjectsList] Content republished for ${repoFullName}`);

                // Update storefront status to published (config.json was regenerated)
                project.edsStorefrontStatusSummary = 'published';

                // Show auto-dismissing success notification (2 seconds)
                void vscode.window.withProgress(
                    { location: vscode.ProgressLocation.Notification, title: `Content republished for "${project.name}"` },
                    async () => new Promise(resolve => setTimeout(resolve, TIMEOUTS.UI.NOTIFICATION)),
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

/**
 * Handle 'resetEds' message - Reset EDS project to template state
 *
 * Delegates to the consolidated resetEdsProjectWithUI function in edsResetService.
 * This eliminates code duplication between dashboard and projects-dashboard handlers.
 */
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

    const { resetEdsProjectWithUI } = await import('@/features/eds/services/edsResetService');
    return resetEdsProjectWithUI({
        project,
        context,
        logPrefix: '[ProjectsList]',
        // Projects dashboard enables all features
        includeBlockLibrary: true,
        verifyCdn: true,
        // redeployMesh auto-detects based on project
        showLogsOnError: true,
    });
};
