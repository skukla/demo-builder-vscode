/**
 * The ERP integration's own actions, as Demo Builder calls them: `erp/status`
 * (what the integration sees of its ERP) and `erp/reset` (undo the ledgered
 * Commerce writes, wipe the ERP, mirror Commerce again; decisions 8 and 11).
 *
 * Both are web actions with `require-adobe-auth`, so they take the same
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

export type ErpAction = 'status' | 'reset';

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

    private async call(action: ErpAction, method: 'GET' | 'POST'): Promise<unknown> {
        const url = deriveErpActionUrl(this.deployedUrls, action);
        if (!url) {
            throw new Error(`This integration deployed no erp/${action} action.`);
        }
        const response = await this.fetchImpl(url, {
            method,
            headers: {
                Authorization: `Bearer ${this.auth.accessToken}`,
                'x-gw-ims-org-id': this.auth.imsOrgId,
                Accept: 'application/json',
            },
        });
        const text = await response.text();
        let body: unknown = {};
        try {
            body = text ? JSON.parse(text) : {};
        } catch {
            body = { error: text };
        }
        if (!response.ok) {
            const detail =
                (body as { error?: string; errorMessage?: string }).error ??
                (body as { errorMessage?: string }).errorMessage ??
                text ??
                'no detail';
            throw new ErpIntegrationApiError(action, response.status, detail);
        }
        return body;
    }
}
