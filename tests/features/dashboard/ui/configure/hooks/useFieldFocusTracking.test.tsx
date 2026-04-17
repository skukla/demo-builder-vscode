/**
 * Focus Trap + Spectrum Picker Scroll Regression Test
 *
 * Regression: useFocusTrap with containFocus=true pulls focus back to the first
 * focusable element when focus moves outside the container. Spectrum Picker menus
 * render in portals (body-level), so clicking a Picker option triggers the trap.
 * The trap refocuses the first element (project name field at top), and the browser
 * scrolls to show it — observed as "column jumps to top" on website selection.
 *
 * Fix: useFocusTrap whitelists overlay content (role="listbox", role="menu", etc.)
 * so focus on Spectrum portal elements is not pulled back.
 *
 * @jest-environment jsdom
 */

import { render } from '@testing-library/react';
import React from 'react';
import { useFocusTrap } from '@/core/ui/hooks/useFocusTrap';

// Test component that uses useFocusTrap and assigns the ref to a real DOM container
function FocusTrapContainer() {
    const containerRef = useFocusTrap<HTMLDivElement>({
        enabled: true,
        autoFocus: false,
        containFocus: true,
    });

    return (
        <div ref={containerRef} data-testid="trap-container">
            <input type="text" data-testid="first-input" />
            <input type="text" data-testid="second-input" />
        </div>
    );
}

describe('useFocusTrap — Spectrum overlay allowlist', () => {
    let firstInputFocusSpy: jest.SpyInstance;

    beforeEach(() => {
        // Clean up any stray portal elements from prior tests
        document.querySelectorAll('[data-test-portal]').forEach(el => el.remove());
    });

    afterEach(() => {
        firstInputFocusSpy?.mockRestore();
    });

    it('does NOT pull focus back when focus moves to a Spectrum overlay (role="listbox")', () => {
        const { getByTestId } = render(<FocusTrapContainer />);

        // Spy on the first input's focus AFTER render (so we're spying on the real DOM node)
        const firstInput = getByTestId('first-input') as HTMLInputElement;
        firstInputFocusSpy = jest.spyOn(firstInput, 'focus');

        // Simulate a Spectrum Picker portal — a body-level listbox OUTSIDE the container
        const portalListbox = document.createElement('div');
        portalListbox.setAttribute('role', 'listbox');
        portalListbox.setAttribute('data-test-portal', 'true');

        const portalOption = document.createElement('div');
        portalOption.setAttribute('role', 'option');
        portalOption.setAttribute('tabindex', '0');

        portalListbox.appendChild(portalOption);
        document.body.appendChild(portalListbox);

        // Simulate focus moving to the portal option (user clicked a Picker menu item)
        portalOption.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

        // Bug: focus trap detects focus outside container → calls firstInput.focus() → scroll-to-top
        // Fix: focus trap whitelists overlay roles → focus stays on portal option
        expect(firstInputFocusSpy).not.toHaveBeenCalled();
    });

    it('still pulls focus back for truly external elements (not in an overlay)', () => {
        const { getByTestId } = render(<FocusTrapContainer />);

        const firstInput = getByTestId('first-input') as HTMLInputElement;
        firstInputFocusSpy = jest.spyOn(firstInput, 'focus');

        // An external button with no overlay role — focus SHOULD be pulled back
        const externalButton = document.createElement('button');
        externalButton.setAttribute('data-test-portal', 'true');
        document.body.appendChild(externalButton);

        externalButton.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

        // Focus trap should pull focus back to first element inside the container
        expect(firstInputFocusSpy).toHaveBeenCalled();
    });
});
