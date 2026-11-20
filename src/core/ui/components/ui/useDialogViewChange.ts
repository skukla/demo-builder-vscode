/**
 * A dialog's size never animates (owner, 2026-11-02). Eased moves were tried four ways, and each
 * left something that drew the eye: it folded, then it worked like an accordion, then every small
 * change moved, then the box sat empty while it expanded. A view is a width step, whether it is
 * holding for a wait, and a title.
 *
 * - A wait keeps the box it found: the width, and the height as a floor. So a run has one change of
 *   size, when the real content arrives. The first open has no earlier box, so it starts at the
 *   wait's own size.
 * - Any other change of view takes its size at once, and the body fades in to soften the swap. One
 *   wait following another fades nothing: the box and the title stay, and the spinner carries on.
 *
 * The hold uses the Web Animations API, so it takes no inline style.
 *
 * @module core/ui/components/ui/useDialogViewChange
 */

import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';

export interface DialogView {
    widthStep: string;
    /** It shows a wait, so it keeps the box it found. */
    holding: boolean;
    waiting: boolean;
    title: string;
}

export interface DialogViewChange {
    /** On a plain element inside the dialog: the box is found from it, not by a ref on Spectrum. */
    bodyRef: RefObject<HTMLDivElement | null>;
    /** A wait is sitting in a box bigger than it needs, so it centres itself. */
    holding: boolean;
}

function wantsLessMotion(): boolean {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

/** Every suite that mocks Spectrum's Dialog has no such element, and so nothing to hold. */
function boxOf(body: HTMLElement | null): HTMLElement | null {
    return body?.closest<HTMLElement>('.modal-dialog') ?? null;
}

/** The width it had, and its height as a floor: a wait that needs more room still gets it. */
function holdBox(box: HTMLElement, size: DOMRect): Animation | undefined {
    const held = { width: `${size.width}px`, minHeight: `${size.height}px` };
    return box.animate?.([held, held], { duration: Infinity, fill: 'forwards' });
}

function fadeIn(body: HTMLElement): void {
    if (wantsLessMotion()) return;
    body.animate?.([{ opacity: 0 }, { opacity: 1 }], {
        duration: FRONTEND_TIMEOUTS.DIALOG_BODY_FADE,
        easing: 'ease-in',
    });
}

function sameView(a: DialogView, b: DialogView): boolean {
    return a.widthStep === b.widthStep && a.holding === b.holding && a.waiting === b.waiting && a.title === b.title;
}

export function useDialogViewChange(view: DialogView): DialogViewChange {
    const bodyRef = useRef<HTMLDivElement>(null);
    const shown = useRef(view);
    const startSize = useRef<DOMRect | null>(null);
    const held = useRef<Animation | undefined>(undefined);
    const [holding, setHolding] = useState(false);

    // While rendering, because this is the last moment the DOM still holds the old view. A read
    // only, so a render React throws away costs nothing.
    if (!sameView(shown.current, view)) {
        startSize.current = boxOf(bodyRef.current)?.getBoundingClientRect() ?? null;
    }

    const { widthStep, holding: wantsHold, waiting, title } = view;
    useLayoutEffect(() => {
        const previous = shown.current;
        const current = { widthStep, holding: wantsHold, waiting, title };
        if (sameView(previous, current)) return;
        shown.current = current;

        const body = bodyRef.current;
        const box = boxOf(body);
        if (!body || !box) return;

        if (wantsHold && !held.current && startSize.current) {
            held.current = holdBox(box, startSize.current);
            setHolding(true);
        } else if (!wantsHold && held.current) {
            held.current.cancel();
            held.current = undefined;
            setHolding(false);
        }

        if (!(previous.holding && wantsHold)) fadeIn(body);
    }, [widthStep, wantsHold, waiting, title]);

    useEffect(() => () => held.current?.cancel(), []);

    return { bodyRef, holding };
}
