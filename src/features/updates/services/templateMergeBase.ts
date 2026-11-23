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
import { knownPlain } from '@/core/utils/plainText';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { TemplateSyncStepError } from '@/features/updates/services/templateSyncStepError';
import type { Logger } from '@/types/logger';

/** Run one git command in the temp clone with the given timeout. */
export type GitStep = (command: string, timeout: number) => Promise<CommandResult>;

/** How applying the template's change ended. Only `applied` leaves anything to commit. */
type TemplateChangeOutcome =
    | { kind: 'applied'; templateHead: string }
    | { kind: 'unchanged'; templateHead: string }
    | { kind: 'not-in-template' }
    | { kind: 'conflicts'; conflicts: string[]; restored: boolean; templateHead: string }
    | { kind: 'failed'; reason: string };

/**
 * Left out of every template change: the template's own CI. A repository generated from the
 * B2B template has none of Adobe's workflows (its cleanup-on-create workflow deletes them),
 * so applying Adobe's edits to them stops the update on files the storefront does not have.
 * Measured 2026-10-20: 14 such edits between 71a67e0 and the tested 48bed04, and our own
 * storefront repositories keep only `sync-from-upstream.yml`. A storefront's own workflows
 * are its owner's business, not the template's.
 */
const NEVER_APPLIED = ['.github'];

/**
 * Universal Editor files Adobe deleted from its Commerce templates (EDS-71: B2B template
 * 677106e0). Demo Builder still builds the DA.live block library from
 * `component-definition.json` and adds its own entries (Catalog Menu, block libraries) to
 * all three, so when the template deletes one the storefront's copy is kept. Applying the
 * deletion would empty the block library on the next reset or refresh, and when the
 * storefront had changed the file it failed the whole update with git's "patch failed"
 * (a colleague's storefront, 2026-11-23). Leaves this list when EDS-71 moves the library
 * to DA.live content.
 */
const KEPT_WHEN_THE_TEMPLATE_DELETES = [
    'component-definition.json',
    'component-models.json',
    'component-filters.json',
];

/**
 * How the template's deletions meet the storefront. `skip` are left out of the change: a
 * kept Universal Editor file, or one the storefront no longer has. `clashes` are files the
 * storefront changed that the template deletes: git cannot apply that deletion and marks
 * no conflict, and no fix can be applied in the storefront's copy either, so the update
 * stops before anything is applied and says so by name. `unsafe` are names that cannot be
 * put inside double quotes safely in both shells a step may run in (bash, and cmd.exe on
 * Windows): they are never put in a command, and the update stops on them.
 */
interface DeletionPlan {
    skip: string[];
    clashes: string[];
    unsafe: string[];
}

/**
 * Whether `file` can go inside double quotes in a git step. Steps run in bash, or cmd.exe on
 * Windows (`DEFAULT_SHELL`): bash expands `"` `$` backtick `\` there, cmd.exe `"` and `%`
 * (and `!` when delayed expansion is on), and a line break ends the command in both. File names come from repositories, so a name
 * holding any of these never reaches a command.
 */
