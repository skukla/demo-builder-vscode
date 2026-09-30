/**
 * The ERP integration's own actions, as Demo Builder calls them: `erp/status`, `erp/lookup` and
 * `erp/history` (what the integration sees of its ERP), `erp/settings` (the settings in force,
 * which the ERP fill sorts records by), `erp/keymap` and `erp/erps` (the key map and the list of
 * ERPs, both replaced whole by Demo Builder), `erp/prices` (publish an ERP's customer prices into
 * the companies' shared catalogs, run after every fill, AB-26z) and `erp/detach` (undo what the
 * integration wrote into Commerce, run by a reset and before the integration is removed). The
 * reset and the fill are Demo Builder's own since 2026-09-27 (AB-26y).
 *
 * All are web actions with `require-adobe-auth`, so they take the same
 * bearer token and org header the App Management client sends. The URLs come
 * off the integration's persisted `deployedUrls`, never composed by hand: the
 * package name is the kit's fixed `erp`, and the action URL is whatever the
 * deploy answered.
 *
 * @module features/app-builder/services/erpIntegrationClient
 */

import type { AppManagementAuth } from './appManagementClient';
import type { ErpKeyMapEntry, ResolvedErpSettings } from './erpFill';
import type { ErpListEntry } from './erpList';

/** What `erp/status` answers (the integration's `actions/erp/status`). */
export interface ErpIntegrationStatus {
    app: { id: string; version: string };
    erp: {
        reachable: boolean;
        ok?: boolean;
        status?: number;
        error?: string;
        [key: string]: unknown;
    };
    erpBaseUrl: string | null;
    ledger: { entries: number };
    /** Whether `erp/detach` closes off the ERPs' orders when asked (`closeOrders`, AB-16n). */
    closesOrdersOnReset?: boolean;
}

/**
 * What `erp/detach` answers: the company writes undone and the ERP order numbers cleared, and
 * `closed`, present only when it closed off the orders the ERPs hold (AB-16n): orders
 * cancelled, orders only noted (invoiced or shipped), orders an earlier reset closed, parts
 * records removed, and each order it could not close, in words.
 */
export interface ErpDetachReport {
    reverted?: { reverted: number; failed: unknown[] };
    orders?: { cleared: number; failed: unknown[] };
    closed?: {
        cancelled: number;
        commented: number;
        alreadyClosed: number;
        partsRemoved: number;
        failed: Array<{ orderId: string; error: string }>;
    };
}

export type ErpAction =
    | 'status'
    | 'detach'
    | 'lookup'
    | 'history'
    | 'settings'
    | 'keymap'
    | 'erps'
    | 'prices';

/**
 * What `erp/prices` answers (the integration's `actions/erp/prices/index.js`, read 2026-09-28):
 * the ERPs it published for and the tier prices written, removed (no longer in force) and left
 * as they were, across every company. A company it could not price is `skipped` with the
 * reason (no shared catalog, say); one whose write failed is in `failed`.
 */
export interface ErpPricesReport {
    erps: string[];
    written: number;
    removed: number;
    unchanged: number;
    skipped: Array<{ erpId: string; partnerId: string; reason: string }>;
    failed: Array<{ erpId: string; partnerId?: string; error: string }>;
}

/**
 * What `erp/lookup` answers (the integration's `lib/lookup.js`, `productLookup` and
 * `companyLookup`): one entity as both systems hold it, one row per field. A side
 * that does not have it answers `null` cells; that is the answer, not an error.
 */
export interface ErpLookup {
    kind: 'product' | 'company';
    /** The SKU or the Commerce company id asked for. */
    key: string;
    found: { commerce: boolean; erp: boolean };
    rows: Array<{ label: string; commerce: string | null; erp: string | null }>;
    /** The ERP screen's hash for the record, when the ERP has it. */
    erpHash: string | null;
}

/**
 * What `erp/history?trace=<order>` answers (the integration's `lib/order-trace.js`,
 * `buildOrderTrace`): one order's whole life across Commerce, the integration and
 * the ERP, oldest step first.
 */
export interface ErpOrderTrace {
    summary: {
        incrementId: string | null;
        commerceStatus: string | null;
        erpNumber: string | null;
        erpStatus: string | null;
        reachedErp: boolean;
    };
    steps: Array<{
        at: string;
        where: string;
        what: string;
        detail?: string;
        outcome?: string;
        tries?: number;
        retry?: unknown;
    }>;
}

/**
 * The deployed URL of one `erp/<action>` web action, or undefined when the
 * integration deployed none (it is not the ERP integration).
 *
 * @param deployedUrls - the integration's per-action URL map
 * @param action - the action wanted
 * @returns its URL
 */
export function deriveErpActionUrl(
    deployedUrls: Record<string, string> | undefined,
    action: ErpAction,
): string | undefined {
    const suffix = `/erp/${action}`;
    return Object.values(deployedUrls ?? {}).find((url) => url.endsWith(suffix));
}

