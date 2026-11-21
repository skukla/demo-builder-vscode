/**
 * The releases a template sync moves to and records.
 *
 * @module features/updates/services/templateSyncRelease
 */

import { lkgSourceOf } from './thinLayerUpdate';
import { refOfSource, ReleaseUnreadableError } from '@/core/releases/componentRelease';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
import { readPatchesRelease } from '@/features/eds/services/patches/lkgReader';
import type { Logger } from '@/types/logger';

/**
 * The newest release's commit, for a template the builder owns. Anyone else's has none. One we
 * own whose release cannot be read answers the refusal a person reads, so nothing is merged.
 */
export async function releaseCommitOf(
    target: { templateOwner: string; templateRepo: string; templateBranch?: string },
    fileOperations: Pick<GitHubFileOperations, 'getRefCommit'>,
    logger: Logger,
): Promise<{ commit?: string } | { refusal: string }> {
    const { templateOwner, templateRepo, templateBranch = 'main' } = target;
    try {
        const { version, ref } = await refOfSource(
            { owner: templateOwner, repo: templateRepo, branch: templateBranch },
            logger,
        );
        return { commit: version ? await fileOperations.getRefCommit(templateOwner, templateRepo, ref) : undefined };
    } catch (unread) {
        if (unread instanceof ReleaseUnreadableError) return { refusal: unread.message };
        throw unread;
    }
}

/**
 * Record the patches release a thin-layer storefront moved to, as its version. One that cannot
 * be read leaves the old record: the next update check compares by commit, as it always could.
 */
export async function recordPatchesReleaseOn(metadata: Record<string, unknown>, logger: Logger): Promise<void> {
    const lkgSource = lkgSourceOf(metadata);
    const release = lkgSource ? await readPatchesRelease(lkgSource, logger) : undefined;
    if (release) metadata.patchesRelease = release;
}

/** Whether the clone differs from its last commit once everything is staged. */
export async function anythingToCommit(
    git: (command: string, timeout: number) => Promise<{ stdout: string }>,
): Promise<boolean> {
    await git('git add -A', TIMEOUTS.QUICK);
    return (await git('git status --porcelain', TIMEOUTS.QUICK)).stdout.trim() !== '';
}
