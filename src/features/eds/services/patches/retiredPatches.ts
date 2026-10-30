/**
 * Taking a retired code patch back out of a storefront (EDS-62).
 *
 * The patches repo lists a patch it retired under `retired` in the same ledger, with the
 * fields it had while live plus `retiredBy` and `reason`. A storefront made while it was live
 * still carries it, and no update removes it: an update only ever adds. Undoing it is the apply
 * run backwards, the `replacement` text becomes the `precondition` text again.
 *
 * Only Demo Builder's own text is taken out. The replacement must be in the file verbatim and
 * exactly once: a block the SC edited, or one that appears twice, is left as it is. The target
 * must pass the same {@link checkPatchTarget} policy an apply does, because an undo writes the
 * ledger's text into the repository just as an apply does.
 *
 * @module features/eds/services/patches/retiredPatches
 */

import type { CodePatch } from './codePatchRegistry';
import { checkPatchTarget } from './patchTargetPolicy';

/** A patch the ledger retired: its fields while live, the commit that retired it, and why. */
export interface RetiredCodePatch extends CodePatch {
    /** The patches-repo commit that retired it. */
    retiredBy: string;
    /** Why it was retired, for logs; never shown to the SC. */
    reason: string;
}

/** What an undo did to a set of files. */
export interface RetiredUndo {
    /** Only the files that changed, with their new contents. */
    files: Map<string, string>;
    /** The ids taken out, in ledger order. */
    undone: string[];
    /** Fixes in a file that were left, and why: the target is refused, or the text is there twice. */
    skipped: Array<{ patchId: string; reason: string }>;
}

/** How many times `needle` occurs in `text`, without overlaps. */
function occurrences(text: string, needle: string): number {
    return text.split(needle).length - 1;
}

/** Why one patch cannot be taken out of these files, or undefined when it can. */
function blocker(files: ReadonlyMap<string, string>, patch: CodePatch): string | undefined {
    const content = files.get(patch.target);
    // An empty replacement is in every file; it can never prove the fix is ours.
    if (content === undefined || !patch.replacement || !content.includes(patch.replacement)) return 'absent';
    const policy = checkPatchTarget(patch.target);
    if (!policy.allowed) return policy.reason ?? 'Target refused';
    if (occurrences(content, patch.replacement) > 1) return 'The fix appears more than once';
    return undefined;
}

/** The retired list in groups that were retired together (one `retiredBy`), ledger order kept. */
function retiredTogether(retired: readonly RetiredCodePatch[]): RetiredCodePatch[][] {
    const groups = new Map<string, RetiredCodePatch[]>();
    for (const patch of retired) {
        const group = groups.get(patch.retiredBy) ?? [];
        group.push(patch);
        groups.set(patch.retiredBy, group);
    }
    return [...groups.values()];
}

/**
 * Undo each retired patch whose replacement a file holds verbatim, exactly once. Pure: the
 * map given is not changed. Several retired patches on one file compose, in ledger order.
 *
 * Patches retired in one commit come out together or not at all. They were usually one
 * change split in two (on 2026-10-06, a helper and the link that calls it); taking out the
 * helper while the SC's edited link still calls it would break every product link, which is
 * worse than leaving both. So when any of a group cannot come out, none of it does.
 *
 * @param files - repository-relative path to the file's current text
 * @param retired - the ledger's retired list
 * @returns the changed files, the ids undone, and the ones left with why
 */
export function undoRetiredPatches(
    files: ReadonlyMap<string, string>,
    retired: readonly RetiredCodePatch[],
): RetiredUndo {
    return undoPatchGroups(files, retiredTogether(retired));
}

/**
 * Undo patches group by group: a group comes out together or not at all, and each patch only
 * where its replacement is in the file verbatim, exactly once. Pure. The retired undo above
 * groups by the commit that retired them; an update setting Demo Builder's live fixes aside
 * groups by file (`setAsidePieces.ts`).
 *
 * @param files - repository-relative path to the file's current text
 * @param groups - the patches, in the groups that must come out together
 * @returns the changed files, the ids undone, and the ones left with why
 */
export function undoPatchGroups(
    files: ReadonlyMap<string, string>,
    groups: ReadonlyArray<readonly CodePatch[]>,
): RetiredUndo {
    const working = new Map(files);
    const result: RetiredUndo = { files: new Map(), undone: [], skipped: [] };
    for (const group of groups) {
        const reasons = group.map((patch) => ({ patch, reason: blocker(working, patch) }));
        // A storefront that never had this fix: nothing to say.
        if (reasons.every((r) => r.reason === 'absent')) continue;
        const stuck = reasons.filter((r) => r.reason !== undefined);
        if (stuck.length > 0) {
            for (const { patch, reason } of reasons) {
                const why = reason === undefined || reason === 'absent'
                    ? 'Part of the same fix was changed, so none of it was taken out'
                    : reason;
                result.skipped.push({ patchId: patch.id, reason: why });
            }
            continue;
        }
        for (const patch of group) {
            const content = working.get(patch.target) as string;
            // Sliced, not String.replace: a `$&` in the ledger's text must stay literal.
            const at = content.indexOf(patch.replacement);
            const next = content.slice(0, at) + patch.precondition + content.slice(at + patch.replacement.length);
            working.set(patch.target, next);
            result.files.set(patch.target, next);
            result.undone.push(patch.id);
        }
    }
    return result;
}

/** Each distinct target a retired list names that the policy allows: the files worth reading. */
export function retiredTargets(retired: readonly RetiredCodePatch[]): string[] {
    return [...new Set(retired.map((p) => p.target))].filter((target) => checkPatchTarget(target).allowed);
}
