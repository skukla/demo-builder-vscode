/**
 * FormDialog: the one way a form is drawn (dialog design rules). Medium, the lead then the fields,
 * Cancel before the button that commits, the button that loses the SC's changes in outline at the
 * start, the commit solid red only when dangerous. The real Modal over the shared Spectrum mock.
 */

import '@testing-library/jest-dom';

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { FormDialog, type FormDialogProps } from '@/core/ui/components/ui/FormDialog';

function renderForm(props: Partial<FormDialogProps> = {}) {
    const onSubmit = jest.fn();
    const onClose = jest.fn();
    render(
        <Provider theme={defaultTheme}>
            <FormDialog
                isOpen
                title="Install My Luma"
                lead="Puts the sample data into your store."
                submitLabel="Install"
                onSubmit={onSubmit}
                onClose={onClose}
                {...props}
            >
                <input aria-label="Name" />
            </FormDialog>
        </Provider>,
    );
    return { onSubmit, onClose };
}

function buttonNames(): string[] {
    return screen.getAllByRole('button').map((button) => button.textContent ?? '');
}

describe('FormDialog', () => {
    it('renders nothing while closed', () => {
        renderForm({ isOpen: false });

        expect(screen.queryByText('Install My Luma')).toBeNull();
    });

    it('is medium, the lead then the fields in one stack', () => {
        renderForm();

        expect(screen.getByRole('dialog')).toHaveAttribute('data-size', 'M');
        const stack = document.querySelector('.dialog-stack');
        expect(stack?.firstElementChild).toHaveClass('lead-text');
        expect(stack?.firstElementChild).toHaveTextContent('Puts the sample data into your store.');
        expect(stack?.lastElementChild).toBe(screen.getByRole('textbox', { name: 'Name' }));
    });

    it('CONTROL: draws no lead when given none', () => {
        renderForm({ lead: undefined });

        expect(document.querySelector('.lead-text')).toBeNull();
    });

    it('offers Cancel then the commit, and Cancel only closes', () => {
        const { onSubmit, onClose } = renderForm();

        expect(buttonNames()).toEqual(['Cancel', 'Install']);
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('commits through the main action', () => {
        const { onSubmit } = renderForm();
        const install = screen.getByRole('button', { name: 'Install' });

        expect(install).toHaveClass('modal-button-primary');
        fireEvent.click(install);
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('draws a dangerous commit solid red', () => {
        renderForm({ submitLabel: 'Replace', submitVariant: 'negative' });

        expect(screen.getByRole('button', { name: 'Replace' })).toHaveClass('modal-button-negative');
    });

    it('puts the button that loses changes first, in outline', () => {
        const onPress = jest.fn();
        renderForm({ discard: { label: 'Discard Changes', onPress } });

        expect(buttonNames()).toEqual(['Discard Changes', 'Cancel', 'Install']);
        const discard = screen.getByRole('button', { name: 'Discard Changes' });
        expect(discard).toHaveClass('modal-button-secondary');
        expect(discard.closest('.modal-footer-start')).not.toBeNull();
        fireEvent.click(discard);
        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('holds the commit while it cannot run', () => {
        renderForm({ submitDisabled: true });

        expect(screen.getByRole('button', { name: 'Install' })).toHaveClass('modal-button-disabled');
    });

    it('shows a wait in place of the fields and the buttons', () => {
        renderForm({ waiting: { label: 'Reading the store' } });

        expect(document.querySelector('.modal-wait')).not.toBeNull();
        expect(screen.queryByRole('textbox')).toBeNull();
        expect(buttonNames()).toEqual(['Cancel']);
    });
});
