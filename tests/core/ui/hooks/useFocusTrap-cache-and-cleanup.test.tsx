/**
 * The three things the trap does BESIDES handle Tab: it keeps its list of
 * focusable elements current, it pulls escaped focus back, and it takes all of
 * that away again on unmount.
 *
 * WHY EACH IS HERE. The cached element list is why the trap works at all in a
 * Spectrum webview — the elements are not there when the effect first runs, so
 * a MutationObserver re-reads them and auto-focus is retried once they appear.
 * Nothing tested that the observer was watching the right things: with the
 * wrong `observe` options it still exists, still fires for some changes, and
 * silently misses the ones that matter (a button added deeper in the tree, a
 * button becoming disabled).
 *
 * The defaults are tested by CALLING THE HOOK WITH NO OPTIONS, because that is
 * how most callers use it. A default that flips — auto-focus on, containment
 * off — is invisible to every test that passes the option explicitly.
 */

import { act, render } from '@testing-library/react';
import React from 'react';
import { useFocusTrap, FOCUSABLE_SELECTOR } from '@/core/ui/hooks/useFocusTrap';

interface Options {
    enabled?: boolean;
    autoFocus?: boolean;
    focusableSelector?: string;
    containFocus?: boolean;
}

/** Renders the trap over whatever children the test needs. */
function Trap({ options, children }: { options?: Options; children?: React.ReactNode }) {
    const ref = useFocusTrap<HTMLDivElement>(options);
    return (
        <div ref={ref} data-testid="trap">
            {children}
        </div>
    );
}

const THREE_BUTTONS = (
    <>
        <button data-testid="first">First</button>
        <button data-testid="second">Second</button>
        <button data-testid="last">Last</button>
    </>
);

function tabEvent(shiftKey = false) {
    return new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
}

function press(event: KeyboardEvent) {
    const spy = jest.spyOn(event, 'preventDefault');
    (document.activeElement ?? document.body).dispatchEvent(event);
    return spy;
}

/** Let the MutationObserver's microtask deliver before asserting. */
const flushObserver = () => act(async () => {});

describe('useFocusTrap — defaults when called with no options', () => {
    it('is enabled: Tab at the last element wraps without asking for it', () => {
        const { getByTestId } = render(<Trap>{THREE_BUTTONS}</Trap>);
        getByTestId('last').focus();

        const spy = press(tabEvent());

        expect(spy).toHaveBeenCalled();
        expect(document.activeElement).toBe(getByTestId('first'));
    });

    // Auto-focus off is the right default: a trap that grabs focus on mount
    // moves the caret out of whatever the user was doing.
    it('does not auto-focus anything on mount', () => {
        const { getByTestId } = render(<Trap>{THREE_BUTTONS}</Trap>);

        expect(document.activeElement).not.toBe(getByTestId('first'));
        expect(document.activeElement).toBe(document.body);
    });

    it('contains focus: a focusin outside is pulled back to the first element', () => {
        const { getByTestId } = render(<Trap>{THREE_BUTTONS}</Trap>);
        const first = getByTestId('first');
        const spy = jest.spyOn(first, 'focus');

        const outside = document.createElement('button');
        document.body.appendChild(outside);
        outside.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

        expect(spy).toHaveBeenCalled();
        outside.remove();
    });
});

describe('useFocusTrap — auto-focus', () => {
    it('focuses the first element when asked', () => {
        const { getByTestId } = render(<Trap options={{ autoFocus: true }}>{THREE_BUTTONS}</Trap>);

        expect(document.activeElement).toBe(getByTestId('first'));
    });

    it('does nothing, and does not throw, when the container is empty', () => {
        expect(() => render(<Trap options={{ autoFocus: true }} />)).not.toThrow();
        expect(document.activeElement).toBe(document.body);
    });

    // The Spectrum case the retry exists for: nothing is focusable when the
    // effect runs, and the elements arrive a tick later.
    it('retries once the first focusable element appears', async () => {
        const { getByTestId } = render(<Trap options={{ autoFocus: true }} />);
        const late = document.createElement('button');
        getByTestId('trap').appendChild(late);

        await flushObserver();

        expect(document.activeElement).toBe(late);
    });

    // …and only once. After the user has moved on, a later batch of elements
    // must not drag focus back — that is the scroll-to-top class of bug.
    // Containment is off here so that the focus which must NOT move is genuinely
    // parked outside the container; with it on, `focusin` would pull focus back
    // and the assertion would be about containment rather than auto-focus.
    it('does not steal focus back when more elements appear later', async () => {
        const { getByTestId } = render(
            <Trap options={{ autoFocus: true, containFocus: false }} />,
        );
        const container = getByTestId('trap');
        const late = document.createElement('button');
        container.appendChild(late);
        await flushObserver();

        const elsewhere = document.createElement('button');
        document.body.appendChild(elsewhere);
        elsewhere.focus();

        // Empty the container and refill it: the cache goes back to zero and
        // then rises again, which is the same transition that triggered the
        // retry above.
        late.remove();
        await flushObserver();
        container.appendChild(document.createElement('button'));
        await flushObserver();

        expect(document.activeElement).toBe(elsewhere);
        elsewhere.remove();
    });
});

