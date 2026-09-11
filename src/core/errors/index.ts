/**
 * Custom Error Classes
 *
 * Typed error classes for common error scenarios.
 * Use these instead of raw Error for better error handling.
 *
 * Benefits:
 * - Type-safe error codes (no string matching)
 * - Automatic user-friendly messages
 * - Technical details for debugging
 * - Structured error data
 *
 * Usage:
 * ```typescript
 * throw new TimeoutError('mesh deployment', 30000);
 * throw new AuthError(ErrorCode.AUTH_EXPIRED, 'Please sign in again');
 * throw new NetworkError('Failed to reach Adobe services');
 * ```
 */

import { ErrorCode } from '@/types/errorCodes';

/**
 * What a failure carries when it crosses a boundary toward a person or an agent.
 *
 * THE SHAPE SURVIVES; THE HIERARCHY DOES NOT. Owner-decided 2026-09-11. The central
 * classes were available for months and accounted for four throws in the whole
 * codebase — errors are most useful carrying domain knowledge, and domain knowledge
 * does not live in `core/`. What was worth keeping is this decomposition, and the
 * strongest argument for it is that the MCP specification arrived at the same one
 * independently: a message for the reader to act on, kept distinct from the transport
 * detail underneath.
 *
 * Two audiences want different fields from one failure, which is why it is an envelope
 * and not a string:
 *
 * | | for |
 * |---|---|
 * | `code` | programmatic branching |
 * | `userMessage` | the SC — plain, actionable, never a library's own words |
 * | `technical` | the Debug Logs channel |
 * | `recoverable` | whether offering "Retry" is honest |
 *
 * A domain error implements this where it is thrown (see `TimeoutError` in
 * `@/core/utils/timeoutError`). Nothing needs to extend a base class to do so.
 */
export interface FailureShape {
    /** For programmatic branching. */
    readonly code: ErrorCode;
    /** Written for an SC. Never a library's own words — see the handbook. */
    readonly userMessage: string;
    /** For the Debug Logs channel, not for a person. */
    readonly technical?: string;
    /** Whether offering a retry is honest. */
    readonly recoverable: boolean;
}

// ===== Helper Functions =====

/**
 * Extract error message from unknown error value
 * SOP §3: Extracted nested ternary to named helper
 */
export function extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return 'Unknown error occurred';
}

/**
 * Check if error has a specific error code
 */
export function hasErrorCode(error: unknown, code: ErrorCode): boolean {
    // Reads the code off whatever carries one. It used to require an `AppError`
    // instance, which meant a domain error defined beside its own feature could not
    // answer this question — the exact coupling the hierarchy's retirement removes.
    return (error as { code?: unknown } | null | undefined)?.code === code;
}

/**
 * Check if message indicates a network error (SOP §10 compliance)
 */
function isNetworkErrorMessage(lowerMessage: string): boolean {
    if (lowerMessage.includes('network')) return true;
    if (lowerMessage.includes('enotfound')) return true;
    if (lowerMessage.includes('econnrefused')) return true;
    if (lowerMessage.includes('fetch failed')) return true;
    return false;
}

/**
 * Check if message indicates an auth error (SOP §10 compliance)
 */
function isAuthErrorMessage(lowerMessage: string): boolean {
    if (lowerMessage.includes('unauthorized')) return true;
    if (lowerMessage.includes('authentication')) return true;
    if (lowerMessage.includes('not authenticated')) return true;
    if (lowerMessage.includes('auth failed')) return true;
    if (lowerMessage.includes('auth token')) return true;
    return false;
}

/** What the message matching suggests happened. A GUESS, and treated as one. */
export type TransientKind = 'timeout' | 'network' | 'auth' | 'unknown';

/**
 * The answer to ONE question: is trying again worth it?
 *
 * Deliberately carries nothing displayable. That is the whole point of the type —
 * see `classifyTransience`.
 */
export interface Transience {
    /** Which shape the error text suggests. Never shown to anyone. */
    readonly kind: TransientKind;
    /** Whether a retry has a chance of behaving differently. */
    readonly retryable: boolean;
}

/**
 * Guess whether a failure is transient, by matching its message text.
 *
 * GUESSING IS FINE HERE AND NOWHERE ELSE, which is why this returns a shape with no
 * message on it. The two uses of message matching have opposite tolerances:
 *
 * - "Should I retry?" — a wrong guess costs one retry. Nobody notices.
 * - "What do we tell the person?" — a wrong guess tells someone the wrong thing to do.
 *
 * This repo made that judgement once and then half-unmade it. A generic FORMATTER was
 * tried and removed because "a shared one has to guess which provider produced a
 * string"; a generic CLASSIFIER doing exactly that guessing survived as `toAppError`,
 * which matched `includes('unauthorized')` and handed back a `userMessage`. Nine call
 * sites put that straight in front of an SC — so any failure whose text happened to
 * contain "unauthorized" told a person to sign in, including when the real cause was a
 * missing permission on a site, where signing in changes nothing and they would do it
 * again.
 *
 * The replacement cannot be misused, because there is nothing on it to misuse: display
 * comes from a formatter that KNOWS its provider, or from a domain error constructed
 * knowing what went wrong. The raw text still reaches the Debug Logs, where it belongs.
 *
 * Owner-decided 2026-09-11; see `.rptc/plans/error-handling-strategy/`.
 */
export function classifyTransience(error: unknown): Transience {
    const lowerMessage = extractErrorMessage(error).toLowerCase();

    if (
        lowerMessage.includes('timeout') ||
        lowerMessage.includes('timed out') ||
        lowerMessage.includes('etimedout')
    ) {
        return { kind: 'timeout', retryable: true };
    }
    if (isNetworkErrorMessage(lowerMessage)) {
        return { kind: 'network', retryable: true };
    }
    // Auth is classified but NOT retryable: repeating the same call with the same
    // credentials does the same thing. It is separated from `unknown` because callers
    // branch on it to prompt a sign-in rather than to try again.
    if (isAuthErrorMessage(lowerMessage)) {
        return { kind: 'auth', retryable: false };
    }
    return { kind: 'unknown', retryable: false };
}

