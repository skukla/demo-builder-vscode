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

/** A count as the SC reads it: 1,284. */
const digits = (count: number): string => count.toLocaleString('en-US');

const plural = (count: number, one: string, many: string): string => `${digits(count)} ${count === 1 ? one : many}`;

/** Each kind's word for one of it. */
const ONE: Record<WipeKind, string> = {
    products: 'product',
    categories: 'category',
    customers: 'customer',
    orders: 'order',
    'cart rules': 'cart rule',
    companies: 'company',
    'shared catalogs': 'shared catalog',
    'customer groups': 'customer group',
    'attribute sets': 'attribute set',
    attributes: 'attribute',
    settings: 'setting',
};

/** "3 to remove", or nothing for none. */
function countOf(count: number, what: string): string {
    return count > 0 ? `${digits(count)} ${what}` : '';
}

/** One labelled line of the list. */
export interface PreviewLine {
    label: string;
    value: string;
}

/** "12 to cancel, 4 to refund, 1 to leave open with a note, 2 returns to close", or nothing. */
function ordersValue(orders: WipePreview['orders']): string {
    const parts = [
        countOf(orders.cancel.count, 'to cancel'),
        countOf(orders.refund.count, 'to refund'),
        countOf(orders.leftOpen.count, 'to leave open with a note'),
        orders.returns.count > 0 ? `${plural(orders.returns.count, 'return', 'returns')} to close` : '',
    ].filter(Boolean);
    return parts.join(', ');
}

/** "2 companies (Acme and Bravo): why", or "5 products (A, B, C and 2 more): why": what stays, named. */
function stayValue(left: WipePreview['left'][number]): string {
    const more = left.count - left.names.length;
    const names = [...left.names, ...(more > 0 && left.names.length > 0 ? [`${digits(more)} more`] : [])];
    const listed = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join('');
    return `${plural(left.count, ONE[left.kind], left.kind)}${listed ? ` (${listed})` : ''}: ${left.why}`;
}

/** "2 set to the default's value", and what Commerce can't do about them; or nothing. */
function settingsValue(count: number): string {
    if (count === 0) return '';
    return `${digits(count)} set to the default's value. Commerce can't clear a website's own value, so a later change to the default won't reach ${count === 1 ? 'it' : 'them'}.`;
}

/** What the clearing would do, kind by kind, then what it leaves and what Demo Builder installed. */
export function previewLines(preview: WipePreview): PreviewLine[] {
    const { remove, takenOff, rulesTakenOff, orders, installed } = preview;
    const products = [countOf(remove.products.count, 'to remove'), countOf(takenOff.count, 'taken off the chosen websites')].filter(Boolean).join(', ');
    const rules = [countOf(remove.cartRules.count, 'to remove, with their coupons'), countOf(rulesTakenOff.count, 'taken off the chosen websites')].filter(Boolean).join(', ');
    const lines: PreviewLine[] = [
        { label: 'Products', value: products },
        { label: 'Categories', value: countOf(remove.categories.count, 'to remove') },
        { label: 'Customers', value: countOf(remove.customers.count, 'to remove') },
        { label: 'Cart Rules', value: rules },
        { label: 'Companies', value: countOf(remove.companies.count, 'to remove, with their customers') },
        { label: 'Shared Catalogs', value: countOf(remove.catalogs.count, remove.catalogs.count === 1 ? 'to remove, with its customer group' : 'to remove, with their customer groups') },
        { label: 'Customer Groups', value: countOf(remove.customerGroups.count, 'to remove') },
        { label: 'Attribute Sets', value: countOf(remove.attributeSets.count, 'to remove') },
        { label: 'Attributes', value: countOf(remove.attributes.count, 'to remove') },
        { label: 'Website Settings', value: settingsValue(preview.settings.count) },
        { label: 'Orders', value: ordersValue(orders) },
        // The orders an ERP integration closes, or why it leaves them: its own one line.
        { label: 'ERP', value: preview.erp?.line ?? '' },
        ...preview.left.map((l) => ({ label: 'Not Removed', value: stayValue(l) })),
    ];
    const made = Object.entries(installed).map(([kind, count]) => `${digits(count)} ${kind.replace(/_/gu, ' ')}`);
    if (made.length > 0) lines.push({ label: 'Installed', value: `${made.join(', ')}, which removing its datapack takes` });
    return lines.filter((l) => l.value !== '');
}

/** The clear button: how many things, or nothing to clear. */
export function clearLabel(total: number): string {
    return total === 1 ? 'Clear 1 Item' : `Clear ${digits(total)} Items`;
}
