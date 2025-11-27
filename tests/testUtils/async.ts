/**
 * Async Test Utilities
 *
 * Common utilities for handling async operations in tests without
 * using real setTimeout delays. These utilities help tests run faster
 * while still properly testing async behavior.
 */

/**
 * Flush the microtask queue (Promise callbacks, queueMicrotask, etc.)
 *
 * Use this when you need to wait for Promise.then() callbacks to execute
 * without using setTimeout delays.
 *
 * @example
 * ```typescript
 * someAsyncOperation();
 * await flushPromises();
 * expect(result).toBe('done');
 * ```
 */
export function flushPromises(): Promise<void> {
    return new Promise(resolve => setImmediate(resolve));
}

/**
 * Flush multiple rounds of the microtask queue
 *
 * Useful when you have chained promises or async operations that
 * schedule more microtasks.
 *
 * @param rounds Number of microtask flushes to perform
 */
export async function flushPromisesMultiple(rounds: number = 3): Promise<void> {
    for (let i = 0; i < rounds; i++) {
        await flushPromises();
    }
}

/**
 * Wait for a condition to become true, with timeout
 *
 * Use this instead of arbitrary setTimeout delays when waiting for
 * some state to change.
 *
 * @param condition Function that returns true when condition is met
 * @param options Configuration options
 * @returns Promise that resolves when condition is true
 * @throws Error if timeout is reached
 *
 * @example
 * ```typescript
 * await waitForCondition(() => mockFn.mock.calls.length > 0);
 * expect(mockFn).toHaveBeenCalled();
 * ```
 */
export async function waitForCondition(
    condition: () => boolean | Promise<boolean>,
    options: {
        timeout?: number;
        interval?: number;
        message?: string;
    } = {}
): Promise<void> {
    const { timeout = 1000, interval = 10, message = 'Condition not met' } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        const result = await condition();
        if (result) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(`${message} (timeout: ${timeout}ms)`);
}

/**
 * Create a deferred promise for testing async flows
 *
 * Useful when you need to control exactly when a promise resolves
 * in tests.
 *
 * @example
 * ```typescript
 * const deferred = createDeferred<string>();
 * const promise = someFunction(deferred.promise);
 * // ... do some assertions ...
 * deferred.resolve('result');
 * await promise;
 * ```
 */
export function createDeferred<T>(): {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error: Error) => void;
} {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;

    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });

    return { promise, resolve, reject };
}

/**
 * Helper to advance fake timers and flush promises in one call
 *
 * When using jest.useFakeTimers(), you often need to both advance
 * timers AND flush the promise queue. This helper does both.
 *
 * @param ms Milliseconds to advance timers
 *
 * @example
 * ```typescript
 * jest.useFakeTimers();
 * const promise = delayedOperation();
 * await advanceTimersAndFlush(1000);
 * await promise;
 * ```
 */
export async function advanceTimersAndFlush(ms: number): Promise<void> {
    // Advance timers by the specified amount
    jest.advanceTimersByTime(ms);
    // Flush promises to let any resolved promises execute their handlers
    await flushPromises();
}

/**
 * Advance timers and run all pending timers asynchronously
 *
 * This is more aggressive than advanceTimersAndFlush - it will
 * complete ALL pending timers, not just advance by a fixed amount.
 * Use when you want to fully complete an async operation.
 */
export async function advanceAndRunAllTimers(ms: number): Promise<void> {
    jest.advanceTimersByTime(ms);
    await jest.runAllTimersAsync();
    await flushPromises();
}

/**
 * Run all pending timers and flush promises
 *
 * Complete helper for fake timers that ensures all async work is done.
 */
export async function runAllTimersAndFlush(): Promise<void> {
    await jest.runAllTimersAsync();
    await flushPromises();
}

/**
 * Setup fake timers with common configuration
 *
 * Configures fake timers with settings that work well for most tests.
 * Call in beforeEach.
 */
export function setupFakeTimers(): void {
    jest.useFakeTimers({
        // Don't fake these - they're needed for test infrastructure
        doNotFake: ['setImmediate', 'nextTick'],
    });
}

/**
 * Cleanup fake timers
 *
 * Call in afterEach to restore real timers and prevent timer leaks.
 */
export function cleanupFakeTimers(): void {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
}
