/**
 * useRunClock — how long a whole run has been going, for the progress modal (PL-59).
 *
 * The one thing on a progress modal that keeps moving when nothing else does: a
 * step can hold one line for two minutes while it waits on Adobe (a mesh deploy's
 * subscribe, 1m 58s on 2026-09-19), and a still line reads as a hang.
 *
 * It counts from the start the extension stamps on every push (`startedAt`), so a
 * modal opened mid-run still counts the whole run. Until 2026-10-16 the clock timed
 * the STAGE and restarted with each one, so nothing could say how long a reset took,
 * and the restarts looked like glitches (owner). One clock, for the run.
 *
 * @module core/ui/hooks/useRunClock
 */

import { useEffect, useState } from 'react';
import { formatElapsed } from '@/core/utils/timeFormatting';

/** One tick a second: as often as the displayed value can change. */
const TICK_MS = 1000;

/**
 * How long the run has been going, as "8 seconds" / "2 minutes, 40 seconds".
 *
 * @param startedAt - when the run began, ms since the epoch; undefined stops the clock
 * @returns the elapsed time, or undefined before the first second is up — so a run
 *   that ends in an instant shows no clock at all
 */
export function useRunClock(startedAt: number | undefined): string | undefined {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (startedAt === undefined) return undefined;
        setNow(Date.now());
        const timer = setInterval(() => setNow(Date.now()), TICK_MS);
        return () => clearInterval(timer);
    }, [startedAt]);

    if (startedAt === undefined) return undefined;
    const elapsedMs = now - startedAt;
    return elapsedMs >= TICK_MS ? formatElapsed(elapsedMs) : undefined;
}

/**
 * How long a run must take before its last view says so. A shorter one was over before
 * anyone wondered, and the line only made the result busier (owner, 2026-10-26).
 */
export const TOOK_WORTH_SAYING_MS = 60_000;

/**
 * How long a run took, as the value of a labelled "Took" row ("3 minutes, 12 seconds"), or
 * undefined for a run under {@link TOOK_WORTH_SAYING_MS}: the result screens show it as a row
 * (owner, 2026-10-31).
 *
 * @param tookMs - how long the run took, as the extension measured it
 * @returns the value, or undefined when the run was short
 */
export function tookValue(tookMs: number): string | undefined {
    return tookMs < TOOK_WORTH_SAYING_MS ? undefined : formatElapsed(tookMs);
}
