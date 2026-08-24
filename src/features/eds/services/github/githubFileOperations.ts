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
import AdmZip from 'adm-zip';
import {
    describePushProtectionBlock,
    describeRejectionDiagnostics,
    isRulesetRejection,
} from '../errorFormatters';
import type { GitHubTokenService } from './githubTokenService';
import type {
    GitHubFileContent,
    GitHubFileResult,
    GitHubApiError,
    GitHubTreeEntry,
    GitHubTreeInput,
} from '../types';
import { getLogger } from '@/core/logging';
import type { Logger } from '@/types/logger';

/** Error messages for file operations */
const ERROR_MESSAGES = {
    NOT_AUTHENTICATED: 'Not authenticated',
} as const;

/**
 * Build the GitHub archive URL for a repo+ref. Detects whether `ref` is a
 * branch name (e.g. `main`) or a full 40-hex commit SHA — they take
 * different URL shapes:
 *
 *   branch: `archive/refs/heads/{branch}.zip`
 *   SHA:    `archive/{sha}.zip`
 *
 * Used by `downloadRepoContents`. Exported so the SHA-vs-branch routing
 * is directly unit-testable (the wider `resetRepoToTemplate` integration
 * brings extensive Octokit + zip-buffer mocking that obscures this one
 * load-bearing branch).
 *
 * ADR-006 Step 4: passing the LKG SHA here is how reset pins thin-layer
 * storefronts to a verified canonical state instead of canonical HEAD.
 */
export function buildArchiveUrl(
    owner: string,
    repo: string,
    ref: string,
): { url: string; isSha: boolean } {
    const isSha = /^[0-9a-f]{40}$/i.test(ref);
    const url = isSha
        ? `https://github.com/${owner}/${repo}/archive/${ref}.zip`
        : `https://github.com/${owner}/${repo}/archive/refs/heads/${ref}.zip`;
    return { url, isSha };
}

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
/**
 * Byte budget for one create-tree request.
 *
 * The ceiling GitHub enforces is request SIZE, not entry count — one 3.5 MB
 * file behaves nothing like a thousand 1 KB ones. Measured on
 * `adobe-commerce/boilerplate-b2b-template` (2026-08-15): 3,340 files, 13.13 MB
 * of content, a 13.55 MB single request body, median entry ~1 KB and the
 * largest entry 3.5 MB on its own. GitHub timed out on that single request with
 * its own error naming the remedy. At 1 MB this template needs 13 requests;
 * 2 MB would need 7. 1 MB is the conservative pick — the requests are cheap and
 * the real ceiling is undocumented.
 */
const TREE_REQUEST_BUDGET_BYTES = 1_048_576;

/**
 * Split tree entries into batches that each stay under the byte budget.
 *
 * An entry is NEVER split: one larger than the whole budget becomes its own
 * batch. That case is real — this template contains a single 3.5 MB file — and
 * splitting an entry would corrupt the file rather than shrink the request.
 */
export function batchTreeEntries(
    entries: GitHubTreeInput[],
    budgetBytes: number = TREE_REQUEST_BUDGET_BYTES,
): GitHubTreeInput[][] {
    const batches: GitHubTreeInput[][] = [];
    let current: GitHubTreeInput[] = [];
    let currentBytes = 0;

    for (const entry of entries) {
        const size = JSON.stringify(entry).length;
        if (current.length > 0 && currentBytes + size > budgetBytes) {
            batches.push(current);
            current = [];
            currentBytes = 0;
        }
        current.push(entry);
        currentBytes += size;
    }
    if (current.length > 0) batches.push(current);
    return batches;
}

/** How many times a commit re-bases onto a moved branch before giving up. */
const COMMIT_REBASE_ATTEMPTS = 3;

/**
 * Whether a ref update failed because the branch moved under us.
 *
 * Keyed on the MESSAGE, not the 422 — a repository-ruleset rejection carries the
 * same status and an entirely different remedy, and retrying it can only repeat a
 * write the rules forbid. `errorFormatters` makes the same distinction for the
 * Contents path; this is the refs-API side of it.
 */
