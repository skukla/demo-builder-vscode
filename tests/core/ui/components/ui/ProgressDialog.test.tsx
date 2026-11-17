/**
 * ProgressDialog: the one way a run is drawn (dialog design rules). It waits or shows its steps as
 * rows, keeps its size from start to finish, offers Close and nothing else while it runs, puts its
 * one action beside Close once it ends, and waits for Close however it ended (walk F195). Its end
 * names the thing in the title and draws the outcome in the body under a large mark, with no icon in
 * the title (owner, 2026-11-17, walk F222).
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
        rerender({ title: 'My Luma', outcome: 'Installed', status: 'success', children: 'Open the store to see it.' });

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
        rerender({ rows: ROWS, title: 'My Luma', outcome: "Couldn't Install", status: 'error' });

        expect(screen.getByRole('dialog')).toHaveAttribute('data-size', 'M');
    });

    it('offers Close alone while its rows run, and no status icon', () => {
        renderProgress({ rows: ROWS, action: { label: 'Retry', onPress: jest.fn() } });

        expect(buttonNames()).toEqual(['Close']);
        expect(document.querySelector('.modal-status-icon')).toBeNull();
    });

    it('once ended, names the thing, draws the outcome under its mark, its lines, and its one action after Close', () => {
        const onPress = jest.fn();
        renderProgress({
            rows: ROWS,
            title: 'My Luma',
            outcome: "Couldn't Install",
            status: 'error',
            children: ['Verify failed.', 'Open the log to see why.'],
            action: { label: 'Retry', onPress },
        });

        expect(document.querySelector('.modal-status-icon')).toBeNull();
        expect(screen.getByRole('heading')).toHaveTextContent(/^My Luma$/u);
        expect(document.querySelector('.result-mark')).toHaveAttribute('data-status', 'error');
        expect(screen.getByText("Couldn't Install")).toHaveClass('result-outcome');
        const lines = Array.from(document.querySelectorAll('.result-detail > .dialog-line'));
        expect(lines.map((line) => line.textContent)).toEqual(['Verify failed.', 'Open the log to see why.']);
        expect(buttonNames()).toEqual(['Close', 'Retry']);
        expect(screen.getByRole('dialog')).toHaveAttribute('data-size', 'M');
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(onPress).toHaveBeenCalledTimes(1);
    });

    // Step-07 Win1: a question about one row is asked under that row, the rest still in view.
    it('asks a question under the row it is about', () => {
        const rows: NonNullable<ProgressDialogProps['rows']> = [
            ROWS[0],
            { ...ROWS[1], question: <p>Stop the demo first?</p> },
            ROWS[2],
        ];
        renderProgress({ rows });

        const items = Array.from(document.querySelectorAll('.dialog-stack > ul.work-row-list > li'));
        expect(items[1]).toHaveTextContent('Stop the demo first?');
        expect(items[1].querySelector('.work-row')).toHaveTextContent('Stop the demo first?');
        expect(items[0]).not.toHaveTextContent('Stop the demo first?');
    });

    // Walk F195 (owner, 2026-11-17): a clean end with nothing to read waits for Close too.
    it('waits for Close after it ended clean with nothing to read', () => {
        const { onClose } = renderProgress({ rows: ROWS, title: 'My Luma', outcome: 'Installed', status: 'success' });

        act(() => {
            jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE * 3);
        });
        expect(onClose).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
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

    describe('a streamed run (its own view)', () => {
        const stream = <p data-testid="stream">Publishing pages</p>;

        it('draws the run its own way in a medium window, holding its size while it works', () => {
            renderProgress({ stream, closeLabel: 'Run in Background' });

            expect(screen.getByTestId('stream')).toBeInTheDocument();
            expect(document.querySelector('.dialog-stack')).toBeNull();
            expect(screen.getByRole('dialog')).toHaveAttribute('data-size', 'M');
            expect(buttonNames()).toEqual(['Run in Background']);
        });

        it('offers its answers after Cancel while it asks, the main one last', () => {
            const onPress = jest.fn();
            renderProgress({
                stream,
                title: 'Sign In Again?',
                status: 'warning',
                closeLabel: 'Cancel',
                actions: [
                    { label: 'Skip', variant: 'secondary', onPress: jest.fn() },
                    { label: 'Sign In', variant: 'accent', onPress },
                ],
            });

            expect(buttonNames()).toEqual(['Cancel', 'Skip', 'Sign In']);
            fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
            expect(onPress).toHaveBeenCalledTimes(1);
        });

        it('keeps a medium window for its result', () => {
            renderProgress({ stream, title: 'Pages' });

            expect(screen.getByRole('dialog')).toHaveAttribute('data-size', 'M');
        });

        it('waits for Close after it ended clean with nothing to read', () => {
            const { onClose } = renderProgress({ stream, title: 'Pages' });

            act(() => {
                jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE * 3);
            });
            expect(onClose).not.toHaveBeenCalled();
        });

        // Step-07 Win1: the projects batch run and the Updates run, whose rows can each be asked a
        // question, open large; a list of names that cannot be broken opens wide.
        it('opens large when a question can be asked under its rows, and wide for unbreakable names', () => {
            const { rerender } = renderProgress({ stream, asksUnderRows: true });
            expect(screen.getByRole('dialog')).toHaveAttribute('data-size', 'L');
            expect(screen.getByRole('dialog')).not.toHaveClass('modal-wide');

            rerender({ stream, asksUnderRows: true, wide: true });
            expect(screen.getByRole('dialog')).toHaveClass('modal-wide');
        });

        it('hides Close while a question waits whose answers are every way on', () => {
            renderProgress({
                stream,
                title: 'Stop the Demo?',
                hideClose: true,
                actions: [
                    { label: 'Skip', variant: 'secondary', onPress: jest.fn() },
                    { label: 'Stop It', variant: 'accent', onPress: jest.fn() },
                ],
            });

            expect(buttonNames()).toEqual(['Skip', 'Stop It']);
        });
    });
});
