/**
 * Promise utilities for timeout and cancellation handling
 */

import { TimeoutError } from './timeoutError';
import { classifyTransience, extractErrorMessage } from '@/core/errors';
import { ErrorCode } from '@/types/errorCodes';

export interface TimeoutOptions {
    timeoutMs: number;
    /**
     * The OPERATION that timed out, as a noun phrase — "SDK org services fetch".
     *
     * It is composed into a sentence (`<operation> took too long. Please try again.`),
     * so a caller passing a whole sentence gets a mangled one. Two did, and both were
     * shown to an SC: "Request timed out. Please check your connection and try again.
     * took too long. Please try again." Found 2026-09-11 while retiring the central
     * error hierarchy. The name says `message` for history; what it means is the
     * operation's name.
     */
    timeoutMessage?: string;
    signal?: AbortSignal;
}

export interface WithTimeoutResult<T> {
    result?: T;
    timedOut: boolean;
    cancelled: boolean;
    error?: Error;
}

/**
 * Wraps a promise with timeout and optional cancellation support
 * 
 * @param promise The promise to wrap
 * @param options Timeout and cancellation options
 * @returns The result of the promise or throws on timeout/cancellation
 * 
 * @example
 * ```typescript
 * const controller = new AbortController();
 * 
 * try {
 *   const result = await withTimeout(
 *     longRunningOperation(),
 *     { 
 *       timeoutMs: 30000,
 *       timeoutMessage: 'the long-running operation',
 *       signal: controller.signal
 *     }
 *   );
 * } catch (error) {
 *   // Handle timeout or cancellation
 * }
 * ```
 */
export async function withTimeout<T>(
    promise: Promise<T>,
    options: TimeoutOptions,
): Promise<T> {
    const { timeoutMs, timeoutMessage, signal } = options;

    // Create timeout promise - use TimeoutError for typed detection.
    // `timeoutMessage` names the OPERATION; TimeoutError composes the sentence.
    // Track the timer so it can be cleared once the race settles — otherwise a fast-resolving
    // `promise` leaves the timeout pending for the full timeoutMs, leaking a timer that keeps
    // the event loop alive (and trips Jest's "failed to exit gracefully" teardown warning).
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutTimer = setTimeout(() => {
            const error = new TimeoutError(
                timeoutMessage || 'Operation',
                timeoutMs,
            );
            reject(error);
        }, timeoutMs);
    });

    // Create cancellation promise if signal provided - use Error with code for typed detection
    const cancelled = () => {
        const cancelError = new Error('Operation cancelled by user');
        (cancelError as Error & { code?: string }).code = ErrorCode.CANCELLED;
        return cancelError;
    };
    const cancellationPromise = signal
        ? new Promise<never>((_, reject) => {
            // An AbortSignal that is ALREADY aborted never fires the event again,
            // so listening alone silently ignores it and the caller waits out the
            // whole timeout. Project creation passes a controller created moments
            // before this call and aborted from the wizard's close handler — if
            // that close lands in between, a 30-minute build used to run on and
            // report a TIMEOUT rather than a cancellation. Check the flag first.
            if (signal.aborted) {
                reject(cancelled());
                return;
            }
            signal.addEventListener('abort', () => reject(cancelled()));
        })
        : null;

    // Race between actual operation, timeout, and optional cancellation
    const promises = [promise, timeoutPromise];
    if (cancellationPromise) {
        promises.push(cancellationPromise);
    }

    try {
        return await Promise.race(promises);
    } finally {
        // Clear the pending timeout once the race settles (success, error, timeout,
        // or cancellation). Harmless if it already fired.
        if (timeoutTimer) clearTimeout(timeoutTimer);
    }
}

/**
 * Wraps a promise with timeout and cancellation, returning a result object
 * instead of throwing errors
 * 
 * @param promise The promise to wrap
 * @param options Timeout and cancellation options
 * @returns Result object with success/failure details
 * 
 * @example
 * ```typescript
 * const result = await tryWithTimeout(
 *   longRunningOperation(),
 *   { timeoutMs: 30000, signal: controller.signal }
 * );
 * 
 * if (result.timedOut) {
 *   console.log('Operation timed out');
 * } else if (result.cancelled) {
 *   console.log('Operation was cancelled');
 * } else if (result.error) {
 *   console.log('Operation failed:', result.error);
 * } else {
 *   console.log('Success:', result.result);
 * }
 * ```
 */
export async function tryWithTimeout<T>(
    promise: Promise<T>,
    options: TimeoutOptions,
): Promise<WithTimeoutResult<T>> {
    try {
        const result = await withTimeout(promise, options);
        return {
            result,
            timedOut: false,
            cancelled: false,
        };
    } catch (error) {

        // Use typed error detection instead of string matching.
        //
        // Cancellation is read off the RAW error, not off `appError`. The
        // `appError.code === CANCELLED` half this line used to lead with could
        // never decide the answer on its own: `toAppError` only ever returns a
        // CANCELLED-coded error by handing back an AppError it was given, and
        // such an error is itself an Error carrying the same code — so the
        // second half was already true whenever the first was.
        const timedOut = classifyTransience(error).kind === 'timeout';
        const cancelled = error instanceof Error &&
            (error as Error & { code?: string }).code === ErrorCode.CANCELLED;

        return {
            timedOut,
            cancelled,
            error: error instanceof Error ? error : new Error(extractErrorMessage(error)),
        };
    }
}

/**
 * Run async operations in sequential batches with bounded concurrency.
 *
 * Within each batch, items run in parallel via Promise.all.
 * Batches run sequentially to cap the number of concurrent requests.
 *
 * @param items - Items to process
 * @param batchSize - Max items per batch (concurrent within batch)
 * @param fn - Async function to apply to each item
 * @returns Flat array of results in the same order as items
 */
export async function runInBatches<T, R>(
    items: T[],
    batchSize: number,
    fn: (item: T) => Promise<R>,
): Promise<R[]> {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(fn));
        results.push(...batchResults);
    }
    return results;
}

// Note: For command-level retry logic with exponential backoff,
// see CommandExecutor.executeWithRetry() which already
// handles retries for git, npm, aio, and other CLI commands.

