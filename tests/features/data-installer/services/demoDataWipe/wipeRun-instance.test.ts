/**
 * Clearing the instance-wide kinds: asserted by the ORDER and arguments of the writes. Companies go
 * before their customers (Commerce refuses an admin's delete while the company stands), customers
 * before their catalog and group (nobody lands in General), products before their set. A failed write
 * holds back what needs it, the rest carry on, and a second clearing picks up what is left.
 */

import { planWipeFor } from '@/features/data-installer/services/demoDataWipe/wipePlan';
import { clearShown, runWipe } from '@/features/data-installer/services/demoDataWipe/wipeRun';
import { ADMIN_64, BUYER_65, CATALOG_20, COMPANY_28, LONE_SHOPPER, WIPER_1, WIPER_2, attributeInstance, b2bInstance, settingsInstance } from '../../../../helpers/commerceWipeInstanceFixtures';
import { DELETE_COMPANY_ADMIN_REFUSED_DB08 } from '../../../../helpers/commerceB2bFixtures';
import { REFUSED_SETTING, sandbox, writesOf } from './wipe.testUtils';

const TEST_STORE = [{ websiteCode: 'justrite_test_website', storeCode: 'justrite_test_store' }];
const B2B = { products: [], orders: [], customers: [ADMIN_64, BUYER_65] };

