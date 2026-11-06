/**
 * Does the store hold what the pack says (owner, 2026-11-06)? Both defects this check exists for shipped
 * through installs that reported success: Luma sizes written as option id 32 where the pack meant the
 * option labelled "Size 32", and configurables made with their children but no options.
 *
 * The store's answers follow the routes the engine reads (`storeCopies.readBySku`, `productLookups`),
 * as `storeCopies.test.ts` writes them. A configurable's options come with the listed product, so
 * no route of their own is answered here.
 */

import type { InstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { verifyInstall } from '@/features/data-installer/services/demoBuilderEngine/verifyInstall';
import type { CommerceProduct } from '@/types/commerceWire';
import { by, fakeContext, page } from './demoBuilderEngine.testUtils';

const skuIn = (skus: string) =>
    page(
        'products',
        `&searchCriteria[filterGroups][0][filters][0][field]=sku&searchCriteria[filterGroups][0][filters][0][value]=${encodeURIComponent(skus)}&searchCriteria[filterGroups][0][filters][0][conditionType]=in`
    );

/** The store's size attribute: option 32 is "Size 34", option 33 is "Size 32". */
const SIZE = {
    attribute_id: 93,
    attribute_code: 'size',
    frontend_input: 'select',
    is_user_defined: true,
    options: [
        { value: '32', label: 'Size 34' },
        { value: '33', label: 'Size 32' },
    ],
};

/** A pack's simple product with a size, as product records hold it (each row is `{ product }`). */
const packSimple = (sku: string, size: string, price = 10) => ({
    product: {
    sku,
    name: sku,
    type_id: 'simple',
    attribute_set_id: 'Default',
    price,
    custom_attributes: [{ attribute_code: 'size', value: size }],
    },
});

const PARENT = {
    product: {
    sku: 'MH01',
    name: 'Hoodie',
    type_id: 'configurable',
    attribute_set_id: 'Default',
    extension_attributes: {
        configurable_product_options: [{ attribute_id: 'size', label: 'Size' }],
        configurable_product_links: ['MH01-32'],
    },
    },
};

const stored = (id: number, sku: string, extra: Partial<CommerceProduct> = {}): CommerceProduct =>
    ({ id, sku, type_id: 'simple', price: 10, custom_attributes: [], ...extra }) as CommerceProduct;

/** The size option, as the store lists it on a configurable (captured shape, 2026-11-06: `attribute_id` a string). */
const SIZE_OPTION = { id: 1, attribute_id: '93', label: 'Size', position: 0, values: [{ value_index: 33 }] };

const STORE_PARENT = stored(10, 'MH01', {
    type_id: 'configurable',
    extension_attributes: { configurable_product_options: [SIZE_OPTION], configurable_product_links: [11] },
});

/** Made with its children but no options: 80 of Luma's 147 came out so on 2026-11-06. */
const BARE_PARENT = stored(10, 'MH01', {
    type_id: 'configurable',
    extension_attributes: { configurable_product_options: [], configurable_product_links: [11] },
});

const COMMON = {
    'products/attributes/size': SIZE,
    [page('products/attributes', `&${by('attribute_id', '93').slice(1)}`)]: {
        items: [SIZE],
        total_count: 1,
    },
};

describe('verifyInstall', () => {
    it('matches when every product is there with the options, values and prices the pack names', async () => {
        const ctx = await fakeContext({
            ...COMMON,
            [skuIn('MH01-32,MH01')]: {
                items: [
                    stored(11, 'MH01-32', {
                        custom_attributes: [{ attribute_code: 'size', value: '33' }],
                    }),
                    STORE_PARENT,
                ],
                total_count: 2,
            },
        });

        const check = await verifyInstall(
            ctx,
            { products: [packSimple('MH01-32', 'Size 32'), PARENT] },
            undefined
        );

        expect(check.verdict).toBe('matches');
        expect(check.checked).toBe(2);
        // The size of the simple product, its price, and the configurable: a match that compared them.
        expect(check.compared).toEqual({ values: 1, prices: 1, configurables: 1 });
    });

    it('names a product the store lacks, a configurable with no options, a wrong option and a wrong price', async () => {
        const ctx = await fakeContext({
            ...COMMON,
            [skuIn('MH01-32,MH01,GONE')]: {
                // Written as option 32 ("Size 34"): the "32" in "Size 32" taken as an id.
                items: [
                    stored(11, 'MH01-32', {
                        price: 12,
                        custom_attributes: [{ attribute_code: 'size', value: '32' }],
                    }),
                    BARE_PARENT,
                ],
                total_count: 2,
            },
        });

        const check = await verifyInstall(
            ctx,
            { products: [packSimple('MH01-32', 'Size 32'), PARENT, packSimple('GONE', 'Size 32')] },
            undefined
        );

        expect(check.verdict).toBe('differs');
        expect(check.missing).toEqual({ count: 1, examples: ['GONE'] });
        expect(check.configurablesWithoutOptions).toEqual({ count: 1, examples: ['MH01'] });
        expect(check.valuesDiffer.examples).toEqual([
            { sku: 'MH01-32', attribute: 'size', pack: 'Size 32', store: 'Size 34' },
        ]);
        expect(check.pricesDiffer.examples).toEqual([{ sku: 'MH01-32', pack: 10, store: 12 }]);
    });

    it('names a configurable whose children are not all linked', async () => {
        const ctx = await fakeContext({
            ...COMMON,
            [skuIn('MH01')]: {
                items: [
                    stored(10, 'MH01', {
                        type_id: 'configurable',
                        extension_attributes: { configurable_product_options: [SIZE_OPTION], configurable_product_links: [] },
                    }),
                ],
                total_count: 1,
            },
        });

        const check = await verifyInstall(ctx, { products: [PARENT] }, undefined);

        expect(check.configurablesDiffer.examples).toEqual([
            { sku: 'MH01', differs: '1 children not linked' },
        ]);
    });

    it('checks only the products the install record says the pack made', async () => {
        const ctx = await fakeContext({
            ...COMMON,
            [skuIn('MINE')]: {
                items: [
                    stored(20, 'MINE', {
                        custom_attributes: [{ attribute_code: 'size', value: '33' }],
                    }),
                ],
                total_count: 1,
            },
        });
        const record = { created: [{ kind: 'products', id: 'mine' }] } as unknown as InstallRecord;

        const check = await verifyInstall(
            ctx,
            { products: [packSimple('MINE', 'Size 32'), packSimple('ALREADY-THERE', 'Size 32')] },
            record
        );

        expect(check.checked).toBe(1);
        expect(check.verdict).toBe('matches');
    });

    it("reads a pack in Commerce's import form, store-wide rows only", async () => {
        const ctx = await fakeContext({
            ...COMMON,
            [skuIn('MH01-32')]: {
                items: [
                    stored(11, 'MH01-32', {
                        custom_attributes: [{ attribute_code: 'size', value: '32' }],
                    }),
                ],
                total_count: 1,
            },
        });
        const rows = [
            {
                sku: 'MH01-32',
                product_type: 'simple',
                price: '10',
                additional_attributes: 'size=Size 32',
            },
            {
                sku: 'MH01-32',
                store_view_code: 'default',
                product_type: 'simple',
                additional_attributes: 'size=Size 34',
            },
        ];

        const check = await verifyInstall(
            ctx,
            { product_export: { source: { items: rows } } },
            undefined
        );

        expect(check.checked).toBe(1);
        expect(check.valuesDiffer.examples).toEqual([
            { sku: 'MH01-32', attribute: 'size', pack: 'Size 32', store: 'Size 34' },
        ]);
    });
});
