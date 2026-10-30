/**
 * The order and return writes of a wipe (the one reset rule, `wipeOrders.ts`), mirroring the ERP
 * integration's `closeOne`, `settle` and `closeReturn` (`commerce-erp-integration`
 * `src/lib/close-orders.js`, branch feature/one-reset-rule, 18f28a9). Each names its own order or
 * return id; nothing here is store-wide.
 *
 * | Write | Route and body | Confirmed from a real answer? |
 * |---|---|---|
 * | release a hold | `POST orders/{id}/unhold` | **no** from here; the integration's `unholdIfHeld`. On ACCS a REST hold does not take, so a REST-held order is not `holded` and is never sent this |
 * | cancel | `POST orders/{id}/cancel`, answer `true` | the integration's reset, live; from here **no** |
 * | refund | `POST order/{id}/refund`, `{ items[order_item_id,qty], notify: false, arguments[shipping_amount, adjustment_positive 0, adjustment_negative 0] }`, then `GET orders/{id}` for its `state` | **no**; the integration's `refundOrder` makes the same call, its answer the credit memo id (measured 2026-10-02) |
 * | note | `POST orders/{id}/comments`, `{ statusHistory: { comment, is_customer_notified: 0, is_visible_on_front: 0 } }` | the integration's `orders.comment`, live; from here **no** |
 * | close a return | `GET returns/{id}`, then `PUT returns/{id}` with `{ rmaDataObject }`: the header as read, without `comments` and `tracks` (saved through their own routes), with `items: []` (Commerce keeps them; it refuses an approved item sent back, even unchanged, Justrite 2026-10-02) and `status: "closed"`; then read back | **no** from here; the integration measured the shape live 2026-10-02 |
 *
 * @module features/data-installer/services/demoDataWipe/wipeOrderRun
 */

import { segment } from '../demoBuilderEngine/kindContext';
import type { RemovalAccess } from '../demoBuilderEngine/removers';
import { type OrderStep, cancelledNote, leftOpenNote, partlyRefundedNote, refundedNote } from './wipeOrders';
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

function note(commerce: RemovalAccess, id: string, comment: string): Promise<unknown> {
    return commerce.send('POST', `orders/${segment(id)}/comments`, { statusHistory: { comment, is_customer_notified: 0, is_visible_on_front: 0 } });
}

/** Refund, then read the order back: Closed when everything invoiced was all there was. */
async function refund(commerce: RemovalAccess, step: OrderStep, day: string): Promise<string> {
    await commerce.send('POST', `order/${segment(step.id)}/refund`, step.refund);
    const after = (await commerce.get(`orders/${segment(step.id)}?fields=entity_id,state`)) as CommerceOrder | undefined;
    return after?.state === 'closed' ? refundedNote(day) : partlyRefundedNote(day);
}

/**
 * Close off one order: release its hold, cancel or refund it, then note it.
 *
 * @param day - the day the note names, "2026-10-30"
 * @returns which of the reset's counts it falls in
 */
export async function closeOrder(commerce: RemovalAccess, step: OrderStep, day: string): Promise<OrderOutcome> {
    const id = segment(step.id);
    if (step.unhold) await commerce.send('POST', `orders/${id}/unhold`, undefined);
    if (step.action === 'refund') {
        await note(commerce, step.id, await refund(commerce, step, day));
        return 'refunded';
    }
    // Commerce's answer is the last word: a refused cancel is noted as one it could not make.
    const cancelled = step.action === 'cancel' && (await commerce.send('POST', `orders/${id}/cancel`, undefined)) === true;
    await note(commerce, step.id, cancelled ? cancelledNote(day) : leftOpenNote(day));
    return cancelled ? 'cancelled' : 'commented';
}

/**
 * Close one return: its header as read, with status Closed, then read back.
 *
 * @throws OrderWriteRefused when the return does not then read Closed
 */
export async function closeReturn(commerce: RemovalAccess, id: string): Promise<void> {
    const path = `returns/${segment(id)}`;
    const { comments: _comments, tracks: _tracks, ...header } = (await commerce.get(path)) as CommerceReturn;
    await commerce.send('PUT', path, { rmaDataObject: { ...header, items: [], status: 'closed' } });
    const saved = (await commerce.get(path)) as CommerceReturn | undefined;
    if (saved?.status !== 'closed') throw new OrderWriteRefused(`Commerce kept it ${saved?.status ?? 'open'}`);
}
