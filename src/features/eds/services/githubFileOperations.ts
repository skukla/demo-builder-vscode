/**
 * GitHub File Operations
 *
 * Handles file operations for GitHub including:
 * - Getting file content from repositories
 * - Creating or updating files
 *
 * Extracted from GitHubService as part of god file split.
 */

import { Octokit } from '@octokit/core';
import { retry } from '@octokit/plugin-retry';
import { getLogger } from '@/core/logging';
import type { Logger } from '@/types/logger';
import type {
    GitHubFileContent,
    GitHubFileResult,
    GitHubApiError,
    GitHubTreeEntry,
} from './types';
import type { GitHubTokenService } from './githubTokenService';

/** Error messages for file operations */
const ERROR_MESSAGES = {
    NOT_AUTHENTICATED: 'Not authenticated',
} as const;

/**
 * GitHub File Operations Service
 */
export class GitHubFileOperations {
    private logger: Logger;
    private tokenService: GitHubTokenService;
    private octokit: InstanceType<typeof Octokit> | null = null;

    constructor(tokenService: GitHubTokenService, logger?: Logger) {
        this.tokenService = tokenService;
        this.logger = logger ?? getLogger();
    }

    /**
     * Get file content from repository
     * @param owner - Repository owner
     * @param repo - Repository name
     * @param path - File path
     * @param ref - Git ref (branch/tag/commit) - optional
     * @returns File content or null if not found
     */
    async getFileContent(
        owner: string,
        repo: string,
        path: string,
        ref?: string,
    ): Promise<GitHubFileContent | null> {
        const octokit = await this.ensureAuthenticated();

        try {
            const response = await octokit.request(
                'GET /repos/{owner}/{repo}/contents/{path}',
                {
                    owner,
                    repo,
                    path,
                    ...(ref && { ref }),
                },
            );

            const data = response.data as {
                content: string;
                sha: string;
                path: string;
                encoding: string;
            };

            // Decode base64 content
            const decodedContent = Buffer.from(data.content, 'base64').toString('utf-8');

            return {
                content: decodedContent,
                sha: data.sha,
                path: data.path,
                encoding: data.encoding,
            };
        } catch (error) {
            const apiError = error as GitHubApiError;

            if (apiError.status === 404) {
                return null;
            }

            throw error;
        }
    }

    /**
     * Create or update file in repository
     * @param owner - Repository owner
     * @param repo - Repository name
     * @param path - File path
     * @param content - File content (will be base64 encoded)
     * @param message - Commit message
     * @param sha - SHA of existing file (required for updates)
     * @returns Result with file and commit SHAs
     */
    async createOrUpdateFile(
        owner: string,
        repo: string,
        path: string,
        content: string,
        message: string,
        sha?: string,
    ): Promise<GitHubFileResult> {
        const octokit = await this.ensureAuthenticated();

        // Base64 encode content
        const encodedContent = Buffer.from(content).toString('base64');

        const response = await octokit.request(
            'PUT /repos/{owner}/{repo}/contents/{path}',
            {
                owner,
                repo,
                path,
                message,
                content: encodedContent,
                ...(sha && { sha }),
            },
        );

        return {
            sha: response.data.content?.sha ?? '',
            commitSha: response.data.commit?.sha ?? '',
        };
    }

    /**
     * List all files in a repository recursively
     * Uses the Git Trees API for efficient recursive listing
     * @param owner - Repository owner
     * @param repo - Repository name
     * @param branch - Branch to list (default: 'main')
     * @returns Array of file entries (excludes directories)
     */
    async listRepoFiles(
        owner: string,
        repo: string,
        branch = 'main',
    ): Promise<GitHubTreeEntry[]> {
        const octokit = await this.ensureAuthenticated();

        try {
            // First get the branch's latest commit SHA
            const branchResponse = await octokit.request('GET /repos/{owner}/{repo}/branches/{branch}', {
                owner,
                repo,
                branch,
            });

            const treeSha = branchResponse.data.commit.commit.tree.sha;

            // Get the tree recursively
            const treeResponse = await octokit.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
                owner,
                repo,
                tree_sha: treeSha,
                recursive: '1',
            });

            // Filter to only blobs (files), not trees (directories)
            return treeResponse.data.tree
                .filter((entry: { type: string }) => entry.type === 'blob')
                .map((entry: { path: string; type: string; sha: string; size?: number }) => ({
                    path: entry.path,
                    type: entry.type as 'blob' | 'tree',
                    sha: entry.sha,
                    size: entry.size,
                }));
        } catch (error) {
            const apiError = error as GitHubApiError;

            if (apiError.status === 404) {
                // Branch or repo doesn't exist
                return [];
            }

            throw error;
        }
    }

    /**
     * Delete a file from the repository
     * @param owner - Repository owner
     * @param repo - Repository name
     * @param path - File path
     * @param message - Commit message
     * @param sha - SHA of the file to delete (required)
     */
    async deleteFile(
        owner: string,
        repo: string,
        path: string,
        message: string,
        sha: string,
    ): Promise<void> {
        const octokit = await this.ensureAuthenticated();

        await octokit.request('DELETE /repos/{owner}/{repo}/contents/{path}', {
            owner,
            repo,
            path,
            message,
            sha,
        });

        this.logger.debug(`[GitHub] Deleted file: ${path}`);
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
