/**
 * The block pages a build may write over, because Demo Builder provably generated them and nobody
 * changed them. Owner rule: replace only what Demo Builder provably wrote; any other page is kept.
 * DA.live's source POST always writes (see `createSource`), so this check, with the existence
 * probe before it, is the only thing standing between a build and a page someone wrote.
 *
 * Two kinds count:
 * - The old stub. The old `generateStubDocPages` (in `daLive/daLiveBlockDocPages.ts` until this
 *   plan) wrote exactly `<body><header></header><main><div><div class="<id>"><div><div><p><title>
 *   </p></div></div></div></div></main><footer></footer></body>`, and the same title as the block's
 *   row `name` in the blocks sheet. A page of that shape counts only when its one cell's text is
 *   exactly one of the block's titles: its sheet row's name, or `displayName(id)`. An edited page
 *   with one plain-text cell has the same envelope, so the shape alone is no proof. A page an
 *   agent promoted (`upsertBlockDocPage`) opens with a comment before `<header>`, so it never
 *   matches either kind, whatever its example holds.
 * - An untouched placeholder: a page that is exactly what `blockDoc` writes with no example (every
 *   section the block's table, every cell `<p>Column N content</p>` in column order), as DA.live's
 *   Import Blocks also writes it. Any edited cell makes it authored.
 * Design: `.rptc/plans/block-library-without-universal-editor/step-02.md`.
 */

import { inBatches } from './libraryPages';
import { DaLiveAuthError } from '@/features/eds/services/types';

/** Reads a block's page source; undefined when it has none. */
export type ReadBlockPage = (blockId: string) => Promise<string | undefined>;

/** The titles a block's old stub may hold: its sheet row's name and its display name. */
export type BlockTitles = (blockId: string) => readonly string[];

const escapeForRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The page with line breaks between tags taken out. */
const compact = (html: string): string => html.trim().replace(/>\s+</g, '><');

const PAGE_START = '<body><header></header><main>';
const PAGE_END = '</main><footer></footer></body>';

/** True when `html` is the old stub page for `blockId` holding exactly one of `titles`. */
export function isOldStubPage(blockId: string, html: string, titles: readonly string[]): boolean {
    const stub = new RegExp(
        `^${PAGE_START}<div>`
        + `<div class="${escapeForRegExp(blockId)}"><div><div><p>([^<]*)</p></div></div></div>`
        + `</div>${PAGE_END}$`,
    );
    const cell = stub.exec(compact(html))?.[1];
    return cell !== undefined && titles.includes(cell);
}

/** One placeholder row: its cells, each `<p>Column N content</p>`. */
const PLACEHOLDER_ROW = '<div>(?:<div><p>Column \\d+ content</p></div>)+</div>';
const ROWS = new RegExp(PLACEHOLDER_ROW, 'g');
const COLUMN_NUMBERS = /Column (\d+) content/g;

/** True when every row's cells are numbered 1, 2, 3… as `placeholderRows` numbers them. */
const columnsInOrder = (page: string): boolean => [...page.matchAll(ROWS)].every(([row]) =>
    [...row.matchAll(COLUMN_NUMBERS)].every(([, n], index) => Number(n) === index + 1));

/** True when `html` is exactly a "Column N content" placeholder page for `blockId`. */
export function isGeneratedPlaceholder(blockId: string, html: string): boolean {
    const section = `<div><div class="${escapeForRegExp(blockId)}(?: [^"<>]+)?">`
        + `(?:${PLACEHOLDER_ROW})+</div></div>`;
    const page = compact(html);
    return new RegExp(`^${PAGE_START}(?:${section})+${PAGE_END}$`).test(page)
        && columnsInOrder(page);
}

/**
 * The pages, of those given, that Demo Builder generated (an old stub holding one of the block's
 * titles, or an untouched placeholder): id to its current source, so the writer can skip a write
 * that would not change it. A page that cannot be read is kept (not returned); an expired
 * DA.live sign-in is let through so the caller can ask again.
 */
export async function findReplaceablePages(
    ids: string[],
    read: ReadBlockPage,
    titlesOf: BlockTitles,
): Promise<Map<string, string>> {
    const replaceable = await inBatches(ids, async (id) => {
        try {
            const html = await read(id);
            if (html === undefined) return undefined;
            const generated = isOldStubPage(id, html, titlesOf(id))
                || isGeneratedPlaceholder(id, html);
            return generated ? html : undefined;
        } catch (error) {
            if (error instanceof DaLiveAuthError) throw error;
            return undefined;
        }
    });
    return new Map(ids.flatMap((id, n) => {
        const html = replaceable[n];
        return html === undefined ? [] : [[id, html] as const];
    }));
}

/** True when two pages are the same, line breaks between tags aside. */
export const samePage = (a: string, b: string): boolean => compact(a) === compact(b);
