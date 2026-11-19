/**
 * Fix with AI, the one set of words and the one rule for when it is offered: a failed job offers
 * Retry, and once retrying has not helped, Fix with AI, which opens the SC's AI on the problem
 * (J6-3). Moved to core on 2026-11-19 from the Data Installer, when the Updates window became the
 * rule's second user; the update questions' own "Fix with AI" answer is the same words.
 *
 * vscode-free: the extension's questions and the webviews both read it.
 *
 * @module core/utils/fixWithAi
 */

/** The button that opens the SC's AI on a problem. */
export const FIX_WITH_AI = 'Fix with AI';

/** Fix with AI's hover text, the same wherever the button is. */
export const FIX_WITH_AI_HINT = 'Opens your AI assistant on this problem';

/**
 * How many times Retry may be pressed on one failure before Fix with AI is offered instead: a stop
 * that comes back twice is not one a retry gets past.
 */
export const RETRIES_BEFORE_FIX = 2;

/**
 * Failures a second try can get past: nothing answered, it took too long, the other side was busy
 * or had a problem of its own. Anything else (a merge that cannot find its files) fails the same
 * way again, so it goes to Fix with AI at once (owner, 2026-11-19).
 */
const PASSING = /did not (respond|answer)|timed? ?out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|fetch failed|socket hang up|\b429\b|too many requests|rate limit|\b50[0-4]\b|busy|temporarily/iu;

/** Whether a retry can help a failure, read off its raw words (read before they are made plain). */
export function retryCanHelp(raw: string): boolean {
    return PASSING.test(raw);
}

/**
 * The main button on a failure: Retry, then Fix with AI once retries have not helped. A failure a
 * retry cannot help offers Fix with AI at once.
 *
 * @param retries - tries since, all failed
 * @param retryable - whether a retry can help this failure (`retryCanHelp`); true when unknown
 */
export function failedButtonLabel(retries: number, retryable = true): string {
    return retryable && retries < RETRIES_BEFORE_FIX ? 'Retry' : FIX_WITH_AI;
}
