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
 * String-level edits on DA.live source HTML: the extension has no HTML parser at
 * runtime, and the edits are anchored on the DA.live page body the extension itself
 * writes (`<body><header></header><main>…</main><footer></footer></body>`, direct
 * children of `<main>` are sections).
 *
 * @module features/eds/services/catalogMenu/navSwitch
 */

/** The line an author types to get one menu entry per top-level category. */
export const CATALOG_MENU_LINE = 'Shop the catalog';

const BLOCK_CLASS = 'catalog-menu';
const BLOCK_SECTION = `<div><div class="${BLOCK_CLASS}"><div><div></div></div></div></div>`;

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
const BLOCK_START = /<div class="catalog-menu"/i;

export type AddSwitchStatus = 'added' | 'already-present' | 'no-menu-list' | 'not-a-page';
export type RemoveSwitchStatus = 'removed' | 'not-present';

function hasLine(html: string): boolean {
    return new RegExp(LINE_ITEM.source, 'i').test(html);
}

function hasBlock(html: string): boolean {
    return BLOCK_START.test(html);
}

function isPageBody(html: string): boolean {
    return /<main>[\s\S]*<\/main>/i.test(html);
}

/** Add the line (first item of the first menu list) and the block, whichever is missing. */
export function addCatalogMenuSwitch(html: string): { html: string; status: AddSwitchStatus } {
    if (!isPageBody(html)) return { html, status: 'not-a-page' };
    const line = hasLine(html);
    const block = hasBlock(html);
    if (line && block) return { html, status: 'already-present' };

    let next = html;
    if (!line) {
        const list = FIRST_LIST.exec(next);
        if (!list) return { html, status: 'no-menu-list' };
        const at = list.index + list[0].length;
        next = `${next.slice(0, at)}<li>${CATALOG_MENU_LINE}</li>${next.slice(at)}`;
    }
    if (!block) {
        const end = next.lastIndexOf('</main>');
        next = `${next.slice(0, end)}${BLOCK_SECTION}${next.slice(end)}`;
    }
    return { html: next, status: 'added' };
}

/** End index (exclusive) of the `<div>` element that opens at `start`, by nesting depth. */
function elementEnd(html: string, start: number): number {
    const tag = /<div[\s>]|<\/div>/gi;
    tag.lastIndex = start;
    let depth = 0;
    for (let match = tag.exec(html); match; match = tag.exec(html)) {
        depth += match[0].startsWith('</') ? -1 : 1;
        if (depth === 0) return match.index + match[0].length;
    }
    return html.length;
}

/** Remove every catalog-menu block, and the section around one when it is left empty. */
function removeBlocks(html: string): string {
    let next = html;
    for (let found = BLOCK_START.exec(next); found; found = BLOCK_START.exec(next)) {
        const start = found.index;
        next = next.slice(0, start) + next.slice(elementEnd(next, start));
        const emptySection = '<div></div>';
        const sectionStart = start - '<div>'.length;
        if (next.slice(sectionStart, sectionStart + emptySection.length) === emptySection) {
            next = next.slice(0, sectionStart) + next.slice(sectionStart + emptySection.length);
        }
    }
    return next;
}

/** Remove every catalog line (bare and named) and every catalog-menu block. */
export function removeCatalogMenuSwitch(html: string): { html: string; status: RemoveSwitchStatus } {
    const next = removeBlocks(html.replace(LINE_ITEM, ''));
    return { html: next, status: next === html ? 'not-present' : 'removed' };
}
