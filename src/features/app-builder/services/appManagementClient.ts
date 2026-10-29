/**
 * App Management API client (pure fetch, no SDK dependency).
 *
 * Minimal client for the subset of the App Management API v3 an
 * app-management lifecycle integration needs: read installation state,
 * reconcile (install/upgrade), pre-validate, and set the Commerce
 * association. Shapes come from the published OpenAPI spec
 * (adobe/aio-commerce-sdk, packages/aio-commerce-lib-app/docs/openapi.json,
 * "App Management API" v3.0.0, fetched 2026-08-27).
 *
 * The API is served BY the deployed app's own generated actions — the spec's
 * `servers` entry is a bare `/`, so the reachable base URL is per-app and
 * must be passed in by the caller (resolving it is the supervised spike in
 * .rptc/plans/app-management-support/overview.md; this client is NOT wired
 * to any flow until that lands).
 *
 * Auth is passed in by callers — this module does NOT mint or refresh
 * tokens. Every call sends `Authorization: Bearer <IMS access token>` plus
 * the required `x-gw-ims-org-id` header (IMS org id of the app's org).
 *
 * Error messages are sanitized: they carry the HTTP status and operation
 * label only — never headers, tokens, or response bodies. The one piece of
 * body an error retains is the 409 no-op `reason`, parsed against the
 * spec's closed enum (a fixed vocabulary, safe to surface).
 *
 * @module features/app-builder/services/appManagementClient
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';

// ==========================================================
// Types (from the OpenAPI spec)
// ==========================================================

/** Commerce deployment flavor. */
export type CommerceEnv = 'saas' | 'paas';

/** Console identity of the app's Project/Workspace (all fields spec-required). */
export interface AppData {
    consumerOrgId: string;
    orgName: string;
    projectId: string;
    projectName: string;
    projectTitle: string;
    workspaceId: string;
    workspaceName: string;
    workspaceTitle: string;
}

/** POST /installation body. `commerce*` optional only for an upgrade. */
export interface ReconcileInstallationRequest {
    appData: AppData;
    ioEventsUrl: string;
    ioEventsEnv: string;
    commerceBaseUrl?: string;
    commerceEnv?: CommerceEnv;
}

/** POST /installation/validation body (every field spec-required). */
export interface ValidateInstallationRequest {
    appData: AppData;
    commerceBaseUrl: string;
    commerceEnv: CommerceEnv;
    ioEventsUrl: string;
    ioEventsEnv: string;
}

/**
 * POST /installation/uninstallation body — identical field set to validation,
 * and every field spec-required (read from the generated OpenAPI, 2026-08-27).
 */
export type StartUninstallationRequest = ValidateInstallationRequest;

/** POST /installation/uninstallation result: work queued (id to poll with). */
export interface UninstallStartResult {
    message: string;
    /** Present on a 202 (queued); poll {@link AppManagementClient.getUninstallationState}. */
    id?: string;
}

/** POST /association body. */
export interface SetAssociationRequest {
    commerceBaseUrl: string;
    commerceEnv: CommerceEnv;
}

/** One node of the installation step tree (children recurse). */
export interface StepStatus {
    name: string;
    id: string;
    path: string[];
    status: 'pending' | 'in-progress' | 'succeeded' | 'failed';
    children?: StepStatus[];
}

/**
 * GET /installation 200 body — discriminated on `status`. A 204 (never
 * installed) is surfaced as `undefined` by {@link AppManagementClient.getInstallationState},
 * not as a variant.
 */
export interface InstallationState {
    id: string;
    status: 'in-progress' | 'succeeded' | 'failed';
    startedAt: string;
    completedAt?: string;
    step?: StepStatus;
    error?: unknown;
}

/**
 * POST /installation result. `@adobe/aio-commerce-lib-app` 2.x answers an
 * install with 202 and an `id`; an upgrade with 202 when it started (the app's
 * `metadata.upgradeMode` is `auto`) or 200 when it was only planned (`manual`),
 * both with a `plan` and no id (read from the 2.0.0 OpenAPI, 2026-09-17).
 */
export interface ReconcileResult {
    operation: 'install' | 'upgrade';
    message: string;
    /** Present on a queued install; the id to poll getInstallationState with. */
    id?: string;
    /** Present on an upgrade: the planned changes (opaque here). */
    plan?: Record<string, unknown>;
    /** True when the work started (HTTP 202); false when it was only planned (200). */
    accepted: boolean;
}

/**
 * The latest install/upgrade/uninstall attempt (lib-app 2.x), read with the
 * post-deploy invocation header. A succeeded attempt names the version it
 * reached; a failed one says where it stopped.
 */
