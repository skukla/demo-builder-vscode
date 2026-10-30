/**
 * The ERP part of a wipe ("One action, ERP included", owner 2026-10-30: "You wanna wipe. That
 * should wipe. I shouldn't have to wipe things in two separate systems"). When an ERP integration
 * serves the instance (from ANY local project: it installs into the whole instance, AB-78) and sends
 * the orders of some chosen stores' websites to an ERP, the wipe does not close those orders itself:
 * its own cancel or refund would be passed on to the ERP by the integration's order handlers, which
 * stay silent only for orders the integration marked closed first (`commerce-erp-integration`
 * `lib/reset-closed.js`). So:
 *
 * 1. **Before the clearing, the integration closes EVERY order of those stores** (not only the ones
 *    an ERP holds: one it never got would be sent as new by the first save to it), by the same one
 *    reset rule, and each ERP that held one removes its documents for them
 *    (`ErpIntegrationClient.closeOrders`, `erp/close-orders`). The wipe runs no order rule of its own
 *    there. Only when the deployment says it can (`erp/status` `closesOrdersByStore`); one that
 *    cannot, or cannot be asked, is never called, those orders are left open, and the list says why.
 * 2. **After it, the ERP is filled again from Commerce** (`fillEveryErp`, what the ERP reset runs
 *    after its wipe). The close already took the stores' orders out of the ERP; a fill adds and
 *    updates, so it is safe.
 * 3. Orders on websites it does not route stay the wipe's own (`wipeOrders.ts`), as before.
 *
 * | Read or call | Endpoint and field | Confirmed? |
 * |---|---|---|
 * | which websites send orders | `GET erp/settings?websites=`, `websites.<code>.orders_send` (else `default.orders_send`) | the route and field yes (the integration's `order-sync.js` `readyToSend`; JustRite answered `true` for every website, 2026-10-30) |
 * | whether it closes by store | `GET erp/status`, `closesOrdersByStore` | from the integration's code (`actions/erp/status`, a2556c2); not yet from a deployment |
 * | the close | `POST erp/close-orders` `{ run, stores }` (store group codes), `GET erp/close-orders?run=`; answer `ErpStoreCloseReport` | from the integration's code and box test (`test/box/close-store-orders.test.js`, 1f6de21); not yet from a deployment |
 *
 * Pure but for the calls the handed-in `WipeErpLink` makes; `wipeErpDeps.ts` builds the link.
 *
 * @module features/data-installer/services/demoDataWipe/wipeErp
 */

import { orderStepOf } from './wipeOrders';
import type { WipeScope } from './wipeScope';
import { andList } from '@/core/utils/andList';
import { DATAPACK_STAGES } from '@/core/utils/datapackStages';
import type { ResolvedErpSettings } from '@/features/app-builder/services/erpFill';
import type { ErpIntegrationClient } from '@/features/app-builder/services/erpIntegrationClient';
import { errorText } from '@/features/app-builder/services/storePreparation/fixContract';
import type { CommerceOrder } from '@/types/commerceWire';
import type { WipeErpPart } from '@/types/demoDataWipe';
import type { ErpOrdersRemoved, ErpStoreCloseReport } from '@/types/erpIntegration';

/** The integration's calls the wipe makes. */
export type WipeErpClient = Pick<ErpIntegrationClient, 'status' | 'resolvedSettings' | 'closeOrders'>;

/** The ERP integration serving the instance, as found among the local projects. */
export interface WipeErpLink {
    /** Its project: as the SC knows it ("JustRite"), and its folder name. */
    project: { displayName: string; name: string };
    integrationId: string;
    /** Its ERPs' names by their list id ("justrite" → "Justrite ERP"): what `erpRemoved` is keyed by. */
    erpNames: Record<string, string>;
    /** Its client, signed in; or why there is none. */
    client: () => Promise<WipeErpClient | { refusal: string }>;
    /** Fill every ERP it serves from Commerce again: why not, or what the SC should know. */
    refill: (onProgress: (step: string) => void) => Promise<{ failed?: string; warning?: string }>;
}

