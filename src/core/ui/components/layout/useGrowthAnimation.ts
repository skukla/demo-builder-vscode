/**
 * Ease a `SteadyHeight` from its old height to its new one, taller or shorter, instead of
 * snapping (owner, 2026-10-31: "can animation of modal sizes help?"; both ways since the dialog
 * design rules the same day).
 *
 * Content height changes at once, so animating nothing shows nothing. For the change only, the
 * box takes a real height: the old one first, then the new one on the next frame, which the
 * stylesheet's height transition eases between (`.steady-height.is-growing`, overflow hidden so
 * content is revealed or covered as it moves). After `GROWTH_SETTLE`, longer than the
 * transition, the box goes back to its content's own height. A timer rather than the
 * transition's end event: reduced motion turns the transition off, and then no end event comes.
 * Nothing can be cut off once the change is over.
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
