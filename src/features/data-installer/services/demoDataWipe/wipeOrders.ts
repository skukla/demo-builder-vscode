/**
 * What a wipe does with the orders and returns placed in the chosen stores: the ONE reset rule for
 * orders, shared with the ERP integration's reset (owner, 2026-10-30; in plain words in
 * `.rptc/plans/datapack-engine/step-10-wipe.md`, "One reset rule"; changed 2026-11-11,
 * `.rptc/plans/erp-order-close/overview.md`: every order a Clear touches ends Canceled or Closed, in
 * Commerce). It mirrors the integration's `src/lib/reset-rule.js` (`commerce-erp-integration`, branch
 * feature/one-reset-rule); **the integration's copy still has the 2026-10-30 rule until that plan's
 * step 2.** An App Builder app cannot be imported here. Commerce cannot delete an order, so each is
 * closed off, and nothing is ever deleted:
 *
 * | The order | What it gets | Its note |
 * |---|---|---|
 * | already Canceled or Closed | nothing (`FINISHED`), counted `alreadyClosed` | none |
 * | nothing invoiced, nothing shipped, a state Commerce can cancel from (`cancellableByReset`, `UNCANCELLABLE_STATES`) | canceled (`POST orders/{id}/cancel`) | `cancelledNote`; `leftOpenNote` added when Commerce answers the cancel with anything but `true` |
 * | in payment review (Commerce refuses an invoice and a credit memo there) | nothing but the note, counted `commented` | `leftOpenNote` |
 * | anything else with something to invoice or refund | what is not invoiced is invoiced (`POST order/{id}/invoice`, every remaining line), then everything invoiced is refunded offline (`POST order/{id}/refund`, `refundOf`), so Commerce closes it | `refundedNote`; `partlyRefundedNote` added when the order does not then read Closed |
 * | anything else, with nothing to invoice or refund | nothing but the note, counted `commented` | `leftOpenNote` |
 *
 * Why invoice first (Experience League, read 2026-11-11): an order is Closed when "an order was
 * assigned a credit memo and the customer has received a refund"; "you must generate an invoice
 * before creating a credit memo"; "you can issue an offline refund … for any payment method". The
 * refund route is documented as "Issues an offline refund" (`rest/tutorials/orders/order-issue-refund`;
 * ACCS REST reference `PostV1OrderOrderIdRefund`, read 2026-10-30); it has no `isOnline` field (that is
 * `POST invoice/{invoiceId}/refund`'s), so none is sent. This replaces the 2026-10-30 rule's "shipped
 * but never invoiced: left open with a note" and "partly invoiced: refunded, not closed".
 *
 * **The note comes first.** The integration skips the events of an order whose history carries
 * `RESET_NOTE`, so the note is the first write to every order the run touches, before its returns are
 * closed, its hold released, or it is canceled, invoiced or refunded. Its words are decided from the
 * plan up front (`leadingNoteOf`); when Commerce's answer then differs, ONE correcting note is added,
 * so Commerce's answer stays the last word.
 *
 * - **on hold: released** (`POST orders/{id}/unhold`) after the note, before the cancel or invoice, as
 *   the integration's `closeOne` does.
 * - **its returns: Closed** (`wipeOrderRun.closeReturn`, the integration's `closeReturn`), inside the
 *   order's own work, after its note; a return Commerce keeps open stops that order, so the next run
 *   finishes it.
 * - **run twice, nothing new; a stopped run is finished**: an order is `'done'` when it is Canceled or
 *   Closed, or its history carries the left-open note (`LEFT_OPEN_NOTE`). One carrying another reset
 *   note but not closed (a run stopped after its note) is closed again, without a second leading note
 *   (`OrderStep.noted`).
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

/** A return of the order, still open: closed inside the order's work, after its note. */
export interface OrderReturn {
    id: string;
    /** The return number the SC knows it by. */
    number: string;
}

/** What one order gets: its note, its returns closed, released when on hold, then canceled, refunded or only noted. */
export interface OrderStep {
    id: string;
    /** The order number the SC knows it by. */
    number: string;
    unhold: boolean;
    action: 'cancel' | 'refund' | 'note';
    /** For a refund: something is not yet invoiced, so the order is invoiced in full first. */
    invoice: boolean;
    /** Its history already carries a reset note (a run stopped after it): no second leading note. */
    noted: boolean;
    /** Its open returns: filled by the plan, which reads them for the orders it will close. */
    returns: OrderReturn[];
}

