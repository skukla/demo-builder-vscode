/**
 * Modal `startButtons`: buttons for what acts on a list in the body as a whole, held at the
 * footer's start, apart from the dialog's own answers. The setup guide's Check All Steps lives
 * there because in the body a long step list clipped it (owner, 2026-11-03).
 */

import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { Modal, type ActionButton, renderWithProvider } from './Modal.testUtils';

function renderModal(props: Partial<React.ComponentProps<typeof Modal>> = {}): void {
    renderWithProvider(
        <Modal title="Guide" onClose={jest.fn()} {...props}>
            <div>Body</div>
        </Modal>,
    );
}

describe('Modal startButtons', () => {
    it('puts them in the footer, in their own group before the close button', () => {
        const start: ActionButton[] = [{ label: 'Check All Steps', variant: 'secondary', onPress: jest.fn() }];
        renderModal({ startButtons: start, actionButtons: [{ label: 'Done', variant: 'accent', onPress: jest.fn() }] });

        const button = screen.getByRole('button', { name: 'Check All Steps' });
        const group = button.closest('.modal-footer-start');
        expect(group).not.toBeNull();
        expect(group?.parentElement).toHaveClass('modal-footer-actions');
        expect(group).not.toContainElement(screen.getByRole('button', { name: 'Close' }));
        expect(group).not.toContainElement(screen.getByRole('button', { name: 'Done' }));
    });

    it('presses, disables and shows pending as the footer buttons do', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        const onPress = jest.fn();
        renderModal({
            startButtons: [
                { label: 'Check All Steps', variant: 'secondary', onPress },
                { label: 'Apply All', variant: 'secondary', onPress: jest.fn(), isDisabled: true },
                { label: 'Waiting One', variant: 'secondary', onPress: jest.fn(), isPending: true },
            ],
        });

        await user.click(screen.getByRole('button', { name: 'Check All Steps' }));

        expect(onPress).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: 'Apply All' })).toHaveAttribute('aria-disabled', 'true');
        expect(screen.getByRole('button', { name: 'Waiting One' })).toHaveAttribute('aria-busy', 'true');
    });

    it('draws no group when there are none', () => {
        renderModal();

        expect(document.querySelector('.modal-footer-start')).toBeNull();
    });

    it('hides them while the dialog is waiting, as it hides the action buttons', () => {
        renderModal({
            startButtons: [{ label: 'Check All Steps', variant: 'secondary', onPress: jest.fn() }],
            waiting: {},
        });

        expect(screen.queryByRole('button', { name: 'Check All Steps' })).not.toBeInTheDocument();
    });
});
