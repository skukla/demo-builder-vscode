/**
 * I/O Events Management API client (pure fetch, no SDK dependency).
 *
 * Minimal client for the subset of api.adobe.io/events endpoints the
 * console-project teardown flow needs: list org providers, list/delete
 * workspace event registrations, delete providers. Endpoint shapes were
 * spike-validated (see .rptc/research/delete-aio-project/research.md).
 *
 * Auth is passed in by callers — this module does NOT mint or refresh
 * tokens. `apiKey` is the S2S credential client_id; the credential must be
 * subscribed to the I/O Management API or every call 401/403s
 * (`isEventsAccessDenied` detects that case).
 *
 * Error messages are sanitized: they carry the HTTP status and operation
 * label only — never headers, tokens, or response bodies.
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';

// ==========================================================
// Constants
// ==========================================================

/** I/O Events Management API base URL */
const IO_EVENTS_BASE_URL = 'https://api.adobe.io/events';

/** The only host pagination may follow — derived from the base URL. */
const IO_EVENTS_HOST = new URL(IO_EVENTS_BASE_URL).host;

/**
 * Hard cap on `_links.next` pagination hops in {@link IoEventsClient.listProviders}.
 * Guarantees termination even if the API returns a cyclic/never-ending next link.
 * Spike data: ~1,600 providers org-wide; page size 10+ → 200 pages is generous.
 */
export const MAX_PROVIDER_PAGES = 200;

/**
 * `provider_metadata` value identifying custom (3rd-party) event providers —
 * the only kind the extension creates, and therefore the only kind teardown
 * may consider for deletion.
 */
export const THIRD_PARTY_PROVIDER_METADATA = '3rd_party_custom_events';

/**
 * Shape of the `rel:update` href on a provider:
 * `/events/{orgId}/{projectId}/{workspaceId}/providers/{providerId}`,
 * optionally absolute and optionally followed by a query string or fragment.
 *
 * Segments are restricted to the Adobe id charset (`[A-Za-z0-9_-]`, matching
 * the `@/core/validation` resource-id validators; UUID provider ids fit too),
 * so traversal-shaped segments like `..` never parse into a binding — the
 * parsed ids are later interpolated into DELETE URL paths.
 */
const PROVIDER_UPDATE_HREF_PATTERN =
    /\/events\/[A-Za-z0-9_-]+\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/providers\/([A-Za-z0-9_-]+)(?:[?#].*)?$/;

// ==========================================================
// Types
// ==========================================================

/** Credentials for the I/O Events Management API. */
export interface EventsAuth {
    /** IMS access token (Bearer) */
    accessToken: string;
    /** S2S credential client_id, sent as `x-api-key` */
    apiKey: string;
}

/** Project/workspace binding parsed from a provider's `rel:update` href. */
export interface ProviderBinding {
    providerId: string;
    projectId: string;
    workspaceId: string;
    label?: string;
}

/** Event registration entry, normalized to a stable `id`. */
export interface EventRegistrationSummary {
    id: string;
    name?: string;
}

/** Raw provider entry from GET /events/{orgId}/providers (unfiltered). */
export interface RawProvider {
    id?: string;
    label?: string;
    provider_metadata?: string;
    _links?: {
        [rel: string]: { href?: string } | undefined;
    };
}

/** HAL-style list response shapes (parsed defensively). */
interface HalListBody {
    _embedded?: {
        providers?: RawProvider[];
        registrations?: Array<{ registration_id?: string; id?: string; name?: string }>;
    };
    _links?: {
        next?: { href?: string };
    };
}

// ==========================================================
// Errors
// ==========================================================

/**
 * Typed error for non-2xx I/O Events API responses.
 * Message is sanitized — status + operation label only, never auth material.
 */
export class IoEventsApiError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
        this.name = 'IoEventsApiError';
    }
}

/**
 * True when the error is an I/O Events auth failure (401/403) — typically a
 * credential not subscribed to the I/O Management API, or an expired token.
 */
export function isEventsAccessDenied(error: unknown): boolean {
    return error instanceof IoEventsApiError && (error.status === 401 || error.status === 403);
}

// ==========================================================
// Pure helpers
// ==========================================================

/**
 * Parse the project/workspace binding out of a provider's `rel:update` href.
 *
 * Tolerates absolute or relative hrefs and query-string/fragment suffixes.
 * Returns `undefined` for any href that does not match the exact
 * `/events/{orgId}/{projectId}/{workspaceId}/providers/{providerId}` shape —
 * callers rely on this: a provider whose binding cannot be parsed must
 * NEVER be deleted.
 */
export function parseProviderBinding(updateHref: string): ProviderBinding | undefined {
    if (!updateHref) {
        return undefined;
    }
    const match = PROVIDER_UPDATE_HREF_PATTERN.exec(updateHref);
    if (!match) {
        return undefined;
    }
    const [, projectId, workspaceId, providerId] = match;
    return { providerId, projectId, workspaceId };
}

/**
 * Resolve a `_links.next` pagination href. Returns `undefined` — stop
 * paginating, issue NO request — when the href is unresolvable or the
 * resolved URL leaves {@link IO_EVENTS_HOST}: a foreign/broken next link
 * must never receive our Bearer token and API key.
 */
