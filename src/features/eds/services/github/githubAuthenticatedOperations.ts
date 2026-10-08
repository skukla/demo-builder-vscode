/**
 * The authenticated Octokit the GitHub operations classes request through.
 *
 * One client per instance: built from the token service on the first request and
 * reused until `invalidateOctokit` drops it. `GitHubFileOperations`,
 * `GitHubTreeCommits` and `GitHubRepoOperations` extend this rather than each
 * carrying the same ten lines — the file and repository classes did carry them
 * verbatim until the 2026-10-08 split (a pinned clone pair), and a third copy for
 * the tree commits would have made it three.
 *
 * @module features/eds/services/github/githubAuthenticatedOperations
 */

import { Octokit } from '@octokit/core';
import { createAuthenticatedOctokit, ERROR_MESSAGES } from './githubHelpers';
import type { GitHubTokenService } from './githubTokenService';

export abstract class GitHubAuthenticatedOperations {
    protected tokenService: GitHubTokenService;
    private octokit: InstanceType<typeof Octokit> | null = null;

    protected constructor(tokenService: GitHubTokenService) {
        this.tokenService = tokenService;
    }

    /**
     * Ensure we have an authenticated Octokit instance
     */
    protected async ensureAuthenticated(): Promise<InstanceType<typeof Octokit>> {
        const token = await this.tokenService.getToken();
        if (!token) {
            throw new Error(ERROR_MESSAGES.NOT_AUTHENTICATED);
        }

        if (!this.octokit) {
            this.octokit = createAuthenticatedOctokit(token.token);
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