function isStaleRefRejection(error: unknown): boolean {
    const message = (error as Error | undefined)?.message ?? '';
    if (isRulesetRejection(message)) return false;
    return /fast[ -]forward|reference cannot be updated/i.test(message);
}

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

        const branchResponse = await octokit.request(
            'GET /repos/{owner}/{repo}/branches/{branch}',
            {
                owner,
                repo,
                branch,
            },
        );

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
        treeEntries: GitHubTreeInput[],
        baseTree?: string,
    ): Promise<string> {
        const octokit = await this.ensureAuthenticated();

        const response = await octokit.request('POST /repos/{owner}/{repo}/git/trees', {
            owner,
            repo,
            tree: treeEntries,
            ...(baseTree && { base_tree: baseTree }),
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
     * Commit tree entries onto a branch, re-basing if someone else got there first.
     *
     * The four-step dance — read the branch, build a tree on its base, commit,
     * move the ref — is a read-modify-write across several API round-trips, and
     * anything landing in that window makes the ref update a non-fast-forward.
     * Unforced (which is the only safe way to do it) GitHub rejects that, so the
     * caller has to be able to lose the race without losing its work OR the other
     * person's.
     *
     * The retry re-reads the branch and rebuilds the tree on the NEW base. That is
     * the part that matters: re-pushing the SAME commit would move the ref to a
     * tree built before their push and revert their files anyway — the original
     * damage, arrived at politely. Rebuilt, our entries win for the paths we
     * wrote and everything else comes from their commit.
     *
     * Only a stale-ref rejection is retried. 422 is ambiguous here: a repository
     * ruleset rejection carries the same status, cannot succeed however many times
     * it is repeated, and is told apart by its message — the same rule
     * `describePushProtectionBlock` keys on.
     *
     * @param owner - Repository owner
     * @param repo - Repository name
     * @param branch - Branch to commit onto
     * @param treeEntries - Files to write (paths not listed keep the branch's content)
     * @param message - Commit message
     * @returns The SHA of the commit the branch now points at
     */
    async commitTreeToBranch(
        owner: string,
        repo: string,
        branch: string,
        treeEntries: GitHubTreeInput[],
        message: string,
    ): Promise<string> {
        let lastError: Error | undefined;

        for (let attempt = 1; attempt <= COMMIT_REBASE_ATTEMPTS; attempt++) {
            const { treeSha, commitSha } = await this.getBranchInfo(owner, repo, branch);
            const newTreeSha = await this.createTree(owner, repo, treeEntries, treeSha);
            const newCommitSha = await this.createCommit(
                owner,
                repo,
                message,
                newTreeSha,
                commitSha,
            );

            try {
                await this.updateBranchRef(owner, repo, branch, newCommitSha);
                return newCommitSha;
            } catch (error) {
                if (!isStaleRefRejection(error)) throw error;
                lastError = error as Error;
                this.logger.info(
                    `[GitHub] ${branch} moved while committing (attempt ${attempt}` +
                        `/${COMMIT_REBASE_ATTEMPTS}) — re-reading and rebuilding on the new head`,
                );
            }
        }

        throw new Error(
            `Could not commit to ${branch}: it moved during every attempt ` +
                `(${COMMIT_REBASE_ATTEMPTS}). Nothing was overwritten. ` +
                `Last rejection: ${lastError?.message ?? 'not a fast forward'}`,
        );
    }

    /**
     * Update a branch reference to point to a new commit.
     *
     * `force` REWRITES HISTORY: it moves the branch to `sha` even when that is
     * not a fast-forward, discarding every commit that is no longer reachable.
     * It defaults to FALSE, so a caller that means to do that has to say so.
     *
     * It used to default to TRUE — written for `resetRepoToTemplate`, which does
     * mean it ("default: true for reset", the docstring said). The other two
     * callers are additive (installing a block library, vendoring Inspector
     * tagging) and inherited it silently. Each reads the branch, builds a tree,
     * commits, then moves the ref — several API round-trips, batched for a large
     * library — and a commit landing inside that window makes the ref update a
     * non-fast-forward. Unforced, GitHub rejects it with a 422 and nothing is
     * lost. Forced, the ref moves anyway: that commit is discarded AND every file
     * differing from the base tree read at the start is reverted with it.
     *
     * Reported 2026-08-18 by a colleague who lost two real fixes that way in one
     * evening. A destructive default is the whole defect — safety should not be
     * the thing you have to opt into.
     *
     * @param owner - Repository owner
     * @param repo - Repository name
     * @param branch - Branch name
     * @param sha - SHA of the commit to point to
     * @param force - Rewrite history: move the ref even if not a fast-forward
     */
    async updateBranchRef(
        owner: string,
        repo: string,
        branch: string,
        sha: string,
        force = false,
    ): Promise<void> {
        const octokit = await this.ensureAuthenticated();

        try {
            await octokit.request('PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}', {
                owner,
                repo,
                branch,
                sha,
                force,
            });
        } catch (error) {
            // A multi-file commit is rejected here, at the ref update — and unlike a
            // Contents PUT there is no single path to name, so say which commit and
            // let the reader open it. Without this the message is the same anonymous
            // "Repository rule violations found" the Contents path used to give.
            const blocked = describePushProtectionBlock(error, `commit ${sha.slice(0, 7)}`);
            if (blocked) {
                const detail = describeRejectionDiagnostics(error);
                if (detail) this.logger.debug(`[GitHub] ${detail}`);
                throw new Error(blocked);
            }
            throw error;
        }
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

    /**
     * Download repository as a zipball and extract all file contents
     *
     * This is much more efficient than fetching individual blobs:
     * - Single HTTP request regardless of file count
     * - Avoids GitHub API rate limits
     *
     * @param owner - Repository owner
     * @param repo - Repository name
     * @param ref - Git ref (branch/tag/commit) - default: 'main'
     * @returns Map of path -> content
     */
    private async downloadRepoContents(
        owner: string,
        repo: string,
        ref = 'main',
    ): Promise<Map<string, string>> {
        const token = await this.tokenService.getToken();
        if (!token) {
            throw new Error(ERROR_MESSAGES.NOT_AUTHENTICATED);
        }

        const { url: zipUrl, isSha } = buildArchiveUrl(owner, repo, ref);
        this.logger.debug(
            `[GitHub] Downloading repository archive from ${owner}/${repo}@${ref} (${isSha ? 'SHA' : 'branch'})`,
        );

        const response = await fetch(zipUrl, {
            headers: {
                'User-Agent': 'Demo-Builder-VSCode',
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to download archive: HTTP ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        this.logger.debug(
            `[GitHub] Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)} MB archive`,
        );

        // Extract files from zipball
        const zip = new AdmZip(buffer);
        const entries = zip.getEntries();
        const contents = new Map<string, string>();

        // Zipball has a root folder like "owner-repo-sha/" - we need to strip it
        let rootPrefix = '';
        for (const entry of entries) {
            if (entry.isDirectory && !rootPrefix) {
                rootPrefix = entry.entryName;
                break;
            }
        }

        for (const entry of entries) {
            if (entry.isDirectory) {
                continue;
            }

            const path = entry.entryName.startsWith(rootPrefix)
                ? entry.entryName.slice(rootPrefix.length)
                : entry.entryName;

            if (!path) {
                continue;
            }

            contents.set(path, entry.getData().toString('utf-8'));
        }

        this.logger.info(`[GitHub] Extracted ${contents.size} files from archive`);
        return contents;
    }

    /**
     * Reset a repository to match a template using archive download
     *
     * This approach:
     * 1. Downloads template as a zipball (single HTTP request)
     * 2. Extracts all files from the archive
     * 3. Creates new tree with content
     * 4. Creates commit and updates branch
     *
     * This is much more efficient than fetching individual blobs:
     * - Single download request vs N blob fetch requests
     * - Avoids GitHub API rate limits
     * - Faster for large repositories (hundreds of files)
     *
     * @param templateOwner - Template repo owner
     * @param templateRepo - Template repo name
     * @param targetOwner - Target repo owner
     * @param targetRepo - Target repo name
     * @param fileOverrides - Map of path -> content for files to override (e.g., fstab.yaml)
     * @param templateRef - Template ref to clone FROM. May be a branch name OR a
     *   40-hex commit SHA (ADR-006 Step 4: thin-layer storefronts pin to LKG SHA).
     *   The target repo's `main` branch is always the destination — `templateRef`
     *   only controls which template revision is downloaded, not which target
     *   branch is reset.
     * @returns Object with commit SHA and file counts
     */
    async resetRepoToTemplate(
        templateOwner: string,
        templateRepo: string,
        targetOwner: string,
        targetRepo: string,
        fileOverrides: Map<string, string>,
        templateRef = 'main',
    ): Promise<{ commitSha: string; fileCount: number }> {
        // Target branch is always `main` regardless of which template revision
        // we're cloning from — the LKG SHA flows into `downloadRepoContents`
        // only. Conflating these two values (the pre-Step-4 code did) makes
        // getBranchInfo hit the GitHub branches API with a SHA, which 404s
        // with "Branch not found".
        const targetBranch = 'main';
        this.logger.info(
            `[GitHub] Resetting ${targetOwner}/${targetRepo}@${targetBranch} to template ${templateOwner}/${templateRepo}@${templateRef}`,
        );

        // Step 1: Get target branch info (need current commit as parent)
        const targetBranchInfo = await this.getBranchInfo(targetOwner, targetRepo, targetBranch);
        this.logger.info(
            `[GitHub] Target branch commit: ${targetBranchInfo.commitSha.substring(0, 7)}`,
        );

        // Step 2: Download entire template repo as zipball (single request - avoids rate limits)
        const templateContents = await this.downloadRepoContents(
            templateOwner,
            templateRepo,
            templateRef,
        );

        // Step 3: Build tree entries with content
        const treeEntries: GitHubTreeInput[] = [];

        for (const [path, content] of templateContents) {
            const override = fileOverrides.get(path);
            if (override !== undefined) {
                // Use override content
                treeEntries.push({
                    path,
                    mode: '100644',
                    type: 'blob',
                    content: override,
                });
            } else {
                // Use template content from archive
                treeEntries.push({
                    path,
                    mode: '100644',
                    type: 'blob',
                    content,
                });
            }
        }

        // Add any override files that don't exist in template
        for (const [path, content] of fileOverrides) {
            if (!templateContents.has(path)) {
                treeEntries.push({
                    path,
                    mode: '100644',
                    type: 'blob',
                    content,
                });
            }
        }

        // Step 4: Create the tree INCREMENTALLY.
        //
        // Sending every file's content in one request is what broke reset for
        // large templates: GitHub timed out on a 13.55 MB body and said so
        // explicitly ("Consider building the tree incrementally").
        //
        // The FIRST batch deliberately passes no base_tree. A reset REPLACES
        // the repository, and basing it on the branch's existing tree would let
        // files the template no longer contains survive the reset. Each later
        // batch chains on the previous batch's tree, so the final tree is the
        // union of all batches — exactly the template, nothing stale.
        const batches = batchTreeEntries(treeEntries);
        this.logger.info(
            `[GitHub] Creating tree with ${treeEntries.length} entries ` +
                `in ${batches.length} request(s)`,
        );

        let newTreeSha: string | undefined;
        for (const [index, batch] of batches.entries()) {
            newTreeSha = await this.createTree(targetOwner, targetRepo, batch, newTreeSha);
            if (batches.length > 1) {
                this.logger.debug(
                    `[GitHub] Tree batch ${index + 1}/${batches.length} ` +
                        `(${batch.length} entries) -> ${newTreeSha.substring(0, 7)}`,
                );
            }
        }
        if (!newTreeSha) {
            throw new Error('Template produced no files to commit');
        }
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

        // Step 6: Update branch to point to new commit.
        //
        // `force` explicitly: a reset REPLACES the repository, and the commit
        // built above is deliberately not a descendant of what is there now.
        // Every other caller of updateBranchRef is additive and must NOT pass it.
        await this.updateBranchRef(targetOwner, targetRepo, targetBranch, commitSha, true);
        this.logger.info(`[GitHub] Updated branch ${targetBranch} to ${commitSha.substring(0, 7)}`);

        return {
            commitSha,
            fileCount: treeEntries.length,
        };
    }
}
