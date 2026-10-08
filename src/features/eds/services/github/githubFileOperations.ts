/**
 * GitHub File Operations — the Contents API: one file at a time.
 *
 * Read a file, write or delete one with its sha, list a branch's files, read a
 * branch head and a blob. Every caller handed this object reads through it; most
 * write through it too.
 *
 * Until 2026-10-08 this file also held the Git Data primitives and the template
 * reset. EDS-8 split them by job: `githubTreeCommits.ts` (trees, blobs, commits,
 * the ref and the rebase-on-race commit) and `githubRepoArchive.ts` (the zip
 * GitHub serves and the reset built from a template's). This class builds both
 * units and exposes them, and keeps three forwarders — see the note above them.
 *
 * @module features/eds/services/github/githubFileOperations
 */

import {
    describePushProtectionBlock,
    describeRejectionDiagnostics,
} from '../errorFormatters';
import type {
    GitHubFileContent,
    GitHubFileResult,
    GitHubApiError,
    GitHubTreeEntry,
    GitHubTreeInput,
} from '../types';
import { GitHubAuthenticatedOperations } from './githubAuthenticatedOperations';
import { GitHubRepoArchive } from './githubRepoArchive';
import type { GitHubTokenService } from './githubTokenService';
import { GitHubTreeCommits } from './githubTreeCommits';
import { getLogger } from '@/core/logging/debugLogger';
import type { Logger } from '@/types/logger';

/**
 * True when an error is GitHub's Contents API update-with-SHA rejection —
 * the passed SHA no longer matches HEAD because the file changed under us.
 * Shared by the publishers (brandAssetPublisher, pdp404HandlerPublisher)
 * to gate their re-read-and-retry-once handling.
 */
export function isStaleShaFailure(error: unknown): boolean {
    return /does not match/i.test((error as Error)?.message ?? '');
}

/**
 * GitHub File Operations Service
 */
export class GitHubFileOperations extends GitHubAuthenticatedOperations {
    private logger: Logger;
    /** The Git Data unit: trees, blobs, commits, the ref and the rebase-on-race commit. */
    readonly treeCommits: GitHubTreeCommits;
    /** The archive unit: a repository's zip, and the reset built from a template's. */
    readonly repoArchive: GitHubRepoArchive;

