/**
 * What becomes of a create whose answer never came (step 14 item 1): found in the store, it is the
 * pack's and goes on the record; not found, it never landed and the entry goes. Then the same
 * through a whole install and a whole removal.
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import { filterBy, filterIn } from '@/features/data-installer/services/demoBuilderEngine/b2bReads';
import { type CreatedObject, installRecordPath, openInstallRecord, readInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { PendingObject } from '@/features/data-installer/services/demoBuilderEngine/pendingRecord';
import { SETTLED_KINDS, settlePending } from '@/features/data-installer/services/demoBuilderEngine/pendingFinders';
import { installPack, removePack } from '@/features/data-installer/services/demoBuilderEngine/runPack';
import { NOW, PACK, PROJECT, type SentCall, childSearch, fakeContext, memoryFiles, page } from './demoBuilderEngine.testUtils';
import { GRID, configStore, storeContext } from './storeConfig.testUtils';

const INVENTORY = (parts: { sources?: unknown[]; stocks?: unknown[]; links?: unknown[] }) => ({
    'inventory/sources?searchCriteria[pageSize]=200': { items: parts.sources ?? [] },
    'inventory/stocks?searchCriteria[pageSize]=200': { items: parts.stocks ?? [] },
    'inventory/stock-source-links?searchCriteria[pageSize]=200': { items: parts.links ?? [] },
});
const one = (item: unknown) => ({ items: [item], total_count: 1 });
const EMPTY = { items: [], total_count: 0 };
const held = (id: number, products: string[] = []) => ({ [`sharedCatalog/${id}/companies`]: '[]', [`sharedCatalog/${id}/categories`]: [], [`sharedCatalog/${id}/products`]: products.map((sku) => ({ sku })) });

interface Case {
    pending: PendingObject;
    /** The store once the create landed. */
    landed: Record<string, unknown>;
    /** The store when it never did. */
    never: Record<string, unknown>;
    recorded: CreatedObject;
}

