/**
 * DialogOutcome: a state deep in a dialog's body reports to the dialog's title and footer, and
 * draws only the words left to read. A real component in a real render: the only double is the
 * callback the dialog would hand in.
 */

import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';
import React from 'react';
import { DialogOutcomeBody, DialogWaitBody, type DialogOutcome } from '@/core/ui/components/ui/DialogOutcome';

const OUTCOME: DialogOutcome = {
    title: 'Project setup failed',
    status: 'error',
    lines: ['Adobe did not answer.'],
    actions: [{ label: 'Retry', onPress: jest.fn() }],
};

describe('DialogOutcomeBody', () => {
    it('reports its title, status, lines and actions, and draws only the lines', () => {
        const onOutcome = jest.fn();
        render(<DialogOutcomeBody outcome={OUTCOME} onOutcome={onOutcome} />);

        expect(onOutcome).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Project setup failed',
            status: 'error',
            lines: ['Adobe did not answer.'],
            actions: [{ label: 'Retry', onPress: expect.any(Function) }],
        }));
        expect(screen.getByText('Adobe did not answer.')).toHaveClass('dialog-line');
        expect(screen.queryByText('Project setup failed')).toBeNull();
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('clears the report when the state passes', () => {
        const onOutcome = jest.fn();
        const { unmount } = render(<DialogOutcomeBody outcome={OUTCOME} onOutcome={onOutcome} />);
        unmount();

        expect(onOutcome).toHaveBeenLastCalledWith(null);
    });

    it('does not report again for a parent render with the same words, and presses the latest action', () => {
        const onOutcome = jest.fn();
        const first = jest.fn();
        const latest = jest.fn();
        const withAction = (onPress: () => void): DialogOutcome => ({ ...OUTCOME, actions: [{ label: 'Retry', onPress }] });
        const { rerender } = render(<DialogOutcomeBody outcome={withAction(first)} onOutcome={onOutcome} />);
        rerender(<DialogOutcomeBody outcome={withAction(latest)} onOutcome={onOutcome} />);

        expect(onOutcome).toHaveBeenCalledTimes(1);
        onOutcome.mock.calls[0][0].actions[0].onPress();
        expect(latest).toHaveBeenCalledTimes(1);
        expect(first).not.toHaveBeenCalled();
    });

    it('reports again when the words change', () => {
        const onOutcome = jest.fn();
        const { rerender } = render(<DialogOutcomeBody outcome={OUTCOME} onOutcome={onOutcome} />);
        rerender(<DialogOutcomeBody outcome={{ ...OUTCOME, lines: ['Still no answer.'] }} onOutcome={onOutcome} />);

        expect(onOutcome).toHaveBeenLastCalledWith(expect.objectContaining({ lines: ['Still no answer.'] }));
    });

    it('draws nothing when there is nothing left to read', () => {
        const { container } = render(<DialogOutcomeBody outcome={{ ...OUTCOME, lines: [] }} onOutcome={jest.fn()} />);

        expect(container).toBeEmptyDOMElement();
    });
});

describe('DialogWaitBody', () => {
    it('tells the dialog the wait is on and when it ends, and says what it is waiting for', () => {
        const onWaiting = jest.fn();
        const { unmount } = render(
            <DialogWaitBody lines={{ label: 'Loading workspaces', detail: 'Demo Project' }} onWaiting={onWaiting} />,
        );

        expect(onWaiting).toHaveBeenLastCalledWith(true);
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        expect(document.querySelector('.modal-wait')).toHaveTextContent('Loading workspaces');
        expect(document.querySelector('.modal-wait')).toHaveTextContent('Demo Project');

        unmount();
        expect(onWaiting).toHaveBeenLastCalledWith(false);
    });
});
