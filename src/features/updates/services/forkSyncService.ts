/**
 * Fork Sync Service
 *
 * Checks whether a GitHub repository is a fork and how far behind
 * its upstream parent it is. Provides sync capability via the
 * merge-upstream API.
 *
 * Follows the same patterns as TemplateUpdateChecker:
 * - Constructor takes (secrets, logger)
 * - Uses fetch with AbortController + timeout
 * - Returns null on errors (graceful degradation)
 */

import * as vscode from 'vscode';
import {
    GITHUB_API_BASE,
    buildGitHubHeaders,
    compareCommits,
    fetchWithTimeout,
} from './githubApiClient';
import type { Logger } from '@/types/logger';

export interface ForkStatus {
    isFork: boolean;
    behindBy: number;
    parentFullName?: string;
    defaultBranch?: string;
}

export interface ForkSyncResult {
    success: boolean;
    conflict?: boolean;
    message: string;
}

export class ForkSyncService {
    private secrets: vscode.SecretStorage;
    private logger: Logger;

    constructor(secrets: vscode.SecretStorage, logger: Logger) {
        this.secrets = secrets;
        this.logger = logger;
    }

    /**
     * Check fork status for a repository, including how far behind upstream it is.
     *
     * @returns ForkStatus or null on error
     */
    async checkForkStatus(owner: string, repo: string): Promise<ForkStatus | null> {
        try {
            const headers = await buildGitHubHeaders(this.secrets);

            // Fetch repo metadata
            const repoResponse = await fetchWithTimeout(
                `${GITHUB_API_BASE}/repos/${owner}/${repo}`,
                { headers },
            );

            if (!repoResponse.ok) {
                if (repoResponse.status === 404) {
                    this.logger.debug(`[Updates] Resource not found: /repos/${owner}/${repo}`);
                }
                return null;
            }

            const repoData = await repoResponse.json() as GitHubRepoResponse;

            if (!repoData.fork) {
                this.logger.debug(`[Updates] ${owner}/${repo} is not a fork — skipping`);
                return { isFork: false, behindBy: 0 };
            }

            this.logger.debug(`[Updates] ${owner}/${repo} is a fork of ${repoData.parent?.full_name}`);

            const parentFullName = repoData.parent?.full_name;
            const defaultBranch = repoData.default_branch;
            const parentBranch = repoData.parent?.default_branch ?? defaultBranch;

            // Compare fork with upstream
            const compareData = await compareCommits(
                this.secrets, owner, repo,
                defaultBranch, `${parentFullName}:${parentBranch}`,
            );

            if (!compareData) {
                return null;
            }

            this.logger.debug(
                `[Updates] ${owner}/${repo}: ${compareData.ahead_by} commit(s) behind upstream`,
            );

            return {
                isFork: true,
                behindBy: compareData.ahead_by,
                parentFullName,
                defaultBranch,
            };
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                this.logger.warn(`[Updates] Timeout checking fork status for ${owner}/${repo}`);
            } else {
                this.logger.error(`[Updates] Failed to check fork status for ${owner}/${repo}`, error as Error);
            }
            return null;
        }
    }

    /**
     * Sync fork with upstream via GitHub merge-upstream API.
     *
     * @throws Error on 403 (rate limit or insufficient permissions)
     */
    async syncFork(owner: string, repo: string, branch: string): Promise<ForkSyncResult> {
        const headers = await buildGitHubHeaders(this.secrets);
        const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/merge-upstream`;

        const response = await fetchWithTimeout(url, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ branch }),
        });

        if (response.ok) {
            const data = await response.json();
            return {
                success: true,
                message: data.message ?? 'Fork synced successfully',
            };
        }

        if (response.status === 409) {
            return {
                success: false,
                conflict: true,
                message: 'Fork has diverged from upstream and cannot be fast-forwarded',
            };
        }

        if (response.status === 403) {
            const body = await response.json().catch(() => ({}));
            const message = (body as Record<string, unknown>)?.message ?? '';
            if (typeof message === 'string' && message.toLowerCase().includes('rate limit')) {
                throw new Error('GitHub API rate limit exceeded. Please try again later.');
            }
            throw new Error(
                'GitHub API permission denied. Ensure your token has push access to this fork.',
            );
        }

        throw new Error(`GitHub API error: HTTP ${response.status}`);
    }
}

interface GitHubRepoResponse {
    fork: boolean;
    default_branch: string;
    parent?: {
        full_name: string;
        default_branch: string;
    };
}