const CASES: Record<string, Case> = {
    attribute_sets: {
        pending: { kind: 'attribute_sets', key: 'Coolers' },
        landed: { [page('products/attribute-sets/sets/list')]: one({ attribute_set_id: 12, attribute_set_name: 'Coolers' }) },
        never: { [page('products/attribute-sets/sets/list')]: EMPTY },
        recorded: { kind: 'attribute_sets', id: '12' },
    },
    product_attributes: {
        pending: { kind: 'product_attributes', key: 'fabric', id: 'fabric' },
        landed: { 'products/attributes/fabric': { attribute_code: 'fabric' } },
        never: {},
        recorded: { kind: 'product_attributes', id: 'fabric' },
    },
    attribute_options: {
        pending: { kind: 'attribute_options', key: 'fabric/Wool' },
        landed: { 'products/attributes/fabric/options': [{ label: 'Wool', value: '91' }] },
        never: { 'products/attributes/fabric/options': [] },
        recorded: { kind: 'attribute_options', id: 'fabric/91' },
    },
    attribute_assign_to_set: {
        pending: { kind: 'attribute_assign_to_set', key: '12/fabric', id: '12/fabric' },
        landed: { 'products/attribute-sets/12/attributes': [{ attribute_code: 'fabric' }] },
        never: { 'products/attribute-sets/12/attributes': [] },
        recorded: { kind: 'attribute_assign_to_set', id: '12/fabric' },
    },
    categories: {
        pending: { kind: 'categories', key: 'Default Category/Sale', find: { parentId: 2, name: 'Sale' } },
        landed: { [childSearch(2, 'Sale')]: { items: [{ id: 41, name: 'Sale', parent_id: 2 }] } },
        never: { [childSearch(2, 'Sale')]: { items: [] } },
        recorded: { kind: 'categories', id: '41' },
    },
    customer_groups: {
        pending: { kind: 'customer_groups', key: 'Platinum' },
        landed: { [page('customerGroups/search', filterBy('customer_group_code', 'Platinum'))]: one({ id: 31, code: 'Platinum' }) },
        never: { [page('customerGroups/search', filterBy('customer_group_code', 'Platinum'))]: EMPTY },
        recorded: { kind: 'customer_groups', id: '31', key: 'Platinum' },
    },
    customers: {
        pending: { kind: 'customers', key: 'ann@example.com', find: { websiteId: 1 } },
        // The same email on another website is someone else's account, not the one the create made.
        landed: { [page('customers/search', filterBy('email', 'ann@example.com'))]: { items: [{ id: 9, email: 'ann@example.com', website_id: 2 }, { id: 44, email: 'Ann@example.com', website_id: 1 }], total_count: 2 } },
        never: { [page('customers/search', filterBy('email', 'ann@example.com'))]: one({ id: 9, email: 'ann@example.com', website_id: 2 }) },
        recorded: { kind: 'customers', id: '44', key: 'ann@example.com' },
    },
    stocks: {
        pending: { kind: 'stocks', key: 'Coolers Stock', previous: { websiteCode: 'base', stockId: 1 } },
        landed: INVENTORY({ stocks: [{ stock_id: 4, name: 'Coolers Stock' }] }),
        never: INVENTORY({}),
        recorded: { kind: 'stocks', id: '4', previous: { websiteCode: 'base', stockId: 1 } },
    },
    sources: {
        pending: { kind: 'sources', key: 'north', id: 'north', previous: { enabled: false } },
        landed: INVENTORY({ sources: [{ source_code: 'north', enabled: true }] }),
        // Still off: the switch never landed.
        never: INVENTORY({ sources: [{ source_code: 'north', enabled: false }] }),
        recorded: { kind: 'sources', id: 'north', previous: { enabled: false } },
    },
    stock_source_links: {
        pending: { kind: 'stock_source_links', key: '3/default', id: '3/default' },
        landed: INVENTORY({ links: [{ stock_id: 3, source_code: 'default' }] }),
        never: INVENTORY({}),
        recorded: { kind: 'stock_source_links', id: '3/default' },
    },
    products: {
        pending: { kind: 'products', key: 'vrrack', id: 'vrrack' },
        landed: { 'products/vrrack': { sku: 'vrrack' } },
        never: {},
        recorded: { kind: 'products', id: 'vrrack' },
    },
    giftcards: {
        pending: { kind: 'giftcards', key: 'gift-50', id: 'gift-50' },
        landed: { 'products/gift-50': { sku: 'gift-50' } },
        never: {},
        recorded: { kind: 'giftcards', id: 'gift-50' },
    },
    cart_rules: {
        pending: { kind: 'cart_rules', key: 'Spring' },
        landed: { [page('salesRules/search', filterBy('name', 'Spring'))]: one({ rule_id: 41, name: 'Spring' }) },
        never: { [page('salesRules/search', filterBy('name', 'Spring'))]: EMPTY },
        recorded: { kind: 'cart_rules', id: '41', key: 'Spring' },
    },
    coupons: {
        pending: { kind: 'coupons', key: 'SPRING10' },
        landed: { [page('coupons/search', filterBy('code', 'SPRING10'))]: one({ coupon_id: 88, code: 'SPRING10' }) },
        never: { [page('coupons/search', filterBy('code', 'SPRING10'))]: EMPTY },
        recorded: { kind: 'coupons', id: '88', key: 'SPRING10' },
    },
    b2b_shared_catalogs: {
        pending: { kind: 'b2b_shared_catalogs', key: 'Retail' },
        landed: { [page('sharedCatalog')]: { items: [{ id: 41, name: 'Retail' }] }, ...held(41) },
        never: { [page('sharedCatalog')]: { items: [] } },
        recorded: { kind: 'b2b_shared_catalogs', id: '41', key: 'Retail', previous: { held: { companies: [], categories: [], products: [] } } },
    },
    b2b_companies: {
        pending: { kind: 'b2b_companies', key: 'Altura', find: { email: 'office@altura.test' }, previous: { superUserId: 52 } },
        landed: { [page('company', filterBy('company_name', 'Altura'))]: one({ id: 30, company_name: 'Altura' }) },
        never: { [page('company', filterBy('company_name', 'Altura'))]: EMPTY, [page('company', filterBy('company_email', 'office@altura.test'))]: EMPTY },
        recorded: { kind: 'b2b_companies', id: '30', key: 'Altura', previous: { superUserId: 52 } },
    },
    b2b_shared_catalog_company_assignments: {
        pending: { kind: 'b2b_shared_catalog_company_assignments', key: 'Retail\u0000Altura', id: '41/30' },
        landed: { ...held(41), 'sharedCatalog/41/companies': '["30"]' },
        never: held(41),
        recorded: { kind: 'b2b_shared_catalog_company_assignments', id: '41/30', key: 'Retail\u0000Altura' },
    },
    b2b_shared_catalog_categories: {
        pending: { kind: 'b2b_shared_catalog_categories', key: 'Retail\u0000racks', id: '41/42' },
        landed: { ...held(41), 'sharedCatalog/41/categories': [42] },
        never: held(41),
        recorded: { kind: 'b2b_shared_catalog_categories', id: '41/42', key: 'Retail\u0000racks' },
    },
    b2b_shared_catalog_products: {
        pending: { kind: 'b2b_shared_catalog_products', key: 'Retail\u0000vrrack', id: '41/vrrack' },
        landed: held(41, ['vrrack']),
        never: held(41),
        recorded: { kind: 'b2b_shared_catalog_products', id: '41/vrrack', key: 'Retail\u0000vrrack' },
    },
};