/** A failed call, with the status and the action's own message when it gave one. */
export class ErpIntegrationApiError extends Error {
    constructor(
        readonly action: ErpAction,
        readonly status: number,
        detail: string,
    ) {
        super(`ERP ${action} answered ${status}: ${detail}`);
        this.name = 'ErpIntegrationApiError';
    }
}

/**
 * Call the integration's ERP actions with the signed-in IMS identity.
 */
export class ErpIntegrationClient {
    private readonly fetchImpl: typeof fetch;

    constructor(
        private readonly deployedUrls: Record<string, string> | undefined,
        private readonly auth: AppManagementAuth,
        fetchImpl?: typeof fetch,
    ) {
        this.fetchImpl = fetchImpl ?? globalThis.fetch;
    }

    /**
     * The ERP's health as the integration sees it, the ledger size, the app's identity. With
     * `erpId` (the ERP's id in the integration's list), that ERP's health; else the first's.
     */
    async status(erpId?: string): Promise<ErpIntegrationStatus> {
        return (await this.call(
            'status',
            'GET',
            erpId ? { erp: erpId } : undefined,
        )) as ErpIntegrationStatus;
    }

    /**
     * Undo what the integration wrote onto Commerce, leaving the ERP as it is. With
     * `closeOrders` (a reset, AB-16n), it first closes off every order the ERPs hold: cancelled
     * when Commerce still can, noted when not, and forgotten by the integration. Ask
     * `status().closesOrdersOnReset` first: a deployment before it ignores the option.
     */
    async detach(options: { closeOrders?: boolean } = {}): Promise<ErpDetachReport> {
        const body = options.closeOrders ? { closeOrders: true } : undefined;
        return (await this.call('detach', 'POST', undefined, body)) as ErpDetachReport;
    }

    /** One product (by SKU) or one company (by Commerce id) as both systems hold it. */
    async lookup(query: { sku: string } | { company: string }): Promise<ErpLookup> {
        return (await this.call('lookup', 'GET', query)) as ErpLookup;
    }

    /**
     * The settings in force, Default Config and each named website's, as an order reads
     * them (`GET erp/settings?websites=`): what the ERP fill sorts records by. With `erpId`,
     * that ERP's own settings sit on top (`&erp=`), which is how several ERPs split products.
     */
    async resolvedSettings(websiteCodes: string[], erpId?: string): Promise<ResolvedErpSettings> {
        const query = { websites: websiteCodes.join(','), ...(erpId ? { erp: erpId } : {}) };
        return (await this.call('settings', 'GET', query)) as ResolvedErpSettings;
    }

    /** Whether this deployment has the key map (`erp/keymap`); one deployed before it does not. */
    keepsKeyMap(): boolean {
        return deriveErpActionUrl(this.deployedUrls, 'keymap') !== undefined;
    }

    /** Replace the integration's key map, whole (`PUT erp/keymap`). */
    async replaceKeyMap(entries: ErpKeyMapEntry[]): Promise<void> {
        await this.call('keymap', 'PUT', undefined, { entries });
    }

    /** The key map as the integration holds it (`GET erp/keymap`). */
    async readKeyMap(): Promise<ErpKeyMapEntry[]> {
        const answer = (await this.call('keymap', 'GET')) as { entries?: ErpKeyMapEntry[] };
        return answer.entries ?? [];
    }

    /** Whether this deployment publishes prices (`erp/prices`); one deployed before it does not. */
    publishesPrices(): boolean {
        return deriveErpActionUrl(this.deployedUrls, 'prices') !== undefined;
    }

    /**
     * Publish an ERP's customer prices in force into each company's shared catalog, as a
     * replace (`POST erp/prices`). With `erpId` (its list id), that ERP's; else every ERP's.
     */
    async publishPrices(erpId?: string): Promise<ErpPricesReport> {
        return (await this.call(
            'prices',
            'POST',
            undefined,
            erpId ? { erpId } : undefined,
        )) as ErpPricesReport;
    }

    /** Whether this deployment serves several ERPs (`erp/erps`); one deployed before it does not. */
    keepsErpList(): boolean {
        return deriveErpActionUrl(this.deployedUrls, 'erps') !== undefined;
    }

    /** The ERP list it serves (`GET erp/erps`): the stored list, else its single ERP. */
    async listErps(): Promise<ErpListEntry[]> {
        const answer = (await this.call('erps', 'GET')) as { entries?: ErpListEntry[] };
        return answer.entries ?? [];
    }

    /** Replace the ERP list, whole (`PUT erp/erps`). */
    async replaceErps(entries: ErpListEntry[]): Promise<void> {
        await this.call('erps', 'PUT', undefined, { entries });
    }

