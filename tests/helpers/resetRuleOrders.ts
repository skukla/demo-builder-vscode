/**
 * The example orders of the ONE reset rule for orders (owner, 2026-10-30), shared by the demo-data
 * wipe here and the ERP integration's reset in `commerce-erp-integration` (`test/lib/reset-rule-orders.js`).
 * The case names are the owner's, word for word, so the two repositories' suites can be compared
 * line by line: the first five, then the two added the same day to both (ERP side 0a10b95).
 *
 * The rule, in plain words, is in `.rptc/plans/datapack-engine/step-10-wipe.md` ("One reset rule").
 * Typed to the real wire shapes; none of these bodies is captured from a live store.
 */

import type { CommerceOrder, CommerceReturn } from '@/types/commerceWire';

/** What the rule does to the order. */
export type ResetRuleOutcome = 'canceled' | 'refunded' | 'noted' | 'untouched';

export interface ResetRuleCase {
    name: string;
    order: CommerceOrder;
    returns: CommerceReturn[];
    expected: ResetRuleOutcome;
    /** The return the rule closes, by id. */
    closesReturn?: number;
    /** A refund that leaves something open (partly invoiced): Commerce does not close the order. */
    staysOpen?: boolean;
}

/** The store view every example was placed in: the test website's (`commerceWipeFixtures.ts`). */
export const RESET_RULE_VIEW = 6;

const line = (item: number, qty: number, invoiced = 0, shipped = 0) => ({
    item_id: item,
    sku: `RULE-${item}`,
    qty_ordered: qty,
    qty_invoiced: invoiced,
    qty_refunded: 0,
    qty_canceled: 0,
    qty_shipped: shipped,
});

const openReturn = (id: number, orderId: number, number: string): CommerceReturn => ({
    entity_id: id,
    increment_id: `R${id}`,
    order_id: orderId,
    order_increment_id: number,
    store_id: RESET_RULE_VIEW,
    status: 'authorized',
    customer_id: 70,
    date_requested: '2026-10-30 10:00:00',
    customer_custom_email: '',
    items: [],
    comments: [],
    tracks: [],
});

export const RESET_RULE_CASES: ResetRuleCase[] = [
    {
        name: '(1) pending, nothing invoiced → canceled',
        order: { entity_id: 701, increment_id: '000000701', state: 'new', status: 'pending', store_id: RESET_RULE_VIEW, items: [line(71, 2)] },
        returns: [],
        expected: 'canceled',
    },
    {
        name: '(2) invoiced, not shipped → refunded, closed',
        order: {
            entity_id: 702,
            increment_id: '000000702',
            state: 'processing',
            status: 'processing',
            store_id: RESET_RULE_VIEW,
            base_shipping_invoiced: 10,
            base_shipping_refunded: 0,
            items: [line(72, 1, 1)],
        },
        returns: [],
        expected: 'refunded',
    },
    {
        name: '(3) invoiced and shipped → refunded, closed',
        order: {
            entity_id: 703,
            increment_id: '000000703',
            state: 'complete',
            status: 'complete',
            store_id: RESET_RULE_VIEW,
            base_shipping_invoiced: 5,
            base_shipping_refunded: 0,
            items: [line(73, 3, 3, 3)],
        },
        returns: [],
        expected: 'refunded',
    },
    {
        name: '(4) invoiced with an open return → refunded, closed, return closed',
        order: {
            entity_id: 704,
            increment_id: '000000704',
            state: 'complete',
            status: 'complete',
            store_id: RESET_RULE_VIEW,
            base_shipping_invoiced: 0,
            base_shipping_refunded: 0,
            items: [line(74, 1, 1, 1)],
        },
        returns: [openReturn(40, 704, '000000704')],
        expected: 'refunded',
        closesReturn: 40,
    },
    {
        name: '(5) already closed → untouched',
        order: { entity_id: 705, increment_id: '000000705', state: 'closed', status: 'closed', store_id: RESET_RULE_VIEW, items: [{ ...line(75, 1, 1, 1), qty_refunded: 1 }] },
        returns: [],
        expected: 'untouched',
    },
    {
        name: 'shipped, not invoiced → noted',
        order: { entity_id: 706, increment_id: '000000706', state: 'processing', status: 'processing', store_id: RESET_RULE_VIEW, items: [line(76, 2, 0, 2)] },
        returns: [],
        expected: 'noted',
    },
    {
        name: 'partly invoiced → refunded, not closed',
        order: {
            entity_id: 707,
            increment_id: '000000707',
            state: 'processing',
            status: 'processing',
            store_id: RESET_RULE_VIEW,
            base_shipping_invoiced: 5,
            base_shipping_refunded: 0,
            items: [line(77, 1, 1), line(78, 1)],
        },
        returns: [],
        expected: 'refunded',
        staysOpen: true,
    },
];
