/**
 * Apply a template's change SINCE a recorded version onto a clone of the SC's repo.
 *
 * Why not `git merge`: a repository GitHub generates from a template has its own
 * root commit and shares no history with the template, so git refuses the merge
 * ("refusing to merge unrelated histories"). The storefront's recorded template
 * version (`lastSyncedCommit`) is the base instead: the template's diff from that
 * commit to its latest commit is applied 3-way, which keeps the SC's own edits and
 * leaves unmerged files where they collide with the template's.
 *
 * Every step's exit code decides something; nothing here pushes. The caller
 * (`templateSyncService.ts`) owns the clone, the preserved-file backups, the commit
 * and the push, and turns each outcome into the sentence the SC reads.
 *
 * Known limit: the template branch is always `main` (no branch is recorded).
 */

import type { CommandResult } from '@/core/shell/types';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { TemplateSyncStepError } from '@/features/updates/services/templateSyncStepError';

/** Run one git command in the temp clone with the given timeout. */
export type GitStep = (command: string, timeout: number) => Promise<CommandResult>;

/** How applying the template's change ended. Only `applied` leaves anything to commit. */
type TemplateChangeOutcome =
    | { kind: 'applied'; templateHead: string }
    | { kind: 'unchanged'; templateHead: string }
    | { kind: 'not-in-template' }
    | { kind: 'conflicts'; conflicts: string[]; restored: boolean }
    | { kind: 'failed'; reason: string };

interface TemplateChangeRequest {
    /** The recorded template version the change is measured from. */
    base: string;
    /** Files left out of the change: the SC's version of those always wins. */
    preserveFiles: string[];
    /** Where the patch is written — outside the clone's working tree. */
    patchFile: string;
    /**
     * The template version to bring the storefront up to. Absent: the template's
     * latest commit. A thin-layer storefront passes its patches repo's tested
     * version (ADR-006), never the latest, which nothing has checked its patches
     * against (owner, 2026-10-16).
     */
    target?: string;
}

/** git's own reason for a failure: its first error line, without the `error:` prefix. */
function gitReason(stderr: string): string {
    const lines = stderr.split('\n').map((line) => line.trim()).filter(Boolean);
    const marked = lines.find((line) => /^(error|fatal):/.test(line));
    const reason = marked ?? lines[0] ?? 'git gave no reason';
    return reason.replace(/^(error|fatal):\s*/, '').replace(/\.$/, '');
}

/** The template's latest fetched commit. Throws when git cannot name it. */
export async function readTemplateHead(git: GitStep): Promise<string> {
    const head = await git(`git rev-parse template/main`, TIMEOUTS.QUICK);
    const sha = head.stdout.trim();
    if (head.code !== 0 || !sha) {
        throw new TemplateSyncStepError("Could not read the template's latest commit.", head.stderr);
    }
    return sha;
}

/**
 * Whether `sha` is one of the template's commits. The old merge recorded the SC's
 * OWN head; diffing from that would replay "turn this storefront into the
 * template" over the SC's edits, so a commit that shares no history with the
 * template is refused.
 *
 * A commit the template later REWROTE still counts: it shares history with `main`
 * without being on it. adobe-commerce/boilerplate-b2b-template re-creates its top
 * two commits on every upstream sync (2026-10-14: e3f979b became b3bdb016b), and
 * the diff from the old one to the new head is still the template's own change.
 */
async function isTemplateCommit(git: GitStep, sha: string): Promise<boolean> {
    const present = async () =>
        (await git(`git cat-file -e "${sha}^{commit}"`, TIMEOUTS.QUICK)).code === 0;
    if (!(await present())) {
        // The fetch's own exit code is not the verdict: the re-check is.
        await git(`git fetch template ${sha}`, TIMEOUTS.LONG);
        if (!(await present())) return false;
    }
    const shared = await git(`git merge-base ${sha} template/main`, TIMEOUTS.NORMAL);
    return shared.code === 0;
}

/**
 * Write the change between two commits to `patchFile`, preserved files left out.
 * Returns false when nothing else changed. `diff-tree` is plumbing: unlike
 * `git diff`, it ignores the user's diff config (prefixes, colour, external diff)
 * that would corrupt the patch.
 */
async function writePatch(
    git: GitStep,
    range: string,
    request: TemplateChangeRequest,
): Promise<boolean> {
    const excludes = request.preserveFiles.map((file) => `":(exclude)${file}"`);
    const pathspec = ['.', ...excludes].join(' ');
    const listChanged = `git diff-tree -r --name-only ${range} -- ${pathspec}`;
    const changed = await git(listChanged, TIMEOUTS.NORMAL);
    if (changed.code !== 0) {
        throw new TemplateSyncStepError("Could not compare the template's versions.", changed.stderr);
    }
    if (!changed.stdout.trim()) return false;

    const output = `--output="${request.patchFile}"`;
    const diff = await git(
        `git diff-tree -r -p --binary --full-index ${output} ${range} -- ${pathspec}`,
        TIMEOUTS.NORMAL,
    );
    if (diff.code !== 0) {
        throw new TemplateSyncStepError("Could not prepare the template's change.", diff.stderr);
    }
    return true;
}

/** A 3-way apply that did not succeed: conflicts (clone restored) or git's reason. */
async function explainUnapplied(git: GitStep, stderr: string): Promise<TemplateChangeOutcome> {
    const unmerged = await git(`git diff --name-only --diff-filter=U`, TIMEOUTS.QUICK);
    const conflicts = unmerged.code === 0 ? unmerged.stdout.trim().split('\n').filter(Boolean) : [];
    if (conflicts.length === 0) {
        return { kind: 'failed', reason: gitReason(stderr) };
    }
    const restored = await git(`git reset --hard HEAD`, TIMEOUTS.QUICK);
    return { kind: 'conflicts', conflicts, restored: restored.code === 0 };
}

/**
 * Apply the template's change from `request.base` to `request.target` (default: the
 * template's latest commit) onto the clone's working tree and index. Pushes nothing.
 */
export async function applyTemplateChangeSince(
    git: GitStep,
    request: TemplateChangeRequest,
): Promise<TemplateChangeOutcome> {
    const { base, patchFile } = request;
    if (!(await isTemplateCommit(git, base))) {
        return { kind: 'not-in-template' };
    }

    // A target the template no longer carries cannot be measured to: refuse it
    // rather than fall back to the latest commit, which is exactly what it replaces.
    if (request.target && !(await isTemplateCommit(git, request.target))) {
        return { kind: 'failed', reason: `the tested template version ${request.target.slice(0, 7)} could not be fetched` };
    }
    const templateHead = request.target ?? (await readTemplateHead(git));
    if (templateHead === base || !(await writePatch(git, `${base} ${templateHead}`, request))) {
        return { kind: 'unchanged', templateHead };
    }

    const applied = await git(`git apply --3way --index "${patchFile}"`, TIMEOUTS.NORMAL);
    if (applied.code !== 0) {
        return explainUnapplied(git, applied.stderr);
    }
    return { kind: 'applied', templateHead };
}
