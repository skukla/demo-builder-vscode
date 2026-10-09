/**
 * GitHub Tree Commits — the Git Data API side of writing to a repository.
 *
 * Blobs, trees, commits and the branch ref, plus the one composition every
 * additive writer uses: `commitTreeToBranch`, which re-bases when the branch
 * moved under it. Two orchestrators sit on top of these primitives —
 * `GitHubRepoArchive.resetRepoToTemplate` (replace a repository) and
 * `githubTreePush.pushFiles` (a storefront arriving as a zip).
 *
 * Split out of `githubFileOperations.ts` on 2026-10-08 (EDS-8): the Contents API
 * reads and writes there change for different reasons than this does.
 *
 * @module features/eds/services/github/githubTreeCommits
 */

import type { GitHubTreeInput } from '../types';
import { GitHubAuthenticatedOperations } from './githubAuthenticatedOperations';
import type { GitHubTokenService } from './githubTokenService';
import {
    describePushProtectionBlock,
    describeRejectionDiagnostics,
    isRulesetRejection,
} from './githubWriteRejection';
import { getLogger } from '@/core/logging/debugLogger';
import type { Logger } from '@/types/logger';

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
 * write the rules forbid. `githubWriteRejection` makes the same distinction for the
 * Contents path; this is the refs-API side of it.
 */
function isStaleRefRejection(error: unknown): boolean {
    const message = (error as Error | undefined)?.message ?? '';
    if (isRulesetRejection(message)) return false;
    return /fast[ -]forward|reference cannot be updated/i.test(message);
}

export class GitHubTreeCommits extends GitHubAuthenticatedOperations {
    private logger: Logger;

    constructor(tokenService: GitHubTokenService, logger?: Logger) {
        super(tokenService);
        this.logger = logger ?? getLogger();
    }

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
     * Create a blob from base64 bytes, for a binary file a tree entry cannot carry
     * inline (fonts and images in a storefront pushed from a zip).
     *
     * @returns The blob sha, for a tree entry's `sha`
     */
    async createBlob(owner: string, repo: string, base64Content: string): Promise<string> {
        const octokit = await this.ensureAuthenticated();
        const response = await octokit.request('POST /repos/{owner}/{repo}/git/blobs', {
            owner,
            repo,
            content: base64Content,
            encoding: 'base64',
        });
        return response.data.sha;
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
     * @param baseTree - Tree to base this one on; omitted, the tree starts empty
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
}
