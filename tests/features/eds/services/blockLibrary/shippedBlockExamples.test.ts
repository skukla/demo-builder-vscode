/**
 * The block examples Demo Builder ships (EDS-71, "Replaced 2026-11-24"): one JSON file per
 * source, the page each becomes in the storefront's DA.live block list, and the photo each image
 * cell takes from the storefront's own content pages.
 * Design: `.rptc/plans/block-library-without-universal-editor/overview.md` step 4.
 */

import blockLibraries from '@/features/components/config/block-libraries.json';
import { libraryMetadataTable } from '@/features/eds/services/blockLibrary/exampleDescription';
import {
    TEMPLATE_SOURCE,
    loadShippedBlockExamples,
    shippedExamplePage,
    type ShippedBlockExample,
} from '@/features/eds/services/blockLibrary/shippedBlockExamples';

const TWO_SLIDES: ShippedBlockExample = {
    description: 'A rotating banner.',
    html: '<h2>Banner, two slides</h2><div class="banner"><div><div><img alt="One"></div>'
        + '<div><p>First</p></div></div><div><div><img alt="Two"></div><div><p>Second</p></div></div>'
        + '</div><h2>Banner, one slide</h2><div class="banner"><div><div><img alt="Solo"></div>'
        + '<div><p>Only</p></div></div></div>',
};

describe('loadShippedBlockExamples', () => {
    it('has the template\'s file and one file for every block library', () => {
        const sources = [...loadShippedBlockExamples().keys()].sort();

        expect(sources).toEqual(
            [TEMPLATE_SOURCE, ...blockLibraries.libraries.map((library) => library.id)].sort(),
        );
    });

    it('holds each example under its block id, without the file\'s $schema pointer', () => {
        const template = loadShippedBlockExamples().get(TEMPLATE_SOURCE);

        expect(template?.has('$schema')).toBe(false);
        expect(template?.get('carousel')).toEqual({
            description: expect.any(String),
            html: expect.stringContaining('<div class="carousel">'),
        });
    });
});

describe('shippedExamplePage', () => {
    const PHOTOS = ['https://main--store--sc.aem.page/media_1.jpeg', 'https://main--store--sc.aem.page/media_2.png'];

    it('writes the examples as one section, the description after each example', () => {
        const { page } = shippedExamplePage({ description: 'Short.', html: '<h2>A</h2><div class="a"></div>' }, []);
        const table = libraryMetadataTable('Short.');

        expect(page).toBe('<body><header></header><main><div><h2>A</h2><div class="a"></div>'
            + `${table}</div></main><footer></footer></body>`);
    });

    it('gives each image cell a photo from the storefront, in turn, starting over when they run out', () => {
        const { page, photosMissing } = shippedExamplePage(TWO_SLIDES, PHOTOS);

        expect(photosMissing).toBe(false);
        expect([...page.matchAll(/<img [^>]*>/g)].map((m) => m[0])).toEqual([
            `<img src="${PHOTOS[0]}" alt="One">`,
            `<img src="${PHOTOS[1]}" alt="Two">`,
            `<img src="${PHOTOS[0]}" alt="Solo">`,
        ]);
    });

    it('keeps an image cell as alt text only when the storefront has no photo, and says so', () => {
        const { page, photosMissing } = shippedExamplePage(TWO_SLIDES, []);

        expect(photosMissing).toBe(true);
        expect(page).toContain('<img alt="One">');
    });

    it('does not report missing photos for an example with no image cell', () => {
        expect(shippedExamplePage({ description: 'x', html: '<div class="a"></div>' }, []).photosMissing)
            .toBe(false);
    });

    it('describes a group after its end marker only, never inside it (the Catalog Menu page)', () => {
        const catalogMenu = loadShippedBlockExamples().get('demo-builder-blocks')?.get('catalog-menu');
        if (!catalogMenu) throw new Error('the Catalog Menu example is missing');
        const { page } = shippedExamplePage(catalogMenu, []);
        const table = libraryMetadataTable(catalogMenu.description);
        // DA.live inserts everything between the markers (adobe/da-live groupBlocks).
        const groups = page.split('library-container-start').slice(1)
            .map((rest) => rest.split('library-container-end')[0]);
        const end = '<div class="library-container-end"><div><div></div></div></div>';

        expect(groups).toHaveLength(2);
        expect(groups.filter((group) => group.includes('library-metadata'))).toStrictEqual([]);
        expect(page.split(`${end}${table}`)).toHaveLength(3);
    });
});
