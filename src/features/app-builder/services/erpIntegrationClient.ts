/**
 * The ERP integration's own actions, as Demo Builder calls them: `erp/status`, `erp/lookup`, `erp/history`,
 * (what the integration sees of its ERP), `erp/reset` (undo the ledgered
 * Commerce writes, wipe the ERP, mirror Commerce again; decisions 8 and 11) and
 * `erp/detach` (the undo alone, run before the integration is removed).
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
}

/** What `erp/reset` answers: counts of what was undone, wiped and mirrored. */
export interface ErpResetReport {
    reverted?: { reverted: number; failed: unknown[] };
    orders?: unknown;
    wiped?: unknown;
    mirrored?: { counts: { products: number; companies: number } };
    error?: string;
}

/** What `erp/detach` answers: the company writes undone and the ERP order numbers cleared. */
export interface ErpDetachReport {
    reverted?: { reverted: number; failed: unknown[] };
    orders?: { cleared: number; failed: unknown[] };
}

export type ErpAction = 'status' | 'reset' | 'detach' | 'lookup' | 'history';

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

    /** The ERP's health as the integration sees it, the ledger size, the app's identity. */
    async status(): Promise<ErpIntegrationStatus> {
        return (await this.call('status', 'GET')) as ErpIntegrationStatus;
    }

    /** The whole reset; the action itself is idempotent and budgeted at five minutes. */
    async reset(): Promise<ErpResetReport> {
        return (await this.call('reset', 'POST')) as ErpResetReport;
    }

    /** Undo what the integration wrote onto Commerce, leaving the ERP as it is. */
    async detach(): Promise<ErpDetachReport> {
        return (await this.call('detach', 'POST')) as ErpDetachReport;
    }

    /** One product (by SKU) or one company (by Commerce id) as both systems hold it. */
    async lookup(query: { sku: string } | { company: string }): Promise<ErpLookup> {
        return (await this.call('lookup', 'GET', query)) as ErpLookup;
    }

    /** One Commerce order's whole life across both systems and the integration. */
    async traceOrder(incrementId: string): Promise<ErpOrderTrace> {
        const answer = (await this.call('history', 'GET', { trace: incrementId })) as { trace: ErpOrderTrace };
        return answer.trace;
    }

    private async call(action: ErpAction, method: 'GET' | 'POST', query?: Record<string, string>): Promise<unknown> {
        const base = deriveErpActionUrl(this.deployedUrls, action);
        if (!base) {
            throw new Error(`This integration deployed no erp/${action} action.`);
        }
        const url = query ? `${base}?${new URLSearchParams(query).toString()}` : base;
        const answer = await callWithIms(url, method, this.auth, this.fetchImpl);
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
        return { refusal: 'An ERP route is <action>[/<rest>], e.g. "partners/C2" or "orders/0000001003/confirm".' };
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
