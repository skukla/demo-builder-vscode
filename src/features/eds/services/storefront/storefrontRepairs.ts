/**
 * The storefront repairs: Demo Builder's own fixes that the build step puts into a storefront
 * whose code may still lack them, with how to see each problem and how to fix it.
 *
 * Creation, reset and a tested-boilerplate update all run them through one step
 * (`storefrontUpToDate.ts`), so a storefront ends the same whichever path it took. They are
 * needed there, not only once: a reset of a storefront built from a colleague's demo copies
 * the colleague's repository again, and that repository may still carry the old code.
 *
 * Each repair changes only text it recognises exactly: a 404 import map missing entries, a
 * retired fix in place verbatim, the code one of our live patches fixes, there exactly once.
 * Code someone changed no longer matches, so it is left as it is.
 *
 * An older storefront that has never been through that step is not repaired in place. It is
 * told to reset (`storefrontChanges.ts`, the "Needs reset" status).
 *
 * @module features/eds/services/storefront/storefrontRepairs
 */

import type { CodePatch } from '../patches/codePatchRegistry';
import { applyKnownPatches, knownPatchTargets } from '../patches/knownPatches';
import { retiredTargets, undoRetiredPatches, type RetiredCodePatch } from '../patches/retiredPatches';
import { alignNotFoundImportMap } from './notFoundPage';

/** What a repair reads. */
export interface StorefrontRepairFiles {
    /** The storefront's file at a path; undefined when it has none. */
    read(path: string): Promise<string | undefined>;
    /** The patches the ledgers retired (`readShippedPatches`). */
    retired: readonly RetiredCodePatch[];
    /** The patches the ledgers apply today (`readShippedPatches`). */
    known: readonly CodePatch[];
}

/** One known problem and its fix. */
export interface StorefrontRepair {
    id: string;
    /** Whether this storefront has the problem. Writes nothing. */
    check(files: StorefrontRepairFiles): Promise<boolean>;
    /** The files that fix it, with their new contents. */
    apply(files: StorefrontRepairFiles): Promise<Map<string, string>>;
}

/** The 404 page with the import-map entries head.html has and it lacks; null when none are. */
async function alignedNotFound(files: StorefrontRepairFiles): Promise<string | null> {
    const head = await files.read('head.html');
    const page = await files.read('404.html');
    return head !== undefined && page !== undefined ? alignNotFoundImportMap(head, page) : null;
}

/** The files retired fixes are in, undone. */
async function undoneRetired(files: StorefrontRepairFiles): Promise<Map<string, string>> {
    const contents = new Map<string, string>();
    for (const target of retiredTargets(files.retired)) {
        const content = await files.read(target);
        if (content !== undefined) contents.set(target, content);
    }
    return undoRetiredPatches(contents, files.retired).files;
}

/** The files the known patches change, patched where every patch on the file fits. */
async function withKnownPatches(files: StorefrontRepairFiles): Promise<Map<string, string>> {
    const contents = new Map<string, string>();
    for (const target of knownPatchTargets(files.known)) {
        const content = await files.read(target);
        if (content !== undefined) contents.set(target, content);
    }
    return applyKnownPatches(contents, files.known).files;
}

/** Every repair, in the order they run. */
export const STOREFRONT_REPAIRS: readonly StorefrontRepair[] = [
    {
        // 404.html's own import map lacked the dropins head.html loads (EDS-45).
        id: 'not-found-import-map',
        check: async (files) => (await alignedNotFound(files)) !== null,
        async apply(files) {
            const aligned = await alignedNotFound(files);
            return aligned === null ? new Map() : new Map([['404.html', aligned]]);
        },
    },
    {
        // Fixes the patches repo retired, taken back out verbatim (today the old `_HH`
        // product-link encoding, ADR-024).
        id: 'retired-patches',
        check: async (files) => (await undoneRetired(files)).size > 0,
        apply: undoneRetired,
    },
    {
        // Every live patch in our ledgers, wherever the code it fixes is there exactly once:
        // a colleague's storefront gets the fixes our own brands get (EDS-64). After the
        // retired undo, so a fix a ledger replaced goes in on the restored text.
        id: 'known-patches',
        check: async (files) => (await withKnownPatches(files)).size > 0,
        apply: withKnownPatches,
    },
];

/** A view of the files with what earlier repairs changed laid over the storefront's own. */
function overlay(files: StorefrontRepairFiles, changed: ReadonlyMap<string, string>): StorefrontRepairFiles {
    return { ...files, read: async (path) => changed.get(path) ?? files.read(path) };
}

/**
 * Run every repair the storefront needs, each seeing what the ones before it changed.
 *
 * @returns the changed files with their new contents, and the repairs that changed something
 */
export async function runStorefrontRepairs(
    files: StorefrontRepairFiles,
    repairs: readonly StorefrontRepair[] = STOREFRONT_REPAIRS,
): Promise<{ changed: Map<string, string>; done: StorefrontRepair[] }> {
    const changed = new Map<string, string>();
    const done: StorefrontRepair[] = [];
    for (const repair of repairs) {
        const view = overlay(files, changed);
        if (!(await repair.check(view))) continue;
        const fixed = await repair.apply(view);
        if (fixed.size === 0) continue;
        for (const [path, content] of fixed) changed.set(path, content);
        done.push(repair);
    }
    return { changed, done };
}
