/**
 * Where Tab actually SENDS focus — the half the older suites do not check.
 *
 * WHY THIS EXISTS. Every existing Tab test asserts that `preventDefault` was
 * called and stops there, with a comment saying jsdom cannot do better. It can:
 * `HTMLElement.focus()` moves `document.activeElement` in jsdom exactly as it
 * does in a browser. "preventDefault was called" is true of a trap that wraps to
 * the wrong end, of one that fires on a middle element it should ignore, and of
 * one that redirects a plain Tab as though Shift were held — so it distinguishes
 * a working trap from almost nothing.
 *
 * The four positions are the whole specification: the boundaries wrap, the
 * middle is left alone, and a press from OUTSIDE the container enters it at the
 * end the direction implies.
 */

import { render } from '@testing-library/react';
import React from 'react';
import { useFocusTrap } from '@/core/ui/hooks/useFocusTrap';

function Trap({
    empty = false,
    containFocus = true,
}: {
    empty?: boolean;
    containFocus?: boolean;
}) {
    const ref = useFocusTrap<HTMLDivElement>({ enabled: true, autoFocus: false, containFocus });
    return (
        <div ref={ref} data-testid="trap">
            {!empty && (
                <>
                    <button data-testid="first">First</button>
                    <button data-testid="second">Second</button>
                    <button data-testid="last">Last</button>
                </>
            )}
        </div>
    );
}

function tabEvent(shiftKey = false) {
    return new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
}

/** Dispatch a key press FROM the element that currently has focus. */
function press(event: KeyboardEvent) {
    const spy = jest.spyOn(event, 'preventDefault');
    (document.activeElement ?? document.body).dispatchEvent(event);
    return spy;
}

describe('useFocusTrap — where Tab sends focus', () => {
    let external: HTMLButtonElement;

    beforeEach(() => {
        external = document.createElement('button');
        external.textContent = 'Outside';
        document.body.appendChild(external);
    });

    afterEach(() => {
        external.remove();
    });

    describe('from inside the container', () => {
        it('wraps Tab on the last element round to the first', () => {
            const { getByTestId } = render(<Trap />);
            getByTestId('last').focus();

            const spy = press(tabEvent());

            expect(spy).toHaveBeenCalled();
            expect(document.activeElement).toBe(getByTestId('first'));
        });

        it('wraps Shift+Tab on the first element round to the last', () => {
            const { getByTestId } = render(<Trap />);
            getByTestId('first').focus();

            const spy = press(tabEvent(true));

            expect(spy).toHaveBeenCalled();
            expect(document.activeElement).toBe(getByTestId('last'));
        });

        // The middle is where a trap that fires on the wrong condition shows
        // itself: there is nothing to wrap, so the browser's own Tab must run.
        it('leaves a plain Tab in the middle to the browser', () => {
            const { getByTestId } = render(<Trap />);
            getByTestId('second').focus();

            const spy = press(tabEvent());

            expect(spy).not.toHaveBeenCalled();
            expect(document.activeElement).toBe(getByTestId('second'));
        });

        it('leaves a Shift+Tab in the middle to the browser', () => {
            const { getByTestId } = render(<Trap />);
            getByTestId('second').focus();

            const spy = press(tabEvent(true));

            expect(spy).not.toHaveBeenCalled();
            expect(document.activeElement).toBe(getByTestId('second'));
        });

        // Direction matters at a boundary: only Shift+Tab wraps at the FIRST
        // element, only plain Tab wraps at the LAST. The other pair is ordinary
        // movement further into the container.
        it('leaves a plain Tab on the first element to the browser', () => {
            const { getByTestId } = render(<Trap />);
            getByTestId('first').focus();

            const spy = press(tabEvent());

            expect(spy).not.toHaveBeenCalled();
            expect(document.activeElement).toBe(getByTestId('first'));
        });

        it('leaves a Shift+Tab on the last element to the browser', () => {
            const { getByTestId } = render(<Trap />);
            getByTestId('last').focus();

            const spy = press(tabEvent(true));

            expect(spy).not.toHaveBeenCalled();
            expect(document.activeElement).toBe(getByTestId('last'));
        });

        it('ignores keys that are not Tab', () => {
            const { getByTestId } = render(<Trap />);
            getByTestId('last').focus();

            const spy = press(
                new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
            );

            expect(spy).not.toHaveBeenCalled();
            expect(document.activeElement).toBe(getByTestId('last'));
        });
    });

    // Containment is off throughout this block. With it on, merely focusing an
    // element outside the container is pulled straight back by `focusin`, so the
    // Tab under test would be pressed from INSIDE — which is a different branch,
    // and is how the Shift+Tab case here first passed for the wrong reason.
    describe('from outside the container', () => {
        // This is the reason the listener is on `document` rather than on the
        // container: a Tab pressed anywhere must be able to ENTER the webview.
        it('sends a plain Tab to the first element', () => {
            const { getByTestId } = render(<Trap containFocus={false} />);
            external.focus();

            const spy = press(tabEvent());

            expect(spy).toHaveBeenCalled();
            expect(document.activeElement).toBe(getByTestId('first'));
        });

        it('sends a Shift+Tab to the last element', () => {
            const { getByTestId } = render(<Trap containFocus={false} />);
            external.focus();

            const spy = press(tabEvent(true));

            expect(spy).toHaveBeenCalled();
            expect(document.activeElement).toBe(getByTestId('last'));
        });

        // With nothing to trap, the press has to be left alone — preventing the
        // default here would strand the user on a container they cannot enter.
        it('does not intercept Tab when the container holds nothing focusable', () => {
            render(<Trap empty containFocus={false} />);
            external.focus();

            const spy = press(tabEvent());

            expect(spy).not.toHaveBeenCalled();
            expect(document.activeElement).toBe(external);
        });
    });

    // The listener is registered in the CAPTURE phase, so it sees the press
    // before anything inside the page can stop it. A Spectrum component that
    // calls stopPropagation on its own keydown would otherwise silently switch
    // the trap off for everything below it.
    it('still traps when a component below the container stops propagation', () => {
        const { getByTestId } = render(<Trap />);
        const container = getByTestId('trap');
        const halt = (e: Event) => e.stopPropagation();
        container.addEventListener('keydown', halt);

        try {
            getByTestId('last').focus();
            const spy = press(tabEvent());

            expect(spy).toHaveBeenCalled();
            expect(document.activeElement).toBe(getByTestId('first'));
        } finally {
            container.removeEventListener('keydown', halt);
        }
    });
});
