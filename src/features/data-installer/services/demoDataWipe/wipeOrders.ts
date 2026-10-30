/**
 * What a wipe does with the orders and returns placed in the chosen stores: the ONE reset rule for
 * orders, shared with the ERP integration's reset (owner, 2026-10-30; in plain words in
 * `.rptc/plans/datapack-engine/step-10-wipe.md`, "One reset rule"). It mirrors the integration's
 * `src/lib/reset-rule.js` (`commerce-erp-integration`, branch feature/one-reset-rule, 18f28a9) line for
 * line: an App Builder app cannot be imported here. Commerce cannot delete an order, so each is
 * closed off, and nothing is ever deleted:
 *
 * - **nothing invoiced and nothing shipped, in a state Commerce can cancel from: canceled**
 *   (`POST orders/{id}/cancel`), noted "Canceled by the demo reset on <day>." (`cancellableByReset`,
 *   `UNCANCELLABLE_STATES`, `cancelledNote`). A cancel Commerce answers with anything but `true` is
 *   noted as left open instead, as the integration's `settle` does.
 * - **any other order not already Canceled or Closed, and not in payment review: what is invoiced is
 *   refunded with an offline credit memo** (`POST order/{orderId}/refund`, every invoiced top line and
 *   the invoiced shipping not yet refunded, `refundOf`). Adobe documents the route as "Issues an
 *   offline refund" (`rest/tutorials/orders/order-issue-refund`; ACCS REST reference
 *   `PostV1OrderOrderIdRefund`, read 2026-10-30); it has no `isOnline` field (that is
 *   `POST invoice/{invoiceId}/refund`'s), so none is sent. The order is then read back: noted
 *   "Refunded and closed by the demo reset on <day>." when Commerce closed it, else (partly invoiced)
 *   "Refunded the invoiced items by the demo reset on <day>.".
 * - **neither possible** (shipped but never invoiced: nothing shipped is canceled; in payment review,
 *   where Commerce refuses a credit memo): left open, noted, counted as `commented`. The integration's
 *   note there says its ERP documents were removed; a wipe removes none, so its words say what it did.
 * - **on hold: released first** (`POST orders/{id}/unhold`), as the integration's `closeOne` does.
 * - **its returns: Closed** (`wipeOrderRun.closeReturn`, the integration's `closeReturn`).
 * - **run twice, nothing new**: an order whose history already carries "by the demo reset on" was
 *   handled before (`RESET_NOTE`, `hasResetNote`), counted `alreadyClosed`.
 *
 * The note is `POST orders/{id}/comments` with `statusHistory[comment, is_customer_notified 0,
 * is_visible_on_front 0]`, as the integration's `orders.comment` (`src/lib/commerce.js`).
 *
 * @module features/data-installer/services/demoDataWipe/wipeOrders
 */

import type { CommerceOrder, CommerceOrderItem, CommerceReturn } from '@/types/commerceWire';

/** `POST order/{id}/refund`'s body (`sales-data-creditmemo-item-creation-interface`, `…-creation-arguments-interface`). */
export interface RefundBody {
    items: Array<{ order_item_id: number; qty: number }>;
    notify: false;
    arguments: { shipping_amount: number; adjustment_positive: 0; adjustment_negative: 0 };
}

/** What one order gets: released when on hold, then canceled, refunded or only noted. */
export interface OrderStep {
    id: string;
    /** The order number the SC knows it by. */
    number: string;
    unhold: boolean;
    action: 'cancel' | 'refund' | 'note';
    /** For a refund: every top line still refundable, and the shipping not yet refunded. */
    refund?: RefundBody;
}

/** The words every one of the reset's notes carries: an order whose history holds them was handled before. */
export const RESET_NOTE = 'by the demo reset on';
export const cancelledNote = (day: string): string => `Canceled by the demo reset on ${day}.`;
export const refundedNote = (day: string): string => `Refunded and closed by the demo reset on ${day}.`;
export const partlyRefundedNote = (day: string): string => `Refunded the invoiced items by the demo reset on ${day}.`;
export const leftOpenNote = (day: string): string => `Left open by the demo reset on ${day}: Commerce can neither cancel nor refund it.`;

/** The states in which Commerce's `Order::canCancel()` refuses whatever the lines say (the integration's list). */
const UNCANCELLABLE_STATES = new Set(['canceled', 'closed', 'complete', 'payment_review']);
/** The states an order is already closed off in. */
const FINISHED = new Set(['canceled', 'closed']);
/** A state `Order::canCreditmemo()` refuses beyond the finished ones (on hold is released first). */
const UNCREDITABLE = new Set(['payment_review']);
/** Return statuses that are already closed. */
const CLOSED_RETURNS = new Set(['closed', 'processed_closed']);

const qty = (value: number | undefined): number => Number(value ?? 0);
/** A configurable's child line follows its parent; only top lines are refunded. */
const topLines = (order: CommerceOrder): CommerceOrderItem[] => (order.items ?? []).filter((i) => i.parent_item_id === undefined || i.parent_item_id === null);

/** Whether an order's history already carries a reset's note. */
export function hasResetNote(order: CommerceOrder): boolean {
    return (order.status_histories ?? []).some((h) => String(h?.comment ?? '').includes(RESET_NOTE));
}

/** The integration's `cancellableByReset`: nothing invoiced, nothing shipped, a cancellable state, something left. */
export function cancellableByReset(order: CommerceOrder): boolean {
    if (UNCANCELLABLE_STATES.has(order.state ?? '')) return false;
    const items = order.items ?? [];
    if (items.some((i) => qty(i.qty_invoiced) > 0 || qty(i.qty_shipped) > 0)) return false;
    return items.some((i) => qty(i.qty_ordered) - qty(i.qty_canceled) > 0);
}

/** Every top line still refundable, and the shipping not yet refunded; nothing when nothing is. */
function refundOf(order: CommerceOrder): RefundBody | undefined {
    const items = topLines(order)
        .map((i) => ({ order_item_id: Number(i.item_id), qty: qty(i.qty_invoiced) - qty(i.qty_refunded) }))
        .filter((i) => i.qty > 0 && Number.isFinite(i.order_item_id));
    if (items.length === 0) return undefined;
    const shipping = Math.max(0, qty(order.base_shipping_invoiced) - qty(order.base_shipping_refunded));
    return { items, notify: false, arguments: { shipping_amount: shipping, adjustment_positive: 0, adjustment_negative: 0 } };
}

/** What closing one order takes, or `'done'` when it is closed or was handled by a reset before. */
export function orderStepOf(order: CommerceOrder): OrderStep | 'done' {
    if (FINISHED.has(order.state ?? '') || hasResetNote(order)) return 'done';
    const base = { id: String(order.entity_id), number: order.increment_id ?? String(order.entity_id), unhold: order.state === 'holded' };
    if (cancellableByReset(order)) return { ...base, action: 'cancel' };
    const refund = UNCREDITABLE.has(order.state ?? '') ? undefined : refundOf(order);
    return refund ? { ...base, action: 'refund', refund } : { ...base, action: 'note' };
}

/** The returns still open. */
export function openReturns(returns: readonly CommerceReturn[]): CommerceReturn[] {
    return returns.filter((rma) => !CLOSED_RETURNS.has(String(rma.status ?? '')));
}
