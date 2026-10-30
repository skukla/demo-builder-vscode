/**
 * The one reset rule for orders (owner, 2026-10-30), shared with the ERP integration's reset: the
 * five example orders named as the owner named them, then the edges. Every case asserts the calls
 * sent to Commerce, with their bodies.
 */

import { planWipeFor } from '@/features/data-installer/services/demoDataWipe/wipePlan';
import { runWipe } from '@/features/data-installer/services/demoDataWipe/wipeRun';
import type { CommerceOrder, CommerceReturn } from '@/types/commerceWire';
import { EDGE_ORDERS } from '../../../../helpers/commerceWipeFixtures';
import { RESET_RULE_CASES, type ResetRuleCase } from '../../../../helpers/resetRuleOrders';
import { sandbox } from './wipe.testUtils';

const DAY = '2026-10-30';
const TEST_STORE = [{ websiteCode: 'justrite_test_website', storeCode: 'justrite_test_store' }];

function storeWith(orders: CommerceOrder[], returns: CommerceReturn[] = [], refuse?: (path: string) => boolean, answer?: (path: string, body: unknown) => unknown) {
    return sandbox({ products: [], customers: [], orders, returns }, refuse, answer);
}

const note = (id: number, comment: string) => ({
    method: 'POST',
    path: `orders/${id}/comments`,
    body: { statusHistory: { comment, is_customer_notified: 0, is_visible_on_front: 0 } },
});

/** What each example does, as calls to Commerce. */
function expectedCalls(example: ResetRuleCase): unknown[] {
    const { order } = example;
    const id = order.entity_id;
    if (example.expected === 'untouched') return [];
    if (example.expected === 'canceled') return [{ method: 'POST', path: `orders/${id}/cancel` }, note(id, `Canceled by the demo reset on ${DAY}.`)];
    if (example.expected === 'noted') return [note(id, `Left open by the demo reset on ${DAY}: Commerce can neither cancel nor refund it.`)];
    const closeReturn = example.returns.map(({ comments: _c, tracks: _t, ...header }) => ({
        method: 'PUT',
        path: `returns/${header.entity_id}`,
        body: { rmaDataObject: { ...header, items: [], status: 'closed' } },
    }));
    const item = order.items?.[0];
    const refund = {
        method: 'POST',
        path: `order/${id}/refund`,
        body: {
            items: [{ order_item_id: item?.item_id, qty: item?.qty_invoiced }],
            notify: false,
            arguments: { shipping_amount: order.base_shipping_invoiced ?? 0, adjustment_positive: 0, adjustment_negative: 0 },
        },
    };
    const said = example.staysOpen ? `Refunded the invoiced items by the demo reset on ${DAY}.` : `Refunded and closed by the demo reset on ${DAY}.`;
    return [...closeReturn, refund, note(id, said)];
}

describe('the one reset rule for orders', () => {
    it.each(RESET_RULE_CASES.map((example) => [example.name, example] as const))('%s', async (_name, example) => {
        const store = storeWith([example.order], example.returns);

        const plan = await planWipeFor(store.get, TEST_STORE, []);
        await runWipe(store, plan, undefined, DAY);

        expect(store.sent).toEqual(expectedCalls(example));
    });

    it('counts all seven in the check: 1 to cancel, 4 to refund, 1 to leave open, 1 return to close', async () => {
        const store = storeWith(
            RESET_RULE_CASES.map((c) => c.order),
            RESET_RULE_CASES.flatMap((c) => c.returns),
        );

        const { preview } = await planWipeFor(store.get, TEST_STORE, []);

        expect(preview.orders).toEqual({
            cancel: { count: 1, names: ['000000701'] },
            refund: { count: 4, names: ['000000702', '000000703', '000000704'] },
            leftOpen: { count: 1, names: ['000000706'] },
            returns: { count: 1, names: ['R40'] },
        });
        expect(store.sent).toStrictEqual([]);
    });

    it("reads only the orders placed in the chosen stores' views, and those orders' returns", async () => {
        const store = storeWith([RESET_RULE_CASES[3].order], RESET_RULE_CASES[3].returns);

        await planWipeFor(store.get, TEST_STORE, []);

        expect(store.reads.filter((p) => p.startsWith('orders?') || p.startsWith('returns?')).map((p) => p.split('&fields')[0])).toEqual([
            'orders?searchCriteria[currentPage]=1&searchCriteria[pageSize]=100&searchCriteria[filterGroups][0][filters][0][field]=store_id&searchCriteria[filterGroups][0][filters][0][value]=6&searchCriteria[filterGroups][0][filters][0][conditionType]=in',
            'returns?searchCriteria[currentPage]=1&searchCriteria[pageSize]=100&searchCriteria[filterGroups][0][filters][0][field]=order_id&searchCriteria[filterGroups][0][filters][0][value]=704&searchCriteria[filterGroups][0][filters][0][conditionType]=in',
        ]);
    });
});

