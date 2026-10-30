/**
 * Clearing a demo's part of the store (datapack-engine step 10): the plan the SC saw, carried out.
 * Cannot be undone: it removes things no install record lists and closes orders, so there is nothing
 * to put back.
 *
 * The plan is made again first, and the clearing goes ahead only when the new plan takes nothing
 * the shown one did not (`withinPlan`): what is gone or closed since (the pack's removal ran in
 * between) is fine, anything new is refused. Then: returns closed, orders closed off (the one reset
 * rule, `wipeOrders.ts` / `wipeOrderRun.ts`), then the reverse of install order: customers, products
 * (deleted, or only taken off the chosen websites), categories deepest first. A write Commerce
 * refuses is named and counted, and the rest carry on, so the SC is told exactly what could not be done.
 *
 * When an ERP integration routes some chosen stores' websites (`wipeErp.ts`), it closes every
 * order of those stores first (the wipe closes none of them itself) and takes them out of its ERPs,
 * and the ERP is filled again from Commerce last; its counts are merged into the wipe's.
 *
 * | Write | Route | Confirmed from a real answer? |
 * |---|---|---|
 * | close a return, close off an order | see `wipeOrderRun.ts` | see there |
 * | delete a customer | `DELETE customers/{id}` | the route, yes (step 08's removal, live 2026-10-30) |
 * | delete a product | `DELETE products/{sku}` | the route, yes (the engine's removal) |
 * | take a product off a website | `DELETE products/{sku}/websites/{websiteId}` | **no**: Adobe's REST reference lists it; never called from here |
 * | delete a category | `DELETE categories/{id}` | the route, yes (the engine's removal) |
 *
 * Every write but the order and return ones goes through the project's store-wide access (Store: `all`);
 * those name their own order or return id.
 *
 * @module features/data-installer/services/demoDataWipe/wipeRun
 */

import { removeCategory } from '../demoBuilderEngine/categoriesKind';
import { removeCustomer } from '../demoBuilderEngine/customerKinds';
import type { InstallRecord } from '../demoBuilderEngine/installRecord';
import { deleteIfPresent, segment } from '../demoBuilderEngine/kindContext';
import { removeProduct } from '../demoBuilderEngine/productsKind';
import type { RemovalAccess } from '../demoBuilderEngine/removers';
import { type ErpClosed, type ErpRefreshed, type WipeErp, closeErpOrders, erpSentence, refreshErp } from './wipeErp';
import { type OrderOutcome, closeOrder, closeReturn } from './wipeOrderRun';
import { type WipePlan, planWipeFor, withinPlan } from './wipePlan';
import { andList } from '@/core/utils/andList';
import { DATAPACK_STAGES } from '@/core/utils/datapackStages';
import { errorText } from '@/features/app-builder/services/storePreparation/fixContract';
import type { WipePreview } from '@/types/demoDataWipe';

/** The store would now clear something the SC was not shown: nothing was written. */
export class WipeChangedError extends Error {
    constructor(readonly preview: WipePreview) {
        super(`The store changed since the list was made, so nothing was cleared. Check what would be removed again (${preview.total} things now).`);
        this.name = 'WipeChangedError';
    }
}

/** What the clearing removed, by kind. */
export interface WipeCounts {
    customers: number;
    products: number;
    takenOff: number;
    categories: number;
}

/** What it did with the orders: the ERP reset's own counts, by the same names. */
export interface OrderCounts {
    cancelled: number;
    refunded: number;
    /** Left open with a note: Commerce could neither cancel nor refund them. */
    commented: number;
    /** Closed before, or handled by a reset before: nothing written. */
    alreadyClosed: number;
    returnsClosed: number;
    failed: number;
}

type StepKey = keyof WipeCounts | 'returns' | 'orders';

/** One step of the clearing, and what it is called in the outcome. */
interface WipeStep {
    /** "Could not remove 2 of the products": the verb and the kind, plural, with 1 as the count. */
    failed: string;
    stage: string;
    /** Each write, by the id the outcome names it by; an order's answers how it ended. */
    writes: Array<{ id: string; write: () => Promise<OrderOutcome | void> }>;
}

