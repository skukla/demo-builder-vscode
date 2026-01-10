/**
 * Modal Component Tests
 *
 * Tests the Modal wrapper component around Spectrum Dialog.
 * Used for confirmations, dialogs, and error displays throughout the extension.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
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
});
