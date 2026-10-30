/**
 * What a store holds that a save can pick (step 14, items 10 and 11): one kind's items, scoped to
 * the install target where Commerce scopes them, Commerce's own counted as excluded; the picks as
 * what capture starts from; what a pack holds already; and what a saved version left out.
 *
 * The store answers every list by its path's start, as the wipe suites' sandbox does: products by
 * the `website_id` filter, everything else whole, so the scoping done here is what is tested.
 * Products, customers and categories are the sandbox's (`commerceWipeFixtures.ts`); the rest are
 * typed to the interfaces the engine reads.
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import { holdsOf, leftOutOf, listStoreItems, seedsOf } from '@/features/data-installer/services/demoBuilderEngine/storeItems';
import type { CommerceSalesRule } from '@/types/commerceSalesRule';
import type { CommerceCompanyRow, CommerceCustomerGroup, CommerceProduct, CommerceProductAttribute, CommerceSharedCatalog } from '@/types/commerceWire';
import { SANDBOX_CATEGORIES, TEST_SITE_CUSTOMERS, TEST_SITE_ID, TEST_SITE_PRODUCTS } from '../../../../helpers/commerceWipeFixtures';
import { fakeContext } from './demoBuilderEngine.testUtils';

const GIFT_CARD: CommerceProduct = { id: 910, sku: 'ZZ-GIFT', name: 'Gift card', type_id: 'giftcard', extension_attributes: { website_ids: [TEST_SITE_ID] } };
const COMPANIES: CommerceCompanyRow[] = [
    { id: 28, company_name: 'Northgate', company_email: 'office@northgate.example.com' },
    { id: 29, company_name: 'Elsewhere Ltd', company_email: 'office@elsewhere.example.com' },
];
const RULES: CommerceSalesRule[] = [
    { rule_id: 7, name: 'Spring Sale', website_ids: [TEST_SITE_ID] },
    { rule_id: 8, name: 'JustRite only', website_ids: [2] },
];
const GROUPS: CommerceCustomerGroup[] = [
    { id: 0, code: 'NOT LOGGED IN' },
    { id: 1, code: 'General' },
    { id: 19, code: 'Platinum Buyer' },
];
const CATALOGS: CommerceSharedCatalog[] = [
    { id: 1, name: 'Default (General)', type: 1 },
    { id: 14, name: 'Platinum', type: 0 },
];
const ATTRIBUTES: CommerceProductAttribute[] = [
    { attribute_code: 'name', frontend_input: 'text', is_user_defined: false },
    { attribute_code: 'band_type', frontend_input: 'select', default_frontend_label: 'Band type', is_user_defined: true },
];
const SETS = [
    { attribute_set_id: 4, attribute_set_name: 'Default', entity_type_id: 4 },
    { attribute_set_id: 16, attribute_set_name: 'Wearables', entity_type_id: 4 },
];

const page = <T,>(items: T[]) => ({ items, total_count: items.length });

/** One equals filter's value, as `filterBy` writes it. */
const filterValue = (path: string): number => Number(/filters\]\[0\]\[value\]=([^&]*)/u.exec(path)?.[1]);

const LISTS: Array<[string, (path: string) => unknown]> = [
    ['products?', (path) => page([...TEST_SITE_PRODUCTS, GIFT_CARD].filter((p) => p.extension_attributes?.website_ids?.map(Number).includes(filterValue(path))))],
    ['categories/list?', () => page(SANDBOX_CATEGORIES)],
    // Answers every customer, as if the filter were ignored: the list must take only the website's.
    ['customers/search?', () => page(TEST_SITE_CUSTOMERS)],
    ['company?', () => page(COMPANIES)],
    ['salesRules/search?', () => page(RULES)],
    ['customerGroups/search?', () => page(GROUPS)],
    ['sharedCatalog?', () => page(CATALOGS)],
    ['products/attributes?', () => page(ATTRIBUTES)],
    ['products/attribute-sets/sets/list?', () => page(SETS)],
];

/** The test website's store: website 5, root category 150. */
async function store() {
    const ctx = await fakeContext();
    ctx.get = async (path) => {
        const list = LISTS.find(([start]) => path.startsWith(start));
        if (!list) throw new CommerceReadError(`Commerce answered 404 for ${path}`, 404);
        return list[1](path);
    };
    ctx.session.websiteId = TEST_SITE_ID;
    ctx.session.rootCategory = { id: 150, name: '' };
    return ctx;
}

