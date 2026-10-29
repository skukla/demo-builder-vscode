/**
 * Reading a block table out of DA.live source HTML (EDS-24).
 *
 * In DA.live source a block is `<div class="name">`; its direct `<div>` children are the
 * table's rows, and each row's direct `<div>` children are its cells (a typed cell is
 * usually wrapped in a `<p>`). The catalog menu reads two tables this way: the
 * `product-list-page` block of a category page (`existingCategoryPages.ts`) and its own
 * `catalog-menu` table in the nav (`navSwitch.ts`).
 *
 * String-level on purpose: the extension has no HTML parser at runtime. Every position
 * is an index into the original string, so a caller can cut a row out and leave every
 * other byte as it was.
 *
 * @module features/eds/services/catalogMenu/blockTable
 */

/** One row of a block table. `start`/`end` are indexes into the page's HTML. */
export interface BlockRow {
    start: number;
    end: number;
    /** Each cell's text: tags dropped, entities decoded, whitespace collapsed. */
    cells: string[];
}

/** One block. `end` is exclusive; `contentEnd` is where its closing tag starts. */
interface BlockTable {
    start: number;
    end: number;
    contentEnd: number;
    rows: BlockRow[];
}

const CLOSE = '</div>';

const ENTITIES: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
};

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

function textOf(html: string): string {
    return html
        .replace(/<[^>]*>/g, ' ')
        .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity])
        .replace(/\s+/g, ' ')
        .trim();
}

/** The `<div>` elements directly inside the element spanning `start`..`end`. */
function childDivs(html: string, start: number, end: number): Array<{ start: number; end: number }> {
    const contentEnd = end - CLOSE.length;
    const children: Array<{ start: number; end: number }> = [];
    let at = html.indexOf('>', start) + 1;
    for (let next = html.indexOf('<div', at); next !== -1 && next < contentEnd; next = html.indexOf('<div', at)) {
        at = elementEnd(html, next);
        children.push({ start: next, end: at });
    }
    return children;
}

/**
 * Every block whose class starts the way `classPattern` says.
 *
 * @param html - a page's DA.live source
 * @param classPattern - regular-expression source for the class attribute's value, from
 *   its first character (`catalog-menu`, or `product-list-page[^"]*` for its variants)
 * @returns the blocks, in document order
 */
export function findBlockTables(html: string, classPattern: string): BlockTable[] {
    const opening = new RegExp(`<div class="${classPattern}"`, 'gi');
    const tables: BlockTable[] = [];
    for (let match = opening.exec(html); match; match = opening.exec(html)) {
        const end = elementEnd(html, match.index);
        const rows = childDivs(html, match.index, end).map((row) => ({
            ...row,
            cells: childDivs(html, row.start, row.end).map((cell) => textOf(html.slice(cell.start, cell.end))),
        }));
        tables.push({ start: match.index, end, contentEnd: end - CLOSE.length, rows });
        opening.lastIndex = end;
    }
    return tables;
}
