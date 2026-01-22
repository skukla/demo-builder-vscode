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
import { executeCommandForProject } from '@/core/handlers';
import { sessionUIState } from '@/core/state/sessionUIState';
import { validateProjectPath } from '@/core/validation';
import { DaLiveAuthService } from '@/features/eds/services/daLiveAuthService';
import { showDaLiveAuthQuickPick } from '@/features/eds/handlers/edsHelpers';
import { GitHubAppNotInstalledError } from '@/features/eds/services/types';
import type { Project } from '@/types/base';
import type { MessageHandler, HandlerContext, HandlerResponse } from '@/types/handlers';

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
 * Open documentation URL
 */
export const handleOpenDocs: MessageHandler = async (
    context: HandlerContext,
): Promise<HandlerResponse> => {
    try {
        const docsUrl = 'https://github.com/anthropics/demo-builder-vscode#readme';
        await vscode.env.openExternal(vscode.Uri.parse(docsUrl));
        return { success: true };
    } catch (error) {
        context.logger.error('Failed to open documentation', error instanceof Error ? error : undefined);
        return {
            success: false,
            error: 'Failed to open documentation',
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

    const { getEdsLiveUrl } = await import('@/types/typeGuards');
    const liveUrl = getEdsLiveUrl(project);

    if (!liveUrl) {
        return { success: false, error: 'EDS live URL not available' };
    }

    await vscode.env.openExternal(vscode.Uri.parse(liveUrl));
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

    const { getEdsDaLiveUrl } = await import('@/types/typeGuards');
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

    // Get EDS metadata from component instance
    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    const repoFullName = edsInstance?.metadata?.githubRepo as string | undefined;
    const daLiveOrg = edsInstance?.metadata?.daLiveOrg as string | undefined;
    const daLiveSite = edsInstance?.metadata?.daLiveSite as string | undefined;
    const templateOwner = edsInstance?.metadata?.templateOwner as string | undefined;
    const templateRepo = edsInstance?.metadata?.templateRepo as string | undefined;
    const contentSourceConfig = edsInstance?.metadata?.contentSource as { org: string; site: string; indexPath?: string } | undefined;
    const patches = edsInstance?.metadata?.patches as string[] | undefined;

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

    // Show progress notification
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Resetting EDS Project',
            cancellable: false,
        },
        async (progress) => {
            try {
                context.logger.info(`[ProjectsList] Resetting EDS project: ${repoFullName}`);

                // Create service dependencies
                const { ServiceLocator } = await import('@/core/di/serviceLocator');
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

                // ============================================
                // Step 1: Reset repo to template (bulk operation)
                // ============================================
                // Uses Git Tree API for efficiency: 4 API calls instead of 2*N for N files
                progress.report({ message: 'Step 1/5: Resetting repository to template...' });
                context.logger.info(`[ProjectsList] Resetting repo using bulk tree operations`);

                // Build fstab.yaml content for the override
                const fstabContent = `mountpoints:
  /: https://content.da.live/${daLiveOrg}/${daLiveSite}/
`;

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

                const configResult = await generateConfigJson(
                    templateOwner,
                    templateRepo,
                    configParams,
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
                progress.report({ message: `Step 1/4: Reset ${resetResult.fileCount} files` });

                // ============================================
                // Step 2: Wait for code sync
                // ============================================
                progress.report({ message: 'Step 2/4: Waiting for code sync...' });

                const codeUrl = `https://admin.hlx.page/code/${repoOwner}/${repoName}/main/scripts/aem.js`;
                let syncVerified = false;
                const maxAttempts = 25;
                const pollInterval = 2000;

                for (let attempt = 0; attempt < maxAttempts && !syncVerified; attempt++) {
                    progress.report({ message: `Step 2/4: Verifying code sync (attempt ${attempt + 1}/${maxAttempts})` });
                    try {
                        const response = await fetch(codeUrl, {
                            method: 'GET',
                            signal: AbortSignal.timeout(5000),
                        });
                        if (response.ok) {
                            syncVerified = true;
                        }
                    } catch {
                        // Continue polling
                    }

                    if (!syncVerified && attempt < maxAttempts - 1) {
                        await new Promise(resolve => setTimeout(resolve, pollInterval));
                    }
                }

                if (!syncVerified) {
                    context.logger.warn('[ProjectsList] Code sync verification timed out, continuing anyway');
                    progress.report({ message: 'Step 2/4: Code sync timed out, continuing...' });
                } else {
                    context.logger.info('[ProjectsList] Code sync verified');
                    progress.report({ message: 'Step 2/4: Code sync verified' });
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
                progress.report({ message: 'Step 3/4: Copying demo content to DA.live...' });

                context.logger.info(`[ProjectsList] Copying content from ${contentSourceConfig.org}/${contentSourceConfig.site} to ${daLiveOrg}/${daLiveSite}`);

                // Progress callback to show per-file progress
                const onContentProgress = (info: { processed: number; total: number; currentFile?: string }) => {
                    progress.report({ message: `Step 3/4: Copying content (${info.processed}/${info.total})` });
                };

                const contentResult = await daLiveContentOps.copyContentFromSource(
                    contentSource,
                    daLiveOrg,
                    daLiveSite,
                    onContentProgress,
                );

                if (!contentResult.success) {
                    throw new Error(`Content copy failed: ${contentResult.failedFiles.length} files failed`);
                }

                progress.report({ message: `Step 3/4: Copied ${contentResult.totalFiles} content files` });
                context.logger.info(`[ProjectsList] DA.live content populated: ${contentResult.totalFiles} files`);

                // ============================================
                // Step 4: Publish all content to CDN
                // ============================================
                progress.report({ message: 'Step 4/4: Publishing content to CDN...' });
                context.logger.info(`[ProjectsList] Publishing content to CDN for ${repoOwner}/${repoName}`);

                // IMPORTANT: Pass DA.live token provider to HelixService for x-content-source-authorization
                // DA.live uses separate IMS auth from Adobe Console - must use DA.live token
                const helixService = new HelixService(authService, context.logger, githubTokenService, tokenProvider);

                // Progress callback to update notification with publish details
                const onPublishProgress = (info: {
                    phase: string;
                    message: string;
                    current?: number;
                    total?: number;
                    currentPath?: string;
                }) => {
                    // Format: "Step 4/4: Publishing (15/42 pages)"
                    if (info.current !== undefined && info.total !== undefined) {
                        progress.report({ message: `Step 4/4: Publishing to CDN (${info.current}/${info.total} pages)` });
                    } else {
                        progress.report({ message: `Step 4/4: ${info.message}` });
                    }
                };

                await helixService.publishAllSiteContent(`${repoOwner}/${repoName}`, 'main', undefined, undefined, onPublishProgress);

                context.logger.info('[ProjectsList] Content published to CDN successfully');
                context.logger.info('[ProjectsList] EDS project reset successfully');

                // Show auto-dismissing success notification (2 seconds)
                void vscode.window.withProgress(
                    { location: vscode.ProgressLocation.Notification, title: `✓ "${project.name}" reset successfully!` },
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
                vscode.window.showErrorMessage(`Failed to reset EDS project: ${errorMessage}`);
                return { success: false, error: errorMessage };
            }
        },
    );
};
