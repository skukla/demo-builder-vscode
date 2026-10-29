/**
 * Capture ("Save store changes to this pack", step 05): read back what the install record lists,
 * plus what those things need to install on an empty store (the categories, set, attributes and
 * quantities a captured product names), SKUs kept exactly and the root category named.
 *
 * The product is the Bodea sandbox's captured `GET products` item (products-page.json, 2026-09-27)
 * and its quantities the captured `GET inventory/source-items` shape (source-items-accessmesh.json).
 * Categories, the set's attribute list and the attribute have no captured answer in the repo; they
 * are typed to the interfaces the engine reads (`StoreCategory`, `CommerceSetAttribute`,
 * `StoreAttribute`).
 */

import * as fs from 'fs';
import * as path from 'path';
import { capturePack } from '@/features/data-installer/services/demoBuilderEngine/capture';
import type { CreatedObject } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { StoreAttribute, StoreCategory } from '@/features/data-installer/services/demoBuilderEngine/productLookups';
import type { CommerceProduct, CommerceSetAttribute } from '@/types/commerceWire';
import { fakeContext, page } from './demoBuilderEngine.testUtils';

const CAPTURED = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../../../fixtures/commerce-rest/products-page.json'), 'utf8'),
) as { body: { items: CommerceProduct[] } };
const WATCH = CAPTURED.body.items[1];

const skuIn = (base: string, skus: string) =>
    page(base, `&searchCriteria[filterGroups][0][filters][0][field]=sku&searchCriteria[filterGroups][0][filters][0][value]=${encodeURIComponent(skus)}&searchCriteria[filterGroups][0][filters][0][conditionType]=in`);

const category = (id: number, name: string, ids: string): StoreCategory => ({
    id,
    name,
    path: ids,
    is_active: true,
    include_in_menu: true,
    custom_attributes: [{ attribute_code: 'url_key', value: name.toLowerCase().replace(/ /gu, '-') }],
});

const BAND_TYPE: StoreAttribute = { attribute_id: 180, attribute_code: 'band_type', frontend_input: 'select', is_user_defined: true, options: [{ label: 'Sport', value: '14' }] };
const SET_ATTRIBUTES: CommerceSetAttribute[] = [{ attribute_code: 'band_type' }, { attribute_code: 'name' }];
const INVENTORY = {
    'inventory/sources?searchCriteria[pageSize]=200': { items: [{ source_code: 'default', name: 'Default Source', enabled: true }] },
    'inventory/stocks?searchCriteria[pageSize]=200': { items: [] },
    'inventory/stock-source-links?searchCriteria[pageSize]=200': { items: [] },
};

/** A store holding the captured watch, in categories 3 and 9 under the store's root, 2. */
const STORE: Record<string, unknown> = {
    ...INVENTORY,
    [skuIn('products', 'DigiWristQuantum')]: { items: [WATCH], total_count: 1 },
    [skuIn('inventory/source-items', 'DigiWristQuantum')]: { items: [{ sku: 'DigiWristQuantum', source_code: 'default', quantity: 12, status: 1 }], total_count: 1 },
    [page('products/attribute-sets/sets/list')]: { items: [{ attribute_set_id: 16, attribute_set_name: 'Wearables' }, { attribute_set_id: 4, attribute_set_name: 'Default' }], total_count: 2 },
    'products/attribute-sets/16/attributes': SET_ATTRIBUTES,
    'products/attributes/band_type': BAND_TYPE,
    'categories/2': category(2, 'Default Category', '1/2'),
    'categories/3': category(3, 'Wearables', '1/2/3'),
    'categories/9': category(9, 'Smart Watches', '1/2/3/9'),
    'categories/50': category(50, 'Bodea', '1/50'),
    'categories/51': category(51, 'Racks', '1/50/51'),
};

const RECORD: CreatedObject[] = [{ kind: 'products', id: 'DigiWristQuantum', key: 'DigiWristQuantum' }];

async function capture(record: CreatedObject[] = RECORD, installed: Record<string, unknown> = {}) {
    const ctx = await fakeContext(STORE);
    ctx.session.rootCategory = { id: 2, name: '' };
    return { result: await capturePack(ctx, record, installed), ctx };
}

describe('capturePack', () => {
    it('writes nothing to the store', async () => {
        const { ctx } = await capture();

        expect(ctx.sent).toStrictEqual([]);
    });

    it('keeps each SKU exactly as the store holds it', async () => {
        const { result } = await capture();

        expect((result.items.products as Array<{ product: CommerceProduct }>).map((r) => r.product.sku)).toEqual(['DigiWristQuantum']);
    });

    it('brings in the categories a captured product sits in, and their parents, under the store\'s root', async () => {
        const { result } = await capture();

        expect(result.items.categories).toEqual({
            categories: [
                { category: expect.objectContaining({ name: 'Wearables', path: 'Default Category' }) },
                { category: expect.objectContaining({ name: 'Smart Watches', path: 'Default Category/Wearables' }) },
            ],
        });
    });

    it('brings in the set, the user-defined attributes and their place in the set that a product names', async () => {
        const { result } = await capture();

        expect(result.items.attribute_sets).toEqual([{ attributeSet: { attribute_set_name: 'Wearables', entity_type_id: 4, sort_order: 0 }, skeletonId: 4 }]);
        expect(result.items.product_attributes).toEqual([
            { attribute: expect.objectContaining({ attribute_code: 'band_type', options: [{ label: 'Sport', value: 'Sport' }] }) },
        ]);
        expect(result.items.attribute_assign_to_set).toEqual([{ attributeSetId: 'Wearables', attributeCode: 'band_type' }]);
    });

    it('brings in a captured product\'s quantities, but not the store\'s default source', async () => {
        const { result } = await capture();

        expect(result.items.source_items).toEqual({ sourceItems: [{ sku: 'DigiWristQuantum', source_code: 'default', quantity: 12, status: 1 }] });
        expect(result.items).not.toHaveProperty('sources');
    });

    it('names a root category of the pack\'s own, read from the store, never guessed from a name', async () => {
        const { result } = await capture([{ kind: 'categories', id: '51', key: 'Racks' }]);

        expect(result.items.categories).toEqual({
            root_category: expect.objectContaining({ name: 'Bodea' }),
            categories: [{ category: expect.objectContaining({ name: 'Racks', path: 'Bodea' }) }],
        });
        expect(result.items.categories).not.toHaveProperty('root_category.path');
    });

    it('takes in a product the installed version holds that the store already had, so the record never listed it', async () => {
        const { result } = await capture([], { products: [{ product: { sku: 'DigiWristQuantum', name: 'as the pack had it' } }] });

        const products = result.items.products as Array<{ product: CommerceProduct }>;
        expect(products.map((r) => [r.product.sku, r.product.name])).toEqual([['DigiWristQuantum', 'DigiWrist Quantum']]);
    });

    it('counts what it captured, by kind', async () => {
        const { result } = await capture();

        expect(result.counts).toMatchObject({ products: 1, categories: 2, attribute_sets: 1, product_attributes: 1, source_items: 1 });
    });
});
