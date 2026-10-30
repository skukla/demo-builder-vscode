/**
 * When the signed Commerce REST call (`requestRest`) sends a request again, and how long it
 * waits first (datapack step 14, item 18).
 *
 * The Data Installer service retried every method on 429, 500, 502, 503 and 504, three times
 * with exponential backoff (`actions/utils/httpClient.js` L86-94, axios-retry). Here that is
 * narrowed to what cannot do harm:
 *
 * - A read (GET) is sent again on a network failure, a 5xx or a 429. Reading twice changes
 *   nothing.
 * - Any method is sent again on a 429: Commerce answers it before processing the request.
 * - Every other write is sent once. A write that failed on the wire or answered 5xx may still
 *   have landed, and sending it again could make a second order, product or company.
 * - A read that ran out its own wait (TIMEOUTS.LONG) is not sent again: it has already waited
 *   minutes, and axios-retry does not retry a timeout either.
 *
 * @module features/ai/server/commerceRestRetry
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/** How many times one call is sent again: the service's default (`MAX_RETRIES`, 3). */
export const REST_RETRIES = 3;

/** Commerce's "too many requests": nothing was processed, so any method may go again. */
const TOO_MANY_REQUESTS = 429;

/** The 5xx answers worth reading again, as the service listed them. */
const RETRYABLE_READ_STATUSES: readonly number[] = [500, 502, 503, 504];

/** How one attempt ended, as far as the retry decision needs to know. */
export type RestAttempt = { status: number } | { failed: true; timedOut: boolean };

function worthSendingAgain(method: string, attempt: RestAttempt): boolean {
    if ('status' in attempt) {
        if (attempt.status === TOO_MANY_REQUESTS) return true;
        return method === 'GET' && RETRYABLE_READ_STATUSES.includes(attempt.status);
    }
    return method === 'GET' && !attempt.timedOut;
}

/**
 * How long to wait before sending the call again, or undefined when it must not be sent again.
 *
 * @param method - the call's HTTP method (`GET` is the only read)
 * @param attempt - how the attempt just made ended
 * @param retriesSoFar - how many times the call has already been sent again
 * @returns the wait in ms (doubling from TIMEOUTS.RETRY_INITIAL_DELAY, at most
 *   TIMEOUTS.RETRY_MAX_DELAY), or undefined
 */
export function restRetryDelay(method: string, attempt: RestAttempt, retriesSoFar: number): number | undefined {
    if (retriesSoFar >= REST_RETRIES || !worthSendingAgain(method, attempt)) return undefined;
    return Math.min(TIMEOUTS.RETRY_INITIAL_DELAY * 2 ** retriesSoFar, TIMEOUTS.RETRY_MAX_DELAY);
}
