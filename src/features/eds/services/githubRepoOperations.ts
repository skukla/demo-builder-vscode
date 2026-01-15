/**
 * GitHub Repository Operations
 *
 * Handles repository operations for GitHub including:
 * - Creating repositories from templates
 * - Listing user repositories
 * - Checking repository access
 * - Deleting/archiving repositories
 *
 * Extracted from GitHubService as part of god file split.
 */

import { Octokit } from '@octokit/core';
import { retry } from '@octokit/plugin-retry';
import * as path from 'path';
import { getLogger } from '@/core/logging';
import { ServiceLocator } from '@/core/di';
import { TIMEOUTS } from '@/core/utils';
import { DEFAULT_SHELL } from '@/types/shell';
import type { Logger } from '@/types/logger';
import type {
    GitHubRepo,
    GitHubApiError,
} from './types';
import type { GitHubTokenService } from './githubTokenService';
import { injectTokenIntoUrl } from './githubHelpers';

/** Error messages for repository operations */
const ERROR_MESSAGES = {
    NOT_AUTHENTICATED: 'Not authenticated',
    REPO_EXISTS: 'Repository name already exists',
} as const;

/**
 * GitHub Repository Operations Service
 */
export class GitHubRepoOperations {
    private logger: Logger;
    private tokenService: GitHubTokenService;
    private octokit: InstanceType<typeof Octokit> | null = null;

    constructor(tokenService: GitHubTokenService, logger?: Logger) {
        this.tokenService = tokenService;
        this.logger = logger ?? getLogger();
    }

    /**
     * Create repository from template
     * @param templateOwner - Owner of template repository
     * @param templateRepo - Name of template repository
     * @param newRepoName - Name for new repository
     * @param isPrivate - Whether new repo should be private (default: false)
     * @returns Created repository info
     */
    async createFromTemplate(
        templateOwner: string,
        templateRepo: string,
        newRepoName: string,
        isPrivate = false,
    ): Promise<GitHubRepo> {
        const octokit = await this.ensureAuthenticated();

        try {
            const response = await octokit.request(
                'POST /repos/{template_owner}/{template_repo}/generate',
                {
                    template_owner: templateOwner,
                    template_repo: templateRepo,
                    name: newRepoName,
                    private: isPrivate,
                },
            );

            return {
                id: response.data.id,
                name: response.data.name,
                fullName: response.data.full_name,
                htmlUrl: response.data.html_url,
                cloneUrl: response.data.clone_url,
                defaultBranch: response.data.default_branch,
            };
        } catch (error) {
            const apiError = error as GitHubApiError & {
                errors?: Array<{ message: string }>;
            };

            if (apiError.status === 422) {
                const nameError = apiError.errors?.find(e =>
                    e.message.includes('name already exists'),
                );
                if (nameError) {
                    throw new Error(ERROR_MESSAGES.REPO_EXISTS);
                }
            }

            throw error;
        }
    }

    /**
     * Get repository information
     * @param owner - Repository owner
     * @param repo - Repository name
     * @returns Repository information
     */
    async getRepository(owner: string, repo: string): Promise<GitHubRepo> {
        const octokit = await this.ensureAuthenticated();

        try {
            const response = await octokit.request('GET /repos/{owner}/{repo}', {
                owner,
                repo,
            });

            return {
                id: response.data.id,
                name: response.data.name,
                fullName: response.data.full_name,
                htmlUrl: response.data.html_url,
                cloneUrl: response.data.clone_url,
                defaultBranch: response.data.default_branch,
            };
        } catch (error) {
            const apiError = error as GitHubApiError;

            if (apiError.status === 404) {
                throw new Error('Repository not found');
            }

            if (apiError.status === 403) {
                throw new Error('Access denied to this repository');
            }

            throw error;
        }
    }

    /**
     * Check if repository has content (not empty)
     * Used to verify template population completed before cloning
     * 
     * @param owner - Repository owner
     * @param repo - Repository name
     * @param branch - Branch to check (default: 'main')
     * @returns True if repository has files, false if empty
     */
    async hasContent(owner: string, repo: string, branch = 'main'): Promise<boolean> {
        const octokit = await this.ensureAuthenticated();

        try {
            // Check if repository root has any files
            const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
                owner,
                repo,
                path: '',
                ref: branch,
            });

