/**
 * ConfirmActionDialog — the one way a dashboard confirm is drawn (dialog design rules): the
 * question as the title with the amber icon, a few short lines, Cancel and the action, solid red only
 * when the caller says the action is dangerous. The real Modal over the shared Spectrum mock.
 */

import '@testing-library/jest-dom';

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { ConfirmActionDialog, type ConfirmActionDialogProps } from '@/core/ui/components/ui/ConfirmActionDialog';

function renderConfirm(props: Partial<ConfirmActionDialogProps> = {}) {
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    render(
        <Provider theme={defaultTheme}>
            <ConfirmActionDialog
                isOpen
                title="Remove the thing?"
                actionLabel="Remove"
                actionVariant="negative"
                onConfirm={onConfirm}
                onClose={onClose}
                {...props}
            >
                Removes the thing.
            </ConfirmActionDialog>
        </Provider>,
    );
    return { onConfirm, onClose };
}

describe('ConfirmActionDialog', () => {
    it('renders nothing while closed', () => {
        renderConfirm({ isOpen: false });

        expect(screen.queryByText('Remove the thing?')).toBeNull();
    });

    it('asks in the title, with the amber icon before it and the sentence under it', () => {
        renderConfirm();

        expect(screen.getByText('Remove the thing?')).toBeInTheDocument();
        expect(document.querySelector('.modal-status-icon .text-notice')).not.toBeNull();
        expect(screen.getByText('Removes the thing.')).toBeInTheDocument();
    });

    it('puts each child on a line of its own, with the rules\' spacing and no list', () => {
        render(
            <Provider theme={defaultTheme}>
                <ConfirmActionDialog
                    isOpen
                    title="Remove the thing?"
                    actionLabel="Remove"
                    actionVariant="negative"
                    onConfirm={jest.fn()}
                    onClose={jest.fn()}
                >
                    <>Removes <strong>the thing</strong> from Adobe.</>
                    {['Deletes its records.', 'Clears its tags.']}
                    {null}
                </ConfirmActionDialog>
            </Provider>,
        );

        const lines = Array.from(document.querySelectorAll('.dialog-rows > .dialog-line'));
        expect(lines.map((line) => line.textContent)).toEqual([
            'Removes the thing from Adobe.',
            'Deletes its records.',
            'Clears its tags.',
        ]);
        expect(document.querySelector('li')).toBeNull();
    });

    it('offers Cancel, not Close, and Cancel only closes', () => {
        const { onConfirm, onClose } = renderConfirm();

        expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('draws a dangerous action solid red', () => {
        const { onConfirm } = renderConfirm();
        const action = screen.getByRole('button', { name: 'Remove' });

        expect(action).toHaveClass('modal-button-negative');
        fireEvent.click(action);
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('CONTROL: draws an action that is not dangerous as the main action, not red', () => {
        renderConfirm({ actionLabel: 'Add', actionVariant: 'accent' });
        const action = screen.getByRole('button', { name: 'Add' });

        expect(action).toHaveClass('modal-button-primary');
        expect(action).not.toHaveClass('modal-button-negative');
    });
});
