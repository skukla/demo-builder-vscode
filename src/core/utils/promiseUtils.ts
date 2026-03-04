/**
 * Promise utilities for timeout and cancellation handling
 */

import { ErrorCode } from '@/types/errorCodes';
import { TimeoutError, toAppError, isTimeout } from '@/types/errors';

export interface TimeoutOptions {
    timeoutMs: number;
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
 *       timeoutMessage: 'Operation timed out',
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

    // Create timeout promise - use TimeoutError for typed detection
    // Note: TimeoutError generates its own userMessage, but callers can provide custom via timeoutMessage
    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
            const error = new TimeoutError(
                timeoutMessage || 'Operation',
                timeoutMs,
            );
            reject(error);
        }, timeoutMs);
    });

    // Create cancellation promise if signal provided - use Error with code for typed detection
    const cancellationPromise = signal
        ? new Promise<never>((_, reject) => {
            signal.addEventListener('abort', () => {
                const cancelError = new Error('Operation cancelled by user');
                (cancelError as Error & { code?: string }).code = ErrorCode.CANCELLED;
                reject(cancelError);
            });
        })
        : null;

    // Race between actual operation, timeout, and optional cancellation
    const promises = [promise, timeoutPromise];
    if (cancellationPromise) {
        promises.push(cancellationPromise);
    }

    return Promise.race(promises);
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
        const appError = toAppError(error);

        // Use typed error detection instead of string matching
        const timedOut = isTimeout(appError);
        const cancelled = appError.code === ErrorCode.CANCELLED ||
            (error instanceof Error && (error as Error & { code?: string }).code === ErrorCode.CANCELLED);

        return {
            timedOut,
            cancelled,
            error: error instanceof Error ? error : new Error(appError.userMessage),
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
// see ExternalCommandManager.executeWithRetry() which already
// handles retries for git, npm, aio, and other CLI commands.

