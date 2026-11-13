/**
 * Clearing a demo's websites (datapack-engine step 10): the plan shown is carried out,
 * orders (each with its returns) first, then the reverse of install order; refusals are counted, and nothing is
 * written when the store would now clear something the SC was not shown.
 */

import { planWipeFor } from '@/features/data-installer/services/demoDataWipe/wipePlan';
import { WipeChangedError, clearShown, runWipe } from '@/features/data-installer/services/demoDataWipe/wipeRun';
import { RESET_RULE_CASES } from '../../../../helpers/resetRuleOrders';
import { PROJECT_RECORDS, sandbox, writesOf } from './wipe.testUtils';

const TEST_STORE = ['justrite_test_website'];

describe('runWipe', () => {
    it('closes orders, each with its returns, deletes customers, then products, takes shared products off the website, then categories', async () => {
        const [pending, , , withReturn] = RESET_RULE_CASES;
        const store = sandbox({ orders: [pending.order, withReturn.order], returns: withReturn.returns });
        const plan = await planWipeFor(store.get, TEST_STORE, { records: PROJECT_RECORDS });
        const stages: string[] = [];

        // Once per step, in order; a step reports again after each of its items (its count line).
        const outcome = await runWipe(store, plan, (stage) => stages.at(-1) !== stage && stages.push(stage), '2026-10-30');

        expect(writesOf(store.sent)).toEqual([
            { method: 'POST', path: 'orders/701/comments' },
            { method: 'POST', path: 'orders/701/cancel' },
            { method: 'POST', path: 'orders/704/comments' },
            { method: 'PUT', path: 'returns/40' },
            { method: 'POST', path: 'order/704/refund' },
            { method: 'DELETE', path: 'customers/70' },
            { method: 'DELETE', path: 'products/ZZ-ONLY-HERE' },
            { method: 'DELETE', path: 'products/ZZ-JACKET' },
            { method: 'DELETE', path: 'products/ZZ-JACKET-RED' },
            { method: 'DELETE', path: 'products/ZZ-SHARED-WITH-JUSTRITE/websites/5' },
        ]);
        expect(stages).toEqual(['Closing orders', 'Deleting customers', 'Deleting products', 'Removing products from websites']);
        // Kept records carry no reason any more (J1-3b), so the sentence no longer lists them.
        expect(outcome.sentence).toBe(
            'Removed 3 products and 1 customer from the website justrite_test_website. Canceled 1 order and refunded 1 order. Closed 1 return. ' +
                'Took 1 product other websites also sell off the chosen websites.',
        );
        expect(outcome.leftOpen).toStrictEqual([]);
    });

    // 2026-11-06: deleting every category deepest first sent one request each.
    it('deletes the top categories, and counts the one under one, which Commerce deletes with it', async () => {
        const store = sandbox({ products: [], customers: [] });
        const plan = await planWipeFor(store.get, ['bodea'], { records: PROJECT_RECORDS });

        const outcome = await runWipe(store, plan);

        expect(store.sent).toEqual([
            { method: 'DELETE', path: 'categories/151' },
            { method: 'DELETE', path: 'categories/161' },
        ]);
        expect(outcome.removed.categories).toBe(3);
    });

    it('holds back a category under one Commerce refused, naming both', async () => {
        const store = sandbox({ products: [], customers: [] }, (path) => path === 'categories/151');
        const plan = await planWipeFor(store.get, ['bodea'], { records: PROJECT_RECORDS });

        const outcome = await runWipe(store, plan);

        expect(outcome.removed.categories).toBe(1);
        expect(outcome.failed).toEqual([expect.objectContaining({ what: 'remove 1 of the categories', count: 2 })]);
    });

    it('carries on past a refusal and says exactly what could not be removed', async () => {
        const store = sandbox({}, (path) => path === 'products/ZZ-JACKET');
        const plan = await planWipeFor(store.get, TEST_STORE, { records: PROJECT_RECORDS });

        const outcome = await runWipe(store, plan);

        expect(outcome.removed).toMatchObject({ customers: 1, products: 2, takenOff: 1, cartRules: 0, rulesTakenOff: 0, categories: 0 });
        expect(outcome.failed).toEqual([{ what: 'remove 1 of the products', count: 1, first: 'ZZ-JACKET: Commerce answered 400: The product is in use.', step: 'products' }]);
        expect(outcome.sentence).toContain('Could not remove 1 of the products (ZZ-JACKET: Commerce answered 400: The product is in use.).');
    });

    it('names the orders it left open with a note, for the result to point to the Admin', async () => {
        const order = { entity_id: 802, increment_id: '000000802', state: 'payment_review', status: 'payment_review', store_id: 6, items: [{ item_id: 2, qty_ordered: 1, qty_invoiced: 1 }] };
        const store = sandbox({ products: [], customers: [], orders: [order] });

        const outcome = await runWipe(store, await planWipeFor(store.get, TEST_STORE, { records: [] }), () => undefined, '2026-11-13');

        expect(outcome.leftOpen).toEqual(['000000802']);
        expect(outcome.orders.commented).toBe(1);
    });
});

describe('clearShown', () => {
    it('writes nothing when the store would now clear something the SC was not shown', async () => {
        const shown = await planWipeFor(sandbox().get, TEST_STORE, { records: PROJECT_RECORDS });
        const store = sandbox({ customers: [{ id: 99, email: 'new@example.com', firstname: 'N', lastname: 'W', website_id: 5 }] });

        await expect(clearShown(store, shown, { records: PROJECT_RECORDS })).rejects.toThrow(WipeChangedError);
        expect(store.sent).toStrictEqual([]);
    });

    it('goes ahead when only things shown are gone since, as after the pack was removed', async () => {
        const shown = await planWipeFor(sandbox().get, TEST_STORE, { records: PROJECT_RECORDS });
        const store = sandbox({ products: [] });

        const outcome = await clearShown(store, shown, { records: PROJECT_RECORDS });

        expect(store.sent).toEqual([{ method: 'DELETE', path: 'customers/70' }]);
        expect(outcome.removed.customers).toBe(1);
    });
});