/** What the clearing did. */
export interface WipeOutcome {
    removed: WipeCounts;
    orders: OrderCounts;
    /** Each step with refusals: how many, and the first in Commerce's words. */
    failed: Array<{ what: string; count: number; first: string }>;
    sentence: string;
    /** The ERP part, when an ERP integration routed some chosen stores' websites. */
    erp?: { integration: string; orderNumbers: string[]; removedFrom: string[]; refreshed: boolean; said?: string };
}

const each = <T>(items: readonly T[], idOf: (item: T) => string, write: (item: T) => Promise<OrderOutcome | void>): WipeStep['writes'] =>
    items.map((item) => ({ id: idOf(item), write: () => write(item) }));
const self = (id: string): string => id;

function stepsOf(commerce: RemovalAccess, plan: WipePlan, day: string): Record<StepKey, WipeStep> {
    const { send } = commerce;
    return {
        returns: { failed: 'close 1 of the returns', stage: DATAPACK_STAGES.closingReturns.label, writes: each(plan.returnIds, self, (id) => closeReturn(commerce, id)) },
        orders: { failed: 'close 1 of the orders', stage: DATAPACK_STAGES.closingOrders.label, writes: each(plan.orders, (o) => o.number, (o) => closeOrder(commerce, o, day)) },
        customers: { failed: 'remove 1 of the customers', stage: DATAPACK_STAGES.removingCustomers.label, writes: each(plan.customerIds, self, (id) => removeCustomer(send, id)) },
        products: { failed: 'remove 1 of the products', stage: DATAPACK_STAGES.removingProducts.label, writes: each(plan.deleteSkus, self, (sku) => removeProduct(send, sku)) },
        takenOff: {
            failed: 'take 1 of the products off a website',
            stage: DATAPACK_STAGES.takingProductsOff.label,
            writes: each(plan.takeOff, (t) => t.sku, (t) => deleteIfPresent(send, `products/${encodeURIComponent(t.sku)}/websites/${segment(t.websiteId)}`)),
        },
        categories: { failed: 'remove 1 of the categories', stage: DATAPACK_STAGES.removingCategories.label, writes: each(plan.categoryIds, self, (id) => removeCategory(send, id)) },
    };
}

const counted = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "the store justrite_test_store", "the stores bodea_store and bodea_outlet". */
export function storesInWords(preview: WipePreview): string {
    const codes = preview.stores.map((s) => s.storeCode);
    return `${codes.length === 1 ? 'the store' : 'the stores'} ${andList(codes)}`;
}

/** " Canceled 1 order, refunded 2 and left 1 open with a note. Closed 1 return.", or nothing. */
function ordersSentence(orders: OrderCounts): string {
    const did = [
        orders.cancelled > 0 ? `canceled ${counted(orders.cancelled, 'order', 'orders')}` : '',
        orders.refunded > 0 ? `refunded ${counted(orders.refunded, 'order', 'orders')}` : '',
        orders.commented > 0 ? `left ${counted(orders.commented, 'order', 'orders')} open with a note` : '',
    ].filter(Boolean);
    const first = did.length > 0 ? ` ${andList(did).replace(/^./u, (c) => c.toUpperCase())}.` : '';
    return `${first}${orders.returnsClosed > 0 ? ` Closed ${counted(orders.returnsClosed, 'return', 'returns')}.` : ''}`;
}

function sentenceOf(preview: WipePreview, removed: WipeCounts, orders: OrderCounts, failed: WipeOutcome['failed']): string {
    const where = storesInWords(preview);
    const parts = [
        removed.products > 0 ? counted(removed.products, 'product', 'products') : '',
        removed.categories > 0 ? counted(removed.categories, 'category', 'categories') : '',
        removed.customers > 0 ? counted(removed.customers, 'customer', 'customers') : '',
    ].filter(Boolean);
    const did = parts.length > 0 ? `Removed ${andList(parts)} from ${where}.` : `Removed nothing from ${where}.`;
    const off = removed.takenOff > 0 ? ` Took ${counted(removed.takenOff, 'product', 'products')} other websites also sell off the chosen websites.` : '';
    const not = failed.map((f) => ` Could not ${f.what.replace('1', String(f.count))} (${f.first}).`).join('');
    return `${did}${ordersSentence(orders)}${off}${not}`;
}

