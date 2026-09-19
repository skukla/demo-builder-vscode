/**
 * useElapsedClock — a running clock for the stage in progress (PL-59).
 *
 * The one thing on a progress modal that keeps moving when NOTHING else does.
 * Operations here are made of steps that report on their own schedule, and some
 * of them are one long wait on Adobe: a mesh deploy's subscribe held a single
 * line for 1m 58s on 2026-09-19, and a still line reads as a hang rather than as
 * work (owner, same day).
 *
 * Sibling of {@link useElapsedStage}, which swaps the WORDS as a wait drags on.
 * That one needs copy written per wait and says nothing in between; this one
 * needs nothing and never stops. A surface can use both.
 *
 * @module core/ui/hooks/useElapsedClock
 */

import { useEffect, useState } from 'react';
import { formatElapsed } from '@/core/utils/timeFormatting';

/** One tick a second: as often as the displayed value can change. */
const TICK_MS = 1000;

/**
 * How long the current stage has been running, as "8s" / "1m 12s".
 *
 * @param stage - the stage in progress; a NEW value restarts the clock, and
 *   `null`/`undefined` stops it (nothing is running)
 * @returns the elapsed time, or undefined before the first second is up — so a
 *   caller renders no clock at all for a stage that passes in an instant
 */
export function useElapsedClock(stage: string | null | undefined): string | undefined {
    const [elapsedMs, setElapsedMs] = useState(0);

    useEffect(() => {
        setElapsedMs(0);
        if (!stage) return undefined;
        const startedAt = Date.now();
        const timer = setInterval(() => setElapsedMs(Date.now() - startedAt), TICK_MS);
        return () => clearInterval(timer);
    }, [stage]);

    return elapsedMs >= TICK_MS ? formatElapsed(elapsedMs) : undefined;
}
