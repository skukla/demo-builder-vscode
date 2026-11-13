/**
 * The one reset rule for orders (owner, 2026-10-30; changed 2026-11-11, `.rptc/plans/erp-order-close/`),
 * shared with the ERP integration's reset: the example orders named as the owner named them, then the
 * edges. Every case asserts the calls sent to Commerce, in order, with their bodies. The reset's note
 * is always the first write to an order: the integration skips the events of an order whose history
 * carries it.
 */

import { planWipeFor } from '@/features/data-installer/services/demoDataWipe/wipePlan';
import { runWipe } from '@/features/data-installer/services/demoDataWipe/wipeRun';
import type { CommerceOrder, CommerceReturn } from '@/types/commerceWire';
import { EDGE_ORDERS } from '../../../../helpers/commerceWipeFixtures';
import { RESET_RULE_CASES, type ResetRuleCase } from '../../../../helpers/resetRuleOrders';
import { sandbox } from './wipe.testUtils';

const DAY = '2026-10-30';
const TEST_STORE = ['justrite_test_website'];
const CANCELED = `Canceled by the demo reset on ${DAY}.`;
const REFUNDED = `Refunded and closed by the demo reset on ${DAY}.`;
const PARTLY = `Refunded the invoiced items by the demo reset on ${DAY}.`;
const LEFT_OPEN = `Left open by the demo reset on ${DAY}: Commerce can neither cancel nor refund it.`;

function storeWith(orders: CommerceOrder[], returns: CommerceReturn[] = [], refuse?: (path: string) => boolean, answer?: (path: string, body: unknown) => unknown) {
    return sandbox({ products: [], customers: [], orders, returns }, refuse, answer);
}

const note = (id: number, comment: string) => ({
    method: 'POST',
    path: `orders/${id}/comments`,
    body: { statusHistory: { comment, is_customer_notified: 0, is_visible_on_front: 0 } },
});
const cancel = (id: number) => ({ method: 'POST', path: `orders/${id}/cancel` });
const invoice = (id: number) => ({ method: 'POST', path: `order/${id}/invoice`, body: { capture: false, notify: false } });
const closeReturn = ({ comments: _c, tracks: _t, ...header }: CommerceReturn) => ({
    method: 'PUT',
    path: `returns/${header.entity_id}`,
    body: { rmaDataObject: { ...header, items: [], status: 'closed' } },
});

/** The refund of everything invoiced: every line, once whatever was not invoiced has been. */
function refund(order: CommerceOrder, invoiced: boolean) {
    const qty = (n: number | undefined) => Number(n ?? 0);
    return {
        method: 'POST',
        path: `order/${order.entity_id}/refund`,
        body: {
            items: (order.items ?? []).map((i) => ({ order_item_id: i.item_id, qty: (invoiced ? qty(i.qty_ordered) - qty(i.qty_canceled) : qty(i.qty_invoiced)) - qty(i.qty_refunded) })),
            notify: false,
            arguments: { shipping_amount: order.base_shipping_invoiced ?? 0, adjustment_positive: 0, adjustment_negative: 0 },
        },
    };
}

/** What each example does, as calls to Commerce: its note first, then its returns, then the close. */
function expectedCalls(example: ResetRuleCase): unknown[] {
    const { order } = example;
    const id = order.entity_id;
    if (example.expected === 'untouched') return [];
    if (example.expected === 'canceled') return [note(id, CANCELED), cancel(id)];
    return [note(id, REFUNDED), ...example.returns.map(closeReturn), ...(example.invoices ? [invoice(id)] : []), refund(order, example.invoices === true)];
}

const planAndRun = async (store: ReturnType<typeof storeWith>) => runWipe(store, await planWipeFor(store.get, TEST_STORE, { records: [] }), undefined, DAY);

