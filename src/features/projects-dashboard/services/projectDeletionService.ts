/**
 * ProjectDeletionService
 *
 * Handles project deletion with confirmation, demo stopping, and retry logic
 * for handling transient filesystem errors.
 *
 * For EDS projects, offers optional cleanup of external resources:
 * - GitHub repository deletion
 * - DA.live site deletion
 */

import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { TIMEOUTS, showOneTimeTip } from '@/core/utils';
import { ensureDaLiveAuth as ensureDaLiveAuthShared, getDaLiveAuthService } from '@/features/eds/handlers/edsHelpers';
import { DaLiveAuthService } from '@/features/eds/services/daLiveAuthService';
import { createDaLiveServiceTokenProvider, DaLiveContentOperations } from '@/features/eds/services/daLiveContentOperations';
import { HelixService } from '@/features/eds/services/helixService';
import {
    isEdsProject,
    extractEdsMetadata,
    deleteDaLiveSite,
    formatCleanupResults,
    type CleanupResultItem,
} from '@/features/eds/services/resourceCleanupHelpers';
import type { Project } from '@/types/base';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import { toError } from '@/types/typeGuards';

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
    deleteDaLiveSite: boolean;
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

    // For EDS projects, offer cleanup options
    // Auth is checked lazily in performEdsCleanup when user actually selects an option
    // This avoids slow auth checks before showing the confirmation dialog
    let cleanupOptions: CleanupOptions | null = null;
    if (isEds && edsMetadata) {
        // Auth is checked lazily in performEdsCleanup when user selects an option
        cleanupOptions = await showCleanupConfirmation(project, edsMetadata);

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

    // Show one-time tip about cleanup settings (only if we showed the QuickPick)
    if (isEds && cleanupResults.length > 0) {
        showOneTimeTip(context.context.globalState, {
            stateKey: 'edsCleanup.settingsTipShown',
            message: 'Tip: You can customize cleanup behavior in Settings → Demo Builder',
            actions: ['Open Settings'],
            onAction: (selection) => {
                if (selection === 'Open Settings') {
                    vscode.commands.executeCommand(
                        'workbench.action.openSettings',
                        'demoBuilder.cleanupBehavior',
                    );
                }
            },
        });
    }

    return {
        success: true,
        data: { success: true, projectName: project.name, cleanupResults },
    };
}

/**
 * Show cleanup confirmation dialog for EDS projects
 *
 * Presents a QuickPick with checkboxes for external resources to also delete.
 * - Press Enter or click Delete → Delete local project + selected external resources
 * - Click outside or press Escape → Cancel entirely (no deletion)
 *
 * @returns Cleanup options (which external resources to delete), or null if cancelled
 */