describe('listStoreItems', () => {
    it("lists the website's products by SKU, its gift cards apart", async () => {
        const ctx = await store();

        const products = await listStoreItems(ctx, 'products');
        const giftCards = await listStoreItems(ctx, 'giftcards');

        expect(products.items.map((i) => i.id)).toEqual(TEST_SITE_PRODUCTS.map((p) => p.sku));
        expect(giftCards.items).toEqual([{ id: 'ZZ-GIFT', displayName: 'Gift card', detail: 'ZZ-GIFT', key: 'ZZ-GIFT' }]);
    });

    it("lists the categories under the target's root, each by its place under it, the root left out", async () => {
        const { items } = await listStoreItems(await store(), 'categories');

        expect(items).toEqual([
            { id: '151', displayName: 'Racks', key: 'Racks' },
            { id: '152', displayName: 'Racks / Server Racks', key: 'Racks/Server Racks' },
            { id: '154', displayName: 'Cables', key: 'Cables' },
            { id: '155', displayName: 'Cables / Pack Cables', key: 'Cables/Pack Cables' },
        ]);
    });

    it("lists the website's customers only, whatever the filter answered", async () => {
        const { items } = await listStoreItems(await store(), 'customers');

        expect(items.map((i) => i.key)).toEqual(['zz.shopper@example.com', 'zz.admin@example.com', 'zz.made@example.com']);
    });

    it("lists the companies whose people are the website's customers", async () => {
        const { items } = await listStoreItems(await store(), 'b2b_companies');

        expect(items).toEqual([{ id: '28', displayName: 'Northgate', detail: 'office@northgate.example.com', key: 'Northgate' }]);
    });

    it('lists the cart rules the website uses', async () => {
        const { items } = await listStoreItems(await store(), 'cart_rules');

        expect(items).toEqual([{ id: '7', displayName: 'Spring Sale', key: 'Spring Sale' }]);
    });

    it.each([
        ['customer_groups', ['Platinum Buyer'], 2],
        ['b2b_shared_catalogs', ['Platinum'], 1],
        ['product_attributes', ['band_type'], 1],
        ['attribute_sets', ['Wearables'], 1],
    ] as const)("lists the instance's own %s, Commerce's own counted as excluded", async (kind, keys, excluded) => {
        const listed = await listStoreItems(await store(), kind);

        expect(listed.items.map((i) => i.key)).toEqual(keys);
        expect(listed.excluded).toBe(excluded);
    });

    it('lists no companies on a store without B2B', async () => {
        const ctx = await store();
        const read = ctx.get;
        ctx.get = async (path) => {
            if (path.startsWith('company?')) throw new CommerceReadError('Commerce answered 404 for company', 404);
            return read(path);
        };

        expect((await listStoreItems(ctx, 'b2b_companies')).items).toStrictEqual([]);
    });
});

describe('seedsOf', () => {
    it('turns the picks into what capture starts from, by kind and id, in the screen order', () => {
        expect(seedsOf({ cart_rules: ['7'], products: ['ZZ-JACKET'], categories: ['151'] })).toEqual([
            { kind: 'products', id: 'ZZ-JACKET' },
            { kind: 'categories', id: '151' },
            { kind: 'cart_rules', id: '7' },
        ]);
    });
});

describe('holdsOf', () => {
    it('says the pack holds what its record lists, by id or key, and what its rows name', () => {
        const holds = holdsOf('products', [{ kind: 'products', id: 'ZZ-ONLY-HERE' }, { kind: 'categories', id: 'ZZ-JACKET' }], {
            products: [{ product: { sku: 'zz-jacket-red' } }],
        });

        const item = (sku: string) => ({ id: sku, displayName: sku, key: sku });
        expect([holds(item('ZZ-ONLY-HERE')), holds(item('ZZ-JACKET-RED')), holds(item('ZZ-JACKET'))]).toEqual([true, true, false]);
    });
});

describe('leftOutOf', () => {
    it('names what the store has, of the kinds an SC adds by hand, that the saved version does not hold', async () => {
        const saved = {
            products: TEST_SITE_PRODUCTS.filter((p) => p.sku !== 'ZZ-LONE-VARIANT').map((p) => ({ product: { sku: p.sku } })),
            categories: { categories: [{ category: { name: 'Racks', path: 'Bodea Root' } }, { category: { name: 'Server Racks', path: 'Bodea Root/Racks' } }] },
            cart_rules: [{ rule: { name: 'Spring Sale' } }],
        };

        const leftOut = await leftOutOf(await store(), saved);

        expect(leftOut).toEqual([
            { kind: 'products', count: 1, names: ['ZZ-LONE-VARIANT'] },
            { kind: 'giftcards', count: 1, names: ['Gift card'] },
            { kind: 'categories', count: 2, names: ['Cables', 'Cables / Pack Cables'] },
            { kind: 'customers', count: 3, names: ['zz.shopper@example.com', 'zz.admin@example.com', 'zz.made@example.com'] },
            { kind: 'b2b_companies', count: 1, names: ['Northgate'] },
        ]);
    });
});
