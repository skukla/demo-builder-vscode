/**
 * Command: Manage GitHub Repositories
 *
 * Interactive VS Code command to manage ALL user's GitHub repositories.
 *
 * Features:
 * - Fetches ALL repositories from GitHub API (not filtered by Demo Builder projects)
 * - Shows linkage info for repos connected to Demo Builder projects
 * - Multi-select QuickPick for batch operations
 * - Batch deletion with confirmation; a storefront's code on aem.live goes with its
 *   repository (EDS-67, `deleteStorefrontRepository`)
 * - GitHub authentication with proper scopes
 */

import * as vscode from 'vscode';
import { getLinkedEdsProjects } from '../services/resourceCleanupHelpers';
import {
    deleteStorefrontRepository,
    type StorefrontRepoDeletion,
} from '../services/storefront/storefrontCodeRemoval';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { getLogger } from '@/core/logging/debugLogger';
import { showSuccessInStatusBar } from '@/core/vscode/statusBarSuccess';
import type { Logger } from '@/types/logger';

interface RepoQuickPickItem extends vscode.QuickPickItem {
    repoFullName: string;
    linkedProject?: string;
}

/** What a batch delete did. */
export interface RepoBatchOutcome {
    deleted: string[];
    failed: Array<{ repo: string; error: string }>;
    /** Deleted storefronts whose code may still be on aem.live, each with the SC's sentence (EDS-67). */
    codeLeft: Array<{ repo: string; summary: string }>;
    /**
     * Storefronts NOT deleted, because there was no working DA.live sign-in to remove their
     * code with (owner, 2026-10-28), each with the SC's sentence.
     */
    kept: Array<{ repo: string; reason: string }>;
}

export interface RepoBatchDeps {
    logger: Logger;
    /** Delete one repository and, for a storefront, its code on aem.live after it. */
    deleteRepository: (owner: string, repo: string) => Promise<StorefrontRepoDeletion>;
    /** Each repository as it starts. */
    onRepo?: (repo: string) => void;
}

/**
 * Delete each repository in turn. One failure never stops the rest; each is recorded.
 *
 * @param repos - `owner/repo` names
 * @param deps - the delete, and where to log and report
 */
export async function deleteGitHubRepos(repos: string[], deps: RepoBatchDeps): Promise<RepoBatchOutcome> {
    const outcome: RepoBatchOutcome = { deleted: [], failed: [], codeLeft: [], kept: [] };
    for (const repo of repos) {
        deps.onRepo?.(repo);
        try {
            const [owner, repoName] = repo.split('/');
            if (!owner || !repoName) {
                throw new Error(`Invalid repository format: ${repo}`);
            }
            const { code, kept } = await deps.deleteRepository(owner, repoName);
            if (kept) {
                outcome.kept.push({ repo, reason: kept });
                deps.logger.warn(`[GitHub Manage] Kept: ${repo} - ${kept}`);
                continue;
            }
            outcome.deleted.push(repo);
            if (code?.summary) outcome.codeLeft.push({ repo, summary: code.summary });
            deps.logger.info(`[GitHub Manage] ✓ Deleted: ${repo}`);
        } catch (error) {
            const errorMsg = (error as Error).message;
            outcome.failed.push({ repo, error: errorMsg });
            deps.logger.error(`[GitHub Manage] ✗ Failed: ${repo} - ${errorMsg}`);
        }
    }
    return outcome;
}

/**
 * What the SC is told: a success only when everything went, code included, so a
 * storefront whose code still answers is never reported as cleanly deleted.
 */
export function describeRepoOutcome(outcome: RepoBatchOutcome): {
    level: 'success' | 'warning' | 'error';
    message: string;
} {
    const { deleted, failed, codeLeft, kept } = outcome;
    if (kept.length > 0) {
        // One sentence for the lot: the reason is the same, and it says what to do.
        const names = kept.map((k) => k.repo).join(', ');
        const done = deleted.length > 0 ? `Deleted ${deleted.length}. ` : '';
        const broken = failed.length > 0 ? ` Failed: ${failed.map((f) => f.repo).join(', ')}.` : '';
        return { level: 'warning', message: `${done}Kept ${names}. ${kept[0].reason}${broken}` };
    }
    if (deleted.length === 0) {
        return {
            level: 'error',
            message: `Failed to delete all ${failed.length} repositories. Check Debug Logs for details.`,
        };
    }
    if (failed.length > 0) {
        return {
            level: 'warning',
            message: `Deleted ${deleted.length}, failed ${failed.length}: ${failed.map((f) => f.repo).join(', ')}`,
        };
    }
    const count = `Deleted ${deleted.length} repositor${deleted.length !== 1 ? 'ies' : 'y'}`;
    if (codeLeft.length > 0) {
        return { level: 'warning', message: `${count}. ${codeLeft.map((c) => `${c.repo}: ${c.summary}`).join(' ')}` };
    }
    return { level: 'success', message: count };
}

