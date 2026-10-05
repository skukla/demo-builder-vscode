/**
 * Pages for categories added after setup (EDS-27): find the ones without a page, and
 * add those — and only those.
 *
 * EDS-24's step (`applyCatalogMenu`) refreshes pages, removes ours when the SC builds
 * their own, and edits the nav. This is its ADD-ONLY sibling for the watcher that runs
 * while a project is open: it never rewrites a page, never removes one, and never
 * touches the nav. Pages for categories deleted from Commerce stay until Republish or
 * reset.
 *
 * ## "Has a page" is EDS-24's answer, not a second one
 *
 * A category has a page when any of these holds, each decided by the code EDS-24 uses:
 *
 * - a page at its own address, whoever wrote it (`pages.read`) — ours, ours-but-edited
 *   and someone else's all count;
 * - a row for it in the nav's `catalog-menu` table (`readCategoryLinks`);
 * - a hand-built page for it at any address (`findOwnCategoryPages`).
 *
 * The cheap reads go first: the site is walked for hand-built pages only when some
 * category still looks unpaged, so a storefront that is up to date costs one read per
 * category and no listing.
 *
 * ## A failed read is a failure
 *
 * Every read here throws when it fails. A nav that is not there is treated the same
 * way: the catalog menu lives in it, so a storefront answering "no nav" is not being
 * read properly, and "every category is missing a page" concluded from that would write
 * a page per category.
 *
 * @module features/eds/services/catalogMenu/newCategoryPages
 */

import {
    hashOf,
    writeOwnedPage,
    type CatalogMenuDeps,
    type CatalogMenuRecord,
    type PageFailure,
} from './catalogMenuService';
import { normaliseUrlPath, planCategoryPages, type PlannedPage } from './categoryPages';
import { findOwnCategoryPages } from './existingCategoryPages';
import { readCategoryLinks } from './navSwitch';
import { runInBatches } from '@/core/utils/promiseUtils';

const NAV_PATH = '/nav';

/** How many category addresses are read at once. */
const READ_BATCH = 6;

export interface AddedPagesReport {
    written: PlannedPage[];
    failed: PageFailure[];
    /** The previous record plus the pages written now. */
    record: CatalogMenuRecord;
}

/**
 * The menu categories that have no page. A READ: nothing is written or removed.
 *
 * @param deps - the storefront's pages and the category reader
 * @param previous - the record of what Demo Builder wrote
 * @returns the pages that would be added, in the tree's order
 * @throws when the categories, the nav or the storefront's pages cannot be read
 */
export async function findMissingCategoryPages(
    deps: CatalogMenuDeps,
    previous: CatalogMenuRecord,
): Promise<PlannedPage[]> {
    const categories = await deps.readCategories();
    const planned = planCategoryPages(categories).pages;
    if (planned.length === 0) return [];

    const nav = await deps.pages.read(NAV_PATH);
    if (nav === null) {
        throw new Error("the storefront's nav page could not be found");
    }
    const linked = new Set(readCategoryLinks(nav).map((link) => normaliseUrlPath(link.urlPath)));
    const unlinked = planned.filter((page) => !linked.has(normaliseUrlPath(page.urlPath)));

    const atOwnAddress = await runInBatches(unlinked, READ_BATCH, (page) => deps.pages.read(page.path));
    const unpaged = unlinked.filter((_, i) => atOwnAddress[i] === null);
    if (unpaged.length === 0) return [];

    const hashes = new Map(previous.pages.map((p) => [p.path, p.hash]));
    const elsewhere = await findOwnCategoryPages(
        deps.pages,
        categories,
        (path, html) => hashes.get(path) === hashOf(html),
    );
    return unpaged.filter((page) => !elsewhere.has(page.urlPath));
}

/**
 * Write and publish a page for each category that has none. Add-only: the pages are
 * looked for again first, each write goes through the same owned-page write EDS-24 uses
 * (which refuses an address that already holds a page), and nothing else is changed.
 *
 * @param deps - the storefront's pages and the category reader
 * @param previous - the record of what Demo Builder wrote
 * @returns the pages written, the ones that failed, and the record to keep
 * @throws when the reads fail — before any write
 */
export async function addMissingCategoryPages(
    deps: CatalogMenuDeps,
    previous: CatalogMenuRecord,
): Promise<AddedPagesReport> {
    const missing = await findMissingCategoryPages(deps, previous);
    const report: AddedPagesReport = {
        written: [],
        failed: [],
        record: { ...previous, pages: [...previous.pages], links: [...previous.links] },
    };
    for (const page of missing) {
        // No recorded hash is handed over, so an address that gained a page since the
        // look above is skipped as someone else's — never overwritten.
        const outcome = await writeOwnedPage(deps.pages, page.path, page.html, undefined);
        if (outcome.kind === 'written') {
            report.written.push(page);
            report.record.pages = [
                ...report.record.pages.filter((p) => p.path !== page.path),
                { path: page.path, hash: outcome.hash },
            ];
        } else if (outcome.kind === 'failed') {
            report.failed.push({ path: page.path, error: outcome.error });
        }
    }
    return report;
}
