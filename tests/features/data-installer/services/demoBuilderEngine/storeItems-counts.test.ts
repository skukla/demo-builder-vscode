/**
 * How many of each kind a store has, read without reading them (`countStoreItems`), and the rule
 * that makes that safe: a count of none means the list would offer none.
 *
 * The store here APPLIES the filters it is sent, as a real Commerce does (each filter below read
 * live on the shared sandbox, 2026-11-02), so a count and a list are compared over one set of rows
 * rather than each against its own expected number. The filters are also pinned as sent, since a
 * filter the fake accepted and Commerce refuses would pass the comparison.
 */

import { PICKABLE_KINDS, type PickableKind } from '@/features/data-installer/pickableKinds';
import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import { countStoreItems, listStoreItems } from '@/features/data-installer/services/demoBuilderEngine/storeItems';
import type { CommerceSalesRule } from '@/types/commerceSalesRule';
import type { CommerceCompanyRow, CommerceCustomerGroup, CommerceProduct, CommerceProductAttribute, CommerceSharedCatalog } from '@/types/commerceWire';
import { SANDBOX_CATEGORIES, TEST_SITE_CUSTOMERS, TEST_SITE_ID, TEST_SITE_PRODUCTS } from '../../../../helpers/commerceWipeFixtures';
import { fakeContext } from './demoBuilderEngine.testUtils';

const ROOT = 150;
const GIFT_CARD: CommerceProduct = { id: 910, sku: 'ZZ-GIFT', name: 'Gift card', type_id: 'giftcard', extension_attributes: { website_ids: [TEST_SITE_ID] } };
const OTHER_SITE_PRODUCT: CommerceProduct = { id: 911, sku: 'ZZ-ELSEWHERE', name: 'Elsewhere', type_id: 'simple', extension_attributes: { website_ids: [2] } };
const OTHER_SITE_GIFT_CARD: CommerceProduct = { id: 912, sku: 'ZZ-GIFT-2', name: 'Other gift card', type_id: 'giftcard', extension_attributes: { website_ids: [2] } };
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
    { id: 1, code: 'Default (General)' },
    { id: 2, code: 'Wholesale' },
    { id: 3, code: 'Retailer' },
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

type Row = Record<string, unknown>;

const FULL_STORE: Record<string, readonly unknown[]> = {
    products: [...TEST_SITE_PRODUCTS, GIFT_CARD, OTHER_SITE_PRODUCT, OTHER_SITE_GIFT_CARD],
    'categories/list': SANDBOX_CATEGORIES,
    'customers/search': TEST_SITE_CUSTOMERS,
    company: COMPANIES,
    'salesRules/search': RULES,
    'customerGroups/search': GROUPS,
    sharedCatalog: CATALOGS,
    'products/attributes': ATTRIBUTES,
    'products/attribute-sets/sets/list': SETS,
};

/** A field as Commerce filters on it, which is not always how it answers it. */
function valuesOf(row: Row, field: string): string[] {
    // A product answers its websites in a list; a customer has the one.
    if (field === 'website_id' && !('website_id' in row)) {
        return ((row.extension_attributes as { website_ids?: number[] }).website_ids ?? []).map(String);
    }
    if (field === 'customer_group_code') return [String(row.code)];
    if (field === 'is_user_defined') return [row.is_user_defined ? '1' : '0'];
    return [String(row[field])];
}

const CONDITIONS: Record<string, (values: string[], wanted: string) => boolean> = {
    eq: (values, wanted) => values.includes(wanted),
    neq: (values, wanted) => !values.includes(wanted),
    like: (values, wanted) => values.some((value) => value.startsWith(wanted.replace(/%$/u, ''))),
    nin: (values, wanted) => !values.some((value) => wanted.split(',').includes(value)),
};