describe('runWipe, the B2B kinds', () => {
    it('deletes the company, then its customers, then the catalog, then its group, and moves nobody to General', async () => {
        const store = sandbox({ ...B2B, instance: b2bInstance() });
        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });
        const stages: string[] = [];

        const outcome = await runWipe(store, plan, (stage) => stages.at(-1) !== stage && stages.push(stage));

        expect(writesOf(store.sent)).toEqual([
            { method: 'DELETE', path: 'company/28' },
            { method: 'DELETE', path: 'customers/64' },
            { method: 'DELETE', path: 'customers/65' },
            { method: 'DELETE', path: 'sharedCatalog/20' },
            { method: 'DELETE', path: 'customerGroups/25' },
        ]);
        expect(store.data.instance?.movedToGeneral).toStrictEqual([]);
        expect(stages).toEqual(['Deleting companies', 'Deleting customers', 'Deleting shared catalogs']);
        expect(outcome.removed).toMatchObject({ companies: 1, customers: 2, catalogs: 1, customerGroups: 0 });
        expect(outcome.failed).toStrictEqual([]);
        expect(outcome.unfinished).toBeUndefined();
        expect(outcome.sentence).toBe(
            'Removed 2 customers, 1 company and 1 shared catalog with its customer group from the store justrite_test_store. ' +
                'Left 1 of the categories (Safety Cans): under root category 119, which the store justrite_store (website justrite) also shows.',
        );
    });

    it('holds back its customers and catalog when the company delete is refused, writing none of them', async () => {
        const store = sandbox({ ...B2B, instance: b2bInstance() }, (path) => path === 'company/28');
        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        const outcome = await runWipe(store, plan);

        expect(writesOf(store.sent)).toEqual([{ method: 'DELETE', path: 'company/28' }]);
        expect(store.data.instance?.movedToGeneral).toStrictEqual([]);
        expect(outcome.removed).toMatchObject({ companies: 0, customers: 0, catalogs: 0 });
        expect(outcome.failed.map((f) => [f.what, f.count])).toEqual([
            ['remove 1 of the companies', 1],
            ['remove 1 of the customers', 2],
            ['remove 1 of the shared catalogs', 1],
        ]);
        expect(outcome.sentence).toContain('Could not remove 2 of the customers (64: held back, since what it needs gone first could not be removed).');
    });

    it('holds the catalog back when one customer delete is refused, so that customer is not moved to General', async () => {
        const store = sandbox({ ...B2B, instance: b2bInstance() }, (path) => path === 'customers/65');
        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        const outcome = await runWipe(store, plan);

        expect(writesOf(store.sent)).toEqual([
            { method: 'DELETE', path: 'company/28' },
            { method: 'DELETE', path: 'customers/64' },
            { method: 'DELETE', path: 'customers/65' },
        ]);
        expect(store.data.instance?.movedToGeneral).toStrictEqual([]);
        expect(outcome.removed).toMatchObject({ companies: 1, customers: 1, catalogs: 0 });
        expect(outcome.unfinished).toEqual({ scopeKey: 'justrite_test_website/justrite_test_store', groups: [25], sets: [], attributes: [] });
    });

    it('has the admin refused, as Commerce did live, only if the company were still there: the order is what avoids it', async () => {
        const store = sandbox({ ...B2B, instance: b2bInstance() });

        await expect(store.send('DELETE', 'customers/64')).rejects.toThrow(DELETE_COMPANY_ADMIN_REFUSED_DB08.message);
    });

    it('takes the group when a catalog delete already took it, as Commerce did live', async () => {
        const store = sandbox({ ...B2B, instance: b2bInstance() });
        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        const outcome = await runWipe(store, plan);

        expect(store.data.instance?.groups.map((g) => g.id)).toEqual([30]);
        expect(outcome.failed).toStrictEqual([]);
    });

    it('deletes a group with no catalog after its customer', async () => {
        const store = sandbox({ products: [], orders: [], customers: [LONE_SHOPPER], instance: b2bInstance({ companies: [], hierarchies: {} }) });
        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        const outcome = await runWipe(store, plan);

        expect(writesOf(store.sent)).toEqual([
            { method: 'DELETE', path: 'customers/70' },
            { method: 'DELETE', path: 'customerGroups/30' },
        ]);
        expect(outcome.removed.customerGroups).toBe(1);
    });

    it('picks up on a second clearing what a refused catalog delete left, and what its customers no longer tie to anything', async () => {
        const store = sandbox({ ...B2B, instance: b2bInstance() }, (path) => path === 'sharedCatalog/20');
        const first = await runWipe(store, await planWipeFor(store.get, TEST_STORE, { records: [] }));
        expect(first.unfinished?.groups).toEqual([25]);
        expect(first.removed).toMatchObject({ companies: 1, customers: 2, catalogs: 0 });

        // Nothing ties the catalog to these stores now: without the note it would never be seen again.
        const forgotten = await planWipeFor(store.get, TEST_STORE, { records: [] });
        expect(forgotten.groups).toStrictEqual([]);

        const again = sandboxAfter(store);
        const second = await runWipe(again, await planWipeFor(again.get, TEST_STORE, { records: [], unfinished: first.unfinished }));
        expect(second.removed.catalogs).toBe(1);
        expect(second.unfinished).toBeUndefined();
        expect(again.sent).toContainEqual({ method: 'DELETE', path: `sharedCatalog/${CATALOG_20.id}` });
    });

    it('leaves nothing to do when run again after a clean clearing: the plan is empty', async () => {
        const store = sandbox({ ...B2B, instance: b2bInstance() });
        await runWipe(store, await planWipeFor(store.get, TEST_STORE, { records: [] }));

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.preview.total).toBe(0);
    });
});

