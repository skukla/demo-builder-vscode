/**
 * Data Installer error taxonomy.
 *
 * Two error classes, kept distinct because the difference matters to the caller:
 * a {@link DataInstallerInputError} never reached the network, so retrying it is
 * pointless, while a {@link DataInstallerApiError} carries the status the service
 * actually returned.
 *
 * Transport failures are classified STRUCTURALLY — by error name and instance —
 * never by looking for words in a message. `commerceStoreDiscovery.ts:245-268`
 * records why: substring matching collided with response bodies that happen to
 * contain "timeout" or "fetch failed", and this service's bodies are exactly
 * that kind of prose ("Collection name required. Provide <collection env var>
 * in environment variable."). Do not reintroduce it.
 *
 * @module features/data-installer/services/dataInstallerErrors
 */

/** Longest response body a failure message may quote. */
const MAX_BODY_IN_MESSAGE = 500;

/** The service returned a response, and it was not a success. */
export class DataInstallerApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly action: string,
    ) {
        super(message);
        this.name = 'DataInstallerApiError';
    }
}

/**
 * The request could not be valid, so it was refused before being sent.
 *
 * Used for the known server-side defect where omitting `data_types` on
 * `batch-get-data-items` returns a 400: the client refuses to build that request
 * rather than letting a caller trip it.
 */
export class DataInstallerInputError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DataInstallerInputError';
    }
}

/**
 * Whether a failure means "sign in again" rather than "try again".
 *
 * Drives the UI's choice between a Sign In action and a Retry — a Retry cannot
 * fix an expired token.
 */
export function isDataInstallerAuthError(error: unknown): boolean {
    return error instanceof DataInstallerApiError && (error.status === 401 || error.status === 403);
}

/** How a request failed before any response arrived. */
export type TransportFailure = 'timeout' | 'unreachable' | 'unknown';

/**
 * Classify a thrown fetch failure by structure, never by message text.
 *
 * `AbortSignal.timeout()` rejects with an error whose `name` is `AbortError`.
 * Node's fetch surfaces DNS/connect failures as `TypeError` with the literal
 * message `fetch failed`; the type and message together are the signal, and the
 * type alone is what stops a service body from impersonating one.
 */
export function classifyTransportError(error: unknown): TransportFailure {
    if (!(error instanceof Error)) {
        return 'unknown';
    }
    if (error.name === 'AbortError') {
        return 'timeout';
    }
    if (error instanceof TypeError && error.message === 'fetch failed') {
        return 'unreachable';
    }
    return 'unknown';
}

/**
 * Fold an HTTP failure into one log-safe line.
 *
 * Keeps the status AND the body: the service reports several unrelated causes
 * through the same `error` field, so the status is often the only thing that
 * distinguishes them.
 *
 * @param action - The deployed action name that failed
 * @param status - HTTP status
 * @param statusText - HTTP status text
 * @param body - Raw response body
 * @returns A single-line message, body truncated and newlines collapsed
 */
export function describeApiFailure(
    action: string,
    status: number,
    statusText: string,
    body: string,
): string {
    return `${action}: ${status} ${statusText} — ${summarizeBody(body)}`;
}

/** Collapse a response body to one short, single-line fragment. */
function summarizeBody(body: string): string {
    const flat = body.replace(/[\r\n]+/g, ' ').trim();
    if (flat.length === 0) {
        return '(empty body)';
    }
    if (flat.length <= MAX_BODY_IN_MESSAGE) {
        return flat;
    }
    return `${flat.slice(0, MAX_BODY_IN_MESSAGE)}… (truncated, ${flat.length} chars)`;
}