/** The rows a search keeps: every filter group must pass, as Commerce ANDs its groups. */
function search(rows: readonly unknown[], query: string): Row[] {
    const params = new URLSearchParams(query);
    const groups = [0, 1, 2].filter((g) => params.has(`searchCriteria[filterGroups][${g}][filters][0][field]`));
    return (rows as Row[]).filter((row) =>
        groups.every((g) => {
            const at = (name: string) => params.get(`searchCriteria[filterGroups][${g}][filters][0][${name}]`) ?? '';
            return CONDITIONS[at('conditionType')](valuesOf(row, at('field')), at('value'));
        }),
    );
}

async function storeOf(rows: Record<string, readonly unknown[]> = FULL_STORE) {
    const ctx = await fakeContext();
    const paths: string[] = [];
    ctx.get = async (path) => {
        paths.push(path);
        const [route, query] = path.split('?');
        const table = rows[route];
        if (!table) throw new CommerceReadError(`Commerce answered 404 for ${path}`, 404);
        const kept = search(table, query);
        const size = Number(new URLSearchParams(query).get('searchCriteria[pageSize]'));
        return { items: kept.slice(0, size), total_count: kept.length };
    };
    ctx.session.websiteId = TEST_SITE_ID;
    ctx.session.rootCategory = { id: ROOT, name: '' };
    return Object.assign(ctx, { paths });
}

const EMPTY_STORE = Object.fromEntries(Object.keys(FULL_STORE).map((route) => [route, []]));

describe('a count against its list', () => {
    const EXACT: PickableKind[] = ['products', 'giftcards', 'categories', 'customers', 'customer_groups', 'b2b_shared_catalogs', 'product_attributes', 'attribute_sets'];

    it.each(EXACT)('%s: the count is what the list holds', async (kind) => {
        const ctx = await storeOf();

        const counts = await countStoreItems(ctx);
        const { items } = await listStoreItems(ctx, kind);

        expect(items.length).toBeGreaterThan(0);
        expect(counts[kind]).toBe(items.length);
    });

    /** Scoped in code after the read, so the count can only be a ceiling on the list. */
    it.each(['cart_rules', 'b2b_companies'] as const)('%s: the count is the whole store, more than the list holds', async (kind) => {
        const ctx = await storeOf();

        const counts = await countStoreItems(ctx);
        const { items } = await listStoreItems(ctx, kind);

        expect(counts[kind]).toBe(2);
        expect(items).toHaveLength(1);
    });

    it.each(PICKABLE_KINDS)('%s: a store with none counts none, and lists none', async (kind) => {
        const ctx = await storeOf(EMPTY_STORE);

        const counts = await countStoreItems(ctx);
        const { items } = await listStoreItems(ctx, kind);

        expect(counts[kind]).toBe(0);
        expect(items).toHaveLength(0);
    });

    it("counts none of a kind another website has, as that website's own list would hold", async () => {
        const ctx = await storeOf({ ...FULL_STORE, products: [OTHER_SITE_GIFT_CARD] });

        expect((await countStoreItems(ctx)).giftcards).toBe(0);
    });
});

