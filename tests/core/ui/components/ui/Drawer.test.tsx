/**
 * Drawer Tests (integrations grid — Step 3)
 *
 * The hand-rolled right-panel primitive behind the integration detail drawer
 * (NO Spectrum Tray — mobile-only + unmocked). Always mounted: a scrim div +
 * a dialog panel that `.open` slides in; closed = visibility:hidden +
 * aria-hidden. Pins:
 *   - scrim click and document Esc close (Esc SKIPPED when defaultPrevented,
 *     so stacked Spectrum dialogs own their own Esc)
 *   - focus lands on the panel's first focusable at open and RETURNS to the
 *     opener at close
 *   - minimal Tab wrap (Tab on last → first; Shift+Tab on first → last)
 *
 * Strict TDD: written BEFORE the component exists.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Drawer } from '@/core/ui/components/ui/Drawer';
import '@testing-library/jest-dom';

function renderDrawer(isOpen: boolean) {
    const onClose = jest.fn();
    const view = render(
        <>
            <button data-testid="opener">Open drawer</button>
            <Drawer isOpen={isOpen} onClose={onClose} ariaLabel="Integration details">
                <button data-testid="first">First</button>
                <button data-testid="last">Last</button>
            </Drawer>
        </>,
    );
    const rerenderDrawer = (nextOpen: boolean): void => {
        view.rerender(
            <>
                <button data-testid="opener">Open drawer</button>
                <Drawer isOpen={nextOpen} onClose={onClose} ariaLabel="Integration details">
                    <button data-testid="first">First</button>
                    <button data-testid="last">Last</button>
                </Drawer>
            </>,
        );
    };
    const panel = view.container.querySelector('.db-drawer') as HTMLElement;
    const scrim = view.container.querySelector('.db-drawer-scrim') as HTMLElement;
    return { onClose, rerenderDrawer, panel, scrim };
}

describe('Drawer', () => {
    it('stays mounted but hidden while closed (no open class, aria-hidden)', () => {
        const { panel, scrim } = renderDrawer(false);

        expect(panel).toBeInTheDocument();
        expect(panel).not.toHaveClass('open');
        expect(panel).toHaveAttribute('aria-hidden', 'true');
        expect(scrim).not.toHaveClass('open');
    });

    it('opens with the open class, dialog role, aria-modal, and aria-label', () => {
        const { panel, scrim } = renderDrawer(true);

        expect(panel).toHaveClass('open');
        expect(scrim).toHaveClass('open');
        expect(panel).toHaveAttribute('role', 'dialog');
        expect(panel).toHaveAttribute('aria-modal', 'true');
        expect(panel).toHaveAttribute('aria-label', 'Integration details');
        expect(panel).not.toHaveAttribute('aria-hidden', 'true');
    });

    it('closes on scrim click', () => {
        const { onClose, scrim } = renderDrawer(true);

        fireEvent.click(scrim);

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on document Escape while open', () => {
        const { onClose } = renderDrawer(true);

        fireEvent.keyDown(document, { key: 'Escape' });

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('ignores Escape while closed', () => {
        const { onClose } = renderDrawer(false);

        fireEvent.keyDown(document, { key: 'Escape' });

        expect(onClose).not.toHaveBeenCalled();
    });

    it('ignores an Escape that was already defaultPrevented (stacked dialogs own their Esc)', () => {
        const { onClose } = renderDrawer(true);

        // Simulate a stacked Spectrum dialog consuming Esc before it bubbles
        // to the document listener.
        const swallow = (event: KeyboardEvent): void => event.preventDefault();
        const first = screen.getByTestId('first');
        first.addEventListener('keydown', swallow);
        fireEvent.keyDown(first, { key: 'Escape' });
        first.removeEventListener('keydown', swallow);

        expect(onClose).not.toHaveBeenCalled();
    });

    it('moves focus to the first focusable inside the panel on open', () => {
        const { rerenderDrawer } = renderDrawer(false);
        screen.getByTestId('opener').focus();

        rerenderDrawer(true);

        expect(screen.getByTestId('first')).toHaveFocus();
    });

    it('returns focus to the opener on close', () => {
        const { rerenderDrawer } = renderDrawer(false);
        screen.getByTestId('opener').focus();

        rerenderDrawer(true);
        rerenderDrawer(false);

        expect(screen.getByTestId('opener')).toHaveFocus();
    });

    it('wraps Tab from the last focusable back to the first', () => {
        renderDrawer(true);
        const last = screen.getByTestId('last');
        last.focus();

        fireEvent.keyDown(last, { key: 'Tab' });

        expect(screen.getByTestId('first')).toHaveFocus();
    });

    it('wraps Shift+Tab from the first focusable to the last', () => {
        renderDrawer(true);
        const first = screen.getByTestId('first');
        first.focus();

        fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });

        expect(screen.getByTestId('last')).toHaveFocus();
    });
});
