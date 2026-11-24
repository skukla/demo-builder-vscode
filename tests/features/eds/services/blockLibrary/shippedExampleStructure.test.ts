/**
 * Every block example Demo Builder ships, checked for structure on every test run (EDS-71,
 * "Replaced 2026-11-24"; owner: "ensure through testing that they show as they should").
 *
 * For each entry of every file in `src/features/eds/config/block-examples/`: the file matches its
 * schema; every example is a named block table (an `<h2>` over a div classed by the block id);
 * its style variants exist in the block's CSS; its rows have the columns the block's code reads;
 * it has a description; it carries only safe links and no image address of its own (image cells
 * take the storefront's photos); and no brand name from `demo-packages.json` appears in it.
 *
 * What the block's code reads comes from `tests/fixtures/eds/block-library/shipped-block-code.json`,
 * recorded by the render check (`npm run block-examples:render -- --update-fixture`) with
 * `analyzeBlockCode` over the block's code at the ref Demo Builder installs. The render check
 * fails when that code changes and the fixture was not re-recorded; it is also what proves an
 * example SHOWS, which this suite cannot.
 */

import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import Ajv from 'ajv';
import blockLibraries from '@/features/components/config/block-libraries.json';
import demoPackages from '@/features/components/config/demo-packages.json';
import { pageBlocks } from '@/features/eds/services/blockLibrary/blockTable';
import { isSafeUrl } from '@/features/eds/services/blockLibrary/safeUrl';
import {
    TEMPLATE_SOURCE,
    loadShippedBlockExamples,
} from '@/features/eds/services/blockLibrary/shippedBlockExamples';

const DIR = resolve(__dirname, '../../../../../src/features/eds/config/block-examples');
const FIXTURE = resolve(__dirname, '../../../../fixtures/eds/block-library/shipped-block-code.json');
const SCHEMA = 'block-examples.schema.json';

interface CodeShape {
    rows: number;
    columns: number;
    variants: string[];
    readsConfig: boolean;
    /** The JS takes every cell of a row, however many, so any width meets it. */
    anyWidth: boolean;
}

const code: Record<string, CodeShape> = JSON.parse(readFileSync(FIXTURE, 'utf8')).blocks;
const shipped = loadShippedBlockExamples();
const entries = [...shipped].flatMap(([source, examples]) =>
    [...examples].map(([blockId, example]) => ({ source, blockId, ...example })));

/** Brand names: each demo package's name, without a parenthetical ("Starter (B2B + B2C)"). */
const BRANDS = demoPackages.packages.map((pkg) => pkg.name.replace(/\s*\(.*\)\s*/, '').trim());

const DIV_TAG = /<div\b[^>]*>|<\/div>/g;

/** The inner HTML of each div directly inside `html`. */
function childDivs(html: string): string[] {
    const children: string[] = [];
    let depth = 0;
    let start = 0;
    for (const tag of html.matchAll(DIV_TAG)) {
        const index = tag.index ?? 0;
        if (tag[0] !== '</div>') {
            if (depth === 0) start = index + tag[0].length;
            depth += 1;
        } else {
            depth -= 1;
            if (depth === 0) children.push(html.slice(start, index));
        }
    }
    return children;
}

/**
 * DA.live's group markers (`adobe/da-live` `blocks/edit/da-library/helpers/index.js`,
 * `groupBlocks`): everything between a start and an end is inserted with one click, such as the
 * menu list the Catalog Menu block reads. They are not the example's block.
 */
const GROUP_START = '<div class="library-container-start"><div><div></div></div></div>';
const GROUP_END = '<div class="library-container-end"><div><div></div></div></div>';

const withoutMarkers = (html: string): string => html.split(GROUP_START).join('').split(GROUP_END).join('');

/** Each example table: its variant and its rows, each row its cells. */
function examplesOf(html: string): Array<{ name: string; variant: string; rows: string[][] }> {
    return pageBlocks(`<div>${withoutMarkers(html)}</div>`).map(({ name, variant, html: inner }) => ({
        name, variant, rows: childDivs(inner).map(childDivs),
    }));
}

/** The example names: the `<h2>`s outside every block (a block's content may have its own). */
function namingHeadings(html: string): number {
    let depth = 0;
    let count = 0;
    for (const [tag] of html.matchAll(/<div\b[^>]*>|<\/div>|<h2>/g)) {
        if (tag === '<h2>') count += depth === 0 ? 1 : 0;
        else depth += tag === '</div>' ? -1 : 1;
    }
    return count;
}

/** Whether every group opens before it closes and each example holds at most one group. */
function groupsBalanced(html: string): boolean {
    return html.split(/<h2>/).every((example) => {
        const starts = example.split(GROUP_START).length - 1;
        const ends = example.split(GROUP_END).length - 1;
        return starts === ends && starts <= 1
            && (starts === 0 || example.indexOf(GROUP_START) < example.indexOf(GROUP_END));
    });
}

const attributeValues = (html: string, attribute: string): string[] =>
    [...html.matchAll(new RegExp(`\\s${attribute}="([^"]*)"`, 'g'))].map((m) => m[1]);

