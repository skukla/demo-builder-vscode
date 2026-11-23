/**
 * The block-example convention, as the handbook states it (§4, "A block's example in the
 * DA.live block list is the first that exists"): Adobe's example page, its block library's
 * example page, a real use copied from a page (library site first, then the storefront's
 * content source), else a placeholder shaped by the block's code. Never an invented sample,
 * and a page someone wrote is never replaced.
 * Design: `.rptc/plans/block-library-without-universal-editor/step-02.md`.
 *
 * Three things are pinned: the order of {@link EXAMPLE_KINDS}; that each kind wins over every
 * later one when both exist; and that every page body the writer sends is either a copy of a
 * real page or `blockDoc`'s output, with only a generated page written over: the old Demo
 * Builder stub holding the block's title, or an untouched "Column N content" placeholder.
 */

import {
    createBlockLibraryHarness,
    fakeResponse,
} from '../daLive/daLiveBlockLibraryOperations.testUtils';
import { blockDoc } from '@/features/eds/services/blockLibrary/blockDoc';
import type { BlockUse } from '@/features/eds/services/blockLibrary/blockUseIndex';
import {
    isGeneratedPlaceholder,
    isOldStubPage,
} from '@/features/eds/services/blockLibrary/oldStubPages';
import {
    EXAMPLE_KINDS,
    buildStorefrontBlockList,
    type StorefrontBlock,
    type StorefrontBlockListInput,
} from '@/features/eds/services/blockLibrary/storefrontBlockList';

const ADOBE_SITE = { org: 'adobe-commerce', site: 'boilerplate-b2b' };
const LIB_SITE = { org: 'skukla', site: 'isle5-library' };
const CONTENT_USE: BlockUse = { path: '/about', examples: [{ variant: '', html: '<div>c</div>' }] };
const LIBRARY_USE: BlockUse = { path: '/home', examples: [{ variant: '', html: '<div>l</div>' }] };

/** Every source exists for `tabs`, an Adobe block in an installed library. */
function everySource(): StorefrontBlockListInput {
    return {
        adobeBlocks: [{ id: 'tabs', title: 'Tabs' }],
        adobeSite: ADOBE_SITE,
        repoBlockIds: ['tabs'],
        libraries: [{ site: LIB_SITE, blockIds: ['tabs'] }],
        existingPageIds: new Set(['tabs']),
        librarySitePages: new Map([['skukla/isle5-library/tabs', '/docs/library/blocks/tabs']]),
        librarySiteUses: new Map([['skukla/isle5-library/tabs', LIBRARY_USE]]),
        contentSourceUses: new Map([['tabs', CONTENT_USE]]),
    };
}

/** Takes away the source each kind is chosen from, in the order the kinds are tried. */
const REMOVE_SOURCE: Partial<Record<
    (typeof EXAMPLE_KINDS)[number],
    (input: StorefrontBlockListInput) => void
>> = {
    existing: (input) => { input.existingPageIds = new Set(); },
    adobe: (input) => { input.adobeSite = undefined; },
    library: (input) => { input.librarySitePages = new Map(); },
    'real-use': (input) => {
        input.librarySiteUses = new Map();
        input.contentSourceUses = new Map();
    },
};

const kindOf = (input: StorefrontBlockListInput): string =>
    buildStorefrontBlockList(input)[0].example.kind;

describe('the block-example convention', () => {
    it('tries the example sources in the stated order', () => {
        expect(EXAMPLE_KINDS).toEqual(['existing', 'adobe', 'library', 'real-use', 'placeholder']);
    });

    it('chooses each kind over every later one while its source exists', () => {
        const input = everySource();
        const chosen: string[] = [];
        for (const kind of EXAMPLE_KINDS) {
            chosen.push(kindOf(input));
            REMOVE_SOURCE[kind]?.(input);
        }

        expect(chosen).toEqual([...EXAMPLE_KINDS]);
    });

    it('takes a real use from the library site before the content source', () => {
        const input = { ...everySource(), existingPageIds: new Set<string>(), adobeSite: undefined };
        input.librarySitePages = new Map();

        expect(buildStorefrontBlockList(input)[0].example).toMatchObject({ from: '/home' });
        input.librarySiteUses = new Map();
        expect(buildStorefrontBlockList(input)[0].example).toMatchObject({ from: '/about' });
    });
});

