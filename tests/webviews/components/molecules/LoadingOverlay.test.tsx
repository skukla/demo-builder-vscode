import React from 'react';
import { renderWithProviders, screen } from '../../../utils/react-test-utils';
import { LoadingOverlay } from '@/webview-ui/shared/components/feedback/LoadingOverlay';

describe('LoadingOverlay', () => {
    describe('Rendering', () => {
        it('renders when visible is true', () => {
            renderWithProviders(<LoadingOverlay visible={true} />);
            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });

        it('does not render when visible is false', () => {
            renderWithProviders(<LoadingOverlay visible={false} />);
            expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
        });

        it('renders with overlay background', () => {
            const { container } = renderWithProviders(<LoadingOverlay visible={true} />);
            const overlay = container.querySelector('[role="progressbar"]')?.parentElement;
            expect(overlay).toHaveStyle({
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0
            });
        });
    });

    describe('Spinner Size', () => {
        it('renders with default L size', () => {
            renderWithProviders(<LoadingOverlay visible={true} />);
            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });

        it('renders with S size', () => {
            renderWithProviders(<LoadingOverlay visible={true} size="S" />);
            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });

        it('renders with M size', () => {
            renderWithProviders(<LoadingOverlay visible={true} size="M" />);
            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });
    });

    describe('Message', () => {
        it('does not render message by default', () => {
            renderWithProviders(<LoadingOverlay visible={true} />);
            expect(screen.getByRole('progressbar')).toHaveAttribute('aria-label', 'Loading');
        });

        it('renders with custom message', () => {
            renderWithProviders(<LoadingOverlay visible={true} message="Loading projects..." />);
            expect(screen.getByRole('progressbar')).toHaveAttribute('aria-label', 'Loading projects...');
            expect(screen.getByText('Loading projects...')).toBeInTheDocument();
        });

        it('displays message text below spinner', () => {
            renderWithProviders(<LoadingOverlay visible={true} message="Please wait" />);
            expect(screen.getByText('Please wait')).toBeInTheDocument();
        });
    });

    describe('Opacity', () => {
        it('uses default opacity of 0.3', () => {
            const { container } = renderWithProviders(<LoadingOverlay visible={true} />);
            const overlay = container.querySelector('[role="progressbar"]')?.parentElement;
            expect(overlay).toHaveStyle({
                backgroundColor: 'rgba(0, 0, 0, 0.3)'
            });
        });

        it('applies custom opacity', () => {
            const { container } = renderWithProviders(<LoadingOverlay visible={true} opacity={0.5} />);
            const overlay = container.querySelector('[role="progressbar"]')?.parentElement;
            expect(overlay).toHaveStyle({
                backgroundColor: 'rgba(0, 0, 0, 0.5)'
            });
        });

        it('applies low opacity', () => {
            const { container } = renderWithProviders(<LoadingOverlay visible={true} opacity={0.1} />);
            const overlay = container.querySelector('[role="progressbar"]')?.parentElement;
            expect(overlay).toHaveStyle({
                backgroundColor: 'rgba(0, 0, 0, 0.1)'
            });
        });
    });

    describe('Z-Index', () => {
        it('uses default z-index of 1000', () => {
            const { container } = renderWithProviders(<LoadingOverlay visible={true} />);
            const overlay = container.querySelector('[role="progressbar"]')?.parentElement;
            expect(overlay).toHaveStyle({
                zIndex: 1000
            });
        });

        it('applies custom z-index', () => {
            const { container } = renderWithProviders(<LoadingOverlay visible={true} zIndex={2000} />);
            const overlay = container.querySelector('[role="progressbar"]')?.parentElement;
            expect(overlay).toHaveStyle({
                zIndex: 2000
            });
        });
    });

    describe('Blur Effect', () => {
        it('does not apply blur by default', () => {
            const { container } = renderWithProviders(<LoadingOverlay visible={true} />);
            const overlay = container.querySelector('[role="progressbar"]')?.parentElement;
            expect(overlay).not.toHaveStyle({
                backdropFilter: 'blur(4px)'
            });
        });

        it('applies blur when blur prop is true', () => {
            const { container } = renderWithProviders(<LoadingOverlay visible={true} blur={true} />);
            const overlay = container.querySelector('[role="progressbar"]')?.parentElement;
            expect(overlay).toHaveStyle({
                backdropFilter: 'blur(4px)'
            });
        });
    });

    describe('Accessibility', () => {
        it('has progressbar role', () => {
            renderWithProviders(<LoadingOverlay visible={true} />);
            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });

        it('has aria-label', () => {
            renderWithProviders(<LoadingOverlay visible={true} />);
            expect(screen.getByLabelText('Loading')).toBeInTheDocument();
        });

        it('has aria-busy attribute', () => {
            renderWithProviders(<LoadingOverlay visible={true} />);
            const overlay = screen.getByRole('progressbar').parentElement;
            expect(overlay).toHaveAttribute('aria-busy', 'true');
        });

        it('uses custom message as aria-label', () => {
            renderWithProviders(<LoadingOverlay visible={true} message="Saving changes" />);
            expect(screen.getByLabelText('Saving changes')).toBeInTheDocument();
        });
    });

    describe('Spinner Container Styles', () => {
        it('has circular shape without message', () => {
            const { container } = renderWithProviders(<LoadingOverlay visible={true} />);
            const spinnerContainer = screen.getByRole('progressbar').parentElement;
            expect(spinnerContainer).toHaveStyle({
                borderRadius: '50%',
                padding: '24px'
            });
        });

        it('has rounded rectangle with message', () => {
            const { container } = renderWithProviders(
                <LoadingOverlay visible={true} message="Loading" />
            );
            const spinnerContainer = screen.getByRole('progressbar').parentElement;
            expect(spinnerContainer).toHaveStyle({
                borderRadius: '8px',
                padding: '32px'
            });
        });
    });

    describe('Transitions', () => {
        it('has transition for opacity', () => {
            const { container } = renderWithProviders(<LoadingOverlay visible={true} />);
            const overlay = container.querySelector('[role="progressbar"]')?.parentElement;
            expect(overlay).toHaveStyle({
                transition: 'opacity 200ms ease-in-out'
            });
        });
    });

    describe('Complex Scenarios', () => {
        it('renders with all custom props', () => {
            const { container } = renderWithProviders(
                <LoadingOverlay
                    visible={true}
                    size="L"
                    message="Processing your request..."
                    opacity={0.6}
                    zIndex={1500}
                    blur={true}
                />
            );

            expect(screen.getByText('Processing your request...')).toBeInTheDocument();
            expect(screen.getByRole('progressbar')).toBeInTheDocument();

            const overlay = container.querySelector('[role="progressbar"]')?.parentElement;
            expect(overlay).toHaveStyle({
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                zIndex: 1500,
                backdropFilter: 'blur(4px)'
            });
        });

        it('toggles visibility correctly', () => {
            const { rerender } = renderWithProviders(<LoadingOverlay visible={false} />);
            expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

            rerender(<LoadingOverlay visible={true} />);
            expect(screen.getByRole('progressbar')).toBeInTheDocument();

            rerender(<LoadingOverlay visible={false} />);
            expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
        });
    });

    describe('Memoization', () => {
        it('is memoized component', () => {
            expect(LoadingOverlay).toHaveProperty('$$typeof');
        });
    });
});
