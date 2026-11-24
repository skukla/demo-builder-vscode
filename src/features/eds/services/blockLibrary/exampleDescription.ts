/**
 * The one-line description added to a block's example page, as the `library-metadata` table
 * DA.live's block library reads: by `promote_block_to_library` (EDS-71 step 4c) and by the
 * library build for an example Demo Builder ships (`shippedBlockExamples.ts`).
 *
 * DA.live attaches a `library-metadata` table to the example it DIRECTLY follows, and shows its
 * `description` row behind that example's info button (adobe/da-live
 * `blocks/edit/da-library/helpers/index.js`, `groupBlocks`/`transformBlock`: a block's
 * `nextElementSibling` with the class; `blocks/edit/utils/helpers.js` `getMetadata`: each row's
 * first cell is the key, its second the value; read 2026-11-23). So one table at the end of a
 * page with two examples describes only the second: the table is written after EACH example,
 * unless that example is already followed by one.
 *
 * An example is a block table: a classed div at the top of the page, or one directly inside a
 * section (an unclassed top-level div, the usual DA page shape, where DA.live reads each
 * section's children as siblings). The table goes right after the block, inside its section.
 *
 * A group (`library-container-start` … `library-container-end`) is one example: DA.live inserts
 * everything between the markers with one click and reads its description from the table after
 * the END marker (`groupBlocks`). So nothing inside a group gets a table, and the end marker
 * does; a table inside would be inserted into the author's page.
 *
 * @module features/eds/services/blockLibrary/exampleDescription
 */

const DIV_TAG = /<div\b[^>]*>|<\/div>/g;
const CLASS_ATTR = /\sclass="([^"]*)"/;
const METADATA_CLASS = 'library-metadata';
const GROUP_START = 'library-container-start';
const GROUP_END = 'library-container-end';
/** Classed divs that are never an example of their own. */
const NOT_EXAMPLES = new Set(['', METADATA_CLASS, GROUP_START]);

/** One div of the page: where it starts and ends, its first class, and its parent div. */
interface PageDiv {
    start: number;
    end: number;
    name: string;
    depth: number;
    /** Index of the enclosing div in the list, or -1 at the top of the page. */
    parent: number;
}

const escapeText = (text: string): string => text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** The `library-metadata` table holding one `description` row. */
export function libraryMetadataTable(description: string): string {
    return `<div class="${METADATA_CLASS}"><div><div>description</div>`
        + `<div>${escapeText(description)}</div></div></div>`;
}

const classOf = (openingTag: string): string =>
    (CLASS_ATTR.exec(openingTag)?.[1] ?? '').trim().split(/\s+/)[0] ?? '';

/** Every div in `html`, in the order they open, each with its end once closed. */
function pageDivs(html: string): PageDiv[] {
    const divs: PageDiv[] = [];
    const open: number[] = [];
    for (const tag of html.matchAll(DIV_TAG)) {
        const index = tag.index ?? 0;
        if (tag[0] === '</div>') {
            const closed = open.pop();
            if (closed !== undefined) divs[closed].end = index + tag[0].length;
            continue;
        }
        const parent = open.length > 0 ? open[open.length - 1] : -1;
        divs.push({ start: index, end: index, name: classOf(tag[0]), depth: open.length, parent });
        open.push(divs.length - 1);
    }
    return divs;
}

/** Indexes of the divs between a group's start and end markers. */
function insideGroups(divs: PageDiv[]): Set<number> {
    const inside = new Set<number>();
    let open = false;
    divs.forEach((div, n) => {
        if (div.name === GROUP_START) open = true;
        else if (div.name === GROUP_END) open = false;
        else if (open) inside.add(n);
    });
    return inside;
}

/**
 * True when the div ends an example: a block at the top or directly inside a section, outside
 * any group, or a group's end marker.
 */
function isExample(divs: PageDiv[], n: number, inGroup: Set<number>): boolean {
    const div = divs[n];
    if (NOT_EXAMPLES.has(div.name) || inGroup.has(n)) return false;
    if (div.depth === 0) return true;
    return div.depth === 1 && divs[div.parent].name === '';
}

/** True when the next sibling div starts right after this one and is a metadata table. */
function followedByMetadata(html: string, divs: PageDiv[], n: number): boolean {
    const div = divs[n];
    const next = divs.find((other, m) => m > n && other.parent === div.parent);
    return next?.name === METADATA_CLASS && html.slice(div.end, next.start).trim() === '';
}

/**
 * The example page with the description after each example. With no example table in it, the
 * description goes at the end.
 *
 * @param html - the sanitised example page
 * @param description - the one-line description; empty adds nothing
 */
export function withLibraryDescription(html: string, description: string | undefined): string {
    const text = description?.trim();
    if (!text) return html;
    const table = libraryMetadataTable(text);
    const divs = pageDivs(html);
    const inGroup = insideGroups(divs);
    const examples = divs.map((_, n) => n).filter((n) => isExample(divs, n, inGroup));
    if (examples.length === 0) return `${html}${table}`;
    const ends = examples
        .filter((n) => !followedByMetadata(html, divs, n))
        .map((n) => divs[n].end);
    let out = '';
    let from = 0;
    for (const end of ends) {
        out += html.slice(from, end) + table;
        from = end;
    }
    return out + html.slice(from);
}