export interface LifecycleAttempt {
    id: string;
    operation: 'install' | 'upgrade' | 'uninstall';
    status: 'pending' | 'in-progress' | 'succeeded' | 'failed';
    startedAt: string;
    result?: { appVersion: string; snapshotId: string };
    failure?: { key: string; message?: string };
}

/** The header lib-app 2.x reads to answer with the latest attempt. */
export const INVOCATION_SOURCE_HEADER = 'x-aio-commerce-installation-invocation-source';

/** POST /installation/validation 200 body (summary counts spec-required). */
export interface ValidationOutcome {
    valid: boolean;
    summary: { totalIssues: number; errors: number; warnings: number };
    result?: unknown;
}

/** The spec's closed enum of non-actionable 409 no-op reasons. */
const NO_OP_REASONS = ['not-installed', 'not-associated', 'already-current'] as const;
export type ReconcileNoOpReason = (typeof NO_OP_REASONS)[number];

/** Credentials + addressing for one app's App Management API. */
export interface AppManagementAuth {
    /** IMS access token (Bearer) */
    accessToken: string;
    /** IMS org id, sent as `x-gw-ims-org-id` */
    imsOrgId: string;
}

// ==========================================================
// Errors
// ==========================================================

/**
 * Typed error for non-2xx App Management API responses. Message is
 * sanitized — status + operation label only. `reason` is populated only for
 * a 409 whose body carries one of the spec's closed no-op reasons.
 */
export class AppManagementApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly reason?: ReconcileNoOpReason,
        /**
         * A 409 body's own `message`, bounded — the LIVE API answers no-op
         * 409s with a message and NO `reason` field ("Installation has
         * already completed successfully.", measured 2026-08-27), so the
         * spec's closed enum alone cannot classify them.
         */
        readonly noOpMessage?: string,
    ) {
        super(message);
        this.name = 'AppManagementApiError';
    }
}

/** Parse a 409 body's `reason` against the closed enum; undefined otherwise. */
function parseNoOpReason(body: unknown): ReconcileNoOpReason | undefined {
    const reason = (body as { reason?: unknown } | undefined)?.reason;
    return NO_OP_REASONS.includes(reason as ReconcileNoOpReason)
        ? (reason as ReconcileNoOpReason)
        : undefined;
}

// ==========================================================
// Client
// ==========================================================

/**
 * App Management API client for ONE deployed app.
 *
 * @example
 *   const client = new AppManagementClient('https://…/api/v1/web/app-management', auth);
 *   const state = await client.getInstallationState(); // undefined = never installed
 */
export class AppManagementClient {
    private readonly fetchImpl: typeof fetch;
    private readonly baseUrl: string;

    /**
     * @param baseUrl - the app's App Management API root (per-app; no trailing slash)
     * @param auth - IMS access token + org id
     * @param fetchImpl - Injectable fetch (tests); defaults to global fetch
     */
    constructor(
        baseUrl: string,
        private readonly auth: AppManagementAuth,
        fetchImpl?: typeof fetch,
    ) {
        this.baseUrl = baseUrl.replace(/\/+$/, '');
        this.fetchImpl = fetchImpl ?? globalThis.fetch;
    }

    /**
     * Read the installation state. `undefined` means the app has never been
     * installed (the API's 204); otherwise the status-discriminated state.
     */
    async getInstallationState(): Promise<InstallationState | undefined> {
        const response = await this.request('GET', '/installation');
        if (response.status === 204) {
            return undefined;
        }
        return (await this.parseJson(response, 'Get installation state')) as InstallationState;
    }

    /**
     * Install (first time) or upgrade (already associated). A 202 queued the
     * work — poll {@link getInstallationState}; a 200 returned an upgrade
     * plan. A 409 no-op throws {@link AppManagementApiError} with `reason`.
     */
    async reconcileInstallation(body: ReconcileInstallationRequest): Promise<ReconcileResult> {
        const response = await this.request('POST', '/installation', body);
        const parsed = (await this.parseJson(response, 'Reconcile installation')) as Omit<
            ReconcileResult,
            'accepted'
        >;
        return { ...parsed, accepted: response.status === 202 };
    }

    /**
     * The latest lifecycle attempt (lib-app 2.x), or undefined when there is
     * none or the app predates attempts: a 1.x app ignores the header and
     * answers its installation state, which carries no `operation`.
     */
    async getLatestLifecycleAttempt(): Promise<LifecycleAttempt | undefined> {
        const response = await this.request('GET', '/installation', undefined, {
            [INVOCATION_SOURCE_HEADER]: 'post-app-deploy',
        });
        if (response.status === 204) {
            return undefined;
        }
        const body = (await this.parseJson(response, 'Get upgrade state')) as Partial<LifecycleAttempt>;
        return typeof body?.operation === 'string' && typeof body.status === 'string'
            ? (body as LifecycleAttempt)
            : undefined;
    }

