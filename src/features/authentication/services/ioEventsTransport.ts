/**
 * The wire layer under the I/O Events Management API client.
 *
 * Split out of `ioEventsClient.ts` (decompose-god-file, 2026-10-08): the client
 * names the endpoints; this is how ONE request travels — the Bearer, `x-api-key`
 * and HAL `Accept` headers, the timeout, the sanitized typed error on a non-2xx
 * or non-JSON answer, the already-gone semantics of a DELETE, and the host check
 * that keeps a `_links.next` href from carrying our credentials elsewhere. It
 * changes when the API's transport behaviour changes, not when it gains an
 * endpoint.
 *
 * Auth is passed in by callers — this module does NOT mint or refresh tokens.
 * `apiKey` is the S2S credential client_id; the credential must be subscribed to
 * the I/O Management API or every call 401/403s (`isEventsAccessDenied` detects
 * that case).
 *
 * Error messages are sanitized: they carry the HTTP status and operation label
 * only — never headers, tokens, or response bodies.
 *
 * @module features/authentication/services/ioEventsTransport
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/** I/O Events Management API base URL */
export const IO_EVENTS_BASE_URL = 'https://api.adobe.io/events';

/** The only host pagination may follow — derived from the base URL. */
const IO_EVENTS_HOST = new URL(IO_EVENTS_BASE_URL).host;

/** Credentials for the I/O Events Management API. */
export interface EventsAuth {
    /** IMS access token (Bearer) */
    accessToken: string;
    /** S2S credential client_id, sent as `x-api-key` */
    apiKey: string;
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

/**
 * Typed error for non-2xx I/O Events API responses.
 * Message is sanitized — status + operation label only, never auth material.
 */
export class IoEventsApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
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

/**
 * Resolve a `_links.next` pagination href. Returns `undefined` — stop
 * paginating, issue NO request — when the href is unresolvable or the
 * resolved URL leaves {@link IO_EVENTS_HOST}: a foreign/broken next link
 * must never receive our Bearer token and API key.
 */
export function resolveNextPageUrl(nextHref: string | undefined): string | undefined {
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

/**
 * How one I/O Events request travels.
 *
 * All calls send `Authorization: Bearer <token>`, `x-api-key`, and
 * `Accept: application/hal+json`. DELETEs treat 404 as already-gone success.
 */
export class IoEventsTransport {
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

    private buildHeaders(): Record<string, string> {
        return {
            Authorization: `Bearer ${this.auth.accessToken}`,
            'x-api-key': this.auth.apiKey,
            Accept: 'application/hal+json',
        };
    }

    /** Issue a request; returns the raw Response (status handling is the caller's). */
    request(method: 'GET' | 'DELETE', url: string): Promise<Response> {
        return this.fetchImpl(url, {
            method,
            headers: this.buildHeaders(),
            signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
        });
    }

    /** POST a JSON body; parses the JSON response, sanitized error on non-2xx. */
    async postJson(url: string, body: unknown, label: string): Promise<unknown> {
        const response = await this.fetchImpl(url, {
            method: 'POST',
            headers: { ...this.buildHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
        });
        if (!response.ok) {
            throw new IoEventsApiError(
                `${label} failed (HTTP ${response.status})`,
                response.status,
            );
        }
        try {
            return await response.json();
        } catch {
            throw new IoEventsApiError(
                `${label} returned an unexpected non-JSON response (HTTP ${response.status})`,
                response.status,
            );
        }
    }

    /** GET a URL and parse its HAL body; throws IoEventsApiError on non-2xx. */
    async getJson(url: string, label: string): Promise<HalListBody> {
        const response = await this.request('GET', url);
        return this.parseJson(response, label);
    }

    /** Validate 2xx and parse JSON; sanitized IoEventsApiError otherwise. */
    async parseJson(response: Response, label: string): Promise<HalListBody> {
        if (!response.ok) {
            throw new IoEventsApiError(
                `${label} failed (HTTP ${response.status})`,
                response.status,
            );
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
    async delete(url: string, label: string): Promise<void> {
        const response = await this.request('DELETE', url);
        if (response.ok || response.status === 404) {
            return;
        }
        throw new IoEventsApiError(`${label} failed (HTTP ${response.status})`, response.status);
    }
}
