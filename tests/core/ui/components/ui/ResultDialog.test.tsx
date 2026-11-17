/**
 * ResultDialog: the one way a result is drawn (dialog design rules). Small, its title names the
 * thing, the body draws the outcome the wizard's way (a large mark, the outcome in bold, the lines
 * under it; owner, 2026-11-17, walk F222), Close beside at most one action, and a clean result waits
 * for Close like any other (walk F195). The real Modal over the shared Spectrum mock.
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
            <ResultDialog isOpen title="My Luma" outcome="Installed" status="success" onClose={onClose} {...props} />
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

        expect(screen.queryByText('My Luma')).toBeNull();
    });

    it('is small, its title naming the thing with no status icon', () => {
        renderResult();

        expect(screen.getByRole('dialog')).toHaveAttribute('data-size', 'S');
        expect(screen.getByRole('dialog')).toHaveClass('modal-fit-content');
        expect(screen.getByRole('heading')).toHaveTextContent(/^My Luma$/u);
        expect(document.querySelector('.modal-status-icon')).toBeNull();
    });

    it('draws the outcome in the body under a large mark', () => {
        renderResult();

        expect(document.querySelector('.result-mark')).toHaveAttribute('data-status', 'success');
        expect(screen.getByText('Installed')).toHaveClass('result-outcome');
    });

    it('puts each child on a line of its own', () => {
        renderResult({ children: ['3 products were skipped.', 'Open the log to see why.'] });

        const lines = Array.from(document.querySelectorAll('.result-detail .dialog-line'));
        expect(lines.map((line) => line.textContent)).toEqual([
            '3 products were skipped.',
            'Open the log to see why.',
        ]);
    });

    it('offers Close alone, and Close closes', () => {
        const { onClose } = renderResult({ status: 'error', outcome: "Couldn't Install" });

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

    // Walk F195 (owner, 2026-11-17): every result waits for Close.
    it('waits for Close after a clean result that is its title alone', () => {
        const { onClose } = renderResult();

        jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE * 3);
        expect(onClose).not.toHaveBeenCalled();
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

    describe('a result with an action per line (layout variant 6)', () => {
        it('draws a row per line with its own action under it', () => {
            renderResult({
                status: 'warning',
                title: 'Luma',
                outcome: 'Partly Loaded',
                rows: [
                    { label: 'Customers', status: 'warning', note: 'Too large to send.' },
                    { label: 'Luma, main', status: 'success', action: <button type="button">Delete Datapack</button> },
                ],
            });

            const rows = Array.from(document.querySelectorAll('.dialog-row-action'));
            expect(rows.map((row) => row.querySelector('.work-row') !== null)).toEqual([true, true]);
            expect(rows[0]).toHaveTextContent('Too large to send.');
            expect(rows[1].querySelector('button')).toHaveTextContent('Delete Datapack');
            expect(buttonNames()).toEqual(['Delete Datapack', 'Close']);
        });

        it('stays open when it is a clean result with a line to act on', () => {
            const { onClose } = renderResult({ rows: [{ label: 'Luma, main', status: 'success', action: <span>Delete</span> }] });

            jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE * 3);
            expect(onClose).not.toHaveBeenCalled();
        });
    });
});
