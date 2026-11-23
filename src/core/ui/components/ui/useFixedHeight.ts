/**
 * A window never changes height once on screen (owner, 2026-11-11). It opens at the height of the
 * tallest thing it will show, keeps that height for every step, pins its buttons at the bottom and
 * scrolls only the middle. This replaces `SteadyHeight`'s fit-and-ease, which still moved the box.
 *
 * The caller draws every step it may show, hidden, in one grid cell beside the one it shows (the
 * `.modal-steps` reserve), so the tallest sets the box from the first frame. Once `ready` (what
 * the steps hold is known), this measures the box once and holds it, and the hidden steps can go.
 * The hold uses the Web Animations API, as `useDialogViewChange` does, so it takes no inline style.
 *
 * @module core/ui/components/ui/useFixedHeight
 */

import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface FixedHeight {
    /** On a plain element inside the dialog: the box is found from it. */
    ref: RefObject<HTMLDivElement | null>;
    /** The height is held, so the reserve is no longer needed. */
    locked: boolean;
}

/**
 * Hold the dialog's height once it is ready.
 *
 * @param ready - what the hidden steps hold is known, so the box is at its tallest
 * @returns the ref to place inside the dialog, and whether the height is held
 */
export function useFixedHeight(ready: boolean): FixedHeight {
    const ref = useRef<HTMLDivElement>(null);
    const held = useRef<Animation | undefined>(undefined);
    const [locked, setLocked] = useState(false);

    useLayoutEffect(() => {
        if (!ready || locked) return;
        const box = ref.current?.closest<HTMLElement>('.modal-dialog');
        const height = box?.getBoundingClientRect().height ?? 0;
        if (box && height > 0) {
            const size = `${height}px`;
            const frame = { height: size, minHeight: size, maxHeight: size };
            held.current = box.animate?.([frame, frame], { duration: Infinity, fill: 'forwards' });
        }
        // Locked even where nothing can be held (a test's DOM has no layout): the reserve goes.
        setLocked(true);
    }, [ready, locked]);

    useEffect(() => () => held.current?.cancel(), []);

    return { ref, locked };
}
