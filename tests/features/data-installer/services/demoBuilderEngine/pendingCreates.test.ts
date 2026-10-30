/**
 * A create whose answer is lost is still the pack's (step 14 item 1): every create the engine sends
 * is written down as pending first, and kept pending when no answer comes, so the next install or
 * removal can look for it.
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import { installAssignments, installAttributeSets, parseAssignmentRows, parseAttributeSetRows } from '@/features/data-installer/services/demoBuilderEngine/attributeSetsKind';
import { addMissingOptions, installAttributes, parseAttributeRows } from '@/features/data-installer/services/demoBuilderEngine/attributesKind';
import { filterBy } from '@/features/data-installer/services/demoBuilderEngine/b2bReads';
import { installCartRules, parseCartRuleRows } from '@/features/data-installer/services/demoBuilderEngine/cartRulesKind';
import { installCategories, parseCategoryPack } from '@/features/data-installer/services/demoBuilderEngine/categoriesKind';
import { installCompanies, parseCompanyRows } from '@/features/data-installer/services/demoBuilderEngine/companiesKind';
import { installCoupons, parseCouponRows } from '@/features/data-installer/services/demoBuilderEngine/couponsKind';
import { installCustomerGroups, installCustomers, parseCustomerGroupRows, parseCustomerRows } from '@/features/data-installer/services/demoBuilderEngine/customerKinds';
import type { PendingObject } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import type { KindContext } from '@/features/data-installer/services/demoBuilderEngine/kindContext';
import { createOne } from '@/features/data-installer/services/demoBuilderEngine/pendingCreates';
import { installProducts, parseProductRows } from '@/features/data-installer/services/demoBuilderEngine/productsKind';
import { installAssignments as installCatalogAssignments, installCatalogs, parseCatalogRows } from '@/features/data-installer/services/demoBuilderEngine/sharedCatalogKinds';
import { installSources, installStockSourceLinks, installStocks, parseSources, parseStockSourceLinks, parseStocks } from '@/features/data-installer/services/demoBuilderEngine/stockKinds';
import { installStoreConfig } from '@/features/data-installer/services/demoBuilderEngine/storeConfigKind';
import { BODEA_COMPANY_ROW } from '../../../../helpers/commerceB2bFixtures';
import { type SentCall, childSearch, fakeContext, page } from './demoBuilderEngine.testUtils';
import { GRID, configStore, row, storeContext } from './storeConfig.testUtils';

/** What a write whose answer never came looks like: no HTTP status at all. */
const lostAnswer = (call: SentCall) => new CommerceReadError(`Commerce did not answer ${call.path}: The operation timed out.`);
/** Every write the store is sent loses its answer. */
const neverAnswers = (call: SentCall): never => {
    throw lostAnswer(call);
};

const INVENTORY = {
    'inventory/sources?searchCriteria[pageSize]=200': { items: [{ source_code: 'default', name: 'Default Source', enabled: true }, { source_code: 'north', name: 'North', enabled: false }] },
    'inventory/stocks?searchCriteria[pageSize]=200': { items: [{ stock_id: 1, name: 'Default Stock', extension_attributes: { sales_channels: [{ type: 'website', code: 'base' }] } }, { stock_id: 3, name: 'Racks Stock' }] },
    'inventory/stock-source-links?searchCriteria[pageSize]=200': { items: [] },
};
const EMPTY = { items: [], total_count: 0 };
const SETS_PAGE = page('products/attribute-sets/sets/list');
const ADMIN = BODEA_COMPANY_ROW.variables.input.company_admin.email;

interface Case {
    reads: Record<string, unknown>;
    run: (ctx: KindContext) => Promise<void>;
    pending: PendingObject;
    /** Writes that do answer, so the run reaches the create under test. */
    answered?: (call: SentCall) => unknown;
}

