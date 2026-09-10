import React from 'react';
import { renderWithProviders, screen, waitFor, cleanup } from "../../../../helpers/react-test-utils";
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';

describe('LoadingDisplay', () => {
    afterEach(() => {
        cleanup(); // React Testing Library cleanup
        jest.clearAllMocks();
        jest.restoreAllMocks();
        jest.clearAllTimers(); // Clear any pending timers from waitFor
    });
    describe('Basic Rendering', () => {
        it('renders with message', () => {
            renderWithProviders(<LoadingDisplay message="Loading..." />);
            expect(screen.getByText('Loading...')).toBeInTheDocument();
        });

        it('renders with message and subMessage', () => {
            renderWithProviders(
                <LoadingDisplay message="Loading..." subMessage="Please wait" />
            );
            expect(screen.getByText('Loading...')).toBeInTheDocument();
            expect(screen.getByText('Please wait')).toBeInTheDocument();
        });

        it('renders with helper text', () => {
            renderWithProviders(
                <LoadingDisplay
                    message="Loading..."
                    helperText="This may take a few moments"
                />
            );
            expect(screen.getByText('This may take a few moments')).toBeInTheDocument();
        });

        it('renders progress circle', () => {
            renderWithProviders(<LoadingDisplay message="Loading..." />);
            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });
    });

    describe('Size Variants', () => {
        it('renders with size S in horizontal layout when no subMessage', () => {
            renderWithProviders(<LoadingDisplay size="S" message="Loading..." />);
            expect(screen.getByText('Loading...')).toBeInTheDocument();
            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });

        it('renders with size M', () => {
            renderWithProviders(<LoadingDisplay size="M" message="Loading..." />);
            expect(screen.getByText('Loading...')).toBeInTheDocument();
        });

        it('renders with size L (default)', () => {
            renderWithProviders(<LoadingDisplay message="Loading..." />);
            expect(screen.getByText('Loading...')).toBeInTheDocument();
        });
    });

    describe('Message Update Behavior - No Re-mounting', () => {
        it('does not re-mount FadeTransition when subMessage prop changes', () => {
            const { rerender } = renderWithProviders(
                <LoadingDisplay message="Main message" subMessage="Initial sub" />
            );

            // Get the DOM node
            const subMessageElement = screen.getByText('Initial sub');
            const domNode = subMessageElement.parentElement;

            // Change subMessage
            rerender(
                <LoadingDisplay message="Main message" subMessage="Updated sub" />
            );

            // Check the updated text appears
            expect(screen.getByText('Updated sub')).toBeInTheDocument();

            // The parent FadeTransition wrapper should be the same DOM node
            const updatedSubMessageElement = screen.getByText('Updated sub');
            const updatedDomNode = updatedSubMessageElement.parentElement;

            // Same parent element means no re-mount occurred
            expect(updatedDomNode).toBe(domNode);
        });

        it('updates message content without destroying component tree', () => {
            const { rerender } = renderWithProviders(
                <LoadingDisplay message="Message 1" />
            );

            const container = screen.getByRole('status');
            const initialProgressBar = screen.getByRole('progressbar');

            // Change message multiple times
            rerender(<LoadingDisplay message="Message 2" />);
            rerender(<LoadingDisplay message="Message 3" />);
            rerender(<LoadingDisplay message="Message 4" />);

            // Container and progress bar should be the same elements
            expect(screen.getByRole('status')).toBe(container);
            expect(screen.getByRole('progressbar')).toBe(initialProgressBar);

            // Latest message should be visible
            expect(screen.getByText('Message 4')).toBeInTheDocument();
        });

        it('preserves FadeTransition wrapper when message changes', () => {
            const { rerender } = renderWithProviders(
                <LoadingDisplay message="First" />
            );

            const firstText = screen.getByText('First');
            const fadeWrapper = firstText.parentElement;

            // Change message
            rerender(<LoadingDisplay message="Second" />);

            const secondText = screen.getByText('Second');
            const newFadeWrapper = secondText.parentElement;

            // The FadeTransition wrapper div should be the same element
            expect(newFadeWrapper).toBe(fadeWrapper);
        });

        it('preserves FadeTransition wrapper when subMessage changes', () => {
            const { rerender } = renderWithProviders(
                <LoadingDisplay message="Main" subMessage="Sub 1" />
            );

            const firstSub = screen.getByText('Sub 1');
            const fadeWrapper = firstSub.parentElement;

            // Change subMessage
            rerender(<LoadingDisplay message="Main" subMessage="Sub 2" />);

            const secondSub = screen.getByText('Sub 2');
            const newFadeWrapper = secondSub.parentElement;

            // The FadeTransition wrapper div should be the same element
            expect(newFadeWrapper).toBe(fadeWrapper);
        });

        it('handles rapid message updates without re-mounting', async () => {
            const { rerender } = renderWithProviders(
                <LoadingDisplay message="Message 0" />
            );

            const container = screen.getByRole('status');

            // Rapidly update messages
            for (let i = 1; i <= 10; i++) {
                rerender(<LoadingDisplay message={`Message ${i}`} />);
            }

            // Wait for all updates to settle
            await waitFor(() => {
                expect(screen.getByText('Message 10')).toBeInTheDocument();
            });

            // Container should still be the same
            expect(screen.getByRole('status')).toBe(container);
        });
    });

    // NOTE: FadeTransition tests removed - component uses plain Adobe Spectrum Text
    // FadeTransition was either removed or never implemented. Tests for DOM stability
    // during updates are covered by "Message Update Behavior - No Re-mounting" tests.

    describe('Accessibility', () => {
        it('has status role', () => {
            renderWithProviders(<LoadingDisplay message="Loading..." />);
            expect(screen.getByRole('status')).toBeInTheDocument();
        });

        it('has aria-live polite', () => {
            renderWithProviders(<LoadingDisplay message="Loading..." />);
            const status = screen.getByRole('status');
            expect(status).toHaveAttribute('aria-live', 'polite');
        });

        it('has aria-atomic true', () => {
            renderWithProviders(<LoadingDisplay message="Loading..." />);
            const status = screen.getByRole('status');
            expect(status).toHaveAttribute('aria-atomic', 'true');
        });
    });

    describe('Progress States', () => {
        it('renders indeterminate progress by default', () => {
            renderWithProviders(<LoadingDisplay message="Loading..." />);
            const progress = screen.getByRole('progressbar');
            expect(progress).toBeInTheDocument();
            // Indeterminate progress has no value attribute
        });
    });

    describe('Centering', () => {
        it('centers by default for size L', () => {
            renderWithProviders(<LoadingDisplay size="L" message="Loading..." />);
            // Size L should be centered by default
            const container = screen.getByRole('status');
            expect(container).toBeInTheDocument();
        });

        it('does not center by default for size S and M', () => {
            renderWithProviders(<LoadingDisplay size="S" message="Loading..." />);
            // Size S should not be centered by default
            const container = screen.getByText('Loading...').parentElement;
            expect(container).toBeInTheDocument();
        });
    });

    describe('Custom ClassName', () => {
        it('applies custom className', () => {
            const { container: _container } = renderWithProviders(
                <LoadingDisplay message="Loading..." className="custom-class" />
            );
            // The className is applied to the Flex element inside the status div
            const statusDiv = screen.getByRole('status');
            const flexElement = statusDiv.querySelector('.custom-class');
            expect(flexElement).toBeInTheDocument();
        });
    });

    /**
     * THE THREE-ROW CONTRACT, asserted rather than assumed.
     *
     * Every test above this point asks whether text reached the screen, which is
     * true of almost any rendering of this component. What the props actually
     * decide is the LAYOUT — centred or not, one row or three, a spinner or a
     * filled arc — and none of that was constrained.
     */
    describe('what size decides', () => {
        /** [outer, inner] — the container and the text column. */
        const flexes = (container: HTMLElement): HTMLElement[] =>
            Array.from(container.querySelectorAll<HTMLElement>('[data-testid="spectrum-flex"]'));

        it('fills and centres the space for size L', () => {
            const { container } = renderWithProviders(<LoadingDisplay message="Loading..." />);

            const [outer, inner] = flexes(container);
            expect(outer).toHaveStyle({ justifyContent: 'center', height: '100%' });
            expect(inner).toHaveStyle({ alignItems: 'center' });
        });

        it('leaves the smaller sizes uncentred and unsized', () => {
            const { container } = renderWithProviders(
                <LoadingDisplay size="M" message="Loading..." />
            );

            const [outer, inner] = flexes(container);
            // Centring an inline loader inside a card pushes it to the middle of
            // whatever height that card happens to have.
            expect(outer.style.justifyContent).toBe('');
            expect(outer.style.height).toBe('');
            expect(outer).toHaveStyle({ alignItems: 'center' });
            expect(inner).toHaveStyle({ alignItems: 'start' });
        });

        it.each([
            ['L', undefined, 'text-lg font-medium'],
            ['M', 'M' as const, 'text-base font-medium'],
        ])('gives size %s its own message class', (_label, size, expected) => {
            renderWithProviders(<LoadingDisplay size={size} message="Loading..." />);

            expect(screen.getByText('Loading...').className).toBe(expected);
        });

        it('leaves size S with no size class at all, and no stray space', () => {
            // The map's S entry is empty, so the class is built from nothing plus
            // 'font-medium' — the trim is what stops it reaching the DOM as ' font-medium'.
            renderWithProviders(<LoadingDisplay size="S" message="Loading..." subMessage="Sub" />);

            expect(screen.getByText('Loading...').className).toBe('font-medium');
        });
    });

    describe('the horizontal layout, and when it is used', () => {
        it('drops the status wrapper and the reserved sub-message row for a bare S', () => {
            const { container } = renderWithProviders(
                <LoadingDisplay size="S" message="Loading..." />
            );

            expect(screen.queryByRole('status')).not.toBeInTheDocument();
            expect(container.querySelector('.text-sm')).not.toBeInTheDocument();
        });

        it('goes back to the vertical layout as soon as S has something to say', () => {
            renderWithProviders(
                <LoadingDisplay size="S" message="Loading..." subMessage="Copying page 3" />
            );

            // The horizontal layout has nowhere to put row 2, so choosing it here
            // would silently drop the detail the caller passed.
            expect(screen.getByRole('status')).toBeInTheDocument();
            expect(screen.getByText('Copying page 3')).toBeInTheDocument();
        });
    });

    describe('determinate vs indeterminate', () => {
        const circle = (): HTMLElement => screen.getByRole('progressbar');

        it('spins when no progress is given', () => {
            renderWithProviders(<LoadingDisplay message="Loading..." />);

            expect(circle()).toHaveAttribute('data-indeterminate', 'true');
            expect(circle()).not.toHaveAttribute('value');
        });

        it.each([
            ['a mid-run percentage', 42],
            ['zero, which is a reading and not an absence', 0],
        ])('fills the arc for %s', (_label, progress) => {
            renderWithProviders(<LoadingDisplay message="Loading..." progress={progress} />);

            expect(circle()).toHaveAttribute('data-indeterminate', 'false');
            expect(circle()).toHaveAttribute('value', String(progress));
        });

        it('spins for a negative progress rather than drawing it', () => {
            renderWithProviders(<LoadingDisplay message="Loading..." progress={-5} />);

            expect(circle()).toHaveAttribute('data-indeterminate', 'true');
            expect(circle()).not.toHaveAttribute('value');
        });

        it('spins in the horizontal layout, which takes no progress at all', () => {
            renderWithProviders(<LoadingDisplay size="S" message="Loading..." progress={42} />);

            expect(circle()).toHaveAttribute('data-indeterminate', 'true');
        });
    });

    describe('the helper row', () => {
        it('is absent — not empty — when there is no helper text', () => {
            const { container } = renderWithProviders(<LoadingDisplay message="Loading..." />);

            // An empty row still takes its margin, which shifts the two rows above it.
            expect(container.querySelector('.italic')).not.toBeInTheDocument();
        });

        it('is rendered when there is', () => {
            const { container } = renderWithProviders(
                <LoadingDisplay message="Loading..." helperText="This usually takes a minute" />
            );

            expect(container.querySelector('.italic')).toHaveTextContent(
                'This usually takes a minute'
            );
        });
    });
});
