/**
 * Run an Adobe Developer Console call, retrying ONCE when it fails transiently.
 *
 * Console answers 504 Gateway Timeout when its own upstream times out — nothing
 * the SC did, and nothing they can fix. On 2026-09-20 one of those aborted an
 * add three minutes in and sent the SC away to "try again in a few minutes",
 * which is exactly what a retry does without asking them. On 2026-09-24 the
 * same 504 hit the deploy-time credential read (`getIntegration`, 61s) on the
 * FIRST add of every integration, while the subscribe just before it already
 * retried — the retry had to become shared so every Console read gets it.
 *
 * The classifier decides what counts (`classifyTransience`): a timeout or a
 * network failure retries, an auth failure never does, because repeating the
 * same call with the same credentials does the same thing.
 *
 * ONE retry, like the org-services fetch. A second adds delay to a case that
 * is already unlucky, and the surfaces this serves all carry a Retry.
 *
 * Only for calls that are safe to repeat: reads, and writes that REPLACE
 * state (the subscribe PUT sends the whole list, so the same list twice
 * converges). Never wrap a create — Console credential names are org-unique
 * and a repeated create answers 409.
 *
 * @module core/utils/transientRetry
 */

import { classifyTransience } from '@/core/errors';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/**
 * @param label - what to call the call in the retry warning
 * @param run - the call, re-invoked once on a transient failure
 * @param warn - where the retry warning goes (the caller's logger)
 * @returns whatever the call answers
 * @throws the first error when it is not transient; the second error when both tries fail
 */
export async function withOneTransientRetry<T>(
    label: string,
    run: () => Promise<T>,
    warn: (message: string) => void,
): Promise<T> {
    try {
        return await run();
    } catch (error) {
        if (!classifyTransience(error).retryable) throw error;
        warn(`${label} failed transiently — retrying once`);
        await sleep(TIMEOUTS.ORG_SERVICES_RETRY_DELAY);
        return run();
    }
}
