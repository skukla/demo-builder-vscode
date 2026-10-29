/**
 * The code patches every shipped ledger lists: the live ones, and the retired ones (EDS-62).
 *
 * A storefront's code can come from any of our ledgers' families (a colleague's storefront,
 * a package that changed family), so every distinct ledger the shipped catalog names is read,
 * not only the project's own. That is safe because both uses need the ledger's text verbatim
 * in the file: an apply needs the precondition there exactly once (`knownPatches.ts`), an undo
 * the replacement (`retiredPatches.ts`). A ledger whose text is not there changes nothing.
 *
 * Read at the same ref and through the same cache as the live patches
 * (`fetchExternalLedger`). A ledger that cannot be read costs its own entries only, with a
 * warning. The ledger is public input, so each entry's shape is checked before it is used.
 *
 * @module features/eds/services/patches/shippedPatchLedger
 */

import type { CodePatch } from './codePatchRegistry';
import { fetchExternalLedger } from './externalPatchFetcher';
import type { RetiredCodePatch } from './retiredPatches';
import { bundledDemoPackages } from '@/features/components/services/storefrontResolver';
import type { CodePatchSource, DemoPackage } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';

const CODE_PATCHES_FILENAME = 'code-patches.json';

/** What every shipped ledger lists, once each by id. */
export interface ShippedPatches {
    /** The patches the ledgers apply today. */
    live: CodePatch[];
    /** The patches they retired, which Demo Builder takes back out. */
    retired: RetiredCodePatch[];
    /**
     * Whether every ledger was read. False means some fixes may be missing from both lists,
     * so a storefront built from them cannot be called current.
     */
    complete: boolean;
}

/** Every distinct code-patch ledger the catalog's storefronts name, in catalog order. */
export function shippedCodePatchSources(packages: readonly DemoPackage[] = bundledDemoPackages): CodePatchSource[] {
    const seen = new Map<string, CodePatchSource>();
    for (const pkg of packages) {
        for (const storefront of Object.values(pkg.storefronts)) {
            const source = storefront.codePatchSource;
            if (source) seen.set(`${source.owner}/${source.repo}/${source.path}`, source);
        }
    }
    return [...seen.values()];
}

/** Whether a ledger entry has the fields an apply and an undo read, as text. */
function isPatchEntry(value: unknown): value is CodePatch {
    if (typeof value !== 'object' || value === null) return false;
    const entry = value as Record<string, unknown>;
    return ['id', 'target', 'precondition', 'replacement'].every((key) => typeof entry[key] === 'string');
}

/** Whether two ledgers' entries for one id would write the same text. */
function sameFix(a: CodePatch, b: CodePatch): boolean {
    return a.target === b.target && a.precondition === b.precondition && a.replacement === b.replacement;
}

/**
 * Add one ledger's live entries. An id two ledgers list with different text is dropped from
 * both, with a warning: which of them a storefront needs cannot be told from here.
 */
function addLive(found: Map<string, CodePatch | null>, patches: readonly unknown[], logger: Logger): void {
    for (const entry of patches) {
        if (!isPatchEntry(entry)) continue;
        const known = found.get(entry.id);
        if (known === undefined) found.set(entry.id, entry);
        else if (known !== null && !sameFix(known, entry)) {
            logger.warn(`[ShippedPatch] '${entry.id}' differs between ledgers; it is applied only where its own ledger is`);
            found.set(entry.id, null);
        }
    }
}

/**
 * The live and retired patches across the shipped ledgers. A retired entry whose id any ledger
 * still lists as live is dropped: undoing it would fight the apply.
 *
 * @param logger - fetch lines and a warning per ledger that could not be read
 * @param packages - the catalog; defaults to the bundled one
 */
export async function readShippedPatches(
    logger: Logger,
    packages: readonly DemoPackage[] = bundledDemoPackages,
): Promise<ShippedPatches> {
    const live = new Map<string, CodePatch | null>();
    const retired = new Map<string, RetiredCodePatch>();
    let complete = true;
    for (const source of shippedCodePatchSources(packages)) {
        try {
            const ledger = await fetchExternalLedger<unknown, unknown>(source, CODE_PATCHES_FILENAME, logger);
            addLive(live, ledger.patches, logger);
            for (const entry of ledger.retired) {
                if (isPatchEntry(entry) && !retired.has(entry.id)) retired.set(entry.id, entry as RetiredCodePatch);
            }
        } catch (error) {
            complete = false;
            logger.warn(`[ShippedPatch] Could not read ${source.path}/${CODE_PATCHES_FILENAME}: ${(error as Error).message}`);
        }
    }
    for (const id of live.keys()) retired.delete(id);
    return {
        live: [...live.values()].filter((p): p is CodePatch => p !== null),
        retired: [...retired.values()],
        complete,
    };
}
