/**
 * Commerce is the source system (owner, 2026-11-11, erp-order-close step 5): a wipe closes EVERY
 * demo order in the chosen stores itself, including those on websites an ERP integration sends to
 * an ERP. The ERP is brought in line AFTERWARDS (the integration's `erp/close-orders` for the routed
 * stores, then the refill), and a failure there is an ERP problem: the orders stay closed. Driven
 * through the real plan and clearing against the sandbox fake, with the integration's calls asserted
 * by their arguments.
 */

import { planWipeFor } from '@/features/data-installer/services/demoDataWipe/wipePlan';
import { WipeChangedError, clearShown } from '@/features/data-installer/services/demoDataWipe/wipeRun';
import { BODEA_OUTLET_ORDER } from '../../../../helpers/commerceWipeFixtures';
import { STATUS_BEFORE, STORE_CLOSE } from '../../../../helpers/erpWipeFixtures';
import { RESET_RULE_CASES } from '../../../../helpers/resetRuleOrders';
import { fakeErp } from './wipeErp.testUtils';
import { sandbox, writesOf } from './wipe.testUtils';

const TEST_STORE = [{ websiteCode: 'justrite_test_website', storeCode: 'justrite_test_store' }];
const [PENDING, , , WITH_RETURN] = RESET_RULE_CASES;
const UPDATE_FIRST =
    'it must be updated first. Open the project justrite and update erp-integration ' +
    '(Update on its card, or update_integration), then check again';
const CATEGORY_LEFT = 'Left 1 of the categories (Safety Cans): under root category 119, which the store justrite_store (website justrite) also shows.';

/** The test store holding two orders (one with a return), and nothing else. */
const twoOrders = () => sandbox({ products: [], customers: [], orders: [PENDING.order, WITH_RETURN.order], returns: WITH_RETURN.returns });

