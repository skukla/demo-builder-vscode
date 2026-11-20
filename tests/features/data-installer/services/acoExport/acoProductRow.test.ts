/**
 * One Commerce product as one `aco_products` row, the service's mapping
 * (`acoProductsExportTransform.js` L262-366; aco-export-spec.md §3).
 */

import { productRow } from '@/features/data-installer/services/acoExport/acoProductRow';
import { catalogProduct } from '../../../../helpers/acoFixtures';

const SLUGS = new Map([
    ['3', 'men/tops'],
    ['9', 'gear'],
]);

describe('productRow', () => {
    it('names the product by SKU, name, url key and status, for this store view', () => {
        const row = productRow(catalogProduct('DigiWristQuantum'), 'default', SLUGS);

        expect(row).toMatchObject({
            sku: 'DigiWristQuantum',
            source: { locale: 'default' },
            name: 'DigiWristQuantum name',
            slug: 'digiwristquantum',
            status: 'ENABLED',
            visibleIn: ['CATALOG', 'SEARCH'],
            description: null,
        });
    });

    it.each([
        [2, ['CATALOG']],
        [3, ['SEARCH']],
    ])('reads visibility %s as %j', (visibility, visibleIn) => {
        expect(
            productRow(catalogProduct('A', { visibility }), 'default', SLUGS)?.visibleIn
        ).toEqual(visibleIn);
    });

    it('leaves visibleIn out for a product not visible on its own, and reads status 2 as disabled', () => {
        const row = productRow(catalogProduct('A', { visibility: 1, status: 2 }), 'default', SLUGS);

        expect(row).not.toHaveProperty('visibleIn');
        expect(row?.status).toBe('DISABLED');
    });

    it.each([
        ['no url key', catalogProduct('A', {}, { url_key: '' })],
        ['no name', catalogProduct('A', { name: ' ' })],
        ['an unknown status', catalogProduct('A', { status: 0 })],
    ])('makes no row for a product with %s', (_why, product) => {
        expect(productRow(product, 'default', SLUGS)).toBeUndefined();
    });

    it('carries its descriptions and meta tags, keywords split on commas', () => {
        const row = productRow(
            catalogProduct(
                'A',
                {},
                {
                    description: '<p>Long</p>',
                    short_description: '<p>Short</p>',
                    meta_title: 'Title',
                    meta_keyword: 'watch, smart ,,wrist',
                }
            ),
            'default',
            SLUGS
        );

        expect(row).toMatchObject({
            description: '<p>Long</p>',
            shortDescription: '<p>Short</p>',
            metaTags: { title: 'Title', keywords: ['watch', 'smart', 'wrist'] },
        });
    });

    it('carries every other attribute with a value as it is stored, never the structural ones', () => {
        const row = productRow(
            catalogProduct(
                'A',
                {},
                {
                    cs_manufacturer: '51',
                    band_type: '14',
                    tax_class_id: '2',
                    category_ids: ['3'],
                    gift_message_available: '',
                }
            ),
            'default',
            SLUGS
        );

        expect(row?.attributes).toEqual([
            { code: 'cs_manufacturer', values: ['51'] },
            { code: 'band_type', values: ['14'] },
        ]);
    });

    it('routes it to each of its categories that has a slug, with the position the store gives', () => {
        const product = catalogProduct(
            'A',
            { extension_attributes: { category_links: [{ category_id: '3', position: -1 }] } },
            { category_ids: ['3', '9', '77'] }
        );

        expect(productRow(product, 'default', SLUGS)?.routes).toEqual([
            { path: 'men/tops', position: -1 },
            { path: 'gear' },
        ]);
    });

    it('takes its images from the media gallery: the file as the url, roles mapped, BASE when none', () => {
        const product = catalogProduct('A', {
            media_gallery_entries: [
                { file: 'https://assets.example.com/a', label: null, types: [] },
                {
                    file: '/m/b.jpg',
                    label: 'Back',
                    types: ['small_image', 'thumbnail', 'swatch_image'],
                },
                { file: ' ', label: 'blank', types: ['image'] },
            ],
        });

        expect(productRow(product, 'default', SLUGS)?.images).toEqual([
            { url: 'https://assets.example.com/a', label: '', roles: ['BASE'] },
            { url: '/m/b.jpg', label: 'Back', roles: ['THUMBNAIL'] },
        ]);
    });

    it('leaves out the attributes it is told to, and takes the configurations and bundles it is given', () => {
        const configurations = [
            {
                attributeCode: 'color',
                label: 'Color',
                defaultVariantReferenceId: 'A-color-red',
                type: 'CONFIGURABLE' as const,
                values: [{ variantReferenceId: 'A-color-red', label: 'Red' }],
            },
        ];
        const row = productRow(
            catalogProduct('A', {}, { color: '51', material: 'cotton' }),
            'default',
            SLUGS,
            {
                omit: new Set(['color']),
                configurations,
            }
        );

        expect(row?.attributes).toEqual([{ code: 'material', values: ['cotton'] }]);
        expect(row?.configurations).toBe(configurations);
    });

    it("replaces its attributes entirely when a variant's are given", () => {
        const attributes = [{ code: 'color', values: ['Red'], variantReferenceId: 'P-color-red' }];
        const row = productRow(
            catalogProduct('A', {}, { color: '51', material: 'cotton' }),
            'default',
            SLUGS,
            { attributes }
        );

        expect(row?.attributes).toBe(attributes);
    });
});
