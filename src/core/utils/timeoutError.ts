/**
 * The error `withTimeout` throws, defined beside the code that throws it.
 *
 * It used to extend a central `AppError` in `src/core/errors/`. That hierarchy is
 * retired (owner-decided 2026-09-11): it was available for months and accounted for
 * four throws in the whole codebase, because an error is most useful carrying domain
 * knowledge and domain knowledge does not live in a shared base class.
 *
 * What survived is the SHAPE. This implements `FailureShape` directly — a plain
 * `Error` with the four fields on it — which is all any consumer ever wanted. Nothing
 * has to extend anything to take part.
 *
 * The timeout domain is `promiseUtils`, so the error lives here rather than in
 * `core/errors/`. Its own module rather than inside `promiseUtils.ts` only because
 * that file is a util and close to its size limit.
 */
import type { FailureShape } from '@/core/errors';
import { ErrorCode } from '@/types/errorCodes';

/** Thrown by `withTimeout` when an operation outruns its budget. */
export class TimeoutError extends Error implements FailureShape {
    public readonly code = ErrorCode.TIMEOUT;

    /** Written for an SC, not for a log. */
    public readonly userMessage: string;

    /** For the Debug Logs channel. */
    public readonly technical: string;

    /** A timeout is worth retrying; that is the whole point of saying so. */
    public readonly recoverable = true;

    /** The operation that timed out. */
    public readonly operation: string;

    /** The budget it exceeded, in milliseconds. */
    public readonly timeoutMs: number;

    /** The error underneath, when there was one. */
    public readonly cause?: Error;

    constructor(operation: string, timeoutMs: number, options?: { cause?: Error }) {
        // `new Error(msg, { cause })` needs the ES2022 lib; this project targets lower,
        // and the retired AppError carried `cause` as an ordinary property for the same
        // reason. Assigning it keeps the field without moving the whole build.
        super(`${operation} timed out after ${timeoutMs}ms`);
        this.name = 'TimeoutError';
        this.cause = options?.cause;
        this.userMessage = `${operation} took too long. Please try again.`;
        this.technical = `Timeout after ${timeoutMs}ms`;
        this.operation = operation;
        this.timeoutMs = timeoutMs;

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

/**
 * Is this the error `withTimeout` threw?
 *
 * Distinct from `classifyTransience`, deliberately. That one GUESSES from message text
 * and is right to, because it only ever answers "should I retry?". This one KNOWS,
 * because it is asking about an error this repo constructed. Use this where the
 * difference matters — reporting a budget was exceeded, say — and the classifier where
 * you are only deciding whether to try again.
 */
export function isTimeoutError(error: unknown): error is TimeoutError {
    return error instanceof TimeoutError;
}
