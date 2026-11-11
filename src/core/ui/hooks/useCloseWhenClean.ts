/**
 * useCloseWhenClean — a clean result that is its title alone closes itself after a glance.
 *
 * The one place the rule lives (owner, 2026-11-10; `docs/development/sop/dialog-design.md`):
 * a result with nothing left to read closes after `TIMEOUTS.UI.RESULT_GLANCE`, in every window;
 * a result with a sentence, a note, a list, a next step or a problem stays until closed. Which
 * component drew the run used to decide it, so a four-minute mesh deploy vanished while
 * "Projects Reset" stayed on its title.
 *
 * Not the timed toast this repo removed: the window was on screen for the whole run, and the
 * title with its green icon is its last beat.
 *
 * @module core/ui/hooks/useCloseWhenClean
 */

import { useEffect, useRef } from 'react';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/**
 * Close the window after a glance while it shows a clean result with nothing to read.
 *
 * @param clean - the window shows a successful result that is its title alone; false while it
 *   runs, when it failed, or when it holds anything to read or do
 * @param onClose - closes the window; called once, `RESULT_GLANCE` after `clean` turned true
 */
export function useCloseWhenClean(clean: boolean, onClose: () => void): void {
    // Held in a ref so a caller's inline `onClose`, new every render, does not restart the glance.
    const close = useRef(onClose);
    close.current = onClose;
    useEffect(() => {
        if (!clean) return undefined;
        const timer = setTimeout(() => close.current(), TIMEOUTS.UI.RESULT_GLANCE);
        return () => clearTimeout(timer);
    }, [clean]);
}
