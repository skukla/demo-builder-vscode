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

        // Load full project data for each
        const projects: Project[] = [];
        for (const item of projectList) {
            const project = await context.stateManager.loadProjectFromPath(item.path);
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

    const project = await context.stateManager.loadProjectFromPath(payload.projectPath);
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

        const project = await context.stateManager.loadProjectFromPath(payload.projectPath);
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

        const project = await context.stateManager.loadProjectFromPath(payload.projectPath);
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
        context.logger.info(`[Edit Debug] selectedPackage: ${project.selectedPackage}, selectedStack: ${project.selectedStack}`);
        context.logger.info(`[Edit Debug] settings.selectedPackage: ${settings.selectedPackage}, settings.selectedStack: ${settings.selectedStack}`);

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

    const project = await context.stateManager.loadProjectFromPath(payload.projectPath);
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

    const project = await context.stateManager.loadProjectFromPath(payload.projectPath);
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
 * Steps:
 * 1. Lists files in template and user repos
 * 2. Deletes user files not in template
 * 3. Copies/updates template files to user repo
 * 4. Configures fstab.yaml for DA.live
 * 5. Waits for code sync
 * 6. Copies demo content to DA.live
 * 7. Publishes all content to CDN
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

    const project = await context.stateManager.loadProjectFromPath(payload.projectPath);
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
                const tokenProvider = {
                    getAccessToken: async () => {
                        const token = await authService.getTokenManager().getAccessToken();
                        return token ?? null;
                    },
                };

                const daLiveContentOps = new DaLiveContentOperations(tokenProvider, context.logger);

                // ============================================
                // Step 1: List files in both repos
                // ============================================
                progress.report({ message: 'Step 1/7: Analyzing repositories...' });
                context.logger.info(`[ProjectsList] Listing files in template and user repos`);

                const [templateFiles, userFiles] = await Promise.all([
                    githubFileOps.listRepoFiles(templateOwner, templateRepo, 'main'),
                    githubFileOps.listRepoFiles(repoOwner, repoName, 'main'),
                ]);

                const templateFilePaths = new Set(templateFiles.map(f => f.path));
                const userFileMap = new Map(userFiles.map(f => [f.path, f]));

                context.logger.info(`[ProjectsList] Template has ${templateFiles.length} files, user repo has ${userFiles.length} files`);
                progress.report({ message: `Step 1/7: Found ${templateFiles.length} template files, ${userFiles.length} existing files` });

                // ============================================
                // Step 2: Delete files not in template
                // ============================================
                // Files to delete: in user repo but not in template (except fstab.yaml which we configure)
                const filesToDelete = userFiles.filter(f =>
                    !templateFilePaths.has(f.path) && f.path !== 'fstab.yaml'
                );

                if (filesToDelete.length > 0) {
                    progress.report({ message: `Step 2/7: Removing ${filesToDelete.length} extra files...` });
                    context.logger.info(`[ProjectsList] Deleting ${filesToDelete.length} extra files`);
                    let deletedCount = 0;
                    for (const file of filesToDelete) {
                        deletedCount++;
                        progress.report({ message: `Step 2/7: Removing extra files (${deletedCount}/${filesToDelete.length})` });
                        // Fetch current SHA before delete (tree changes after each commit)
                        const currentFile = await githubFileOps.getFileContent(repoOwner, repoName, file.path);
                        if (currentFile) {
                            await githubFileOps.deleteFile(
                                repoOwner,
                                repoName,
                                file.path,
                                `chore: remove ${file.path} (reset to template)`,
                                currentFile.sha,
                            );
                        }
                    }
                } else {
                    progress.report({ message: 'Step 2/7: No extra files to remove' });
                }

                // ============================================
                // Step 3: Copy/update template files
                // ============================================
                // Filter out fstab.yaml (configured separately) and files that haven't changed
                const filesToCopy = templateFiles.filter(f => {
                    if (f.path === 'fstab.yaml') return false;
                    const existingFile = userFileMap.get(f.path);
                    return !existingFile || existingFile.sha !== f.sha;
                });

                progress.report({ message: `Step 3/7: Copying ${filesToCopy.length} template files...` });
                context.logger.info(`[ProjectsList] Copying ${filesToCopy.length} files from template (${templateFiles.length - filesToCopy.length - 1} unchanged)`);

                let copiedCount = 0;
                for (const templateFile of filesToCopy) {
                    copiedCount++;
                    progress.report({ message: `Step 3/7: Copying template files (${copiedCount}/${filesToCopy.length})` });

                    // Get template file content
                    const templateContent = await githubFileOps.getFileContent(
                        templateOwner,
                        templateRepo,
                        templateFile.path,
                    );

                    if (!templateContent) {
                        context.logger.warn(`[ProjectsList] Could not read template file: ${templateFile.path}`);
                        continue;
                    }

                    // Check if file exists in user repo (for update vs create)
                    const existingFile = userFileMap.get(templateFile.path);
                    const existingSha = existingFile?.sha;

                    await githubFileOps.createOrUpdateFile(
                        repoOwner,
                        repoName,
                        templateFile.path,
                        templateContent.content,
                        `chore: reset ${templateFile.path} to template`,
                        existingSha,
                    );
                }

                context.logger.info('[ProjectsList] Template files copied');

                // ============================================
                // Step 4: Configure fstab.yaml
                // ============================================
                progress.report({ message: 'Step 4/7: Configuring content source (fstab.yaml)...' });

                const fstabContent = `mountpoints:
  /: https://content.da.live/${daLiveOrg}/${daLiveSite}/
`;

                // Check if fstab.yaml already exists (to get SHA for update)
                const existingFstab = await githubFileOps.getFileContent(repoOwner, repoName, 'fstab.yaml');
                const fstabSha = existingFstab?.sha;

                await githubFileOps.createOrUpdateFile(
                    repoOwner,
                    repoName,
                    'fstab.yaml',
                    fstabContent,
                    'chore: configure fstab.yaml for DA.live content source',
                    fstabSha,
                );

                context.logger.info('[ProjectsList] fstab.yaml configured');

                // ============================================
                // Step 5: Wait for code sync
                // ============================================
                progress.report({ message: 'Step 5/7: Waiting for code sync...' });

                const codeUrl = `https://admin.hlx.page/code/${repoOwner}/${repoName}/main/scripts/aem.js`;
                let syncVerified = false;
                const maxAttempts = 25;
                const pollInterval = 2000;

                for (let attempt = 0; attempt < maxAttempts && !syncVerified; attempt++) {
                    progress.report({ message: `Step 5/7: Verifying code sync (attempt ${attempt + 1}/${maxAttempts})` });
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
                    progress.report({ message: 'Step 5/7: Code sync timed out, continuing...' });
                } else {
                    context.logger.info('[ProjectsList] Code sync verified');
                    progress.report({ message: 'Step 5/7: Code sync verified' });
                }

                // ============================================
                // Step 6: Copy demo content to DA.live
                // ============================================
                progress.report({ message: 'Step 6/7: Copying demo content to DA.live...' });
                context.logger.info(`[ProjectsList] Copying content from ${contentSourceConfig.org}/${contentSourceConfig.site} to ${daLiveOrg}/${daLiveSite}`);

                // Build full content source with index URL from explicit config
                const indexPath = contentSourceConfig.indexPath || '/full-index.json';
                const contentSource = {
                    org: contentSourceConfig.org,
                    site: contentSourceConfig.site,
                    indexUrl: `https://main--${contentSourceConfig.site}--${contentSourceConfig.org}.aem.live${indexPath}`,
                };

                const contentResult = await daLiveContentOps.copyContentFromSource(
                    contentSource,
                    daLiveOrg,
                    daLiveSite,
                );

                if (!contentResult.success) {
                    throw new Error(`Content copy failed: ${contentResult.failedFiles.length} files failed`);
                }

                progress.report({ message: `Step 6/7: Copied ${contentResult.totalFiles} content files` });
                context.logger.info(`[ProjectsList] DA.live content populated: ${contentResult.totalFiles} files`);

                // ============================================
                // Step 7: Publish all content to CDN
                // ============================================
                progress.report({ message: 'Step 7/7: Publishing content to CDN...' });
                context.logger.info(`[ProjectsList] Publishing content to CDN for ${repoOwner}/${repoName}`);

                const helixService = new HelixService(authService, context.logger, githubTokenService);

                // Progress callback to update notification with publish details
                const onPublishProgress = (info: {
                    phase: string;
                    message: string;
                    current?: number;
                    total?: number;
                    currentPath?: string;
                }) => {
                    // Format: "Step 7/7: Publishing (15/42 pages)"
                    if (info.current !== undefined && info.total !== undefined) {
                        progress.report({ message: `Step 7/7: Publishing to CDN (${info.current}/${info.total} pages)` });
                    } else {
                        progress.report({ message: `Step 7/7: ${info.message}` });
                    }
                };

                await helixService.publishAllSiteContent(`${repoOwner}/${repoName}`, 'main', undefined, undefined, onPublishProgress);

                context.logger.info('[ProjectsList] Content published to CDN successfully');
                context.logger.info('[ProjectsList] EDS project reset successfully');

                // Show success message
                vscode.window.showInformationMessage(`"${project.name}" reset successfully!`);

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
