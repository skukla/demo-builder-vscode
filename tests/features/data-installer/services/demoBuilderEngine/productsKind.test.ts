/**
 * The products kind: each product the store lacks is made with this store's ids, one the store
 * has is left alone, and removal deletes only what was made (DI-5).
 *
 * The rows are Bodea `main`'s own, trimmed, as the Data Installer service answered them on
 * 2026-10-27 (`batch-get-data-items`, read-only): a simple product with a tier price for a
 * named customer group, and a configurable product naming its option by label and its children
 * by SKU. Bodea's rows sell on website 3 of the store they came from.
 */

import {
    PRODUCT_KIND,
    installProducts,
    parseProductRows,
    removeProduct,
} from '@/features/data-installer/services/demoBuilderEngine/productsKind';
import { type SentCall, by, fakeContext, page } from './demoBuilderEngine.testUtils';

const VR_RACK = {
    product: {
        attribute_set_id: 'Default',
        extension_attributes: {
            category_links: [{ category_id: 'racks', position: -1 }],
            stock_item: { is_in_stock: true },
            website_ids: [3],
        },
        custom_attributes: [
            { attribute_code: 'url_key', value: 'vrrack' },
            { attribute_code: 'tax_class_id', value: '2' },
            { attribute_code: 'category_ids', value: ['racks'] },
        ],
        name: 'VR Rack',
        price: 7500,
        sku: 'vrrack',
        status: 1,
        tier_prices: [{ customer_group_id: 'Platinum Buyer', extension_attributes: { percentage_value: 10, website_id: 3 }, qty: 1, value: 6750 }],
        type_id: 'simple',
        visibility: 4,
    },
};

const CABLE = {
    product: {
        attribute_set_id: 'Default',
        extension_attributes: {
            configurable_product_options: [{ attribute_id: 'cable_size', label: 'Size', position: 0, values: [{ value_index: '6 foot' }] }],
            configurable_product_links: ['outdoorpatchcable-6foot'],
            website_ids: [3],
        },
        custom_attributes: [{ attribute_code: 'cable_size', value: '6 foot' }],
        name: 'Outdoor Patch Cable',
        sku: 'outdoorpatchcable',
        type_id: 'configurable',
    },
};

/** A store with the Default set, the racks category under root 2, and the Platinum Buyer group. */
const STORE: Record<string, unknown> = {
    [page('products/attribute-sets/sets/list')]: { items: [{ attribute_set_id: 4, attribute_set_name: 'Default' }], total_count: 1 },
    [page('categories/list', by('url_key', 'racks'))]: {
        items: [
            { id: 90, path: '1/50/90' },
            { id: 41, path: '1/2/41' },
        ],
        total_count: 2,
    },
    [page('customerGroups/search', by('customer_group_code', 'Platinum Buyer'))]: { items: [{ id: 5, code: 'Platinum Buyer' }], total_count: 1 },
    'products/attributes/url_key': { attribute_id: 120, frontend_input: 'text' },
    'products/attributes/cable_size': {
        attribute_id: 210,
        frontend_input: 'select',
        options: [{ label: ' ', value: '' }, { label: '6 Foot', value: '301' }],
    },
};

async function storeContext(extra: Record<string, unknown> = {}) {
    const ctx = await fakeContext({ ...STORE, ...extra });
    ctx.session.websiteId = 1;
    return ctx;
}

const posted = (ctx: { sent: SentCall[] }) => ctx.sent.map((c) => (c.body as { product: Record<string, unknown> }).product);

