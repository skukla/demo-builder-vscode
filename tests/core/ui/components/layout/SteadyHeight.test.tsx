/**
 * SteadyHeight — a modal that walks through states must not jump between them
 * (owner, 2026-09-20).
 *
 * jsdom lays nothing out, so `scrollHeight` is 0 for everything unless it is told
 * otherwise. Each test therefore says what the content measures, the same way the
 * browser would, and asserts the FLOOR the box holds — which is the thing the SC
 * sees.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { SteadyHeight } from '@/core/ui/components/layout/SteadyHeight';

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

it('reserves what the first state needed', () => {
    measuringAt(400);

    render(
        <SteadyHeight>
            <div data-testid="content">the form</div>
        </SteadyHeight>,
    );

    expect(reservedBox()).toHaveStyle({ minHeight: '400px' });
});

it('keeps that height when a shorter state replaces it', () => {
    const measure = measuringAt(400);
    const { rerender } = render(
        <SteadyHeight>
            <div data-testid="content">the form</div>
        </SteadyHeight>,
    );

    // The spinner: a fraction of the form's height, and the jump the SC saw.
    measure(120);
    rerender(
        <SteadyHeight>
            <div data-testid="content">checking…</div>
        </SteadyHeight>,
    );

    expect(reservedBox()).toHaveStyle({ minHeight: '400px' });
});

it('grows for a state taller than anything before it', () => {
    const measure = measuringAt(400);
    const { rerender } = render(
        <SteadyHeight>
            <div data-testid="content">the form</div>
        </SteadyHeight>,
    );

    measure(560);
    rerender(
        <SteadyHeight>
            <div data-testid="content">a long confirmation</div>
        </SteadyHeight>,
    );

    expect(reservedBox()).toHaveStyle({ minHeight: '560px' });
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