describe('what is asked of Commerce', () => {
    const filter = (group: number, field: string, value: string, condition: string) => {
        const at = `&searchCriteria[filterGroups][${group}][filters][0]`;
        return `${at}[field]=${field}${at}[value]=${value}${at}[conditionType]=${condition}`;
    };

    it.each<[PickableKind, string, string]>([
        ['products', 'products', filter(0, 'website_id', String(TEST_SITE_ID), 'eq') + filter(1, 'type_id', 'giftcard', 'neq')],
        ['giftcards', 'products', filter(0, 'website_id', String(TEST_SITE_ID), 'eq') + filter(1, 'type_id', 'giftcard', 'eq')],
        ['categories', 'categories/list', filter(0, 'path', `1%2F${ROOT}%2F%25`, 'like')],
        ['cart_rules', 'salesRules/search', ''],
        ['customers', 'customers/search', filter(0, 'website_id', String(TEST_SITE_ID), 'eq')],
        ['b2b_companies', 'company', ''],
        // `customer_group_code`, not `code`, which Commerce answers 400 in a filter.
        ['customer_groups', 'customerGroups/search', filter(0, 'customer_group_code', 'NOT%20LOGGED%20IN%2CGeneral%2CDefault%20(General)%2CWholesale%2CRetailer', 'nin')],
        ['b2b_shared_catalogs', 'sharedCatalog', filter(0, 'type', '1', 'neq')],
        ['product_attributes', 'products/attributes', filter(0, 'is_user_defined', '1', 'eq')],
        ['attribute_sets', 'products/attribute-sets/sets/list', filter(0, 'entity_type_id', '4', 'eq') + filter(1, 'attribute_set_name', 'Default', 'neq')],
    ])('%s: one row at most, by the filters that were read live', async (_kind, route, filters) => {
        const ctx = await storeOf();

        await countStoreItems(ctx);

        expect(ctx.paths).toContain(`${route}?searchCriteria[currentPage]=1&searchCriteria[pageSize]=1&fields=total_count${filters}`);
    });

    it('reads every kind at once, once each, and writes nothing', async () => {
        const ctx = await storeOf();
        const started: string[] = [];
        let release: () => void = () => undefined;
        const held = new Promise<void>((resolve) => {
            release = resolve;
        });
        const inner = ctx.get;
        ctx.get = async (path) => {
            started.push(path);
            await held;
            return inner(path);
        };

        const counting = countStoreItems(ctx);
        await Promise.resolve();

        // Every read has started while none has answered.
        expect(started).toHaveLength(PICKABLE_KINDS.length);
        release();
        await counting;
        expect(ctx.sent).toHaveLength(0);
    });
});

describe('a count that fails', () => {
    it.each(['company', 'sharedCatalog'])('%s: a store without B2B answers 404, and has none', async (route) => {
        const ctx = await storeOf(Object.fromEntries(Object.entries(FULL_STORE).filter(([r]) => r !== route)));

        const counts = await countStoreItems(ctx);

        expect(counts[route === 'company' ? 'b2b_companies' : 'b2b_shared_catalogs']).toBe(0);
    });

    it('leaves out a kind whose route answers 404 when its list would fail too, and logs it', async () => {
        const ctx = await storeOf(Object.fromEntries(Object.entries(FULL_STORE).filter(([r]) => r !== 'salesRules/search')));

        const counts = await countStoreItems(ctx);

        expect(counts).not.toHaveProperty('cart_rules');
        expect(counts.products).toBeGreaterThan(0);
        expect(ctx.logged.join('\n')).toContain("could not count the store's cart_rules");
    });

    it('leaves out a B2B kind Commerce refuses, rather than calling it none', async () => {
        const ctx = await storeOf();
        const inner = ctx.get;
        ctx.get = async (path) => {
            if (path.startsWith('company?')) throw new CommerceReadError('Commerce answered 403', 403);
            return inner(path);
        };

        expect(await countStoreItems(ctx)).not.toHaveProperty('b2b_companies');
    });

    it.each([[{}], [{ total_count: '3' }], [{ items: [] }]])('leaves out an answer with no numeric total_count: %j', async (body) => {
        const ctx = await storeOf();
        const inner = ctx.get;
        ctx.get = async (path) => (path.startsWith('customers/search?') ? body : inner(path));

        expect(await countStoreItems(ctx)).not.toHaveProperty('customers');
    });

    it('answers nothing for the website kinds when the target names no website', async () => {
        const ctx = await storeOf();
        ctx.session.websiteId = undefined;

        const counts = await countStoreItems(ctx);

        expect(Object.keys(counts).sort()).toEqual(['attribute_sets', 'b2b_companies', 'b2b_shared_catalogs', 'cart_rules', 'categories', 'customer_groups', 'product_attributes'].sort());
    });
});
