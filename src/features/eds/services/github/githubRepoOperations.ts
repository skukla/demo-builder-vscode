/**
 * GitHub Repository Operations — the reads.
 *
 * What GitHub says about repositories the SC can see: one repository by name,
 * whether the SC can push to it, and the list the repository picker shows (with
 * the single-sign-on gap GitHub only reports in a header, EDS-17).
 *
 * Until 2026-10-08 this file also created, flagged, polled, deleted and archived
 * repositories, and carried a `git clone` nothing called. EDS-8 split it by job:
 * the writes and the readiness poll are `githubRepoLifecycle.ts`; the clone was
 * deleted with the CommandExecutor the constructor took only for it.
 *
 * @module features/eds/services/github/githubRepoOperations
 */

import type {
    GitHubRepo,
    GitHubApiError,
} from '../types';
import { GitHubAuthenticatedOperations } from './githubAuthenticatedOperations';
import { explainOrgRefusal } from './githubOrgRefusal';
import { toGitHubRepo } from './githubRepoRecord';
import type { GitHubTokenService } from './githubTokenService';
import { getLogger } from '@/core/logging/debugLogger';
import type { Logger } from '@/types/logger';

/** GitHub API repository response shape (subset used by this module) */
interface GitHubApiRepoResponse {
    id: number;
    name: string;
    full_name: string;
    html_url: string;
    clone_url: string;
    default_branch: string;
    description: string | null;
    updated_at: string;
    private: boolean;
    permissions?: {
        push?: boolean;
        pull?: boolean;
        admin?: boolean;
    };
}

export class GitHubRepoOperations extends GitHubAuthenticatedOperations {
    private logger: Logger;

    constructor(tokenService: GitHubTokenService, logger?: Logger) {
        super(tokenService);
        this.logger = logger ?? getLogger();
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

            return toGitHubRepo(response.data);
        } catch (error) {
            const apiError = error as GitHubApiError;

            if (apiError.status === 404) {
                throw new Error('Repository not found');
            }

            if (apiError.status === 403) {
                throw new Error(explainOrgRefusal(error, owner) ?? 'Access denied to this repository');
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
                this.logger.debug(`[GitHub:ListRepos] Page ${page}: received ${repos.length} repos`);
                this.warnIfSsoHidRepos(response.headers);

                // Filter to only repos with push access and map to our type
                const mappedRepos = (repos as GitHubApiRepoResponse[])
                    .filter((repo) => repo.permissions?.push)
                    .map((repo) => ({
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

            return { hasAccess: true, repo: toGitHubRepo(response.data) };
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
                    error: explainOrgRefusal(error, owner) ?? 'Access denied to this repository',
                };
            }

            throw error;
        }
    }

    /**
     * GitHub leaves out the repositories of an organization whose single sign-on
     * this sign-in is not authorized for, and says so only in a header:
     * `X-GitHub-SSO: partial-results; organizations=<ids>` (docs.github.com/en/rest/
     * authentication/authenticating-to-the-rest-api, read 2026-10-04). EDS-17.
     */
    private warnIfSsoHidRepos(headers: Record<string, unknown> | undefined): void {
        const sso = headers?.['x-github-sso'];
        if (typeof sso === 'string' && sso.startsWith('partial-results')) {
            this.logger.warn(
                '[GitHub:ListRepos] Some organization repositories are hidden: those organizations ' +
                    `require single sign-on this GitHub sign-in is not authorized for (${sso})`,
            );
        }
    }
}
