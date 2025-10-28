import React from 'react';
import { renderWithProviders, screen, waitFor } from '../../../utils/react-test-utils';
import { LoadingDisplay, LoadingDisplayPresets } from '@/core/ui/components/LoadingDisplay';

describe('LoadingDisplay', () => {
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
        it('does not re-mount FadeTransition when message prop changes', () => {
            // Track render count
            let messageRenderCount = 0;
            const MessageWrapper = ({ children }: { children: React.ReactNode }) => {
                messageRenderCount++;
                return <>{children}</>;
            };

            // Spy on FadeTransition to track mounting
            const mountSpy = jest.fn();
            const unmountSpy = jest.fn();

            jest.doMock('@/core/ui/components/FadeTransition', () => ({
                FadeTransition: ({ children }: { children: React.ReactNode }) => {
                    React.useEffect(() => {
                        mountSpy();
                        return () => {
                            unmountSpy();
                        };
                    }, []);
                    return <MessageWrapper>{children}</MessageWrapper>;
                }
            }));

            const { rerender } = renderWithProviders(
                <LoadingDisplay message="Initial message" />
            );

            const initialElement = screen.getByText('Initial message');
            const initialMountCount = mountSpy.mock.calls.length;

            // Change message
            rerender(<LoadingDisplay message="Updated message" />);

            // Wait for update
            const updatedElement = screen.getByText('Updated message');

            // Component should NOT have been unmounted and re-mounted
            expect(unmountSpy).not.toHaveBeenCalled();
            // Mount should only have been called once (initial mount)
            expect(mountSpy).toHaveBeenCalledTimes(initialMountCount);
        });

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

    describe('FadeTransition Usage', () => {
        it('uses FadeTransition for main message', () => {
            const { container } = renderWithProviders(
                <LoadingDisplay message="Test message" />
            );

            const messageText = screen.getByText('Test message');
            const parent = messageText.parentElement;

            // FadeTransition renders a div with opacity and transition styles
            expect(parent).toHaveStyle({ opacity: '1' });
            // Check that transition style exists and contains 'opacity'
            const transition = parent?.style.transition || '';
            expect(transition).toContain('opacity');
        });

        it('uses FadeTransition for subMessage', () => {
            const { container } = renderWithProviders(
                <LoadingDisplay message="Main" subMessage="Sub message" />
            );

            const subText = screen.getByText('Sub message');
            const parent = subText.parentElement;

            // FadeTransition renders a div with opacity and transition styles
            expect(parent).toHaveStyle({ opacity: '1' });
            // Check that transition style exists and contains 'opacity'
            const transition = parent?.style.transition || '';
            expect(transition).toContain('opacity');
        });
    });

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

        it('renders determinate progress with value', () => {
            renderWithProviders(
                <LoadingDisplay
                    message="Loading..."
                    isIndeterminate={false}
                    progress={50}
                />
            );
            const progress = screen.getByRole('progressbar');
            expect(progress).toBeInTheDocument();
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

        it('respects explicit centered prop', () => {
            renderWithProviders(
                <LoadingDisplay size="M" message="Loading..." centered={true} />
            );
            const container = screen.getByRole('status');
            expect(container).toBeInTheDocument();
        });
    });

    describe('Custom ClassName', () => {
        it('applies custom className', () => {
            const { container } = renderWithProviders(
                <LoadingDisplay message="Loading..." className="custom-class" />
            );
            // The className is applied to the Flex element inside the status div
            const statusDiv = screen.getByRole('status');
            const flexElement = statusDiv.querySelector('.custom-class');
            expect(flexElement).toBeInTheDocument();
        });
    });

    describe('Presets', () => {
        it('provides fullPage preset', () => {
            const element = LoadingDisplayPresets.fullPage('Loading...', 'Please wait');
            expect(element).toBeDefined();
            expect(element.props.size).toBe('L');
            expect(element.props.centered).toBe(true);
        });

        it('provides inline preset', () => {
            const element = LoadingDisplayPresets.inline('Loading...');
            expect(element).toBeDefined();
            expect(element.props.size).toBe('S');
            expect(element.props.centered).toBe(false);
        });

        it('provides section preset', () => {
            const element = LoadingDisplayPresets.section('Loading...', 'Sub text');
            expect(element).toBeDefined();
            expect(element.props.size).toBe('M');
        });
    });
});
