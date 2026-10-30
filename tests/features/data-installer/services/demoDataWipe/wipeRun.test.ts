/**
 * Clearing a demo's part of the store (datapack-engine step 10): the plan shown is carried out,
 * orders and returns first, then the reverse of install order; refusals are counted, and nothing is
 * written when the store would now clear something the SC was not shown.
 */

import { planWipeFor } from '@/features/data-installer/services/demoDataWipe/wipePlan';
import { WipeChangedError, clearShown, runWipe } from '@/features/data-installer/services/demoDataWipe/wipeRun';
import { RESET_RULE_CASES } from '../../../../helpers/resetRuleOrders';
import { PROJECT_RECORDS, sandbox, writesOf } from './wipe.testUtils';

const TEST_STORE = [{ websiteCode: 'justrite_test_website', storeCode: 'justrite_test_store' }];

describe('runWipe', () => {
    it('closes returns and orders, deletes customers, then products, takes shared products off the website, then categories', async () => {
        const [pending, , , withReturn] = RESET_RULE_CASES;
        const store = sandbox({ orders: [pending.order, withReturn.order], returns: withReturn.returns });
        const plan = await planWipeFor(store.get, TEST_STORE, PROJECT_RECORDS);
        const stages: string[] = [];

        const outcome = await runWipe(store, plan, (stage) => stages.push(stage), '2026-10-30');

        expect(writesOf(store.sent)).toEqual([
            { method: 'PUT', path: 'returns/40' },
            { method: 'POST', path: 'orders/701/cancel' },
            { method: 'POST', path: 'orders/701/comments' },
            { method: 'POST', path: 'order/704/refund' },
            { method: 'POST', path: 'orders/704/comments' },
            { method: 'DELETE', path: 'customers/70' },
            { method: 'DELETE', path: 'products/ZZ-ONLY-HERE' },
            { method: 'DELETE', path: 'products/ZZ-JACKET' },
            { method: 'DELETE', path: 'products/ZZ-JACKET-RED' },
            { method: 'DELETE', path: 'products/ZZ-SHARED-WITH-JUSTRITE/websites/5' },
        ]);
        expect(stages).toEqual(['Closing returns', 'Closing orders', 'Removing customers', 'Removing products', 'Taking products off sites']);
        expect(outcome.sentence).toBe(
            'Removed 3 products and 1 customer from the store justrite_test_store. Canceled 1 order and refunded 1 order. Closed 1 return. ' +
                'Took 1 product other websites also sell off the chosen websites.',
        );
    });

    it('deletes categories deepest first', async () => {
        const store = sandbox({ products: [], customers: [] });
        const plan = await planWipeFor(store.get, [{ websiteCode: 'bodea', storeCode: 'bodea_store' }], PROJECT_RECORDS);

        await runWipe(store, plan);

        expect(store.sent).toEqual([
            { method: 'DELETE', path: 'categories/152' },
            { method: 'DELETE', path: 'categories/151' },
        ]);
    });

    it('carries on past a refusal and says exactly what could not be removed', async () => {
        const store = sandbox({}, (path) => path === 'products/ZZ-JACKET');
        const plan = await planWipeFor(store.get, TEST_STORE, PROJECT_RECORDS);

        const outcome = await runWipe(store, plan);

        expect(outcome.removed).toEqual({ customers: 1, products: 2, takenOff: 1, cartRules: 0, rulesTakenOff: 0, categories: 0 });
        expect(outcome.failed).toEqual([{ what: 'remove 1 of the products', count: 1, first: 'ZZ-JACKET: Commerce answered 400: The product is in use.' }]);
        expect(outcome.sentence).toContain('Could not remove 1 of the products (ZZ-JACKET: Commerce answered 400: The product is in use.).');
    });
});

describe('clearShown', () => {
    it('writes nothing when the store would now clear something the SC was not shown', async () => {
        const shown = await planWipeFor(sandbox().get, TEST_STORE, PROJECT_RECORDS);
        const store = sandbox({ customers: [{ id: 99, email: 'new@example.com', firstname: 'N', lastname: 'W', website_id: 5 }] });

        await expect(clearShown(store, shown, PROJECT_RECORDS)).rejects.toThrow(WipeChangedError);
        expect(store.sent).toStrictEqual([]);
    });

    it('goes ahead when only things shown are gone since, as after the pack was removed', async () => {
        const shown = await planWipeFor(sandbox().get, TEST_STORE, PROJECT_RECORDS);
        const store = sandbox({ products: [] });

        const outcome = await clearShown(store, shown, PROJECT_RECORDS);

        expect(store.sent).toEqual([{ method: 'DELETE', path: 'customers/70' }]);
        expect(outcome.removed.customers).toBe(1);
    });
});