            // If we get a response with data, the repository has content
            return Array.isArray(response.data) && response.data.length > 0;
        } catch (error) {
            const apiError = error as GitHubApiError;
            
            // 404 means the branch/content doesn't exist yet (empty repo)
            if (apiError.status === 404) {
                this.logger.debug(`[GitHub] Repository ${owner}/${repo} is empty or branch doesn't exist yet`);
                return false;
            }

            // Other errors should be thrown
            throw error;
        }
    }

    /**
     * Wait for repository to have content after template creation
     * Uses PollingService for proper backoff, rate limiting, and timeout handling
     * 
     * @param owner - Repository owner
     * @param repo - Repository name
     * @param abortSignal - Optional abort signal to cancel polling
     * @returns True if repository has content within timeout
     */
    async waitForContent(owner: string, repo: string, abortSignal?: AbortSignal): Promise<boolean> {
        this.logger.debug(`[GitHub] Waiting for repository ${owner}/${repo} to have content...`);

        const { PollingService } = await import('@/core/shell/pollingService');
        const pollingService = new PollingService();

        try {
            await pollingService.pollUntilCondition(
                async () => {
                    try {
                        return await this.hasContent(owner, repo);
                    } catch (error) {
                        // Log but don't throw - let polling continue
                        this.logger.debug(`[GitHub] Content check error: ${(error as Error).message}`);
                        return false;
                    }
                },
                {
                    name: `github-repo-${owner}/${repo}`,
                    maxAttempts: 10,
                    initialDelay: TIMEOUTS.POLL.INTERVAL,
                    maxDelay: TIMEOUTS.POLL.MAX,
                    timeout: TIMEOUTS.NORMAL, // 30 seconds total
                    abortSignal,
                },
            );

            this.logger.debug(`[GitHub] Repository ${owner}/${repo} has content`);
            return true;
        } catch (error) {
            // Polling failed (timeout or max attempts)
            this.logger.warn(`[GitHub] Repository ${owner}/${repo} content check failed: ${(error as Error).message}`);
            return false;
        }
    }

    /**
     * List repositories accessible to the authenticated user
     * @returns Array of repositories with write access
     */
    async listUserRepositories(): Promise<GitHubRepo[]> {
        const octokit = await this.ensureAuthenticated();

        try {
            const allRepos: GitHubRepo[] = [];
            let page = 1;
            const perPage = 100;

            while (true) {
                const response = await octokit.request('GET /user/repos', {
                    sort: 'updated',
                    direction: 'desc',
                    per_page: perPage,
                    page,
                    affiliation: 'owner,collaborator',
                });

                const repos = response.data;
                this.logger.debug(`[GitHub:ListRepos] Page ${page}: received ${repos.length} repos`);

                // Filter to only repos with push access and map to our type
                const mappedRepos = repos
                    .filter((repo: any) => repo.permissions?.push)
                    .map((repo: any) => ({
                        id: repo.id,
                        name: repo.name,
                        fullName: repo.full_name,
                        htmlUrl: repo.html_url,
                        cloneUrl: repo.clone_url,
                        defaultBranch: repo.default_branch,
                        description: repo.description,
                        updatedAt: repo.updated_at,
                        isPrivate: repo.private,
                    }));

                const filteredOut = repos.length - mappedRepos.length;
                if (filteredOut > 0) {
                    this.logger.debug(`[GitHub:ListRepos] Page ${page}: filtered out ${filteredOut} repos (no push access)`);
                }

                allRepos.push(...mappedRepos);

                // If we got fewer repos than perPage, we've reached the end
                if (repos.length < perPage) {
                    break;
                }

                page++;

                // Safety limit: don't fetch more than 10 pages (1000 repos)
                if (page > 10) {
                    this.logger.warn('[GitHub] Reached pagination limit (1000 repos)');
                    break;
                }
            }

            this.logger.debug(`[GitHub:ListRepos] Total repos returned: ${allRepos.length}`);
            return allRepos;
        } catch (error) {
            const apiError = error as GitHubApiError;
            this.logger.error('[GitHub:ListRepos] Failed to list repositories', error as Error);
            this.logger.debug(`[GitHub:ListRepos] Error status: ${apiError.status}, message: ${(error as Error).message}`);
            throw new Error(`Failed to list repositories: ${(error as Error).message}`);
        }
    }

    /**
     * Check if user has access to a repository
     * @param owner - Repository owner
     * @param repo - Repository name
     * @returns Object with hasAccess boolean and optional repo info or error
     */
    async checkRepositoryAccess(
        owner: string,
        repo: string,
    ): Promise<{ hasAccess: boolean; repo?: GitHubRepo; error?: string }> {
        const octokit = await this.ensureAuthenticated();

        try {
            const response = await octokit.request('GET /repos/{owner}/{repo}', {
                owner,
                repo,
            });

            // Check if user has push access (needed for EDS operations)
            const permissions = response.data.permissions as { push?: boolean } | undefined;
            const hasPushAccess = permissions?.push ?? false;

            if (!hasPushAccess) {
                return {
                    hasAccess: false,
                    error: 'You need write access to this repository',
                };
            }

            return {
                hasAccess: true,
                repo: {
                    id: response.data.id,
                    name: response.data.name,
                    fullName: response.data.full_name,
                    htmlUrl: response.data.html_url,
                    cloneUrl: response.data.clone_url,
                    defaultBranch: response.data.default_branch,
                },
            };
        } catch (error) {
            const apiError = error as GitHubApiError;

            if (apiError.status === 404) {
                return {
                    hasAccess: false,
                    error: 'Repository not found',
                };
            }

            if (apiError.status === 403) {
                return {
                    hasAccess: false,
                    error: 'Access denied to this repository',
                };
            }

            throw error;
        }
    }

    /**
     * Delete a repository
     * @param owner - Repository owner
     * @param repo - Repository name
     */
    async deleteRepository(owner: string, repo: string): Promise<void> {
        const octokit = await this.ensureAuthenticated();

        try {
            await octokit.request('DELETE /repos/{owner}/{repo}', {
                owner,
                repo,
            });

            this.logger.debug(`[GitHub] Repository ${owner}/${repo} deleted`);
        } catch (error) {
            const apiError = error as GitHubApiError;

            if (apiError.status === 403) {
                throw new Error(
                    `Cannot delete repository: missing delete_repo scope. ` +
                    `Please re-authenticate with the delete_repo permission.`,
                );
            }

            throw error;
        }
    }

    /**
     * Archive a repository
     * @param owner - Repository owner
     * @param repo - Repository name
     */
    async archiveRepository(owner: string, repo: string): Promise<void> {
        const octokit = await this.ensureAuthenticated();

        await octokit.request('PATCH /repos/{owner}/{repo}', {
            owner,
            repo,
            archived: true,
        });

        this.logger.debug(`[GitHub] Repository ${owner}/${repo} archived`);
    }

    /**
     * Clone repository to local path
     * @param repoUrl - Repository clone URL
     * @param localPath - Local path to clone to
     */
    async cloneRepository(repoUrl: string, localPath: string): Promise<void> {
        const token = await this.tokenService.getToken();
        if (!token) {
            throw new Error(ERROR_MESSAGES.NOT_AUTHENTICATED);
        }

        const authedUrl = injectTokenIntoUrl(repoUrl, token.token);

        // Clone to a temp name first (git clone creates the target folder)
        // localPath is where we want the repo files to end up
        const cloneCommand = `git clone "${authedUrl}" "${localPath}"`;

        // Log safely (hide token)
        const safeCommand = cloneCommand.replace(/https:\/\/[^@]+@/g, 'https://***@');
        this.logger.debug(`[GitHub] Cloning repository to ${localPath}`);
        this.logger.trace(`[GitHub] Executing: ${safeCommand}`);

        const commandManager = ServiceLocator.getCommandExecutor();

        // Clone from the parent directory of localPath
        const parentDir = path.dirname(localPath);

        const result = await commandManager.execute(cloneCommand, {
            timeout: TIMEOUTS.LONG,
            enhancePath: true,
            shell: DEFAULT_SHELL,
            cwd: parentDir,
        });

        if (result.code !== 0) {
            this.logger.error(`[GitHub] Git clone failed`);
            this.logger.debug(`[GitHub] Clone stderr: ${result.stderr}`);
            throw new Error(`Git clone failed: ${result.stderr}`);
        }

        this.logger.debug(`[GitHub] Clone completed successfully`);
    }

    /**
     * Ensure we have an authenticated Octokit instance
     */
    private async ensureAuthenticated(): Promise<InstanceType<typeof Octokit>> {
        const token = await this.tokenService.getToken();
        if (!token) {
            throw new Error(ERROR_MESSAGES.NOT_AUTHENTICATED);
        }

        if (!this.octokit) {
            const OctokitWithRetry = Octokit.plugin(retry);
            this.octokit = new OctokitWithRetry({
                auth: token.token,
            });
        }

        return this.octokit;
    }

    /**
     * Reset repository to match a template repository
     *
     * Uses Git Data API to atomically replace the repo's tree with the template's tree.
     * This is much faster than copying files one-by-one (~4 API calls vs 4000+).
     *
     * @param owner - User's repository owner
     * @param repo - User's repository name
     * @param templateOwner - Template repository owner
     * @param templateRepo - Template repository name
     * @param branch - Branch to reset (default: 'main')
     * @param commitMessage - Commit message for the reset
     * @returns Commit SHA of the reset commit
     */
    async resetToTemplate(
        owner: string,
        repo: string,
        templateOwner: string,
        templateRepo: string,
        branch = 'main',
        commitMessage = 'chore: reset to template',
    ): Promise<{ commitSha: string }> {
        const octokit = await this.ensureAuthenticated();

        this.logger.info(`[GitHub] Resetting ${owner}/${repo} to template ${templateOwner}/${templateRepo}`);

        // Step 1: Get template repo's tree SHA from HEAD commit
        this.logger.debug(`[GitHub] Getting template tree SHA...`);
        const templateBranch = await octokit.request('GET /repos/{owner}/{repo}/branches/{branch}', {
            owner: templateOwner,
            repo: templateRepo,
            branch,
        });
        const templateTreeSha = templateBranch.data.commit.commit.tree.sha;
        this.logger.debug(`[GitHub] Template tree SHA: ${templateTreeSha}`);

        // Step 2: Get user repo's current HEAD commit SHA (to use as parent)
        this.logger.debug(`[GitHub] Getting user repo HEAD...`);
        const userBranch = await octokit.request('GET /repos/{owner}/{repo}/branches/{branch}', {
            owner,
            repo,
            branch,
        });
        const userHeadSha = userBranch.data.commit.sha;
        this.logger.debug(`[GitHub] User HEAD SHA: ${userHeadSha}`);

        // Step 3: Create a new commit with template's tree and user's HEAD as parent
        this.logger.debug(`[GitHub] Creating reset commit...`);
        const newCommit = await octokit.request('POST /repos/{owner}/{repo}/git/commits', {
            owner,
            repo,
            message: commitMessage,
            tree: templateTreeSha,
            parents: [userHeadSha],
        });
        const newCommitSha = newCommit.data.sha;
        this.logger.debug(`[GitHub] New commit SHA: ${newCommitSha}`);

        // Step 4: Update branch to point to new commit
        this.logger.debug(`[GitHub] Updating branch ref...`);
        await octokit.request('PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}', {
            owner,
            repo,
            branch,
            sha: newCommitSha,
            force: true, // Required since we're changing the tree
        });

        this.logger.info(`[GitHub] Reset complete - ${owner}/${repo} now matches template`);

        return { commitSha: newCommitSha };
    }

    /**
     * Invalidate cached Octokit instance (call after token changes)
     */
    invalidateOctokit(): void {
        this.octokit = null;
    }
}
