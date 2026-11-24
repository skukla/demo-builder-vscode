/**
 * What the library writer must never do (step-02): report success over an empty palette, take
 * an expired DA.live sign-in for "no page", or write over a template page or a templates-sheet
 * row someone else wrote. DA.live's source POST always writes, so the writer's own existence
 * check is the only thing keeping such a page. Reached through
 * `DaLiveBlockLibraryOperations.writeStorefrontBlockLibrary` over the house doubles.
 */

import {
    createBlockLibraryHarness,
    fakeResponse,
    fakeSheet,
    readSpreadsheetBody,
    type BlockLibraryHarness,
} from '../daLive/daLiveBlockLibraryOperations.testUtils';
import { blockDoc } from '@/features/eds/services/blockLibrary/blockDoc';
import type { StorefrontBlock } from '@/features/eds/services/blockLibrary/storefrontBlockList';
import type {
    StorefrontLibraryInput,
} from '@/features/eds/services/blockLibrary/storefrontLibraryWriter';
import { DaLiveAuthError } from '@/features/eds/services/types';

const org = 'user-org';
const site = 'user-site';
const ADOBE = { org: 'adobe-commerce', site: 'boilerplate-b2b' };
const content = (path: string): string => `https://content.da.live/${org}/${site}/${path}`;

const hero: StorefrontBlock = {
    id: 'hero', title: 'Hero',
    example: { kind: 'adobe', source: { ...ADOBE, path: '/docs/library/blocks/hero' } },
};
const widget: StorefrontBlock = { id: 'widget', title: 'Widget', example: { kind: 'placeholder' } };
const cards: StorefrontBlock = { id: 'cards', title: 'Cards', example: { kind: 'existing' } };
const TEMPLATES = {
    source: ADOBE,
    entries: [{ id: 'landing', title: 'Landing Page' }, { id: 'blog', title: 'Blog' }],
};

type Rows = Array<Record<string, string>>;