const today = (): string => new Date().toISOString().slice(0, 10);

/** Count one write that went through. */
function count(key: StepKey, result: OrderOutcome | void, removed: WipeCounts, orders: OrderCounts): void {
    if (key === 'returns') orders.returnsClosed += 1;
    else if (key === 'orders') orders[result || 'commented'] += 1;
    else removed[key] += 1;
}

/**
 * Carry a plan out, as made: every write named in it, in order, counting what Commerce refused.
 *
 * @param report - called as each kind starts, for the progress window
 * @param day - the day the orders' notes name; today by default
 */
export async function runWipe(commerce: RemovalAccess, plan: WipePlan, report: (stage: string) => void = () => undefined, day = today()): Promise<WipeOutcome> {
    const removed: WipeCounts = { customers: 0, products: 0, takenOff: 0, categories: 0 };
    const orders: OrderCounts = { cancelled: 0, refunded: 0, commented: 0, alreadyClosed: plan.alreadyClosed, returnsClosed: 0, failed: 0 };
    const failed: WipeOutcome['failed'] = [];
    for (const [key, step] of Object.entries(stepsOf(commerce, plan, day)) as Array<[StepKey, WipeStep]>) {
        if (step.writes.length > 0) report(step.stage);
        const refused: string[] = [];
        for (const { id, write } of step.writes) {
            try {
                count(key, await write(), removed, orders);
            } catch (error) {
                refused.push(`${id}: ${errorText(error)}`);
            }
        }
        if (key === 'orders' || key === 'returns') orders.failed += refused.length;
        if (refused.length > 0) failed.push({ what: step.failed, count: refused.length, first: refused[0] });
    }
    return { removed, orders, failed, sentence: sentenceOf(plan.preview, removed, orders, failed) };
}

/** The wipe's outcome with the integration's close merged in, and the sentence said again. */
function withErp(outcome: WipeOutcome, plan: WipePlan, closed: ErpClosed | undefined, refreshed: ErpRefreshed | undefined): WipeOutcome {
    if (!plan.erp) return outcome;
    const orders = { ...outcome.orders };
    for (const key of Object.keys(orders) as Array<keyof OrderCounts>) orders[key] += closed?.counts[key] ?? 0;
    const failed = closed?.failed ? [closed.failed, ...outcome.failed] : outcome.failed;
    const sentence = `${sentenceOf(plan.preview, outcome.removed, orders, failed)}${erpSentence(plan.erp, closed, refreshed)}`;
    const said = refreshed?.said ? { said: refreshed.said } : {};
    const touched = { orderNumbers: closed?.orderNumbers ?? [], removedFrom: closed?.removedFrom ?? [] };
    const erp = { integration: plan.erp.route.name, ...touched, refreshed: refreshed?.refreshed ?? false, ...said };
    return { ...outcome, orders, failed, sentence, erp };
}

/** How a clearing is run: its progress, and the ERP integration serving the instance, if one does. */
export interface ClearOptions {
    report?: (stage: string, step?: string) => void;
    erp?: WipeErp;
}

/**
 * Clear the stores as shown: make the plan again, refuse when it takes anything the shown plan did
 * not, then carry it out: the ERP integration's close first, the wipe's own writes, then the ERP
 * filled again from Commerce.
 *
 * @throws WipeChangedError, writing nothing, when the store would now clear something not shown
 */
export async function clearShown(commerce: RemovalAccess, shown: WipePlan, records: readonly InstallRecord[], options: ClearOptions = {}): Promise<WipeOutcome> {
    const { report = () => undefined, erp } = options;
    const now = await planWipeFor(commerce.get, shown.choices, records, erp);
    if (!withinPlan(shown, now)) throw new WipeChangedError(now.preview);
    const closed = await closeErpOrders(erp, now.erp, report);
    const outcome = await runWipe(commerce, now, report);
    return withErp(outcome, now, closed, await refreshErp(erp, now.erp, report));
}
