/**
 * Command: Manage GitHub Repositories
 *
 * Interactive VS Code command to manage GitHub repositories linked to Demo Builder projects.
 *
 * Features:
 * - Loads repositories from Demo Builder project metadata
 * - Multi-select QuickPick with project linkage info
 * - Batch deletion with confirmation
 * - GitHub authentication with proper scopes
 */

import * as vscode from 'vscode';
import { getLogger } from '@/core/logging';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { getLinkedEdsProjects, type EdsProjectInfo } from '../services/resourceCleanupHelpers';

interface RepoQuickPickItem extends vscode.QuickPickItem {
    repoFullName: string;
    linkedProject?: string;
}

export async function manageGitHubReposCommand(context: vscode.ExtensionContext): Promise<void> {
    const logger = getLogger();

    try {
        // Step 1: Check GitHub authentication
        const { getGitHubServices } = await import('@/features/eds/handlers/edsHelpers');

        // Create a minimal context for getGitHubServices
        const minimalContext = {
            context,
            logger,
        };

        const { tokenService, repoOperations } = getGitHubServices(minimalContext as any);

        // Check if we have a valid token
        let token = await tokenService.getToken();
        if (!token) {
            // Prompt user to authenticate
            const signInButton = 'Sign In';
            const selection = await vscode.window.showWarningMessage(
                'GitHub authentication required to manage repositories.',
                signInButton,
            );

            if (selection !== signInButton) {
                return; // User cancelled
            }

            // Try VS Code's GitHub auth provider with delete_repo scope
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
                    token = await tokenService.getToken();
                }
            } catch (error) {
                logger.error('[GitHub Manage] Authentication failed:', error as Error);
                vscode.window.showErrorMessage('GitHub authentication failed. Please try again.');
                return;
            }
        }

        if (!token) {
            vscode.window.showErrorMessage('GitHub authentication required.');
            return;
        }

        // Step 2: Load Demo Builder projects with EDS metadata
        const stateManager = ServiceLocator.getStateManager();
        if (!stateManager) {
            vscode.window.showErrorMessage('Extension not fully initialized. Please try again.');
            return;
        }

        let edsProjects: EdsProjectInfo[] = [];
        let repoToProjectMap = new Map<string, string[]>();

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Loading repositories from Demo Builder projects...',
                cancellable: false,
            },
            async () => {
                try {
                    edsProjects = await getLinkedEdsProjects(stateManager);
                    logger.debug(`[GitHub Manage] Found ${edsProjects.length} EDS projects`);

                    // Build map of repo -> projects (a repo might be linked to multiple projects)
                    for (const project of edsProjects) {
                        if (project.metadata.githubRepo) {
                            const repo = project.metadata.githubRepo;
                            const projects = repoToProjectMap.get(repo) || [];
                            projects.push(project.name);
                            repoToProjectMap.set(repo, projects);
                        }
                    }
                } catch (error) {
                    logger.error('[GitHub Manage] Failed to load projects:', error as Error);
                    throw error;
                }
            },
        );

        // Get unique repos
        const uniqueRepos = Array.from(repoToProjectMap.keys());

        if (uniqueRepos.length === 0) {
            vscode.window.showInformationMessage(
                'No GitHub repositories found linked to Demo Builder projects.',
            );
            return;
        }

        // Step 3: Create QuickPick items
        const quickPickItems: RepoQuickPickItem[] = uniqueRepos.map(repo => {
            const linkedProjects = repoToProjectMap.get(repo) || [];
            return {
                label: `$(repo) ${repo}`,
                description: linkedProjects.length > 0
                    ? `Linked to: ${linkedProjects.join(', ')}`
                    : undefined,
                repoFullName: repo,
                linkedProject: linkedProjects[0],
            };
        });

        // Step 4: Show multi-select QuickPick
        const selectedItems = await vscode.window.showQuickPick(quickPickItems, {
            canPickMany: true,
            placeHolder: `Select repositories to delete (${uniqueRepos.length} total)`,
            title: 'Manage GitHub Repositories',
            matchOnDescription: true,
        });

        if (!selectedItems || selectedItems.length === 0) {
            return; // User cancelled or selected nothing
        }

        // Step 5: Confirm deletion with strong warning
        const reposToDelete = selectedItems.map(item => item.repoFullName);
        const confirmMessage =
            reposToDelete.length === 1
                ? `Delete repository "${reposToDelete[0]}"?`
                : `Delete ${reposToDelete.length} repositories?`;

        const confirmDetail =
            'WARNING: This will permanently delete the selected repositories from GitHub. ' +
            'All code, issues, pull requests, and releases will be lost. ' +
            'This action cannot be undone.';

        const confirmed = await vscode.window.showWarningMessage(
            confirmMessage,
            { modal: true, detail: confirmDetail },
            'Delete Permanently',
        );

        if (confirmed !== 'Delete Permanently') {
            return; // User cancelled
        }

        // Step 6: Delete selected repositories
        const deleted: string[] = [];
        const failed: Array<{ repo: string; error: string }> = [];

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Deleting repositories...',
                cancellable: false,
            },
            async (progress) => {
                for (let i = 0; i < reposToDelete.length; i++) {
                    const repo = reposToDelete[i];
                    progress.report({
                        message: `${i + 1}/${reposToDelete.length}: ${repo}`,
                        increment: 100 / reposToDelete.length,
                    });

                    try {
                        const [owner, repoName] = repo.split('/');
                        if (!owner || !repoName) {
                            throw new Error(`Invalid repository format: ${repo}`);
                        }

                        await repoOperations.deleteRepository(owner, repoName);
                        deleted.push(repo);
                        logger.info(`[GitHub Manage] ✓ Deleted: ${repo}`);
                    } catch (error) {
                        const errorMsg = (error as Error).message;
                        failed.push({ repo, error: errorMsg });
                        logger.error(`[GitHub Manage] ✗ Failed: ${repo} - ${errorMsg}`);
                    }
                }
            },
        );

        // Step 7: Show results
        if (deleted.length > 0 && failed.length === 0) {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Successfully deleted ${deleted.length} repositor${deleted.length !== 1 ? 'ies' : 'y'}.`,
                    cancellable: false,
                },
                async () => {
                    await new Promise(resolve => setTimeout(resolve, TIMEOUTS.UI.NOTIFICATION));
                },
            );
        } else if (deleted.length > 0 && failed.length > 0) {
            const failedList = failed.map(f => f.repo).join(', ');
            vscode.window.showWarningMessage(
                `Deleted ${deleted.length}, failed ${failed.length}: ${failedList}`,
            );
        } else {
            vscode.window.showErrorMessage(
                `Failed to delete all ${failed.length} repositories. Check Debug Logs for details.`,
            );
        }

        logger.info(
            `[GitHub Manage] Complete - Deleted: ${deleted.length}, Failed: ${failed.length}`,
        );
    } catch (error) {
        logger.error('[GitHub Manage Command] Error:', error as Error);
        vscode.window.showErrorMessage(
            `Failed to manage GitHub repositories: ${(error as Error).message}`,
        );
    }
}
