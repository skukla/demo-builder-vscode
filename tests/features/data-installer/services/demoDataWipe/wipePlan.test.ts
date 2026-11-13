/**
 * What clearing a project's websites would remove (datapack-engine step 10; datapack-simplification
 * step 06): only what the chosen websites own, judged against the whole chosen set, decided from
 * reads, writing nothing; answered as one row and one full record list per data type, kept records
 * without reasons, and a read that failed marked by its kind.
 */

import { filterBy, filterIn } from '@/features/data-installer/services/demoBuilderEngine/b2bReads';
import { planWipeFor, withinPlan } from '@/features/data-installer/services/demoDataWipe/wipePlan';
import { WipeScopeError } from '@/features/data-installer/services/demoDataWipe/wipeReads';
import type { CommerceSalesRule } from '@/types/commerceSalesRule';
import type { CommerceGet, CommerceOrder } from '@/types/commerceWire';
import { ADMIN_64, BUYER_65, CATALOG_20, GROUP_30, LONE_SHOPPER, WIPER_1, attributeInstance, b2bInstance, settingsInstance } from '../../../../helpers/commerceWipeInstanceFixtures';
import { PROJECT_RECORDS, sandbox } from './wipe.testUtils';

/** The test website: one store, `justrite_test_store`, whose root 119 JustRite's store also shows. */
const TEST_SITE = ['justrite_test_website'];

describe('planWipe on a website whose root another website shares (justrite_test_website)', () => {
    it('removes products sold only there, takes shared ones off it, and keeps a lone variant and what a record lists', async () => {
        const plan = await planWipeFor(sandbox().get, TEST_SITE, { records: PROJECT_RECORDS });

        expect(plan.deleteSkus).toEqual(['ZZ-ONLY-HERE', 'ZZ-JACKET', 'ZZ-JACKET-RED']);
        expect(plan.takeOff).toEqual([{ sku: 'ZZ-SHARED-WITH-JUSTRITE', websiteId: 5 }]);
        expect(plan.check.records.products).toEqual({
            removed: ['ZZ-ONLY-HERE', 'ZZ-JACKET', 'ZZ-JACKET-RED', 'ZZ-SHARED-WITH-JUSTRITE'],
            kept: ['ZZ-LONE-VARIANT', 'ZZ-MADE-BY-DEMO-BUILDER'],
        });
    });

    it('keeps every category under the root a website not chosen also shows, with no reason', async () => {
        const plan = await planWipeFor(sandbox().get, TEST_SITE, { records: PROJECT_RECORDS });

        expect(plan.categoryIds).toStrictEqual([]);
        expect(plan.check.records.categories).toEqual({ removed: [], kept: ['Safety Cans'] });
    });

    it("takes the website's customers, keeping one in a company that stays and the one a record lists", async () => {
        const plan = await planWipeFor(sandbox().get, TEST_SITE, { records: PROJECT_RECORDS });

        expect(plan.customerIds).toEqual(['70']);
        expect(plan.check.records.customers).toEqual({ removed: ['zz.shopper@example.com'], kept: ['zz.admin@example.com', 'zz.made@example.com'] });
    });

    it('reads by the website and its views, writes nothing, and answers a row per type and full lists', async () => {
        const store = sandbox();

        const { check } = await planWipeFor(store.get, TEST_SITE, { records: PROJECT_RECORDS });

        expect(store.sent).toStrictEqual([]);
        expect(store.reads.some((p) => p.startsWith('products?') && p.includes(filterBy('website_id', 5)))).toBe(true);
        expect(store.reads.some((p) => p.startsWith('customers/search?') && p.includes(filterBy('website_id', 5)))).toBe(true);
        expect(store.reads.some((p) => p.startsWith('orders?') && p.includes(filterIn('store_id', [6])))).toBe(true);
        expect(check.websites).toEqual([{ code: 'justrite_test_website', name: 'JustRite Test' }]);
        expect(check.rows).toEqual([
            { type: 'products', label: 'Products', count: 4, happens: '4 removed' },
            { type: 'categories', label: 'Categories', count: 0, happens: '0 removed' },
            { type: 'customers', label: 'Customers', count: 1, happens: '1 removed' },
        ]);
        expect(check.total).toBe(5);
        expect(check.unread).toBeUndefined();
        expect(check.problem).toBeUndefined();
    });

    it('keeps a product whose websites or visibility Commerce did not answer', async () => {
        const store = sandbox({ products: [{ id: 1, sku: 'ZZ-NO-FIELDS', extension_attributes: { website_ids: [5] } }] });

        const plan = await planWipeFor(store.get, TEST_SITE, { records: [] });

        expect(plan.deleteSkus).toStrictEqual([]);
        expect(plan.check.records.products).toEqual({ removed: [], kept: ['ZZ-NO-FIELDS'] });
    });

    it('clears the shared root once every website using it is chosen', async () => {
        const plan = await planWipeFor(sandbox({ products: [], customers: [] }).get, [...TEST_SITE, 'justrite'], { records: [] });

        expect(plan.categoryIds).toEqual(['120']);
    });
});