describe('useFocusTrap — what the observer watches', () => {
    // subtree. Spectrum renders its buttons several levels down; an observer
    // watching only the container's direct children never sees them.
    it('notices an element added deeper than a direct child', async () => {
        const { getByTestId } = render(
            <Trap options={{ autoFocus: false }}>
                {THREE_BUTTONS}
                <div data-testid="nest" />
            </Trap>,
        );
        const deep = document.createElement('button');
        getByTestId('nest').appendChild(deep);

        await flushObserver();

        // `deep` is now the last focusable element, so Tab on it must wrap.
        deep.focus();
        const spy = press(tabEvent());

        expect(spy).toHaveBeenCalled();
        expect(document.activeElement).toBe(getByTestId('first'));
    });

    // attributeFilter. A button that becomes disabled leaves the tab order, and
    // the element before it becomes the new boundary.
    it('notices an element becoming disabled', async () => {
        const { getByTestId } = render(<Trap options={{ autoFocus: false }}>{THREE_BUTTONS}</Trap>);
        (getByTestId('last') as HTMLButtonElement).disabled = true;

        await flushObserver();

        getByTestId('second').focus();
        const spy = press(tabEvent());

        expect(spy).toHaveBeenCalled();
        expect(document.activeElement).toBe(getByTestId('first'));
    });

    it('honours a custom focusable selector', () => {
        const { getByTestId } = render(
            <Trap options={{ focusableSelector: '[data-in-trap]' }}>
                <button data-testid="ignored">Ignored</button>
                <button data-in-trap data-testid="only">Only</button>
            </Trap>,
        );

        // One element in the cache means it is both first and last: Tab on it
        // wraps to itself, and the ignored button is not a boundary.
        getByTestId('only').focus();
        const spy = press(tabEvent());

        expect(spy).toHaveBeenCalled();
        expect(document.activeElement).toBe(getByTestId('only'));
    });

    it('exports the selector it uses by default', () => {
        expect(FOCUSABLE_SELECTOR).toContain('button:not([disabled])');
    });
});

describe('useFocusTrap — focus containment', () => {
    let outside: HTMLButtonElement;

    beforeEach(() => {
        outside = document.createElement('button');
        document.body.appendChild(outside);
    });

    afterEach(() => outside.remove());

    it('leaves focus alone when it lands INSIDE the container', () => {
        const { getByTestId } = render(
            <Trap options={{ containFocus: true }}>{THREE_BUTTONS}</Trap>,
        );
        const first = getByTestId('first');
        const spy = jest.spyOn(first, 'focus');

        getByTestId('second').dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

        expect(spy).not.toHaveBeenCalled();
    });

    // With nothing to pull focus back TO, containment has to stand down rather
    // than reach into an empty list.
    it('stands down when the container holds nothing focusable', () => {
        render(<Trap options={{ containFocus: true }} />);
        outside.focus();

        expect(() =>
            outside.dispatchEvent(new FocusEvent('focusin', { bubbles: true })),
        ).not.toThrow();
        expect(document.activeElement).toBe(outside);
    });

    it('does not listen at all when containment is off', () => {
        const { getByTestId } = render(
            <Trap options={{ containFocus: false }}>{THREE_BUTTONS}</Trap>,
        );
        const spy = jest.spyOn(getByTestId('first'), 'focus');

        outside.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

        expect(spy).not.toHaveBeenCalled();
    });

    // Registered in the capture phase for the same reason as the keydown
    // listener: anything on the way up can stop the event.
    it('still contains focus when something below body stops propagation', () => {
        const { getByTestId } = render(
            <Trap options={{ containFocus: true }}>{THREE_BUTTONS}</Trap>,
        );
        const spy = jest.spyOn(getByTestId('first'), 'focus');
        const halt = (e: Event) => e.stopPropagation();
        document.body.addEventListener('focusin', halt);

        try {
            outside.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
            expect(spy).toHaveBeenCalled();
        } finally {
            document.body.removeEventListener('focusin', halt);
        }
    });
});

