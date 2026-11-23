/**
 * Guesses a block's table shape and style variants from its code, the way DA.live's Import Blocks
 * does when no page has an example (adobe/da-live `blocks/config/blocks-import/github.js`,
 * Apache-2.0). The result shapes the placeholder in `blockDoc`.
 */

import { isBlockName } from './blockTable';

/** Rows and columns the block's JS reads. */
export interface BlockShape {
    rows: number;
    columns: number;
}

/** What a block doc needs when no page has an example of the block. */
export interface BlockCodeAnalysis extends BlockShape {
    variants: string[];
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Mirrors adobe/da-live blocks/config/blocks-import/github.js `cssVariants` (Import Blocks).
// The name is escaped here; for a valid block name that changes nothing.
export function cssVariants(css: string | undefined, name: string): string[] {
    if (!css) return [];
    const re = new RegExp(`\\.${escapeRegExp(name)}\\.([\\w-]+)`, 'g');
    return [...new Set([...css.matchAll(re)].map((m) => m[1]))].filter(isBlockName);
}

const ROW_LOOP = /\[\.\.\.block\.children\]|\.forEach\(\(row[,)]|querySelectorAll\(['"]:scope\s*>\s*div['"]\)/i;

// Mirrors adobe/da-live blocks/config/blocks-import/github.js `jsShape` (Import Blocks).
export function jsShape(js: string | undefined): BlockShape {
    if (!js) return { rows: 1, columns: 1 };
    const indexes = [...js.matchAll(/row\.children\[(\d+)\]/g)].map((m) => Number(m[1]) + 1);
    let columns = Math.max(1, ...indexes);
    if (columns === 1 && /\[\.\.\.(row|child|li)\.children\]/.test(js)) columns = 2;
    return { rows: ROW_LOOP.test(js) ? 2 : 1, columns };
}

// Mirrors adobe/da-live blocks/config/blocks-import/github.js `analyzeBlock` (Import Blocks),
// reading `blocks/<id>/<id>.js` and `.css` through the injected reader.
export async function analyzeBlockCode(
    blockId: string,
    readFile: (path: string) => Promise<string | undefined>,
): Promise<BlockCodeAnalysis> {
    const folder = `blocks/${blockId}`;
    const [js, css] = await Promise.all([
        readFile(`${folder}/${blockId}.js`),
        readFile(`${folder}/${blockId}.css`),
    ]);
    return { ...jsShape(js), variants: cssVariants(css, blockId) };
}
