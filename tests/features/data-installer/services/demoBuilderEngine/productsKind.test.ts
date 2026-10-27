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
import { type SentCall, fakeContext } from './demoBuilderEngine.testUtils';

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

const page = (path: string, criteria = '') =>
    `${path}?searchCriteria[currentPage]=1&searchCriteria[pageSize]=100${criteria}`;
const by = (field: string, value: string) =>
    `&searchCriteria[filterGroups][0][filters][0][field]=${field}&searchCriteria[filterGroups][0][filters][0][value]=${encodeURIComponent(value)}`;

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
