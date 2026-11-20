/**
 * A store view's products as `aco_products` rows: configurables with their variants, bundles
 * with their selections, then everything else, the service's assembly
 * (`acoConfigurableProductsExport.js` L234-342, `acoBundleProductsExport.js` L168-226;
 * aco-export-spec.md §3).
 */

import {
    attributeCatalog,
    withOptions,
} from '@/features/data-installer/services/acoExport/acoAttributeCatalog';
import {
    productGraph,
    superAttributeCodes,
} from '@/features/data-installer/services/acoExport/acoProductGraph';
import type { AcoProductRow } from '@/types/acoPack';
import {
    SUPER_ATTRIBUTES,
    SUPER_ATTRIBUTE_OPTIONS,
    catalogProduct,
    configurableTee,
    giftBundle,
} from '../../../../helpers/acoFixtures';

const SLUGS = new Map<string, string>();

/** The catalog after the options read, as the export builds it. */
function readyCatalog() {
    const catalog = attributeCatalog(SUPER_ATTRIBUTES);
    for (const code of ['color', 'size']) withOptions(catalog, code, SUPER_ATTRIBUTE_OPTIONS[code]);
    return catalog;
}

const bySku = (rows: AcoProductRow[], sku: string) => rows.find((row) => row.sku === sku);

describe('superAttributeCodes', () => {
    it("names every configurable's super attributes by code, from their ids", () => {
        expect(
            superAttributeCodes(configurableTee(), attributeCatalog(SUPER_ATTRIBUTES)).sort()
        ).toEqual(['color', 'size']);
    });

    it('falls back to the option label, snake-cased, for an id the store did not list', () => {
        const [tee] = configurableTee();
        tee.extension_attributes = {
            configurable_product_options: [{ attribute_id: 999, label: 'Band Width' }],
        };

        expect(superAttributeCodes([tee], attributeCatalog([]))).toEqual(['band_width']);
    });
});

describe('productGraph: configurables', () => {
    it('gives the parent one configuration per super attribute, in position order, labelled from the options', () => {
        const parent = bySku(
            productGraph(configurableTee(), 'default', SLUGS, readyCatalog()),
            'TEE'
        );

        expect(parent?.configurations).toEqual([
            {
                attributeCode: 'color',
                label: 'Color',
                defaultVariantReferenceId: 'TEE-color-navy-blue',
                type: 'CONFIGURABLE',
                values: [{ variantReferenceId: 'TEE-color-navy-blue', label: 'Navy Blue' }],
            },
            {
                attributeCode: 'size',
                label: 'Size',
                defaultVariantReferenceId: 'TEE-size-m',
                type: 'CONFIGURABLE',
                values: [
                    { variantReferenceId: 'TEE-size-m', label: 'M' },
                    { variantReferenceId: 'TEE-size-l', label: 'L' },
                ],
            },
        ]);
    });

    it("keeps the parent's other attributes and leaves its super attributes out of them", () => {
        const parent = bySku(
            productGraph(configurableTee(), 'default', SLUGS, readyCatalog()),
            'TEE'
        );
        expect(parent?.attributes).toEqual([{ code: 'material', values: ['cotton'] }]);
    });

    it('makes each variant a row linked to its parent, its attributes only its super attributes, by label', () => {
        const rows = productGraph(configurableTee(), 'default', SLUGS, readyCatalog());

        expect(bySku(rows, 'TEE-M')).toMatchObject({
            links: [{ type: 'VARIANT_OF', sku: 'TEE' }],
            attributes: [
                { code: 'color', values: ['Navy Blue'], variantReferenceId: 'TEE-color-navy-blue' },
                { code: 'size', values: ['M'], variantReferenceId: 'TEE-size-m' },
            ],
        });
        expect(rows.map((r) => r.sku)).toEqual(['TEE', 'TEE-M', 'TEE-L']);
    });

    it('keeps an option id as its label when the store listed no options for it, as the service does', () => {
        const parent = bySku(
            productGraph(configurableTee(), 'default', SLUGS, attributeCatalog(SUPER_ATTRIBUTES)),
            'TEE'
        );
        expect(parent?.configurations?.[1].values.map((v) => v.label)).toEqual(['167', '168']);
    });
});

describe('productGraph: bundles', () => {
    const products = () => [...configurableTee(), giftBundle(), catalogProduct('MUG', { id: 40 })];

    it('gives the bundle one group per option, in position order, with its items and defaults', () => {
        const bundle = bySku(productGraph(products(), 'default', SLUGS, readyCatalog()), 'GIFT');

        expect(bundle?.bundles).toEqual([
            {
                group: 'shirt',
                required: true,
                multiSelect: false,
                items: [{ sku: 'TEE-M', qty: 1, userDefinedQty: false }],
                defaultItemSkus: ['TEE-M'],
            },
            {
                group: 'extras-add-ons',
                required: false,
                multiSelect: true,
                items: [{ sku: 'MUG', qty: 2, userDefinedQty: true }],
            },
        ]);
    });

    it("links each selection to the bundle, adding to a variant's link rather than replacing it", () => {
        const rows = productGraph(products(), 'default', SLUGS, readyCatalog());

        expect(bySku(rows, 'TEE-M')?.links).toEqual([
            { type: 'VARIANT_OF', sku: 'TEE' },
            { type: 'in_bundle', sku: 'GIFT' },
        ]);
        expect(bySku(rows, 'MUG')?.links).toEqual([{ type: 'in_bundle', sku: 'GIFT' }]);
        expect(rows.filter((r) => r.sku === 'MUG')).toHaveLength(1);
    });

    it('makes a bundle with no selections a plain row, with no bundle groups, as the service does', () => {
        const empty = catalogProduct('EMPTY', {
            type_id: 'bundle',
            extension_attributes: {
                bundle_product_options: [{ title: 'None', product_links: [] }],
            },
        });
        const row = bySku(productGraph([empty], 'default', SLUGS, readyCatalog()), 'EMPTY');

        expect(row?.sku).toBe('EMPTY');
        expect(row).not.toHaveProperty('bundles');
    });

    it('names a selection given only by product id, and reads a missing or bad quantity as 1', () => {
        const bundle = catalogProduct('B', {
            type_id: 'bundle',
            extension_attributes: {
                bundle_product_options: [{ title: 'Pick', product_links: [{ id: 40, qty: 'x' }] }],
            },
        });
        const rows = productGraph(
            [bundle, catalogProduct('MUG', { id: 40 })],
            'default',
            SLUGS,
            readyCatalog()
        );

        expect(bySku(rows, 'B')?.bundles?.[0].items).toEqual([
            { sku: 'MUG', qty: 1, userDefinedQty: false },
        ]);
    });
});

describe('productGraph: the rest', () => {
    it('makes every other product a row of its own, and skips downloadables', () => {
        const rows = productGraph(
            [catalogProduct('A'), catalogProduct('D', { type_id: 'downloadable' })],
            'default',
            SLUGS,
            readyCatalog()
        );
        expect(rows.map((r) => r.sku)).toEqual(['A']);
    });
});
