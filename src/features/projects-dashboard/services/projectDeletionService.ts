/**
 * ProjectDeletionService
 *
 * Handles project deletion with confirmation, demo stopping, and retry logic
 * for handling transient filesystem errors.
 *
 * For EDS projects, offers optional cleanup of external resources:
 * - GitHub repository deletion
 * - DA.live site deletion (with Helix CDN unpublish)
 */

import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { TIMEOUTS } from '@/core/utils';
import type { Project } from '@/types/base';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import { toError } from '@/types/typeGuards';
import { ServiceLocator } from '@/core/di';
import {
    isEdsProject,
    extractEdsMetadata,
    deleteDaLiveSiteWithUnpublish,
    formatCleanupResults,
    type CleanupResultItem,
} from '@/features/eds/services/resourceCleanupHelpers';
import { DaLiveAuthService } from '@/features/eds/services/daLiveAuthService';
import { showDaLiveAuthQuickPick } from '@/features/eds/handlers/edsHelpers';

/**
 * Retryable error codes for filesystem operations:
 * - EBUSY: Resource busy (file in use)
 * - ENOTEMPTY: Directory not empty
 * - EPERM: Permission error (temporary lock)
 * - EMFILE/ENFILE: Too many open files
 */
const RETRYABLE_CODES = ['EBUSY', 'ENOTEMPTY', 'EPERM', 'EMFILE', 'ENFILE'];
const MAX_RETRIES = 5;
const BASE_DELAY = TIMEOUTS.FILE_DELETE_RETRY_BASE;

/**
 * Cleanup options for EDS projects
 */
interface CleanupOptions {
    deleteGitHubRepo: boolean;
    deleteDaLiveSite: boolean; // Includes Helix unpublish
}

/**
 * Auth status for cleanup operations
 */
interface CleanupAuthStatus {
    gitHubAuthenticated: boolean;
    daLiveAuthenticated: boolean;
}

/**
 * Delete a project with confirmation and cleanup
 *
 * Shows confirmation dialog, stops demo if running, deletes files,
 * and removes from recent projects.
 *
 * For EDS projects, offers optional external resource cleanup.
 */
