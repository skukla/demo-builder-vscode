/**
 * SteadyHeight: a floor the caller can name, and where short content sits under it. It does not
 * ease: a dialog's size no longer animates (owner, 2026-11-02).
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { SteadyHeight } from '@/core/ui/components/layout/SteadyHeight';

/** The box holding the floor: the parent of the element carrying the class. */
function reservedBox(): HTMLElement {
    const content = screen.getByTestId('content').parentElement;
    if (!content?.parentElement) throw new Error('SteadyHeight rendered no outer box');
    return content.parentElement;
}

it('starts from a floor the caller names', () => {
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

it('never takes a height of its own: a dialog\'s size does not animate', () => {
    const { rerender } = render(
        <SteadyHeight>
            <div data-testid="content">the form</div>
        </SteadyHeight>,
    );

    rerender(
        <SteadyHeight>
            <div data-testid="content">the next state</div>
        </SteadyHeight>,
    );

    expect(reservedBox().style.height).toBe('');
});