describe('useFocusTrap — cleanup on unmount', () => {
    it('stops trapping Tab', () => {
        const { unmount } = render(
            <Trap options={{ containFocus: false }}>{THREE_BUTTONS}</Trap>,
        );
        unmount();

        const spy = press(tabEvent());

        expect(spy).not.toHaveBeenCalled();
    });

    it('stops containing focus', () => {
        const { getByTestId, unmount } = render(
            <Trap options={{ containFocus: true }}>{THREE_BUTTONS}</Trap>,
        );
        const spy = jest.spyOn(getByTestId('first'), 'focus');
        unmount();

        const outside = document.createElement('button');
        document.body.appendChild(outside);
        outside.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

        expect(spy).not.toHaveBeenCalled();
        outside.remove();
    });

    // An observer left running keeps re-reading a container the component no
    // longer owns, and keeps the container itself alive with it.
    it('disconnects the mutation observer', () => {
        const disconnect = jest.spyOn(MutationObserver.prototype, 'disconnect');
        const before = disconnect.mock.calls.length;

        const { unmount } = render(<Trap>{THREE_BUTTONS}</Trap>);
        unmount();

        expect(disconnect.mock.calls.length).toBeGreaterThan(before);
        disconnect.mockRestore();
    });
});

/**
 * The listener registration itself, asserted on `document`.
 *
 * WHY DIRECTLY, and not through behaviour. Cleanup empties the focusable-element
 * cache as its last act, and both handlers return early on an empty cache — so a
 * listener that is never removed is INERT, and no amount of dispatching after
 * unmount can tell it from one that was. The leak is real all the same: a
 * listener held on `document` keeps the whole closure, and with it the container,
 * alive for the life of the webview.
 *
 * The capture flag is part of the identity here, not a detail. `removeEventListener`
 * only removes a listener registered with the SAME flag, so passing the wrong one
 * removes nothing at all.
 */
describe('useFocusTrap — the listeners it puts on document', () => {
    let added: jest.SpyInstance;
    let removed: jest.SpyInstance;

    beforeEach(() => {
        added = jest.spyOn(document, 'addEventListener');
        removed = jest.spyOn(document, 'removeEventListener');
    });

    afterEach(() => {
        added.mockRestore();
        removed.mockRestore();
    });

    const callsFor = (spy: jest.SpyInstance, type: string) =>
        spy.mock.calls.filter((call) => call[0] === type);

    it('registers keydown and focusin in the capture phase', () => {
        render(<Trap>{THREE_BUTTONS}</Trap>);

        expect(callsFor(added, 'keydown')).toEqual([['keydown', expect.any(Function), true]]);
        expect(callsFor(added, 'focusin')).toEqual([['focusin', expect.any(Function), true]]);
    });

    it('registers no focusin listener when containment is off', () => {
        render(<Trap options={{ containFocus: false }}>{THREE_BUTTONS}</Trap>);

        expect(callsFor(added, 'keydown')).toHaveLength(1);
        expect(callsFor(added, 'focusin')).toHaveLength(0);
    });

    it('removes both listeners on unmount, by the same reference and phase', () => {
        const { unmount } = render(<Trap>{THREE_BUTTONS}</Trap>);
        unmount();

        for (const type of ['keydown', 'focusin']) {
            const registration = callsFor(added, type)[0];
            expect(callsFor(removed, type)).toEqual([[type, registration[1], registration[2]]]);
        }
    });

    it('removes only the keydown listener when containment is off', () => {
        const { unmount } = render(<Trap options={{ containFocus: false }}>{THREE_BUTTONS}</Trap>);
        unmount();

        expect(callsFor(removed, 'keydown')).toHaveLength(1);
        expect(callsFor(removed, 'focusin')).toHaveLength(0);
    });
});
