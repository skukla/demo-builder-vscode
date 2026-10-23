/**
 * The pages an author wrote at category addresses, and the sheet that protects them
 * (EDS-61, owner decision 2026-10-22).
 *
 * Category pages live at each category's own address (`/signs`), and Helix asks the
 * product page overlay FIRST on every preview: measured 2026-10-22 on scratch-1022-b, an
 * authored DA.live page at a product path, previewed and published, was not served — the
 * overlay's page was. So without help, the overlay would replace an authored `/apparel`
 * the next time anything previewed it.
 *
 * The help is a public sheet, `/authored-category-pages.json`, served as
 * `{data: [{path: "/apparel"}, ...]}`: the overlay steps aside for every path it lists, and
 * Helix falls through to DA.live. Demo Builder keeps it current at setup, reset, republish
 * and a store change, and publishes it BEFORE publishing any category path.
 *
 * @module features/eds/services/catalogMenu/authoredCategoryPages
 */

import { hashOf, type StorefrontPages } from './ownedPages';
import { runInBatches } from '@/core/utils/promiseUtils';
import { buildSheetDocument } from '@/features/eds/services/daLive/daLiveSpreadsheetUtils';

/** Where the sheet is served. A sheet is written and published at its `.json` path. */
export const AUTHORED_SHEET_PATH = '/authored-category-pages.json';

/** How many pages are read at once. */
const READ_BATCH = 6;

/**
 * The sheet's DA.live source: one sheet named `data`, one `path` per row — the native
 * document `buildSheetDocument` makes for every sheet the extension writes.
 *
 * @param paths - the authored category paths, any order
 */
export function authoredSheetSource(paths: string[]): string {
    const rows = [...paths].sort().map((path) => ({ path }));
    return JSON.stringify(buildSheetDocument([{ name: 'data', rows, columns: ['path'] }]));
}

/**
 * Which of these category paths DA.live holds a document for. A read that fails throws:
 * a list made without knowing would let the overlay replace an author's page.
 *
 * @param pages - the storefront's pages
 * @param paths - category page paths
 */
export async function findAuthoredPaths(pages: Pick<StorefrontPages, 'read'>, paths: string[]): Promise<Set<string>> {
    const sources = await runInBatches(paths, READ_BATCH, (path) => pages.read(path));
    return new Set(paths.filter((_, i) => sources[i] !== null));
}

/**
 * The category addresses the sheet lists: every one with a DA.live document that is not
 * one of Demo Builder's own unedited generated pages (the old model's, by the recorded
 * hash). An edited one is the SC's now, and is listed. The one computation republish's
 * early sheet and the catalog menu step both use. Throws when a page cannot be read.
 *
 * @param pages - the storefront's pages
 * @param paths - every category's page address
 * @param ownPages - the pages Demo Builder wrote, with the hash recorded after the write
 */
export async function authoredAddresses(
    pages: Pick<StorefrontPages, 'read'>,
    paths: string[],
    ownPages: Array<{ path: string; hash: string }>,
): Promise<Set<string>> {
    const hashes = new Map(ownPages.map((p) => [p.path, p.hash]));
    const sources = await runInBatches(paths, READ_BATCH, (path) => pages.read(path));
    return new Set(
        paths.filter((path, i) => {
            const source = sources[i];
            return source !== null && hashes.get(path) !== hashOf(source);
        }),
    );
}
