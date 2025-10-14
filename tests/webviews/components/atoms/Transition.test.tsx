import React from 'react';
import { renderWithProviders, screen, waitFor } from '../../../utils/react-test-utils';
import { Transition } from '../../../../src/webviews/components/atoms/Transition';

describe('Transition', () => {
    describe('Rendering', () => {
        it('renders children when show is true', () => {
            renderWithProviders(
                <Transition show={true}>
                    <div>Visible Content</div>
                </Transition>
            );
            expect(screen.getByText('Visible Content')).toBeInTheDocument();
        });

        it('does not render children when show is false', async () => {
            renderWithProviders(
                <Transition show={false} duration={100}>
                    <div>Hidden Content</div>
                </Transition>
            );

            // Wait for duration to pass
            await waitFor(() => {
                expect(screen.queryByText('Hidden Content')).not.toBeInTheDocument();
            }, { timeout: 200 });
        });

        it('renders with custom className', () => {
            const { container } = renderWithProviders(
                <Transition show={true} className="custom-transition">
                    <div>Content</div>
                </Transition>
            );
            const wrapper = container.querySelector('.custom-transition');
            expect(wrapper).toBeInTheDocument();
        });
    });

    describe('Transition Types', () => {
        it('applies fade transition by default', () => {
            const { container } = renderWithProviders(
                <Transition show={true}>
                    <div>Fade</div>
                </Transition>
            );
            const wrapper = container.firstChild as HTMLElement;
            expect(wrapper).toHaveStyle({
                opacity: 1
            });
        });

        it('applies slide transition', () => {
            const { container } = renderWithProviders(
                <Transition show={true} type="slide">
                    <div>Slide</div>
                </Transition>
            );
            const wrapper = container.firstChild as HTMLElement;
            expect(wrapper).toHaveStyle({
                opacity: 1,
                transform: 'translateY(0)'
            });
        });

        it('applies scale transition', () => {
            const { container } = renderWithProviders(
                <Transition show={true} type="scale">
                    <div>Scale</div>
                </Transition>
            );
            const wrapper = container.firstChild as HTMLElement;
            expect(wrapper).toHaveStyle({
                opacity: 1,
                transform: 'scale(1)'
            });
        });
    });

    describe('Show/Hide Behavior', () => {
        it('shows content immediately when show becomes true', () => {
            const { rerender } = renderWithProviders(
                <Transition show={false} duration={100}>
                    <div>Content</div>
                </Transition>
            );

            rerender(
                <Transition show={true} duration={100}>
                    <div>Content</div>
                </Transition>
            );

            expect(screen.getByText('Content')).toBeInTheDocument();
        });

        it('hides content after duration when show becomes false', async () => {
            const { rerender } = renderWithProviders(
                <Transition show={true} duration={100}>
                    <div>Content</div>
                </Transition>
            );

            // Content should be visible
            expect(screen.getByText('Content')).toBeInTheDocument();

            // Hide the content
            rerender(
                <Transition show={false} duration={100}>
                    <div>Content</div>
                </Transition>
            );

            // Content should still be visible initially
            expect(screen.getByText('Content')).toBeInTheDocument();

            // Wait for duration to pass
            await waitFor(() => {
                expect(screen.queryByText('Content')).not.toBeInTheDocument();
            }, { timeout: 200 });
        });
    });

    describe('Duration', () => {
        it('uses default duration of 200ms', () => {
            const { container } = renderWithProviders(
                <Transition show={true}>
                    <div>Content</div>
                </Transition>
            );
            const wrapper = container.firstChild as HTMLElement;
            expect(wrapper).toHaveStyle({
                transition: 'all 200ms ease-in-out'
            });
        });

        it('applies custom duration', () => {
            const { container } = renderWithProviders(
                <Transition show={true} duration={500}>
                    <div>Content</div>
                </Transition>
            );
            const wrapper = container.firstChild as HTMLElement;
            expect(wrapper).toHaveStyle({
                transition: 'all 500ms ease-in-out'
            });
        });

        it('respects fast transition duration', () => {
            const { container } = renderWithProviders(
                <Transition show={true} duration={100}>
                    <div>Content</div>
                </Transition>
            );
            const wrapper = container.firstChild as HTMLElement;
            expect(wrapper).toHaveStyle({
                transition: 'all 100ms ease-in-out'
            });
        });
    });

    describe('Transition Styles', () => {
        it('applies hidden state styles for fade', () => {
            const { container } = renderWithProviders(
                <Transition show={false} type="fade">
                    <div>Content</div>
                </Transition>
            );
            const wrapper = container.firstChild as HTMLElement;
            expect(wrapper).toHaveStyle({
                opacity: 0
            });
        });

        it('applies hidden state styles for slide', () => {
            const { container } = renderWithProviders(
                <Transition show={false} type="slide">
                    <div>Content</div>
                </Transition>
            );
            const wrapper = container.firstChild as HTMLElement;
            expect(wrapper).toHaveStyle({
                opacity: 0,
                transform: 'translateY(-10px)'
            });
        });

        it('applies hidden state styles for scale', () => {
            const { container } = renderWithProviders(
                <Transition show={false} type="scale">
                    <div>Content</div>
                </Transition>
            );
            const wrapper = container.firstChild as HTMLElement;
            expect(wrapper).toHaveStyle({
                opacity: 0,
                transform: 'scale(0.95)'
            });
        });
    });

    describe('Complex Children', () => {
        it('handles multiple child elements', () => {
            renderWithProviders(
                <Transition show={true}>
                    <div>
                        <span>Child 1</span>
                        <span>Child 2</span>
                    </div>
                </Transition>
            );
            expect(screen.getByText('Child 1')).toBeInTheDocument();
            expect(screen.getByText('Child 2')).toBeInTheDocument();
        });

        it('handles nested components', () => {
            renderWithProviders(
                <Transition show={true}>
                    <div>
                        <button>Click Me</button>
                    </div>
                </Transition>
            );
            expect(screen.getByRole('button')).toBeInTheDocument();
        });
    });

    describe('Cleanup', () => {
        it('cleans up timeout on unmount', () => {
            const { unmount } = renderWithProviders(
                <Transition show={false} duration={1000}>
                    <div>Content</div>
                </Transition>
            );

            unmount();
            // If cleanup doesn't work, this would cause issues
            // No assertion needed - just verify no errors
        });

        it('cleans up timeout when show changes before duration ends', async () => {
            const { rerender } = renderWithProviders(
                <Transition show={true} duration={500}>
                    <div>Content</div>
                </Transition>
            );

            // Hide
            rerender(
                <Transition show={false} duration={500}>
                    <div>Content</div>
                </Transition>
            );

            // Show again before timeout
            rerender(
                <Transition show={true} duration={500}>
                    <div>Content</div>
                </Transition>
            );

            // Content should still be visible
            expect(screen.getByText('Content')).toBeInTheDocument();
        });
    });
});
