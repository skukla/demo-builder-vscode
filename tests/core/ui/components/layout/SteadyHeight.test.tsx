/**
 * SteadyHeight — a modal that walks through states must not jump between them
 * (owner, 2026-09-20), and must not leave a short state in dead space either: the box
 * fits its content and eases each change, growing or shrinking (dialog design rules,
 * owner 2026-10-31).
 *
 * jsdom lays nothing out, so `scrollHeight` is 0 for everything unless it is told
 * otherwise. Each test therefore says what the content measures, the same way the
 * browser would, and asserts the height the box takes while it eases.
 */

import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { SteadyHeight } from '@/core/ui/components/layout/SteadyHeight';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';

/**
 * Make every element report `height` for `scrollHeight`, as a laid-out browser
 * would. Returns a setter so a test can change what the content measures next.
 */
function measuringAt(height: number): (next: number) => void {
    let current = height;
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
        configurable: true,
        get() {
            return current;
        },
    });
    return (next: number) => {
        current = next;
    };
}

/** The box holding the floor: the parent of the element carrying the class. */
function reservedBox(): HTMLElement {
    const content = screen.getByTestId('content').parentElement;
    if (!content?.parentElement) throw new Error('SteadyHeight rendered no outer box');
    return content.parentElement;
}

afterEach(() => {
    // @ts-expect-error — putting jsdom's own (absent) implementation back.
    delete HTMLElement.prototype.scrollHeight;
});

it('starts from a floor the caller names', () => {
    measuringAt(0);

    render(
        <SteadyHeight minHeight={240}>
            <div data-testid="content">nothing measured yet</div>
        </SteadyHeight>,
    );

    expect(reservedBox()).toHaveStyle({ minHeight: '240px' });
});

// It takes no className, deliberately: a `className={className}` pass-through is a
// class the cross-bundle check cannot read, counted once per bundle. The caller's own
// element goes inside instead, and its layout still applies to its own children.
it('leaves the caller element, and its class, untouched inside', () => {
    measuringAt(300);

    render(
        <SteadyHeight>
            <div className="datapack-import-body">
                <span data-testid="content">the form</span>
            </div>
        </SteadyHeight>,
    );

    expect(screen.getByTestId('content').parentElement).toHaveClass('datapack-import-body');
});

// Content shorter than a named floor: centred by default (a spinner), from the top when
// asked (a form reads from the top).
it('centres content shorter than its floor by default, and pins it to the top when asked', () => {
    measuringAt(100);
    const { unmount } = render(
        <SteadyHeight minHeight={240}>
            <div data-testid="content">a spinner</div>
        </SteadyHeight>,
    );
    expect(reservedBox()).toHaveStyle({ justifyContent: 'center' });
    unmount();

    render(
        <SteadyHeight minHeight={240} align="start">
            <div data-testid="content">a form</div>
        </SteadyHeight>,
    );
    expect(reservedBox()).not.toHaveStyle({ justifyContent: 'center' });
});

/**
 * Each change eases instead of snapping, taller or shorter (owner, 2026-10-31). The box takes a
 * real height for the change only: the old one, then the new one a frame later (the stylesheet
 * eases between them), then its content's own height again so nothing can be cut off.
 */
describe('easing between states', () => {
    function changed(from: number, to: number) {
        const measure = measuringAt(from);
        const { rerender } = render(
            <SteadyHeight>
                <div data-testid="content">the form</div>
            </SteadyHeight>,
        );
        measure(to);
        rerender(
            <SteadyHeight>
                <div data-testid="content">the next state</div>
            </SteadyHeight>,
        );
    }

    it.each([
        ['a taller state', 400, 560],
        ['a shorter state', 400, 120],
    ])('eases into %s: the old height, then the new one on the next frame', (_label, from, to) => {
        changed(from, to);
        expect(reservedBox()).toHaveClass('steady-height', 'is-growing');
        expect(reservedBox()).toHaveStyle({ height: `${from}px` });

        act(() => { jest.advanceTimersToNextFrame(); });
        expect(reservedBox()).toHaveStyle({ height: `${to}px` });
    });

    // It used to hold the tallest height for good, which left a one-line result in a
    // form-sized box.
    it('lets go of the height once the change is over, so the box fits the content', () => {
        changed(400, 120);
        act(() => { jest.advanceTimersToNextFrame(); });
        act(() => { jest.advanceTimersByTime(FRONTEND_TIMEOUTS.GROWTH_SETTLE); });

        expect(reservedBox()).not.toHaveClass('is-growing');
        expect(reservedBox().style.height).toBe('');
        expect(reservedBox().style.minHeight).toBe('');
    });

    it('does not animate the first measure, which has nothing to ease from', () => {
        measuringAt(400);
        render(
            <SteadyHeight>
                <div data-testid="content">the form</div>
            </SteadyHeight>,
        );
        expect(reservedBox()).not.toHaveClass('is-growing');
    });

    it('does not animate a re-render whose content kept its height — control', () => {
        const measure = measuringAt(400);
        const { rerender } = render(
            <SteadyHeight>
                <div data-testid="content">the form</div>
            </SteadyHeight>,
        );
        measure(400);
        rerender(
            <SteadyHeight>
                <div data-testid="content">the form, ticked</div>
            </SteadyHeight>,
        );
        expect(reservedBox()).not.toHaveClass('is-growing');
    });
});
