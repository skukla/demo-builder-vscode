/**
 * Writing the storefront's block list to DA.live (step-02): each block's example page by its
 * source, the blocks sheet in the list's order with the SC's own rows kept, Adobe's templates,
 * and ONE site-config write carrying Blocks and Templates. Reached through
 * `DaLiveBlockLibraryOperations.writeStorefrontBlockLibrary`, over the house doubles, so the
 * ARGUMENTS each collaborator receives are what is asserted.
 */

import {
    createBlockLibraryHarness,
    fakeResponse,
    fakeSheet,
    readSpreadsheetBody,
    HARNESS_TOKEN,
    type BlockLibraryHarness,
} from '../daLive/daLiveBlockLibraryOperations.testUtils';
import type { StorefrontBlock } from '@/features/eds/services/blockLibrary/storefrontBlockList';
import type {
    StorefrontLibraryInput,
} from '@/features/eds/services/blockLibrary/storefrontLibraryWriter';

const org = 'user-org';
const site = 'user-site';
const ADOBE = { org: 'adobe-commerce', site: 'boilerplate-b2b' };
const LIB = { org: 'skukla', site: 'isle5-library' };
const content = (path: string): string => `https://content.da.live/${org}/${site}/${path}`;
const doc = (inner: string): string =>
    `<body><header></header><main>${inner}</main><footer></footer></body>`;

const hero: StorefrontBlock = {
    id: 'hero', title: 'Hero',
    example: { kind: 'adobe', source: { ...ADOBE, path: '/docs/library/blocks/hero' } },
};
const cards: StorefrontBlock = { id: 'cards', title: 'Cards', example: { kind: 'existing' } };
const tabs: StorefrontBlock = {
    id: 'tabs', title: 'Tabs',
    example: { kind: 'library', source: { ...LIB, path: '/.da/library/blocks/tabs' } },
};
const carousel: StorefrontBlock = {
    id: 'carousel', title: 'Carousel',
    example: { kind: 'real-use', from: '/home', examples: [{ variant: '', html: '<div>A</div>' }] },
};
const widget: StorefrontBlock = { id: 'widget', title: 'Widget', example: { kind: 'placeholder' } };

