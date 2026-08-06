/**
 * sleep — the one delay helper.
 *
 * The point of this module is that it can be mocked away, so the tests that matter
 * are the ones proving it actually waits (otherwise mocking it would be a no-op
 * against a no-op) and that it is a single shared function rather than a fifth
 * private copy.
 */

import { sleep } from '@/core/utils/sleep';

describe('sleep', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    it('resolves only after the delay has elapsed', async () => {
        jest.useFakeTimers();
        let settled = false;
        const pending = sleep(1000).then(() => {
            settled = true;
        });

        // Not yet: without this assertion a sleep that resolved immediately would
        // still pass the "eventually resolves" check below.
        await Promise.resolve();
        expect(settled).toBe(false);

        jest.advanceTimersByTime(999);
        await Promise.resolve();
        expect(settled).toBe(false);

        jest.advanceTimersByTime(1);
        await pending;
        expect(settled).toBe(true);
    });

    it('waits real wall-clock time when timers are not faked', async () => {
        // Production correctness: the whole retry/backoff story depends on this
        // being a genuine wait outside tests.
        const start = Date.now();
        await sleep(25);
        expect(Date.now() - start).toBeGreaterThanOrEqual(20);
    });

    it('resolves immediately for a zero delay', async () => {
        jest.useFakeTimers();
        const pending = sleep(0);
        jest.advanceTimersByTime(0);
        await expect(pending).resolves.toBeUndefined();
    });

    it('does not hold the event loop open', () => {
        // A pending sleep used to keep a jest worker alive past its last test —
        // "A worker process has failed to exit gracefully". A fire-and-forget deploy
        // polls with sleep(2000), the test asserts and ends, and six armed timers
        // outlive it. unref'd timers still FIRE while the loop is alive; they just
        // stop being a reason for it to stay alive.
        jest.useRealTimers();
        const spy = jest.spyOn(global, 'setTimeout');
        void sleep(50_000);
        const timer = spy.mock.results[0].value as NodeJS.Timeout;
        expect(timer.hasRef()).toBe(false);
        clearTimeout(timer);
        spy.mockRestore();
    });

    it('survives an environment whose timers have no unref (the webview)', () => {
        // sleep.ts is bundled into webviews too, where setTimeout returns a number.
        // Calling .unref() unguarded there is a TypeError on every delay.
        jest.useRealTimers();
        const spy = jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
            fn();
            return 1 as unknown as NodeJS.Timeout;
        }) as never);
        expect(() => sleep(1)).not.toThrow();
        spy.mockRestore();
    });
});
