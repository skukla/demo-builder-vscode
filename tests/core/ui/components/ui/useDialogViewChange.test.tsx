/**
 * A dialog's change of view, through the real Modal and the real Spectrum Dialog. jsdom lays nothing
 * out and has no Web Animations, so the browser's half is stubbed; the box's real behaviour was
 * measured frame by frame in Chromium (2026-11-02).
 */

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';
import { Modal } from '@/core/ui/components/ui/Modal';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';

const defaultProps = { title: 'Test Modal', onClose: jest.fn(), children: 'Modal content' };

const wrap = (modal: React.ReactElement) => <Provider theme={defaultTheme}>{modal}</Provider>;
const FORM = { width: 480, height: 290 } as DOMRect;

const animate = jest.fn((_frames: Keyframe[], _timing: KeyframeAnimationOptions) => ({ cancel: jest.fn() }));
const originalAnimate = HTMLElement.prototype.animate;
const originalRect = HTMLElement.prototype.getBoundingClientRect;

const dialog = () => screen.getByRole('dialog');
const animations = (key: string) => animate.mock.calls.filter(([frames]) => key in frames[0]);
const holds = () => animations('minHeight');
const fades = () => animations('opacity');

beforeEach(() => {
    animate.mockClear();
    HTMLElement.prototype.animate = animate as unknown as typeof HTMLElement.prototype.animate;
    HTMLElement.prototype.getBoundingClientRect = () => FORM;
});

afterEach(() => {
    HTMLElement.prototype.animate = originalAnimate;
    HTMLElement.prototype.getBoundingClientRect = originalRect;
});

describe("a dialog's size never animates", () => {
    it('never eases a width or a height', () => {
        const { rerender } = render(wrap(<Modal {...defaultProps} size="M" />));

        rerender(wrap(<Modal {...defaultProps} size="S" title="Remove from the store?" />));
        rerender(wrap(<Modal {...defaultProps} size="S" title="Remove" waiting={{}} />));
        rerender(wrap(<Modal {...defaultProps} size="S" title="Removed" />));

        expect(animate.mock.calls.filter(([frames]) => 'height' in frames[0])).toStrictEqual([]);
    });

    it('fades the new body in when the view changes', () => {
        const { rerender } = render(wrap(<Modal {...defaultProps} size="M" />));

        rerender(wrap(<Modal {...defaultProps} size="S" title="Remove from the store?" />));

        expect(fades()).toHaveLength(1);
        expect(fades()[0][0]).toEqual([{ opacity: 0 }, { opacity: 1 }]);
        expect(fades()[0][1].duration).toBe(FRONTEND_TIMEOUTS.DIALOG_BODY_FADE);
    });

    it('fades nothing on opening', () => {
        render(wrap(<Modal {...defaultProps} />));

        expect(animate).not.toHaveBeenCalled();
    });

    it('CONTROL: new content in the same view is not a change of view', () => {
        const { rerender } = render(wrap(<Modal {...defaultProps}>One line</Modal>));

        rerender(wrap(<Modal {...defaultProps}>One line, then another</Modal>));

        expect(animate).not.toHaveBeenCalled();
    });

    it('fades nothing for someone who asked for less motion', () => {
        const originalMatch = window.matchMedia;
        window.matchMedia = jest.fn(() => ({ matches: true })) as unknown as typeof window.matchMedia;
        const { rerender } = render(wrap(<Modal {...defaultProps} size="M" />));

        rerender(wrap(<Modal {...defaultProps} size="S" />));

        expect(fades()).toStrictEqual([]);
        window.matchMedia = originalMatch;
    });
});

describe('a wait keeps the box it found', () => {
    it('holds the width, and the height as a floor', () => {
        const { rerender } = render(wrap(<Modal {...defaultProps} size="M" />));

        rerender(wrap(<Modal {...defaultProps} size="S" waiting={{}} />));

        const held = { width: '480px', minHeight: '290px' };
        expect(holds()).toHaveLength(1);
        expect(holds()[0][0]).toEqual([held, held]);
        expect(holds()[0][1]).toMatchObject({ duration: Infinity, fill: 'forwards' });
        expect(dialog()).toHaveClass('is-holding');
    });

    it('does the same for a body that is a wait with its own buttons', () => {
        const { rerender } = render(wrap(<Modal {...defaultProps} />));

        rerender(wrap(<Modal {...defaultProps} holdSize />));

        expect(dialog()).toHaveClass('is-holding');
    });

    it('changes nothing when one wait follows another', () => {
        const { rerender } = render(wrap(<Modal {...defaultProps} />));
        rerender(wrap(<Modal {...defaultProps} waiting={{}} />));
        animate.mockClear();

        rerender(wrap(<Modal {...defaultProps} holdSize />));

        expect(animate).not.toHaveBeenCalled();
        expect(dialog()).toHaveClass('is-holding');
    });

    it('lets go when real content arrives, and fades it in', () => {
        const cancel = jest.fn();
        animate.mockReturnValue({ cancel });
        const { rerender } = render(wrap(<Modal {...defaultProps} size="M" />));
        rerender(wrap(<Modal {...defaultProps} waiting={{}} size="M" />));
        animate.mockClear();

        rerender(wrap(<Modal {...defaultProps} size="S" title="Removed" />));

        expect(cancel).toHaveBeenCalledTimes(1);
        expect(fades()).toHaveLength(1);
        expect(dialog()).not.toHaveClass('is-holding');
    });

    it('has no box to keep on a first open', () => {
        render(wrap(<Modal {...defaultProps} waiting={{}} />));

        expect(animate).not.toHaveBeenCalled();
        expect(dialog()).not.toHaveClass('is-holding');
    });

    it('does not treat a new message in the same wait as a change of view', () => {
        const { rerender } = render(wrap(<Modal {...defaultProps} waiting={{ message: 'One' }} />));

        rerender(wrap(<Modal {...defaultProps} waiting={{ message: 'Two' }} />));

        expect(animate).not.toHaveBeenCalled();
    });

    it('lets go if the dialog closes during a wait', () => {
        const cancel = jest.fn();
        animate.mockReturnValue({ cancel });
        const { rerender, unmount } = render(wrap(<Modal {...defaultProps} />));
        rerender(wrap(<Modal {...defaultProps} waiting={{}} />));

        unmount();

        expect(cancel).toHaveBeenCalledTimes(1);
    });
});
