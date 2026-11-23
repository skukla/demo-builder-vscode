/**
 * What the library writer needs around the sheet it writes: the older sheet files previous runs
 * left in `.da/library/`, and the warning when the site config does not take the lists.
 */

import type { DaLiveSourceOperations } from '@/features/eds/services/daLive/daLiveSourceOperations';

/** The blocks sheet every build writes. */
export const BLOCKS_SHEET = '.da/library/blocks.json';

/** Sheet files earlier builds wrote beside the blocks sheet (grouped lists, an HTML copy). */
export const OLD_LIBRARY_SHEETS: readonly string[] = [
    '.da/library/blocks.html',
    '.da/library/blocks.xlsx',
    '.da/library/storefront-blocks.json',
    '.da/library/storefront-blocks.html',
    '.da/library/block-collection.json',
    '.da/library/block-collection.html',
];

/** Deletes the sheet files, one at a time, in the order given. */
export async function deleteLibrarySheets(
    sourceOps: Pick<DaLiveSourceOperations, 'deleteSource'>,
    org: string,
    site: string,
    paths: readonly string[],
): Promise<void> {
    for (const path of paths) {
        await sourceOps.deleteSource(org, site, path);
    }
}

/**
 * The warning when the site config did not take the lists, else undefined.
 *
 * DA.live's palette lists blocks only through the site config's `library` tab and its "Blocks"
 * row (aem.live/docs/ew/administering/set-up-library), so without it the sheet is never shown.
 * Reported, not just logged (EDS-38): until 2026-10-20 setup said "library created" over an
 * empty palette.
 */
export function paletteEmptyWarning(
    configResult: { success: boolean; error?: string },
): string | undefined {
    if (configResult.success) return undefined;
    return 'The block palette in DA.live will be empty: the site configuration did not take '
        + `the Blocks list (${configResult.error}).`;
}