describe('writeStorefrontBlockLibrary: what it must not do', () => {
    let h: BlockLibraryHarness;

    beforeEach(() => {
        jest.clearAllMocks();
        h = createBlockLibraryHarness();
        answer({});
    });

    /**
     * GETs of a sheet path answer its rows (404 when absent); a HEAD answers `heads[url end]`,
     * 404 by default; every POST succeeds.
     */
    function answer(sheets: Record<string, Rows | number>, heads: Record<string, number> = {}): void {
        h.fetchWithRetry.mockImplementation(async (url: string, init?: { method?: string }) => {
            const key = Object.keys(init?.method === 'HEAD' ? heads : sheets)
                .find((end) => url.endsWith(end));
            if (init?.method === 'HEAD') return fakeResponse(key ? heads[key] : 404);
            if (init?.method !== 'GET') return fakeResponse(200);
            const sheet = key === undefined ? 404 : sheets[key];
            return typeof sheet === 'number' ? fakeResponse(sheet) : fakeResponse(200, fakeSheet(sheet));
        });
    }

    const run = (overrides: Partial<StorefrontLibraryInput> = {}) =>
        h.ops.writeStorefrontBlockLibrary(org, site, {
            blocks: [cards],
            placeholderFor: jest.fn().mockResolvedValue({ rows: 1, columns: 1, variants: [] }),
            ...overrides,
        });

    async function postedRows(path: string): Promise<Rows | undefined> {
        const post = h.fetchWithRetry.mock.calls.find(
            ([url, init]) => String(url).endsWith(path) && init?.method === 'POST',
        );
        if (!post) return undefined;
        return ((await readSpreadsheetBody(post[1].body)) as { data: { data: Rows } }).data.data;
    }

    describe('an empty palette', () => {
        it('fails, in a sentence, when blocks were asked for and none got a page', async () => {
            h.copySingleFile.mockResolvedValue(false);
            h.createSource.mockResolvedValue({ success: false, error: '500' });

            const result = await run({ blocks: [hero, widget] });

            expect(result).toEqual({
                success: false,
                blocksCount: 0,
                paths: [],
                error: 'The block palette in DA.live will be empty: none of the 2 blocks got a '
                    + 'page.',
            });
            expect(h.updateSiteConfig).not.toHaveBeenCalled();
        });

        it('succeeds with nothing to do when no block was asked for', async () => {
            const result = await run({ blocks: [] });

            expect(result).toEqual({ success: true, blocksCount: 0, paths: [], needsExample: [] });
        });
    });

    describe('a generated page that would not change', () => {
        const PLACEHOLDER = blockDoc('widget', { analysis: { rows: 1, columns: 1, variants: [] } });
        const carousel: StorefrontBlock = {
            id: 'carousel', title: 'Carousel',
            example: {
                kind: 'real-use', from: '/home', examples: [{ variant: '', html: '<div>A</div>' }],
            },
        };

        it('is not written again (DA.live keeps a version per write), and stays listed', async () => {
            // The same body as DA.live may hold it, with line breaks between tags.
            const current = PLACEHOLDER.replace(/></g, '>\n  <');

            const result = await run({
                blocks: [widget],
                replacePageIds: new Set(['widget']),
                replacedPages: new Map([['widget', current]]),
            });

            expect(h.createSource).not.toHaveBeenCalled();
            expect(await postedRows('.da/library/blocks.json')).toEqual([
                { name: 'Widget', path: content('.da/library/blocks/widget') },
            ]);
            expect(result).toMatchObject({ success: true, blocksCount: 1 });
        });

        it('is written when a better example is now available', async () => {
            const placeholder = blockDoc('carousel', { analysis: { rows: 1, columns: 1, variants: [] } });

            await run({
                blocks: [carousel],
                replacePageIds: new Set(['carousel']),
                replacedPages: new Map([['carousel', placeholder]]),
            });

            expect(h.createSource.mock.calls.map((call) => call[2]))
                .toEqual(['.da/library/blocks/carousel.html']);
        });
    });

    describe('an expired DA.live sign-in is let through, so the caller can ask again', () => {
        it('while reading the blocks sheet', async () => {
            answer({ '.da/library/blocks.json': 401 });
            h.createErrorFromResponse.mockImplementation(() => {
                // What the real `DaLiveApiClient.createErrorFromResponse` does on a 401.
                throw new DaLiveAuthError('Authentication expired. Please log in again.');
            });

            await expect(run()).rejects.toBeInstanceOf(DaLiveAuthError);
            expect(h.createSource).not.toHaveBeenCalled();
        });

        it('while copying a block page', async () => {
            h.copySingleFile.mockRejectedValue(
                new DaLiveAuthError('DA.live token expired during content copy'),
            );

            await expect(run({ blocks: [hero] })).rejects.toBeInstanceOf(DaLiveAuthError);
        });

        it('while writing a block page', async () => {
            h.createSource.mockRejectedValue(new DaLiveAuthError('Not authenticated.'));

            await expect(run({ blocks: [widget] })).rejects.toBeInstanceOf(DaLiveAuthError);
        });

        it('while checking for a template page', async () => {
            answer({}, { '.da/library/templates/landing.html': 401 });

            await expect(run({ templates: TEMPLATES })).rejects.toBeInstanceOf(DaLiveAuthError);
        });
    });

    describe('templates someone else wrote', () => {
        it('copies only the template pages that are not there, an unknown one counting as there', async () => {
            answer({}, {
                '.da/library/templates/landing.html': 200,
                '.da/library/templates/blog.html': 503,
            });

            const result = await run({ templates: TEMPLATES });

            expect(h.copySingleFile).not.toHaveBeenCalled();
            expect(await postedRows('.da/library/templates.json')).toEqual([
                { key: 'Landing Page', value: content('.da/library/templates/landing') },
                { key: 'Blog', value: content('.da/library/templates/blog') },
            ]);
            expect(result.paths).toEqual(expect.arrayContaining([
                '/.da/library/templates.json', '/.da/library/templates/landing',
            ]));
        });

        it('keeps the sheet\'s rows and their columns, adding ours by path or title', async () => {
            answer({
                '.da/library/templates.json': [
                    { key: 'My Template', value: content('.da/library/templates/mine'), tag: 'x' },
                    { key: 'Our Landing', value: content('.da/library/templates/landing'), tag: 'y' },
                    { key: 'BLOG', value: 'https://their/blog' },
                ],
            });

            await run({ templates: TEMPLATES });

            expect(await postedRows('.da/library/templates.json')).toEqual([
                { key: 'My Template', value: content('.da/library/templates/mine'), tag: 'x' },
                { key: 'Our Landing', value: content('.da/library/templates/landing'), tag: 'y' },
                { key: 'BLOG', value: 'https://their/blog' },
            ]);
        });

        it('writes no template and leaves the sheet when the sheet cannot be read', async () => {
            answer({ '.da/library/templates.json': 503 });

            const result = await run({ templates: TEMPLATES });

            expect(h.copySingleFile).not.toHaveBeenCalled();
            expect(await postedRows('.da/library/templates.json')).toBeUndefined();
            expect(result.paths).not.toContain('/.da/library/templates.json');
        });
    });
});
