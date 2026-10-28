/**
 * PinToggle — the pin on a card: a button that pins or unpins, beside the card's menu
 * (owner, 2026-10-28). Pin was a row in the project card's menu, which had grown past what
 * fits in a window; on the card it also shows which projects are pinned at a glance.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@adobe/react-spectrum', () => ({
    ActionButton: ({ children, onPress, isQuiet: _isQuiet, UNSAFE_className, ...props }: any) => (
        <button onClick={onPress} className={UNSAFE_className} {...props}>
            {children}
        </button>
    ),
}));
jest.mock('@spectrum-icons/workflow/PinOn', () => ({
    __esModule: true,
    default: () => <span data-testid="icon-pin" />,
}));

// Below the mocks on purpose: they hoist above imports in THIS module only.
import { PinToggle } from '@/core/ui/components/ui/PinToggle';

describe('PinToggle', () => {
    it('offers to pin an unpinned project, and is hidden until the card is hovered or focused', () => {
        render(<PinToggle pinned={false} subject="project" onToggle={jest.fn()} />);

        const button = screen.getByRole('button', { name: 'Pin project' });
        expect(button).toHaveAttribute('aria-pressed', 'false');
        expect(button.closest('.pin-toggle')).toHaveClass('pin-toggle--unpinned');
    });

    it('offers to unpin a pinned project, and is always shown', () => {
        render(<PinToggle pinned subject="project" onToggle={jest.fn()} />);

        const button = screen.getByRole('button', { name: 'Unpin project' });
        expect(button).toHaveAttribute('aria-pressed', 'true');
        expect(button.closest('.pin-toggle')).toHaveClass('pin-toggle--pinned');
    });

    it('toggles, and never opens the card behind it', () => {
        const onToggle = jest.fn();
        const onCardClick = jest.fn();
        render(
            <div onClick={onCardClick}>
                <PinToggle pinned={false} subject="project" onToggle={onToggle} />
            </div>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Pin project' }));

        expect(onToggle).toHaveBeenCalledTimes(1);
        expect(onCardClick).not.toHaveBeenCalled();
    });

    it('is the plain pin mark when nothing can toggle it', () => {
        render(<PinToggle pinned subject="project" />);

        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Pinned')).toHaveClass('pin-indicator');
    });

    it('shows nothing for an unpinned project when nothing can toggle it', () => {
        const { container } = render(<PinToggle pinned={false} subject="project" />);

        expect(container).toBeEmptyDOMElement();
    });
});
