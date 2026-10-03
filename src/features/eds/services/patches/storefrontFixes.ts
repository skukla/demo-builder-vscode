/**
 * Our fixes against a storefront repository's OWN files (EDS-13f): the state
 * of each fix, and, when asked, one commit of the ones that fit.
 *
 * Three callers share it: a saved package applies its ledger where it fits on
 * create and reset (step 02); a colleague's storefront that shows our lineage
 * is offered the fits, opt-in (step 03); the storefront report and diagnostics
 * show each fix's state (step 07).
 *
 * Unlike the shipped-brand path (`applyCanonicalCodePatches`, which reads the
 * TEMPLATE's files and skips `blocks/`), this reads the repository itself and
 * covers every target the patch policy allows, because what matters here is
 * the code this repository actually has.
 *
 * "Fits" is stricter than the engine's own test: the precondition must appear
 * EXACTLY ONCE. The engine replaces the first match; on code that is not the
 * boilerplate's, a second match means we cannot tell which one the fix was
 * written for, so the fix is refused rather than guessed (research §5 B: the
 * fit test is what makes touching someone else's code safe).
 *
 * @module features/eds/services/patches/storefrontFixes
 */

import { formatGitHubError } from '../errorFormatters';
import type { GitHubFileOperations } from '../github/githubFileOperations';
import type { GitHubTreeInput } from '../types';
import { applyCodePatches, getCodePatches, type CodePatch } from './codePatchRegistry';
import { checkPatchTarget } from './patchTargetPolicy';
import type { CodePatchSource } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';

/** One fix's state against the repository's code. */
export type FixState = 'applied' | 'fits' | 'missing' | 'target-missing' | 'unreadable';

export interface FixOutcome {
    patchId: string;
    target: string;
    state: FixState;
    /** Why a fix is missing or could not be read; for logs and the report, never a caveat. */
    reason?: string;
}

export interface FixRepository {
    owner: string;
    repo: string;
    branch: string;
}

export interface FixDeps {
    fileOps: Pick<GitHubFileOperations, 'getFileContent' | 'commitTreeToBranch'>;
    logger: Logger;
}

/** A file as read: its text, absent, or a read that failed. */
type ReadFile = { text: string } | { absent: true } | { error: string };

/**
 * Each fix's state against the repository's code. Writes nothing.
 *
 * @param deps - The GitHub reader and a logger
 * @param repository - The repository and the branch its code is on
 * @param patchIds - The fixes to check, in the order the answer keeps
 * @param source - The ledger they live in
 */
export async function checkFixes(
    deps: Pick<FixDeps, 'logger'> & { fileOps: Pick<GitHubFileOperations, 'getFileContent'> },
    repository: FixRepository,
    patchIds: string[],
    source: CodePatchSource,
): Promise<FixOutcome[]> {
    return (await evaluate(deps, repository, patchIds, source)).outcomes;
}

/**
 * Apply the fixes that fit, in ONE commit ("Demo Builder: N fixes", the ids in
 * the body). Nothing is written when nothing fits.
 *
 * @returns Every fix's state after the write, the ids written, and the commit
 */
export async function applyFixes(
    deps: FixDeps,
    repository: FixRepository,
    patchIds: string[],
    source: CodePatchSource,
): Promise<{ outcomes: FixOutcome[]; applied: string[]; commitSha?: string }> {
    const { outcomes, files, before } = await evaluate(deps, repository, patchIds, source);
    const applied = outcomes.filter((o) => o.state === 'fits').map((o) => o.patchId);
    if (applied.length === 0) return { outcomes, applied };

    const entries: GitHubTreeInput[] = [];
    for (const [path, text] of files) {
        if (before.get(path) !== text) entries.push({ path, mode: '100644', type: 'blob', content: text });
    }
    const message = `Demo Builder: ${applied.length} ${applied.length === 1 ? 'fix' : 'fixes'}\n\n${applied.join('\n')}`;
    const commitSha = await deps.fileOps.commitTreeToBranch(
        repository.owner,
        repository.repo,
        repository.branch,
        entries,
        message,
    );
    deps.logger.info(
        `[StorefrontFixes] ${repository.owner}/${repository.repo}: ${applied.join(', ')} in ${commitSha.substring(0, 7)}`,
    );
    return {
        outcomes: outcomes.map((o) => (o.state === 'fits' ? { ...o, state: 'applied' } : o)),
        applied,
        commitSha,
    };
}

