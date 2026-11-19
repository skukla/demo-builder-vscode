/**
 * A creation's time limit, which stops counting while the run is paused for the SC.
 *
 * A run that pauses on a failed step waits for the SC to fix the problem (F307), and a
 * fix can take longer than the run itself. With a fixed 30-minute limit, a slow fix ended
 * the run, and the run's cleanup deleted the project the SC was fixing. So the limit
 * counts the time the run is working, not the time it waits.
 *
 * The limit is registered by the run's stop signal, so a step that pauses can hold it
 * without being handed it (`creationPause.ts`).
 *
 * @module features/project-creation/handlers/creationLimit
 */

import { TimeoutError } from '@/core/utils/timeoutError';

/** A run's limit. */
export interface CreationLimit {
    /** Rejects with a TimeoutError once the run has worked for the whole limit. */
    readonly expired: Promise<never>;
    /** Stop counting: the run is waiting for the SC. */
    hold(): void;
    /** Count again from where it stopped. */
    release(): void;
    /** The run ended: clear the timer. */
    stop(): void;
}

/** Each running creation's limit, by its stop signal. */
const limits = new WeakMap<AbortSignal, CreationLimit>();

/**
 * Start a run's limit.
 *
 * @param ms - how long the run may work
 * @param operation - what timed out, for the TimeoutError's sentence
 * @param signal - the run's stop, which a pausing step finds the limit by
 * @returns the limit, already counting
 */
export function startCreationLimit(
    ms: number,
    operation: string,
    signal: AbortSignal,
): CreationLimit {
    let remaining = ms;
    let startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expire: (error: TimeoutError) => void = () => undefined;
    const expired = new Promise<never>((_resolve, reject) => {
        expire = reject;
    });
    // Nobody may be listening when the run ends first.
    expired.catch(() => undefined);
    const count = () => {
        startedAt = Date.now();
        timer = setTimeout(() => expire(new TimeoutError(operation, ms)), remaining);
    };
    const clear = () => {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
    };
    const limit: CreationLimit = {
        expired,
        hold: () => {
            if (timer === undefined) return;
            clear();
            remaining = Math.max(0, remaining - (Date.now() - startedAt));
        },
        release: () => {
            if (timer === undefined) count();
        },
        stop: clear,
    };
    count();
    limits.set(signal, limit);
    return limit;
}

/**
 * The limit of the run this signal stops, if one is counting.
 *
 * @param signal - the run's stop
 * @returns its limit, or undefined (a run with no limit, as in a test)
 */
export function creationLimitOf(signal: AbortSignal | undefined): CreationLimit | undefined {
    return signal ? limits.get(signal) : undefined;
}
