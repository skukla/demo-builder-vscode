/**
 * Modal Component Tests
 *
 * Tests the Modal wrapper component around Spectrum Dialog.
 * Used for confirmations, dialogs, and error displays throughout the extension.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { Modal, ActionButton } from '@/core/ui/components/ui/Modal';

// Helper to render with Spectrum Provider
const renderWithProvider = (ui: React.ReactElement) => {
    return render(
        <Provider theme={defaultTheme}>
            {ui}
        </Provider>
    );
};

describe('Modal', () => {
    const defaultProps = {
        title: 'Test Modal',
        onClose: jest.fn(),
        children: <div>Modal content</div>,
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('rendering', () => {
        it('renders title', () => {
            renderWithProvider(<Modal {...defaultProps} />);

            expect(screen.getByText('Test Modal')).toBeInTheDocument();
        });

        it('renders children content', () => {
            renderWithProvider(<Modal {...defaultProps} />);

            expect(screen.getByText('Modal content')).toBeInTheDocument();
        });

        it('renders close button', () => {
            renderWithProvider(<Modal {...defaultProps} />);

            expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
        });

        it('renders with different title', () => {
            renderWithProvider(
                <Modal {...defaultProps} title="Different Title" />
            );

            expect(screen.getByText('Different Title')).toBeInTheDocument();
        });

        it('renders complex children', () => {
            renderWithProvider(
                <Modal {...defaultProps}>
                    <div>First element</div>
                    <div>Second element</div>
                    <button>Action button</button>
                </Modal>
            );

            expect(screen.getByText('First element')).toBeInTheDocument();
            expect(screen.getByText('Second element')).toBeInTheDocument();
            expect(screen.getByText('Action button')).toBeInTheDocument();
        });
    });

    describe('close button', () => {
        it('calls onClose when close button clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            const onClose = jest.fn();

            renderWithProvider(<Modal {...defaultProps} onClose={onClose} />);

            const closeButton = screen.getByRole('button', { name: /close/i });
            await user.click(closeButton);

            expect(onClose).toHaveBeenCalledTimes(1);
        });
    });

    describe('action buttons', () => {
        it('renders single action button', () => {
            const actionButtons: ActionButton[] = [
                { label: 'Confirm', variant: 'primary', onPress: jest.fn() },
            ];

            renderWithProvider(
                <Modal {...defaultProps} actionButtons={actionButtons} />
            );

            expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
        });

        it('renders multiple action buttons', () => {
            const actionButtons: ActionButton[] = [
                { label: 'Save', variant: 'primary', onPress: jest.fn() },
                { label: 'Cancel', variant: 'secondary', onPress: jest.fn() },
            ];

            renderWithProvider(
                <Modal {...defaultProps} actionButtons={actionButtons} />
            );

            expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
        });

        it('calls action button onPress when clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            const onPress = jest.fn();
            const actionButtons: ActionButton[] = [
                { label: 'Confirm', variant: 'primary', onPress },
            ];

            renderWithProvider(
                <Modal {...defaultProps} actionButtons={actionButtons} />
            );

            const confirmButton = screen.getByRole('button', { name: 'Confirm' });
            await user.click(confirmButton);

            expect(onPress).toHaveBeenCalledTimes(1);
        });

        it('handles different button variants', () => {
            const actionButtons: ActionButton[] = [
                { label: 'Primary', variant: 'primary', onPress: jest.fn() },
                { label: 'Secondary', variant: 'secondary', onPress: jest.fn() },
                { label: 'Accent', variant: 'accent', onPress: jest.fn() },
                { label: 'Negative', variant: 'negative', onPress: jest.fn() },
            ];

            renderWithProvider(
                <Modal {...defaultProps} actionButtons={actionButtons} />
            );

            expect(screen.getByRole('button', { name: 'Primary' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Secondary' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Accent' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Negative' })).toBeInTheDocument();
        });

        it('applies primary CSS class to primary variant', () => {
            const actionButtons: ActionButton[] = [
                { label: 'Primary Action', variant: 'primary', onPress: jest.fn() },
            ];

            renderWithProvider(
                <Modal {...defaultProps} actionButtons={actionButtons} />
            );

            const button = screen.getByRole('button', { name: 'Primary Action' });
            expect(button).toHaveClass('modal-button-primary');
        });

        it('applies primary CSS class to accent variant (blue styling)', () => {
            const actionButtons: ActionButton[] = [
                { label: 'Accent Action', variant: 'accent', onPress: jest.fn() },
            ];

            renderWithProvider(
                <Modal {...defaultProps} actionButtons={actionButtons} />
            );

            const button = screen.getByRole('button', { name: 'Accent Action' });
            expect(button).toHaveClass('modal-button-primary');
        });

        it('applies secondary CSS class to secondary variant', () => {
            const actionButtons: ActionButton[] = [
                { label: 'Secondary Action', variant: 'secondary', onPress: jest.fn() },
            ];

            renderWithProvider(
                <Modal {...defaultProps} actionButtons={actionButtons} />
            );

            const button = screen.getByRole('button', { name: 'Secondary Action' });
            expect(button).toHaveClass('modal-button-secondary');
        });

        it('applies secondary CSS class to negative variant', () => {
            const actionButtons: ActionButton[] = [
                { label: 'Negative Action', variant: 'negative', onPress: jest.fn() },
            ];

            renderWithProvider(
                <Modal {...defaultProps} actionButtons={actionButtons} />
            );

            const button = screen.getByRole('button', { name: 'Negative Action' });
            expect(button).toHaveClass('modal-button-secondary');
        });

        it('renders with no action buttons (empty array)', () => {
            renderWithProvider(
                <Modal {...defaultProps} actionButtons={[]} />
            );

            // Should still render the close button
            expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
        });

        it('renders with no actionButtons prop (default)', () => {
            renderWithProvider(<Modal {...defaultProps} />);

            // Only the close button should be present
            const buttons = screen.getAllByRole('button');
            expect(buttons).toHaveLength(1);
            expect(buttons[0]).toHaveTextContent('Close');
        });
    });

    describe('size prop', () => {
        it('renders with default size (M)', () => {
            renderWithProvider(<Modal {...defaultProps} />);

            // Verify modal renders (size is internal implementation)
            expect(screen.getByText('Test Modal')).toBeInTheDocument();
        });

        it('renders with small size', () => {
            renderWithProvider(<Modal {...defaultProps} size="S" />);

            expect(screen.getByText('Test Modal')).toBeInTheDocument();
        });

        it('renders with large size', () => {
            renderWithProvider(<Modal {...defaultProps} size="L" />);

            expect(screen.getByText('Test Modal')).toBeInTheDocument();
        });

        it('renders with fullscreen size (maps to L)', () => {
            renderWithProvider(<Modal {...defaultProps} size="fullscreen" />);

            expect(screen.getByText('Test Modal')).toBeInTheDocument();
        });

        it('renders with fullscreenTakeover size (maps to L)', () => {
            renderWithProvider(<Modal {...defaultProps} size="fullscreenTakeover" />);

            expect(screen.getByText('Test Modal')).toBeInTheDocument();
        });
    });

    // Content-aware height: Spectrum's modal Dialog claims a height independent of
    // its content, so a short body (the Add Integration kind/name/destination
    // stages) leaves dead space under the footer. `fitContent` releases it.
    describe('fitContent (content-aware height)', () => {
        it('is OFF by default — existing modals keep their proportions', () => {
            renderWithProvider(<Modal {...defaultProps} />);

            expect(screen.getByRole('dialog')).not.toHaveClass('modal-fit-content');
        });

        it('marks the dialog when opted in', () => {
            renderWithProvider(<Modal {...defaultProps} fitContent />);

            expect(screen.getByRole('dialog')).toHaveClass('modal-fit-content');
        });
    });
    // Spectrum's Dialog has no `fullscreen` size — Modal's own vocabulary maps
    // both of its fullscreen names down to the widest one Spectrum has.
    describe('size mapping', () => {
        it('passes a Spectrum size straight through, defaulting to M', () => {
            renderWithProvider(<Modal {...defaultProps} />);
            expect(screen.getByRole('dialog')).toHaveAttribute('data-size', 'M');
        });

        it.each(['S', 'M', 'L'] as const)('passes %s through unchanged', (size) => {
            renderWithProvider(<Modal {...defaultProps} size={size} />);
            expect(screen.getByRole('dialog')).toHaveAttribute('data-size', size);
        });

        it.each(['fullscreen', 'fullscreenTakeover'] as const)('maps %s to L', (size) => {
            renderWithProvider(<Modal {...defaultProps} size={size} />);
            expect(screen.getByRole('dialog')).toHaveAttribute('data-size', 'L');
        });
    });

    // The two opt-ins ride on UNSAFE_className, so what lands on the dialog IS
    // the behaviour — including the absence of a class when neither is asked for.
    describe('the size overrides', () => {
        it('gives the dialog no class at all when neither is opted into', () => {
            renderWithProvider(<Modal {...defaultProps} />);

            expect(screen.getByRole('dialog')).not.toHaveAttribute('class');
        });

        it('marks the dialog wide when only wide is opted into', () => {
            renderWithProvider(<Modal {...defaultProps} wide />);

            expect(screen.getByRole('dialog')).toHaveAttribute('class', 'modal-wide');
        });

        it('carries both, in order, when both are opted into', () => {
            renderWithProvider(<Modal {...defaultProps} fitContent wide />);

            expect(screen.getByRole('dialog')).toHaveAttribute(
                'class',
                'modal-fit-content modal-wide',
            );
        });
    });

    // The buttons are divs with role="button", so the keyboard behaviour a real
    // <button> gives for free has to be written — and therefore tested.
    describe('keyboard activation', () => {
        function renderWithAction(onPress: jest.Mock, isDisabled = false) {
            const actionButtons: ActionButton[] = [
                { label: 'Confirm', variant: 'primary', onPress, isDisabled },
            ];
            renderWithProvider(<Modal {...defaultProps} actionButtons={actionButtons} />);
            return screen.getByRole('button', { name: 'Confirm' });
        }

        it('activates on Enter', () => {
            const onPress = jest.fn();

            fireEvent.keyDown(renderWithAction(onPress), { key: 'Enter' });

            expect(onPress).toHaveBeenCalledTimes(1);
        });

        it('activates on Space', () => {
            const onPress = jest.fn();

            fireEvent.keyDown(renderWithAction(onPress), { key: ' ' });

            expect(onPress).toHaveBeenCalledTimes(1);
        });

        // Typing inside the modal must not fire its buttons.
        it('ignores every other key', () => {
            const onPress = jest.fn();
            const button = renderWithAction(onPress);

            fireEvent.keyDown(button, { key: 'a' });
            fireEvent.keyDown(button, { key: 'Escape' });
            fireEvent.keyDown(button, { key: 'Tab' });

            expect(onPress).not.toHaveBeenCalled();
        });

        it('does nothing on Enter when the button is disabled', () => {
            const onPress = jest.fn();

            fireEvent.keyDown(renderWithAction(onPress, true), { key: 'Enter' });

            expect(onPress).not.toHaveBeenCalled();
        });
    });

    describe('a disabled action button', () => {
        function disabledButton(onPress: jest.Mock) {
            const actionButtons: ActionButton[] = [
                { label: 'Confirm', variant: 'primary', onPress, isDisabled: true },
            ];
            renderWithProvider(<Modal {...defaultProps} actionButtons={actionButtons} />);
            return screen.getByRole('button', { name: 'Confirm' });
        }

        it('does not fire when clicked', () => {
            const onPress = jest.fn();

            fireEvent.click(disabledButton(onPress));

            expect(onPress).not.toHaveBeenCalled();
        });

        // A div with role="button" is not skipped by the browser's tab order on
        // its own — the negative tabIndex is what does it.
        it('is out of the tab order, marked disabled, and styled disabled', () => {
            const button = disabledButton(jest.fn());

            expect(button).toHaveAttribute('tabindex', '-1');
            expect(button).toHaveAttribute('aria-disabled', 'true');
            expect(button).toHaveClass('modal-button-disabled');
        });

        it('an enabled button keeps its tab stop and the disabled styling off', () => {
            const actionButtons: ActionButton[] = [
                { label: 'Confirm', variant: 'primary', onPress: jest.fn() },
            ];
            renderWithProvider(<Modal {...defaultProps} actionButtons={actionButtons} />);

            const button = screen.getByRole('button', { name: 'Confirm' });
            expect(button).toHaveAttribute('tabindex', '0');
            expect(button).not.toHaveClass('modal-button-disabled');
        });
    });

    // The handlers are memoised. A memo whose dependency list forgets the
    // handler keeps calling the one it closed over on the first render.
    describe('after a re-render with a new handler', () => {
        function renderTwice() {
            const first = jest.fn();
            const second = jest.fn();
            const withPress = (onPress: jest.Mock) => (
                <Provider theme={defaultTheme}>
                    <Modal
                        {...defaultProps}
                        actionButtons={[{ label: 'Go', variant: 'primary', onPress }]}
                    />
                </Provider>
            );
            const { rerender } = render(withPress(first));
            rerender(withPress(second));
            return { first, second, button: screen.getByRole('button', { name: 'Go' }) };
        }

        it('clicks the new handler, not the old one', () => {
            const { first, second, button } = renderTwice();

            fireEvent.click(button);

            expect(second).toHaveBeenCalledTimes(1);
            expect(first).not.toHaveBeenCalled();
        });

        it('sends Enter to the new handler, not the old one', () => {
            const { first, second, button } = renderTwice();

            fireEvent.keyDown(button, { key: 'Enter' });

            expect(second).toHaveBeenCalledTimes(1);
            expect(first).not.toHaveBeenCalled();
        });
    });
});