describe('planWipe on a website with roots of its own (bodea)', () => {
    it("removes both stores' categories, top ones first, as a tree, keeping one holding a category Demo Builder installed", async () => {
        const plan = await planWipeFor(sandbox({ products: [], customers: [] }).get, ['bodea'], { records: PROJECT_RECORDS });

        expect(plan.categoryIds).toEqual(['151', '161', '152']);
        // Commerce deletes 152 with 151, its parent: no request is sent for it.
        expect(plan.categoryUnder).toEqual({ 152: '151' });
        expect(plan.check.records.categories).toEqual({
            removed: ['Racks', 'Server Racks', 'Clearance'],
            kept: ['Cables', 'Pack Cables'],
            tree: [{ name: 'Racks', id: '151', children: [{ name: 'Server Racks', id: '152' }] }, { name: 'Clearance', id: '161' }],
        });
    });
});

describe('planWipe keeps a category a cart rule that stays names (F3)', () => {
    const naming = (value: string): CommerceSalesRule => ({
        rule_id: 9,
        name: 'JustRite Racks',
        website_ids: [2],
        condition: { condition_type: 'all', conditions: [{ condition_type: 'found', conditions: [{ condition_type: 'product', attribute_name: 'category_ids', operator: '==', value }] }] },
    });

    it('keeps the category, and the one above it, since Commerce deletes a category with its parent', async () => {
        const plan = await planWipeFor(sandbox({ products: [], customers: [], rules: [naming('152, 999')] }).get, ['bodea'], { records: [] });

        expect(plan.categoryIds).toEqual(['154', '161', '155']);
        expect(plan.check.records.categories.kept).toEqual(['Racks', 'Server Racks']);
    });

    it('deletes the categories a rule going in the same clearing names', async () => {
        const going: CommerceSalesRule = { ...naming('152'), website_ids: [3] };

        const plan = await planWipeFor(sandbox({ products: [], customers: [], rules: [going] }).get, ['bodea'], { records: [] });

        expect(plan.ruleIds).toEqual(['9']);
        expect(plan.categoryIds).toEqual(['151', '154', '161', '152', '155']);
    });

    it("leaves every category alone when the cart rules can't be read", async () => {
        const store = sandbox({ products: [], customers: [] });
        const get: CommerceGet = (path) => (path.startsWith('salesRules/search?') ? Promise.reject(new Error('Commerce answered 500 for salesRules')) : store.get(path));

        const plan = await planWipeFor(get, ['bodea'], { records: [] });

        expect(plan.categoryIds).toStrictEqual([]);
        expect(plan.check.unread).toMatchObject({ cart_rules: 'strange', categories: 'strange' });
    });
});

