/**
 * Adobe's content library: the block and template sheets on Adobe's source site.
 * Driven by the real sheets captured 2026-11-23 (tests/fixtures/eds/block-library/README.md).
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { readAdobeContentLibrary } from '@/features/eds/services/blockLibrary/adobeContentLibrary';

const FIXTURES = resolve(__dirname, '../../../../fixtures/eds/block-library');
const readFixture = (name: string): unknown =>
    JSON.parse(readFileSync(resolve(FIXTURES, name), 'utf8'));

const SITE = { org: 'adobe-commerce', site: 'boilerplate-b2b' };
const BASE = 'https://main--boilerplate-b2b--adobe-commerce.aem.page';
const BLOCKS_URL = `${BASE}/docs/library/blocks.json`;
const TEMPLATES_URL = `${BASE}/docs/library/templates.json`;

function fetcherFor(responses: Record<string, unknown>) {
    return jest.fn(async (url: string) => responses[url]);
}

describe('readAdobeContentLibrary', () => {
    it('reads the 7 blocks of the real multi-sheet in sheet order, ids from the path', async () => {
        const fetchJson = fetcherFor({ [BLOCKS_URL]: readFixture('b2b-blocks.json') });

        const { blocks } = await readAdobeContentLibrary(SITE, fetchJson);

        expect(blocks).toEqual([
            { id: 'hero', title: 'Hero' },
            { id: 'accordion', title: 'Accordion' },
            { id: 'cards', title: 'Cards' },
            { id: 'columns', title: 'Columns' },
            { id: 'fragment', title: 'Fragment' },
            { id: 'metadata', title: 'Metadata' },
            { id: 'section-metadata', title: 'Section-metadata' },
        ]);
    });

    it('reads the real templates sheet: id from the value, title from the key', async () => {
        const fetchJson = fetcherFor({ [TEMPLATES_URL]: readFixture('b2b-templates.json') });

        const { templates } = await readAdobeContentLibrary(SITE, fetchJson);

        expect(templates).toEqual([
            { id: 'product-details-page', title: 'Product Details Page Template' },
            { id: 'category-page', title: 'Category Page Template' },
        ]);
    });

    it('asks the source site for both sheets', async () => {
        const fetchJson = fetcherFor({});

        await readAdobeContentLibrary(SITE, fetchJson);

        expect(fetchJson.mock.calls.map(([url]) => url).sort()).toEqual(
            [BLOCKS_URL, TEMPLATES_URL].sort(),
        );
    });

    it('reads a single-sheet blocks file too', async () => {
        const fetchJson = fetcherFor({
            [BLOCKS_URL]: { data: [{ name: 'Hero', path: '/docs/library/blocks/hero' }] },
        });

        const { blocks } = await readAdobeContentLibrary(SITE, fetchJson);

        expect(blocks).toEqual([{ id: 'hero', title: 'Hero' }]);
    });

    it('skips rows lacking a name or a path', async () => {
        const fetchJson = fetcherFor({
            [BLOCKS_URL]: {
                data: [
                    { name: 'Hero' },
                    { path: '/docs/library/blocks/cards' },
                    { name: 'Columns', path: '/docs/library/blocks/columns' },
                ],
            },
            [TEMPLATES_URL]: { data: [{ key: 'Only Key' }, { value: '/x/only-value' }] },
        });

        const result = await readAdobeContentLibrary(SITE, fetchJson);

        expect(result).toEqual({ blocks: [{ id: 'columns', title: 'Columns' }], templates: [] });
    });

    it('gives empty lists when the sheets are missing or malformed, never a throw', async () => {
        const fetchJson = fetcherFor({ [BLOCKS_URL]: 'not a sheet', [TEMPLATES_URL]: { data: 7 } });

        await expect(readAdobeContentLibrary(SITE, fetchJson)).resolves.toEqual({
            blocks: [],
            templates: [],
        });
    });

    it('gives empty lists when the fetcher rejects', async () => {
        const fetchJson = jest.fn(async () => {
            throw new Error('network down');
        });

        await expect(readAdobeContentLibrary(SITE, fetchJson)).resolves.toEqual({
            blocks: [],
            templates: [],
        });
    });
});
