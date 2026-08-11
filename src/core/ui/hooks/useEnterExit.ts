/**
 * useEnterExit — track which items just appeared / disappeared so a list can animate
 * them IN and OUT. Extracted verbatim from TimelineNav's inline orchestration so the
 * wizard timeline AND the area sub-step strip (StepRail) share ONE in/out
 * approach instead of each rolling its own.
 *
 * Returns the items to RENDER — the current items, plus any just-removed ones
 * re-inserted at their original positions and flagged `isExiting` so they can animate
 * out before they're dropped — together with an `isEntering(id)` test for the entrance
 * class. A first-mount settle delay (no animate-all on initial render) and a timed clear
 * of the flags (so a re-render can't cut an animation short) are built in.
 *
 * The CSS is the caller's: the timeline animates a max-HEIGHT (vertical rail), the
 * sub-step strip a max-WIDTH (horizontal tabs); only the enter/exit ORCHESTRATION is
 * shared here.
 *
 * @module core/ui/hooks/useEnterExit
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';

/** Minimum shape: every tracked item needs a stable id. */
export interface EnterExitItem {
    id: string;
}

/** What the hook hands back to the renderer. */
export interface UseEnterExitResult<T> {
    /** Items to render: current items + exiting ones re-inserted, each flagged. */
    displayItems: Array<T & { isExiting: boolean }>;
    /** Whether `id` just appeared (apply the entrance animation to it). */
    isEntering: (id: string) => boolean;
    /** False during the initial settle window — guards against animate-all-on-mount. */
    animationsEnabled: boolean;
}

/**
 * Track enter/exit transitions for a keyed list.
 *
 * @param items - the current ordered items (each with a stable `id`)
 * @returns the items to render (incl. exiting), an `isEntering` test, and the
 *          animations-enabled flag
 */
export function useEnterExit<T extends EnterExitItem>(items: T[]): UseEnterExitResult<T> {
    const prevRef = useRef<T[]>([]);
    const [animationsEnabled, setAnimationsEnabled] = useState(false);
    const [entering, setEntering] = useState<Set<string>>(new Set());
    const [exiting, setExiting] = useState<Array<T & { originalIndex: number }>>([]);

    // Enable animations after the initial load settles (so the list doesn't animate
    // every item on first render).
    useEffect(() => {
        if (items.length > 0 && !animationsEnabled) {
            const timer = setTimeout(
                () => setAnimationsEnabled(true),
                FRONTEND_TIMEOUTS.INIT_ANIMATION_DELAY,
            );
            return () => clearTimeout(timer);
        }
        return undefined;
    }, [items.length, animationsEnabled]);

    // On each change, diff against the previous items to find what entered / exited,
    // then clear the flags once the animation has settled. useLayoutEffect (not
    // useEffect) so the enter/exit flag is applied BEFORE the browser paints — without
    // it the new item paints once at full size, then jumps to its from-state and
    // animates (a visible flicker), and an exiting item vanishes for a frame before it
    // re-appears to animate out.
    useLayoutEffect(() => {
        if (items.length === 0) return undefined;
        if (!animationsEnabled) {
            prevRef.current = items;
            return undefined;
        }

        const currentIds = new Set(items.map(i => i.id));
        const prev = prevRef.current;
        const prevIds = new Set(prev.map(i => i.id));

        const enteringIds = items.filter(i => !prevIds.has(i.id)).map(i => i.id);
        const exitingItems = prev
            .map((i, index) => ({ ...i, originalIndex: index }))
            .filter(i => !currentIds.has(i.id));

        if (enteringIds.length > 0 || exitingItems.length > 0) {
            if (enteringIds.length > 0) setEntering(new Set(enteringIds));
            if (exitingItems.length > 0) setExiting(exitingItems);

            const timer = setTimeout(() => {
                setEntering(new Set());
                setExiting([]);
                prevRef.current = items; // commit the ref only after the animation settles
            }, FRONTEND_TIMEOUTS.ANIMATION_SETTLE);
            return () => clearTimeout(timer);
        }

        prevRef.current = items;
        return undefined;
    }, [items, animationsEnabled]);

    // Render the current items, re-inserting exiting ones at their original positions
    // so they animate out in place before they're dropped.
    const displayItems = useMemo<Array<T & { isExiting: boolean }>>(() => {
        if (exiting.length === 0) {
            return items.map(i => ({ ...i, isExiting: false }));
        }
        const result: Array<T & { isExiting: boolean }> = items.map(i => ({
            ...i,
            isExiting: false,
        }));
        let offset = 0;
        for (const ex of exiting) {
            const insertIndex = Math.min(ex.originalIndex + offset, result.length);
            const { originalIndex: _drop, ...item } = ex;
            result.splice(insertIndex, 0, { ...(item as unknown as T), isExiting: true });
            offset += 1;
        }
        return result;
    }, [items, exiting]);

    return {
        displayItems,
        isEntering: (id: string) => entering.has(id),
        animationsEnabled,
    };
}
