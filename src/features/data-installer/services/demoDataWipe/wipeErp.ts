/**
 * The ERP part of a wipe ("One action, ERP included", owner 2026-10-30: "You wanna wipe. That
 * should wipe. I shouldn't have to wipe things in two separate systems"). Commerce is the source
 * system (owner, 2026-11-11, erp-order-close step 5): the wipe closes EVERY demo order of the chosen
 * stores itself, by the one reset rule (`wipeOrders.ts`), including orders on websites an ERP
 * integration sends to an ERP. The integration recognises those closes by the reset note Commerce
 * keeps first in each order's history, so it passes nothing on to an ERP. When an ERP integration
 * serves the instance (from ANY local project: it installs into the whole instance, AB-78) and routes
 * some chosen stores' websites, the ERP is brought in line AFTERWARDS, as its own step:
 *
 * 1. **After the clearing, the integration is asked to close the routed stores' orders**
 *    (`ErpIntegrationClient.closeOrders`, `erp/close-orders`). Every order is already Canceled or
 *    Closed, so it writes nothing to their state: it drops its own parts records, clears each order's
 *    ERP number, and asks each ERP that held one to remove its sales orders for them (`erpRemoved`).
 *    Only when the deployment says it can (`erp/status` `closesOrdersByStore`).
 * 2. **Then the ERP is filled again from Commerce** (`fillEveryErp`, what the ERP reset runs after
 *    its wipe). A fill adds and updates, so it is safe.
 * 3. **Held** (the deployment must be updated, or could not be asked): the orders are still closed,
 *    the ERP step is skipped, and the outcome says the ERP was not brought in line and why. Never a
 *    reason to leave an order open. A failing close or refill is reported the same way, as an ERP
 *    problem: never counted as orders that failed to close.
 *
 * | Read or call | Endpoint and field | Confirmed? |
 * |---|---|---|
 * | which websites send orders | `GET erp/settings?websites=`, `websites.<code>.orders_send` (else `default.orders_send`) | the route and field yes (the integration's `order-sync.js` `readyToSend`; JustRite answered `true` for every website, 2026-10-30) |
 * | whether it closes by store | `GET erp/status`, `closesOrdersByStore` | from the integration's code (`actions/erp/status`, a2556c2); not yet from a deployment |
 * | bringing the ERP in line | `POST erp/close-orders` `{ run, stores }` (store group codes), `GET erp/close-orders?run=`; answer `ErpStoreCloseReport` | from the integration's code and box test (`test/box/close-store-orders.test.js`, 1f6de21); that an order already closed gets no state write: its `src/lib/close-orders.js` `closeOne` (`plan === "done"`), branch `one-reset-rule`; not yet from a deployment |
 *
 * Pure but for the calls the handed-in `WipeErpLink` makes; `wipeErpDeps.ts` builds the link.
 *
 * @module features/data-installer/services/demoDataWipe/wipeErp
 */

import type { WipeScope } from './wipeScope';
import { andList } from '@/core/utils/andList';
import { DATAPACK_STAGES } from '@/core/utils/datapackStages';
import type { ResolvedErpSettings } from '@/features/app-builder/services/erpFill';
import type { ErpIntegrationClient } from '@/features/app-builder/services/erpIntegrationClient';
import { errorText } from '@/features/app-builder/services/storePreparation/fixContract';
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

/** Which chosen websites it routes, and why its ERP is not brought in line this time, if it is not. */
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
    /** Bring its ERP in line for those stores (store group codes): `erp/close-orders`. */
    close: (stores: readonly string[], onProgress: (step: string) => void) => Promise<ErpStoreCloseReport>;
    refill: WipeErpLink['refill'];
    erpNames: Record<string, string>;
}

/** The ERP part of a plan: the route, and the routed stores its ERP is brought in line for. */
export interface WipeErpPlan {
    route: WipeErpRoute;
    /** The chosen stores on the routed websites, by store (group) code. */
    stores: string[];
}

/** What asking the integration to bring its ERP in line did. */
export interface ErpClosed {
    /** The ERPs that removed the orders' documents, by name. */
    removedFrom: string[];
    /** The ERPs that did not, each with why, in words. */
    notRemoved: string[];
    /** Why the ERP was not brought in line, in words; absent when it was. */
    problem?: string;
}

/** Whether a website's settings send its orders to an ERP (`orders_send`, a boolean; "true" read the same). */
const sendsOrders = (settings: ResolvedErpSettings['default'] | undefined): boolean =>
    settings?.orders_send === true || settings?.orders_send === 'true';

const trimmed = (text: string): string => text.replace(/\.$/u, '');

const unasked = (reason: string): string => `it could not be asked (${trimmed(reason)})`;

