/**
 * Promise utilities for timeout and cancellation handling
 */

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
    options: TimeoutOptions
): Promise<T> {
    const { timeoutMs, timeoutMessage, signal } = options;

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
            reject(new Error(
                timeoutMessage || `Operation timed out after ${timeoutMs}ms`
            ));
        }, timeoutMs);
    });

    // Create cancellation promise if signal provided
    const cancellationPromise = signal
        ? new Promise<never>((_, reject) => {
            signal.addEventListener('abort', () => {
                reject(new Error('Operation cancelled by user'));
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
    options: TimeoutOptions
): Promise<WithTimeoutResult<T>> {
    try {
        const result = await withTimeout(promise, options);
        return {
            result,
            timedOut: false,
            cancelled: false
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        return {
            timedOut: errorMessage.includes('timed out'),
            cancelled: errorMessage.includes('cancelled'),
            error: error instanceof Error ? error : new Error(errorMessage)
        };
    }
}

/**
 * Creates a promise that resolves after a specified delay
 * 
 * @param ms Delay in milliseconds
 * @returns Promise that resolves after the delay
 */
export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retries a promise-returning function with exponential backoff
 * 
 * @param fn Function that returns a promise
 * @param options Retry options
 * @returns The result of the function or throws after all retries exhausted
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    options: {
        maxAttempts?: number;
        initialDelayMs?: number;
        maxDelayMs?: number;
        backoffMultiplier?: number;
    } = {}
): Promise<T> {
    const {
        maxAttempts = 3,
        initialDelayMs = 1000,
        maxDelayMs = 10000,
        backoffMultiplier = 2
    } = options;

    let lastError: Error | undefined;
    let delayMs = initialDelayMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            
            // Don't delay after the last attempt
            if (attempt < maxAttempts) {
                await delay(delayMs);
                delayMs = Math.min(delayMs * backoffMultiplier, maxDelayMs);
            }
        }
    }

    throw lastError || new Error('All retry attempts failed');
}