describe('runWipe, sets and attributes', () => {
    const ATTRIBUTES = { customers: [], orders: [], products: [WIPER_1, WIPER_2] };

    it('deletes the products, then the set, then the attribute', async () => {
        const store = sandbox({ ...ATTRIBUTES, instance: attributeInstance() });

        const outcome = await runWipe(store, await planWipeFor(store.get, TEST_STORE, { records: [] }));

        expect(writesOf(store.sent)).toEqual([
            { method: 'DELETE', path: 'products/ZZ-WIPER-1' },
            { method: 'DELETE', path: 'products/ZZ-WIPER-2' },
            { method: 'DELETE', path: 'products/attribute-sets/40' },
            { method: 'DELETE', path: 'products/attributes/wiper_size' },
        ]);
        expect(outcome.removed).toMatchObject({ products: 2, attributeSets: 1, attributes: 1 });
    });

    it('holds back the set and attribute when a product delete is refused, since deleting the set would delete the product', async () => {
        const store = sandbox({ ...ATTRIBUTES, instance: attributeInstance() }, (path) => path === 'products/ZZ-WIPER-2');

        const outcome = await runWipe(store, await planWipeFor(store.get, TEST_STORE, { records: [] }));

        expect(store.sent.some((w) => w.path.startsWith('products/attribute-sets') || w.path.startsWith('products/attributes'))).toBe(false);
        expect(outcome.removed).toMatchObject({ products: 1, attributeSets: 0, attributes: 0 });
        expect(outcome.unfinished).toMatchObject({ sets: [40], attributes: ['wiper_size'] });
    });

    it('still deletes the rest past a refused attribute, and names it', async () => {
        const store = sandbox({ ...ATTRIBUTES, instance: attributeInstance() }, (path) => path === 'products/attributes/wiper_size');

        const outcome = await runWipe(store, await planWipeFor(store.get, TEST_STORE, { records: [] }));

        expect(outcome.removed.attributeSets).toBe(1);
        expect(outcome.failed[0]).toMatchObject({ what: 'remove 1 of the attributes', count: 1 });
        expect(outcome.unfinished).toMatchObject({ attributes: ['wiper_size'] });
    });
});

describe('runWipe, website settings', () => {
    const NOTHING = { customers: [], orders: [], products: [] };

    it('writes them last, at website scope, and says what Commerce cannot do about them', async () => {
        const store = sandbox({ ...NOTHING, instance: settingsInstance() });
        const stages: string[] = [];

        const outcome = await runWipe(store, await planWipeFor(store.get, TEST_STORE, { records: [] }), (stage) => stages.at(-1) !== stage && stages.push(stage));

        expect(stages).toEqual(['Restoring default configuration']);
        expect(outcome.removed.settings).toBe(1);
        expect(outcome.sentence).toContain("Set 1 website setting to the default's value. Commerce can't clear a website's own value, so a later change to the default won't reach it.");
        expect(outcome.failed).toEqual([{ what: 'set 1 of the website settings back', count: 1, first: expect.stringContaining(REFUSED_SETTING) }]);
    });

    it('reads the same as the default afterwards, so a second clearing has only the setting Commerce refused', async () => {
        const store = sandbox({ ...NOTHING, instance: settingsInstance() });
        await runWipe(store, await planWipeFor(store.get, TEST_STORE, { records: [] }));

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.settings.map((s) => s.path)).toEqual([REFUSED_SETTING]);
    });
});

describe('what is said afterwards', () => {
    it('names what stayed, kind by kind, with why', async () => {
        const store = sandbox({ products: [], orders: [], customers: [ADMIN_64, { ...BUYER_65, website_id: 2 }], instance: b2bInstance() });

        const outcome = await runWipe(store, await planWipeFor(store.get, TEST_STORE, { records: [] }));

        expect(outcome.left).toContainEqual(expect.objectContaining({ kind: 'companies', names: [COMPANY_28.company_name] }));
        expect(outcome.sentence).toContain(`Left 1 of the companies (${COMPANY_28.company_name}): a customer in them is on a website not chosen.`);
    });
});

describe('clearShown', () => {
    it('writes nothing when a company has come within reach since the list was made', async () => {
        const shown = await planWipeFor(sandbox({ ...B2B, customers: [], instance: b2bInstance() }).get, TEST_STORE, { records: [] });
        const store = sandbox({ ...B2B, instance: b2bInstance() });

        await expect(clearShown(store, shown, { records: [] })).rejects.toThrow('Commerce changed since the list was made');
        expect(store.sent).toStrictEqual([]);
    });
});

/** The same store, every write forgiven: a retry once what refused has been fixed. */
function sandboxAfter(store: ReturnType<typeof sandbox>): ReturnType<typeof sandbox> {
    return sandbox({ customers: store.data.customers, products: store.data.products, orders: store.data.orders, instance: store.data.instance });
}
