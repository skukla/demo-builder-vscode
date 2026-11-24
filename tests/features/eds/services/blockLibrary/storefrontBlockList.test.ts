/**
 * The storefront's block list and where each block's example comes from (step-02 convention):
 * an existing page, then Adobe's page, then the library's page, then a real use, then a
 * placeholder the caller builds from the block's code.
 */

import {
    EXAMPLE_KINDS,
    buildStorefrontBlockList,
    type StorefrontBlockListInput,
} from '@/features/eds/services/blockLibrary/storefrontBlockList';
import type { BlockUse } from '@/features/eds/services/blockLibrary/blockUseIndex';

const ADOBE_SITE = { org: 'adobe-commerce', site: 'boilerplate-b2b' };
const LIB_SITE = { org: 'skukla', site: 'isle5-library' };

function input(overrides: Partial<StorefrontBlockListInput> = {}): StorefrontBlockListInput {
    return {
        adobeBlocks: [],
        repoBlockIds: [],
        libraries: [],
        existingPageIds: new Set<string>(),
        librarySiteUses: new Map<string, BlockUse>(),
        contentSourceUses: new Map<string, BlockUse>(),
        librarySitePages: new Map<string, string>(),
        ...overrides,
    };
}

function use(path: string, html: string): BlockUse {
    return { path, examples: [{ variant: '', html }] };
}

function exampleOf(list: ReturnType<typeof buildStorefrontBlockList>, id: string) {
    return list.find((block) => block.id === id)?.example;
}

describe('buildStorefrontBlockList: the list', () => {
    it('lists Adobe first in its order, then the rest A to Z, then commerce-* A to Z', () => {
        const list = buildStorefrontBlockList(input({
            adobeBlocks: [
                { id: 'hero', title: 'Hero' },
                { id: 'accordion', title: 'Accordion' },
                { id: 'section-metadata', title: 'Section-metadata' },
            ],
            repoBlockIds: [
                'commerce-cart', 'product-recommendations', 'hero', 'carousel',
                'commerce-b2b-po-header', 'accordion', 'cards',
            ],
        }));

        expect(list.map((block) => block.id)).toEqual([
            'hero', 'accordion', 'section-metadata',
            'cards', 'carousel', 'product-recommendations',
            'commerce-b2b-po-header', 'commerce-cart',
        ]);
    });

    it('keeps Adobe titles and names the rest as Import Blocks does', () => {
        const list = buildStorefrontBlockList(input({
            adobeBlocks: [{ id: 'section-metadata', title: 'Section-metadata' }],
            repoBlockIds: ['product-recommendations', 'commerce-b2b-po-header'],
        }));

        expect(list.map((block) => block.title)).toEqual([
            'Section-metadata', 'Product Recommendations', 'Commerce B2b Po Header',
        ]);
    });

    // The list follows the code (EDS-71 step 5): a block whose folder was removed must not
    // come back from Adobe's library on the next Refresh Blocks.
    it('leaves out an Adobe block the repository has no folder for', () => {
        const list = buildStorefrontBlockList(input({
            adobeBlocks: [{ id: 'hero', title: 'Hero' }, { id: 'cards', title: 'Cards' }],
            repoBlockIds: ['cards'],
        }));

        expect(list.map((block) => block.id)).toEqual(['cards']);
    });

    // EDS handles these in its core script; no template has a folder for them.
    it('keeps metadata and section-metadata, which have no folder', () => {
        const list = buildStorefrontBlockList(input({
            adobeBlocks: [
                { id: 'metadata', title: 'Metadata' },
                { id: 'section-metadata', title: 'Section Metadata' },
                { id: 'fragment', title: 'Fragment' },
            ],
            repoBlockIds: ['cards'],
        }));

        expect(list.map((block) => block.id)).toEqual(['metadata', 'section-metadata', 'cards']);
    });

    // EDS block class names follow the block-name rule, so another folder name is not a block
    // the palette can place.
    it('leaves out a folder whose name is not a block name', () => {
        const list = buildStorefrontBlockList(input({
            repoBlockIds: ['cards', 'Old_Cards', 'hero.bak', 'tabs-'],
        }));

        expect(list.map((block) => block.id)).toEqual(['cards']);
    });

    it('lists a repository block once even if named twice', () => {
        const list = buildStorefrontBlockList(input({ repoBlockIds: ['cards', 'cards'] }));

        expect(list.map((block) => block.id)).toEqual(['cards']);
    });
});

