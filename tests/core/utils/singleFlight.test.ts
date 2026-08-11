/**
 * SingleFlight Tests
 *
 * The shared primitive behind three hand-rolled copies (the sign-in prompt guard,
 * the org-list fetch, the token inspection). Its contract is small but every
 * clause is load-bearing: collapse concurrent callers, release on BOTH outcomes,
 * and never hold a stale result.
 */

import { SingleFlight } from '@/core/utils/singleFlight';

/** A promise resolved by hand, so concurrency is deterministic. */
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

describe('SingleFlight', () => {
    it('runs fn once for concurrent callers and gives them all the same result', async () => {
        const flight = new SingleFlight<string>();
        const d = deferred<string>();
        const fn = jest.fn(() => d.promise);

        const a = flight.run(fn);
        const b = flight.run(fn);
        const c = flight.run(fn);
        d.resolve('value');

        expect(await Promise.all([a, b, c])).toEqual(['value', 'value', 'value']);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    // The whole point: a cache cannot help inside this window.
    it('joins a caller that arrives DURING a flight', async () => {
        const flight = new SingleFlight<number>();
        const d = deferred<number>();
        const fn = jest.fn(() => d.promise);

        const first = flight.run(fn);
        expect(flight.isInFlight).toBe(true);

        const second = flight.run(fn);
        d.resolve(7);

        expect(await first).toBe(7);
        expect(await second).toBe(7);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('releases after success so a LATER call runs again', async () => {
        const flight = new SingleFlight<number>();
        const fn = jest.fn(() => Promise.resolve(1));

        await flight.run(fn);
        expect(flight.isInFlight).toBe(false);
        await flight.run(fn);

        expect(fn).toHaveBeenCalledTimes(2);
    });

    // A rejected flight left in place would wedge every later caller forever.
    it('releases after FAILURE, and rejects every joined caller', async () => {
        const flight = new SingleFlight<number>();
        const d = deferred<number>();
        const failing = jest.fn(() => d.promise);

        const a = flight.run(failing);
        const b = flight.run(failing);
        d.reject(new Error('boom'));

        await expect(a).rejects.toThrow('boom');
        await expect(b).rejects.toThrow('boom');
        expect(flight.isInFlight).toBe(false);

        // …and the slot still works afterwards.
        expect(await flight.run(() => Promise.resolve(42))).toBe(42);
    });

    it('does NOT cache — each new flight calls fn again', async () => {
        const flight = new SingleFlight<number>();
        let n = 0;
        const fn = jest.fn(() => Promise.resolve(++n));

        expect(await flight.run(fn)).toBe(1);
        expect(await flight.run(fn)).toBe(2);
    });

    describe('onJoin', () => {
        it('fires for joiners only, never for the caller that starts the flight', async () => {
            const flight = new SingleFlight<number>();
            const d = deferred<number>();
            const onJoin = jest.fn();

            flight.run(() => d.promise, onJoin);
            expect(onJoin).not.toHaveBeenCalled();

            flight.run(() => d.promise, onJoin);
            flight.run(() => d.promise, onJoin);
            expect(onJoin).toHaveBeenCalledTimes(2);

            d.resolve(0);
        });
    });

    it('keeps slots independent', async () => {
        const a = new SingleFlight<string>();
        const b = new SingleFlight<string>();
        const fa = jest.fn(() => Promise.resolve('a'));
        const fb = jest.fn(() => Promise.resolve('b'));

        expect(await Promise.all([a.run(fa), b.run(fb)])).toEqual(['a', 'b']);
        expect(fa).toHaveBeenCalledTimes(1);
        expect(fb).toHaveBeenCalledTimes(1);
    });
});
