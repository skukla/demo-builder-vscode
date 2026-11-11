/**
 * ResultDialog: the one way a result is drawn (dialog design rules). Small, its title says what
 * happened, each child is a line to read, Close beside at most one action, and a clean result that
 * is its title alone closes itself after a glance. The real Modal over the shared Spectrum mock.
 */

import '@testing-library/jest-dom';

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { ResultDialog, type ResultDialogProps } from '@/core/ui/components/ui/ResultDialog';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

function renderResult(props: Partial<ResultDialogProps> = {}) {
    const onClose = jest.fn();
    render(
        <Provider theme={defaultTheme}>
            <ResultDialog isOpen title="My Luma Installed" status="success" onClose={onClose} {...props} />
        </Provider>,
    );
    return { onClose };
}

function buttonNames(): string[] {
    return screen.getAllByRole('button').map((button) => button.textContent ?? '');
}

describe('ResultDialog', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('renders nothing while closed', () => {
        renderResult({ isOpen: false });

        expect(screen.queryByText('My Luma Installed')).toBeNull();
    });

    it('is small, with the status icon before the title', () => {
        renderResult();

        expect(screen.getByRole('dialog')).toHaveAttribute('data-size', 'S');
        expect(screen.getByRole('dialog')).toHaveClass('modal-fit-content');
        expect(document.querySelector('.modal-status-icon')).not.toBeNull();
    });

    it('puts each child on a line of its own', () => {
        renderResult({ children: ['3 products were skipped.', 'Open the log to see why.'] });

        const lines = Array.from(document.querySelectorAll('.dialog-rows > .dialog-line'));
        expect(lines.map((line) => line.textContent)).toEqual([
            '3 products were skipped.',
            'Open the log to see why.',
        ]);
    });

    it('offers Close alone, and Close closes', () => {
        const { onClose } = renderResult({ status: 'error', title: "Couldn't Install My Luma" });

        expect(buttonNames()).toEqual(['Close']);
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('puts its one action after Close, red only when dangerous', () => {
        const onPress = jest.fn();
        renderResult({ status: 'error', action: { label: 'Retry', onPress } });

        expect(buttonNames()).toEqual(['Close', 'Retry']);
        const retry = screen.getByRole('button', { name: 'Retry' });
        expect(retry).toHaveClass('modal-button-primary');
        fireEvent.click(retry);
        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('draws a dangerous action solid red', () => {
        renderResult({ status: 'error', action: { label: 'Remove', onPress: jest.fn(), variant: 'negative' } });

        expect(screen.getByRole('button', { name: 'Remove' })).toHaveClass('modal-button-negative');
    });

    it('closes itself a glance after a clean result that is its title alone', () => {
        const { onClose } = renderResult();

        jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it.each<[string, Partial<ResultDialogProps>]>([
        ['a line to read', { children: 'Open the store to see it.' }],
        ['an action', { action: { label: 'Open', onPress: jest.fn() } }],
        ['a failure', { status: 'error' }],
        ['a warning', { status: 'warning' }],
    ])('CONTROL: stays open with %s', (_name, props) => {
        const { onClose } = renderResult(props);

        jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE * 3);
        expect(onClose).not.toHaveBeenCalled();
    });
});
