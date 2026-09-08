import { withTimeout, tryWithTimeout, runInBatches } from '@/core/utils/promiseUtils';

/**
 * A rejected promise whose rejection is ALREADY observed.
 *
 * A bare `Promise.reject(...)` handed to code under test is only "handled"
 * because that code awaits it. Under mutation testing that is exactly what
 * stops being true: a mutant that drops the promise from the race leaves the
 * rejection unobserved, node tears the worker down with exit code 1, and the
 * whole run dies instead of scoring one mutant (measured 2026-09-06). The
 * no-op handler attached here marks the rejection handled whatever the code
 * under test does with it, and does not change what the test observes.
 */
function rejectedWith(reason: unknown): Promise<never> {
    const rejected = Promise.reject(reason);
    rejected.catch(() => undefined);
    return rejected as Promise<never>;
}

describe('promiseUtils', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    describe('withTimeout', () => {
        it('should resolve successfully when operation completes before timeout', async () => {
            const promise = Promise.resolve('success');

            const result = await withTimeout(promise, { timeoutMs: 1000 });

            expect(result).toBe('success');
        });

        it('should reject when operation times out', async () => {
            const promise = new Promise((resolve) => {
                setTimeout(() => resolve('too late'), 2000);
            });

            const resultPromise = withTimeout(promise, { timeoutMs: 100 });

            // Advance past timeout but not past resolution
            jest.advanceTimersByTime(100);

            await expect(resultPromise).rejects.toThrow('Operation timed out after 100ms');
        });

        it('should use custom timeout message', async () => {
            const promise = new Promise((resolve) => {
                setTimeout(() => resolve('too late'), 2000);
            });

            const resultPromise = withTimeout(promise, {
                timeoutMs: 100,
                timeoutMessage: 'Custom timeout message'
            });

            jest.advanceTimersByTime(100);

            await expect(resultPromise).rejects.toThrow('Custom timeout message');
        });

        it('should handle promise rejection', async () => {
            const promise = rejectedWith(new Error('Operation failed'));

            await expect(
                withTimeout(promise, { timeoutMs: 1000 })
            ).rejects.toThrow('Operation failed');
        });

        it('should handle cancellation via AbortSignal', async () => {
            const controller = new AbortController();
            const promise = new Promise((resolve) => {
                setTimeout(() => resolve('completed'), 2000);
            });

            setTimeout(() => controller.abort(), 100);

            const resultPromise = withTimeout(promise, {
                timeoutMs: 5000,
                signal: controller.signal
            });

            // Advance to trigger the abort
            jest.advanceTimersByTime(100);

            await expect(resultPromise).rejects.toThrow('Operation cancelled by user');
        });

        it('should race between timeout and cancellation', async () => {
            const controller = new AbortController();
            const promise = new Promise((resolve) => {
                setTimeout(() => resolve('completed'), 5000);
            });

            // Cancel before timeout
            setTimeout(() => controller.abort(), 50);

            const resultPromise = withTimeout(promise, {
                timeoutMs: 1000,
                signal: controller.signal
            });

            // Advance to trigger the abort (50ms)
            jest.advanceTimersByTime(50);

            await expect(resultPromise).rejects.toThrow('Operation cancelled');
        });

        it('should complete before both timeout and cancellation', async () => {
            const controller = new AbortController();
            const promise = Promise.resolve('fast completion');

            setTimeout(() => controller.abort(), 100);

            const result = await withTimeout(promise, {
                timeoutMs: 1000,
                signal: controller.signal
            });

            expect(result).toBe('fast completion');
        });

        it('should handle async operation with delay', async () => {
            const asyncOp = async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                return 'async result';
            };

            const resultPromise = withTimeout(asyncOp(), { timeoutMs: 1000 });

            // Advance past the async delay
            jest.advanceTimersByTime(50);

            const result = await resultPromise;

            expect(result).toBe('async result');
        });

        it.each([
            ['resolves', () => Promise.resolve('fast')],
            ['rejects', () => rejectedWith(new Error('fast failure'))],
        ])('clears the pending timeout once the race %s', async (_label, make) => {
            // A fast promise used to leave the timeout armed for the full
            // timeoutMs, keeping the event loop alive (and tripping Jest's
            // "failed to exit gracefully" teardown). The timer is cleared in a
            // `finally`, so it happens on every exit from the race.
            await withTimeout(make(), { timeoutMs: 30000 }).catch(() => undefined);

            expect(jest.getTimerCount()).toBe(0);
        });

        it('should handle different result types', async () => {
            const numberPromise = Promise.resolve(42);
            const objectPromise = Promise.resolve({ key: 'value' });
            const booleanPromise = Promise.resolve(true);

            const numberResult = await withTimeout(numberPromise, { timeoutMs: 1000 });
            const objectResult = await withTimeout(objectPromise, { timeoutMs: 1000 });
            const booleanResult = await withTimeout(booleanPromise, { timeoutMs: 1000 });

            expect(numberResult).toBe(42);
            expect(objectResult).toEqual({ key: 'value' });
            expect(booleanResult).toBe(true);
        });
    });

    describe('tryWithTimeout', () => {
        it('should return success result when operation completes', async () => {
            const promise = Promise.resolve('success');

            const result = await tryWithTimeout(promise, { timeoutMs: 1000 });

            expect(result.result).toBe('success');
            expect(result.timedOut).toBe(false);
            expect(result.cancelled).toBe(false);
            expect(result.error).toBeUndefined();
        });

        it('should return timeout result when operation times out', async () => {
            const promise = new Promise((resolve) => {
                setTimeout(() => resolve('too late'), 2000);
            });

            const resultPromise = tryWithTimeout(promise, { timeoutMs: 100 });

            // Advance past timeout
            jest.advanceTimersByTime(100);

            const result = await resultPromise;

            expect(result.result).toBeUndefined();
            expect(result.timedOut).toBe(true);
            expect(result.cancelled).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error?.message).toContain('timed out');
        });

        it('should return cancellation result when cancelled', async () => {
            const controller = new AbortController();
            const promise = new Promise((resolve) => {
                setTimeout(() => resolve('completed'), 2000);
            });

            setTimeout(() => controller.abort(), 50);

            const resultPromise = tryWithTimeout(promise, {
                timeoutMs: 5000,
                signal: controller.signal
            });

            // Advance to trigger the abort
            jest.advanceTimersByTime(50);

            const result = await resultPromise;

            expect(result.result).toBeUndefined();
            expect(result.timedOut).toBe(false);
            expect(result.cancelled).toBe(true);
            expect(result.error).toBeDefined();
            expect(result.error?.message).toContain('cancelled');
        });

        it('should return error result when operation fails', async () => {
            const promise = rejectedWith(new Error('Operation error'));

            const result = await tryWithTimeout(promise, { timeoutMs: 1000 });

            expect(result.result).toBeUndefined();
            expect(result.timedOut).toBe(false);
            expect(result.cancelled).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Operation error');
        });

        it('should handle string errors', async () => {
            const promise = rejectedWith('String error');

            const result = await tryWithTimeout(promise, { timeoutMs: 1000 });

            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('String error');
        });

        it('should not throw on timeout', async () => {
            const promise = new Promise((resolve) => {
                setTimeout(() => resolve('too late'), 2000);
            });

            const resultPromise = tryWithTimeout(promise, { timeoutMs: 100 });

            jest.advanceTimersByTime(100);

            await expect(resultPromise).resolves.toBeDefined();
        });

        it('should not throw on cancellation', async () => {
            const controller = new AbortController();
            const promise = new Promise((resolve) => {
                setTimeout(() => resolve('completed'), 2000);
            });

            controller.abort();

            const resultPromise = tryWithTimeout(promise, {
                timeoutMs: 5000,
                signal: controller.signal
            });

            // Already aborted - advance past the timeout to ensure resolution
            // The implementation should detect the already-aborted signal
            jest.advanceTimersByTime(5000);

            await expect(resultPromise).resolves.toBeDefined();
        });
    });

    describe('runInBatches', () => {
        it('should process items in sequential batches', async () => {
            const order: number[] = [];
            const fn = async (n: number) => { order.push(n); return n * 2; };

            const results = await runInBatches([1, 2, 3, 4, 5], 2, fn);

            expect(results).toEqual([2, 4, 6, 8, 10]);
            expect(order).toEqual([1, 2, 3, 4, 5]);
        });

        it('should return empty array for empty input', async () => {
            const results = await runInBatches([], 5, async (x: number) => x);
            expect(results).toStrictEqual([]);
        });

        it('should handle batch size larger than items', async () => {
            const results = await runInBatches([1, 2], 10, async (n) => n + 1);
            expect(results).toEqual([2, 3]);
        });

        it('should handle batch size of 1 (sequential)', async () => {
            const results = await runInBatches([10, 20, 30], 1, async (n) => n / 10);
            expect(results).toEqual([1, 2, 3]);
        });

        it('should propagate errors from the callback', async () => {
            const fn = async (n: number) => {
                if (n === 3) throw new Error('batch error');
                return n;
            };

            await expect(runInBatches([1, 2, 3, 4], 2, fn)).rejects.toThrow('batch error');
        });
    });

    describe('Edge cases', () => {
        it('should handle immediate resolution', async () => {
            const immediate = Promise.resolve('instant');

            const result = await withTimeout(immediate, { timeoutMs: 1000 });

            expect(result).toBe('instant');
        });

        it('should handle immediate rejection', async () => {
            const immediate = rejectedWith(new Error('instant error'));

            await expect(
                withTimeout(immediate, { timeoutMs: 1000 })
            ).rejects.toThrow('instant error');
        });

        it('times out at zero, and says which of the two happened', async () => {
            const promise = new Promise<string>((resolve) => {
                setTimeout(() => resolve('value'), 1000);
            });

            const resultPromise = tryWithTimeout(promise, { timeoutMs: 0 });
            jest.advanceTimersByTime(1);
            const result = await resultPromise;

            // The old assertion was `timedOut || result === undefined`, true for
            // BOTH outcomes and therefore unable to fail.
            expect({ timedOut: result.timedOut, result: result.result }).toStrictEqual({
                timedOut: true,
                result: undefined,
            });
        });

        it('should handle very large timeout', async () => {
            const promise = Promise.resolve('value');

            const result = await withTimeout(promise, { timeoutMs: Number.MAX_SAFE_INTEGER });

            expect(result).toBe('value');
        });

        it('should handle null result', async () => {
            const promise = Promise.resolve(null);

            const result = await tryWithTimeout(promise, { timeoutMs: 1000 });

            expect(result.result).toBeNull();
            expect(result.timedOut).toBe(false);
        });

        it('should handle undefined result', async () => {
            const promise = Promise.resolve(undefined);

            const result = await tryWithTimeout(promise, { timeoutMs: 1000 });

            expect(result.result).toBeUndefined();
            expect(result.timedOut).toBe(false);
            expect(result.error).toBeUndefined();
        });

        it('does NOT cancel on a signal that was never aborted', async () => {
            const controller = new AbortController(); // fresh — never aborted

            const slow = new Promise<string>((resolve) => {
                setTimeout(() => resolve('value'), 10_000);
            });

            const resultPromise = tryWithTimeout(slow, {
                timeoutMs: 200,
                signal: controller.signal,
            });
            jest.advanceTimersByTime(200);
            const result = await resultPromise;

            // The converse of the already-aborted case, and the reason it needs its
            // own test: the pre-check must read the FLAG, not assume it. Treating
            // every signal as aborted cancels operations nobody cancelled, and the
            // promise here is slow on purpose — an already-resolved one wins the
            // race either way and so cannot tell the two apart.
            expect({ cancelled: result.cancelled, timedOut: result.timedOut }).toStrictEqual({
                cancelled: false,
                timedOut: true,
            });
        });

        it('cancels at once on a signal that is ALREADY aborted', async () => {
            const controller = new AbortController();
            controller.abort(); // aborted BEFORE the call

            const slow = new Promise<string>((resolve) => {
                setTimeout(() => resolve('value'), 1000);
            });

            // No timer advance: the point is that it settles without waiting.
            const result = await tryWithTimeout(slow, {
                timeoutMs: 5000,
                signal: controller.signal,
            });

            // An already-aborted signal never fires `abort` again, so listening
            // alone ignored it and the caller waited out the whole timeout —
            // measured as {cancelled: false, timedOut: true} before the fix.
            // Project creation passes exactly such a controller to a 30-minute
            // timeout, so the old behaviour reported a TIMEOUT for a build the
            // user had cancelled.
            expect({ cancelled: result.cancelled, timedOut: result.timedOut }).toStrictEqual({
                cancelled: true,
                timedOut: false,
            });
            expect(result.error?.message).toBe('Operation cancelled by user');
        });
    });
});
