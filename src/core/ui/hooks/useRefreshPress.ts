/**
 * useRefreshPress — whether the list on screen is being read again because the SC pressed Refresh,
 * as against a re-read nobody pressed (a pack installed elsewhere, a project saved). A pressed
 * Refresh waits where the answer lands, the grid giving way to a spinner (owner, 2026-11-17, walk
 * F214); a re-read nobody pressed keeps the cards where they are.
 *
 * It follows the screen's own loading flag rather than a promise, because the Datapacks screen's
 * request hook answers through state: pressed until the read it started has been seen out.
 *
 * @module core/ui/hooks/useRefreshPress
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface RefreshPress {
    /** A pressed Refresh's read is still out. */
    pressed: boolean;
    /** Call with the press; the read itself is the caller's to start. */
    markPressed: () => void;
}

/**
 * @param loading - whether the screen's list is being read now
 * @returns whether the read under way was pressed for, and how to say one was
 */
export function useRefreshPress(loading: boolean): RefreshPress {
    const [pressed, setPressed] = useState(false);
    const sawLoading = useRef(false);
    useEffect(() => {
        if (!pressed) return;
        if (loading) {
            sawLoading.current = true;
            return;
        }
        if (sawLoading.current) {
            sawLoading.current = false;
            setPressed(false);
        }
    }, [pressed, loading]);
    const markPressed = useCallback((): void => {
        sawLoading.current = false;
        setPressed(true);
    }, []);
    return { pressed, markPressed };
}