describe('the pages the writer sends', () => {
    const org = 'user-org';
    const site = 'user-site';
    const ANALYSIS = { rows: 2, columns: 1, variants: [] };
    const BLOCKS: StorefrontBlock[] = [
        { id: 'kept', title: 'Kept', example: { kind: 'existing' } },
        {
            id: 'hero', title: 'Hero',
            example: { kind: 'adobe', source: { ...ADOBE_SITE, path: '/docs/library/blocks/hero' } },
        },
        {
            id: 'tabs', title: 'Tabs',
            example: { kind: 'library', source: { ...LIB_SITE, path: '/docs/library/blocks/tabs' } },
        },
        {
            id: 'carousel', title: 'Carousel',
            example: { kind: 'real-use', from: '/home', examples: LIBRARY_USE.examples },
        },
        { id: 'widget', title: 'Widget', example: { kind: 'placeholder' } },
    ];

    async function write(replacePageIds?: Set<string>) {
        const h = createBlockLibraryHarness();
        h.fetchWithRetry.mockImplementation(async (_url: string, init?: { method?: string }) =>
            fakeResponse(init?.method === 'GET' ? 404 : 200));
        await h.ops.writeStorefrontBlockLibrary(org, site, {
            blocks: BLOCKS,
            placeholderFor: async () => ANALYSIS,
            ...(replacePageIds ? { replacePageIds } : {}),
        });
        const pageWrites = h.createSource.mock.calls
            .filter((call) => String(call[2]).startsWith('.da/library/blocks/'));
        return { h, pageWrites };
    }

    it('copies Adobe and library pages, and writes every other page with blockDoc', async () => {
        const { h, pageWrites } = await write();

        expect(h.copySingleFile.mock.calls.map((call) => call[4])).toEqual([
            '/.da/library/blocks/hero', '/.da/library/blocks/tabs',
        ]);
        expect(pageWrites.map((call) => [call[2], call[3]])).toEqual([
            ['.da/library/blocks/carousel.html', blockDoc('carousel', { examples: LIBRARY_USE.examples })],
            ['.da/library/blocks/widget.html', blockDoc('widget', { analysis: ANALYSIS })],
        ]);
    });

    it('never writes over a page, but for an old stub it was told to replace', async () => {
        const plain = await write();
        expect(plain.pageWrites.every((call) => call[4] === undefined)).toBe(true);

        const replacing = await write(new Set(['widget']));
        expect(replacing.pageWrites.map((call) => [call[2], call[4]])).toEqual([
            ['.da/library/blocks/carousel.html', undefined],
            ['.da/library/blocks/widget.html', { overwrite: true }],
        ]);
    });

    const stubPage = (cell: string, cls = 'hero'): string => '<body><header></header><main><div>'
        + `<div class="${cls}"><div><div>${cell}</div></div></div></div></main><footer></footer></body>`;

    it('counts as an old stub only the exact page Demo Builder once wrote', () => {
        const titles = ['Hero'];

        expect(isOldStubPage('hero', stubPage('<p>Hero</p>'), titles)).toBe(true);
        expect(isOldStubPage('hero', stubPage('<p>Hero</p><p>Our story</p>'), titles)).toBe(false);
        expect(isOldStubPage('hero', stubPage('<p><strong>Hero</strong></p>'), titles)).toBe(false);
        expect(isOldStubPage('hero', stubPage('<p>Hero</p></div><div><p>B</p>'), titles)).toBe(false);
        expect(isOldStubPage('hero', stubPage('<p>Hero</p>', 'hero dark'), titles)).toBe(false);
        expect(isOldStubPage('cards', stubPage('<p>Hero</p>'), titles)).toBe(false);
    });

    it('counts as an old stub only a cell holding exactly one of the block\'s titles', () => {
        // The old builder wrote the block's title in the cell and as its sheet row's name.
        const titles = ['Hero', 'Big Banner'];

        expect(isOldStubPage('hero', stubPage('<p>Big Banner</p>'), titles)).toBe(true);
        // Rewritten text, or a promoted page with one plain-text cell (same envelope), is kept.
        expect(isOldStubPage('hero', stubPage('<p>Welcome to our store</p>'), titles)).toBe(false);
        expect(isOldStubPage('hero', stubPage('<p>hero</p>'), titles)).toBe(false);
        expect(isOldStubPage('hero', stubPage('<p>Hero</p>'), [])).toBe(false);
    });

    it('counts a placeholder exactly as blockDoc writes it as generated, any edit as authored', () => {
        const generated = blockDoc('hero', { analysis: { rows: 2, columns: 2, variants: ['dark'] } });
        const edited = generated.replace('Column 2 content', 'Our story');
        const stub = stubPage('<p>Hero</p>');

        expect(isGeneratedPlaceholder('hero', generated)).toBe(true);
        expect(isGeneratedPlaceholder('hero', blockDoc('hero'))).toBe(true);
        expect(isGeneratedPlaceholder('hero', edited)).toBe(false);
        expect(isGeneratedPlaceholder('cards', generated)).toBe(false);
        expect(isGeneratedPlaceholder('hero', stub)).toBe(false);
        expect(isGeneratedPlaceholder('hero', blockDoc('hero', { examples: LIBRARY_USE.examples })))
            .toBe(false);
        expect(isGeneratedPlaceholder('hero', generated.replace('Column 2', 'Column 3'))).toBe(false);
    });
});