describe('the shipped block examples', () => {
    it('CONTROL: the pilot examples are there, each with its code shape recorded', () => {
        expect(entries.map(({ source, blockId }) => `${source}/${blockId}`).sort()).toEqual(
            expect.arrayContaining([
                'demo-builder-blocks/catalog-menu', 'demo-team-blocks/table', 'template/carousel',
                'template/commerce-cart', 'template/targeted-block',
            ]),
        );
        expect(entries.filter(({ source, blockId }) => !code[`${source}/${blockId}`])).toStrictEqual([]);
    });

    it('has one file per source, each matching the schema', () => {
        const schema = JSON.parse(readFileSync(join(DIR, SCHEMA), 'utf8'));
        const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
        const files = readdirSync(DIR).filter((name) => name.endsWith('.json') && name !== SCHEMA);

        const problems = files.flatMap((name) => {
            const valid = validate(JSON.parse(readFileSync(join(DIR, name), 'utf8')));
            return valid ? [] : (validate.errors ?? []).map((e) => `${name} ${e.instancePath} ${e.message}`);
        });

        expect(problems).toStrictEqual([]);
        expect(files.map((name) => name.replace(/\.json$/, '')).sort()).toEqual(
            [TEMPLATE_SOURCE, ...blockLibraries.libraries.map((library) => library.id)].sort(),
        );
    });

    describe.each(entries.map((entry) => [`${entry.source}/${entry.blockId}`, entry]))('%s', (key, entry) => {
        const examples = examplesOf(entry.html);
        const shape = code[key];

        it('is one or more named examples, each a table classed by the block id', () => {
            expect(examples.length).toBeGreaterThan(0);
            expect(examples.map((example) => example.name)).toEqual(examples.map(() => entry.blockId));
            expect(namingHeadings(entry.html)).toBe(examples.length);
            expect(groupsBalanced(entry.html)).toBe(true);
        });

        it('uses only variants the block\'s CSS or JS defines', () => {
            const used = examples.flatMap((example) => example.variant.split(' ').filter(Boolean));

            expect(used.filter((variant) => !shape.variants.includes(variant))).toStrictEqual([]);
        });

        it('reaches the columns the block\'s code reads', () => {
            const problems = examples.flatMap(({ rows }, n) => {
                if (shape.readsConfig) {
                    // A settings table: key | value rows, a content row of one cell allowed.
                    return rows.some((cells) => cells.length < 1 || cells.length > 2)
                        ? [`example ${n + 1}: a settings row has other than one or two cells`]
                        : [];
                }
                // Rows may differ (a hero reads a two-cell row, then one-cell rows); the widest
                // row reaches the columns the code reads, unless the code takes any width.
                const width = Math.max(...rows.map((cells) => cells.length));
                return !shape.anyWidth && width < shape.columns
                    ? [`example ${n + 1}: ${width} column(s), the code reads ${shape.columns}`]
                    : [];
            });

            expect(problems).toStrictEqual([]);
        });

        it('has a one-line description', () => {
            expect(entry.description.trim()).not.toBe('');
            expect(entry.description).not.toMatch(/\n/);
        });

        it('links only to safe addresses, and carries no image address of its own', () => {
            const links = attributeValues(entry.html, 'href');

            expect(links.filter((href) => !isSafeUrl(href) || !/^(\/|https:\/\/)/.test(href))).toStrictEqual([]);
            expect(attributeValues(entry.html, 'src')).toStrictEqual([]);
            expect(attributeValues(entry.html, 'srcset')).toStrictEqual([]);
            expect(entry.html).not.toMatch(/<(script|style|iframe)\b|\son\w+=/i);
        });

        it('names no brand', () => {
            const text = `${entry.description} ${entry.html}`;

            expect(BRANDS.filter((brand) => new RegExp(`\\b${brand}\\b`, 'i').test(text))).toStrictEqual([]);
        });
    });

    it('keeps a block the template has out of a library\'s file, unless that library is a template', () => {
        const templateIds = new Set(shipped.get(TEMPLATE_SOURCE)?.keys());
        const templateRepos = new Set(demoPackages.packages.flatMap((pkg) => Object.values(pkg.storefronts))
            .flatMap((storefront) => ('templateRepo' in storefront
                ? [`${storefront.templateOwner}/${storefront.templateRepo}`]
                : [])));
        const overlaps = blockLibraries.libraries
            .filter(({ source }) => !templateRepos.has(`${source.owner}/${source.repo}`))
            .flatMap(({ id }) => [...(shipped.get(id)?.keys() ?? [])]
                .filter((blockId) => templateIds.has(blockId))
                .map((blockId) => `${id}/${blockId}`));

        expect(overlaps).toStrictEqual([]);
    });

    it('CONTROL: the Catalog Menu example is one group per example, list and block together', () => {
        const catalogMenu = entries.find(({ blockId }) => blockId === 'catalog-menu');

        expect(catalogMenu?.html.split(GROUP_START).length).toBe(3);
        expect(groupsBalanced(catalogMenu?.html ?? '')).toBe(true);
        expect(groupsBalanced(`<h2>x</h2>${GROUP_END}${GROUP_START}`)).toBe(false);
    });

    it('CONTROL: the brand list is read from the packages', () => {
        expect(BRANDS).toEqual(expect.arrayContaining(['CitiSignal', 'Bodea', 'Starter']));
    });
});