export async function manageGitHubReposCommand(context: vscode.ExtensionContext): Promise<void> {
    const logger = getLogger();

    try {
        // Step 1: Check GitHub authentication
        const { getGitHubServices, tryCreateDaLiveTokenProvider } = await import('@/features/eds/handlers/edsHelpers');

        // getGitHubServices' parameter is narrowed to the one field it reads,
        // so a command without a full HandlerContext calls it without a cast.
        const { tokenService, repoOperations, repoLifecycle, fileOperations } = getGitHubServices(context.secrets);

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
                const session = await vscode.authentication.getSession(
                    'github',
                    ['repo', 'delete_repo'],
                    {
                        createIfNone: true,
                    },
                );

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

        // Step 2: Load ALL user repositories from GitHub API + Demo Builder linkage info
        const stateManager = ServiceLocator.getStateManager();
        if (!stateManager) {
            vscode.window.showErrorMessage('Extension not fully initialized. Please try again.');
            return;
        }

        let allRepos: Array<{ fullName: string }> = [];
        const repoToProjectMap = new Map<string, string[]>();

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Loading GitHub repositories',
                cancellable: false,
            },
            async () => {
                try {
                    // Fetch ALL repositories from GitHub API
                    allRepos = await repoOperations.listUserRepositories();
                    logger.debug(`[GitHub Manage] Found ${allRepos.length} GitHub repositories`);

                    // Also load Demo Builder projects to show linkage info
                    const edsProjects = await getLinkedEdsProjects(stateManager);
                    logger.debug(`[GitHub Manage] Found ${edsProjects.length} linked EDS projects`);

                    // Build map of repo -> projects (for linkage display only)
                    for (const project of edsProjects) {
                        if (project.metadata.githubRepo) {
                            const repo = project.metadata.githubRepo;
                            const projects = repoToProjectMap.get(repo) || [];
                            projects.push(project.name);
                            repoToProjectMap.set(repo, projects);
                        }
                    }
                } catch (error) {
                    logger.error('[GitHub Manage] Failed to load repositories:', error as Error);
                    throw error;
                }
            },
        );

        if (allRepos.length === 0) {
            vscode.window.showInformationMessage('No GitHub repositories found for your account.');
            return;
        }

        // Step 3: Create QuickPick items from ALL repos
        const quickPickItems: RepoQuickPickItem[] = allRepos.map((repo) => {
            const linkedProjects = repoToProjectMap.get(repo.fullName) || [];
            return {
                label: `$(repo) ${repo.fullName}`,
                description:
                    linkedProjects.length > 0
                        ? `Linked to: ${linkedProjects.join(', ')}`
                        : undefined,
                repoFullName: repo.fullName,
                linkedProject: linkedProjects[0],
            };
        });

        // Step 4: Show multi-select QuickPick
        const selectedItems = await vscode.window.showQuickPick(quickPickItems, {
            canPickMany: true,
            placeHolder: `Select repositories to delete (${allRepos.length} total)`,
            title: 'Manage GitHub Repositories',
            matchOnDescription: true,
        });

        if (!selectedItems || selectedItems.length === 0) {
            return; // User cancelled or selected nothing
        }

        // Step 5: Confirm deletion with strong warning
        const reposToDelete = selectedItems.map((item) => item.repoFullName);
        const confirmMessage =
            reposToDelete.length === 1
                ? `Delete repository "${reposToDelete[0]}"?`
                : `Delete ${reposToDelete.length} repositories?`;

        const confirmDetail =
            'WARNING: This will permanently delete the selected repositories from GitHub. ' +
            'All code, issues, pull requests, and releases will be lost. ' +
            "A storefront's code on aem.live is removed with its repository. " +
            'This action cannot be undone.';

        const confirmed = await vscode.window.showWarningMessage(
            confirmMessage,
            { modal: true, detail: confirmDetail },
            'Delete Permanently',
        );

        if (confirmed !== 'Delete Permanently') {
            return; // User cancelled
        }

        // Step 6: Delete selected repositories, and a storefront's code on aem.live
        // after each (EDS-67): the DA.live session, read without asking, removes it.
        const tokenProvider = tryCreateDaLiveTokenProvider(context);
        const outcome = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Deleting repositories',
                cancellable: false,
            },
            (progress) =>
                deleteGitHubRepos(reposToDelete, {
                    logger,
                    deleteRepository: (owner, repo) =>
                        deleteStorefrontRepository(
                            { owner, repo },
                            {
                                files: fileOperations,
                                deleteRepository: (o, r) => repoLifecycle.deleteRepository(o, r),
                                tokenProvider,
                                logger,
                            },
                        ),
                    // Which repository; how many is a count, never a position (handbook, progress).
                    onRepo: (repo) => progress.report({ message: repo, increment: 100 / reposToDelete.length }),
                }),
        );

        // Step 7: Show results. A success says so as every success does: a ✅ line that
        // goes by itself (owner, 2026-10-15). The other outcomes stay messages that wait.
        const told = describeRepoOutcome(outcome);
        if (told.level === 'success') showSuccessInStatusBar(told.message);
        else if (told.level === 'warning') vscode.window.showWarningMessage(told.message);
        else vscode.window.showErrorMessage(told.message);

        logger.info(
            `[GitHub Manage] Complete - Deleted: ${outcome.deleted.length}, Failed: ${outcome.failed.length}, ` +
                `kept: ${outcome.kept.length}, code left on aem.live: ${outcome.codeLeft.length}`,
        );
    } catch (error) {
        logger.error('[GitHub Manage Command] Error:', error as Error);
        vscode.window.showErrorMessage(
            `Failed to manage GitHub repositories: ${(error as Error).message}`,
        );
    }
}
