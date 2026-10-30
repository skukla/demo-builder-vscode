/**
 * What clearing a demo's part of the store would remove (datapack-engine step 10): only what is the
 * chosen website's alone and that Demo Builder did not install, decided from reads, writing nothing.
 */

import { filterBy } from '@/features/data-installer/services/demoBuilderEngine/b2bReads';
import { NEVER_TOUCHED, planWipe, withinPlan } from '@/features/data-installer/services/demoDataWipe/wipePlan';
import { WipeScopeError } from '@/features/data-installer/services/demoDataWipe/wipeReads';
import { PROJECT_RECORDS, sandbox } from './wipe.testUtils';

const TEST_SITE = 'justrite_test_website';

describe('planWipe on a website that shares its root category (justrite_test_website)', () => {
    it('removes products sold only there, takes shared ones off it, and leaves a lone variant', async () => {
        const store = sandbox();

        const plan = await planWipe(store.get, TEST_SITE, PROJECT_RECORDS);

        expect(plan.deleteSkus).toEqual(['ZZ-ONLY-HERE', 'ZZ-JACKET', 'ZZ-JACKET-RED']);
        expect(plan.takeOffSkus).toEqual(['ZZ-SHARED-WITH-JUSTRITE']);
        expect(plan.preview.left).toContainEqual(expect.objectContaining({ kind: 'products', count: 1, names: ['ZZ-LONE-VARIANT'] }));
    });

    it('leaves every category under the root JustRite also shows, and says so', async () => {
        const plan = await planWipe(sandbox().get, TEST_SITE, PROJECT_RECORDS);

        expect(plan.categoryIds).toStrictEqual([]);
        expect(plan.preview.left).toContainEqual({ kind: 'categories', count: 1, names: ['Safety Cans'], why: 'under root category 119, which justrite also shows' });
    });

    it("takes only this website's customers, leaving one in a B2B company and the one Demo Builder made", async () => {
        const plan = await planWipe(sandbox().get, TEST_SITE, PROJECT_RECORDS);

        expect(plan.customerIds).toEqual(['70']);
        expect(plan.preview.left).toContainEqual(expect.objectContaining({ kind: 'customers', names: ['zz.admin@example.com'] }));
    });

    it('never names what an install record lists, and counts those apart', async () => {
        const plan = await planWipe(sandbox().get, TEST_SITE, PROJECT_RECORDS);

        expect(plan.deleteSkus).not.toContain('ZZ-MADE-BY-DEMO-BUILDER');
        expect(plan.preview.installed).toEqual({ products: 1, customers: 1, categories: 1 });
    });

    it('reads the website by its id, writes nothing, and answers counts and a few names, never rows', async () => {
        const store = sandbox();

        const { preview } = await planWipe(store.get, TEST_SITE, PROJECT_RECORDS);

        expect(store.sent).toStrictEqual([]);
        expect(store.reads.some((p) => p.startsWith('products?') && p.includes(filterBy('website_id', 5)))).toBe(true);
        expect(store.reads.some((p) => p.startsWith('customers/search?') && p.includes(filterBy('website_id', 5)))).toBe(true);
        expect(preview).toMatchObject({
            website: { code: TEST_SITE, name: 'JustRite Test' },
            remove: { products: { count: 3, names: ['ZZ-ONLY-HERE', 'ZZ-JACKET', 'ZZ-JACKET-RED'] }, categories: { count: 0, names: [] }, customers: { count: 1, names: ['zz.shopper@example.com'] } },
            takenOff: { count: 1, names: ['ZZ-SHARED-WITH-JUSTRITE'] },
            total: 5,
            never: NEVER_TOUCHED,
        });
    });

    it('leaves a product whose websites or visibility Commerce did not answer', async () => {
        const store = sandbox({ products: [{ id: 1, sku: 'ZZ-NO-FIELDS', extension_attributes: { website_ids: [5] } }] });

        const plan = await planWipe(store.get, TEST_SITE, []);

        expect(plan.deleteSkus).toStrictEqual([]);
        expect(plan.preview.left.filter((l) => l.kind === 'products')).toEqual([expect.objectContaining({ names: ['ZZ-NO-FIELDS'] })]);
    });
});

describe('planWipe on a website with a root of its own (bodea)', () => {
    it('removes its categories deepest first, leaving one that holds a category Demo Builder installed', async () => {
        const plan = await planWipe(sandbox({ products: [], customers: [] }).get, 'bodea', PROJECT_RECORDS);

        expect(plan.categoryIds).toEqual(['152', '151']);
        expect(plan.preview.left).toEqual([{ kind: 'categories', count: 1, names: ['Cables'], why: 'they hold a category Demo Builder installed' }]);
    });
});

describe('planWipe refusals', () => {
    it('names a website the store does not have', async () => {
        await expect(planWipe(sandbox().get, 'nope', [])).rejects.toThrow(new WipeScopeError('The store has no website nope.'));
    });
});

describe('withinPlan', () => {
    it('lets a plan through that takes the same or less, and stops one that takes more or another website', async () => {
        const shown = await planWipe(sandbox().get, TEST_SITE, PROJECT_RECORDS);
        const less = await planWipe(sandbox({ products: [] }).get, TEST_SITE, PROJECT_RECORDS);
        const more = await planWipe(sandbox({ customers: [{ id: 99, email: 'new@example.com', firstname: 'N', lastname: 'W', website_id: 5 }] }).get, TEST_SITE, []);
        const other = await planWipe(sandbox().get, 'bodea', []);

        expect(withinPlan(shown, shown)).toBe(true);
        expect(withinPlan(shown, less)).toBe(true);
        expect(withinPlan(shown, more)).toBe(false);
        expect(withinPlan(shown, other)).toBe(false);
        expect(less.preview.token).not.toBe(shown.preview.token);
    });
});