function updateFirst(link: WipeErpLink): string {
    return (
        'it must be updated first. Open the project ' +
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
 * The integration as the wipe uses it. One that cannot be asked holds the ERP step for every chosen
 * website: the orders are closed all the same.
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

/** The ERP part of a plan: the chosen stores on the routed websites. */
export function erpPlanOf(scope: WipeScope, route: WipeErpRoute): WipeErpPlan {
    return { route, stores: scope.stores.filter((s) => route.websites.includes(s.website.code)).map((s) => s.code) };
}

/** The store codes the integration will be asked about: none when it is held. */
export const erpStoresAsked = (plan: WipeErpPlan | undefined): string[] => (plan && !plan.route.held ? plan.stores : []);

/** The list's one line for the ERP part. */
function lineOf({ route }: WipeErpPlan): string {
    const who = `The ERP integration (${route.name}) serves these websites`;
    if (route.held) return `${who}, but ${route.held}. Its ERP will not be brought in line.`;
    return `${who}: its ERP is brought in line with Commerce after the clearing.`;
}

/** The ERP part as the SC and the agent see it. */
export function erpPartOf(plan: WipeErpPlan): WipeErpPart {
    return {
        integration: plan.route.name,
        websites: plan.route.websites,
        ...(plan.route.held ? { held: plan.route.held } : {}),
        line: lineOf(plan),
    };
}

/** One ERP's answer to the removal, in words: removed, or why not. */
function removalOf(name: string, answer: ErpOrdersRemoved): { removed: boolean } | { not: string } {
    if (answer === 'unsupported') return { not: `${name} keeps its copies of them: it must be updated to remove orders` };
    if ('failed' in answer) return { not: `${name} could not remove them (${trimmed(answer.failed)})` };
    return { removed: Number(answer.removed.salesOrders ?? 0) > 0 };
}

/** The integration's answer in words. Its order counts are not read: the wipe closed the orders. */
function closedOf(report: ErpStoreCloseReport, names: Record<string, string>): ErpClosed {
    const removedFrom: string[] = [];
    const notRemoved: string[] = [];
    for (const [id, answer] of Object.entries(report.erpRemoved ?? {})) {
        const said = removalOf(names[id] ?? id, answer);
        if ('not' in said) notRemoved.push(said.not);
        else if (said.removed) removedFrom.push(names[id] ?? id);
    }
    const { failed } = report.closed;
    const [first] = failed;
    const problem = first ? `it could not finish ${failed.length} of the orders (${trimmed(first.error)})` : undefined;
    return { removedFrom, notRemoved, ...(problem ? { problem } : {}) };
}

/**
 * Ask the integration to bring its ERP in line for the routed stores, after the wipe closed their
 * orders. Never throws: a call that fails is an ERP problem, in words.
 */
export async function closeErpOrders(erp: WipeErp | undefined, plan: WipeErpPlan | undefined, report: (stage: string, step?: string) => void): Promise<ErpClosed | undefined> {
    if (!erp || !plan || plan.route.held) return undefined;
    const stage = DATAPACK_STAGES.updatingErp.label;
    report(stage);
    try {
        const answer = await erp.close(plan.stores, (step) => report(stage, step));
        return answer?.closed ? closedOf(answer, erp.erpNames) : { removedFrom: [], notRemoved: [], problem: 'it answered without bringing it in line' };
    } catch (error) {
        return { removedFrom: [], notRemoved: [], problem: `it could not be asked to (${trimmed(errorText(error))})` };
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

/** Why the ERP was not brought in line, in words; absent when it was. */
export function erpProblemOf(plan: WipeErpPlan, closed: ErpClosed | undefined, refreshed: ErpRefreshed | undefined): string | undefined {
    if (plan.route.held) return plan.route.held;
    const why = [
        closed?.problem ?? '',
        refreshed && !refreshed.refreshed ? `it was not filled again from Commerce (${trimmed(refreshed.said ?? '')})` : '',
    ].filter(Boolean);
    return why.length > 0 ? andList(why) : undefined;
}

/** " These websites' orders were removed from Justrite ERP. Accuform ERP could not remove them (...).", or nothing. */
function removalSentence(closed: ErpClosed | undefined): string {
    if (!closed) return '';
    const from = closed.removedFrom.length > 0 ? ` These websites' orders were removed from ${andList(closed.removedFrom)}.` : '';
    return `${from}${closed.notRemoved.map((line) => ` ${line.charAt(0).toUpperCase()}${line.slice(1)}.`).join('')}`;
}

/** The outcome's words for the ERP part, or nothing. */
export function erpSentence(plan: WipeErpPlan | undefined, closed: ErpClosed | undefined, refreshed: ErpRefreshed | undefined): string {
    if (!plan) return '';
    const { name } = plan.route;
    const problem = erpProblemOf(plan, closed, refreshed);
    const verdict = problem ? ` ${name}'s ERP was not brought in line with Commerce: ${problem}.` : ` ${name}'s ERP was brought in line with Commerce.`;
    const warning = refreshed?.refreshed && refreshed.said ? ` ${refreshed.said}` : '';
    return `${verdict}${removalSentence(closed)}${warning}`;
}