/** Which chosen websites it routes, and why their orders are left this time, if they are. */
export interface WipeErpRoute {
    name: string;
    websites: string[];
    held?: string;
}

/** The integration as the wipe uses it. */
export interface WipeErp {
    name: string;
    /** Of these website codes, the ones whose orders go to an ERP; undefined when none do. */
    route: (websiteCodes: readonly string[]) => Promise<WipeErpRoute | undefined>;
    /** Close every order of those stores (store group codes), and nothing else. */
    close: (stores: readonly string[], onProgress: (step: string) => void) => Promise<ErpStoreCloseReport>;
    refill: WipeErpLink['refill'];
    erpNames: Record<string, string>;
}

/** The ERP part of a plan: the stores the integration is asked to close, and their open orders. */
export interface WipeErpPlan {
    route: WipeErpRoute;
    /** The chosen stores on the routed websites, by store (group) code. */
    stores: string[];
    orders: Array<{ id: string; number: string }>;
}

/** What the integration's close did, in the wipe's counts. */
export interface ErpClosed {
    counts: { cancelled: number; refunded: number; commented: number; alreadyClosed: number; returnsClosed: number; failed: number };
    /** Every order it touched, by number. */
    orderNumbers: string[];
    /** The ERPs that removed the orders' documents, by name. */
    removedFrom: string[];
    /** The ERPs that did not, each with why, in words. */
    notRemoved: string[];
    failed?: { what: string; count: number; first: string };
}

/** Whether a website's settings send its orders to an ERP (`orders_send`, a boolean; "true" read the same). */
const sendsOrders = (settings: ResolvedErpSettings['default'] | undefined): boolean =>
    settings?.orders_send === true || settings?.orders_send === 'true';

const unasked = (reason: string): string => `it could not be asked (${reason.replace(/\.$/u, '')}), so a wipe cannot close them`;

function updateFirst(link: WipeErpLink): string {
    return (
        'it must be updated before a wipe can close them: open the project ' +
        `${link.project.name} and update ${link.integrationId} (Update on its card, or update_integration), then check again`
    );
}

/** The routed websites, from the integration's answers. */
export function routeFrom(link: WipeErpLink, codes: readonly string[], settings: ResolvedErpSettings, closesByStore: boolean): WipeErpRoute | undefined {
    const websites = codes.filter((code) => sendsOrders(settings.websites?.[code] ?? settings.default));
    if (websites.length === 0) return undefined;
    const name = link.project.displayName;
    return closesByStore ? { name, websites } : { name, websites, held: updateFirst(link) };
}

/**
 * The integration as the wipe uses it. An integration that cannot be asked holds every chosen
 * website's orders: the wipe never closes an order an ERP may hold.
 */
export function wipeErpOf(link: WipeErpLink): WipeErp {
    const name = link.project.displayName;
    const signedIn = async (): Promise<WipeErpClient> => {
        const client = await link.client();
        if ('refusal' in client) throw new Error(client.refusal);
        return client;
    };
    return {
        name,
        route: async (codes) => {
            if (codes.length === 0) return undefined;
            try {
                const client = await signedIn();
                const [status, settings] = await Promise.all([client.status(), client.resolvedSettings([...codes])]);
                return routeFrom(link, codes, settings, status.closesOrdersByStore === true);
            } catch (error) {
                return { name, websites: [...codes], held: unasked(errorText(error)) };
            }
        },
        close: async (stores, onProgress) => (await signedIn()).closeOrders(stores, onProgress),
        refill: link.refill,
        erpNames: link.erpNames,
    };
}

/** Every website a scope's stores are on, each once. */
export const websiteCodesOf = (scope: WipeScope): string[] => [...new Set(scope.stores.map((s) => s.website.code))];