describe('installProducts', () => {
    it('makes a product with this store\'s set, website, category and customer group ids, and records it', async () => {
        const ctx = await storeContext();

        await installProducts(ctx, parseProductRows([VR_RACK]));

        expect(ctx.sent).toEqual([
            {
                method: 'POST',
                path: 'products',
                body: {
                    product: {
                        ...VR_RACK.product,
                        attribute_set_id: 4,
                        extension_attributes: {
                            category_links: [{ category_id: '41', position: -1 }],
                            stock_item: { is_in_stock: true },
                            website_ids: [1],
                        },
                        custom_attributes: [
                            { attribute_code: 'url_key', value: 'vrrack' },
                            { attribute_code: 'tax_class_id', value: '2' },
                            { attribute_code: 'category_ids', value: ['41'] },
                        ],
                        tier_prices: [
                            { customer_group_id: 5, extension_attributes: { percentage_value: 10, website_id: 0 }, qty: 1, value: 6750 },
                        ],
                    },
                },
            },
        ]);
        expect(ctx.recorder.created).toEqual([{ kind: PRODUCT_KIND, id: 'vrrack' }]);
    });

    it('turns a configurable product\'s option labels and child SKUs into this store\'s ids', async () => {
        const ctx = await storeContext({ 'products/outdoorpatchcable-6foot': { id: 77, sku: 'outdoorpatchcable-6foot' } });

        await installProducts(ctx, parseProductRows([CABLE]));

        const [product] = posted(ctx);
        expect(product.extension_attributes).toEqual({
            configurable_product_options: [{ attribute_id: '210', label: 'Size', position: 0, values: [{ value_index: 301 }] }],
            configurable_product_links: [77],
            website_ids: [1],
        });
        expect(product.custom_attributes).toEqual([{ attribute_code: 'cable_size', value: '301' }]);
    });

    // Frescopa `main`'s own bundle, trimmed (read from the service on 2026-10-27): its options name
    // their parts by SKU, which Commerce takes as is, so only the website and categories change.
    it('sends a bundle\'s options as the pack has them, its parts named by SKU', async () => {
        const options = [
            {
                title: 'Machine',
                required: true,
                type: 'select',
                position: 0,
                sku: 'coffeeexperience',
                product_links: [{ sku: 'frescoexpresso', qty: 1, position: 0, is_default: false, price: 2499, price_type: null, can_change_quantity: 1 }],
            },
        ];
        const bundle = {
            product: {
                sku: 'coffeeexperience',
                name: 'Coffee Experience',
                type_id: 'bundle',
                attribute_set_id: 'Default',
                price: 0,
                tier_prices: [],
                custom_attributes: [
                    { attribute_code: 'price_type', value: '0' },
                    { attribute_code: 'category_ids', value: ['racks'] },
                ],
                extension_attributes: { website_ids: [2], category_links: [{ position: -1, category_id: 'racks' }], bundle_product_options: options },
            },
        };
        const ctx = await storeContext();

        await installProducts(ctx, parseProductRows([bundle]));

        expect(posted(ctx)[0]).toMatchObject({
            custom_attributes: [
                { attribute_code: 'price_type', value: '0' },
                { attribute_code: 'category_ids', value: ['41'] },
            ],
            extension_attributes: { website_ids: [1], category_links: [{ position: -1, category_id: '41' }], bundle_product_options: options },
        });
    });

    it('leaves a product the store already has alone, and records nothing for it', async () => {
        const ctx = await storeContext({ 'products/vrrack': { id: 12, sku: 'vrrack' } });

        await installProducts(ctx, parseProductRows([VR_RACK]));

        expect(ctx.sent).toStrictEqual([]);
        expect(ctx.recorder.created).toStrictEqual([]);
    });

    it('stops at an option label the store does not have, rather than sending it on', async () => {
        const ctx = await storeContext();
        const row = { product: { ...CABLE.product, extension_attributes: { website_ids: [3] }, custom_attributes: [{ attribute_code: 'cable_size', value: '9 foot' }] } };

        await expect(installProducts(ctx, parseProductRows([row]))).rejects.toThrow('The attribute cable_size has no option "9 foot".');
        expect(ctx.sent).toStrictEqual([]);
    });

    // Found on the first live install, 2026-10-29: every Frescopa product names Page Builder's
    // "product-full-width", which an ACCS store does not offer. A layout is read only by
    // Commerce's own storefront, never by an Edge Delivery or headless one, so the product
    // keeps the store's default and only the Debug Logs say so, once per value.
    describe('a layout field', () => {
        const LAYOUTS = {
            'products/attributes/page_layout': {
                attribute_id: 99,
                frontend_input: 'select',
                options: [
                    { label: 'No layout updates', value: '' },
                    { label: '1 column', value: '1column' },
                ],
            },
        };
        const withLayout = (sku: string, layout: string) => ({
            product: {
                ...VR_RACK.product,
                sku,
                tier_prices: [],
                custom_attributes: [
                    { attribute_code: 'url_key', value: sku },
                    { attribute_code: 'page_layout', value: layout },
                ],
            },
        });

        it('is left out when the store does not offer its value, and said once, in the log only', async () => {
            const ctx = await storeContext(LAYOUTS);

            await installProducts(
                ctx,
                parseProductRows([withLayout('mug', 'product-full-width'), withLayout('cup', 'product-full-width')]),
            );

            expect(posted(ctx).map((p) => p.custom_attributes)).toEqual([
                [{ attribute_code: 'url_key', value: 'mug' }],
                [{ attribute_code: 'url_key', value: 'cup' }],
            ]);
            expect(ctx.logged.filter((line) => line.includes('product-full-width'))).toEqual([
                'left page_layout "product-full-width" at the store\'s default: the store does not offer it',
            ]);
        });

        it('keeps a value the store offers, matched by its code', async () => {
            const ctx = await storeContext(LAYOUTS);

            await installProducts(ctx, parseProductRows([withLayout('mug', '1column')]));

            expect(posted(ctx)[0].custom_attributes).toContainEqual({ attribute_code: 'page_layout', value: '1column' });
        });
    });

    // The service turns an `additional_attributes` object into custom attributes, values as text
    // (ProductImportProcessor.js L97-114). No pack in the library audit or on this machine is
    // known to carry one; the rows here are Bodea's, with the object added.
    describe('additional_attributes', () => {
        it("become custom attributes, as text and in this store's ids, and are not sent as they are", async () => {
            const ctx = await storeContext({ 'products/outdoorpatchcable-6foot': { id: 77, sku: 'outdoorpatchcable-6foot' } });
            const { custom_attributes: _own, ...cable } = CABLE.product;

            await installProducts(ctx, parseProductRows([{ product: { ...cable, additional_attributes: { cable_size: '6 foot', warranty_years: 3 } } }]));

            const [product] = posted(ctx);
            expect(product.custom_attributes).toEqual([
                { attribute_code: 'cable_size', value: '301' },
                { attribute_code: 'warranty_years', value: '3' },
            ]);
            expect(product).not.toHaveProperty('additional_attributes');
        });

        it("never override the row's own custom attribute of the same code", async () => {
            const ctx = await storeContext();

            await installProducts(ctx, parseProductRows([{ product: { ...VR_RACK.product, additional_attributes: { url_key: 'another-key' } } }]));

            expect(posted(ctx)[0].custom_attributes).toContainEqual({ attribute_code: 'url_key', value: 'vrrack' });
            expect(posted(ctx)[0].custom_attributes).not.toContainEqual({ attribute_code: 'url_key', value: 'another-key' });
        });
    });

    it('stops at a customer group the store does not have', async () => {
        const ctx = await storeContext({ [page('customerGroups/search', by('customer_group_code', 'Platinum Buyer'))]: { items: [], total_count: 0 } });

        await expect(installProducts(ctx, parseProductRows([VR_RACK]))).rejects.toThrow('The store has no customer group Platinum Buyer.');
    });

    it('refuses when the install target names no website', async () => {
        const ctx = await fakeContext(STORE);

        await expect(installProducts(ctx, parseProductRows([VR_RACK]))).rejects.toThrow(/names no website/);
    });
});

describe('removeProduct', () => {
    it('deletes a product it made, by its SKU', async () => {
        const ctx = await fakeContext();

        await removeProduct(ctx.send, 'vr rack/1');

        expect(ctx.sent).toEqual([{ method: 'DELETE', path: 'products/vr%20rack%2F1', body: undefined }]);
    });
});
