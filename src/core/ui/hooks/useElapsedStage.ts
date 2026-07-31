/**
 * useElapsedStage — advance a message as a long wait drags on.
 *
 * A static spinner label is fine for a two-second fetch and reads as FROZEN for a
 * forty-second one. The Adobe org-services catalog measured 38.9s for 96 services
 * on a real org (2026-07-31), which is well past the point where a user starts
 * wondering whether anything is happening.
 *
 * Pairs with `LoadingDisplay`'s existing props rather than replacing them:
 * `helperText` states the expectation up front and stays put, while this drives
 * `subMessage` so the surface visibly keeps moving.
 *
 * @module core/ui/hooks/useElapsedStage
 */

import { useEffect, useState } from 'react';

/** A message that takes over once the wait passes `afterMs`. */
export interface ElapsedStage {
    afterMs: number;
    message: string;
}

/** Tick often enough to feel responsive, rarely enough to be free. */
const TICK_MS = 1000;

/**
 * The message for the LATEST stage whose threshold the wait has passed.
 *
 * @param active - whether the wait is in progress; resets to the start when false
 * @param stages - thresholds in any order (sorted internally); [] disables
 * @returns the current stage message, or undefined before the first threshold
 */
export function useElapsedStage(active: boolean, stages: ElapsedStage[]): string | undefined {
    const [elapsedMs, setElapsedMs] = useState(0);

    useEffect(() => {
        if (!active) {
            setElapsedMs(0);
            return undefined;
        }
        const startedAt = Date.now();
        const timer = setInterval(() => setElapsedMs(Date.now() - startedAt), TICK_MS);
        return () => clearInterval(timer);
    }, [active]);

    if (!active) return undefined;
    // Latest threshold passed wins, so callers can list stages in any order.
    return stages
        .filter((stage) => elapsedMs >= stage.afterMs)
        .sort((a, b) => a.afterMs - b.afterMs)
        .pop()?.message;
}

/**
 * Stages for the Adobe org-services catalog fetch, shared by every surface that
 * waits on it (the wizard's API picker, the dashboard's Edit-APIs modal).
 *
 * The copy attributes the wait to Adobe and confirms liveness — it does NOT
 * explain the cause, because we do not know it. The evidence is a single
 * measurement (38.9s for 96 services, 2026-07-31). Earlier drafts blamed the
 * payload ("returns the entire catalog at once") and then org size ("large
 * organizations can take a minute"); 96 rows is a tiny response, so size is
 * almost certainly not the bottleneck, and one org is no basis for a claim about
 * bigger ones. Do not add a mechanism here without a measurement behind it.
 */
export const ORG_SERVICES_LOADING_STAGES: ElapsedStage[] = [
    { afterMs: 4000, message: "Waiting on Adobe's API catalog service…" },
    { afterMs: 15000, message: 'Still waiting — Adobe can take up to a minute to respond.' },
];
