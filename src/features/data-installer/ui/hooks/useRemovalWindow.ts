/**
 * The import window opened by Remove Data (owner, 2026-11-09, walk F118: "it's really strange that I
 * have to press Import before I can remove data"). It goes straight to the removal's confirm, which
 * still checks for the SC's changes first, with no import form and no comparison only an import
 * needs; and leaving it (Cancel, or Back after it ends) closes the window rather than showing a form
 * the SC never asked for.
 *
 * @module features/data-installer/ui/hooks/useRemovalWindow
 */

import { useCallback, useEffect, useRef } from 'react';

/**
 * @param opensOn - `remove` when Remove Data opened the window
 * @param arm - starts the removal's confirm (its check for changes first)
 * @param disarm - backs out of the confirm
 * @param close - closes the window
 * @returns the confirm's way out, and whether Back closes the window
 */
export function useRemovalWindow(
    opensOn: 'remove' | undefined,
    arm: () => void,
    disarm: () => void,
    close: () => void,
): { disarm: () => void; closesOnBack: boolean } {
    const removing = opensOn === 'remove';
    // The latest close: the window's own changes every render.
    const closing = useRef(close);
    closing.current = close;
    const armed = useRef(false);
    useEffect(() => {
        if (!removing || armed.current) return;
        armed.current = true;
        arm();
    }, [removing, arm]);
    const leave = useCallback((): void => {
        disarm();
        if (removing) closing.current();
    }, [disarm, removing]);
    return { disarm: leave, closesOnBack: removing };
}

/**
 * Back on a result would only close the window: one opened by Uninstall, unless the result returns
 * to the question (a save that failed). Such a result shows Close alone (review, 2026-11-10).
 */
export function backOnlyCloses(closesOnBack: boolean, result: { backToConfirm?: true } | null): boolean {
    return closesOnBack && result?.backToConfirm !== true;
}

/** A replace, or a Remove Data window, takes every data type: the removal goes whole, and shows no ticks. */
export function ticksAll(replacing: boolean, opensOn: 'remove' | undefined): boolean {
    return replacing || opensOn === 'remove';
}

/** The install record is read for the form, and for a Remove Data window, which never shows one. */
export function readsRecord(view: string, opensOn: 'remove' | undefined): boolean {
    return view === 'form' || opensOn === 'remove';
}

/** The import's comparison runs for its form only: a Remove Data window has no use for it. */
export function comparesFirst(view: string, opensOn: 'remove' | undefined): boolean {
    return view === 'form' && opensOn !== 'remove';
}

/**
 * A Remove Data window never shows the import form (walk F118): once the removal is behind it and
 * the window would fall back to the form (a status read that found no record), it closes.
 */
export function useClosesAfterRemoval(opensOn: 'remove' | undefined, view: string, lastAction: string | null, onClose: () => void): void {
    const done = opensOn === 'remove' && view === 'form' && lastAction !== null;
    useEffect(() => {
        if (done) onClose();
    }, [done, onClose]);
}