const CASES: Record<string, Case> = {
    'an attribute set': {
        reads: { [SETS_PAGE]: EMPTY },
        run: (ctx) => installAttributeSets(ctx, parseAttributeSetRows([{ attributeSet: { attribute_set_name: 'Coolers' } }])),
        pending: { kind: 'attribute_sets', key: 'Coolers' },
    },
    'an attribute': {
        reads: {},
        run: (ctx) => installAttributes(ctx, parseAttributeRows([{ attribute: { attribute_code: 'fabric', frontend_input: 'select' } }])),
        pending: { kind: 'product_attributes', key: 'fabric', id: 'fabric' },
    },
    "an option on the store's attribute": {
        reads: { 'products/attributes/fabric/options': [] },
        run: (ctx) => addMissingOptions(ctx, 'fabric', [{ label: 'Wool' }]),
        pending: { kind: 'attribute_options', key: 'fabric/Wool' },
    },
    'an attribute put in its set': {
        reads: { 'products/attribute-sets/12/attributes': [] },
        run: (ctx) => {
            ctx.session.setIds.set('Racks', 12);
            ctx.session.groupIds.set('Racks', 80);
            return installAssignments(ctx, parseAssignmentRows([{ attributeSetId: 'Racks', attributeCode: 'fabric' }]));
        },
        pending: { kind: 'attribute_assign_to_set', key: '12/fabric', id: '12/fabric' },
    },
    'a category': {
        reads: { [childSearch(2, 'Sale')]: { items: [] } },
        run: (ctx) => installCategories(ctx, parseCategoryPack({ categories: [{ category: { name: 'Sale', path: 'Default Category' } }] })),
        pending: { kind: 'categories', key: expect.any(String) as string, find: { parentId: 2, name: 'Sale' } },
    },
    'a customer group': {
        reads: { [page('customerGroups/search', filterBy('customer_group_code', 'Platinum'))]: EMPTY },
        run: (ctx) => installCustomerGroups(ctx, parseCustomerGroupRows([{ customer_group: { code: 'Platinum' } }])),
        pending: { kind: 'customer_groups', key: 'Platinum' },
    },
    'a customer': {
        reads: { [page('customers/search', filterBy('email', 'ann@example.com'))]: EMPTY },
        run: (ctx) => installCustomers(ctx, parseCustomerRows([{ customer: { email: 'ann@example.com', firstname: 'Ann', lastname: 'Lee' } }])),
        pending: { kind: 'customers', key: 'ann@example.com', find: { websiteId: 1 } },
    },
    'a stock': {
        reads: INVENTORY,
        run: (ctx) => installStocks(ctx, parseStocks({ stocks: [{ stock: { name: 'Coolers Stock' } }] })),
        pending: { kind: 'stocks', key: 'Coolers Stock', previous: { websiteCode: 'base', stockId: 1 } },
    },
    'a source': {
        reads: INVENTORY,
        run: (ctx) => installSources(ctx, parseSources({ sources: [{ source: { source_code: 'south', name: 'South' } }] })),
        pending: { kind: 'sources', key: 'south', id: 'south' },
    },
    'a source switched back on': {
        reads: { ...INVENTORY, 'inventory/sources/north': { source_code: 'north', name: 'North', enabled: false } },
        run: (ctx) => installSources(ctx, parseSources({ sources: [{ source: { source_code: 'north', name: 'North' } }] })),
        pending: { kind: 'sources', key: 'north', id: 'north', previous: { enabled: false } },
    },
    'a stock source link': {
        reads: INVENTORY,
        run: (ctx) => installStockSourceLinks(ctx, parseStockSourceLinks({ stockSourceLinks: [{ stockSourceLink: { stock_id: 'Racks Stock', source_code: 'default' } }] })),
        pending: { kind: 'stock_source_links', key: '3/default', id: '3/default' },
    },
    'a product': {
        reads: {},
        run: (ctx) => installProducts(ctx, parseProductRows([{ product: { sku: 'vrrack', name: 'VR Rack', type_id: 'simple', attribute_set_id: 4 } }])),
        pending: { kind: 'products', key: 'vrrack', id: 'vrrack' },
    },
    'a gift card': {
        reads: {},
        run: (ctx) => installProducts(ctx, parseProductRows([{ product: { sku: 'gift-50', name: 'Gift', type_id: 'giftcard', attribute_set_id: 4 } }]), 'giftcards'),
        pending: { kind: 'giftcards', key: 'gift-50', id: 'gift-50' },
    },
    'a cart rule': {
        reads: { [page('salesRules/search', filterBy('name', 'Spring'))]: EMPTY },
        run: (ctx) => installCartRules(ctx, parseCartRuleRows([{ rule: { name: 'Spring' } }])),
        pending: { kind: 'cart_rules', key: 'Spring' },
    },
    'a coupon': {
        reads: { [page('coupons/search', filterBy('code', 'SPRING10'))]: EMPTY },
        run: async (ctx) => {
            await ctx.recorder.record({ kind: 'cart_rules', id: '41', key: 'Spring' });
            await installCoupons(ctx, parseCouponRows([{ coupon: { code: 'SPRING10', rule_id: 'Spring' } }]));
        },
        pending: { kind: 'coupons', key: 'SPRING10' },
    },
    'a shared catalog': {
        reads: { [page('sharedCatalog')]: { items: [] } },
        run: (ctx) => installCatalogs(ctx, parseCatalogRows([{ sharedCatalog: { name: 'Retail' } }])),
        pending: { kind: 'b2b_shared_catalogs', key: 'Retail' },
    },
    "a company's admin": {
        reads: {
            [page('sharedCatalog')]: { items: [] },
            [page('company', filterBy('company_name', 'Altura'))]: EMPTY,
            [page('company', filterBy('company_email', 'office.altura@example.com'))]: EMPTY,
            [page('customers/search', filterBy('email', ADMIN))]: EMPTY,
        },
        run: (ctx) => installCompanies(ctx, parseCompanyRows([BODEA_COMPANY_ROW])),
        pending: { kind: 'customers', key: ADMIN.toLowerCase(), find: { websiteId: 1 } },
    },
    'a company': {
        reads: {
            [page('sharedCatalog')]: { items: [] },
            [page('company', filterBy('company_name', 'Altura'))]: EMPTY,
            [page('company', filterBy('company_email', 'office.altura@example.com'))]: EMPTY,
            [page('customers/search', filterBy('email', ADMIN))]: { items: [{ id: 52, email: ADMIN, website_id: 1 }], total_count: 1 },
        },
        run: (ctx) => installCompanies(ctx, parseCompanyRows([BODEA_COMPANY_ROW])),
        pending: { kind: 'b2b_companies', key: 'Altura', find: { email: 'office.altura@example.com' }, previous: { superUserId: 52 } },
    },
    "a product put in a shared catalog": {
        reads: { [page('sharedCatalog')]: { items: [{ id: 41, name: 'Retail' }] }, 'sharedCatalog/41/companies': '[]', 'sharedCatalog/41/categories': [], 'sharedCatalog/41/products': [] },
        run: (ctx) => installCatalogAssignments(ctx, 'b2b_shared_catalog_products', { catalogs: [{ name: 'Retail', products: [{ sku: 'vrrack' }] }] }),
        pending: { kind: 'b2b_shared_catalog_products', key: expect.any(String) as string, id: '41/vrrack' },
    },
};

