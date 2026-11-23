/**
 * The block doc, its title and its list row, written exactly as DA.live's Import Blocks writes
 * them (adobe/da-live `blocks/config/blocks-import/blocks.js`, Apache-2.0), so an SC can re-run
 * Import Blocks over a library Demo Builder made and get the same pages and rows.
 */

import type { BlockCodeAnalysis, BlockShape } from './blockCode';
import type { VariantExample } from './blockTable';

/** What a block doc is built from: real examples, else the code's shape. */
export interface BlockDocSources {
    examples?: VariantExample[];
    analysis?: BlockCodeAnalysis | null;
}

/** A row Import Blocks adds to the list (a type alias, so it fits a `SheetRow`). */
export type ImportedBlockRow = {
    name: string;
    path: string;
};

// Mirrors adobe/da-live blocks/config/blocks-import/blocks.js `placeholderRows` (Import Blocks).
export function placeholderRows({ rows = 1, columns = 1 }: Partial<BlockShape> = {}): string {
    const cell = (c: number): string => `<div><p>Column ${c + 1} content</p></div>`;
    const row = `<div>${Array.from({ length: columns }, (_, c) => cell(c)).join('')}</div>`;
    return Array(rows).fill(row).join('');
}

// Mirrors adobe/da-live blocks/config/blocks-import/blocks.js `blockDoc` (Import Blocks): one
// section per variant, the first example found for it or a placeholder shaped by the code.
export function blockDoc(
    name: string,
    { examples = [], analysis = null }: BlockDocSources = {},
): string {
    const variants = new Set(examples.map((e) => e.variant));
    (analysis?.variants ?? []).forEach((v) => variants.add(v));
    if (!variants.size) variants.add('');
    const sections = [...variants].map((variant) => {
        const example = examples.find((e) => e.variant === variant);
        const cls = variant ? `${name} ${variant}` : name;
        const content = example?.html ?? placeholderRows(analysis ?? undefined);
        return `<div><div class="${cls}">${content}</div></div>`;
    });
    return `<body><header></header><main>${sections.join('')}</main><footer></footer></body>`;
}

// Mirrors adobe/da-live blocks/config/blocks-import/blocks.js `displayName` (Import Blocks):
// "hero-banner" → "Hero Banner"; only each word's first letter changes ("b2b" stays "B2b").
export const displayName = (name: string): string => name.split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
