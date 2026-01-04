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
import { injectTokenIntoUrl } from './githubHelpers';
import type { GitHubTokenService } from './githubTokenService';
import type {
    GitHubRepo,
    GitHubApiError,
} from './types';
import { getLogger } from '@/core/logging';
import type { Logger } from '@/types/logger';

/** GitHub API Repository response type for /user/repos endpoint */
interface GitHubApiRepo {
    id: number;
    name: string;
    full_name: string;
    html_url: string;
    clone_url: string;
    default_branch: string;
    description: string | null;
    updated_at: string | null;
    private: boolean;
    permissions?: {
        admin?: boolean;
        push?: boolean;
        pull?: boolean;
    };
}

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

                // Filter to only repos with push access and map to our type
                const mappedRepos = (repos as GitHubApiRepo[])
                    .filter((repo) => repo.permissions?.push)
                    .map((repo) => ({
                        id: repo.id,
                        name: repo.name,
                        fullName: repo.full_name,
                        htmlUrl: repo.html_url,
                        cloneUrl: repo.clone_url,
                        defaultBranch: repo.default_branch,
                        description: repo.description,
                        updatedAt: repo.updated_at ?? undefined,
                        isPrivate: repo.private,
                    }));

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

            return allRepos;
        } catch (error) {
            this.logger.error('[GitHub] Failed to list repositories', error as Error);
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
        await this.executeGitCommand(`git clone ${authedUrl}`, localPath);
    }

    /**
     * Execute a git command
     * @param command - Git command to execute
     * @param _cwd - Working directory (currently unused, placeholder for actual implementation)
     */
    private async executeGitCommand(command: string, _cwd: string): Promise<void> {
        const safeCommand = command.replace(/https:\/\/[^@]+@/g, 'https://***@');
        this.logger.debug(`[GitHub] Executing: ${safeCommand}`);
        // Note: Actual git execution is handled elsewhere in the codebase
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
     * Invalidate cached Octokit instance (call after token changes)
     */
    invalidateOctokit(): void {
        this.octokit = null;
    }
}