describe('writeStorefrontBlockLibrary', () => {
    let h: BlockLibraryHarness;
    let placeholderFor: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        h = createBlockLibraryHarness();
        placeholderFor = jest.fn().mockResolvedValue({ rows: 1, columns: 2, variants: [] });
        sheetAnswers(null);
    });

    /**
     * The blocks sheet GET answers with these rows (404 for null); a HEAD (a template page
     * probe) finds no page; every POST succeeds.
     */
    function sheetAnswers(rows: Array<Record<string, string>> | null, status = 200): void {
        h.fetchWithRetry.mockImplementation(async (_url: string, init?: { method?: string }) => {
            if (init?.method === 'HEAD') return fakeResponse(404);
            if (init?.method !== 'GET') return fakeResponse(200);
            if (rows === null) return fakeResponse(404);
            return fakeResponse(status, fakeSheet(rows));
        });
    }

    const run = (overrides: Partial<StorefrontLibraryInput> = {}) =>
        h.ops.writeStorefrontBlockLibrary(org, site, {
            blocks: [hero, cards, tabs, carousel, widget],
            placeholderFor,
            ...overrides,
        });

    /** The rows of the sheet POSTed to `path`, or undefined when none was written. */
    async function postedRows(path: string): Promise<Array<Record<string, string>> | undefined> {
        const post = h.fetchWithRetry.mock.calls.find(
            ([url, init]) => String(url).endsWith(path) && init?.method === 'POST',
        );
        if (!post) return undefined;
        const body = (await readSpreadsheetBody(post[1].body)) as {
            data: { data: Array<Record<string, string>> };
        };
        return body.data.data;
    }

    describe('example pages, by source', () => {
        it('copies Adobe and library pages from preview, writes real use and placeholder docs', async () => {
            await run();

            expect(h.copySingleFile.mock.calls).toEqual([
                [HARNESS_TOKEN, { ...ADOBE, preview: true }, '/docs/library/blocks/hero',
                    { org, site }, '/.da/library/blocks/hero'],
                [HARNESS_TOKEN, { ...LIB, preview: true }, '/.da/library/blocks/tabs',
                    { org, site }, '/.da/library/blocks/tabs'],
            ]);
            expect(h.createSource.mock.calls).toEqual([
                [org, site, '.da/library/blocks/carousel.html',
                    doc('<div><div class="carousel"><div>A</div></div></div>')],
                [org, site, '.da/library/blocks/widget.html', doc('<div><div class="widget">'
                    + '<div><div><p>Column 1 content</p></div><div><p>Column 2 content</p></div>'
                    + '</div></div></div>')],
            ]);
            expect(placeholderFor.mock.calls).toEqual([['widget']]);
        });

        it('overwrites only the pages it was told replace an old stub', async () => {
            await run({ replacePageIds: new Set(['carousel']) });

            expect(h.createSource.mock.calls.map((call) => [call[2], call[4]])).toEqual([
                ['.da/library/blocks/carousel.html', { overwrite: true }],
                ['.da/library/blocks/widget.html', undefined],
            ]);
        });

        it('writes the code-shaped placeholder when a copy fails', async () => {
            h.copySingleFile.mockResolvedValue(false);

            await run({ blocks: [hero] });

            expect(placeholderFor).toHaveBeenCalledWith('hero');
            expect(h.createSource).toHaveBeenCalledWith(org, site, '.da/library/blocks/hero.html',
                expect.stringContaining('<div class="hero"><div><div><p>Column 1 content</p>'));
        });

        it('leaves a block whose page could not be written out of the list, not failing', async () => {
            h.createSource.mockImplementation(async (_o: string, _s: string, path: string) =>
                path.includes('carousel') ? { success: false, error: '500' } : { success: true });

            const result = await run();

            expect((await postedRows('.da/library/blocks.json'))?.map((r) => r.name))
                .toEqual(['Hero', 'Cards', 'Tabs', 'Widget']);
            expect(result.success).toBe(true);
            expect(result.blocksCount).toBe(4);
            expect(result.paths).not.toContain('/.da/library/blocks/carousel');
        });
    });

    describe('the blocks sheet', () => {
        it('lists every block in the list order with its content.da.live path', async () => {
            await run();

            expect(await postedRows('.da/library/blocks.json')).toEqual([
                { name: 'Hero', path: content('.da/library/blocks/hero') },
                { name: 'Cards', path: content('.da/library/blocks/cards') },
                { name: 'Tabs', path: content('.da/library/blocks/tabs') },
                { name: 'Carousel', path: content('.da/library/blocks/carousel') },
                { name: 'Widget', path: content('.da/library/blocks/widget') },
            ]);
        });

        it('keeps a matching row as it is, in our place, and the SC\'s own rows after ours', async () => {
            sheetAnswers([
                { name: 'Mine', path: 'https://content.da.live/x/y/mine' },
                { name: 'Our Picks', path: content('.da/library/blocks/cards'), note: 'n' },
                { name: 'HERO', path: 'https://their/hero', note: 'h' },
                { name: '', path: content('.da/library/blocks/tabs') },
                { name: 'Also Mine', path: 'https://content.da.live/x/y/also' },
            ]);

            await run({ blocks: [hero, cards, tabs] });

            // A matched row keeps its own name (an agent's promote title or the SC's) and every
            // column it has; only a missing one is filled.
            expect(await postedRows('.da/library/blocks.json')).toEqual([
                { name: 'HERO', path: 'https://their/hero', note: 'h' },
                { name: 'Our Picks', path: content('.da/library/blocks/cards'), note: 'n' },
                { name: 'Tabs', path: content('.da/library/blocks/tabs') },
                { name: 'Mine', path: 'https://content.da.live/x/y/mine' },
                { name: 'Also Mine', path: 'https://content.da.live/x/y/also' },
            ]);
        });

        it('drops a row Demo Builder wrote for a block no longer listed, keeps every other', async () => {
            const otherSite = 'https://content.da.live/user-org/other-site/.da/library/blocks/item';
            sheetAnswers([
                { name: 'Accordion Item', path: content('.da/library/blocks/accordion-item') },
                { name: 'Mine', path: content('.da/library/mine/thing') },
                { name: 'Other Site Item', path: otherSite },
                { name: 'No Path' },
            ]);

            await run({ blocks: [cards] });

            expect(await postedRows('.da/library/blocks.json')).toEqual([
                { name: 'Cards', path: content('.da/library/blocks/cards') },
                { name: 'Mine', path: content('.da/library/mine/thing') },
                { name: 'Other Site Item', path: otherSite },
                { name: 'No Path' },
            ]);
        });

        it('writes nothing when the existing sheet cannot be read, so no SC row is lost', async () => {
            sheetAnswers([], 500);

            const result = await run();

            expect(result.success).toBe(false);
            expect(h.createSource).not.toHaveBeenCalled();
            expect(h.copySingleFile).not.toHaveBeenCalled();
            expect(h.deleteSource).not.toHaveBeenCalled();
            expect(h.updateSiteConfig).not.toHaveBeenCalled();
            expect(await postedRows('.da/library/blocks.json')).toBeUndefined();
        });

        it('deletes the old sheet variants, never the blocks sheet it merges', async () => {
            await run();

            expect(h.deleteSource.mock.calls).toEqual([
                [org, site, '.da/library/blocks.html'],
                [org, site, '.da/library/blocks.xlsx'],
                [org, site, '.da/library/storefront-blocks.json'],
                [org, site, '.da/library/storefront-blocks.html'],
                [org, site, '.da/library/block-collection.json'],
                [org, site, '.da/library/block-collection.html'],
            ]);
        });
    });

    describe('templates and the site config', () => {
        const templates = {
            source: ADOBE,
            entries: [{ id: 'landing', title: 'Landing Page' }, { id: 'blog', title: 'Blog' }],
        };

        it('copies each template, writes the sheet, and registers both lists in one call', async () => {
            h.copySingleFile.mockImplementation(
                async (_t, _s, path: string) => path !== '/docs/library/templates/blog',
            );

            const result = await run({ blocks: [cards], templates });

            expect(h.copySingleFile.mock.calls).toEqual([
                [HARNESS_TOKEN, { ...ADOBE, preview: true }, '/docs/library/templates/landing',
                    { org, site }, '/.da/library/templates/landing'],
                [HARNESS_TOKEN, { ...ADOBE, preview: true }, '/docs/library/templates/blog',
                    { org, site }, '/.da/library/templates/blog'],
            ]);
            expect(await postedRows('.da/library/templates.json')).toEqual([
                { key: 'Landing Page', value: content('.da/library/templates/landing') },
            ]);
            expect(h.updateSiteConfig.mock.calls).toEqual([[org, site, [
                { title: 'Blocks', path: content('.da/library/blocks.json') },
                { title: 'Templates', path: content('.da/library/templates.json') },
            ], { keepOtherRows: true }]]);
            expect(result).toEqual({
                success: true,
                blocksCount: 1,
                paths: ['/.da/library/blocks.json', '/.da/library/blocks/cards',
                    '/.da/library/templates.json', '/.da/library/templates/landing'],
            });
        });

        it('registers Blocks alone and writes no templates sheet without Adobe templates', async () => {
            const result = await run();

            expect(await postedRows('.da/library/templates.json')).toBeUndefined();
            // keepOtherRows: rows the SC added to the config's library (plugins, lists) survive.
            expect(h.updateSiteConfig.mock.calls).toEqual([[org, site, [
                { title: 'Blocks', path: content('.da/library/blocks.json') },
            ], { keepOtherRows: true }]]);
            expect(result.paths).toEqual([
                '/.da/library/blocks.json',
                '/.da/library/blocks/hero', '/.da/library/blocks/cards', '/.da/library/blocks/tabs',
                '/.da/library/blocks/carousel', '/.da/library/blocks/widget',
            ]);
        });

        it('reports the empty palette when the site config refuses the lists (EDS-38)', async () => {
            h.updateSiteConfig.mockResolvedValue({ success: false, error: 'config 403' });

            const result = await run({ blocks: [cards] });

            expect(result).toEqual({
                success: false,
                blocksCount: 1,
                paths: ['/.da/library/blocks.json', '/.da/library/blocks/cards'],
                error: 'The block palette in DA.live will be empty: the site configuration did not take the Blocks list (config 403).',
            });
        });
    });
});
