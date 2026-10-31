/**
 * Ease a `SteadyHeight` from its old floor to a taller one instead of snapping (owner,
 * 2026-10-31: "can animation of modal sizes help?").
 *
 * The floor is a MINIMUM, so taller content grows the box at once and animating the minimum
 * shows nothing. So for the growth only, the box takes a real height: the old floor first, then
 * the new one on the next frame, which the stylesheet's height transition eases between
 * (`.steady-height.is-growing`, overflow hidden so the new content is revealed as it grows).
 * After `GROWTH_SETTLE`, longer than the transition, the box goes back to a plain minimum. A
 * timer rather than the transition's end event: reduced motion turns the transition off, and then
 * no end event comes. Nothing can be cut off once the growth is over.
 *
 * @module core/ui/components/layout/useGrowthAnimation
 */

import { useCallback, useEffect, useState } from 'react';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';

/** A growth under way: the floor it starts from, the one it ends at, and which it shows now. */
interface Growth {
    from: number;
    to: number;
    phase: 'from' | 'to';
}

export interface GrowthAnimation {
    /** Start easing from `from` to `to`. */
    grow: (from: number, to: number) => void;
    /** The box's height while it grows; undefined once it is a plain minimum again. */
    height: number | undefined;
    growing: boolean;
}

export function useGrowthAnimation(): GrowthAnimation {
    const [growth, setGrowth] = useState<Growth | null>(null);
    const grow = useCallback((from: number, to: number) => setGrowth({ from, to, phase: 'from' }), []);
    const settle = useCallback(() => setGrowth(null), []);

    const phase = growth?.phase;
    useEffect(() => {
        if (phase === 'from') {
            // The next frame, so the browser has drawn the old height to transition from.
            const frame = requestAnimationFrame(() => setGrowth((g) => (g ? { ...g, phase: 'to' } : g)));
            return () => cancelAnimationFrame(frame);
        }
        if (phase === 'to') {
            const timer = setTimeout(settle, FRONTEND_TIMEOUTS.GROWTH_SETTLE);
            return () => clearTimeout(timer);
        }
        return undefined;
    }, [phase, settle]);

    let height: number | undefined;
    if (growth) height = growth.phase === 'from' ? growth.from : growth.to;
    return { grow, height, growing: growth !== null };
}