describe('planWipe counts', () => {
    const order = (id: number, state: string, lines: CommerceOrder['items']): CommerceOrder => ({ entity_id: id, increment_id: `000000${id}`, state, status: state, store_id: 6, items: lines });

    it('lists closed orders under orders, and leaves payment review and already-closed orders off the summary', async () => {
        const orders = [
            order(801, 'new', [{ item_id: 1, qty_ordered: 1 }]),
            order(802, 'payment_review', [{ item_id: 2, qty_ordered: 1, qty_invoiced: 1 }]),
            order(803, 'closed', [{ item_id: 3, qty_ordered: 1 }]),
        ];

        const plan = await planWipeFor(sandbox({ products: [], customers: [], orders }).get, TEST_SITE, { records: [] });

        expect(plan.orders.map((o) => o.number)).toEqual(['000000801', '000000802']);
        expect(plan.check.records.orders).toEqual({ removed: ['000000801'], kept: [] });
        expect(plan.check.rows).toEqual([
            { type: 'categories', label: 'Categories', count: 0, happens: '0 removed' },
            { type: 'orders', label: 'Orders', count: 1, happens: '1 closed' },
        ]);
        expect(plan.check.total).toBe(1);
    });

    it("counts a catalog's group under customer groups, and a company's members under customers", async () => {
        const plan = await planWipeFor(sandbox({ products: [], orders: [], customers: [ADMIN_64, BUYER_65], instance: b2bInstance() }).get, TEST_SITE, { records: [] });

        expect(plan.check.records.b2b_companies.removed).toHaveLength(1);
        expect(plan.check.records.customers.removed.sort()).toEqual([ADMIN_64.email, BUYER_65.email].sort());
        expect(plan.check.records.b2b_shared_catalogs.removed).toEqual([CATALOG_20.name]);
        expect(plan.check.records.customer_groups.removed).toEqual(['ZZ Test Catalog']);
    });
});

describe('planWipe, a read that fails', () => {
    /** The sandbox, with reads matching `pattern` failing as `error`. */
    function failing(pattern: RegExp, error: Error, state: Parameters<typeof sandbox>[0] = {}) {
        const store = sandbox(state);
        const get: CommerceGet = (path) => (pattern.test(path) ? Promise.reject(error) : store.get(path));
        return { store, get };
    }

    it('marks a type Commerce answers strangely as not read, leaves it alone, and plans the rest', async () => {
        const { get } = failing(/^products\?/u, new Error('Commerce answered 500 for products'));

        const plan = await planWipeFor(get, TEST_SITE, { records: [] });

        expect(plan.deleteSkus).toStrictEqual([]);
        expect(plan.takeOff).toStrictEqual([]);
        expect(plan.customerIds).toEqual(['70', '72']);
        // Categories go with it (F2): which products sit in them is not known.
        expect(plan.check.unread).toEqual({ products: 'strange', categories: 'strange' });
        expect(plan.check.rows[0]).toEqual({ type: 'products', label: 'Products', count: 0, happens: "Couldn't be read" });
        expect(plan.check.problem).toBeUndefined();
    });

    it("leaves the categories alone when the products can't be read: their links are not known (F2)", async () => {
        const { get } = failing(/^products\?/u, new Error('Commerce answered 500 for products'), { customers: [] });

        const plan = await planWipeFor(get, ['bodea'], { records: [] });

        expect(plan.categoryIds).toStrictEqual([]);
        expect(plan.check.unread).toEqual({ products: 'strange', categories: 'strange' });
    });

    it('marks a type Commerce turns away as refused', async () => {
        const { get } = failing(/^customers\/search\?/u, new Error('Commerce answered 401: Unauthorized'));

        const plan = await planWipeFor(get, TEST_SITE, { records: [] });

        expect(plan.customerIds).toStrictEqual([]);
        expect(plan.check.unread).toEqual({ customers: 'refused' });
    });

    it('answers a slow type as the problem to retry, naming it', async () => {
        const { get } = failing(/^customers\/search\?/u, new Error('The request timed out'));

        const plan = await planWipeFor(get, TEST_SITE, { records: [] });

        expect(plan.check.unread).toEqual({ customers: 'slow' });
        expect(plan.check.problem).toBe("Commerce didn't answer for Customers.");
    });

    it("leaves the catalogs, groups and attributes alone when the cart rules can't be read: what uses them is unknown", async () => {
        const { get } = failing(/^salesRules\/search\?/u, new Error('Commerce answered 500 for salesRules'), { customers: [LONE_SHOPPER], products: [WIPER_1], instance: attributeInstance({ groups: [GROUP_30] }) });

        const plan = await planWipeFor(get, TEST_SITE, { records: [] });

        expect(plan.groups).toStrictEqual([]);
        expect(plan.attributes).toStrictEqual([]);
        expect(plan.check.unread).toMatchObject({ cart_rules: 'strange', b2b_shared_catalogs: 'strange', customer_groups: 'strange', product_attributes: 'strange' });
    });
});

