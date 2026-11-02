/**
 * The releases a template sync moves to and records.
 *
 * @module features/updates/services/templateSyncRelease
 */

import { lkgSourceOf } from './thinLayerUpdate';
import { refOfSource } from '@/core/releases/componentRelease';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
import { readPatchesRelease } from '@/features/eds/services/patches/lkgReader';
import type { Logger } from '@/types/logger';

/** The newest release's commit, for a template the builder owns. Anyone else's has none. */
export async function releaseCommitOf(
    target: { templateOwner: string; templateRepo: string; templateBranch?: string },
    fileOperations: Pick<GitHubFileOperations, 'getRefCommit'>,
    logger: Logger,
): Promise<string | undefined> {
    const { templateOwner, templateRepo, templateBranch = 'main' } = target;
    const { version, ref } = await refOfSource(
        { owner: templateOwner, repo: templateRepo, branch: templateBranch },
        logger,
    );
    return version ? fileOperations.getRefCommit(templateOwner, templateRepo, ref) : undefined;
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
