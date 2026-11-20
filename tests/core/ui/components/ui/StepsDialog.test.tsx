/**
 * StepsDialog: one window that goes Form, Running, Result without changing size (owner,
 * 2026-11-11). Large; the steps it may show next are drawn hidden beside the one shown until the
 * height is held, then they go; while it waits only the wait and the way out appear. The real
 * Modal over the shared Spectrum mock; the box's height is held through `Element.animate`, which
 * the test stands in for so the hold can be seen.
 */

import '@testing-library/jest-dom';

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import type { ModalWait } from '@/core/ui/components/ui/Modal';
import { StepsDialog, type StepsDialogProps } from '@/core/ui/components/ui/StepsDialog';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';

const WAIT: ModalWait = { label: 'Installing My Luma', detail: 'Products' };

function renderSteps(props: Partial<StepsDialogProps> = {}) {
    const onClose = jest.fn();
    const onInstall = jest.fn();
    const view = (extra: Partial<StepsDialogProps>) => (
        <Provider theme={defaultTheme}>
            <StepsDialog
                isOpen
                title="Install My Luma"
                onClose={onClose}
                closeLabel="Cancel"
                actionButtons={[{ label: 'Install', variant: 'accent', onPress: onInstall }]}
                reserve={[<p key="run">Every row of the run</p>, <p key="result">Every line of the result</p>]}
                {...props}
                {...extra}
            >
                <p>The form</p>
            </StepsDialog>
        </Provider>
    );
    const utils = render(view({}));
    return { onClose, onInstall, rerender: (extra: Partial<StepsDialogProps>) => utils.rerender(view(extra)) };
}

function dialog(): HTMLElement {
    return screen.getByRole('dialog');
}

