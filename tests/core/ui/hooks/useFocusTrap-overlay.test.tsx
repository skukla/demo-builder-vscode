/**
 * useFocusTrap — Spectrum Overlay Allowlist Regression Test
 *
 * Regression: useFocusTrap with containFocus=true pulled focus back to the first
 * focusable element when focus moved to a Spectrum Picker menu (rendered in a
 * body-level portal). This caused the Configure screen to scroll to the top
 * when the user changed a Picker selection.
 *
 * Fix: useFocusTrap whitelists overlay content (role="listbox", role="menu", etc.)
 * so focus on Spectrum portal elements is not pulled back.
 *
 * @jest-environment jsdom
 */

import { render } from '@testing-library/react';
import React from 'react';
import { useFocusTrap } from '@/core/ui/hooks/useFocusTrap';

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
        document.querySelectorAll('[data-test-portal]').forEach(el => el.remove());
    });

    afterEach(() => {
        firstInputFocusSpy?.mockRestore();
    });

    it('does NOT pull focus back when focus moves to a Spectrum overlay (role="listbox")', () => {
        const { getByTestId } = render(<FocusTrapContainer />);
        const firstInput = getByTestId('first-input') as HTMLInputElement;
        firstInputFocusSpy = jest.spyOn(firstInput, 'focus');

        const portalListbox = document.createElement('div');
        portalListbox.setAttribute('role', 'listbox');
        portalListbox.setAttribute('data-test-portal', 'true');
        const portalOption = document.createElement('div');
        portalOption.setAttribute('role', 'option');
        portalOption.setAttribute('tabindex', '0');
        portalListbox.appendChild(portalOption);
        document.body.appendChild(portalListbox);

        portalOption.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

        expect(firstInputFocusSpy).not.toHaveBeenCalled();
    });

    it('still pulls focus back for external elements not in an overlay', () => {
        const { getByTestId } = render(<FocusTrapContainer />);
        const firstInput = getByTestId('first-input') as HTMLInputElement;
        firstInputFocusSpy = jest.spyOn(firstInput, 'focus');

        const externalButton = document.createElement('button');
        externalButton.setAttribute('data-test-portal', 'true');
        document.body.appendChild(externalButton);

        externalButton.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

        expect(firstInputFocusSpy).toHaveBeenCalled();
    });
});
