/**
 * Applying our known code patches to any storefront Demo Builder builds (EDS-64, owner
 * 2026-10-23: "any patch we have that we know should be and can be applied SHOULD be applied
 * to any storefront used by the builder").
 *
 * "Known" is every live patch in the shipped ledgers (`shippedPatchLedger.ts`): one list,
 * the one we already keep for our own brands and test against Adobe's template every day.
 * There is no second list for colleague storefronts.
 *
 * "Can be applied" is stricter than the engine's own test (`codePatchRegistry.ts`), because
 * this reaches code Demo Builder did not write:
 *   - the precondition must be in the file EXACTLY ONCE: a second match means we cannot tell
 *     which the fix was written for, so it is left rather than guessed;
 *   - a patch already in the file counts as fitting and writes nothing;
 *   - the target must pass the same {@link checkPatchTarget} policy an apply does;
 *   - every patch on one file goes in together, or none does. Patches on one file were usually
 *     one change split in parts (the product teaser's link and the import it calls); writing
 *     the link without its import would break the block, which is worse than leaving both.
 *
 * Pure: the map given is not changed.
 *
 * @module features/eds/services/patches/knownPatches
 */

import { isAlreadyApplied, type CodePatch } from './codePatchRegistry';
import { checkPatchTarget } from './patchTargetPolicy';

/** What applying the known patches did to a set of files. */
export interface KnownPatchApply {
    /** Only the files that changed, with their new contents. */
    files: Map<string, string>;
    /** The ids written by this apply, in ledger order; not ones already in the code. */
    applied: string[];
}

/** How many times `needle` occurs in `text`, without overlaps. */
function occurrences(text: string, needle: string): number {
    return text.split(needle).length - 1;
}

/** The known patches grouped by the file they change, ledger order kept. */
function byTarget(patches: readonly CodePatch[]): Map<string, CodePatch[]> {
    const groups = new Map<string, CodePatch[]>();
    for (const patch of patches) {
        const group = groups.get(patch.target) ?? [];
        group.push(patch);
        groups.set(patch.target, group);
    }
    return groups;
}

/**
 * One file with every patch on it applied, or undefined when any of them does not fit.
 *
 * @returns the new text and the ids written
 */
function patchedFile(content: string, group: readonly CodePatch[]): { text: string; applied: string[] } | undefined {
    let text = content;
    const applied: string[] = [];
    for (const patch of group) {
        if (!patch.precondition) return undefined;
        if (isAlreadyApplied(text, patch)) continue;
        if (occurrences(text, patch.precondition) !== 1) return undefined;
        // Sliced, not String.replace: a `$&` in the ledger's text must stay literal.
        const at = text.indexOf(patch.precondition);
        text = text.slice(0, at) + patch.replacement + text.slice(at + patch.precondition.length);
        applied.push(patch.id);
    }
    return { text, applied };
}

/**
 * Apply each known patch whose file fits it.
 *
 * @param files - repository-relative path to the file's current text
 * @param patches - the shipped ledgers' live patches
 * @returns the changed files, and the ids written
 */
export function applyKnownPatches(files: ReadonlyMap<string, string>, patches: readonly CodePatch[]): KnownPatchApply {
    const result: KnownPatchApply = { files: new Map(), applied: [] };
    for (const [target, group] of byTarget(patches)) {
        const content = files.get(target);
        if (content === undefined || !checkPatchTarget(target).allowed) continue;
        const patched = patchedFile(content, group);
        if (!patched || patched.applied.length === 0) continue;
        result.files.set(target, patched.text);
        result.applied.push(...patched.applied);
    }
    return result;
}

/** Each distinct target the known patches name that the policy allows: the files worth reading. */
export function knownPatchTargets(patches: readonly CodePatch[]): string[] {
    return [...new Set(patches.map((p) => p.target))].filter((target) => checkPatchTarget(target).allowed);
}
