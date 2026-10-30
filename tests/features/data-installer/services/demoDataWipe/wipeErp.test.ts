/**
 * "One action, ERP included" (owner, 2026-10-30): a wipe of stores whose website an ERP integration
 * sends to an ERP does not close those orders itself. The integration closes them (first), the wipe
 * does the rest, and the ERP is filled again from Commerce (last). Driven through the real plan and
 * clearing against the sandbox fake, with the integration's calls asserted by their arguments.
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
    'it must be updated before a wipe can close them: open the project justrite and update erp-integration ' +
    '(Update on its card, or update_integration), then check again';

/** The test store holding two orders (one with a return), and nothing else. */
const twoOrders = () => sandbox({ products: [], customers: [], orders: [PENDING.order, WITH_RETURN.order], returns: WITH_RETURN.returns });

describe('which websites the ERP integration routes', () => {
    it('asks its status and its settings for the chosen websites, and routes the ones that send orders', async () => {
        const { erp, client } = fakeErp();

        const route = await erp.route(['justrite_test_website', 'bodea']);

        expect(client.status).toHaveBeenCalledWith();
        expect(client.resolvedSettings).toHaveBeenCalledWith(['justrite_test_website', 'bodea']);
        expect(route).toEqual({ name: 'JustRite', websites: ['justrite_test_website'] });
        expect(await erp.route(['bodea'])).toBeUndefined();
    });

    it('holds the orders, naming the update, when the deployment cannot close by store', async () => {
        const { erp } = fakeErp({ status: STATUS_BEFORE });

        expect(await erp.route(['justrite_test_website'])).toEqual({ name: 'JustRite', websites: ['justrite_test_website'], held: UPDATE_FIRST });
    });

    it('holds every chosen website when it cannot be asked: the wipe never closes an order an ERP may hold', async () => {
        const unsigned = fakeErp({ refusal: 'Adobe sign-in required' });
        const failing = fakeErp();
        failing.client.status.mockRejectedValue(new Error('ERP status answered 500: down'));

        expect(await unsigned.erp.route(['bodea'])).toEqual({
            name: 'JustRite',
            websites: ['bodea'],
            held: 'it could not be asked (Adobe sign-in required), so a wipe cannot close them',
        });
        expect((await failing.erp.route(['bodea']))?.held).toBe('it could not be asked (ERP status answered 500: down), so a wipe cannot close them');
    });
});

describe('the plan, with the ERP integration serving the store', () => {
    it("puts the routed store's orders and their returns in the ERP part, counted, with its one line", async () => {
        const { erp } = fakeErp();

        const plan = await planWipeFor(twoOrders().get, TEST_STORE, [], erp);

        expect(plan.orders).toStrictEqual([]);
        expect(plan.returnIds).toStrictEqual([]);
        expect(plan.preview.erp).toEqual({
            integration: 'JustRite',
            websites: ['justrite_test_website'],
            orders: { count: 2, names: ['000000701', '000000704'] },
            line: '2 orders are handled by the ERP integration (JustRite): they will be closed there, removed from its ERP, and the ERP refreshed.',
        });
        expect(plan.preview.total).toBe(2);
    });

    it('keeps the orders of a website it does not route as the wipe\'s own', async () => {
        const { erp } = fakeErp();
        const store = sandbox({ products: [], customers: [], orders: [PENDING.order, BODEA_OUTLET_ORDER] });

        const plan = await planWipeFor(store.get, [...TEST_STORE, { websiteCode: 'bodea' }], [], erp);

        expect(plan.orders.map((o) => o.id)).toStrictEqual(['600']);
        expect(plan.erp?.orders).toStrictEqual([{ id: '701', number: '000000701' }]);
        expect(plan.erp?.stores).toStrictEqual(['justrite_test_store']);
    });

    it('leaves the orders, uncounted, and says the integration must be updated first', async () => {
        const { erp } = fakeErp({ status: STATUS_BEFORE });

        const { preview } = await planWipeFor(twoOrders().get, TEST_STORE, [], erp);

        expect(preview.total).toBe(0);
        expect(preview.erp?.held).toBe(UPDATE_FIRST);
        expect(preview.erp?.line).toBe(`2 orders handled by the ERP integration (JustRite) are left open: ${UPDATE_FIRST}.`);
    });
});

