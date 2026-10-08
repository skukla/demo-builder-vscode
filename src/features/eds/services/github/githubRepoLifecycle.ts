/**
 * GitHub Repository Lifecycle — a repository Demo Builder makes.
 *
 * Bring it into being (generated from a template, or empty and reset onto a
 * source), turn its Actions off before anything is pushed, know when GitHub has
 * populated it, flag it as a template, and take it away again (delete or
 * archive). Every caller here either creates a repository or undoes one.
 *
 * Until 2026-10-08 these lived in `githubRepoOperations.ts` beside the reads
 * (one repository, the access check, the SC's list). EDS-8 split them by job:
 * the reads stay there, the writes and the readiness poll are here.
 *
 * @module features/eds/services/github/githubRepoLifecycle
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
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/** Error messages for repository creation */
const ERROR_MESSAGES = {
    REPO_EXISTS: 'Repository name already exists',
} as const;

export class GitHubRepoLifecycle extends GitHubAuthenticatedOperations {
    private logger: Logger;

    constructor(tokenService: GitHubTokenService, logger?: Logger) {
        super(tokenService);
        this.logger = logger ?? getLogger();
    }

    /**
     * Create repository from template
     * @param templateOwner - Owner of template repository
     * @param templateRepo - Name of template repository
     * @param newRepoName - Name for new repository
     * @param isPrivate - Whether new repo should be private (default: false)
     * @param targetOwner - Namespace to create the repo under (personal user or
     *   team org). When omitted, GitHub creates under the authenticated user.
     * @returns Created repository info
     */
    async createFromTemplate(
        templateOwner: string,
        templateRepo: string,
        newRepoName: string,
        isPrivate = false,
        targetOwner?: string,
    ): Promise<GitHubRepo> {
        const octokit = await this.ensureAuthenticated();

        try {
            // GitHub's template-generate endpoint creates under the authenticated
            // user by default. Pass `owner` to target a different namespace
            // (team org). The caller is the wizard's namespace picker — when
            // the user picked their personal account, targetOwner can be their
            // own login or undefined; both create under the authenticated user.
            const response = await octokit.request(
                'POST /repos/{template_owner}/{template_repo}/generate',
                {
                    template_owner: templateOwner,
                    template_repo: templateRepo,
                    name: newRepoName,
                    private: isPrivate,
                    ...(targetOwner ? { owner: targetOwner } : {}),
                },
            );

            const created = {
                id: response.data.id,
                name: response.data.name,
                fullName: response.data.full_name,
                htmlUrl: response.data.html_url,
                cloneUrl: response.data.clone_url,
                defaultBranch: response.data.default_branch,
            };
            await this.turnOffActions(created.fullName);
            return created;
        } catch (error) {
            const apiError = error as GitHubApiError & {
                errors?: Array<{ message: string }>;
            };
            const orgRefusal = explainOrgRefusal(error, targetOwner ?? templateOwner);
            if (orgRefusal) throw new Error(orgRefusal);

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
     * Create an EMPTY repository (initialised with one commit, so it has a
     * default branch to reset onto): the new-repo path for a demo whose source
     * is not a GitHub template, where `generate` is refused. Under the target
     * namespace when given, else the authenticated user.
     */
    async createEmptyRepository(
        newRepoName: string,
        isPrivate = false,
        targetOwner?: string,
    ): Promise<GitHubRepo> {
        const octokit = await this.ensureAuthenticated();
        const body = { name: newRepoName, private: isPrivate, auto_init: true };
        let created: GitHubRepo;
        try {
            const response = targetOwner
                ? await octokit.request('POST /orgs/{org}/repos', { org: targetOwner, ...body })
                : await octokit.request('POST /user/repos', body);
            created = toGitHubRepo(response.data);
        } catch (error) {
            const apiError = error as GitHubApiError & { errors?: Array<{ message: string }> };
            const orgRefusal = targetOwner ? explainOrgRefusal(error, targetOwner) : undefined;
            if (orgRefusal) throw new Error(orgRefusal);
            if (apiError.status === 422 && apiError.errors?.some((e) => e.message.includes('already exists'))) {
                throw new Error(ERROR_MESSAGES.REPO_EXISTS);
            }
            if (apiError.status === 404 && targetOwner) {
                // GitHub answers 404 for an org the user cannot create in; a personal
                // account is never an org, so fall back to the user's own namespace.
                const response = await octokit.request('POST /user/repos', body);
                created = toGitHubRepo(response.data);
            } else {
                throw error;
            }
        }
        await this.turnOffActions(created.fullName);
        return created;
    }

    /**
     * Turn GitHub Actions off on a repository Demo Builder just created, before
     * anything is pushed to it (owner, 2026-09-15). A storefront carries its
     * author's workflows, and setup and reset push a commit per file, so they ran
     * over and over and mailed the SC a failure each time (18 in one test). The
     * workflow files stay; the SC can turn Actions back on in the repository's
     * settings. Best effort: a refusal is logged and never fails the creation.
     */
    private async turnOffActions(fullName: string): Promise<void> {
        const [owner, repo] = fullName.split('/');
        try {
            const octokit = await this.ensureAuthenticated();
            await octokit.request('PUT /repos/{owner}/{repo}/actions/permissions', { owner, repo, enabled: false });
            this.logger.debug(`[GitHub] Turned off GitHub Actions on ${fullName}`);
        } catch (error) {
            this.logger.warn(
                `[GitHub] Could not turn off GitHub Actions on ${fullName}: ${(error as Error).message}. ` +
                    'Its workflows will run on every push; turn Actions off in the repository settings.',
            );
        }
    }

    /**
     * Mark a repository we own as a GitHub template, so `generate` works from
     * it. Used on the repository a zip import creates.
     */
    async setTemplateFlag(owner: string, repo: string, isTemplate = true): Promise<void> {
        const octokit = await this.ensureAuthenticated();
        await octokit.request('PATCH /repos/{owner}/{repo}', {
            owner,
            repo,
            is_template: isTemplate,
        });
        this.logger.debug(`[GitHub] Repository ${owner}/${repo} template flag set to ${isTemplate}`);
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
        this.logger.debug(`[GitHub] Waiting for repository ${owner}/${repo} to have content`);

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

            const orgRefusal = explainOrgRefusal(error, owner);
            if (orgRefusal) throw new Error(orgRefusal);
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
}
