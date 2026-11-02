/**
 * A change of view in a dialog is one move (dialog design rules, owner 2026-11-02): the content
 * hides, the box eases once from the size it had to the size it ends at, and the new content
 * fades in. A view is a width step, whether it is waiting, and a title.
 *
 * Two motions used to run on one change: the height followed the content while the width eased,
 * and text wrapping at the narrower width pushed the height back out, so a confirm folded in and
 * then out "like an accordion". Here the box is laid out at its final size at once, which is what
 * gets measured, and the Web Animations API holds it to the eased size on top of that. So nothing
 * can be left between sizes once the move ends, and it takes no inline style.
 *
 * The content is hidden before the new view is first painted, because a layout effect's state
 * change is applied before the browser draws.
 *
 * @module core/ui/components/ui/useDialogViewChange
 */

import { type RefObject, useLayoutEffect, useRef, useState } from 'react';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';

export interface DialogView {
    widthStep: string;
    waiting: boolean;
    title: string;
}

export interface DialogViewChange {
    /** On a plain element inside the dialog: the box is found from it, not by a ref on Spectrum. */
    bodyRef: RefObject<HTMLDivElement | null>;
    /** The content is hidden while the box moves. */
    resizing: boolean;
    /** The title is hidden too: it reads differently, or would rewrap as the width moves. */
    retitling: boolean;
}

function wantsLessMotion(): boolean {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

/** Every suite that mocks Spectrum's Dialog has no such element, and so no move. */
function boxOf(body: HTMLElement | null): HTMLElement | null {
    return body?.closest<HTMLElement>('.modal-dialog') ?? null;
}

function easeBox(box: HTMLElement, from: DOMRect): Animation | undefined {
    const to = box.getBoundingClientRect();
    return box.animate?.(
        [
            { width: `${from.width}px`, height: `${from.height}px` },
            { width: `${to.width}px`, height: `${to.height}px` },
        ],
        { duration: FRONTEND_TIMEOUTS.DIALOG_VIEW_CHANGE, easing: 'ease-out' },
    );
}

function sameView(a: DialogView, b: DialogView): boolean {
    return a.widthStep === b.widthStep && a.waiting === b.waiting && a.title === b.title;
}

export function useDialogViewChange(view: DialogView): DialogViewChange {
    const bodyRef = useRef<HTMLDivElement>(null);
    const shown = useRef(view);
    const startSize = useRef<DOMRect | null>(null);
    const [change, setChange] = useState<{ retitling: boolean } | null>(null);

    // While rendering, because this is the last moment the DOM still holds the old view. A read
    // only, so a render React throws away costs nothing.
    if (!sameView(shown.current, view)) {
        startSize.current = boxOf(bodyRef.current)?.getBoundingClientRect() ?? null;
    }

    const { widthStep, waiting, title } = view;
    useLayoutEffect(() => {
        const previous = shown.current;
        const current = { widthStep, waiting, title };
        if (sameView(previous, current)) return undefined;
        shown.current = current;

        const box = boxOf(bodyRef.current);
        if (!box || !startSize.current || wantsLessMotion()) return undefined;

        const move = easeBox(box, startSize.current);
        setChange({ retitling: previous.title !== title || previous.widthStep !== widthStep });
        const timer = setTimeout(() => setChange(null), FRONTEND_TIMEOUTS.DIALOG_VIEW_CHANGE);
        return () => {
            clearTimeout(timer);
            move?.cancel();
        };
    }, [widthStep, waiting, title]);

    return { bodyRef, resizing: change !== null, retitling: change?.retitling ?? false };
}
