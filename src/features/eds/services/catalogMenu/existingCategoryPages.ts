/**
 * Finds the category pages a person built — at any address (EDS-24).
 *
 * Owner's rule, 2026-10-05: **a hand-built page for a category is always honored.**
 *
 * On the Commerce boilerplate a page's own address does not bind it to a category. The
 * `urlPath` row of its `product-list-page` block does (older storefronts: a `category`
 * row holding the category id). So "does Signs already have a page?" cannot be answered
 * by looking at `/signs` alone: a colleague's `/safety-signage` may be it.
 *
 * ## How the pages are found, and what it costs
 *
 * `listPages()` walks the storefront's DA.live folders (one list call per folder, with
 * the SC's sign-in), and every page it answers is read once, {@link READ_BATCH} at a
 * time. That is the same order of work reset and republish already do per page. The
 * published content index is NOT used: it lists only published pages, and its columns
 * are page metadata (the Commerce boilerplate's, read 2026-10-05: path, title,
 * description, image, lastModified, robots, template) — nothing about a page's blocks,
 * so it cannot say which category a page shows.
 *
 * A listing or read that fails throws. The caller writes nothing in that case: writing
 * pages without knowing what is already there is how a second Signs page gets made.
 *
 * @module features/eds/services/catalogMenu/existingCategoryPages
 */

import { findBlockTables } from './blockTable';
import { normaliseUrlPath, type CatalogCategory } from './categoryPages';
import { runInBatches } from '@/core/utils/promiseUtils';

/** The part of the storefront's pages the finder uses. */
interface PageReader {
    listPages(): Promise<string[]>;
    read(path: string): Promise<string | null>;
}

/** The block, and the variants seen in the wild (`product-list-page-custom`). */
const LIST_BLOCK_CLASS = 'product-list-page[^"]*';

/** How many pages are read at once. */
const READ_BATCH = 6;

/**
 * The categories a page's `product-list-page` blocks name.
 *
 * @param html - the page's DA.live source
 * @returns the `urlPath` values (normalised) and the `category` ids, as typed
 */
export function categoryKeysOf(html: string): { urlPaths: string[]; ids: string[] } {
    const urlPaths: string[] = [];
    const ids: string[] = [];
    for (const table of findBlockTables(html, LIST_BLOCK_CLASS)) {
        for (const { cells } of table.rows) {
            const key = (cells[0] ?? '').toLowerCase();
            const value = cells[1] ?? '';
            if (!value) continue;
            if (key === 'urlpath') urlPaths.push(normaliseUrlPath(value));
            if (key === 'category') ids.push(value);
        }
    }
    return { urlPaths, ids };
}

function categoriesShownBy(html: string, categories: CatalogCategory[]): CatalogCategory[] {
    const { urlPaths, ids } = categoryKeysOf(html);
    if (urlPaths.length + ids.length === 0) return [];
    return categories.filter(
        (category) =>
            (category.urlPath !== '' && urlPaths.includes(normaliseUrlPath(category.urlPath))) ||
            ids.includes(category.id),
    );
}

/**
 * The hand-built page for each category that has one somewhere other than its own
 * address. (A page AT the category's address is decided by address, in
 * `catalogMenuService`.) When two pages name one category, the first address in
 * alphabetical order is used.
 *
 * @param pages - the storefront's pages
 * @param categories - the menu's categories
 * @param isOurs - whether the record proves Demo Builder wrote this page as it stands
 * @returns category url path (as Commerce spells it) → the page's web path
 */
export async function findOwnCategoryPages(
    pages: PageReader,
    categories: CatalogCategory[],
    isOurs: (path: string, html: string) => boolean,
): Promise<Map<string, string>> {
    const paths = [...(await pages.listPages())].sort();
    const sources = await runInBatches(paths, READ_BATCH, (path) => pages.read(path));
    const found = new Map<string, string>();
    paths.forEach((path, i) => {
        const html = sources[i];
        if (html === null || isOurs(path, html)) return;
        for (const category of categoriesShownBy(html, categories)) {
            const ownAddress = `/${normaliseUrlPath(category.urlPath)}`;
            if (path.toLowerCase() !== ownAddress && !found.has(category.urlPath)) {
                found.set(category.urlPath, path);
            }
        }
    });
    return found;
}
