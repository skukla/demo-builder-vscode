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

    it('draws the reserved steps hidden beside the shown one until the height is known, then drops them', () => {
        const { rerender } = renderSteps({ ready: false });

        const ghosts = document.querySelectorAll('.modal-steps-ghost');
        expect(ghosts).toHaveLength(2);
        ghosts.forEach((ghost) => expect(ghost).toHaveAttribute('aria-hidden', 'true'));
        expect(ghosts[0].parentElement).toBe(document.querySelector('.modal-steps'));
        expect(dialog()).toHaveClass('is-measuring');
        expect(animate).not.toHaveBeenCalled();

        rerender({ ready: true });

        expect(document.querySelectorAll('.modal-steps-ghost')).toHaveLength(0);
        expect(dialog()).toHaveClass('is-locked');
        expect(screen.getByText('The form')).toBeInTheDocument();
    });

    it('holds anyway once the wait for what the steps hold runs out', () => {
        renderSteps({ ready: false });

        act(() => {
            jest.advanceTimersByTime(FRONTEND_TIMEOUTS.DIALOG_MEASURE_LIMIT);
        });

        expect(animate).toHaveBeenCalledTimes(1);
        expect(document.querySelectorAll('.modal-steps-ghost')).toHaveLength(0);
    });

    it('stays unseen while what it holds is unknown, and shows its wait, in words, where it will open', () => {
        const { rerender } = renderSteps({ ready: false, waiting: WAIT });

        expect(document.querySelector('.modal-steps-pending')).toBeNull();
        act(() => {
            jest.advanceTimersByTime(FRONTEND_TIMEOUTS.DIALOG_PENDING_DELAY);
        });
        expect(document.querySelector('.modal-steps-pending')).toHaveTextContent('Installing My Luma');
        expect(dialog()).toHaveClass('is-measuring');

        rerender({ ready: true, waiting: false });

        expect(document.querySelector('.modal-steps-pending')).toBeNull();
        expect(dialog()).toHaveClass('is-locked');
    });

    it('names the window it is opening when the caller gave no wait words', () => {
        renderSteps({ ready: false });

        act(() => {
            jest.advanceTimersByTime(FRONTEND_TIMEOUTS.DIALOG_PENDING_DELAY);
        });

        expect(document.querySelector('.modal-steps-pending')).toHaveTextContent('Opening Install My Luma');
    });

    it('CONTROL: a window ready at once never shows the spinner', () => {
        renderSteps();

        act(() => {
            jest.advanceTimersByTime(FRONTEND_TIMEOUTS.DIALOG_PENDING_DELAY);
        });

        expect(document.querySelector('.modal-steps-pending')).toBeNull();
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
