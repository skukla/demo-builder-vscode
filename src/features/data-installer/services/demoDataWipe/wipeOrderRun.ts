/**
 * The order and return writes of a wipe (the one reset rule, `wipeOrders.ts`), mirroring the ERP
 * integration's `closeOne`, `settle` and `closeReturn` (`commerce-erp-integration`
 * `src/lib/close-orders.js`, branch feature/one-reset-rule; the invoice is not there yet, see
 * `.rptc/plans/erp-order-close/overview.md` step 2). Each names its own order or return id; nothing
 * here is store-wide.
 *
 * One order's writes, in order: its note; each open return closed; its hold released; then canceled,
 * or invoiced (when something is not yet invoiced) and refunded; then, only when Commerce's answer
 * differs from the note, one correcting note.
 *
 * | Write | Route and body | Confirmed from a real answer? |
 * |---|---|---|
 * | note | `POST orders/{id}/comments`, `{ statusHistory: { comment, is_customer_notified: 0, is_visible_on_front: 0 } }` | the integration's `orders.comment`, live; from here **no** |
 * | close a return | `GET returns/{id}`, then `PUT returns/{id}` with `{ rmaDataObject }`: the header as read, without `comments` and `tracks` (saved through their own routes), with `items: []` (Commerce keeps them; it refuses an approved item sent back, even unchanged, Justrite 2026-10-02) and `status: "closed"`; then read back | **no** from here; the integration measured the shape live 2026-10-02 |
 * | release a hold | `POST orders/{id}/unhold` | **no** from here; the integration's `unholdIfHeld`. On ACCS a REST hold does not take, so a REST-held order is not `holded` and is never sent this |
 * | cancel | `POST orders/{id}/cancel`, answer `true` | the integration's reset, live; from here **no** |
 * | invoice | `POST order/{id}/invoice`, `{ capture: false, notify: false }`: no `items`, so every line not yet invoiced is invoiced | **no**: not confirmed from any live answer, here or in the integration (the owner's decision, 2026-11-11, names it; step 6 of that plan is the live check) |
 * | refund | `GET orders/{id}` for its lines as invoiced now, then `POST order/{id}/refund`, `{ items[order_item_id,qty], notify: false, arguments[shipping_amount, adjustment_positive 0, adjustment_negative 0] }`, then `GET orders/{id}` for its `state` | **no**; the integration's `refundOrder` makes the same call, its answer the credit memo id (measured 2026-10-02) |
 *
 * @module features/data-installer/services/demoDataWipe/wipeOrderRun
 */

import { segment } from '../demoBuilderEngine/kindContext';
import type { RemovalAccess } from '../demoBuilderEngine/removers';
import { type OrderReturn, type OrderStep, leadingNoteOf, leftOpenNote, partlyRefundedNote, refundOf } from './wipeOrders';
import type { CommerceOrder, CommerceReturn } from '@/types/commerceWire';

/** How one order ended: the ERP reset's own counts. */
export type OrderOutcome = 'cancelled' | 'refunded' | 'commented';

/** A write Commerce answered without doing it. */
export class OrderWriteRefused extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'OrderWriteRefused';
    }
}

/** What a refund is made from: the lines and shipping as Commerce has them invoiced now. */
const REFUND_FIELDS = 'entity_id,state,base_shipping_invoiced,base_shipping_refunded,items[item_id,parent_item_id,qty_invoiced,qty_refunded]';

function note(commerce: RemovalAccess, id: string, comment: string): Promise<unknown> {
    return commerce.send('POST', `orders/${segment(id)}/comments`, { statusHistory: { comment, is_customer_notified: 0, is_visible_on_front: 0 } });
}

/**
 * Refund everything invoiced, read from Commerce after any invoice, then read the order back.
 *
 * @returns whether Commerce closed it
 * @throws OrderWriteRefused when Commerce has nothing left to refund on it
 */
async function refundAll(commerce: RemovalAccess, id: string): Promise<boolean> {
    const path = `orders/${segment(id)}`;
    const now = (await commerce.get(`${path}?fields=${REFUND_FIELDS}`)) as CommerceOrder | undefined;
    const body = now ? refundOf(now) : undefined;
    if (!body) throw new OrderWriteRefused('Commerce has nothing invoiced left to refund on it');
    await commerce.send('POST', `order/${segment(id)}/refund`, body);
    const after = (await commerce.get(`${path}?fields=entity_id,state`)) as CommerceOrder | undefined;
    return after?.state === 'closed';
}

/** Cancel or invoice-and-refund, after the note and the returns; one correcting note when Commerce's answer differs. */
async function settle(commerce: RemovalAccess, step: OrderStep, day: string): Promise<OrderOutcome> {
    const id = segment(step.id);
    if (step.unhold) await commerce.send('POST', `orders/${id}/unhold`, undefined);
    if (step.action === 'cancel') {
        if ((await commerce.send('POST', `orders/${id}/cancel`, undefined)) === true) return 'cancelled';
        await note(commerce, step.id, leftOpenNote(day));
        return 'commented';
    }
    if (step.invoice) await commerce.send('POST', `order/${id}/invoice`, { capture: false, notify: false });
    if (!(await refundAll(commerce, step.id))) await note(commerce, step.id, partlyRefundedNote(day));
    return 'refunded';
}

/**
 * Close off one order: its note first (unless a stopped run already wrote one), then its returns,
 * then the cancel or the invoice and refund.
 *
 * @param day - the day the note names, "2026-10-30"
 * @param onReturnClosed - told as each of its returns reads Closed
 * @returns which of the reset's counts it falls in
 * @throws OrderWriteRefused, or Commerce's refusal, when a return or the order could not be closed:
 *   the note is already written, so the next run finishes it without a second one
 */
export async function closeOrder(commerce: RemovalAccess, step: OrderStep, day: string, onReturnClosed: () => void = () => undefined): Promise<OrderOutcome> {
    // A left-open order is finished only by its own note, so a rerun writes that one even after another.
    if (!step.noted || step.action === 'note') await note(commerce, step.id, leadingNoteOf(step.action, day));
    for (const rma of step.returns) {
        await closeReturn(commerce, rma);
        onReturnClosed();
    }
    return step.action === 'note' ? 'commented' : settle(commerce, step, day);
}

/**
 * Close one return: its header as read, with status Closed, then read back.
 *
 * @throws OrderWriteRefused when the return does not then read Closed
 */
async function closeReturn(commerce: RemovalAccess, rma: OrderReturn): Promise<void> {
    const path = `returns/${segment(rma.id)}`;
    const { comments: _comments, tracks: _tracks, ...header } = (await commerce.get(path)) as CommerceReturn;
    await commerce.send('PUT', path, { rmaDataObject: { ...header, items: [], status: 'closed' } });
    const saved = (await commerce.get(path)) as CommerceReturn | undefined;
    if (saved?.status !== 'closed') throw new OrderWriteRefused(`Commerce kept return ${rma.number} ${saved?.status ?? 'open'}`);
}