describe('every create is written down as pending before it is sent, and stays so when no answer comes', () => {
    it.each(Object.entries(CASES))('%s', async (_label, { reads, run, pending }) => {
        const pendingWhenSent: PendingObject[][] = [];
        const ctx = await fakeContext(reads, (call) => {
            pendingWhenSent.push([...ctx.recorder.pending]);
            return neverAnswers(call);
        });
        ctx.session.websiteId = 1;
        ctx.session.websiteCode = 'base';

        await expect(run(ctx)).rejects.toThrow(/did not answer/u);

        expect(pendingWhenSent[0]).toEqual([pending]);
        expect(ctx.recorder.pending).toEqual([pending]);
        expect(ctx.recorder.created.filter((o) => o.kind === pending.kind)).toStrictEqual([]);
    });

    it('a store setting, with what its scope held and the value about to be written', async () => {
        const store = configStore({ default: { [GRID]: '12' } });
        const ctx = await storeContext(store);
        ctx.send = async () => {
            throw new CommerceReadError('Commerce did not answer system/config: The operation timed out.');
        };

        await expect(installStoreConfig(ctx, [row(GRID, '24')])).rejects.toThrow(/did not answer/u);

        expect(ctx.recorder.pending).toEqual([
            { kind: 'store_config', key: `${GRID}@default`, previous: { path: GRID, scope: 'default', stored: '12', effective: '12', wrote: '24' } },
        ]);
    });
});

describe('createOne', () => {
    it('swaps the pending entry for the object once Commerce answers', async () => {
        const ctx = await fakeContext();

        await createOne(ctx, { kind: 'products', key: 'vrrack', id: 'vrrack' }, async () => ({ kind: 'products', id: 'vrrack' }));

        expect(ctx.recorder.pending).toStrictEqual([]);
        expect(ctx.recorder.created).toEqual([{ kind: 'products', id: 'vrrack' }]);
    });

    it('forgets the pending entry when Commerce refused the create: it made nothing', async () => {
        const ctx = await fakeContext();

        const refused = createOne(ctx, { kind: 'products', key: 'vrrack', id: 'vrrack' }, async () => {
            throw new CommerceReadError('Commerce answered 400 for products: {"message":"Invalid"}', 400);
        });

        await expect(refused).rejects.toThrow(/400/u);
        expect(ctx.recorder.pending).toStrictEqual([]);
    });

    it.each([
        ['a 5xx, which may have landed', new CommerceReadError('Commerce answered 503 for products', 503)],
        ["an answer missing the new id, which did land", new Error('Commerce did not answer the new cart rule Spring\'s id.')],
    ])('keeps the pending entry after %s', async (_label, error) => {
        const ctx = await fakeContext();

        await expect(createOne(ctx, { kind: 'cart_rules', key: 'Spring' }, async () => Promise.reject(error))).rejects.toThrow();

        expect(ctx.recorder.pending).toEqual([{ kind: 'cart_rules', key: 'Spring' }]);
    });
});
