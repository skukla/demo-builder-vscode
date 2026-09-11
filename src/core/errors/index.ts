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

import { ErrorCode, getErrorTitle, isRecoverableError } from '@/types/errorCodes';

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

/**
 * Base application error with structured error data
 */
export class AppError extends Error {
    /** Error code for programmatic handling */
    public readonly code: ErrorCode;

    /** User-friendly message (displayed in UI) */
    public readonly userMessage: string;

    /** Technical details (logged, not shown to user) */
    public readonly technical?: string;

    /** Whether user can retry the operation */
    public readonly recoverable: boolean;

    /** Original error that caused this error */
    public readonly cause?: Error;

    constructor(
        message: string,
        code: ErrorCode,
        options?: {
            userMessage?: string;
            technical?: string;
            recoverable?: boolean;
            cause?: Error;
        },
    ) {
        super(message);
        this.name = 'AppError';
        this.code = code;
        this.userMessage = options?.userMessage || getErrorTitle(code);
        this.technical = options?.technical;
        this.recoverable = options?.recoverable ?? isRecoverableError(code);
        this.cause = options?.cause;

        // Maintains proper stack trace for where error was thrown
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    /**
     * Create AppError from unknown error
     */
    static from(error: unknown, code: ErrorCode = ErrorCode.UNKNOWN): AppError {
        if (error instanceof AppError) {
            return error;
        }

        const message = extractErrorMessage(error);

        return new AppError(message, code, {
            userMessage: message,
            cause: error instanceof Error ? error : undefined,
        });
    }
}

/**
 * Timeout error for operations that exceed time limits
 */
export class TimeoutError extends AppError {
    /** The operation that timed out */
    public readonly operation: string;

    /** The timeout duration in milliseconds */
    public readonly timeoutMs: number;

    constructor(operation: string, timeoutMs: number, options?: { cause?: Error }) {
        super(`${operation} timed out after ${timeoutMs}ms`, ErrorCode.TIMEOUT, {
            userMessage: `${operation} took too long. Please try again.`,
            technical: `Timeout after ${timeoutMs}ms`,
            recoverable: true,
            cause: options?.cause,
        });
        this.name = 'TimeoutError';
        this.operation = operation;
        this.timeoutMs = timeoutMs;
    }
}

/**
 * Network error for connectivity issues
 */
export class NetworkError extends AppError {
    /** The URL or service that failed */
    public readonly target?: string;

    constructor(
        message: string,
        options?: {
            target?: string;
            cause?: Error;
        },
    ) {
        super(message, ErrorCode.NETWORK, {
            userMessage: "Can't reach the server. Check your internet connection and try again.",
            technical: options?.target ? `Failed to connect to ${options.target}` : undefined,
            recoverable: true,
            cause: options?.cause,
        });
        this.name = 'NetworkError';
        this.target = options?.target;
    }
}

/**
 * Authentication error for auth-related failures
 */
export class AuthError extends AppError {
    constructor(
        code: ErrorCode,
        message: string,
        options?: {
            userMessage?: string;
            technical?: string;
            cause?: Error;
        },
    ) {
        super(message, code, {
            userMessage: options?.userMessage || getErrorTitle(code),
            technical: options?.technical,
            recoverable: code === ErrorCode.AUTH_REQUIRED || code === ErrorCode.AUTH_EXPIRED,
            cause: options?.cause,
        });
        this.name = 'AuthError';
    }

    /**
     * Create an "auth required" error
     */
    static required(message = 'Authentication required'): AuthError {
        return new AuthError(ErrorCode.AUTH_REQUIRED, message, {
            userMessage: 'Please sign in to continue',
        });
    }

    /**
     * Create an "auth expired" error
     */
    static expired(message = 'Session expired'): AuthError {
        return new AuthError(ErrorCode.AUTH_EXPIRED, message, {
            userMessage: 'Your session has expired. Please sign in again.',
        });
    }

    /**
     * Create a "no App Builder access" error
     */
    static noAppBuilder(orgName?: string): AuthError {
        return new AuthError(
            ErrorCode.AUTH_NO_APP_BUILDER,
            `Organization ${orgName || 'selected'} does not have App Builder access`,
            {
                userMessage: orgName
                    ? `${orgName} doesn't have App Builder access`
                    : "This organization doesn't have App Builder access",
            },
        );
    }
}

// ===== Type Guards =====

/**
 * Check if error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
    return error instanceof AppError;
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
 * Check if error is a TimeoutError
 */
export function isTimeout(error: unknown): error is TimeoutError {
    return error instanceof TimeoutError;
}

/**
 * Check if error is a NetworkError
 */
export function isNetwork(error: unknown): error is NetworkError {
    return error instanceof NetworkError;
}

/**
 * Check if error is an AuthError
 */
export function isAuth(error: unknown): error is AuthError {
    return error instanceof AuthError;
}

/**
 * Check if error has a specific error code
 */
export function hasErrorCode(error: unknown, code: ErrorCode): boolean {
    return isAppError(error) && error.code === code;
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
        error instanceof TimeoutError ||
        lowerMessage.includes('timeout') ||
        lowerMessage.includes('timed out') ||
        lowerMessage.includes('etimedout')
    ) {
        return { kind: 'timeout', retryable: true };
    }
    if (error instanceof NetworkError || isNetworkErrorMessage(lowerMessage)) {
        return { kind: 'network', retryable: true };
    }
    // Auth is classified but NOT retryable: repeating the same call with the same
    // credentials does the same thing. It is separated from `unknown` because callers
    // branch on it to prompt a sign-in rather than to try again.
    if (error instanceof AuthError || isAuthErrorMessage(lowerMessage)) {
        return { kind: 'auth', retryable: false };
    }
    return { kind: 'unknown', retryable: false };
}

/**
 * Convert unknown error to AppError, detecting common error types
 */
export function toAppError(error: unknown): AppError {
    // Already an AppError
    if (isAppError(error)) {
        return error;
    }

    // Get error message
    const message = extractErrorMessage(error);
    const lowerMessage = message.toLowerCase();

    // Detect timeout errors
    if (
        lowerMessage.includes('timeout') ||
        lowerMessage.includes('timed out') ||
        lowerMessage.includes('etimedout')
    ) {
        return new TimeoutError('Operation', 0, {
            cause: error instanceof Error ? error : undefined,
        });
    }

    // Detect network errors (SOP §10: using predicate)
    if (isNetworkErrorMessage(lowerMessage)) {
        return new NetworkError(message, {
            cause: error instanceof Error ? error : undefined,
        });
    }

    // Detect auth errors (SOP §10: using predicate)
    if (isAuthErrorMessage(lowerMessage)) {
        return new AuthError(ErrorCode.AUTH_REQUIRED, message, {
            cause: error instanceof Error ? error : undefined,
        });
    }

    // Default to generic AppError
    return AppError.from(error);
}