function resolveNextPageUrl(nextHref: string | undefined): string | undefined {
    if (!nextHref) {
        return undefined;
    }
    try {
        const resolved = new URL(nextHref, IO_EVENTS_BASE_URL);
        return resolved.host === IO_EVENTS_HOST ? resolved.toString() : undefined;
    } catch {
        return undefined;
    }
}

// ==========================================================
// Client
// ==========================================================

/**
 * I/O Events Management API client.
 *
 * All calls send `Authorization: Bearer <token>`, `x-api-key`, and
 * `Accept: application/hal+json`. DELETEs treat 404 as already-gone success.
 */
export class IoEventsClient {
    private readonly fetchImpl: typeof fetch;

    /**
     * @param auth - IMS access token + S2S client_id
     * @param fetchImpl - Injectable fetch (tests); defaults to global fetch
     */
    constructor(
        private readonly auth: EventsAuth,
        fetchImpl?: typeof fetch,
    ) {
        this.fetchImpl = fetchImpl ?? globalThis.fetch;
    }

    /**
     * List ALL providers in the org (raw, unfiltered — filtering by
     * `provider_metadata` and binding is the caller's job). Follows
     * `_links.next` pagination defensively, capped at {@link MAX_PROVIDER_PAGES}.
     */
    async listProviders(orgId: string): Promise<RawProvider[]> {
        const providers: RawProvider[] = [];
        let url: string | undefined = `${IO_EVENTS_BASE_URL}/${orgId}/providers`;

        for (let page = 0; page < MAX_PROVIDER_PAGES && url; page++) {
            const body = await this.getJson(url, 'List providers');
            providers.push(...(body._embedded?.providers ?? []));
            url = resolveNextPageUrl(body._links?.next?.href);
        }

        return providers;
    }

    /**
     * List event registrations in a workspace, normalized to
     * `{ id, name? }` (the API uses `registration_id` or `id` depending on
     * version). A 404 on the list means no registrations → empty array.
     */
    async listRegistrations(
        orgId: string,
        projectId: string,
        workspaceId: string,
    ): Promise<EventRegistrationSummary[]> {
        const url = `${IO_EVENTS_BASE_URL}/${orgId}/${projectId}/${workspaceId}/registrations`;
        const response = await this.request('GET', url);
        if (response.status === 404) {
            return [];
        }
        const body = await this.parseJson(response, 'List registrations');
        const entries = body._embedded?.registrations ?? [];
        return entries
            .filter((entry) => Boolean(entry.registration_id ?? entry.id))
            .map((entry) => ({
                id: (entry.registration_id ?? entry.id) as string,
                name: entry.name,
            }));
    }

    /** Delete one event registration. 404 (already gone) resolves. */
    async deleteRegistration(
        orgId: string,
        projectId: string,
        workspaceId: string,
        registrationId: string,
    ): Promise<void> {
        const url =
            `${IO_EVENTS_BASE_URL}/${orgId}/${projectId}/${workspaceId}` +
            `/registrations/${registrationId}`;
        await this.delete(url, 'Delete registration');
    }

    /** Delete one event provider. 404 (already gone) resolves. */
    async deleteProvider(
        orgId: string,
        projectId: string,
        workspaceId: string,
        providerId: string,
    ): Promise<void> {
        const url =
            `${IO_EVENTS_BASE_URL}/${orgId}/${projectId}/${workspaceId}` +
            `/providers/${providerId}`;
        await this.delete(url, 'Delete provider');
    }

    // ------------------------------------------------------
    // Internals
    // ------------------------------------------------------

    private buildHeaders(): Record<string, string> {
        return {
            Authorization: `Bearer ${this.auth.accessToken}`,
            'x-api-key': this.auth.apiKey,
            Accept: 'application/hal+json',
        };
    }

    /** Issue a request; returns the raw Response (status handling is the caller's). */
    private request(method: 'GET' | 'DELETE', url: string): Promise<Response> {
        return this.fetchImpl(url, {
            method,
            headers: this.buildHeaders(),
            signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
        });
    }

    /** GET a URL and parse its HAL body; throws IoEventsApiError on non-2xx. */
    private async getJson(url: string, label: string): Promise<HalListBody> {
        const response = await this.request('GET', url);
        return this.parseJson(response, label);
    }

    /** Validate 2xx and parse JSON; sanitized IoEventsApiError otherwise. */
    private async parseJson(response: Response, label: string): Promise<HalListBody> {
        if (!response.ok) {
            throw new IoEventsApiError(`${label} failed (HTTP ${response.status})`, response.status);
        }
        try {
            return (await response.json()) as HalListBody;
        } catch {
            throw new IoEventsApiError(
                `${label} returned an unexpected non-JSON response (HTTP ${response.status})`,
                response.status,
            );
        }
    }

    /** DELETE with already-gone semantics: 2xx and 404 resolve, others throw. */
    private async delete(url: string, label: string): Promise<void> {
        const response = await this.request('DELETE', url);
        if (response.ok || response.status === 404) {
            return;
        }
        throw new IoEventsApiError(`${label} failed (HTTP ${response.status})`, response.status);
    }
}