describe('clearing, with the ERP integration serving the store', () => {
    it('has the integration close the routed stores first, then refreshes its ERP, and says both with the counts merged', async () => {
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
        const shown = await planWipeFor(store.get, TEST_STORE, [], erp);
        const stages: string[] = [];

        const outcome = await clearShown(store, shown, [], { erp, report: (stage) => stages.push(stage) });

        expect(client.closeOrders).toHaveBeenCalledWith(['justrite_test_store'], expect.any(Function));
        expect(refill).toHaveBeenCalledWith(expect.any(Function));
        expect(store.sent).toStrictEqual([]);
        expect(at).toEqual({ close: 0, refill: 0 });
        expect(stages).toEqual(['Closing orders in the ERP', 'Refreshing the ERP']);
        expect(outcome.orders).toEqual({ cancelled: 1, refunded: 1, commented: 0, alreadyClosed: 0, returnsClosed: 1, failed: 0 });
        expect(outcome.erp).toEqual({ integration: 'JustRite', orderNumbers: ['000000701', '000000704'], removedFrom: ['Justrite ERP'], refreshed: true });
        expect(outcome.sentence).toBe(
            'Removed nothing from the store justrite_test_store. Canceled 1 order and refunded 1 order. Closed 1 return. ' +
                '2 of the orders were closed through the ERP integration (JustRite), and removed from Justrite ERP. ' +
                "JustRite's ERP was refreshed from Commerce.",
        );
    });

    it("closes a website it does not route itself, after the integration's close and before the refresh", async () => {
        const store = sandbox({ products: [], customers: [], orders: [PENDING.order, BODEA_OUTLET_ORDER] });
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
        const shown = await planWipeFor(store.get, [...TEST_STORE, { websiteCode: 'bodea' }], [], erp);

        await clearShown(store, shown, [], { erp });

        expect(client.closeOrders).toHaveBeenCalledWith(['justrite_test_store'], expect.any(Function));
        expect(at).toEqual({ close: 0, refill: store.sent.length });
        expect(store.sent.length).toBeGreaterThan(0);
        expect(writesOf(store.sent).filter((w) => w.path.startsWith('orders/'))).toEqual([
            { method: 'POST', path: 'orders/600/cancel' },
            { method: 'POST', path: 'orders/600/comments' },
        ]);
    });

    it('counts and names a close the integration could not make, carries on, and still refreshes', async () => {
        const store = twoOrders();
        const { erp, refill } = fakeErp({ close: async () => Promise.reject(new Error('ERP detach answered 500: Commerce timed out')) });
        const shown = await planWipeFor(store.get, TEST_STORE, [], erp);

        const outcome = await clearShown(store, shown, [], { erp });

        expect(outcome.orders.failed).toBe(2);
        expect(outcome.failed).toEqual([{ what: 'close 1 of the orders through the ERP integration (JustRite)', count: 2, first: 'ERP detach answered 500: Commerce timed out' }]);
        expect(outcome.sentence).toContain('Could not close 2 of the orders through the ERP integration (JustRite) (ERP detach answered 500: Commerce timed out).');
        expect(refill).toHaveBeenCalled();
    });

    it('names an ERP that kept its copies, and an order the integration could not close', async () => {
        const close = async () => ({
            ...STORE_CLOSE,
            closed: { ...STORE_CLOSE.closed, cancelled: 0, failed: [{ orderId: '000000701', error: 'order 000000701: cancel failed: Commerce answered 400' }] },
            erpRemoved: { justrite: 'unsupported' as const, accuform: { failed: 'the ERP answered 503' } },
        });
        const store = twoOrders();
        const { erp } = fakeErp({ close });

        const outcome = await clearShown(store, await planWipeFor(store.get, TEST_STORE, [], erp), [], { erp });

        expect(outcome.failed).toEqual([
            { what: 'close 1 of the orders through the ERP integration (JustRite)', count: 1, first: 'order 000000701: cancel failed: Commerce answered 400' },
        ]);
        expect(outcome.sentence).toContain('1 of the orders was closed through the ERP integration (JustRite).');
        expect(outcome.sentence).toContain('Justrite ERP keeps its copies of them: it must be updated to remove orders.');
        expect(outcome.sentence).toContain('Accuform ERP could not remove them (the ERP answered 503).');
    });

    it('asks the integration to close a served store with no open orders: its closed ones leave the ERP too', async () => {
        const closedBefore = RESET_RULE_CASES[4].order;
        const store = sandbox({ orders: [closedBefore] });
        const { erp, client } = fakeErp();

        await clearShown(store, await planWipeFor(store.get, TEST_STORE, [], erp), [], { erp });

        expect(client.closeOrders).toHaveBeenCalledWith(['justrite_test_store'], expect.any(Function));
        expect(writesOf(store.sent).filter((w) => w.path.startsWith('orders/'))).toStrictEqual([]);
    });

    it("says the ERP was not refreshed, and why", async () => {
        const { erp } = fakeErp({ refill: async () => ({ failed: 'Demo ERP: Commerce did not answer products' }) });
        const store = twoOrders();

        const outcome = await clearShown(store, await planWipeFor(store.get, TEST_STORE, [], erp), [], { erp });

        expect(outcome.erp?.refreshed).toBe(false);
        expect(outcome.sentence).toContain("JustRite's ERP was not refreshed from Commerce: Demo ERP: Commerce did not answer products.");
    });

    it('never asks an integration that must be updated first to close or refill: the orders are left open', async () => {
        const store = twoOrders();
        const { erp, client, refill } = fakeErp({ status: STATUS_BEFORE });

        const outcome = await clearShown(store, await planWipeFor(store.get, TEST_STORE, [], erp), [], { erp });

        expect(client.closeOrders).not.toHaveBeenCalled();
        expect(refill).not.toHaveBeenCalled();
        expect(store.sent).toStrictEqual([]);
        expect(outcome.sentence).toContain(`Left 2 orders the ERP integration (JustRite) handles open: ${UPDATE_FIRST}.`);
    });

    it('writes nothing when the integration can now close orders the list showed as left', async () => {
        const store = twoOrders();
        const held = await planWipeFor(store.get, TEST_STORE, [], fakeErp({ status: STATUS_BEFORE }).erp);
        const { erp, client } = fakeErp();

        await expect(clearShown(store, held, [], { erp })).rejects.toThrow(WipeChangedError);
        expect(client.closeOrders).not.toHaveBeenCalled();
        expect(store.sent).toStrictEqual([]);
    });
});
