/**
 * `get_block_authoring_shape` — how a DA.live author fills a block in, read from sources
 * every storefront has (EDS-71 step 5). `component-definition.json` is not one of them:
 * Adobe deleted it from its templates, and the block list follows the code.
 *
 * - Index (no block name): the storefront's `blocks/<id>/` folders, as the block list takes them
 *   (block names only). `metadata` and `section-metadata`, which EDS handles with no folder
 *   (`CORE_CONTENT_BLOCKS`), are in the block list but have no code, so they are not here.
 * - One block: its example page in the storefront's DA.live block list
 *   (`.da/library/blocks/<id>`), one table per style variant, rows and columns counted from
 *   the page. A page Demo Builder generated (an old stub, or an untouched "Column N content"
 *   placeholder) is no example, so then, and when there is no page or it cannot be read, the
 *   block's code answers instead: rows, columns and variants as DA.live's Import Blocks reads
 *   them (`analyzeBlockCode`). The block's README.md is added when it has one.
 *
 * @module mcp/blockAuthoringShape
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { MAX_AUTHORING_INDEX_ROWS } from './blockAuthoring';
import { analyzeBlockCode } from '@/features/eds/services/blockLibrary/blockCode';
import { displayName } from '@/features/eds/services/blockLibrary/blockDoc';
import { blockExamplesFromPlainHtml } from '@/features/eds/services/blockLibrary/blockTable';
import {
    isGeneratedPlaceholder,
    isOldStubPage,
    type ReadBlockPage,
} from '@/features/eds/services/blockLibrary/oldStubPages';
import { listableBlockIds } from '@/features/eds/services/blockLibrary/storefrontBlockList';

/** Style variants reported from one example page; a page rarely shows more. */
export const MAX_EXAMPLES = 4;
/** One example table's HTML, clipped beyond this. */
export const MAX_EXAMPLE_HTML_CHARS = 1_500;
/** The README excerpt, clipped beyond this. */
export const MAX_README_CHARS = 1_200;

/** Where the block's example page comes from, or why it cannot be read. */
export type ExamplePageSource =
    | { read: ReadBlockPage }
    | { unavailable: 'not-signed-in' | 'no-da-live-site' };

/** What became of the example page, when the block's code had to answer instead. */
type ExamplePageStatus = 'none' | 'generated' | 'unreadable' | 'not-signed-in' | 'no-da-live-site';

/** One style variant's table on the example page. */
interface PageExample {
    variant: string;
    rows: number;
    columns: number;
    html: string;
    truncated?: true;
}

const DIV_TAG = /<div\b[^>]*>|<\/div>/g;

/** Rows (the block's child divs) and columns (most cells in a row) of a block's inner HTML. */
export function tableShape(innerHtml: string): { rows: number; columns: number } {
    let depth = 0;
    let rows = 0;
    let cells = 0;
    let columns = 0;
    for (const [tag] of innerHtml.matchAll(DIV_TAG)) {
        if (tag === '</div>') {
            depth = Math.max(0, depth - 1);
            continue;
        }
        if (depth === 0) {
            rows += 1;
            cells = 0;
        } else if (depth === 1) {
            cells += 1;
            columns = Math.max(columns, cells);
        }
        depth += 1;
    }
    return { rows, columns };
}

/** The page's tables for the block, the first per style variant. */
function pageExamples(blockId: string, page: string): PageExample[] {
    const seen = new Set<string>();
    const examples: PageExample[] = [];
    for (const { variant, html } of blockExamplesFromPlainHtml(page, blockId)) {
        if (seen.has(variant) || examples.length === MAX_EXAMPLES) continue;
        seen.add(variant);
        const clipped = html.length > MAX_EXAMPLE_HTML_CHARS;
        examples.push({
            variant,
            ...tableShape(html),
            html: clipped ? html.slice(0, MAX_EXAMPLE_HTML_CHARS) : html,
            ...(clipped ? { truncated: true as const } : {}),
        });
    }
    return examples;
}

/** The example page's tables, or why there are none. */
async function readExamples(
    blockId: string,
    source: ExamplePageSource,
): Promise<{ examples: PageExample[]; status: ExamplePageStatus }> {
    if ('unavailable' in source) return { examples: [], status: source.unavailable };
    let page: string | undefined;
    try {
        page = await source.read(blockId);
    } catch {
        return { examples: [], status: 'unreadable' };
    }
    if (page === undefined) return { examples: [], status: 'none' };
    const generated = isGeneratedPlaceholder(blockId, page)
        || isOldStubPage(blockId, page, [displayName(blockId)]);
    if (generated) return { examples: [], status: 'generated' };
    // A page with no table of this block is no example either.
    return { examples: pageExamples(blockId, page), status: 'none' };
}

/** A storefront file's text, or undefined when it cannot be read. */
export function storefrontReader(
    storefrontPath: string,
): (file: string) => Promise<string | undefined> {
    return async (file) => {
        try {
            return await fsPromises.readFile(path.join(storefrontPath, file), 'utf-8');
        } catch {
            return undefined;
        }
    };
}

/** The block's README.md, trimmed and clipped at `max`; undefined when it has none. */
export async function readmeExcerpt(
    read: (file: string) => Promise<string | undefined>,
    blockId: string,
    max: number = MAX_README_CHARS,
): Promise<string | undefined> {
    const text = (await read(`blocks/${blockId}/README.md`))?.trim();
    if (!text) return undefined;
    return text.length > max ? `${text.slice(0, max)} [truncated]` : text;
}

/**
 * The storefront's block folders the DA.live block list takes (`listableBlockIds`: block names
 * only), A to Z; none when it has no `blocks/` folder.
 */
export async function blockFolders(storefrontPath: string): Promise<string[]> {
    try {
        const entries = await fsPromises.readdir(path.join(storefrontPath, 'blocks'), {
            withFileTypes: true,
        });
        const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name);
        return listableBlockIds(folders).sort();
    } catch {
        return [];
    }
}

/** The index: every block folder with its title, filtered by `search`, capped. */
export async function blockAuthoringIndex(storefrontPath: string, search?: string) {
    const all = (await blockFolders(storefrontPath)).map((id) => ({ id, title: displayName(id) }));
    const term = search?.trim().toLowerCase();
    const matched = term
        ? all.filter((b) => b.id.includes(term) || b.title.toLowerCase().includes(term))
        : all;
    const page = matched.slice(0, MAX_AUTHORING_INDEX_ROWS);
    return {
        blocks: page,
        count: page.length,
        total: matched.length,
        ...(term ? { search: term, totalUnfiltered: all.length } : {}),
        ...(matched.length > page.length
            ? { more: `${matched.length - page.length} more — narrow with search` }
            : {}),
    };
}

/** One block's shape: its example page's tables, else its code's rows, columns and variants. */
export async function blockAuthoringDetail(
    storefrontPath: string,
    blockId: string,
    pageSource: ExamplePageSource,
) {
    const read = storefrontReader(storefrontPath);
    const [{ examples, status }, readme] = await Promise.all([
        readExamples(blockId, pageSource),
        readmeExcerpt(read, blockId),
    ]);
    const head = { id: blockId, title: displayName(blockId) };
    const tail = readme ? { readme } : {};
    if (examples.length > 0) return { ...head, source: 'example-page', examples, ...tail };
    const code = await analyzeBlockCode(blockId, read);
    return { ...head, source: 'code', examplePage: status, ...code, ...tail };
}