describe('planWipe refusals', () => {
    it('names a website the store does not have', async () => {
        await expect(planWipeFor(sandbox().get, ['nope'], { records: [] })).rejects.toThrow(new WipeScopeError('Commerce has no website nope.'));
    });
});

describe('withinPlan', () => {
    it('lets a plan through that takes the same or less, and stops one that takes more or other websites', async () => {
        const shown = await planWipeFor(sandbox().get, TEST_SITE, { records: PROJECT_RECORDS });
        const less = await planWipeFor(sandbox({ products: [] }).get, TEST_SITE, { records: PROJECT_RECORDS });
        const more = await planWipeFor(sandbox({ customers: [{ id: 99, email: 'new@example.com', firstname: 'N', lastname: 'W', website_id: 5 }] }).get, TEST_SITE, { records: [] });
        const other = await planWipeFor(sandbox().get, ['bodea'], { records: [] });

        expect(withinPlan(shown, shown)).toBe(true);
        expect(withinPlan(shown, less)).toBe(true);
        expect(withinPlan(shown, more)).toBe(false);
        expect(withinPlan(shown, other)).toBe(false);
        expect(less.check.token).not.toBe(shown.check.token);
    });

    it.each([
        ['a company and its customers', { customers: [ADMIN_64, BUYER_65], instance: b2bInstance() }],
        ['a catalog', { customers: [LONE_SHOPPER], instance: b2bInstance({ catalogs: [{ ...CATALOG_20, customer_group_id: 30 }], companies: [] }) }],
        ['an attribute set and attribute', { products: [WIPER_1], instance: attributeInstance() }],
        ['a website setting', { instance: settingsInstance() }],
    ])('stops a plan that would now take %s the list did not hold', async (_what, state) => {
        const shown = await planWipeFor(sandbox({ customers: [], products: [] }).get, TEST_SITE, { records: [] });

        const now = await planWipeFor(sandbox({ customers: [], products: [], ...state }).get, TEST_SITE, { records: [] });

        expect(withinPlan(shown, now)).toBe(false);
        expect(now.check.token).not.toBe(shown.check.token);
    });

    it("lets through a website setting the datapack's removal set back, though the list did not show it (C3)", async () => {
        // Shown with the pack's value in place, the same as the default: nothing to set back then.
        const packWrote = settingsInstance();
        const setting = packWrote.settings?.websites.justrite_test_website.find((r) => r.path === 'sales/totals_sort/tax');
        if (setting) setting.value = '40';
        const shown = { ...(await planWipeFor(sandbox({ customers: [], products: [], instance: packWrote }).get, TEST_SITE, { records: [] })), setBack: ['justrite_test_website/sales/totals_sort/tax'] };
        // The removal put back what the website held before the pack (41), which differs from the default.
        const now = await planWipeFor(sandbox({ customers: [], products: [], instance: settingsInstance() }).get, TEST_SITE, { records: [] });

        expect(now.settings.map((s) => s.path)).toContain('sales/totals_sort/tax');
        expect(shown.settings.map((s) => s.path)).not.toContain('sales/totals_sort/tax');
        expect(withinPlan(shown, now)).toBe(true);
        expect(withinPlan({ ...shown, setBack: [] }, now)).toBe(false);
    });

    it('stops a plan that would now close an order the list did not hold', async () => {
        const shown = await planWipeFor(sandbox().get, TEST_SITE, { records: [] });
        const order = { entity_id: 800, increment_id: '000000800', state: 'new', store_id: 6, items: [{ item_id: 1, qty_ordered: 1 }] };
        const now = await planWipeFor(sandbox({ orders: [order] }).get, TEST_SITE, { records: [] });

        expect(withinPlan(shown, now)).toBe(false);
    });
});
