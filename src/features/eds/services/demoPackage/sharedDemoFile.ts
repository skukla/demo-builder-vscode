/**
 * The description file in the SC's own storefront repository, written the
 * ADR-013 way: a file we wrote is ours to rewrite or remove; a file we did not
 * write, or one changed since, is left alone and reported. The generated-file
 * writer applies that rule to files on disk by content hash; the repository is
 * reached through GitHub, so the proof of ownership here is the blob sha
 * GitHub answered when we wrote, recorded on the project.
 *
 * @module features/eds/services/demoPackage/sharedDemoFile
 */

import type { GitHubFileOperations } from '../github/githubFileOperations';
import type { Logger } from '@/types/logger';
import { SHARED_DEMO_FILE_NAME } from '@/types/projectFile';

export interface SharedDemoFileTarget {
    owner: string;
    repo: string;
}

export type SharedDemoFileWrite =
    | { outcome: 'written'; sha: string }
    | { outcome: 'unchanged'; sha: string }
    /** Present and not ours (never written by us, or changed since): left alone. */
    | { outcome: 'skipped'; reason: string };

export type SharedDemoFileRemoval = 'removed' | 'skipped' | 'absent';

const NOT_OURS = `${SHARED_DEMO_FILE_NAME} is already there and was not written by Demo Builder, or was edited since. Edit it yourself.`;

/**
 * Write the file, or refuse to clobber one that is not ours.
 *
 * @param fileOps - GitHub file reads and writes
 * @param target - The storefront repository (its default branch)
 * @param content - The file's text
 * @param recordedSha - The blob sha of the last write we made, when there was one
 */
export async function writeSharedDemoFile(
    fileOps: Pick<GitHubFileOperations, 'getFileContent' | 'createOrUpdateFile'>,
    target: SharedDemoFileTarget,
    content: string,
    recordedSha: string | undefined,
): Promise<SharedDemoFileWrite> {
    const current = await fileOps.getFileContent(target.owner, target.repo, SHARED_DEMO_FILE_NAME);
    if (current && current.sha !== recordedSha) {
        return { outcome: 'skipped', reason: NOT_OURS };
    }
    if (current && current.content === content) {
        return { outcome: 'unchanged', sha: current.sha };
    }
    const written = await fileOps.createOrUpdateFile(
        target.owner,
        target.repo,
        SHARED_DEMO_FILE_NAME,
        content,
        current ? 'Update the demo package description' : 'Save as demo package: add the description file',
        current?.sha,
    );
    return { outcome: 'written', sha: written.sha };
}

/**
 * Carry the file through a storefront reset, as an override on the rewritten tree.
 *
 * A reset replaces the tree with the template's, and the file is Demo Builder's
 * to keep, like fstab.yaml: without this the card's link kept working but lost
 * the name, description and sample-data hint, while the project still recorded
 * a package (found 2026-09-14). Call it only for a project with a package
 * record: one built FROM an added demo takes the file its source repository
 * has, as it takes everything else.
 *
 * @param fileOverrides - the reset's path → content overrides; gains the file when there is one
 */
export async function carrySharedDemoFile(
    fileOps: Pick<GitHubFileOperations, 'getFileContent'>,
    target: SharedDemoFileTarget,
    fileOverrides: Map<string, string>,
    logger: Logger,
): Promise<void> {
    const current = await fileOps.getFileContent(target.owner, target.repo, SHARED_DEMO_FILE_NAME);
    if (current === undefined || current === null) return;
    fileOverrides.set(SHARED_DEMO_FILE_NAME, current.content);
    logger.info('[EdsReset] Carrying the demo package description file through the reset');
}

/**
 * Remove the file, only on proof that we wrote it.
 */
export async function removeSharedDemoFile(
    fileOps: Pick<GitHubFileOperations, 'getFileContent' | 'deleteFile'>,
    target: SharedDemoFileTarget,
    recordedSha: string | undefined,
): Promise<SharedDemoFileRemoval> {
    const current = await fileOps.getFileContent(target.owner, target.repo, SHARED_DEMO_FILE_NAME);
    if (!current) return 'absent';
    if (!recordedSha || current.sha !== recordedSha) return 'skipped';
    await fileOps.deleteFile(target.owner, target.repo, SHARED_DEMO_FILE_NAME, 'Remove demo package', current.sha);
    return 'removed';
}
