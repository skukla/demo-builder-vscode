/**
 * A change of view in a dialog is one move, or none (dialog design rules, owner 2026-11-02).
 * A view is a width step, whether it is holding for a wait, and a title.
 *
 * - A big change: the content hides, the box eases once from the size it had to the size it ends
 *   at, and the new content fades in. Two motions used to run on one change: the height followed
 *   the content while the width eased, and text wrapping at the narrower width pushed the height
 *   back out, so a confirm folded in and then out "like an accordion".
 * - A small change, under `SMALL_CHANGE` each way: the content swaps. A removal moved four times,
 *   three of them by a few pixels, each hiding the content.
 * - A wait keeps the box it found: the width, and the height as a floor. Only the real content that
 *   follows can move it. The first open has no earlier box, so it starts at the wait's own size.
 *
 * The box is laid out at its final size at once, which is what gets measured, and the Web
 * Animations API holds it to the eased size on top of that. So nothing can be left between sizes
 * once the move ends, and it takes no inline style.
 *
 * `data-view-change` tells a `SteadyHeight` anywhere inside not to ease this change itself. It is
 * set in an insertion effect because those run before any component's layout effect, and a child's
 * layout effect runs before its parent's.
 *
 * @module core/ui/components/ui/useDialogViewChange
 */

import { type RefObject, useEffect, useInsertionEffect, useLayoutEffect, useRef, useState } from 'react';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';

/** Under this many pixels each way, a change is not worth a movement. */
const SMALL_CHANGE = 40;

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
    /** The content is hidden while the box moves. */
    resizing: boolean;
    /** The title is hidden too: it reads differently, or would rewrap as the width moves. */
    retitling: boolean;
    /** A wait is sitting in a box bigger than it needs, so it centres itself. */
    holding: boolean;
}

function wantsLessMotion(): boolean {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

/** Every suite that mocks Spectrum's Dialog has no such element, and so no move. */
function boxOf(body: HTMLElement | null): HTMLElement | null {
    return body?.closest<HTMLElement>('.modal-dialog') ?? null;
}

function isSmallChange(from: DOMRect, to: DOMRect): boolean {
    return Math.abs(from.width - to.width) < SMALL_CHANGE && Math.abs(from.height - to.height) < SMALL_CHANGE;
}

function easeBox(box: HTMLElement, from: DOMRect, to: DOMRect): Animation | undefined {
    return box.animate?.(
        [
            { width: `${from.width}px`, height: `${from.height}px` },
            { width: `${to.width}px`, height: `${to.height}px` },
        ],
        { duration: FRONTEND_TIMEOUTS.DIALOG_VIEW_CHANGE, easing: 'ease-out' },
    );
}

/** The width it had, and its height as a floor: a wait that needs more room still gets it. */
function holdBox(box: HTMLElement, size: DOMRect): Animation | undefined {
    const held = { width: `${size.width}px`, minHeight: `${size.height}px` };
    return box.animate?.([held, held], { duration: Infinity, fill: 'forwards' });
}

function sameView(a: DialogView, b: DialogView): boolean {
    return a.widthStep === b.widthStep && a.holding === b.holding && a.waiting === b.waiting && a.title === b.title;
}

export function useDialogViewChange(view: DialogView): DialogViewChange {
    const bodyRef = useRef<HTMLDivElement>(null);
    const shown = useRef(view);
    const startSize = useRef<DOMRect | null>(null);
    const held = useRef<Animation | undefined>(undefined);
    const [change, setChange] = useState<{ retitling: boolean } | null>(null);
    const [holding, setHolding] = useState(false);

    // While rendering, because this is the last moment the DOM still holds the old view. A read
    // only, so a render React throws away costs nothing.
    if (!sameView(shown.current, view)) {
        startSize.current = boxOf(bodyRef.current)?.getBoundingClientRect() ?? null;
    }

    useInsertionEffect(() => {
        const box = boxOf(bodyRef.current);
        if (box && !sameView(shown.current, view)) box.dataset.viewChange = '';
    });

    const { widthStep, holding: wantsHold, waiting, title } = view;
    useLayoutEffect(() => {
        const previous = shown.current;
        const current = { widthStep, holding: wantsHold, waiting, title };
        if (sameView(previous, current)) return undefined;
        shown.current = current;

        const box = boxOf(bodyRef.current);
        const from = startSize.current;
        if (!box || !from) return undefined;
        const settled = () => {
            delete box.dataset.viewChange;
        };

        if (wantsHold && !held.current) {
            held.current = holdBox(box, from);
            setHolding(true);
        } else if (!wantsHold && held.current) {
            held.current.cancel();
            held.current = undefined;
            setHolding(false);
        }

        const to = box.getBoundingClientRect();
        if (wantsLessMotion() || isSmallChange(from, to)) {
            settled();
            return undefined;
        }

        const move = easeBox(box, from, to);
        setChange({ retitling: previous.title !== title || previous.widthStep !== widthStep });
        const timer = setTimeout(() => {
            settled();
            setChange(null);
        }, FRONTEND_TIMEOUTS.DIALOG_VIEW_CHANGE);
        return () => {
            clearTimeout(timer);
            move?.cancel();
        };
    }, [widthStep, wantsHold, waiting, title]);

    useEffect(() => () => held.current?.cancel(), []);

    return { bodyRef, resizing: change !== null, retitling: change?.retitling ?? false, holding };
}