    constructor(tokenService: GitHubTokenService, logger?: Logger) {
        super(tokenService);
        this.logger = logger ?? getLogger();
        this.treeCommits = new GitHubTreeCommits(tokenService, this.logger);
        this.repoArchive = new GitHubRepoArchive(tokenService, this.treeCommits, this.logger);
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
            const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
                owner,
                repo,
                path,
                ...(ref && { ref }),
            });

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

        let response;
        try {
            response = await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
                owner,
                repo,
                path,
                message,
                content: encodedContent,
                ...(sha && { sha }),
            });
        } catch (error) {
            // GitHub's push-protection message names no file, and this pipeline
            // writes eight of them — so the raw error cannot say which was refused.
            // The path is right here; put it in the message.
            const blocked = describePushProtectionBlock(error, path);
            if (blocked) {
                // The thrown message stays short for the UI; the FULL response body
                // goes to the debug log. This block cannot be reproduced locally —
                // it comes from policy on the reporting user's account — so what
                // GitHub said here is the only evidence that will ever exist.
                const detail = describeRejectionDiagnostics(error);
                if (detail) this.logger.debug(`[GitHub] ${detail}`);
                throw new Error(blocked);
            }
            throw error;
        }

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
    async listRepoFiles(owner: string, repo: string, branch = 'main'): Promise<GitHubTreeEntry[]> {
        const octokit = await this.ensureAuthenticated();

        try {
            // First get the branch's latest commit SHA
            const branchResponse = await octokit.request(
                'GET /repos/{owner}/{repo}/branches/{branch}',
                {
                    owner,
                    repo,
                    branch,
                },
            );

            const treeSha = branchResponse.data.commit.commit.tree.sha;

            // Get the tree recursively
            const treeResponse = await octokit.request(
                'GET /repos/{owner}/{repo}/git/trees/{tree_sha}',
                {
                    owner,
                    repo,
                    tree_sha: treeSha,
                    recursive: '1',
                },
            );

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
     * The message of a branch's latest commit, or null when the branch or repository
     * does not exist. Remove uses it to recognise a repository a zip import made.
     */
    async getLatestCommitMessage(owner: string, repo: string, branch = 'main'): Promise<string | null> {
        const octokit = await this.ensureAuthenticated();
        try {
            const response = await octokit.request('GET /repos/{owner}/{repo}/branches/{branch}', { owner, repo, branch });
            return response.data.commit.commit.message;
        } catch (error) {
            if ((error as GitHubApiError).status === 404) return null;
            throw error;
        }
    }

    /**
     * Get the latest commit SHA for a branch
     * @param owner - Repository owner
     * @param repo - Repository name
     * @param branch - Branch name (default: 'main')
     * @returns The latest commit SHA, or null if branch/repo not found
     */
    async getLatestCommitSha(owner: string, repo: string, branch = 'main'): Promise<string | null> {
        const octokit = await this.ensureAuthenticated();

        try {
            const branchResponse = await octokit.request(
                'GET /repos/{owner}/{repo}/branches/{branch}',
                {
                    owner,
                    repo,
                    branch,
                },
            );

            return branchResponse.data.commit.sha;
        } catch (error) {
            const apiError = error as GitHubApiError;

            if (apiError.status === 404) {
                // Branch or repo doesn't exist
                return null;
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
     * Fetch blob content from a repository using the Git Blob API
     * @param owner - Repository owner
     * @param repo - Repository name
     * @param sha - Blob SHA
     * @returns Blob content as string (decoded from base64)
     */
    async getBlobContent(owner: string, repo: string, sha: string): Promise<string> {
        const octokit = await this.ensureAuthenticated();

        const response = await octokit.request('GET /repos/{owner}/{repo}/git/blobs/{file_sha}', {
            owner,
            repo,
            file_sha: sha,
        });

        // GitHub returns base64-encoded content
        return Buffer.from(response.data.content, 'base64').toString('utf-8');
    }

    // =========================================================================
    // KEPT FORWARDERS (2026-10-08 split, EDS-8)
    //
    // Each is reached by callers handed this object WHOLE: installBlockCollections,
    // installInspectorTagging, the storefront fixes, storefrontSetupPhase2 and
    // edsResetRepoHelper take one GitHubFileOperations and need Contents reads AND
    // a tree commit (or the reset) on it. Splitting that parameter is an interface
    // change across ~15 production and ~50 test files, not a move, so these three
    // stay and name their owner. New callers take `treeCommits` / `repoArchive`
    // directly; nothing new is added here.
    // =========================================================================

    /** Owned by {@link GitHubTreeCommits.getBranchInfo}. */
    getBranchInfo(owner: string, repo: string, branch?: string): Promise<{ treeSha: string; commitSha: string }> {
        return this.treeCommits.getBranchInfo(owner, repo, branch);
    }

    /** Owned by {@link GitHubTreeCommits.commitTreeToBranch}. */
    commitTreeToBranch(
        owner: string,
        repo: string,
        branch: string,
        treeEntries: GitHubTreeInput[],
        message: string,
    ): Promise<string> {
        return this.treeCommits.commitTreeToBranch(owner, repo, branch, treeEntries, message);
    }

    /** Owned by {@link GitHubRepoArchive.resetRepoToTemplate}. */
    resetRepoToTemplate(
        templateOwner: string,
        templateRepo: string,
        targetOwner: string,
        targetRepo: string,
        fileOverrides: Map<string, string>,
        templateRef?: string,
    ): Promise<{ commitSha: string; fileCount: number }> {
        return this.repoArchive.resetRepoToTemplate(
            templateOwner,
            templateRepo,
            targetOwner,
            targetRepo,
            fileOverrides,
            templateRef,
        );
    }
}