describe('buildStorefrontBlockList: where each example comes from', () => {
    it('pins the convention order, placeholder last', () => {
        expect(EXAMPLE_KINDS).toEqual(['existing', 'adobe', 'library', 'real-use', 'placeholder']);
    });

    it('keeps the storefront\'s existing page over Adobe\'s', () => {
        const list = buildStorefrontBlockList(input({
            adobeBlocks: [{ id: 'hero', title: 'Hero' }],
            repoBlockIds: ['hero'],
            adobeSite: ADOBE_SITE,
            existingPageIds: new Set(['hero']),
        }));

        expect(exampleOf(list, 'hero')).toEqual({ kind: 'existing' });
    });

    it('uses Adobe\'s page on Adobe\'s source site for an Adobe block', () => {
        const list = buildStorefrontBlockList(input({
            adobeBlocks: [{ id: 'hero', title: 'Hero' }],
            repoBlockIds: ['hero'],
            adobeSite: ADOBE_SITE,
            contentSourceUses: new Map([['hero', use('/', '<div>h</div>')]]),
        }));

        expect(exampleOf(list, 'hero')).toEqual({
            kind: 'adobe',
            source: { ...ADOBE_SITE, path: '/docs/library/blocks/hero' },
        });
    });

    it('does not use Adobe\'s page when there is no Adobe source site', () => {
        const list = buildStorefrontBlockList(input({
            adobeBlocks: [{ id: 'hero', title: 'Hero' }],
            repoBlockIds: ['hero'],
        }));

        expect(exampleOf(list, 'hero')).toEqual({ kind: 'placeholder' });
    });

    it('uses the library page at the path the caller found, over a real use', () => {
        const list = buildStorefrontBlockList(input({
            repoBlockIds: ['tabs'],
            libraries: [{ site: LIB_SITE, blockIds: ['tabs'] }],
            librarySitePages: new Map([['skukla/isle5-library/tabs', '/.da/library/blocks/tabs']]),
            librarySiteUses: new Map([['skukla/isle5-library/tabs', use('/home', '<div>t</div>')]]),
        }));

        expect(exampleOf(list, 'tabs')).toEqual({
            kind: 'library',
            source: { ...LIB_SITE, path: '/.da/library/blocks/tabs' },
        });
    });

    it('prefers a real use on the library site over one on the content source', () => {
        const libraryUse: BlockUse = {
            path: '/lib',
            examples: [{ variant: '', html: 'L' }, { variant: 'wide', html: 'W' }],
        };
        const list = buildStorefrontBlockList(input({
            repoBlockIds: ['tabs'],
            libraries: [{ site: LIB_SITE, blockIds: ['tabs'] }],
            librarySiteUses: new Map([['skukla/isle5-library/tabs', libraryUse]]),
            contentSourceUses: new Map([['tabs', use('/cs', 'C')]]),
        }));

        expect(exampleOf(list, 'tabs')).toEqual({
            kind: 'real-use', examples: libraryUse.examples, from: '/lib',
        });
    });

    it('takes a library block\'s real use from its own library\'s site, not another library\'s', () => {
        const OTHER_SITE = { org: 'other', site: 'gallery-library' };
        const both = {
            repoBlockIds: ['tabs', 'gallery'],
            libraries: [
                { site: LIB_SITE, blockIds: ['tabs'] },
                { site: OTHER_SITE, blockIds: ['gallery'] },
            ],
            contentSourceUses: new Map([['tabs', use('/cs', 'C')]]),
        };

        const otherUsesTabs = buildStorefrontBlockList(input({
            ...both,
            librarySiteUses: new Map([['other/gallery-library/tabs', use('/other', 'O')]]),
        }));
        const ownUsesTabs = buildStorefrontBlockList(input({
            ...both,
            librarySiteUses: new Map([
                ['other/gallery-library/tabs', use('/other', 'O')],
                ['skukla/isle5-library/tabs', use('/own', 'T')],
            ]),
        }));

        expect(exampleOf(otherUsesTabs, 'tabs')).toMatchObject({ kind: 'real-use', from: '/cs' });
        expect(exampleOf(ownUsesTabs, 'tabs')).toMatchObject({ kind: 'real-use', from: '/own' });
    });

    it('ignores library-site uses for a block in no library', () => {
        const list = buildStorefrontBlockList(input({
            repoBlockIds: ['commerce-cart'],
            librarySiteUses: new Map([['skukla/isle5-library/commerce-cart', use('/lib', 'L')]]),
            contentSourceUses: new Map([['commerce-cart', use('/cart', 'C')]]),
        }));

        expect(exampleOf(list, 'commerce-cart')).toEqual({
            kind: 'real-use', examples: [{ variant: '', html: 'C' }], from: '/cart',
        });
    });

    it('skips the library rules for a library with no site', () => {
        const list = buildStorefrontBlockList(input({
            repoBlockIds: ['hero-cta'],
            libraries: [{ blockIds: ['hero-cta'] }],
            librarySiteUses: new Map([['skukla/isle5-library/hero-cta', use('/lib', 'L')]]),
            contentSourceUses: new Map([['hero-cta', use('/cs', 'C')]]),
        }));

        expect(exampleOf(list, 'hero-cta')).toEqual({
            kind: 'real-use', examples: [{ variant: '', html: 'C' }], from: '/cs',
        });
    });

    it('falls to the placeholder when no source has the block', () => {
        const list = buildStorefrontBlockList(input({ repoBlockIds: ['carousel'] }));

        expect(exampleOf(list, 'carousel')).toEqual({ kind: 'placeholder' });
    });
});
