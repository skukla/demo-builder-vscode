/**
 * Modal `sizeLabels`: a footer button whose label changes while the dialog is open holds the
 * width of its widest label from the start, so the buttons beside it never move (owner,
 * 2026-11-04: ticking a row in Updates moved Close).
 */

import React from 'react';
import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Modal, renderWithProvider } from './Modal.testUtils';

describe('Modal sizeLabels', () => {
    it('draws every label hidden in the button, and names it by the shown label only', () => {
        renderWithProvider(
            <Modal
                title="Updates"
                onClose={jest.fn()}
                actionButtons={[
                    {
                        label: 'Apply Updates',
                        variant: 'accent',
                        onPress: jest.fn(),
                        sizeLabels: ['Apply 1 Update', 'Apply 12 Updates'],
                    },
                ]}
            >
                <div>Body</div>
            </Modal>,
        );

        const button = screen.getByRole('button', { name: 'Apply Updates' });
        const sizers = Array.from(button.querySelectorAll('.modal-button-sizer'));
        expect(sizers.map((n) => n.textContent)).toEqual(['Apply 1 Update', 'Apply 12 Updates']);
        sizers.forEach((n) => expect(n).toHaveAttribute('aria-hidden', 'true'));
    });

    it('draws a plain label when there are none', () => {
        renderWithProvider(
            <Modal title="Guide" onClose={jest.fn()} actionButtons={[{ label: 'Done', variant: 'accent', onPress: jest.fn() }]}>
                <div>Body</div>
            </Modal>,
        );

        expect(screen.getByRole('button', { name: 'Done' }).querySelector('.modal-button-sizer')).toBeNull();
    });
});