/** The chosen stores' orders: those on websites the integration routes, and the wipe's own. */
export function splitByErp(scope: WipeScope, route: WipeErpRoute | undefined, orders: readonly CommerceOrder[]): { own: CommerceOrder[]; erp: CommerceOrder[] } {
    const routed = new Set(scope.stores.filter((s) => route?.websites.includes(s.website.code)).flatMap((s) => s.views.map((v) => v.id)));
    return { own: orders.filter((o) => !routed.has(Number(o.store_id))), erp: orders.filter((o) => routed.has(Number(o.store_id))) };
}

/**
 * The ERP part of a plan, from the routed websites' orders. Orders closed before are counted as the
 * wipe's own when they are left (`held`); else the integration's answer counts them.
 */
export function erpPlanOf(scope: WipeScope, route: WipeErpRoute, orders: readonly CommerceOrder[]): { plan: WipeErpPlan; alreadyClosed: number } {
    const open = orders.filter((o) => orderStepOf(o) !== 'done');
    const stores = scope.stores.filter((s) => route.websites.includes(s.website.code)).map((s) => s.code);
    return {
        plan: { route, stores, orders: open.map((o) => ({ id: String(o.entity_id), number: o.increment_id ?? String(o.entity_id) })) },
        alreadyClosed: route.held ? orders.length - open.length : 0,
    };
}

/** The order ids the integration will be asked to close: none when it is held. */
export const erpCloseIds = (plan: WipeErpPlan | undefined): string[] => (plan && !plan.route.held ? plan.orders.map((o) => o.id) : []);

const ordersWord = (count: number): string => `${count} ${count === 1 ? 'order' : 'orders'}`;

/** The list's one line for the ERP part. */
function lineOf({ route, orders }: WipeErpPlan): string {
    const who = `the ERP integration (${route.name})`;
    const count = orders.length;
    const one = count === 1;
    if (route.held && count > 0) return `${ordersWord(count)} handled by ${who} ${one ? 'is' : 'are'} left open: ${route.held}.`;
    if (route.held) return `The ERP integration (${route.name}) serves these stores, but ${route.held}. It has no open orders here.`;
    if (count === 0) return `The ERP integration (${route.name}) serves these stores: its ERP is refreshed from Commerce after the clearing.`;
    return `${ordersWord(count)} ${one ? 'is' : 'are'} handled by ${who}: ${one ? 'it' : 'they'} will be closed there, removed from its ERP, and the ERP refreshed.`;
}

/** The ERP part as the SC and the agent see it. */
export function erpPartOf(plan: WipeErpPlan, named: (names: string[]) => WipeErpPart['orders']): WipeErpPart {
    return {
        integration: plan.route.name,
        websites: plan.route.websites,
        orders: named(plan.orders.map((o) => o.number)),
        ...(plan.route.held ? { held: plan.route.held } : {}),
        line: lineOf(plan),
    };
}

function failedClose(plan: WipeErpPlan, what: string, reason: string): ErpClosed {
    const count = plan.orders.length;
    const counts = { cancelled: 0, refunded: 0, commented: 0, alreadyClosed: 0, returnsClosed: 0, failed: count };
    return { counts, orderNumbers: [], removedFrom: [], notRemoved: [], failed: { what, count, first: reason } };
}

/** One ERP's answer to the removal, in words: removed, or why not. */
function removalOf(name: string, answer: ErpOrdersRemoved): { removed: boolean } | { not: string } {
    if (answer === 'unsupported') return { not: `${name} keeps its copies of them: it must be updated to remove orders` };
    if ('failed' in answer) return { not: `${name} could not remove them (${answer.failed.replace(/\.$/u, '')})` };
    return { removed: Number(answer.removed.salesOrders ?? 0) > 0 };
}

