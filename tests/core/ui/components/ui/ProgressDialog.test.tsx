/**
 * ProgressDialog: the one way a run is drawn (dialog design rules). It waits or shows its steps as
 * rows, keeps its size from start to finish, offers Close and nothing else while it runs, puts its
 * one action beside Close once it ends, and closes itself when it ended clean with nothing to read.
 * The real Modal over the shared Spectrum mock.
 */

import '@testing-library/jest-dom';

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { ProgressDialog, type ProgressDialogProps } from '@/core/ui/components/ui/ProgressDialog';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

const ROWS: NonNullable<ProgressDialogProps['rows']> = [
    { status: 'success', label: 'Check' },
    { status: 'checking', label: 'Install' },
    { status: 'pending', label: 'Verify' },
];

function draw(props: Partial<ProgressDialogProps>, onClose: () => void) {
    return (
        <Provider theme={defaultTheme}>
            <ProgressDialog isOpen title="Installing My Luma" onClose={onClose} {...props} />
        </Provider>
    );
}

function renderProgress(props: Partial<ProgressDialogProps> = {}) {
    const onClose = jest.fn();
    const view = render(draw(props, onClose));
    return { onClose, rerender: (next: Partial<ProgressDialogProps>) => view.rerender(draw(next, onClose)) };
}

function buttonNames(): string[] {
    return screen.getAllByRole('button').map((button) => button.textContent ?? '');
}

describe('ProgressDialog', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('renders nothing while closed', () => {
        renderProgress({ isOpen: false });

        expect(screen.queryByText('Installing My Luma')).toBeNull();
    });

    it('is small while it waits, and shows the wait with Close alone', () => {
        renderProgress({ waiting: { label: 'Installing My Luma' } });

        expect(screen.getByRole('dialog')).toHaveAttribute('data-size', 'S');
        expect(document.querySelector('.modal-wait')).not.toBeNull();
        expect(buttonNames()).toEqual(['Close']);
    });

    it('keeps the size it waited at for its result', () => {
        const { rerender } = renderProgress({ waiting: { label: 'Installing My Luma' } });
        rerender({ title: 'My Luma Installed', status: 'success', children: 'Open the store to see it.' });

        expect(screen.getByRole('dialog')).toHaveAttribute('data-size', 'S');
    });

    it('draws its steps as rows in a medium window', () => {
        renderProgress({ rows: ROWS });

        expect(screen.getByRole('dialog')).toHaveAttribute('data-size', 'M');
        const rows = Array.from(document.querySelectorAll('.dialog-stack > ul.work-row-list > li'));
        expect(rows).toHaveLength(3);
        ['Check', 'Install', 'Verify'].forEach((label, index) => expect(rows[index]).toHaveTextContent(label));
    });

    it('keeps the size of its rows for its result', () => {
        const { rerender } = renderProgress({ rows: ROWS });
        rerender({ rows: ROWS, title: "Couldn't Install My Luma", status: 'error' });

        expect(screen.getByRole('dialog')).toHaveAttribute('data-size', 'M');
    });

    it('offers Close alone while its rows run, and no status icon', () => {
        renderProgress({ rows: ROWS, action: { label: 'Retry', onPress: jest.fn() } });

        expect(buttonNames()).toEqual(['Close']);
        expect(document.querySelector('.modal-status-icon')).toBeNull();
    });

    it('once ended, shows its status, its lines, and its one action after Close', () => {
        const onPress = jest.fn();
        renderProgress({
            rows: ROWS,
            title: "Couldn't Install My Luma",
            status: 'error',
            children: ['Verify failed.', 'Open the log to see why.'],
            action: { label: 'Retry', onPress },
        });

        expect(document.querySelector('.modal-status-icon')).not.toBeNull();
        const lines = Array.from(document.querySelectorAll('.dialog-stack > .dialog-rows > .dialog-line'));
        expect(lines.map((line) => line.textContent)).toEqual(['Verify failed.', 'Open the log to see why.']);
        expect(buttonNames()).toEqual(['Close', 'Retry']);
        expect(screen.getByRole('dialog')).toHaveAttribute('data-size', 'M');
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('closes itself a glance after it ended clean with nothing to read', () => {
        const { onClose } = renderProgress({ rows: ROWS, title: 'My Luma Installed', status: 'success' });

        act(() => {
            jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE);
        });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it.each<[string, Partial<ProgressDialogProps>]>([
        ['while it runs', { rows: ROWS }],
        ['while it still waits', { waiting: { label: 'Installing' }, status: 'success' }],
        ['with a line to read', { status: 'success', children: 'Open the store to see it.' }],
        ['with an action', { status: 'success', action: { label: 'Open', onPress: jest.fn() } }],
        ['after a failure', { status: 'error' }],
    ])('CONTROL: stays open %s', (_name, props) => {
        const { onClose } = renderProgress(props);

        act(() => {
            jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE * 3);
        });
        expect(onClose).not.toHaveBeenCalled();
    });
});