/** The words every one of the reset's notes carries: the integration skips the events of an order whose history holds them. */
export const RESET_NOTE = 'by the demo reset on';
/** The words only the left-open note carries: an order whose history holds them is finished with. */
export const LEFT_OPEN_NOTE = 'Left open by the demo reset on';
export const cancelledNote = (day: string): string => `Canceled by the demo reset on ${day}.`;
export const refundedNote = (day: string): string => `Refunded and closed by the demo reset on ${day}.`;
export const partlyRefundedNote = (day: string): string => `Refunded the invoiced items by the demo reset on ${day}.`;
export const leftOpenNote = (day: string): string => `${LEFT_OPEN_NOTE} ${day}: Commerce can neither cancel nor refund it.`;

/** The note an order's work starts with, decided from the plan before anything is written. */
export function leadingNoteOf(action: OrderStep['action'], day: string): string {
    if (action === 'cancel') return cancelledNote(day);
    return action === 'refund' ? refundedNote(day) : leftOpenNote(day);
}

/** The states in which Commerce's `Order::canCancel()` refuses whatever the lines say (the integration's list). */
const UNCANCELLABLE_STATES = new Set(['canceled', 'closed', 'complete', 'payment_review']);
/** The states an order is already closed off in. */
const FINISHED = new Set(['canceled', 'closed']);
/** A state Commerce refuses an invoice and a credit memo in beyond the finished ones (on hold is released first). */
const UNCREDITABLE = new Set(['payment_review']);
/** Return statuses that are already closed. */
const CLOSED_RETURNS = new Set(['closed', 'processed_closed']);

const qty = (value: number | undefined): number => Number(value ?? 0);
/** A configurable's child line follows its parent; only top lines are refunded. */
const topLines = (order: CommerceOrder): CommerceOrderItem[] => (order.items ?? []).filter((i) => i.parent_item_id === undefined || i.parent_item_id === null);

const historyHas = (order: CommerceOrder, words: string): boolean => (order.status_histories ?? []).some((h) => String(h?.comment ?? '').includes(words));

/** Whether an order's history already carries a reset's note. */
export function hasResetNote(order: CommerceOrder): boolean {
    return historyHas(order, RESET_NOTE);
}

/** The integration's `cancellableByReset`: nothing invoiced, nothing shipped, a cancellable state, something left. */
export function cancellableByReset(order: CommerceOrder): boolean {
    if (UNCANCELLABLE_STATES.has(order.state ?? '')) return false;
    const items = order.items ?? [];
    if (items.some((i) => qty(i.qty_invoiced) > 0 || qty(i.qty_shipped) > 0)) return false;
    return items.some((i) => qty(i.qty_ordered) - qty(i.qty_canceled) > 0);
}

/** `POST order/{id}/refund`'s body for an order as read: every top line still refundable, and the shipping not yet refunded; nothing when nothing is. */
export function refundOf(order: CommerceOrder): RefundBody | undefined {
    const items = topLines(order)
        .map((i) => ({ order_item_id: Number(i.item_id), qty: qty(i.qty_invoiced) - qty(i.qty_refunded) }))
        .filter((i) => i.qty > 0 && Number.isFinite(i.order_item_id));
    if (items.length === 0) return undefined;
    const shipping = Math.max(0, qty(order.base_shipping_invoiced) - qty(order.base_shipping_refunded));
    return { items, notify: false, arguments: { shipping_amount: shipping, adjustment_positive: 0, adjustment_negative: 0 } };
}

/** Whether any line still has something neither invoiced nor canceled. */
const notAllInvoiced = (order: CommerceOrder): boolean => (order.items ?? []).some((i) => qty(i.qty_ordered) - qty(i.qty_invoiced) - qty(i.qty_canceled) > 0);

/** Canceled when it can be; else, outside payment review, invoiced and refunded when there is anything to; else only noted. */
function actionOf(order: CommerceOrder): Pick<OrderStep, 'action' | 'invoice'> {
    if (cancellableByReset(order)) return { action: 'cancel', invoice: false };
    if (UNCREDITABLE.has(order.state ?? '')) return { action: 'note', invoice: false };
    const invoice = notAllInvoiced(order);
    return invoice || refundOf(order) ? { action: 'refund', invoice } : { action: 'note', invoice: false };
}

/**
 * What closing one order takes, its returns not yet filled in; or `'done'` when it is Canceled or
 * Closed, or a reset left it open before.
 */
export function orderStepOf(order: CommerceOrder): OrderStep | 'done' {
    if (FINISHED.has(order.state ?? '') || historyHas(order, LEFT_OPEN_NOTE)) return 'done';
    const id = String(order.entity_id);
    return { id, number: order.increment_id ?? id, unhold: order.state === 'holded', ...actionOf(order), noted: hasResetNote(order), returns: [] };
}

/** The returns still open. */
export function openReturns(returns: readonly CommerceReturn[]): CommerceReturn[] {
    return returns.filter((rma) => !CLOSED_RETURNS.has(String(rma.status ?? '')));
}