/** Read every target once, then run each fix in order on the working set, as the engine composes them. */
async function evaluate(
    deps: Pick<FixDeps, 'logger'> & { fileOps: Pick<GitHubFileOperations, 'getFileContent'> },
    repository: FixRepository,
    patchIds: string[],
    source: CodePatchSource,
): Promise<{ outcomes: FixOutcome[]; files: Map<string, string>; before: Map<string, string> }> {
    const files = new Map<string, string>();
    const patches = await getCodePatches(patchIds, source, deps.logger);
    if (patches.length === 0) {
        const reason = 'The fix list could not be read';
        return { outcomes: patchIds.map((patchId) => ({ patchId, target: '', state: 'unreadable', reason })), files, before: new Map() };
    }

    const reads = await readTargets(deps, repository, patches);
    for (const [path, read] of reads) if ('text' in read) files.set(path, read.text);
    const before = new Map(files);

    const byId = new Map(patches.map((p) => [p.id, p]));
    const outcomes: FixOutcome[] = [];
    for (const patchId of patchIds) {
        const patch = byId.get(patchId);
        outcomes.push(
            patch
                ? await evaluateOne(patch, reads.get(patch.target), files, source, deps.logger)
                : { patchId, target: '', state: 'unreadable', reason: 'Not in the fix list' },
        );
    }
    return { outcomes, files, before };
}

async function readTargets(
    deps: Pick<FixDeps, 'logger'> & { fileOps: Pick<GitHubFileOperations, 'getFileContent'> },
    repository: FixRepository,
    patches: CodePatch[],
): Promise<Map<string, ReadFile>> {
    const reads = new Map<string, ReadFile>();
    for (const { target } of patches) {
        if (reads.has(target) || !checkPatchTarget(target).allowed) continue;
        try {
            const file = await deps.fileOps.getFileContent(repository.owner, repository.repo, target, repository.branch);
            reads.set(target, file ? { text: file.content } : { absent: true });
        } catch (error) {
            deps.logger.debug(`[StorefrontFixes] Could not read ${target}: ${(error as Error).message}`);
            // The reason reaches the storefront report, so it is GitHub's failure in an SC's
            // words; the raw text stays in Debug Logs above.
            reads.set(target, { error: formatGitHubError(error as Error).userMessage });
        }
    }
    return reads;
}

async function evaluateOne(
    patch: CodePatch,
    read: ReadFile | undefined,
    files: Map<string, string>,
    source: CodePatchSource,
    logger: Logger,
): Promise<FixOutcome> {
    const base = { patchId: patch.id, target: patch.target };
    const policy = checkPatchTarget(patch.target);
    if (!policy.allowed) return { ...base, state: 'missing', reason: policy.reason };
    if (!read || 'error' in read) return { ...base, state: 'unreadable', reason: read && 'error' in read ? read.error : undefined };
    if ('absent' in read) return { ...base, state: 'target-missing' };

    const current = files.get(patch.target) ?? '';
    // Present first: a replacement that keeps its precondition (an added guard
    // around the original line) would otherwise read as "fits" again, forever.
    if (current.includes(patch.replacement)) return { ...base, state: 'applied' };
    if (current.split(patch.precondition).length > 2) {
        return { ...base, state: 'missing', reason: 'The code it fixes appears more than once' };
    }
    const [result] = await applyCodePatches(files, [patch.id], source, logger);
    if (!result?.applied) return { ...base, state: 'missing', reason: result?.reason };
    return { ...base, state: result.alreadyApplied ? 'applied' : 'fits' };
}