    /**
     * Save one ERP's own settings (`PATCH erp/erps`): each value is `true`/`false`/a string, or
     * `null` to clear the override so the wider scope applies. `website` omitted edits the ERP's
     * own defaults; a website code edits that website's. Answers the ERP's entry as it now reads
     * (its credential named, never revealed).
     */
    async updateErpSettings(
        id: string,
        website: string | undefined,
        values: Record<string, string | null>,
    ): Promise<{ entry: ErpListEntry }> {
        return (await this.call('erps', 'PATCH', undefined, {
            id,
            values,
            ...(website ? { website } : {}),
        })) as { entry: ErpListEntry };
    }

    /** One Commerce order's whole life across both systems and the integration. */
    async traceOrder(incrementId: string): Promise<ErpOrderTrace> {
        const answer = (await this.call('history', 'GET', { trace: incrementId })) as {
            trace: ErpOrderTrace;
        };
        return answer.trace;
    }

    private async call(
        action: ErpAction,
        method: 'GET' | 'POST' | 'PUT' | 'PATCH',
        query?: Record<string, string>,
        payload?: unknown,
    ): Promise<unknown> {
        const base = deriveErpActionUrl(this.deployedUrls, action);
        if (!base) {
            throw new Error(`This integration deployed no erp/${action} action.`);
        }
        const url = query ? `${base}?${new URLSearchParams(query).toString()}` : base;
        const answer = await callWithIms(url, method, this.auth, this.fetchImpl, payload);
        if (!answer.ok) {
            throw new ErpIntegrationApiError(action, answer.status, answer.detail);
        }
        return answer.body;
    }
}

/** What a signed-in call to a web action answered. */
export interface ImsCallAnswer {
    ok: boolean;
    status: number;
    /** The parsed JSON body, or `{ error: text }` when it was not JSON. */
    body: unknown;
    /** The action's own message on a failure, else the raw text. */
    detail: string;
}

/**
 * Call a `require-adobe-auth` web action with the signed-in IMS identity.
 * Shared by the integration's actions and the ERP's own (`systemRecordsWipe`).
 *
 * @param url - the deployed action URL
 * @param method - GET or POST
 * @param auth - the bearer token and org
 * @param fetchImpl - fetch, injectable for tests
 * @returns the answer; never throws on an HTTP failure
 */
export type ImsCallMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function callWithIms(
    url: string,
    method: ImsCallMethod,
    auth: AppManagementAuth,
    fetchImpl: typeof fetch,
    payload?: unknown,
): Promise<ImsCallAnswer> {
    const response = await fetchImpl(url, {
        method,
        headers: {
            Authorization: `Bearer ${auth.accessToken}`,
            'x-gw-ims-org-id': auth.imsOrgId,
            Accept: 'application/json',
            ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
    });
    const text = await response.text();
    let body: unknown = {};
    try {
        body = text ? JSON.parse(text) : {};
    } catch {
        body = { error: text };
    }
    const fields = body as { error?: string; errorMessage?: string };
    const detail = fields.error ?? fields.errorMessage ?? (text || 'no detail');
    return { ok: response.ok, status: response.status, body, detail };
}

/** An ERP route: `<action>[/<rest>][?query]`, the way the ERP's own actions document them. */
const ERP_ROUTE = /^[a-z][a-z0-9-]*(\/[A-Za-z0-9_.\-%]+)*(\?[A-Za-z0-9_.\-%=&]+)?$/u;

/**
 * Call one of the ERP's own routes (`partners/C2`, `orders/0000001003/confirm`,
 * `pricing`, `admin/wipe`) with the signed-in identity: the first segment names
 * the ERP's web action, the rest is the path under it. The ERP's routes are
 * documented in each action's header in `skukla/demo-erp` (`actions/<action>/index.js`).
 *
 * @param deployedUrls - the ERP component's per-action URL map
 * @returns the answer, or the refusal when the route is malformed or the action is not deployed
 */
export async function callErpApi(
    deployedUrls: Record<string, string> | undefined,
    auth: AppManagementAuth,
    method: ImsCallMethod,
    route: string,
    body: unknown,
    fetchImpl: typeof fetch = globalThis.fetch,
): Promise<ImsCallAnswer | { refusal: string }> {
    const trimmed = route.trim().replace(/^\/+/, '');
    if (!ERP_ROUTE.test(trimmed)) {
        return {
            refusal:
                'An ERP route is <action>[/<rest>], e.g. "partners/C2" or "orders/0000001003/confirm".',
        };
    }
    const [action, ...rest] = trimmed.split('?')[0].split('/');
    const query = trimmed.includes('?') ? `?${trimmed.split('?')[1]}` : '';
    const actionUrl = Object.values(deployedUrls ?? {}).find((url) => url.endsWith(`/${action}`));
    if (!actionUrl) {
        return { refusal: `The ERP deploys no "${action}" action.` };
    }
    const url = `${actionUrl}${rest.length ? `/${rest.join('/')}` : ''}${query}`;
    return callWithIms(url, method, auth, fetchImpl, body);
}