/** The order writes of a run, by path. */
const orderWrites = (sent: ReadonlyArray<{ method: string; path: string }>) =>
    writesOf(sent).filter((w) => /^orders?\//u.test(w.path) || w.path.startsWith('returns/'));

describe('which websites the ERP integration routes', () => {
    it('asks its status and its settings for the chosen websites, and routes the ones that send orders', async () => {
        const { erp, client } = fakeErp();

        const route = await erp.route(['justrite_test_website', 'bodea']);

        expect(client.status).toHaveBeenCalledWith();
        expect(client.resolvedSettings).toHaveBeenCalledWith(['justrite_test_website', 'bodea']);
        expect(route).toEqual({ name: 'JustRite', websites: ['justrite_test_website'] });
        expect(await erp.route(['bodea'])).toBeUndefined();
    });

    it('holds the ERP step, naming the update, when the deployment cannot close by store', async () => {
        const { erp } = fakeErp({ status: STATUS_BEFORE });

        expect(await erp.route(['justrite_test_website'])).toEqual({ name: 'JustRite', websites: ['justrite_test_website'], held: UPDATE_FIRST });
    });

    it('holds the ERP step for every chosen website when it cannot be asked', async () => {
        const unsigned = fakeErp({ refusal: 'Adobe sign-in required' });
        const failing = fakeErp();
        failing.client.status.mockRejectedValue(new Error('ERP status answered 500: down'));

        expect(await unsigned.erp.route(['bodea'])).toEqual({ name: 'JustRite', websites: ['bodea'], held: 'it could not be asked (Adobe sign-in required)' });
        expect((await failing.erp.route(['bodea']))?.held).toBe('it could not be asked (ERP status answered 500: down)');
    });
});

describe('the plan, with the ERP integration serving the store', () => {
    it("keeps the routed store's orders and their returns as the wipe's own, and says the ERP is brought in line after", async () => {
        const { erp } = fakeErp();

        const plan = await planWipeFor(twoOrders().get, TEST_STORE, { records: [], erp });

        expect(plan.orders.map((o) => o.id)).toStrictEqual(['701', '704']);
        expect(plan.preview.orders.returns).toEqual({ count: 1, names: ['R40'] });
        expect(plan.erp).toEqual({ route: { name: 'JustRite', websites: ['justrite_test_website'] }, stores: ['justrite_test_store'] });
        expect(plan.preview.erp).toEqual({
            integration: 'JustRite',
            websites: ['justrite_test_website'],
            line: 'The ERP integration (JustRite) serves these stores: its ERP is brought in line with Commerce after the clearing.',
        });
        expect(plan.preview.total).toBe(3);
    });

    it('names only the routed stores for the ERP step', async () => {
        const { erp } = fakeErp();
        const store = sandbox({ products: [], customers: [], orders: [PENDING.order, BODEA_OUTLET_ORDER] });

        const plan = await planWipeFor(store.get, [...TEST_STORE, { websiteCode: 'bodea' }], { records: [], erp });

        expect(plan.orders.map((o) => o.id).sort()).toStrictEqual(['600', '701']);
        expect(plan.erp?.stores).toStrictEqual(['justrite_test_store']);
    });

    it('still closes the orders when the integration must be updated, and says its ERP will not be brought in line', async () => {
        const { erp } = fakeErp({ status: STATUS_BEFORE });

        const { preview, orders } = await planWipeFor(twoOrders().get, TEST_STORE, { records: [], erp });

        expect(orders.map((o) => o.id)).toStrictEqual(['701', '704']);
        expect(preview.total).toBe(3);
        expect(preview.erp?.held).toBe(UPDATE_FIRST);
        expect(preview.erp?.line).toBe(`The ERP integration (JustRite) serves these stores, but ${UPDATE_FIRST}. Its ERP will not be brought in line.`);
    });
});

describe('clearing, with the ERP integration serving the store', () => {
    it("closes the routed store's orders in Commerce, then has the integration bring its ERP in line, then refills it", async () => {
        const store = twoOrders();
        const at: Record<string, number> = {};
        const { erp, client, refill } = fakeErp({
            close: async () => {
                at.close = store.sent.length;
                return STORE_CLOSE;
            },
        });
        refill.mockImplementation(async () => {
            at.refill = store.sent.length;
            return {};
        });
        const shown = await planWipeFor(store.get, TEST_STORE, { records: [], erp });
        const stages: string[] = [];

        const outcome = await clearShown(store, shown, { records: [], erp }, (stage) => stages.push(stage));

        const writes = orderWrites(store.sent);
        expect(writes.slice(0, 2)).toEqual([
            { method: 'POST', path: 'orders/701/comments' },
            { method: 'POST', path: 'orders/701/cancel' },
        ]);
        expect(writes).toContainEqual({ method: 'POST', path: 'order/704/refund' });
        expect(client.closeOrders).toHaveBeenCalledWith(['justrite_test_store'], expect.any(Function));
        expect(at).toEqual({ close: store.sent.length, refill: store.sent.length });
        expect([...new Set(stages)]).toEqual(['Closing orders', 'Updating the ERP', 'Refreshing the ERP']);
        expect(outcome.orders).toEqual({ cancelled: 1, refunded: 1, commented: 0, alreadyClosed: 0, returnsClosed: 1, failed: 0 });
        expect(outcome.failed).toStrictEqual([]);
        expect(outcome.erp).toEqual({ integration: 'JustRite', broughtInLine: true, removedFrom: ['Justrite ERP'], refreshed: true });
        expect(outcome.sentence).toBe(
            'Removed nothing from the store justrite_test_store. Canceled 1 order and refunded 1 order. Closed 1 return. ' +
                "JustRite's ERP was brought in line with Commerce. The stores' orders were removed from Justrite ERP. " +
                CATEGORY_LEFT,
        );
    });

    it('closes the orders of a website it does not route too, all before the ERP step', async () => {
        const store = sandbox({ products: [], customers: [], orders: [PENDING.order, BODEA_OUTLET_ORDER] });
        const at: Record<string, number> = {};
        const { erp, client } = fakeErp({
            close: async () => {
                at.close = store.sent.length;
                return STORE_CLOSE;
            },
        });
        const shown = await planWipeFor(store.get, [...TEST_STORE, { websiteCode: 'bodea' }], { records: [], erp });

        await clearShown(store, shown, { records: [], erp });

        expect(client.closeOrders).toHaveBeenCalledWith(['justrite_test_store'], expect.any(Function));
        expect(at.close).toBe(store.sent.length);
        expect(orderWrites(store.sent)).toEqual(
            expect.arrayContaining([
                { method: 'POST', path: 'orders/600/cancel' },
                { method: 'POST', path: 'orders/701/cancel' },
            ]),
        );
    });

    it('reports a failing ERP close as an ERP problem: the orders stay counted closed, and the refill still runs', async () => {
        const store = twoOrders();
        const { erp, refill } = fakeErp({ close: async () => Promise.reject(new Error('ERP detach answered 500: Commerce timed out')) });
        const shown = await planWipeFor(store.get, TEST_STORE, { records: [], erp });

        const outcome = await clearShown(store, shown, { records: [], erp });

        expect(outcome.orders).toEqual({ cancelled: 1, refunded: 1, commented: 0, alreadyClosed: 0, returnsClosed: 1, failed: 0 });
        expect(outcome.failed).toStrictEqual([]);
        expect(outcome.erp).toEqual({
            integration: 'JustRite',
            broughtInLine: false,
            problem: 'it could not be asked to (ERP detach answered 500: Commerce timed out)',
            removedFrom: [],
            refreshed: true,
        });
        expect(outcome.sentence).toContain("JustRite's ERP was not brought in line with Commerce: it could not be asked to (ERP detach answered 500: Commerce timed out).");
        expect(outcome.sentence).not.toContain('Could not close');
        expect(refill).toHaveBeenCalled();
    });

    it('names an ERP that kept its copies, and an order the integration could not finish, as ERP problems', async () => {
        const close = async () => ({
            ...STORE_CLOSE,
            closed: { ...STORE_CLOSE.closed, alreadyClosed: 1, failed: [{ orderId: '000000701', error: 'order 000000701: the ERP number clear failed: Commerce answered 400' }] },
            erpRemoved: { justrite: 'unsupported' as const, accuform: { failed: 'the ERP answered 503' } },
        });
        const store = twoOrders();
        const { erp } = fakeErp({ close });

        const outcome = await clearShown(store, await planWipeFor(store.get, TEST_STORE, { records: [], erp }), { records: [], erp });

        expect(outcome.failed).toStrictEqual([]);
        expect(outcome.orders.failed).toBe(0);
        expect(outcome.sentence).toContain(
            "JustRite's ERP was not brought in line with Commerce: it could not finish 1 of the orders (order 000000701: the ERP number clear failed: Commerce answered 400).",
        );
        expect(outcome.sentence).toContain('Justrite ERP keeps its copies of them: it must be updated to remove orders.');
        expect(outcome.sentence).toContain('Accuform ERP could not remove them (the ERP answered 503).');
    });

    it('brings the ERP in line for a served store with no open orders: its closed ones leave the ERP too', async () => {
        const closedBefore = RESET_RULE_CASES[4].order;
        const store = sandbox({ orders: [closedBefore] });
        const { erp, client } = fakeErp();

        await clearShown(store, await planWipeFor(store.get, TEST_STORE, { records: [], erp }), { records: [], erp });

        expect(client.closeOrders).toHaveBeenCalledWith(['justrite_test_store'], expect.any(Function));
        expect(orderWrites(store.sent)).toStrictEqual([]);
    });

    it('reports a refill that failed as an ERP problem', async () => {
        const { erp } = fakeErp({ refill: async () => ({ failed: 'Demo ERP: Commerce did not answer products' }) });
        const store = twoOrders();

        const outcome = await clearShown(store, await planWipeFor(store.get, TEST_STORE, { records: [], erp }), { records: [], erp });

        expect(outcome.erp?.refreshed).toBe(false);
        expect(outcome.erp?.broughtInLine).toBe(false);
        expect(outcome.orders.refunded).toBe(1);
        expect(outcome.sentence).toContain(
            "JustRite's ERP was not brought in line with Commerce: it was not filled again from Commerce (Demo ERP: Commerce did not answer products).",
        );
    });

    it('closes the orders when the integration must be updated first, never asks it, and says its ERP was not brought in line', async () => {
        const store = twoOrders();
        const { erp, client, refill } = fakeErp({ status: STATUS_BEFORE });

        const outcome = await clearShown(store, await planWipeFor(store.get, TEST_STORE, { records: [], erp }), { records: [], erp });

        expect(client.closeOrders).not.toHaveBeenCalled();
        expect(refill).not.toHaveBeenCalled();
        expect(orderWrites(store.sent)).toContainEqual({ method: 'POST', path: 'orders/701/cancel' });
        expect(outcome.orders).toEqual({ cancelled: 1, refunded: 1, commented: 0, alreadyClosed: 0, returnsClosed: 1, failed: 0 });
        expect(outcome.erp).toEqual({ integration: 'JustRite', broughtInLine: false, problem: UPDATE_FIRST, removedFrom: [], refreshed: false });
        expect(outcome.sentence).toContain(`JustRite's ERP was not brought in line with Commerce: ${UPDATE_FIRST}.`);
    });

    it('writes nothing when the integration could now be asked though the list said its ERP would not be brought in line', async () => {
        const store = twoOrders();
        const held = await planWipeFor(store.get, TEST_STORE, { records: [], erp: fakeErp({ status: STATUS_BEFORE }).erp });
        const { erp, client } = fakeErp();

        await expect(clearShown(store, held, { records: [], erp })).rejects.toThrow(WipeChangedError);
        expect(client.closeOrders).not.toHaveBeenCalled();
        expect(store.sent).toStrictEqual([]);
    });
});