describe('the reset rule at its edges', () => {
    const [held, noted, , configurable] = EDGE_ORDERS;

    it('releases a hold before cancelling', async () => {
        const store = storeWith([held]);

        await runWipe(store, await planWipeFor(store.get, TEST_STORE, []), undefined, DAY);

        expect(store.sent).toEqual([{ method: 'POST', path: 'orders/504/unhold' }, { method: 'POST', path: 'orders/504/cancel' }, note(504, `Canceled by the demo reset on ${DAY}.`)]);
    });

    it('leaves an order a reset already noted: run twice, nothing new', async () => {
        const store = storeWith([noted]);

        const plan = await planWipeFor(store.get, TEST_STORE, []);

        expect(plan.orders).toStrictEqual([]);
        expect(plan.preview.total).toBe(0);
    });

    it('changes nothing the second time: every order now carries a reset note, every return is closed', async () => {
        const store = storeWith(RESET_RULE_CASES.map((c) => c.order), RESET_RULE_CASES.flatMap((c) => c.returns));
        await runWipe(store, await planWipeFor(store.get, TEST_STORE, []), undefined, DAY);
        const written = store.sent.length;

        const again = await planWipeFor(store.get, TEST_STORE, []);
        await runWipe(store, again, undefined, DAY);

        expect(again.preview.total).toBe(0);
        expect(again.alreadyClosed).toBe(7);
        expect(store.sent).toHaveLength(written);
    });

    it('leaves an order in payment review open with a note, never refunding it', async () => {
        const review = { ...RESET_RULE_CASES[1].order, entity_id: 710, increment_id: '000000710', state: 'payment_review' };
        const store = storeWith([review]);

        const outcome = await runWipe(store, await planWipeFor(store.get, TEST_STORE, []), undefined, DAY);

        expect(store.sent).toEqual([note(710, `Left open by the demo reset on ${DAY}: Commerce can neither cancel nor refund it.`)]);
        expect(outcome.orders).toMatchObject({ commented: 1, refunded: 0 });
    });

    it('answers the counts by the ERP reset\'s names', async () => {
        const store = storeWith(RESET_RULE_CASES.map((c) => c.order), RESET_RULE_CASES.flatMap((c) => c.returns));

        const outcome = await runWipe(store, await planWipeFor(store.get, TEST_STORE, []), undefined, DAY);

        expect(outcome.orders).toEqual({ cancelled: 1, refunded: 4, commented: 1, alreadyClosed: 1, returnsClosed: 1, failed: 0 });
        expect(outcome.sentence).toContain('Canceled 1 order, refunded 4 orders and left 1 order open with a note. Closed 1 return.');
    });

    it("refunds a configurable's line, never its child's", async () => {
        const store = storeWith([configurable]);

        const plan = await planWipeFor(store.get, TEST_STORE, []);

        expect(plan.orders[0].refund?.items).toEqual([{ order_item_id: 12, qty: 1 }]);
    });

    it('notes a cancel Commerce answers with false as left open, as the ERP reset does', async () => {
        const store = storeWith([RESET_RULE_CASES[0].order], [], undefined, (path) => !path.endsWith('/cancel'));

        const outcome = await runWipe(store, await planWipeFor(store.get, TEST_STORE, []), undefined, DAY);

        expect(store.sent).toEqual([{ method: 'POST', path: 'orders/701/cancel' }, note(701, `Left open by the demo reset on ${DAY}: Commerce can neither cancel nor refund it.`)]);
        expect(outcome.orders).toMatchObject({ cancelled: 0, commented: 1 });
    });

    it('counts a return Commerce kept open as not closed', async () => {
        const example = RESET_RULE_CASES[3];
        // Commerce answers the save but keeps the return as it was: the read back says so.
        const store = storeWith([example.order], example.returns, undefined, () => true);

        const outcome = await runWipe(store, await planWipeFor(store.get, TEST_STORE, []), undefined, DAY);

        expect(outcome.failed).toContainEqual({ what: 'close 1 of the returns', count: 1, first: '40: Commerce kept it authorized' });
        expect(outcome.orders.failed).toBe(1);
    });

    it('reads a store without returns as having none', async () => {
        const store = sandbox({ products: [], customers: [], orders: [] });

        expect((await planWipeFor(store.get, TEST_STORE, [])).returnIds).toStrictEqual([]);
    });
});