async function settled(reads: Record<string, unknown>, pending: PendingObject) {
    const ctx = await fakeContext(reads);
    await ctx.recorder.markPending([pending]);
    const adopted = await settlePending(ctx.get, ctx.recorder, ctx.log);
    return { ctx, adopted };
}

describe('settlePending, for every kind the engine creates', () => {
    it('can look for every kind the engine records', () => {
        expect([...SETTLED_KINDS].sort()).toEqual([...Object.keys(CASES), 'store_config'].sort());
    });

    it.each(Object.entries(CASES))('%s: one that landed goes on the record as the pack\'s', async (_kind, { pending, landed, recorded }) => {
        const { ctx, adopted } = await settled(landed, pending);

        expect(adopted).toEqual([recorded]);
        expect(ctx.recorder.created).toEqual([recorded]);
        expect(ctx.recorder.pending).toStrictEqual([]);
    });

    it.each(Object.entries(CASES))('%s: one that never landed is forgotten', async (_kind, { pending, never }) => {
        const { ctx, adopted } = await settled(never, pending);

        expect(adopted).toStrictEqual([]);
        expect(ctx.recorder.created).toStrictEqual([]);
        expect(ctx.recorder.pending).toStrictEqual([]);
    });

    it('store_config: a setting that holds the value written landed; one that does not never did', async () => {
        const previous = { path: GRID, scope: 'default' as const, stored: '12', effective: '12', wrote: '24' };
        const landed = await storeContext(configStore({ default: { [GRID]: '24' } }));
        const never = await storeContext(configStore({ default: { [GRID]: '12' } }));
        for (const ctx of [landed, never]) await ctx.recorder.markPending([{ kind: 'store_config', key: `${GRID}@default`, previous }]);

        await settlePending(landed.get, landed.recorder, () => undefined);
        await settlePending(never.get, never.recorder, () => undefined);

        expect(landed.recorder.created).toEqual([{ kind: 'store_config', id: `${GRID}@default`, key: `${GRID}@default`, previous }]);
        expect(never.recorder.created).toStrictEqual([]);
        expect(never.recorder.pending).toStrictEqual([]);
    });

    it('stops, naming the kind, on a pending entry it cannot look for', async () => {
        const ctx = await fakeContext();
        await ctx.recorder.markPending([{ kind: 'aco_products', key: 'x' }]);

        await expect(settlePending(ctx.get, ctx.recorder, ctx.log)).rejects.toThrow(/aco_products still being made/u);
    });
});

