/**
 * The nav switch — the content that turns the catalog menu on (EDS-24).
 *
 * The catalog menu is a block (`catalog-menu`, in the Demo Builder block library) that
 * rewrites "Shop the catalog" lines when the header loads the nav. Turning it on is
 * therefore CONTENT in the nav document, in two parts:
 *
 * 1. a "Shop the catalog" line in the menu list (the SC may also type
 *    "Shop the catalog: <category name>" lines; those are kept as typed), and
 * 2. a one-cell `catalog-menu` block table, added here as its own last section (the
 *    block removes itself, and its section when that is left empty, once it has run).
 *
 * Adding merges into whatever the SC authored; removing both parts is the undo.
 *
 * ## Category → page rows
 *
 * A category whose page is not at its own address (a hand-built `/safety-signage` for
 * Signs — `existingCategoryPages.ts`) gets a two-cell row in the table: the category's
 * url path, then the page. The block links that category to that page. The rows are
 * authored content: the SC sees them and can type their own to point any category at
 * any page.
 *
 * Ours are told from theirs by the RECORD, not by anything in the HTML: a row is ours
 * only while it still says exactly what the record holds ({@link CategoryLink}). A row
 * the SC typed, or one of ours they changed, is theirs — it is never rewritten or
 * removed, it wins over a row we would add for the same category, and a table that
 * still holds one is left in the nav when the switch comes out.
 *
 * String-level edits on DA.live source HTML: the extension has no HTML parser at
 * runtime, and the edits are anchored on the DA.live page body the extension itself
 * writes (`<body><header></header><main>…</main><footer></footer></body>`, direct
 * children of `<main>` are sections).
 *
 * @module features/eds/services/catalogMenu/navSwitch
 */

import { findBlockTables, type BlockRow } from './blockTable';
import { normaliseUrlPath } from './categoryPages';
import { escapeHtml } from '@/features/eds/services/daLive/daLiveSpreadsheetUtils';

/** The line an author types to get one menu entry per top-level category. */
export const CATALOG_MENU_LINE = 'Shop the catalog';

/** One row of the table: this category's menu entry links to this page. */
export interface CategoryLink {
    /** The category's url path, as Commerce spells it (`signs/danger-signs`). */
    urlPath: string;
    /** The page's web path (`/safety-signage`). */
    path: string;
}

const BLOCK_CLASS = 'catalog-menu';
/** The one-cell row every table we add starts with, so the table is never empty. */
const EMPTY_ROW = '<div><div></div></div>';

/**
 * A menu item whose own words are "Shop the catalog" or "Shop the catalog: …",
 * optionally wrapped in a `<p>`. Built from parts, one per line, so each reads alone.
 */
const LINE_ITEM = new RegExp(
    [
        String.raw`<li>\s*(?:<p>\s*)?`,
        String.raw`shop the catalog\s*`,
        String.raw`(?::[^<]*)?`,
        String.raw`(?:<\/p>\s*)?<\/li>`,
    ].join(''),
    'gi',
);
const FIRST_LIST = /<ul(?:\s[^>]*)?>/i;

export type AddSwitchStatus = 'added' | 'links-updated' | 'already-present' | 'no-menu-list' | 'not-a-page';
export type RemoveSwitchStatus = 'removed' | 'removed-kept-links' | 'not-present';

function hasLine(html: string): boolean {
    return new RegExp(LINE_ITEM.source, 'i').test(html);
}

function isPageBody(html: string): boolean {
    return /<main>[\s\S]*<\/main>/i.test(html);
}

const keyOf = (urlPath: string): string => normaliseUrlPath(urlPath);

function linkOf(row: BlockRow): CategoryLink | null {
    const [urlPath, path] = row.cells;
    return row.cells.length >= 2 && urlPath && path ? { urlPath, path } : null;
}

function isOneOf(links: CategoryLink[], link: CategoryLink): boolean {
    return links.some((l) => keyOf(l.urlPath) === keyOf(link.urlPath) && l.path === link.path);
}

function rowHtml(link: CategoryLink): string {
    return `<div><div>${escapeHtml(link.urlPath)}</div><div>${escapeHtml(link.path)}</div></div>`;
}

/** Cut the given rows out, last first, so the earlier positions stay true. */
function withoutRows(html: string, rows: BlockRow[]): string {
    return [...rows]
        .sort((a, b) => b.start - a.start)
        .reduce((next, row) => next.slice(0, row.start) + next.slice(row.end), html);
}

/**
 * Every category → page row in the nav's `catalog-menu` tables, ours and the SC's.
 *
 * @param html - the nav's DA.live source
 * @returns the rows with two filled cells, in document order
 */
