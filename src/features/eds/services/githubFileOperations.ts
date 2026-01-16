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

    // =========================================================================
    // BULK TREE OPERATIONS - For efficient repo-wide operations like Reset
    // =========================================================================

    /**
     * Get the tree SHA for a branch
     * @param owner - Repository owner
     * @param repo - Repository name
     * @param branch - Branch name (default: 'main')
     * @returns Object with tree SHA and commit SHA
     */
    async getBranchInfo(
        owner: string,
        repo: string,
        branch = 'main',
    ): Promise<{ treeSha: string; commitSha: string }> {
        const octokit = await this.ensureAuthenticated();

        const branchResponse = await octokit.request('GET /repos/{owner}/{repo}/branches/{branch}', {
            owner,
            repo,
            branch,
        });

        return {
            treeSha: branchResponse.data.commit.commit.tree.sha,
            commitSha: branchResponse.data.commit.sha,
        };
    }

    /**
     * Create a new tree in the repository
     *
     * This is the key method for bulk operations. It allows creating a tree
     * that references existing blob SHAs (from any repo) plus new content.
     *
     * @param owner - Repository owner
     * @param repo - Repository name
     * @param treeEntries - Array of tree entries to create
     * @returns The SHA of the created tree
     */
    async createTree(
        owner: string,
        repo: string,
        treeEntries: Array<{
            path: string;
            mode: '100644' | '100755' | '040000' | '160000' | '120000';
            type: 'blob' | 'tree' | 'commit';
            sha?: string;      // Use existing blob SHA
            content?: string;  // Or provide content for new blob
        }>,
    ): Promise<string> {
        const octokit = await this.ensureAuthenticated();

        const response = await octokit.request('POST /repos/{owner}/{repo}/git/trees', {
            owner,
            repo,
            tree: treeEntries,
        });

        return response.data.sha;
    }

    /**
     * Create a commit pointing to a tree
     * @param owner - Repository owner
     * @param repo - Repository name
     * @param message - Commit message
     * @param treeSha - SHA of the tree to commit
     * @param parentSha - SHA of the parent commit
     * @returns The SHA of the created commit
     */
    async createCommit(
        owner: string,
        repo: string,
        message: string,
        treeSha: string,
        parentSha: string,
    ): Promise<string> {
        const octokit = await this.ensureAuthenticated();

        const response = await octokit.request('POST /repos/{owner}/{repo}/git/commits', {
            owner,
            repo,
            message,
            tree: treeSha,
            parents: [parentSha],
        });

        return response.data.sha;
    }

    /**
     * Update a branch reference to point to a new commit
     * @param owner - Repository owner
     * @param repo - Repository name
     * @param branch - Branch name
     * @param sha - SHA of the commit to point to
     * @param force - Force update even if not fast-forward (default: true for reset)
     */
    async updateBranchRef(
        owner: string,
        repo: string,
        branch: string,
        sha: string,
        force = true,
    ): Promise<void> {
        const octokit = await this.ensureAuthenticated();

        await octokit.request('PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}', {
            owner,
            repo,
            branch,
            sha,
            force,
        });
    }

    /**
     * Reset a repository to match a template using bulk tree operations
     *
     * This is MUCH faster than file-by-file copying because it:
     * 1. Gets template tree (1 API call)
     * 2. Creates new tree referencing template blobs (1 API call)
     * 3. Creates commit (1 API call)
     * 4. Updates branch (1 API call)
     *
     * Total: 4 API calls instead of 2*N for N files
     *
     * @param templateOwner - Template repo owner
     * @param templateRepo - Template repo name
     * @param targetOwner - Target repo owner
     * @param targetRepo - Target repo name
     * @param fileOverrides - Map of path -> content for files to override (e.g., fstab.yaml)
     * @param branch - Branch to reset (default: 'main')
     * @returns Object with commit SHA and file counts
     */
    async resetRepoToTemplate(
        templateOwner: string,
        templateRepo: string,
        targetOwner: string,
        targetRepo: string,
        fileOverrides: Map<string, string>,
        branch = 'main',
    ): Promise<{ commitSha: string; fileCount: number }> {
        this.logger.info(`[GitHub] Resetting ${targetOwner}/${targetRepo} to template ${templateOwner}/${templateRepo}`);

        // Step 1: Get template tree (all files with blob SHAs)
        const templateFiles = await this.listRepoFiles(templateOwner, templateRepo, branch);
        this.logger.info(`[GitHub] Template has ${templateFiles.length} files`);

        // Step 2: Get target branch info (need current commit as parent)
        const targetBranchInfo = await this.getBranchInfo(targetOwner, targetRepo, branch);
        this.logger.info(`[GitHub] Target branch commit: ${targetBranchInfo.commitSha.substring(0, 7)}`);

        // Step 3: Build tree entries
        // - Use template blob SHAs directly (GitHub knows these blobs)
        // - Override specific files with custom content
        const treeEntries = templateFiles.map(file => {
            const override = fileOverrides.get(file.path);
            if (override !== undefined) {
                // Custom content for this file
                return {
                    path: file.path,
                    mode: '100644' as const,
                    type: 'blob' as const,
                    content: override,
                };
            } else {
                // Reference template's blob SHA directly
                return {
                    path: file.path,
                    mode: '100644' as const,
                    type: 'blob' as const,
                    sha: file.sha,
                };
            }
        });

        // Add any override files that don't exist in template
        for (const [path, content] of fileOverrides) {
            if (!templateFiles.some(f => f.path === path)) {
                treeEntries.push({
                    path,
                    mode: '100644' as const,
                    type: 'blob' as const,
                    content,
                });
            }
        }

        this.logger.info(`[GitHub] Creating tree with ${treeEntries.length} entries`);

        // Step 4: Create new tree
        const newTreeSha = await this.createTree(targetOwner, targetRepo, treeEntries);
        this.logger.info(`[GitHub] Created tree: ${newTreeSha.substring(0, 7)}`);

        // Step 5: Create commit
        const commitSha = await this.createCommit(
            targetOwner,
            targetRepo,
            'chore: reset repository to template',
            newTreeSha,
            targetBranchInfo.commitSha,
        );
        this.logger.info(`[GitHub] Created commit: ${commitSha.substring(0, 7)}`);

        // Step 6: Update branch to point to new commit
        await this.updateBranchRef(targetOwner, targetRepo, branch, commitSha);
        this.logger.info(`[GitHub] Updated branch ${branch} to ${commitSha.substring(0, 7)}`);

        return {
            commitSha,
            fileCount: treeEntries.length,
        };
    }
}
