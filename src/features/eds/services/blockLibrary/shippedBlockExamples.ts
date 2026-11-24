/**
 * The block examples Demo Builder ships as data (EDS-71, "Replaced 2026-11-24"): one JSON file
 * per source under `src/features/eds/config/block-examples/`, `template.json` for the B2B
 * template's blocks and one per block library id, each `{ "<blockId>": { description, html } }`
 * (schema: `block-examples.schema.json`).
 *
 * A library's file holds only the blocks that library adds: a block whose name the template
 * also has is installed from the template (first seen wins, `blockCollectionHelpers.ts`), so its
 * example is the template's. The exception is a library that IS a package's template (Isle5,
 * BuildRight), whose file covers its own blocks. Checked by the structural suite,
 * `shippedExampleStructure.test.ts`; how each example looks with the block's real code is
 * the render check's job (`npm run block-examples:render`).
 */

import { pageEnvelope } from './blockDoc';
import { withLibraryDescription } from './exampleDescription';
import bodeaBlocks from '@/features/eds/config/block-examples/bodea-blocks.json';
import buildrightBlocks from '@/features/eds/config/block-examples/buildright-blocks.json';
import demoBuilderBlocks from '@/features/eds/config/block-examples/demo-builder-blocks.json';
import demoTeamBlocks from '@/features/eds/config/block-examples/demo-team-blocks.json';
import isle5 from '@/features/eds/config/block-examples/isle5.json';
import template from '@/features/eds/config/block-examples/template.json';

/**
 * One shipped example: the page's section content and its one-line description. `structureOnly`
 * is read only by the render check: why the block cannot show outside a real storefront.
 */
export interface ShippedBlockExample {
    description: string;
    html: string;
    structureOnly?: string;
}

/** Every source's examples, by source (`template` or a library id), then by block id. */
export type ShippedExamples = ReadonlyMap<string, ReadonlyMap<string, ShippedBlockExample>>;

/** The source name of the B2B template's file. */
export const TEMPLATE_SOURCE = 'template';

const FILES: Record<string, Record<string, unknown>> = {
    [TEMPLATE_SOURCE]: template,
    'demo-team-blocks': demoTeamBlocks,
    isle5,
    'bodea-blocks': bodeaBlocks,
    'buildright-blocks': buildrightBlocks,
    'demo-builder-blocks': demoBuilderBlocks,
};

function isShippedExample(value: unknown): value is ShippedBlockExample {
    return typeof value === 'object' && value !== null
        && 'description' in value && typeof value.description === 'string'
        && 'html' in value && typeof value.html === 'string';
}

/** The entries of one file that are examples (the `$schema` pointer is not). */
function examplesOf(file: Record<string, unknown>): Map<string, ShippedBlockExample> {
    const examples = new Map<string, ShippedBlockExample>();
    for (const [id, value] of Object.entries(file)) {
        if (isShippedExample(value)) examples.set(id, value);
    }
    return examples;
}

/** Every shipped example, by source then block id. */
export function loadShippedBlockExamples(): ShippedExamples {
    return new Map(Object.entries(FILES).map(([source, file]) => [source, examplesOf(file)]));
}

/**
 * The example shipped for a block: the first library in `libraryIds` (the installed libraries
 * that have the block, in install order) whose file has it, else the template's.
 */
export function findShippedExample(
    blockId: string,
    libraryIds: string[],
    shipped: ShippedExamples,
): { source: string; example: ShippedBlockExample } | undefined {
    for (const source of [...libraryIds, TEMPLATE_SOURCE]) {
        const example = shipped.get(source)?.get(blockId);
        if (example) return { source, example };
    }
    return undefined;
}

/** An image cell as shipped: an `<img>` with alt text and no `src`. */
const IMAGE_CELL = /<img\b(?![^>]*\ssrc=)([^>]*)>/;
const IMAGE_CELLS = new RegExp(IMAGE_CELL.source, 'g');

const attribute = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/**
 * The example's page as written to the storefront's block list: one section holding the
 * examples, the description after each (`withLibraryDescription`), and each image cell given a
 * photo from the storefront's own pages, in turn. With no photo, an image cell stays alt text
 * only and `photosMissing` says so.
 */
export function shippedExamplePage(
    example: ShippedBlockExample,
    photos: readonly string[],
): { page: string; photosMissing: boolean } {
    const hasImageCell = IMAGE_CELL.test(example.html);
    let next = 0;
    const html = photos.length === 0
        ? example.html
        : example.html.replace(IMAGE_CELLS, (_cell, rest: string) => {
            const photo = photos[next % photos.length];
            next += 1;
            return `<img src="${attribute(photo)}"${rest}>`;
        });
    const page = pageEnvelope(withLibraryDescription(`<div>${html}</div>`, example.description));
    return { page, photosMissing: hasImageCell && photos.length === 0 };
}
