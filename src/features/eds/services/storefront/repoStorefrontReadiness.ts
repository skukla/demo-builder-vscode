/**
 * Classify a GitHub repo's readiness to become an EDS storefront.
 *
 * The wizard asks "Reset to template?" as one checkbox defaulting to off. That
 * question only earns its place when the answer could destroy something. On
 * 2026-07-29 an existing repo was selected with the box unticked, and setup ran
 * to `Complete` on a repo missing `scripts/scripts.js`: Inspector Tagging,
 * PDP404, and Quick Edit each logged a skip and the run reported success.
 *
 * Three states, three different right answers:
 *
 *   empty            nothing to lose — set up from the template and say so
 *   storefront       the only case worth asking about
 *   not-a-storefront a failed precondition, not a warning to skip past
 *
 * Plus `undetermined`, which exists so an unreachable GitHub can never be
 * mistaken for one of the other three. That distinction is load-bearing: read
 * as `empty`, it would authorize a destructive reset on a repo we could not
 * see. This is the same three-states-plus-unknown shape the AEM Code Sync check
 * needed, and for the same reason — collapsing "I don't know" into a definite
 * answer is what produced this week's field failures.
 *
 * @module features/eds/services/storefront/repoStorefrontReadiness
 */

import type { GitHubFileOperations } from '../github/githubFileOperations';
import type { Logger } from '@/types/logger';

/**
 * Files every EDS storefront has.
 *
 * Chosen because the pipeline itself already depends on them: Inspector Tagging
 * and the smart-404 install both need `scripts/delayed.js`, Quick Edit needs
 * `scripts/scripts.js`, and the eager redirect needs `head.html`. A repo
 * missing any of them cannot complete setup — it can only appear to.
 */
export const CANONICAL_STOREFRONT_FILES = [
    'scripts/scripts.js',
    'scripts/delayed.js',
    'head.html',
] as const;

export type RepoReadiness =
    | { kind: 'empty' }
    | { kind: 'storefront' }
    | { kind: 'not-a-storefront'; missing: string[] }
    | { kind: 'undetermined'; reason: string };

/** GitHub's message when a repo has no commits at all. */
function isEmptyRepoError(message: string): boolean {
    return /repository is empty/i.test(message);
}

/**
 * Probe one canonical file.
 *
 * Three outcomes, deliberately distinct: present, absent, or unknown. Folding
 * "unknown" into "absent" is what would let a network blip look like a repo
 * that needs wiping.
 */
async function probeFile(
    fileOps: Pick<GitHubFileOperations, 'getFileContent'>,
    owner: string,
    repo: string,
    filePath: string,
): Promise<'present' | 'absent' | 'empty-repo' | { error: string }> {
    try {
        const file = await fileOps.getFileContent(owner, repo, filePath);
        return file?.content !== undefined ? 'present' : 'absent';
    } catch (error) {
        const message = (error as Error).message ?? 'unknown error';
        return isEmptyRepoError(message) ? 'empty-repo' : { error: message };
    }
}

/**
 * Classify a repo by probing every canonical storefront file.
 *
 * All files are checked even once one is missing: reporting a single miss at a
 * time turns one fix into three round trips.
 *
 * @param fileOps - GitHub file reader
 * @param owner - Repo owner
 * @param repo - Repo name
 * @param logger - Receives the classification
 */
export async function classifyRepoForStorefront(
    fileOps: Pick<GitHubFileOperations, 'getFileContent'>,
    owner: string,
    repo: string,
    logger: Logger,
): Promise<RepoReadiness> {
    const results = await Promise.all(
        CANONICAL_STOREFRONT_FILES.map(async (f) => ({
            file: f,
            outcome: await probeFile(fileOps, owner, repo, f),
        })),
    );

    const failure = results.find((r) => typeof r.outcome === 'object');
    if (failure) {
        const reason = (failure.outcome as { error: string }).error;
        logger.warn(
            `[RepoReadiness] Could not read ${failure.file} from ${owner}/${repo}: ${reason}`,
        );
        return { kind: 'undetermined', reason };
    }

    if (results.every((r) => r.outcome === 'empty-repo')) {
        logger.info(`[RepoReadiness] ${owner}/${repo} is empty`);
        return { kind: 'empty' };
    }

    const missing = results.filter((r) => r.outcome !== 'present').map((r) => r.file);
    if (missing.length === 0) {
        logger.info(`[RepoReadiness] ${owner}/${repo} looks like an EDS storefront`);
        return { kind: 'storefront' };
    }

    logger.info(`[RepoReadiness] ${owner}/${repo} is populated but missing: ${missing.join(', ')}`);
    return { kind: 'not-a-storefront', missing };
}

/**
 * Whether the user should be asked before the repo is reset to the template.
 *
 * Only a real storefront has content worth preserving, so it is the only state
 * that warrants a prompt. An empty repo has nothing to lose. A populated
 * non-storefront is blocked rather than asked — consent is the wrong question
 * when the answer cannot make setup succeed. `undetermined` is likewise blocked:
 * nothing is known, so nothing may be destroyed.
 */
export function shouldAskBeforeReset(kind: RepoReadiness['kind']): boolean {
    return kind === 'storefront';
}