describe('the one reset rule for orders', () => {
    it.each(RESET_RULE_CASES.map((example) => [example.name, example] as const))('%s', async (_name, example) => {
        const store = storeWith([example.order], example.returns);

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });
        await runWipe(store, plan, undefined, DAY);

        expect(store.sent).toEqual(expectedCalls(example));
    });

    it('counts all seven in the check: 1 to cancel, 5 to refund, none left open, 1 return to close', async () => {
        const store = storeWith(
            RESET_RULE_CASES.map((c) => c.order),
            RESET_RULE_CASES.flatMap((c) => c.returns),
        );

        const { check, orders } = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(orders.filter((o) => o.action === 'cancel').map((o) => o.number)).toEqual(['000000701']);
        expect(orders.filter((o) => o.action === 'refund')).toHaveLength(5);
        expect(orders.filter((o) => o.action === 'note')).toStrictEqual([]);
        // Every closed order under orders, by number, in full (J1-3b); its return under returns.
        expect(check.records.orders.removed).toHaveLength(6);
        expect(check.records.orders.removed.slice(0, 4)).toEqual(['000000701', '000000702', '000000703', '000000704']);
        expect(check.records.returns).toEqual({ removed: ['R40'], kept: [] });
        expect(store.sent).toStrictEqual([]);
    });

    it("reads only the orders placed in the chosen stores' views, and those orders' returns", async () => {
        const store = storeWith([RESET_RULE_CASES[3].order], RESET_RULE_CASES[3].returns);

        await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(store.reads.filter((p) => p.startsWith('orders?') || p.startsWith('returns?')).map((p) => p.split('&fields')[0])).toEqual([
            'orders?searchCriteria[currentPage]=1&searchCriteria[pageSize]=100&searchCriteria[filterGroups][0][filters][0][field]=store_id&searchCriteria[filterGroups][0][filters][0][value]=6&searchCriteria[filterGroups][0][filters][0][conditionType]=in',
            'returns?searchCriteria[currentPage]=1&searchCriteria[pageSize]=100&searchCriteria[filterGroups][0][filters][0][field]=order_id&searchCriteria[filterGroups][0][filters][0][value]=704&searchCriteria[filterGroups][0][filters][0][conditionType]=in',
        ]);
    });
});