export async function deleteProject(
    context: HandlerContext,
    project: Project,
): Promise<HandlerResponse> {
    // Check if this is an EDS project with external resources
    const isEds = isEdsProject(project);
    const edsMetadata = isEds ? extractEdsMetadata(project) : null;

    // For EDS projects, check auth and offer cleanup options
    let cleanupOptions: CleanupOptions | null = null;
    if (isEds && edsMetadata) {
        const authStatus = await checkCleanupAuth(context);
        cleanupOptions = await showCleanupConfirmation(project, edsMetadata, authStatus);

        // User cancelled the cleanup dialog
        if (cleanupOptions === null) {
            return {
                success: true,
                data: { success: false, error: 'cancelled' },
            };
        }
    } else {
        // Non-EDS project: show standard confirmation
        const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to delete "${project.name}"?`,
            {
                modal: true,
                detail: 'This will remove all project files and configuration. This action cannot be undone.',
            },
            'Delete',
        );

        if (confirm !== 'Delete') {
            return {
                success: true,
                data: { success: false, error: 'cancelled' },
            };
        }
    }

    // Collect cleanup results for EDS projects
    const cleanupResults: CleanupResultItem[] = [];

    // Show progress notification during deletion
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Demo Builder',
            cancellable: false,
        },
        async (progress) => {
            // EDS cleanup: Perform external resource cleanup first
            if (isEds && edsMetadata && cleanupOptions) {
                await performEdsCleanup(
                    context,
                    edsMetadata,
                    cleanupOptions,
                    cleanupResults,
                    progress,
                );
            }

            progress.report({ message: `Deleting "${project.name}"...` });

            // Stop demo if running
            if (project.status === 'running') {
                await context.stateManager.saveProject(project);
                await vscode.commands.executeCommand('demoBuilder.stopDemo');
            }

            // Delete project files with retry logic
            const projectPath = project.path;
            if (projectPath) {
                context.logger.debug(`[Delete Project] Deleting directory: ${projectPath}`);
                await new Promise(resolve => setTimeout(resolve, TIMEOUTS.FILE_HANDLE_RELEASE));
                await deleteDirectoryWithRetry(projectPath, context);
            }

            // Remove from recent projects list
            if (projectPath) {
                await context.stateManager.removeFromRecentProjects(projectPath);
            }

            // Clear current project if it was the deleted one
            const currentProject = await context.stateManager.getCurrentProject();
            if (currentProject?.path === projectPath) {
                await context.stateManager.clearProject();
            }

            context.logger.info(`Deleted project: ${project.name}`);

            // Show success message
            progress.report({ message: `"${project.name}" deleted` });
            await new Promise(resolve => setTimeout(resolve, TIMEOUTS.UPDATE_RESULT_DISPLAY));
        },
    );

    // Show cleanup summary for EDS projects
    if (cleanupResults.length > 0) {
        const summary = formatCleanupResults(cleanupResults);
        context.logger.info(`[Delete Project] Cleanup summary:\n${summary}`);
    }

    return {
        success: true,
        data: { success: true, projectName: project.name, cleanupResults },
    };
}

/**
 * Check authentication status for cleanup operations
 */
async function checkCleanupAuth(context: HandlerContext): Promise<CleanupAuthStatus> {
    // Check GitHub auth
    let gitHubAuthenticated = false;
    try {
        const { getGitHubServices } = await import('@/features/eds/handlers/edsHelpers');
        const { tokenService } = getGitHubServices(context);
        const token = await tokenService.getToken();
        gitHubAuthenticated = !!token;
    } catch {
        context.logger.debug('[Delete Project] GitHub auth check failed');
    }

    // Check DA.live auth
    let daLiveAuthenticated = false;
    try {
        const daLiveAuthService = new DaLiveAuthService(context.context);
        daLiveAuthenticated = await daLiveAuthService.isAuthenticated();
    } catch {
        context.logger.debug('[Delete Project] DA.live auth check failed');
    }

    return { gitHubAuthenticated, daLiveAuthenticated };
}

/**
 * Show cleanup confirmation dialog for EDS projects
 *
 * Presents a QuickPick with cleanup options and two action buttons:
 * - "Delete Selected" (trash icon): Delete selected external resources + local project
 * - "Skip & Delete Locally" (x icon): Skip cleanup, only delete local project
 *
 * @returns Cleanup options, empty options (skip cleanup), or null if cancelled
 */
async function showCleanupConfirmation(
    project: Project,
    edsMetadata: ReturnType<typeof extractEdsMetadata>,
    authStatus: CleanupAuthStatus,
): Promise<CleanupOptions | null> {
    // Check auto-delete configuration setting
    const config = vscode.workspace.getConfiguration('demoBuilder');
    const autoDelete = config.get<boolean>('edsCleanup.autoDelete', false);

    if (autoDelete) {
        // Auto-delete: return all available options without showing QuickPick
        // Only delete resources where we have valid authentication and metadata
        return {
            deleteGitHubRepo: authStatus.gitHubAuthenticated && !!edsMetadata?.githubRepo,
            deleteDaLiveSite:
                authStatus.daLiveAuthenticated && !!edsMetadata?.daLiveOrg && !!edsMetadata?.daLiveSite,
        };
    }

    // Build QuickPick items matching plan: "Delete Repository", "Delete DA.live Site"
    interface CleanupQuickPickItem extends vscode.QuickPickItem {
        id: 'github' | 'daLive';
        enabled: boolean;
    }

    const items: CleanupQuickPickItem[] = [];

    // GitHub repository option
    if (edsMetadata?.githubRepo) {
        items.push({
            id: 'github',
            label: '$(github) Delete Repository',
            description: edsMetadata.githubRepo,
            detail: authStatus.gitHubAuthenticated
                ? undefined
                : '$(warning) GitHub token missing - will skip',
            picked: authStatus.gitHubAuthenticated,
            enabled: authStatus.gitHubAuthenticated,
        });
    }

    // DA.live site option (includes Helix unpublish)
    if (edsMetadata?.daLiveOrg && edsMetadata?.daLiveSite) {
        items.push({
            id: 'daLive',
            label: '$(file-text) Delete DA.live Site',
            description: `${edsMetadata.daLiveOrg}/${edsMetadata.daLiveSite}`,
            detail: authStatus.daLiveAuthenticated
                ? undefined
                : '$(warning) DA.live session expired - will skip',
            picked: authStatus.daLiveAuthenticated,
            enabled: authStatus.daLiveAuthenticated,
        });
    }

    // If no external resources, skip the dialog and show standard confirmation
    if (items.length === 0) {
        const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to delete "${project.name}"?`,
            {
                modal: true,
                detail: 'This will remove all project files and configuration. This action cannot be undone.',
            },
            'Delete',
        );

        if (confirm !== 'Delete') {
            return null;
        }

        return { deleteGitHubRepo: false, deleteDaLiveSite: false };
    }

    // Define buttons: [Delete Selected] [Skip & Delete Locally] [Always Delete All]
    const deleteSelectedButton: vscode.QuickInputButton = {
        iconPath: new vscode.ThemeIcon('trash'),
        tooltip: 'Delete Selected',
    };
    const skipButton: vscode.QuickInputButton = {
        iconPath: new vscode.ThemeIcon('close'),
        tooltip: 'Skip & Delete Locally',
    };
    const alwaysDeleteAllButton: vscode.QuickInputButton = {
        iconPath: new vscode.ThemeIcon('check-all'),
        tooltip: 'Always Delete All (save preference)',
    };

    // Show QuickPick with cleanup options
    const quickPick = vscode.window.createQuickPick<CleanupQuickPickItem>();
    quickPick.title = `Delete "${project.name}"`;
    quickPick.placeholder = 'Select external resources to delete, then click an action';
    quickPick.canSelectMany = true;
    quickPick.ignoreFocusOut = true; // Prevent dismissal when webview takes focus
    quickPick.items = items;
    quickPick.selectedItems = items.filter(i => i.picked);
    quickPick.buttons = [deleteSelectedButton, skipButton, alwaysDeleteAllButton];

    return new Promise<CleanupOptions | null>((resolve) => {
        let resolved = false;

        // Handle button clicks
        quickPick.onDidTriggerButton(async (button) => {
            if (resolved) return;
            resolved = true;
            quickPick.hide();

            if (button === skipButton) {
                // Skip cleanup, but still delete local project
                resolve({ deleteGitHubRepo: false, deleteDaLiveSite: false });
            } else if (button === alwaysDeleteAllButton) {
                // Save preference and delete all available resources
                await config.update('edsCleanup.autoDelete', true, vscode.ConfigurationTarget.Global);
                resolve({
                    deleteGitHubRepo: authStatus.gitHubAuthenticated && !!edsMetadata?.githubRepo,
                    deleteDaLiveSite:
                        authStatus.daLiveAuthenticated &&
                        !!edsMetadata?.daLiveOrg &&
                        !!edsMetadata?.daLiveSite,
                });
            } else {
                // Delete selected resources
                const selected = quickPick.selectedItems;
                resolve({
                    deleteGitHubRepo: selected.some(i => i.id === 'github'),
                    deleteDaLiveSite: selected.some(i => i.id === 'daLive'),
                });
            }
        });

        // Enter key = same as "Delete Selected" button
        quickPick.onDidAccept(() => {
            if (resolved) return;
            resolved = true;

            const selected = quickPick.selectedItems;
            quickPick.hide();

            resolve({
                deleteGitHubRepo: selected.some(i => i.id === 'github'),
                deleteDaLiveSite: selected.some(i => i.id === 'daLive'),
            });
        });

        // Escape = Cancel entirely (abort deletion)
        quickPick.onDidHide(() => {
            if (resolved) return;
            resolved = true;
            resolve(null);
        });

        quickPick.show();
    });
}

