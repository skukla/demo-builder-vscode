/**
 * SaveFirstWindow: the frame of "Save Your Changes First?" that every screen removing a datapack
 * shares (step-05, "One save window, two bodies"). The title, the one line, the caller's body under
 * it, and three buttons: the losing choice apart at the footer's start, Cancel and the save at its
 * end, and no other close. The real Modal over the shared Spectrum mock.
 */

import '@testing-library/jest-dom';

import { DialogContainer, Provider, defaultTheme } from '@adobe/react-spectrum';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import {
    SaveFirstWindow,
    type SaveFirstWindowProps,
} from '@/core/ui/components/feedback/SaveFirstWindow';

function renderWindow(props: Partial<SaveFirstWindowProps> = {}) {
    const onAnswer = jest.fn();
    const onClose = jest.fn();
    render(
        <Provider theme={defaultTheme}>
            <DialogContainer onDismiss={onClose}>
                <SaveFirstWindow
                    withoutSavingLabel="Delete Without Saving"
                    saveLabel="Save and Delete"
                    onAnswer={onAnswer}
                    onClose={onClose}
                    {...props}
                >
                    <p>The body</p>
                </SaveFirstWindow>
            </DialogContainer>
        </Provider>
    );
    return { onAnswer, onClose };
}

const button = (name: string): HTMLElement => screen.getByRole('button', { name });

describe('SaveFirstWindow', () => {
    it("asks the question in its title, with the one line over the caller's body", () => {
        renderWindow();

        expect(
            screen.getByRole('heading', { name: 'Save Your Changes First?' })
        ).toBeInTheDocument();
        const lead = screen.getByText("Your changes will be lost if you don't save them.");
        const body = screen.getByText('The body');
        expect(lead.closest('.clear-demo-body')).toBe(body.closest('.clear-demo-body'));
        expect(lead.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('puts the losing choice at the start, Cancel and the save at the end, and no other close', () => {
        renderWindow();

        expect(button('Delete Without Saving').closest('.modal-footer-start')).not.toBeNull();
        expect(button('Cancel').closest('.modal-footer-start')).toBeNull();
        expect(button('Save and Delete').closest('.modal-footer-start')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    });

    it('answers false without saving, true for the save, and Cancel closes', () => {
        const { onAnswer, onClose } = renderWindow();

        fireEvent.click(button('Delete Without Saving'));
        fireEvent.click(button('Save and Delete'));
        fireEvent.click(button('Cancel'));

        expect(onAnswer.mock.calls).toStrictEqual([[false], [true]]);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('holds the save while the body says it cannot, and only the save', () => {
        renderWindow({ saveDisabled: true });

        expect(button('Save and Delete')).toHaveAttribute('aria-disabled', 'true');
        expect(button('Delete Without Saving')).not.toHaveAttribute('aria-disabled', 'true');
        expect(button('Cancel')).not.toHaveAttribute('aria-disabled', 'true');
    });
});
