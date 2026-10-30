/**
 * Clearing a demo's part of the store (datapack-engine step 10): the plan the SC saw, carried out.
 * Cannot be undone: it removes things no install record lists, so there is nothing to put back.
 *
 * The plan is made again first, and the clearing goes ahead only when the new plan takes nothing
 * the shown one did not (`withinPlan`): what is gone since (the pack's removal ran in between) is
 * fine, anything new is refused. Then, in the reverse of install order: customers, products
 * (deleted, or only taken off this website), categories deepest first. A write Commerce refuses is
 * named and counted, and the rest carry on, so the SC is told exactly what could not be removed.
 *
 * | Write | Route | Confirmed from a real answer? |
 * |---|---|---|
 * | delete a customer | `DELETE customers/{id}` | the route, yes (step 08's removal, live 2026-10-30) |
 * | delete a product | `DELETE products/{sku}` | the route, yes (the engine's removal) |
 * | take a product off a website | `DELETE products/{sku}/websites/{websiteId}` | **no**: Adobe's REST reference lists it; never called from here |
 * | delete a category | `DELETE categories/{id}` | the route, yes (the engine's removal) |
 *
 * @module features/data-installer/services/demoDataWipe/wipeRun
 */

import { removeCategory } from '../demoBuilderEngine/categoriesKind';
import { removeCustomer } from '../demoBuilderEngine/customerKinds';
import type { InstallRecord } from '../demoBuilderEngine/installRecord';
import { deleteIfPresent, segment } from '../demoBuilderEngine/kindContext';
import { removeProduct } from '../demoBuilderEngine/productsKind';
import type { RemovalAccess } from '../demoBuilderEngine/removers';
import { type WipePlan, type WipePreview, planWipe, withinPlan } from './wipePlan';
import { andList } from '@/core/utils/andList';
import { errorText } from '@/features/app-builder/services/storePreparation/fixContract';

/** The store would now clear something the SC was not shown: nothing was written. */
export class WipeChangedError extends Error {
    constructor(readonly preview: WipePreview) {
        super(`The store changed since the list was made, so nothing was cleared. Check what would be removed again (${preview.total} things now).`);
        this.name = 'WipeChangedError';
    }
}

/** One step of the clearing, and what it is called in the outcome. */
interface WipeStep {
    /** "Could not remove 2 of the products": the verb and the kind, plural. */
    failed: string;
    stage: string;
    ids: string[];
    write: (commerce: RemovalAccess, id: string) => Promise<void>;
}

/** What the clearing did. */
export interface WipeOutcome {
    removed: { customers: number; products: number; takenOff: number; categories: number };
    /** Each step with refusals: how many, and the first in Commerce's words. */
    failed: Array<{ what: string; count: number; first: string }>;
    sentence: string;
}

function stepsOf(plan: WipePlan): Record<keyof WipeOutcome['removed'], WipeStep> {
    return {
        customers: { failed: 'remove 1 of the customers', stage: 'Removing customers', ids: plan.customerIds, write: (c, id) => removeCustomer(c.send, id) },
        products: { failed: 'remove 1 of the products', stage: 'Removing products', ids: plan.deleteSkus, write: (c, sku) => removeProduct(c.send, sku) },
        takenOff: {
            failed: 'take 1 of the products off the website',
            stage: 'Taking products off the website',
            ids: plan.takeOffSkus,
            write: (c, sku) => deleteIfPresent(c.send, `products/${encodeURIComponent(sku)}/websites/${segment(plan.websiteId)}`),
        },
        categories: { failed: 'remove 1 of the categories', stage: 'Removing categories', ids: plan.categoryIds, write: (c, id) => removeCategory(c.send, id) },
    };
}

const counted = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function sentenceOf(website: string, removed: WipeOutcome['removed'], failed: WipeOutcome['failed']): string {
    const parts = [
        removed.products > 0 ? counted(removed.products, 'product', 'products') : '',
        removed.categories > 0 ? counted(removed.categories, 'category', 'categories') : '',
        removed.customers > 0 ? counted(removed.customers, 'customer', 'customers') : '',
    ].filter(Boolean);
    const did = parts.length > 0 ? `Removed ${andList(parts)} from ${website}.` : `Removed nothing from ${website}.`;
    const off = removed.takenOff > 0 ? ` Took ${counted(removed.takenOff, 'product', 'products')} another website also sells off ${website}.` : '';
    const not = failed.map((f) => ` Could not ${f.what.replace('1', String(f.count))} (${f.first}).`).join('');
    return `${did}${off}${not}`;
}

/**
 * Carry a plan out, as made: every write named in it, in order, counting what Commerce refused.
 *
 * @param report - called as each kind starts, for the progress window
 */
export async function runWipe(commerce: RemovalAccess, plan: WipePlan, report: (stage: string) => void = () => undefined): Promise<WipeOutcome> {
    const removed: WipeOutcome['removed'] = { customers: 0, products: 0, takenOff: 0, categories: 0 };
    const failed: WipeOutcome['failed'] = [];
    for (const [key, step] of Object.entries(stepsOf(plan)) as Array<[keyof WipeOutcome['removed'], WipeStep]>) {
        if (step.ids.length > 0) report(step.stage);
        const refused: string[] = [];
        for (const id of step.ids) {
            try {
                await step.write(commerce, id);
                removed[key] += 1;
            } catch (error) {
                refused.push(`${id}: ${errorText(error)}`);
            }
        }
        if (refused.length > 0) failed.push({ what: step.failed, count: refused.length, first: refused[0] });
    }
    return { removed, failed, sentence: sentenceOf(plan.preview.website.code, removed, failed) };
}

/**
 * Clear the website as shown: make the plan again, refuse when it takes anything the shown plan did
 * not, then carry it out.
 *
 * @throws WipeChangedError, writing nothing, when the store would now clear something not shown
 */
export async function clearShown(
    commerce: RemovalAccess,
    shown: WipePlan,
    records: readonly InstallRecord[],
    report?: (stage: string) => void,
): Promise<WipeOutcome> {
    const now = await planWipe(commerce.get, shown.preview.website.code, records);
    if (!withinPlan(shown, now)) throw new WipeChangedError(now.preview);
    return runWipe(commerce, now, report);
}