/**
 * Perform EDS external resource cleanup
 */
async function performEdsCleanup(
    context: HandlerContext,
    edsMetadata: ReturnType<typeof extractEdsMetadata>,
    options: CleanupOptions,
    results: CleanupResultItem[],
    progress: vscode.Progress<{ message?: string }>,
): Promise<void> {
    // 1. Delete DA.live site (with Helix unpublish first)
    if (options.deleteDaLiveSite && edsMetadata?.daLiveOrg && edsMetadata?.daLiveSite) {
        progress.report({ message: 'Unpublishing from Helix CDN...' });

        try {
            // Check DA.live auth first - prompt if needed
            const daLiveAuthService = new DaLiveAuthService(context.context);
            const isDaLiveAuthenticated = await daLiveAuthService.isAuthenticated();

            if (!isDaLiveAuthenticated) {
                // Prompt user to sign in
                const signInButton = 'Sign In';
                const selection = await vscode.window.showWarningMessage(
                    'Your DA.live session has expired. Sign in to delete the DA.live site.',
                    signInButton,
                );

                if (selection === signInButton) {
                    const authResult = await showDaLiveAuthQuickPick(context);
                    if (!authResult.success) {
                        results.push({
                            type: 'daLive',
                            name: `${edsMetadata.daLiveOrg}/${edsMetadata.daLiveSite}`,
                            success: false,
                            skipped: true,
                            error: 'Authentication required',
                        });
                        return;
                    }
                } else {
                    results.push({
                        type: 'daLive',
                        name: `${edsMetadata.daLiveOrg}/${edsMetadata.daLiveSite}`,
                        success: false,
                        skipped: true,
                        error: 'Authentication required',
                    });
                    return;
                }
            }

            // Create services for cleanup
            const { HelixService } = await import('@/features/eds/services/helixService');
            const { DaLiveOrgOperations } = await import('@/features/eds/services/daLiveOrgOperations');
            const authenticationService = ServiceLocator.getAuthenticationService();
            const tokenManager = authenticationService?.getTokenManager?.();

            const tokenProvider = {
                getAccessToken: async () => {
                    const token = await tokenManager?.getAccessToken?.();
                    return token ?? null;
                },
            };

            // HelixService: (logger, githubTokenService, daLiveTokenProvider)
            const helixService = new HelixService(context.logger, undefined, tokenProvider);
            const daLiveOrgOps = new DaLiveOrgOperations(tokenProvider, context.logger);

            progress.report({ message: 'Deleting DA.live site...' });

            const cleanupResult = await deleteDaLiveSiteWithUnpublish(
                helixService,
                daLiveOrgOps,
                edsMetadata.githubRepo,
                edsMetadata.daLiveOrg,
                edsMetadata.daLiveSite,
                context.logger,
            );

            results.push({
                type: 'daLive',
                name: `${edsMetadata.daLiveOrg}/${edsMetadata.daLiveSite}`,
                success: cleanupResult.success,
                error: cleanupResult.error,
            });

            // Also add Helix result if we attempted it
            if (edsMetadata.githubRepo) {
                results.push({
                    type: 'helix',
                    name: edsMetadata.githubRepo,
                    success: cleanupResult.helixUnpublished,
                    error: cleanupResult.details?.helix?.liveError || cleanupResult.details?.helix?.previewError,
                });
            }
        } catch (error) {
            context.logger.error('[Delete Project] DA.live cleanup failed', error as Error);
            results.push({
                type: 'daLive',
                name: `${edsMetadata.daLiveOrg}/${edsMetadata.daLiveSite}`,
                success: false,
                error: (error as Error).message,
            });
        }
    }

    // 2. Delete GitHub repository
    if (options.deleteGitHubRepo && edsMetadata?.githubRepo) {
        progress.report({ message: 'Deleting GitHub repository...' });

        try {
            const { getGitHubServices } = await import('@/features/eds/handlers/edsHelpers');
            const { tokenService, repoOperations } = getGitHubServices(context);

            // Check if we have a valid token
            const existingToken = await tokenService.getToken();
            if (!existingToken) {
                // Prompt user to authenticate
                const signInButton = 'Sign In';
                const selection = await vscode.window.showWarningMessage(
                    'GitHub authentication required to delete the repository.',
                    signInButton,
                );

                if (selection !== signInButton) {
                    results.push({
                        type: 'github',
                        name: edsMetadata.githubRepo,
                        success: false,
                        skipped: true,
                        error: 'Authentication required',
                    });
                    return;
                }

                // Try VS Code's GitHub auth provider
                try {
                    const session = await vscode.authentication.getSession('github', ['repo', 'delete_repo'], {
                        createIfNone: true,
                    });

                    if (session) {
                        await tokenService.storeToken({
                            token: session.accessToken,
                            tokenType: 'bearer',
                            scopes: ['repo', 'delete_repo'],
                        });
                    }
                } catch {
                    results.push({
                        type: 'github',
                        name: edsMetadata.githubRepo,
                        success: false,
                        skipped: true,
                        error: 'Authentication failed',
                    });
                    return;
                }
            }

            // Parse owner/repo from full name
            const [owner, repo] = edsMetadata.githubRepo.split('/');
            if (!owner || !repo) {
                results.push({
                    type: 'github',
                    name: edsMetadata.githubRepo,
                    success: false,
                    error: 'Invalid repository name format',
                });
                return;
            }

            // Delete the repository
            await repoOperations.deleteRepository(owner, repo);

            results.push({
                type: 'github',
                name: edsMetadata.githubRepo,
                success: true,
            });

            context.logger.info(`[Delete Project] Deleted GitHub repository: ${edsMetadata.githubRepo}`);
        } catch (error) {
            context.logger.error('[Delete Project] GitHub cleanup failed', error as Error);
            results.push({
                type: 'github',
                name: edsMetadata.githubRepo,
                success: false,
                error: (error as Error).message,
            });
        }
    }
}

/**
 * Delete directory with exponential backoff retry on transient filesystem errors
 */
async function deleteDirectoryWithRetry(path: string, context: HandlerContext): Promise<void> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            context.logger.debug(`[Delete Project] Attempt ${attempt + 1}/${MAX_RETRIES}`);
            await fs.rm(path, { recursive: true, force: true });
            context.logger.debug(`[Delete Project] Deletion successful`);
            return;
        } catch (error) {
            const err = toError(error);
            const code = (error as NodeJS.ErrnoException).code;
            const isRetryable = code !== undefined && RETRYABLE_CODES.includes(code);

            context.logger.debug(`[Delete Project] Error: ${code} - ${err.message} (retryable: ${isRetryable})`);

            if (isRetryable && attempt < MAX_RETRIES - 1) {
                const delay = BASE_DELAY * Math.pow(2, attempt);
                context.logger.debug(`[Delete Project] Waiting ${delay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else if (isRetryable) {
                throw new Error(`Failed to delete project after ${MAX_RETRIES} attempts: ${err.message}`);
            } else {
                throw new Error(`Failed to delete project: ${err.message}`);
            }
        }
    }
}