    /** Pre-validate an installation request without executing it. */
    async validateInstallation(body: ValidateInstallationRequest): Promise<ValidationOutcome> {
        const response = await this.request('POST', '/installation/validation', body);
        return (await this.parseJson(response, 'Validate installation')) as ValidationOutcome;
    }

    /** Store the app↔Commerce association (the API answers 204). */
    async setAssociation(body: SetAssociationRequest): Promise<void> {
        const response = await this.request('POST', '/association', body);
        if (!response.ok) {
            throw await this.toError(response, 'Set association');
        }
    }

    /**
     * Read the uninstallation state. `undefined` means no uninstall has been
     * started (the API's 204); the shape mirrors the installation state.
     */
    async getUninstallationState(): Promise<InstallationState | undefined> {
        const response = await this.request('GET', '/installation/uninstallation');
        if (response.status === 204) {
            return undefined;
        }
        return (await this.parseJson(response, 'Get uninstallation state')) as InstallationState;
    }

    /**
     * Start the app's own uninstaller — the inverse of reconcile: it removes
     * what the INSTALLER created (event registrations, providers, binding
     * packages, Commerce-side eventing config). A 202 queued the work — poll
     * {@link getUninstallationState}. A 409 no-op (never installed / not
     * associated) throws {@link AppManagementApiError} with its reason.
     */
    async startUninstallation(body: StartUninstallationRequest): Promise<UninstallStartResult> {
        const response = await this.request('POST', '/installation/uninstallation', body);
        return (await this.parseJson(response, 'Start uninstallation')) as UninstallStartResult;
    }

    /** Clear a finished uninstallation's state record (the API answers 204). */
    async clearUninstallationState(): Promise<void> {
        const response = await this.request('DELETE', '/installation/uninstallation');
        if (!response.ok) {
            throw await this.toError(response, 'Clear uninstallation state');
        }
    }

    /** Remove the stored app↔Commerce association (the API answers 204). */
    async clearAssociation(): Promise<void> {
        const response = await this.request('DELETE', '/association');
        if (!response.ok) {
            throw await this.toError(response, 'Clear association');
        }
    }

    // ------------------------------------------------------
    // Internals
    // ------------------------------------------------------

    private buildHeaders(hasBody: boolean, extra: Record<string, string> = {}): Record<string, string> {
        const headers: Record<string, string> = {
            ...extra,
            Authorization: `Bearer ${this.auth.accessToken}`,
            'x-gw-ims-org-id': this.auth.imsOrgId,
            Accept: 'application/json',
        };
        if (hasBody) {
            headers['Content-Type'] = 'application/json';
        }
        return headers;
    }

    /** Issue a request; returns the raw Response (status handling is the caller's). */
    private request(
        method: 'GET' | 'POST' | 'DELETE',
        path: string,
        body?: unknown,
        extraHeaders?: Record<string, string>,
    ): Promise<Response> {
        return this.fetchImpl(`${this.baseUrl}${path}`, {
            method,
            headers: this.buildHeaders(body !== undefined, extraHeaders),
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
        });
    }

    /** Validate 2xx and parse JSON; sanitized AppManagementApiError otherwise. */
    private async parseJson(response: Response, label: string): Promise<unknown> {
        if (!response.ok) {
            throw await this.toError(response, label);
        }
        try {
            return await response.json();
        } catch {
            throw new AppManagementApiError(
                `${label} returned an unexpected non-JSON response (HTTP ${response.status})`,
                response.status,
            );
        }
    }

    /** Build the sanitized error, retaining a 409 body's reason and message. */
    private async toError(response: Response, label: string): Promise<AppManagementApiError> {
        let reason: ReconcileNoOpReason | undefined;
        let noOpMessage: string | undefined;
        if (response.status === 409) {
            try {
                const body = (await response.json()) as { message?: unknown };
                reason = parseNoOpReason(body);
                if (typeof body?.message === 'string') {
                    noOpMessage = body.message.slice(0, 200);
                }
            } catch {
                // A 409 with no JSON body: the status alone is the whole answer.
                // Nothing to unset — `reason` cannot have been assigned yet, since
                // the only statement that can throw here is `response.json()`.
            }
        }
        return new AppManagementApiError(
            `${label} failed (HTTP ${response.status})`,
            response.status,
            reason,
            noOpMessage,
        );
    }
}
