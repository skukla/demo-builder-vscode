/**
 * What clearing a demo's part of the store would remove (datapack-engine step 10): only what the
 * chosen stores own and Demo Builder did not install, judged against the whole chosen set, decided
 * from reads, writing nothing.
 */

import { filterBy, filterIn } from '@/features/data-installer/services/demoBuilderEngine/b2bReads';
import { NEVER_TOUCHED, planWipeFor, withinPlan } from '@/features/data-installer/services/demoDataWipe/wipePlan';
import { WipeScopeError } from '@/features/data-installer/services/demoDataWipe/wipeReads';
import { BODEA_CUSTOMERS, BODEA_OUTLET_ORDER, BODEA_PRODUCTS } from '../../../../helpers/commerceWipeFixtures';
import { PROJECT_RECORDS, sandbox } from './wipe.testUtils';

const TEST_STORE = [{ websiteCode: 'justrite_test_website', storeCode: 'justrite_test_store' }];
const BODEA_STORE = [{ websiteCode: 'bodea', storeCode: 'bodea_store' }];

describe('planWipe on a store whose website is wholly chosen and whose root is shared (justrite_test_store)', () => {
    it('removes products sold only there, takes shared ones off it, and leaves a lone variant', async () => {
        const plan = await planWipeFor(sandbox().get, TEST_STORE, PROJECT_RECORDS);

        expect(plan.deleteSkus).toEqual(['ZZ-ONLY-HERE', 'ZZ-JACKET', 'ZZ-JACKET-RED']);
        expect(plan.takeOff).toEqual([{ sku: 'ZZ-SHARED-WITH-JUSTRITE', websiteId: 5 }]);
        expect(plan.preview.left).toContainEqual(expect.objectContaining({ kind: 'products', count: 1, names: ['ZZ-LONE-VARIANT'] }));
    });

    it('leaves every category under the root a store not chosen also shows, and names that store', async () => {
        const plan = await planWipeFor(sandbox().get, TEST_STORE, PROJECT_RECORDS);

        expect(plan.categoryIds).toStrictEqual([]);
        expect(plan.preview.left).toContainEqual({
            kind: 'categories',
            count: 1,
            names: ['Safety Cans'],
            why: 'under root category 119, which the store justrite_store (website justrite) also shows',
        });
    });

    it("takes only the website's customers, leaving one in a B2B company and the one Demo Builder made", async () => {
        const plan = await planWipeFor(sandbox().get, TEST_STORE, PROJECT_RECORDS);

        expect(plan.customerIds).toEqual(['70']);
        expect(plan.preview.left).toContainEqual(expect.objectContaining({ kind: 'customers', names: ['zz.admin@example.com'] }));
    });

    it('never names what an install record lists, and counts those apart', async () => {
        const plan = await planWipeFor(sandbox().get, TEST_STORE, PROJECT_RECORDS);

        expect(plan.deleteSkus).not.toContain('ZZ-MADE-BY-DEMO-BUILDER');
        expect(plan.preview.installed).toEqual({ products: 1, customers: 1, categories: 1 });
    });

    it('reads by the website and the views, writes nothing, and answers counts and a few names, never rows', async () => {
        const store = sandbox();

        const { preview } = await planWipeFor(store.get, TEST_STORE, PROJECT_RECORDS);

        expect(store.sent).toStrictEqual([]);
        expect(store.reads.some((p) => p.startsWith('products?') && p.includes(filterBy('website_id', 5)))).toBe(true);
        expect(store.reads.some((p) => p.startsWith('customers/search?') && p.includes(filterBy('website_id', 5)))).toBe(true);
        expect(store.reads.some((p) => p.startsWith('orders?') && p.includes(filterIn('store_id', [6])))).toBe(true);
        expect(preview).toMatchObject({
            stores: [{ websiteCode: 'justrite_test_website', websiteName: 'JustRite Test', storeCode: 'justrite_test_store', storeName: 'JustRite Test Store' }],
            remove: { products: { count: 3, names: ['ZZ-ONLY-HERE', 'ZZ-JACKET', 'ZZ-JACKET-RED'] }, categories: { count: 0, names: [] }, customers: { count: 1, names: ['zz.shopper@example.com'] } },
            takenOff: { count: 1, names: ['ZZ-SHARED-WITH-JUSTRITE'] },
            orders: { cancel: { count: 0, names: [] }, refund: { count: 0, names: [] }, returns: { count: 0, names: [] } },
            total: 5,
            never: NEVER_TOUCHED,
        });
    });

    it('leaves a product whose websites or visibility Commerce did not answer', async () => {
        const store = sandbox({ products: [{ id: 1, sku: 'ZZ-NO-FIELDS', extension_attributes: { website_ids: [5] } }] });

        const plan = await planWipeFor(store.get, TEST_STORE, []);

        expect(plan.deleteSkus).toStrictEqual([]);
        expect(plan.preview.left.filter((l) => l.kind === 'products')).toEqual([expect.objectContaining({ names: ['ZZ-NO-FIELDS'] })]);
    });

    it('clears the shared root once every store using it is chosen', async () => {
        const plan = await planWipeFor(sandbox({ products: [], customers: [] }).get, [...TEST_STORE, { websiteCode: 'justrite' }], []);

        expect(plan.categoryIds).toEqual(['120']);
    });
});