describe('StepsDialog', () => {
    let animate: jest.Mock;
    const realAnimate = HTMLElement.prototype.animate;
    const realRect = HTMLElement.prototype.getBoundingClientRect;

    beforeEach(() => {
        jest.useFakeTimers();
        animate = jest.fn(() => ({ cancel: jest.fn() }));
        HTMLElement.prototype.animate = animate as unknown as HTMLElement['animate'];
        HTMLElement.prototype.getBoundingClientRect = function rect(this: HTMLElement) {
            return { height: this.classList.contains('modal-dialog') ? 512 : 0 } as DOMRect;
        };
    });

    afterEach(() => {
        jest.useRealTimers();
        HTMLElement.prototype.animate = realAnimate;
        HTMLElement.prototype.getBoundingClientRect = realRect;
    });

    it('renders nothing while closed', () => {
        renderSteps({ isOpen: false });

        expect(screen.queryByText('Install My Luma')).toBeNull();
    });

    it('is large whatever step it is on', () => {
        renderSteps();

        expect(dialog()).toHaveAttribute('data-size', 'L');
    });

    it('is small when no step holds a list or a form (compact), and never wide', () => {
        renderSteps({ compact: true, wide: true });

        expect(dialog()).toHaveAttribute('data-size', 'S');
        expect(document.querySelector('.modal-wide')).toBeNull();
    });

    it('holds the height it measured, in every axis, for as long as it is open', () => {
        renderSteps();

        expect(animate).toHaveBeenCalledTimes(1);
        const [frames, timing] = animate.mock.calls[0];
        expect(frames[0]).toEqual({ height: '512px', minHeight: '512px', maxHeight: '512px' });
        expect(timing).toEqual({ duration: Infinity, fill: 'forwards' });
        expect(dialog()).toHaveClass('is-locked');
        expect(dialog()).not.toHaveClass('is-measuring');
    });

    it('measures once: a later step does not measure again', () => {
        const { rerender } = renderSteps();

        rerender({ title: 'Installing My Luma', waiting: WAIT });
        rerender({ title: 'My Luma Installed', status: 'success' });

        // The body's fade on a new step animates too; only the hold names a maximum height.
        const holds = animate.mock.calls.filter(([frames]) => frames[0]?.maxHeight);
        expect(holds).toHaveLength(1);
    });

    it('measures with the reserved steps drawn hidden beside the shown one, then drops them', () => {
        // What the hold measures, in the frame before the window is seen.
        let ghostsWhenMeasured: Element[] = [];
        animate.mockImplementationOnce(() => {
            ghostsWhenMeasured = Array.from(document.querySelectorAll('.modal-steps-ghost'));
            return { cancel: jest.fn() };
        });

        renderSteps();

        expect(ghostsWhenMeasured).toHaveLength(2);
        ghostsWhenMeasured.forEach((ghost) => expect(ghost).toHaveAttribute('aria-hidden', 'true'));
        expect(document.querySelectorAll('.modal-steps-ghost')).toHaveLength(0);
        expect(dialog()).toHaveClass('is-locked');
        expect(screen.getByText('The form')).toBeInTheDocument();
    });

    it('holds anyway once the wait for what the steps hold runs out', () => {
        renderSteps({ ready: false });

        act(() => {
            jest.advanceTimersByTime(FRONTEND_TIMEOUTS.DIALOG_MEASURE_LIMIT);
        });

        // The wait giving way to the steps fades the body too; only the hold names a maximum height.
        const holds = animate.mock.calls.filter(([frames]) => frames[0]?.maxHeight);
        expect(holds).toHaveLength(1);
        expect(document.querySelectorAll('.modal-steps-ghost')).toHaveLength(0);
    });

    // A wait drawn with no window round it, over the page, did not read as one (owner, 2026-11-15):
    // while what the steps hold is read, the wait is a small window of its own, and the steps' window
    // replaces it at its own height (rule 14: a new step may be a new window).
    it('waits in a small window of its own, titled as the window will be, then becomes the steps window', () => {
        const { rerender, onClose } = renderSteps({ ready: false, waiting: WAIT });

        // Unseen for its first moment, so a quick read shows nothing at all.
        expect(dialog()).toHaveClass('is-measuring');
        act(() => {
            jest.advanceTimersByTime(FRONTEND_TIMEOUTS.DIALOG_PENDING_DELAY);
        });
        expect(dialog()).not.toHaveClass('is-measuring');
        expect(dialog()).toHaveAttribute('data-size', 'S');
        expect(dialog()).toHaveTextContent('Install My Luma');
        expect(dialog()).toHaveTextContent('Installing My Luma');
        expect(screen.queryByText('The form')).toBeNull();
        expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Cancel']);
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onClose).toHaveBeenCalledTimes(1);

        rerender({ ready: true, waiting: false });

        expect(dialog()).toHaveAttribute('data-size', 'L');
        expect(dialog()).toHaveClass('is-locked');
        expect(screen.getByText('The form')).toBeInTheDocument();
    });

    // Walk F158: a minute-long check, past the 30-second limit, opened the full window around its wait
    // and locked to that height, so the table came into a box too small for it.
    it('stays the small wait past the time limit while it waits on a read it names', () => {
        renderSteps({ ready: false, waiting: WAIT });

        act(() => {
            jest.advanceTimersByTime(FRONTEND_TIMEOUTS.DIALOG_MEASURE_LIMIT);
        });

        expect(dialog()).toHaveAttribute('data-size', 'S');
        expect(dialog()).not.toHaveClass('is-locked');
    });

    // Owner, 2026-11-16: "Opening <title>" read "Opening Uninstall Frescopa?" under a question title.
    it('says Loading when the caller gave no wait words, never "Opening" and the title', () => {
        renderSteps({ ready: false });

        act(() => {
            jest.advanceTimersByTime(FRONTEND_TIMEOUTS.DIALOG_PENDING_DELAY);
        });

        expect(dialog()).toHaveTextContent('Loading');
        expect(dialog()).not.toHaveTextContent('Opening');
    });

    it('CONTROL: a window ready at once opens as the steps window, never the small wait', () => {
        renderSteps();

        act(() => {
            jest.advanceTimersByTime(FRONTEND_TIMEOUTS.DIALOG_PENDING_DELAY);
        });

        expect(dialog()).toHaveAttribute('data-size', 'L');
        expect(screen.getByText('The form')).toBeInTheDocument();
    });

    it('shows only the wait and the way out while a step waits, in the same box', () => {
        renderSteps({ waiting: WAIT, closeLabel: 'Stop Watching' });

        expect(screen.queryByText('The form')).toBeNull();
        expect(document.querySelector('.modal-steps > .modal-wait')).not.toBeNull();
        expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Stop Watching']);
    });

    it('offers the way out then the actions, and the way out only closes', () => {
        const { onClose, onInstall } = renderSteps();

        expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Cancel', 'Install']);
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onInstall).not.toHaveBeenCalled();
    });

    it('cancels the hold when it closes', () => {
        const cancel = jest.fn();
        animate.mockReturnValue({ cancel });
        const { rerender } = renderSteps();

        rerender({ isOpen: false });

        expect(cancel).toHaveBeenCalledTimes(1);
    });

    it('CONTROL: a window with nothing reserved still holds its height', () => {
        renderSteps({ reserve: undefined });

        expect(document.querySelectorAll('.modal-steps-ghost')).toHaveLength(0);
        expect(animate).toHaveBeenCalledTimes(1);
    });
});