const VR_RACK = { product: { sku: 'vrrack', name: 'VR Rack', type_id: 'simple', attribute_set_id: 4 } };

describe('a product whose create lost its answer, through install and removal', () => {
    it('is kept pending, taken as the pack\'s by the next install, and removed with the pack', async () => {
        const files = memoryFiles();
        const store: Record<string, unknown> = {};
        const first = await fakeContext(store, (call: SentCall) => {
            // The create lands; its answer never comes back.
            store['products/vrrack'] = { sku: 'vrrack' };
            store[page('products', filterIn('sku', ['vrrack']))] = one({ sku: 'vrrack', name: 'VR Rack', type_id: 'simple', attribute_set_id: 4 });
            throw new CommerceReadError(`Commerce did not answer ${call.path}: The operation timed out.`);
        });
        first.recorder = await openInstallRecord(files, PROJECT, PACK, NOW);
        first.session.websiteId = 1;
        await expect(installPack(first, { products: [VR_RACK] })).rejects.toThrow(/did not answer/u);
        expect((await readInstallRecord(files, PROJECT, PACK))?.pending).toEqual([{ kind: 'products', key: 'vrrack', id: 'vrrack' }]);

        const again = await fakeContext(store, () => ({}));
        again.recorder = await openInstallRecord(files, PROJECT, PACK, NOW);
        again.session.websiteId = 1;
        await installPack(again, { products: [VR_RACK] });

        // Not "the store already has it": the product is the pack's, and nothing is sent twice.
        expect(again.sent).toStrictEqual([]);
        expect(again.logged).toContain("took products vrrack as the pack's: an earlier install made it and never heard back");
        expect((await readInstallRecord(files, PROJECT, PACK))?.created).toEqual([expect.objectContaining({ kind: 'products', id: 'vrrack' })]);

        const removal = await fakeContext(store, () => true);
        await removePack(removal, files, { projectPath: PROJECT, pack: PACK });
        expect(removal.sent).toEqual([{ method: 'DELETE', path: 'products/vrrack', body: undefined }]);
    });
});

describe('removing a pack whose install left a create pending', () => {
    it('takes back a category that landed, though its id was never answered', async () => {
        const files = memoryFiles();
        await (await openInstallRecord(files, PROJECT, PACK, NOW)).markPending([{ kind: 'categories', key: 'Default Category/Sale', find: { parentId: 2, name: 'Sale' } }]);
        const ctx = await fakeContext({ [childSearch(2, 'Sale')]: { items: [{ id: 41, name: 'Sale', parent_id: 2 }] }, [childSearch(41, '')]: { items: [] } }, () => true);

        const result = await removePack(ctx, files, { projectPath: PROJECT, pack: PACK });

        expect(ctx.sent).toContainEqual({ method: 'DELETE', path: 'categories/41', body: undefined });
        expect(result.removed).toBe(1);
        expect(files.data.has(installRecordPath(PROJECT, PACK))).toBe(false);
    });

    it('writes nothing for one that never landed, and forgets the record', async () => {
        const files = memoryFiles();
        await (await openInstallRecord(files, PROJECT, PACK, NOW)).markPending([{ kind: 'products', key: 'vrrack', id: 'vrrack' }]);
        const ctx = await fakeContext({}, () => true);

        const result = await removePack(ctx, files, { projectPath: PROJECT, pack: PACK });

        expect(ctx.sent).toStrictEqual([]);
        expect(result).toEqual({ removed: 0, noRecord: false, kept: [] });
        expect(files.data.has(installRecordPath(PROJECT, PACK))).toBe(false);
    });
});