async function showCleanupConfirmation(
    project: Project,
    edsMetadata: ReturnType<typeof extractEdsMetadata>,
): Promise<CleanupOptions | null> {
    // Check cleanup behavior configuration setting
    const config = vscode.workspace.getConfiguration('demoBuilder');
    const behavior = config.get<string>('cleanupBehavior', 'ask');

    if (behavior === 'deleteAll') {
        // Auto-delete all available resources (auth is checked lazily during cleanup)
        return {
            deleteGitHubRepo: !!edsMetadata?.githubRepo,
            deleteDaLiveSite: !!edsMetadata?.daLiveOrg && !!edsMetadata?.daLiveSite,
        };
    }

    if (behavior === 'localOnly') {
        // Local only: show standard confirmation, skip external cleanup
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
            detail: '$(key) Sign-in required',
            picked: false,
            enabled: true,
        });
    }

    // DA.live site option (includes Helix unpublish)
    if (edsMetadata?.daLiveOrg && edsMetadata?.daLiveSite) {
        items.push({
            id: 'daLive',
            label: '$(file-text) Delete DA.live Site',
            description: `${edsMetadata.daLiveOrg}/${edsMetadata.daLiveSite}`,
            detail: '$(key) Sign-in required',
            picked: false,
            enabled: true,
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

    // Cancel button for explicit cancellation
    const cancelButton: vscode.QuickInputButton = {
        iconPath: new vscode.ThemeIcon('close'),
        tooltip: 'Cancel',
    };

    // Show QuickPick with cleanup options
    const quickPick = vscode.window.createQuickPick<CleanupQuickPickItem>();
    quickPick.title = `Delete "${project.name}"`;
    quickPick.placeholder = 'Also delete these external resources? (Enter to delete)';
    quickPick.canSelectMany = true;
    quickPick.ignoreFocusOut = true; // Prevent dismissal when webview takes focus
    quickPick.items = items;
    quickPick.selectedItems = items.filter(i => i.picked);
    quickPick.buttons = [cancelButton];

    return new Promise<CleanupOptions | null>((resolve) => {
        let resolved = false;

        // Cancel button = abort deletion
        quickPick.onDidTriggerButton(() => {
            if (resolved) return;
            resolved = true;
            quickPick.hide();
            resolve(null);
        });

        // Enter key confirms deletion
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

        // Escape = Cancel entirely (no deletion)
        quickPick.onDidHide(() => {
            if (resolved) return;
            resolved = true;
            resolve(null);
        });

        quickPick.show();
    });
}

/**
 * Ensure DA.live authentication, prompting user if needed.
 * Returns the auth service if authenticated, or null if auth was declined/failed.
 *
 * Delegates to the shared ensureDaLiveAuth guard from edsHelpers,
 * then wraps the result to match the caller's expected signature.
 */
async function ensureDaLiveAuth(
    context: HandlerContext,
    resourceName: string,
    results: CleanupResultItem[],
): Promise<DaLiveAuthService | null> {
    const authResult = await ensureDaLiveAuthShared(context, '[Delete Project]');

    if (authResult.authenticated) {
        return getDaLiveAuthService(context.context);
    }

    results.push({
        type: 'daLive',
        name: resourceName,
        success: false,
        skipped: true,
        error: authResult.error || 'Authentication required',
    });
    return null;
}

/**
 * Unpublish CDN content and clean up Admin API key before deleting DA.live site
 */
async function unpublishCdnContent(
    context: HandlerContext,
    edsMetadata: ReturnType<typeof extractEdsMetadata>,
    daLiveTokenProvider: { getAccessToken: () => Promise<string | null> },
    results: CleanupResultItem[],
    progress: vscode.Progress<{ message?: string }>,
): Promise<void> {
    if (!edsMetadata?.githubRepo) return;

    const [githubOwner, githubRepo] = edsMetadata.githubRepo.split('/');
    if (!githubOwner || !githubRepo) return;

    try {
        progress.report({ message: 'Unpublishing CDN content...' });
        await HelixService.initKeyStore(context.context.secrets, context.context.globalState);
        const helixService = new HelixService(context.logger, undefined, daLiveTokenProvider);
        const daOrg = edsMetadata.daLiveOrg ?? '';
        const daSite = edsMetadata.daLiveSite ?? '';
        const pages = await helixService.listAllPages(daOrg, daSite);

        const unpublishResult = await helixService.unpublishPages(
            githubOwner, githubRepo, 'main', pages,
        );

        if (unpublishResult.success && unpublishResult.count > 0) {
            results.push({
                type: 'helix',
                name: `${githubOwner}/${githubRepo}`,
                success: true,
            });
        } else if (!unpublishResult.success) {
            context.logger.warn(`[Delete Project] CDN unpublish failed for ${githubOwner}/${githubRepo}`);
        }

        const keyDeleteResult = await helixService.deleteAdminApiKey(daOrg, daSite);
        if (!keyDeleteResult.success) {
            context.logger.debug(`[Delete Project] Admin API key cleanup skipped: ${keyDeleteResult.error}`);
        }
    } catch (unpublishError) {
        context.logger.warn(`[Delete Project] CDN unpublish failed: ${(unpublishError as Error).message}`);
    }
}

/**
 * Delete DA.live site content and clean up config
 */
async function performDaLiveCleanup(
    context: HandlerContext,
    edsMetadata: ReturnType<typeof extractEdsMetadata>,
    options: CleanupOptions,
    results: CleanupResultItem[],
    progress: vscode.Progress<{ message?: string }>,
): Promise<void> {
    if (!options.deleteDaLiveSite || !edsMetadata?.daLiveOrg || !edsMetadata?.daLiveSite) return;

    progress.report({ message: 'Deleting DA.live site...' });
    const resourceName = `${edsMetadata.daLiveOrg}/${edsMetadata.daLiveSite}`;

    try {
        const daLiveAuthService = await ensureDaLiveAuth(context, resourceName, results);
        if (!daLiveAuthService) return;

        const daLiveTokenProvider = createDaLiveServiceTokenProvider(daLiveAuthService);

        const daLiveContentOps = new DaLiveContentOperations(daLiveTokenProvider, context.logger);

        // Unpublish CDN content before deleting the site
        // Uses DA.live Bearer token auth which bypasses the "source exists" restriction
        await unpublishCdnContent(context, edsMetadata, daLiveTokenProvider, results, progress);

        progress.report({ message: 'Deleting DA.live site content...' });
        const cleanupResult = await deleteDaLiveSite(
            daLiveContentOps,
            edsMetadata.daLiveOrg,
            edsMetadata.daLiveSite,
            context.logger,
        );

        results.push({
            type: 'daLive',
            name: resourceName,
            success: cleanupResult.success,
            error: cleanupResult.error,
        });

        // Clean up stale site-specific permission rows from org config
        const { DaLiveConfigService } = await import('@/features/eds/services/daLiveConfigService');
        const configService = new DaLiveConfigService(daLiveTokenProvider, context.logger);

        const permResult = await configService.removeSitePermissions(
            edsMetadata.daLiveOrg, edsMetadata.daLiveSite,
        );
        if (!permResult.success) {
            context.logger.warn(`[Delete Project] Permission cleanup failed: ${permResult.error}`);
        }

        const configDeleteResult = await configService.deleteSiteConfig(
            edsMetadata.daLiveOrg, edsMetadata.daLiveSite,
        );
        if (!configDeleteResult.success) {
            context.logger.debug(`[Delete Project] Site config cleanup skipped: ${configDeleteResult.error}`);
        }
    } catch (error) {
        context.logger.error('[Delete Project] DA.live cleanup failed', error as Error);
        results.push({
            type: 'daLive',
            name: resourceName,
            success: false,
            error: (error as Error).message,
        });
    }
}

/**
 * Delete GitHub repository with authentication handling
 */
async function performGitHubCleanup(
    context: HandlerContext,
    githubRepo: string,
    results: CleanupResultItem[],
    progress: vscode.Progress<{ message?: string }>,
): Promise<void> {
    progress.report({ message: 'Deleting GitHub repository...' });

    try {
        const { getGitHubServices } = await import('@/features/eds/handlers/edsHelpers');
        const { tokenService, repoOperations } = getGitHubServices(context);

        const existingToken = await tokenService.getToken();
        if (!existingToken) {
            const authenticated = await promptGitHubAuth(tokenService, githubRepo, results);
            if (!authenticated) return;
        }

        const [owner, repo] = githubRepo.split('/');
        if (!owner || !repo) {
            results.push({ type: 'github', name: githubRepo, success: false, error: 'Invalid repository name format' });
            return;
        }

        await repoOperations.deleteRepository(owner, repo);
        results.push({ type: 'github', name: githubRepo, success: true });
        context.logger.info(`[Delete Project] Deleted GitHub repository: ${githubRepo}`);
    } catch (error) {
        context.logger.error('[Delete Project] GitHub cleanup failed', error as Error);
        results.push({ type: 'github', name: githubRepo, success: false, error: (error as Error).message });
    }
}

/**
 * Prompt user for GitHub authentication. Returns true if authenticated.
 */
async function promptGitHubAuth(
    tokenService: { storeToken: (data: { token: string; tokenType: string; scopes: string[] }) => Promise<void> },
    githubRepo: string,
    results: CleanupResultItem[],
): Promise<boolean> {
    const selection = await vscode.window.showWarningMessage(
        'GitHub authentication required to delete the repository.',
        'Sign In',
    );

    if (selection !== 'Sign In') {
        results.push({ type: 'github', name: githubRepo, success: false, skipped: true, error: 'Authentication required' });
        return false;
    }

    try {
        const session = await vscode.authentication.getSession('github', ['repo', 'delete_repo'], { createIfNone: true });
        if (session) {
            await tokenService.storeToken({ token: session.accessToken, tokenType: 'bearer', scopes: ['repo', 'delete_repo'] });
        }
        return true;
    } catch {
        results.push({ type: 'github', name: githubRepo, success: false, skipped: true, error: 'Authentication failed' });
        return false;
    }
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
    // 1. Delete DA.live site
    await performDaLiveCleanup(context, edsMetadata, options, results, progress);

    // 2. Delete GitHub repository
    if (options.deleteGitHubRepo && edsMetadata?.githubRepo) {
        await performGitHubCleanup(context, edsMetadata.githubRepo, results, progress);
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
