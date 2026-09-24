/**
 * Push a set of files as ONE commit on a repository's default branch: text as
 * inline tree content, binaries through blobs, the tree in request-sized
 * batches the way `resetRepoToTemplate` already does. Used when a storefront
 * arrives as a zip (shareable-demo step 10) and has to become a repository.
 *
 * @module features/eds/services/github/githubTreePush
 */

import { isBinary } from '../storefront/zipStorefrontImport';
import type { GitHubTreeInput } from '../types';
import { batchTreeEntries, type GitHubFileOperations } from './githubFileOperations';
import type { Logger } from '@/types/logger';

export type TreePushOps = Pick<
    GitHubFileOperations,
    'getBranchInfo' | 'createBlob' | 'createTree' | 'createCommit' | 'updateBranchRef'
>;

const BRANCH = 'main';

/** How far a push has got: binaries go up one at a time, text files in batches. */
export interface PushProgress {
    kind: 'binary' | 'files';
    done: number;
    total: number;
}

/**
 * Replace the branch's tree with `files` in one commit.
 *
 * @param ops - The GitHub file operations
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param files - Repository-relative path → bytes
 * @param message - The commit message
 * @param logger - Receives progress
 * @param onProgress - Each binary uploaded and each batch of files pushed, for a person watching
 * @returns The commit sha and how many files it carries
 */
export async function pushFiles(
    ops: TreePushOps,
    owner: string,
    repo: string,
    files: Map<string, Buffer>,
    message: string,
    logger: Logger,
    onProgress?: (progress: PushProgress) => void,
): Promise<{ commitSha: string; fileCount: number }> {
    const head = await ops.getBranchInfo(owner, repo, BRANCH);
    const binaries = new Set([...files].filter(([, bytes]) => isBinary(bytes)).map(([path]) => path));
    const entries: GitHubTreeInput[] = [];
    let blobs = 0;
    for (const [path, bytes] of files) {
        if (binaries.has(path)) {
            const sha = await ops.createBlob(owner, repo, bytes.toString('base64'));
            entries.push({ path, mode: '100644', type: 'blob', sha });
            blobs += 1;
            onProgress?.({ kind: 'binary', done: blobs, total: binaries.size });
        } else {
            entries.push({ path, mode: '100644', type: 'blob', content: bytes.toString('utf-8') });
        }
    }
    if (entries.length === 0) throw new Error('Nothing to push: the zip held no files a repository would keep.');

    const batches = batchTreeEntries(entries);
    logger.info(`[GitHub] Pushing ${entries.length} files (${blobs} binary) to ${owner}/${repo} in ${batches.length} tree request(s)`);
    let treeSha: string | undefined;
    let pushed = 0;
    for (const batch of batches) {
        treeSha = await ops.createTree(owner, repo, batch, treeSha);
        pushed += batch.length;
        onProgress?.({ kind: 'files', done: pushed, total: entries.length });
    }
    const commitSha = await ops.createCommit(owner, repo, message, treeSha as string, head.commitSha);
    await ops.updateBranchRef(owner, repo, BRANCH, commitSha, true);
    logger.info(`[GitHub] ${owner}/${repo}@${BRANCH} is now ${commitSha.substring(0, 7)}`);
    return { commitSha, fileCount: entries.length };
}