export function readCategoryLinks(html: string): CategoryLink[] {
    return findBlockTables(html, BLOCK_CLASS)
        .flatMap((table) => table.rows.map(linkOf))
        .filter((link): link is CategoryLink => link !== null);
}

/** Bring the first table's rows in line with `wanted`, touching only rows that are ours. */
function mergeRows(html: string, wanted: CategoryLink[], ours: CategoryLink[]): string {
    const [table] = findBlockTables(html, BLOCK_CLASS);
    const present = table.rows.flatMap((row) => {
        const link = linkOf(row);
        return link && isOneOf(ours, link) ? [{ row, link }] : [];
    });
    const stale = present.filter(({ link }) => !isOneOf(wanted, link)).map(({ row }) => row);
    const missing = wanted.filter((link) => !isOneOf(present.map((p) => p.link), link));
    const added = `${html.slice(0, table.contentEnd)}${missing.map(rowHtml).join('')}${html.slice(table.contentEnd)}`;
    return withoutRows(added, stale);
}

/**
 * Add the line (first item of the first menu list) and the table, whichever is missing,
 * and bring the table's category → page rows in line with `links`.
 *
 * @param html - the nav's DA.live source
 * @param links - the rows Demo Builder wants in the table now
 * @param ours - the rows the record says Demo Builder wrote last time
 * @returns the nav, what changed, and the rows that are ours in it now
 */
export function addCatalogMenuSwitch(
    html: string,
    links: CategoryLink[] = [],
    ours: CategoryLink[] = [],
): { html: string; status: AddSwitchStatus; links: CategoryLink[] } {
    if (!isPageBody(html)) return { html, status: 'not-a-page', links: [] };
    const line = hasLine(html);
    const block = findBlockTables(html, BLOCK_CLASS).length > 0;

    let next = html;
    if (!line) {
        const list = FIRST_LIST.exec(next);
        if (!list) return { html, status: 'no-menu-list', links: [] };
        const at = list.index + list[0].length;
        next = `${next.slice(0, at)}<li>${CATALOG_MENU_LINE}</li>${next.slice(at)}`;
    }
    if (!block) {
        const end = next.lastIndexOf('</main>');
        next = `${next.slice(0, end)}<div><div class="${BLOCK_CLASS}">${EMPTY_ROW}</div></div>${next.slice(end)}`;
    }
    // A row the SC typed for a category wins: we add none of our own beside it.
    const theirs = readCategoryLinks(next).filter((link) => !isOneOf(ours, link));
    const wanted = links.filter((link) => !theirs.some((t) => keyOf(t.urlPath) === keyOf(link.urlPath)));
    next = mergeRows(next, wanted, ours);

    if (next === html) return { html, status: 'already-present', links: wanted };
    return { html: next, status: line && block ? 'links-updated' : 'added', links: wanted };
}

function hasContent(row: BlockRow): boolean {
    return row.cells.some((cell) => cell !== '');
}

/**
 * Take our rows out of every table, and each table too unless a row of the SC's is left
 * in it — with the section around a removed table when that is left empty.
 */
function removeBlocks(html: string, ours: CategoryLink[]): { html: string; keptLinks: boolean } {
    let next = html;
    let keptLinks = false;
    // Last table first, so the positions of the earlier ones stay true.
    for (const table of findBlockTables(html, BLOCK_CLASS).reverse()) {
        const mine = table.rows.filter((row) => {
            const link = linkOf(row);
            return link !== null && isOneOf(ours, link);
        });
        if (table.rows.some((row) => hasContent(row) && !mine.includes(row))) {
            keptLinks = true;
            next = withoutRows(next, mine);
            continue;
        }
        next = next.slice(0, table.start) + next.slice(table.end);
        const emptySection = '<div></div>';
        const sectionStart = table.start - '<div>'.length;
        if (next.slice(sectionStart, sectionStart + emptySection.length) === emptySection) {
            next = next.slice(0, sectionStart) + next.slice(sectionStart + emptySection.length);
        }
    }
    return { html: next, keptLinks };
}

/**
 * Remove every catalog line (bare and named), our category → page rows, and every
 * `catalog-menu` table that holds no row of the SC's.
 *
 * @param html - the nav's DA.live source
 * @param ours - the rows the record says Demo Builder wrote
 * @returns the nav and what changed
 */
export function removeCatalogMenuSwitch(
    html: string,
    ours: CategoryLink[] = [],
): { html: string; status: RemoveSwitchStatus } {
    const blocks = removeBlocks(html, ours);
    // Lines go second: cutting them first would move the tables' positions.
    const next = blocks.html.replace(LINE_ITEM, '');
    if (next === html) return { html, status: 'not-present' };
    return { html: next, status: blocks.keptLinks ? 'removed-kept-links' : 'removed' };
}