describe('planWipe on a whole website with roots of its own (bodea)', () => {
    it("removes both stores' categories deepest first, leaving one that holds a category Demo Builder installed", async () => {
        const plan = await planWipeFor(sandbox({ products: [], customers: [] }).get, [{ websiteCode: 'bodea' }], PROJECT_RECORDS);

        expect(plan.categoryIds).toEqual(['152', '151', '161']);
        expect(plan.preview.left).toEqual([{ kind: 'categories', count: 1, names: ['Cables'], why: 'they hold a category Demo Builder installed' }]);
    });
});

describe('planWipe on one store of a website with two (bodea_store)', () => {
    const store = () => sandbox({ products: BODEA_PRODUCTS, customers: BODEA_CUSTOMERS, orders: [BODEA_OUTLET_ORDER] });

    it("deletes a product only in the store's categories, with a configurable's child, and takes one sold elsewhere off", async () => {
        const plan = await planWipeFor(store().get, BODEA_STORE, []);

        expect(plan.deleteSkus).toEqual(['BD-RACK', 'BD-CHAIR', 'BD-CHAIR-RED']);
        expect(plan.takeOff).toEqual([{ sku: 'BD-ALSO-ON-MAIN', websiteId: 3 }]);
    });

    it("leaves a product with no category as one whose demo can't be told, and one in the other store's categories", async () => {
        const { left } = (await planWipeFor(store().get, BODEA_STORE, [])).preview;

        expect(left).toContainEqual(expect.objectContaining({ kind: 'products', names: ['BD-NO-CATEGORY'], why: expect.stringMatching(/which demo they belong to can't be told/) }));
        expect(left).toContainEqual(expect.objectContaining({ kind: 'products', names: ['BD-CLEARANCE', 'BD-BOTH-STORES'], why: 'they are in the categories of a store not chosen' }));
    });

    it("clears only the chosen store's root, never the other store's", async () => {
        const plan = await planWipeFor(store().get, BODEA_STORE, []);

        expect(plan.categoryIds).toEqual(['152', '155', '151', '154']);
    });

    it('removes a customer made in the store, and leaves one made in the other, one who ordered there, and one made in the Admin', async () => {
        const s = store();

        const plan = await planWipeFor(s.get, BODEA_STORE, []);

        expect(plan.customerIds).toEqual(['90']);
        expect(plan.preview.left).toContainEqual(expect.objectContaining({ kind: 'customers', names: ['bd.outlet@example.com', 'bd.both@example.com'] }));
        expect(plan.preview.left).toContainEqual(expect.objectContaining({ kind: 'customers', names: ['bd.admin@example.com'] }));
        expect(s.reads.some((p) => p.startsWith('orders?') && p.includes(filterIn('customer_id', [90, 92])))).toBe(true);
    });

    it("never closes the other store's orders", async () => {
        expect((await planWipeFor(store().get, BODEA_STORE, [])).orders).toStrictEqual([]);
    });
});

describe('planWipe refusals', () => {
    it('names a website or store the store does not have', async () => {
        await expect(planWipeFor(sandbox().get, [{ websiteCode: 'nope' }], [])).rejects.toThrow(new WipeScopeError('The store has no website nope.'));
        await expect(planWipeFor(sandbox().get, [{ websiteCode: 'bodea', storeCode: 'nope' }], [])).rejects.toThrow(new WipeScopeError('The website bodea has no store nope.'));
    });
});

describe('withinPlan', () => {
    it('lets a plan through that takes the same or less, and stops one that takes more or other stores', async () => {
        const shown = await planWipeFor(sandbox().get, TEST_STORE, PROJECT_RECORDS);
        const less = await planWipeFor(sandbox({ products: [] }).get, TEST_STORE, PROJECT_RECORDS);
        const more = await planWipeFor(sandbox({ customers: [{ id: 99, email: 'new@example.com', firstname: 'N', lastname: 'W', website_id: 5 }] }).get, TEST_STORE, []);
        const other = await planWipeFor(sandbox().get, BODEA_STORE, []);

        expect(withinPlan(shown, shown)).toBe(true);
        expect(withinPlan(shown, less)).toBe(true);
        expect(withinPlan(shown, more)).toBe(false);
        expect(withinPlan(shown, other)).toBe(false);
        expect(less.preview.token).not.toBe(shown.preview.token);
    });

    it('stops a plan that would now close an order the list did not hold', async () => {
        const shown = await planWipeFor(sandbox().get, TEST_STORE, []);
        const order = { entity_id: 800, increment_id: '000000800', state: 'new', store_id: 6, items: [{ item_id: 1, qty_ordered: 1 }] };
        const now = await planWipeFor(sandbox({ orders: [order] }).get, TEST_STORE, []);

        expect(withinPlan(shown, now)).toBe(false);
    });
});