describe('the reset rule at its edges', () => {
    const [held, notedBefore, , configurable] = EDGE_ORDERS;
    const [pending, invoiced, , withReturn, , shippedNotInvoiced] = RESET_RULE_CASES;

    it('notes the order first, then releases its hold, then cancels it', async () => {
        const store = storeWith([held]);

        await planAndRun(store);

        expect(store.sent).toEqual([note(504, CANCELED), { method: 'POST', path: 'orders/504/unhold' }, cancel(504)]);
    });

    it("writes the note before anything else: before the return's close and before the invoice", async () => {
        const order = { ...shippedNotInvoiced.order, entity_id: 704, increment_id: '000000704' };
        const store = storeWith([order], withReturn.returns);

        const outcome = await planAndRun(store);

        expect(store.sent).toEqual([note(704, REFUNDED), closeReturn(withReturn.returns[0]), invoice(704), refund(order, true)]);
        expect(outcome.orders).toMatchObject({ refunded: 1, returnsClosed: 1, failed: 0 });
    });

    it('finishes an order a stopped run noted but did not close, without a second note', async () => {
        // 507 carries "Canceled by the demo reset on 2026-10-29." and is still new: the run stopped after its note.
        const store = storeWith([notedBefore]);

        const outcome = await planAndRun(store);

        expect(store.sent).toEqual([cancel(507)]);
        expect(outcome.orders).toMatchObject({ cancelled: 1, alreadyClosed: 0 });
    });

    it('finishes a refund a stopped run left at its return, without a second note', async () => {
        let stopped = true;
        const store = storeWith([withReturn.order], withReturn.returns, (path) => stopped && path.startsWith('returns/'));
        const first = await planAndRun(store);
        stopped = false;

        const second = await planAndRun(store);

        expect(first.failed).toEqual([{ what: 'close 1 of the orders', count: 1, first: '000000704: Commerce answered 400: The product is in use.', step: 'orders' }]);
        expect(store.sent).toEqual([
            note(704, REFUNDED),
            closeReturn(withReturn.returns[0]),
            closeReturn(withReturn.returns[0]),
            refund(withReturn.order, false),
        ]);
        expect(second.orders).toMatchObject({ refunded: 1, returnsClosed: 1, failed: 0 });
    });

    it('changes nothing the second time: every order is now Canceled or Closed, every return closed', async () => {
        const store = storeWith(RESET_RULE_CASES.map((c) => c.order), RESET_RULE_CASES.flatMap((c) => c.returns));
        await planAndRun(store);
        const written = store.sent.length;

        const again = await planWipeFor(store.get, TEST_STORE, { records: [] });
        await runWipe(store, again, undefined, DAY);

        expect(again.check.total).toBe(0);
        expect(again.alreadyClosed).toBe(7);
        expect(store.sent).toHaveLength(written);
        expect(store.data.orders.map((o) => o.state)).toEqual(['canceled', 'closed', 'closed', 'closed', 'closed', 'closed', 'closed']);
    });

    it('leaves an order in payment review open with a note, never invoicing or refunding it', async () => {
        const review = { ...shippedNotInvoiced.order, entity_id: 710, increment_id: '000000710', state: 'payment_review' };
        const store = storeWith([review]);

        const outcome = await planAndRun(store);

        expect(store.sent).toEqual([note(710, LEFT_OPEN)]);
        expect(outcome.orders).toMatchObject({ commented: 1, refunded: 0 });
    });

    it('leaves an order in payment review untouched the second time: its note says it was left open', async () => {
        const review = { ...invoiced.order, entity_id: 710, increment_id: '000000710', state: 'payment_review' };
        const store = storeWith([review]);
        await planAndRun(store);

        const again = await planWipeFor(store.get, TEST_STORE, { records: [] });
        await runWipe(store, again, undefined, DAY);

        expect(store.sent).toEqual([note(710, LEFT_OPEN)]);
        expect(again.orders).toStrictEqual([]);
        expect(again.alreadyClosed).toBe(1);
    });

    it("answers the counts by the ERP reset's names", async () => {
        const store = storeWith(RESET_RULE_CASES.map((c) => c.order), RESET_RULE_CASES.flatMap((c) => c.returns));

        const outcome = await planAndRun(store);

        expect(outcome.orders).toEqual({ cancelled: 1, refunded: 5, commented: 0, alreadyClosed: 1, returnsClosed: 1, failed: 0 });
        expect(outcome.sentence).toContain('Canceled 1 order and refunded 5 orders. Closed 1 return.');
    });

    it("refunds a configurable's line, never its child's", async () => {
        const store = storeWith([configurable]);

        await planAndRun(store);

        expect(store.sent).toContainEqual({
            method: 'POST',
            path: 'order/509/refund',
            body: { items: [{ order_item_id: 12, qty: 1 }], notify: false, arguments: { shipping_amount: 0, adjustment_positive: 0, adjustment_negative: 0 } },
        });
    });

    it('adds the left-open note after a cancel Commerce answers with false, as the ERP reset does', async () => {
        const store = storeWith([pending.order], [], undefined, (path) => !path.endsWith('/cancel'));

        const outcome = await planAndRun(store);

        expect(store.sent).toEqual([note(701, CANCELED), cancel(701), note(701, LEFT_OPEN)]);
        expect(outcome.orders).toMatchObject({ cancelled: 0, commented: 1 });
    });

    it('adds a correcting note when Commerce keeps a refunded order open', async () => {
        // Commerce takes the refund but the order reads back still processing.
        const store = storeWith([invoiced.order], [], undefined, (path) => (path.endsWith('/refund') ? 9001 : true));

        const outcome = await planAndRun(store);

        expect(store.sent).toEqual([note(702, REFUNDED), refund(invoiced.order, false), note(702, PARTLY)]);
        expect(outcome.orders).toMatchObject({ refunded: 1, failed: 0 });
    });

    it("counts a return Commerce kept open as the order's failure, and refunds nothing", async () => {
        // Commerce answers the save but keeps the return as it was: the read back says so.
        const store = storeWith([withReturn.order], withReturn.returns, undefined, () => true);

        const outcome = await planAndRun(store);

        expect(store.sent).toEqual([note(704, REFUNDED), closeReturn(withReturn.returns[0])]);
        expect(outcome.failed).toContainEqual({ what: 'close 1 of the orders', count: 1, first: '000000704: Commerce kept return R40 authorized', step: 'orders' });
        expect(outcome.orders).toMatchObject({ failed: 1, returnsClosed: 0, refunded: 0 });
    });

    it('reads a store without returns as an order having none', async () => {
        const store = sandbox({ products: [], customers: [], orders: [invoiced.order] });

        const plan = await planWipeFor(store.get, TEST_STORE, { records: [] });

        expect(plan.orders.map((o) => o.returns)).toStrictEqual([[]]);
        expect(plan.check.records.returns).toBeUndefined();
    });
});