export function safeInQuotes(file: string): boolean {
    return !/["$`\\%!\r\n]/.test(file);
}

/**
 * The change's pathspec: everything, minus what is never applied, preserved, or skipped.
 * Skipped names are excluded literally, so a `*`, `?` or `[` in one cannot hide other files.
 */
function pathspecFor(request: Pick<TemplateChangeRequest, 'preserveFiles'>, skip: string[] = []): string {
    const excludes = [...NEVER_APPLIED, ...request.preserveFiles].map((file) => `":(exclude)${file}"`);
    const skipped = skip.map((file) => `":(exclude,literal)${file}"`);
    return ['.', ...excludes, ...skipped].join(' ');
}

async function planDeletions(
    git: GitStep,
    range: { base: string; target: string },
    request: Pick<TemplateChangeRequest, 'preserveFiles'>,
): Promise<DeletionPlan> {
    // The same files the patch leaves out are never asked about. `-z` names each file
    // exactly as stored, never C-quoted.
    const listed = await git(
        `git diff-tree -r -z --name-only --diff-filter=D ${range.base} ${range.target} -- ${pathspecFor(request)}`,
        TIMEOUTS.NORMAL,
    );
    if (listed.code !== 0) {
        throw new TemplateSyncStepError("Could not compare the template's versions.", listed.stderr);
    }
    const deleted = listed.stdout.split('\0').filter(Boolean);
    const plan: DeletionPlan = { skip: [], clashes: [], unsafe: [] };
    if (deleted.length === 0) return plan;
    const tracked = await git(`git ls-files -z`, TIMEOUTS.QUICK);
    if (tracked.code !== 0) {
        throw new TemplateSyncStepError("Could not read the storefront's files.", tracked.stderr);
    }
    const has = new Set(tracked.stdout.split('\0').filter(Boolean));
    for (const file of deleted) {
        if (!safeInQuotes(file)) {
            plan.unsafe.push(file);
        } else if (KEPT_WHEN_THE_TEMPLATE_DELETES.includes(file) || !has.has(file)) {
            plan.skip.push(file);
        } else if (await storefrontChanged(git, range.base, file)) {
            plan.clashes.push(file);
        }
    }
    return plan;
}

/** Whether the storefront's `file` differs from the template's at `base`. git's 1 is "yes". */
async function storefrontChanged(git: GitStep, base: string, file: string): Promise<boolean> {
    const compared = await git(`git diff --quiet ${base} -- "${file}"`, TIMEOUTS.QUICK);
    if (compared.code === 0) return false;
    if (compared.code === 1) return true;
    throw new TemplateSyncStepError(`Could not compare ${file} with the template's.`, compared.stderr);
}

/** Whether the update must stop on the template's deletions. */
function mustStop(plan: DeletionPlan): boolean {
    return plan.clashes.length + plan.unsafe.length > 0;
}

/**
 * git's reason for a stop on deleted files, in the words `mergeFailureLine` wraps. The update
 * reads the storefront from GitHub, and its recorded version does not move until an update
 * succeeds, so only a file deleted there, or put back as the template had it, lets it through.
 */
function deletionReason(plan: DeletionPlan): string {
    const parts: string[] = [];
    if (plan.clashes.length > 0) {
        const it = plan.clashes.length === 1 ? 'it' : 'them';
        parts.push(
            `the template deletes ${plan.clashes.join(', ')}, which this storefront changed. `
            + `Delete ${it} from the storefront's repository on GitHub `
            + `(save a copy first if you need ${it}) `
            + `or put ${it} back as the template had ${it}, then update again`,
        );
    }
    // The name stops the update whatever the storefront does with the file, because the
    // recorded version does not move: only a reset, which records a new one, gets past it.
    if (plan.unsafe.length > 0) {
        const whose = plan.unsafe.length === 1 ? 'whose name' : 'whose names';
        parts.push(
            `the template deletes ${plan.unsafe.join(', ')}, ${whose} Demo Builder cannot handle `
            + 'safely. Reset the storefront to take this update',
        );
    }
    return parts.join('; ');
}

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

/**
 * The line an SC reads when a template merge failed: git's reason in plain words when its meaning
 * is known (`knownPlain`, the core translations; walk F295), else as git said it until the update
 * errors are typed (PL-102 slice 4). git's own words go to the log either way.
 *
 * @param reason - git's reason (`gitReason`)
 * @param logger - where git's own words go
 */
export function mergeFailureLine(reason: string, logger?: Pick<Logger, 'warn'>): string {
    logger?.warn(`[TemplateSync] The merge failed: ${reason}`);
    return knownPlain(reason) ?? `The template update could not be applied: ${reason}.`;
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
    skip: string[] = [],
): Promise<boolean> {
    const pathspec = pathspecFor(request, skip);
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

/** The files git left unmerged; empty when it names none. */
async function unmergedFiles(git: GitStep): Promise<string[]> {
    const unmerged = await git(`git diff --name-only --diff-filter=U`, TIMEOUTS.QUICK);
    return unmerged.code === 0 ? unmerged.stdout.trim().split('\n').filter(Boolean) : [];
}

/** A 3-way apply that did not succeed: conflicts (clone restored) or git's reason. */
async function explainUnapplied(git: GitStep, stderr: string, templateHead: string): Promise<TemplateChangeOutcome> {
    const conflicts = await unmergedFiles(git);
    if (conflicts.length === 0) {
        return { kind: 'failed', reason: gitReason(stderr) };
    }
    const restored = await git(`git reset --hard HEAD`, TIMEOUTS.QUICK);
    return { kind: 'conflicts', conflicts, restored: restored.code === 0, templateHead };
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
    if (templateHead === base) return { kind: 'unchanged', templateHead };
    const deletions = await planDeletions(git, { base, target: templateHead }, request);
    // Not a conflict: Fix with AI cannot resolve a deletion in the storefront's copy, so the
    // stop names the files and what to do. Nothing has been applied yet.
    if (mustStop(deletions)) {
        return { kind: 'failed', reason: deletionReason(deletions) };
    }
    if (!(await writePatch(git, `${base} ${templateHead}`, request, deletions.skip))) {
        return { kind: 'unchanged', templateHead };
    }

    const applied = await git(`git apply --3way --index "${patchFile}"`, TIMEOUTS.NORMAL);
    if (applied.code !== 0) {
        return explainUnapplied(git, applied.stderr, templateHead);
    }
    return { kind: 'applied', templateHead };
}

/** How applying a change and keeping its clashes ended (EDS-57). */
export type KeptChangeOutcome =
    | { kind: 'kept'; conflicts: string[] }
    | { kind: 'applied' }
    | { kind: 'unchanged' }
    | { kind: 'failed'; reason: string };

/**
 * Apply the change between two commits already present in the repository, 3-way, and
 * LEAVE any clash in the working tree with git's markers: the clean files staged, the
 * clashing ones unmerged. For the project's local storefront copy, where the SC's AI
 * fixes the clash (EDS-57). Base and target are not re-checked against the template's
 * history: the throwaway clone's apply did that before a clash was ever kept.
 */
export async function applyChangeKeepingConflicts(
    git: GitStep,
    request: Omit<TemplateChangeRequest, 'target'> & { target: string },
): Promise<KeptChangeOutcome> {
    const deletions = await planDeletions(git, request, request);
    // A deletion of an edited file leaves nothing in the working tree to fix, so it is
    // reported by name rather than kept as a clash with markers.
    if (mustStop(deletions)) {
        return { kind: 'failed', reason: deletionReason(deletions) };
    }
    if (!(await writePatch(git, `${request.base} ${request.target}`, request, deletions.skip))) {
        return { kind: 'unchanged' };
    }
    const applied = await git(`git apply --3way --index "${request.patchFile}"`, TIMEOUTS.NORMAL);
    if (applied.code === 0) return { kind: 'applied' };
    const conflicts = await unmergedFiles(git);
    return conflicts.length > 0 ? { kind: 'kept', conflicts } : { kind: 'failed', reason: gitReason(applied.stderr) };
}
