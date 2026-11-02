/**
 * A dialog's change of view, through the real Modal and the real Spectrum Dialog. jsdom lays nothing
 * out and has no Web Animations, so the browser's half is stubbed where a test needs it; the box's
 * real motion was measured frame by frame in Chromium (2026-11-02: the confirm's height turned twice
 * before this, once after).
 */

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { act, render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';
import { Modal } from '@/core/ui/components/ui/Modal';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';

const defaultProps = { title: 'Test Modal', onClose: jest.fn(), children: 'Modal content' };

const renderWithProvider = (modal: React.ReactElement) =>
    render(<Provider theme={defaultTheme}>{modal}</Provider>);

// A change of view is one move: the content hides, the box eases once to its final size, and
// the new content fades in (owner, 2026-11-02: the confirm folded in and out "like an accordion").
describe('a change of view', () => {
    const wrap = (modal: React.ReactElement) => <Provider theme={defaultTheme}>{modal}</Provider>;

    function settle() {
        act(() => {
            jest.advanceTimersByTime(FRONTEND_TIMEOUTS.DIALOG_VIEW_CHANGE);
        });
    }

    it('hides the content and the title when the width changes, then shows them', () => {
        const { rerender } = renderWithProvider(<Modal {...defaultProps} size="M" />);
        expect(screen.getByRole('dialog')).not.toHaveClass('is-resizing');

        rerender(wrap(<Modal {...defaultProps} size="S" />));
        expect(screen.getByRole('dialog')).toHaveClass('is-resizing', 'is-retitling');

        settle();
        expect(screen.getByRole('dialog')).not.toHaveClass('is-resizing');
        expect(screen.getByRole('dialog')).not.toHaveClass('is-retitling');
    });

    it('hides the content and the title when the title changes', () => {
        const { rerender } = renderWithProvider(<Modal {...defaultProps} />);

        rerender(wrap(<Modal {...defaultProps} title="Remove from the store?" />));

        expect(screen.getByRole('dialog')).toHaveClass('is-resizing', 'is-retitling');
    });

    it('keeps the title showing when only a wait ends: it reads the same', () => {
        const { rerender } = renderWithProvider(<Modal {...defaultProps} waiting={{}} />);

        rerender(wrap(<Modal {...defaultProps} waiting={false} />));

        expect(screen.getByRole('dialog')).toHaveClass('is-resizing');
        expect(screen.getByRole('dialog')).not.toHaveClass('is-retitling');
    });

    it('does not treat a new message in the same wait as a change of view', () => {
        const { rerender } = renderWithProvider(<Modal {...defaultProps} waiting={{ message: 'One' }} />);

        rerender(wrap(<Modal {...defaultProps} waiting={{ message: 'Two' }} />));

        expect(screen.getByRole('dialog')).not.toHaveClass('is-resizing');
    });

    it('CONTROL: new content in the same view is not a change of view', () => {
        const { rerender } = renderWithProvider(<Modal {...defaultProps}>One line</Modal>);

        rerender(wrap(<Modal {...defaultProps}>One line, then another</Modal>));

        expect(screen.getByRole('dialog')).not.toHaveClass('is-resizing');
    });

    describe('the move', () => {
        const animate = jest.fn(() => ({ cancel: jest.fn() }));
        const original = HTMLElement.prototype.animate;
        const originalRect = HTMLElement.prototype.getBoundingClientRect;

        beforeEach(() => {
            animate.mockClear();
            HTMLElement.prototype.animate = animate as unknown as typeof HTMLElement.prototype.animate;
        });

        afterEach(() => {
            HTMLElement.prototype.animate = original;
            HTMLElement.prototype.getBoundingClientRect = originalRect;
        });

        function rectIs(width: number, height: number) {
            HTMLElement.prototype.getBoundingClientRect = () => ({ width, height }) as DOMRect;
        }

        it('eases the box once, from the size it had to the size it ends at', () => {
            rectIs(450, 290);
            const { rerender } = renderWithProvider(<Modal {...defaultProps} size="M" />);

            // The real thing reads the old size while rendering and the new one after the commit.
            const seen = jest.fn();
            let reads = 0;
            HTMLElement.prototype.getBoundingClientRect = () => {
                reads += 1;
                seen();
                return (reads === 1 ? { width: 450, height: 290 } : { width: 375, height: 234 }) as DOMRect;
            };
            rerender(wrap(<Modal {...defaultProps} size="S" />));

            expect(animate).toHaveBeenCalledTimes(1);
            const [frames, timing] = animate.mock.calls[0] as unknown as [Keyframe[], KeyframeAnimationOptions];
            expect(frames).toEqual([
                { width: '450px', height: '290px' },
                { width: '375px', height: '234px' },
            ]);
            expect(timing.duration).toBe(FRONTEND_TIMEOUTS.DIALOG_VIEW_CHANGE);
        });

        it('makes no move on opening: there is no earlier size', () => {
            renderWithProvider(<Modal {...defaultProps} />);

            expect(animate).not.toHaveBeenCalled();
        });

        it('stops the move if the dialog closes during it', () => {
            const cancel = jest.fn();
            animate.mockReturnValue({ cancel });
            const { rerender, unmount } = renderWithProvider(<Modal {...defaultProps} size="M" />);
            rerender(wrap(<Modal {...defaultProps} size="S" />));

            unmount();

            expect(cancel).toHaveBeenCalledTimes(1);
        });

        it('does not move or hide anything for someone who asked for less motion', () => {
            const originalMatch = window.matchMedia;
            window.matchMedia = jest.fn(() => ({ matches: true })) as unknown as typeof window.matchMedia;
            const { rerender } = renderWithProvider(<Modal {...defaultProps} size="M" />);

            rerender(wrap(<Modal {...defaultProps} size="S" />));

            expect(animate).not.toHaveBeenCalled();
            expect(screen.getByRole('dialog')).not.toHaveClass('is-resizing');
            window.matchMedia = originalMatch;
        });
    });
});