/** The integration's answer in the wipe's counts and words. */
function closedOf(report: ErpStoreCloseReport, names: Record<string, string>, what: string): ErpClosed {
    const { closed } = report;
    const removedFrom: string[] = [];
    const notRemoved: string[] = [];
    for (const [id, answer] of Object.entries(report.erpRemoved ?? {})) {
        const said = removalOf(names[id] ?? id, answer);
        if ('not' in said) notRemoved.push(said.not);
        else if (said.removed) removedFrom.push(names[id] ?? id);
    }
    const { failed, partsRemoved: _parts, ...counts } = closed;
    const [first] = failed;
    return {
        counts: { ...counts, failed: failed.length },
        orderNumbers: (report.touched ?? []).map((t) => t.orderId),
        removedFrom,
        notRemoved,
        ...(first ? { failed: { what, count: failed.length, first: first.error } } : {}),
    };
}

/**
 * Ask the integration to close every order of the routed stores, whenever it serves them (an order
 * closed before is its to forget and take out of the ERP too). Never throws: a close that fails is
 * counted and named, and the rest of the clearing carries on.
 */
export async function closeErpOrders(erp: WipeErp | undefined, plan: WipeErpPlan | undefined, report: (stage: string, step?: string) => void): Promise<ErpClosed | undefined> {
    if (!erp || !plan || plan.route.held) return undefined;
    const stage = DATAPACK_STAGES.closingErpOrders.label;
    report(stage);
    const what = `close 1 of the orders through the ERP integration (${plan.route.name})`;
    try {
        const answer = await erp.close(plan.stores, (step) => report(stage, step));
        return answer?.closed ? closedOf(answer, erp.erpNames, what) : failedClose(plan, what, 'it answered without closing them');
    } catch (error) {
        return failedClose(plan, what, errorText(error));
    }
}

/** What the refresh did: refreshed or not, and what the fill said. */
export interface ErpRefreshed {
    refreshed: boolean;
    said?: string;
}

/** Fill the integration's ERPs from Commerce again, after the clearing. Never throws. */
export async function refreshErp(erp: WipeErp | undefined, plan: WipeErpPlan | undefined, report: (stage: string, step?: string) => void): Promise<ErpRefreshed | undefined> {
    if (!erp || !plan || plan.route.held) return undefined;
    const stage = DATAPACK_STAGES.refreshingErp.label;
    report(stage);
    try {
        const filled = await erp.refill((step) => report(stage, step));
        return filled.failed ? { refreshed: false, said: filled.failed } : { refreshed: true, ...(filled.warning ? { said: filled.warning } : {}) };
    } catch (error) {
        return { refreshed: false, said: errorText(error) };
    }
}

/** " 2 of the orders were closed through the ERP integration (JustRite), and removed from Justrite ERP.", or what of it there was. */
function closedSentence(name: string, closed: ErpClosed | undefined): string {
    if (!closed) return '';
    const count = closed.counts.cancelled + closed.counts.refunded + closed.counts.commented;
    const from = closed.removedFrom.length > 0 ? andList(closed.removedFrom) : '';
    const not = closed.notRemoved.map((line) => ` ${line.charAt(0).toUpperCase()}${line.slice(1)}.`).join('');
    if (count === 0) return `${from ? ` The stores' orders were removed from ${from}.` : ''}${not}`;
    const which = count === 1 ? '1 of the orders was' : `${count} of the orders were`;
    return ` ${which} closed through the ERP integration (${name})${from ? `, and removed from ${from}` : ''}.${not}`;
}

/** The outcome's words for the ERP part, or nothing. */
export function erpSentence(plan: WipeErpPlan | undefined, closed: ErpClosed | undefined, refreshed: ErpRefreshed | undefined): string {
    if (!plan) return '';
    const { name, held } = plan.route;
    if (held) return plan.orders.length > 0 ? ` Left ${ordersWord(plan.orders.length)} the ERP integration (${name}) handles open: ${held}.` : '';
    const through = closedSentence(name, closed);
    if (!refreshed) return through;
    if (!refreshed.refreshed) return `${through} ${name}'s ERP was not refreshed from Commerce: ${(refreshed.said ?? '').replace(/\.$/u, '')}.`;
    return `${through} ${name}'s ERP was refreshed from Commerce.${refreshed.said ? ` ${refreshed.said}` : ''}`;
}
