/**
 * "Clear demo data" (datapack-engine step 10), the parts with no React in them: which stores the
 * ticks name, what ticking a website does, and the check's answer as the lines the modal lists.
 *
 * A website's tick stands for all of its stores (owner, 2026-10-30); a store another local project
 * records as its own (`claimedBy`) is never ticked, so a website holding one can be only partly
 * chosen from here.
 *
 * @module features/data-installer/ui/clearDemoDataWords
 */

import type { WipeChoiceWebsite, WipeKind, WipePreview, WipeStoreChoice } from '@/types/demoDataWipe';

/** One store's tick, by website and store code. */
export const tickOf = (websiteCode: string, storeCode: string): string => `${websiteCode}/${storeCode}`;

/** The stores the ticks name. Commerce codes hold letters, digits and underscores, never "/". */
export function choicesOfTicks(ticks: ReadonlySet<string>): WipeStoreChoice[] {
    return [...ticks].sort().map((tick) => {
        const [websiteCode, storeCode] = tick.split('/');
        return { websiteCode, storeCode };
    });
}

/** A website's row: the stores it can tick, and whether all or some are. */
export function websiteTicks(site: WipeChoiceWebsite, ticks: ReadonlySet<string>): { open: string[]; all: boolean; some: boolean } {
    const open = site.stores.filter((s) => !s.claimedBy).map((s) => tickOf(site.code, s.code));
    const count = open.filter((t) => ticks.has(t)).length;
    return { open, all: open.length > 0 && count === open.length, some: count > 0 && count < open.length };
}

/** Tick every store of the website it can, or untick them all when every one is ticked. */
export function toggleWebsite(site: WipeChoiceWebsite, ticks: ReadonlySet<string>): Set<string> {
    const { open, all } = websiteTicks(site, ticks);
    const next = new Set(ticks);
    for (const tick of open) {
        if (all) next.delete(tick);
        else next.add(tick);
    }
    return next;
}

/** Tick or untick one store. */
export function toggleStore(tick: string, ticks: ReadonlySet<string>): Set<string> {
    const next = new Set(ticks);
    if (next.has(tick)) next.delete(tick);
    else next.add(tick);
    return next;
}

/** "Views: English, French", the views a store's row lists under its name. */
export function viewsLine(views: readonly string[]): string {
    if (views.length === 0) return 'No store views';
    return `${views.length === 1 ? 'View' : 'Views'}: ${views.join(', ')}`;
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/** Each kind's word for one of it. */
const ONE: Record<WipeKind, string> = { products: 'product', categories: 'category', customers: 'customer', orders: 'order' };

/** "3 to remove", or nothing for none. */
function countOf(count: number, what: string): string {
    return count > 0 ? `${count} ${what}` : '';
}

/** One labelled line of the list. */
export interface PreviewLine {
    label: string;
    value: string;
}

/** "12 to cancel, 4 to refund, 1 to leave open with a note, 2 returns to close", or nothing. */
function ordersValue(orders: WipePreview['orders']): string {
    const parts = [
        orders.cancel.count > 0 ? `${orders.cancel.count} to cancel` : '',
        orders.refund.count > 0 ? `${orders.refund.count} to refund` : '',
        orders.leftOpen.count > 0 ? `${orders.leftOpen.count} to leave open with a note` : '',
        orders.returns.count > 0 ? `${plural(orders.returns.count, 'return', 'returns')} to close` : '',
    ].filter(Boolean);
    return parts.join(', ');
}

/** What the clearing would do, kind by kind, then what it leaves and what Demo Builder installed. */
export function previewLines(preview: WipePreview): PreviewLine[] {
    const { remove, takenOff, orders, installed } = preview;
    const products = [countOf(remove.products.count, 'to remove'), countOf(takenOff.count, 'taken off the chosen websites')].filter(Boolean).join(', ');
    const lines: PreviewLine[] = [
        { label: 'Products', value: products },
        { label: 'Categories', value: remove.categories.count > 0 ? `${remove.categories.count} to remove` : '' },
        { label: 'Customers', value: remove.customers.count > 0 ? `${remove.customers.count} to remove` : '' },
        { label: 'Orders', value: ordersValue(orders) },
        ...preview.left.map((l) => ({ label: 'Left', value: `${plural(l.count, ONE[l.kind], l.kind)}: ${l.why}` })),
    ];
    const made = Object.entries(installed).map(([kind, count]) => `${count} ${kind.replace(/_/gu, ' ')}`);
    if (made.length > 0) lines.push({ label: 'Installed', value: `${made.join(', ')}, which removing its datapack takes` });
    return lines.filter((l) => l.value !== '');
}

/** The clear button: how many things, or nothing to clear. */
export function clearLabel(total: number): string {
    return total === 1 ? 'Clear 1 thing' : `Clear ${total} things`;
}
