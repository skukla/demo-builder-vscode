/**
 * A dialog's change of view, through the real Modal and the real Spectrum Dialog. jsdom lays nothing
 * out and has no Web Animations, so the browser's half is stubbed; the box's real motion was measured
 * frame by frame in Chromium (2026-11-02).
 */

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { act, render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';
import { Modal } from '@/core/ui/components/ui/Modal';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';

const defaultProps = { title: 'Test Modal', onClose: jest.fn(), children: 'Modal content' };

const wrap = (modal: React.ReactElement) => <Provider theme={defaultTheme}>{modal}</Provider>;
const FORM = { width: 480, height: 290 } as DOMRect;
const CONFIRM = { width: 400, height: 234 } as DOMRect;
const NEARLY = { width: 400, height: 243 } as DOMRect;

const animate = jest.fn((_frames: Keyframe[], _timing: KeyframeAnimationOptions) => ({ cancel: jest.fn() }));
const originalAnimate = HTMLElement.prototype.animate;
const originalRect = HTMLElement.prototype.getBoundingClientRect;

/** The box measures `before` until the new view is committed, then `after`: render reads first. */
function boxGoes(before: DOMRect, after: DOMRect) {
    let reads = 0;
    HTMLElement.prototype.getBoundingClientRect = () => {
        reads += 1;
        return reads === 1 ? before : after;
    };
}

function settle() {
    act(() => {
        jest.advanceTimersByTime(FRONTEND_TIMEOUTS.DIALOG_VIEW_CHANGE);
    });
}

const dialog = () => screen.getByRole('dialog');

beforeEach(() => {
    animate.mockClear();
    HTMLElement.prototype.animate = animate as unknown as typeof HTMLElement.prototype.animate;
});

afterEach(() => {
    HTMLElement.prototype.animate = originalAnimate;
    HTMLElement.prototype.getBoundingClientRect = originalRect;
});

describe('a big change of view: one move', () => {
    it('hides the body but never the title, eases the box once, then shows the body', () => {
        const { rerender } = render(wrap(<Modal {...defaultProps} size="M" />));
        boxGoes(FORM, CONFIRM);

        rerender(wrap(<Modal {...defaultProps} size="S" />));

        expect(dialog()).toHaveClass('is-resizing');
        expect(animate).toHaveBeenCalledTimes(2);
        const box = animate.mock.calls.find(([frames]) => 'height' in frames[0]);
        expect(box?.[0]).toEqual([
            { width: '480px', height: '290px' },
            { width: '400px', height: '234px' },
        ]);
        expect(box?.[1].duration).toBe(FRONTEND_TIMEOUTS.DIALOG_VIEW_CHANGE);

        settle();
        expect(dialog()).not.toHaveClass('is-resizing');
    });

    it('holds the title at its final width for the move, so it does not rewrap', () => {
        const { rerender } = render(wrap(<Modal {...defaultProps} size="M" />));
        boxGoes(FORM, CONFIRM);

        rerender(wrap(<Modal {...defaultProps} size="S" />));

        const title = animate.mock.calls.find(([frames]) => !('height' in frames[0]));
        expect(title?.[0]).toEqual([{ width: '400px' }, { width: '400px' }]);
        expect(title?.[1].duration).toBe(FRONTEND_TIMEOUTS.DIALOG_VIEW_CHANGE);
    });

    it('stops the move if the dialog closes during it', () => {
        const cancel = jest.fn();
        animate.mockReturnValue({ cancel });
        const { rerender, unmount } = render(wrap(<Modal {...defaultProps} size="M" />));
        boxGoes(FORM, CONFIRM);
        rerender(wrap(<Modal {...defaultProps} size="S" />));

        unmount();

        // The box's move and the title's hold.
        expect(cancel).toHaveBeenCalledTimes(2);
    });
});

describe('a small change of view: no movement', () => {
    it('swaps the content, with no easing and nothing hidden', () => {
        const { rerender } = render(wrap(<Modal {...defaultProps} title="Remove from the store?" />));
        boxGoes(CONFIRM, NEARLY);

        rerender(wrap(<Modal {...defaultProps} title="Removed" />));

        expect(animate).not.toHaveBeenCalled();
        expect(dialog()).not.toHaveClass('is-resizing');
    });

    it('does not leave the mark that stops SteadyHeight easing a later change', () => {
        const { rerender } = render(wrap(<Modal {...defaultProps} title="One" />));
        boxGoes(CONFIRM, NEARLY);

        rerender(wrap(<Modal {...defaultProps} title="Two" />));

        expect(dialog()).not.toHaveAttribute('data-view-change');
    });
});

describe('a wait keeps the box it found', () => {
    it('holds the width, and the height as a floor', () => {
        const { rerender } = render(wrap(<Modal {...defaultProps} size="M" />));
        boxGoes(FORM, FORM);

        rerender(wrap(<Modal {...defaultProps} size="S" waiting={{}} />));

        const held = { width: '480px', minHeight: '290px' };
        expect(animate).toHaveBeenCalledTimes(1);
        expect(animate.mock.calls[0][0]).toEqual([held, held]);
        expect(animate.mock.calls[0][1]).toMatchObject({ duration: Infinity, fill: 'forwards' });
        expect(dialog()).toHaveClass('is-holding');
        expect(dialog()).not.toHaveClass('is-resizing');
    });

    it('does the same for a body that is a wait with its own buttons', () => {
        const { rerender } = render(wrap(<Modal {...defaultProps} />));
        boxGoes(CONFIRM, CONFIRM);

        rerender(wrap(<Modal {...defaultProps} holdSize />));

        expect(dialog()).toHaveClass('is-holding');
    });

    it('stays put when one wait follows another', () => {
        const { rerender } = render(wrap(<Modal {...defaultProps} />));
        boxGoes(CONFIRM, CONFIRM);
        rerender(wrap(<Modal {...defaultProps} waiting={{}} />));
        animate.mockClear();
        boxGoes(CONFIRM, CONFIRM);

        rerender(wrap(<Modal {...defaultProps} holdSize />));

        expect(animate).not.toHaveBeenCalled();
        expect(dialog()).toHaveClass('is-holding');
    });

    it('lets go when real content arrives, and moves once if that is a big change', () => {
        const cancel = jest.fn();
        animate.mockReturnValue({ cancel });
        const { rerender } = render(wrap(<Modal {...defaultProps} size="M" />));
        boxGoes(FORM, FORM);
        rerender(wrap(<Modal {...defaultProps} waiting={{}} size="M" />));
        animate.mockClear();
        boxGoes(FORM, CONFIRM);

        rerender(wrap(<Modal {...defaultProps} size="S" title="Removed" />));

        expect(cancel).toHaveBeenCalledTimes(1);
        expect(animate.mock.calls.filter(([frames]) => 'height' in frames[0])).toHaveLength(1);
        expect(dialog()).not.toHaveClass('is-holding');
        expect(dialog()).toHaveClass('is-resizing');
    });

    it('has no box to keep on a first open', () => {
        render(wrap(<Modal {...defaultProps} waiting={{}} />));

        expect(animate).not.toHaveBeenCalled();
        expect(dialog()).not.toHaveClass('is-holding');
    });

    it('does not treat a new message in the same wait as a change of view', () => {
        const { rerender } = render(wrap(<Modal {...defaultProps} waiting={{ message: 'One' }} />));
        boxGoes(FORM, CONFIRM);

        rerender(wrap(<Modal {...defaultProps} waiting={{ message: 'Two' }} />));

        expect(animate).not.toHaveBeenCalled();
    });
});

describe('around it', () => {
    it('CONTROL: new content in the same view is not a change of view', () => {
        const { rerender } = render(wrap(<Modal {...defaultProps}>One line</Modal>));
        boxGoes(FORM, CONFIRM);

        rerender(wrap(<Modal {...defaultProps}>One line, then another</Modal>));

        expect(animate).not.toHaveBeenCalled();
        expect(dialog()).not.toHaveClass('is-resizing');
    });

    it('moves and hides nothing for someone who asked for less motion', () => {
        const originalMatch = window.matchMedia;
        window.matchMedia = jest.fn(() => ({ matches: true })) as unknown as typeof window.matchMedia;
        const { rerender } = render(wrap(<Modal {...defaultProps} size="M" />));
        boxGoes(FORM, CONFIRM);

        rerender(wrap(<Modal {...defaultProps} size="S" />));

        expect(animate).not.toHaveBeenCalled();
        expect(dialog()).not.toHaveClass('is-resizing');
        window.matchMedia = originalMatch;
    });
});
