/**
 * A creation's limit counts the time the run works, not the time it waits on the SC (F307).
 */

import {
    creationLimitOf,
    startCreationLimit,
} from '@/features/project-creation/handlers/creationLimit';
import { TimeoutError } from '@/core/utils/timeoutError';

beforeEach(() => {
    jest.useFakeTimers();
});

afterEach(() => {
    jest.useRealTimers();
});

/** Whether the limit has expired, read without waiting. */
function watch(expired: Promise<never>): () => unknown {
    let error: unknown;
    expired.catch((e: unknown) => {
        error = e;
    });
    return () => error;
}

describe('startCreationLimit', () => {
    it('expires with a TimeoutError once the run has worked for the whole limit', async () => {
        const limit = startCreationLimit(1000, 'Project creation', new AbortController().signal);
        const error = watch(limit.expired);

        await jest.advanceTimersByTimeAsync(1000);

        expect(error()).toBeInstanceOf(TimeoutError);
    });

    it('does not count while held, and counts on from where it stopped', async () => {
        const limit = startCreationLimit(1000, 'Project creation', new AbortController().signal);
        const error = watch(limit.expired);

        await jest.advanceTimersByTimeAsync(600);
        limit.hold();
        await jest.advanceTimersByTimeAsync(60_000);
        expect(error()).toBeUndefined();

        limit.release();
        await jest.advanceTimersByTimeAsync(399);
        expect(error()).toBeUndefined();
        await jest.advanceTimersByTimeAsync(1);
        expect(error()).toBeInstanceOf(TimeoutError);
    });

    it('never expires once stopped', async () => {
        const limit = startCreationLimit(1000, 'Project creation', new AbortController().signal);
        const error = watch(limit.expired);

        limit.stop();
        await jest.advanceTimersByTimeAsync(5000);

        expect(error()).toBeUndefined();
    });

    it('is found by the run it was started for', () => {
        const signal = new AbortController().signal;
        const limit = startCreationLimit(1000, 'Project creation', signal);

        expect(creationLimitOf(signal)).toBe(limit);
        expect(creationLimitOf(new AbortController().signal)).toBeUndefined();
        expect(creationLimitOf(undefined)).toBeUndefined();
        limit.stop();
    });
});
