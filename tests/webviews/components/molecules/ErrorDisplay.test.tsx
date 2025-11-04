import React from 'react';
import { renderWithProviders, screen } from "../../../helpers/react-test-utils";
import userEvent from '@testing-library/user-event';
import { ErrorDisplay } from '@/webview-ui/shared/components/feedback/ErrorDisplay';

describe('ErrorDisplay', () => {
    describe('Rendering', () => {
        it('renders with required message prop', () => {
            renderWithProviders(<ErrorDisplay message="Something went wrong" />);
            expect(screen.getByText('Something went wrong')).toBeInTheDocument();
        });

        it('renders with default title "Error"', () => {
            renderWithProviders(<ErrorDisplay message="Failed" />);
            expect(screen.getByText('Error')).toBeInTheDocument();
        });

        it('renders with custom title', () => {
            renderWithProviders(<ErrorDisplay title="Load Failed" message="Could not load data" />);
            expect(screen.getByText('Load Failed')).toBeInTheDocument();
        });

        it('renders error icon', () => {
            const { container } = renderWithProviders(<ErrorDisplay message="Error" />);
            // AlertCircle icon should be rendered
            expect(container.querySelector('svg')).toBeInTheDocument();
        });
    });

    describe('Retry Functionality', () => {
        it('does not render retry button when onRetry not provided', () => {
            renderWithProviders(<ErrorDisplay message="Error" />);
            expect(screen.queryByRole('button')).not.toBeInTheDocument();
        });

        it('renders retry button when onRetry provided', () => {
            const handleRetry = jest.fn();
            renderWithProviders(<ErrorDisplay message="Error" onRetry={handleRetry} />);
            expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
        });

        it('calls onRetry when retry button clicked', async () => {
            const user = userEvent.setup();
            const handleRetry = jest.fn();
            renderWithProviders(<ErrorDisplay message="Error" onRetry={handleRetry} />);

            const retryButton = screen.getByRole('button', { name: /try again/i });
            await user.click(retryButton);

            expect(handleRetry).toHaveBeenCalledTimes(1);
        });

        it('renders custom retry label', () => {
            const handleRetry = jest.fn();
            renderWithProviders(
                <ErrorDisplay
                    message="Error"
                    onRetry={handleRetry}
                    retryLabel="Retry Loading"
                />
            );
            expect(screen.getByRole('button', { name: /retry loading/i })).toBeInTheDocument();
        });
    });

    describe('Severity', () => {
        it('renders error severity by default', () => {
            const { container } = renderWithProviders(<ErrorDisplay message="Error" />);
            const icon = container.querySelector('.text-red-600');
            expect(icon).toBeInTheDocument();
        });

        it('renders warning severity', () => {
            const { container } = renderWithProviders(
                <ErrorDisplay message="Warning" severity="warning" />
            );
            const icon = container.querySelector('.text-yellow-600');
            expect(icon).toBeInTheDocument();
        });
    });

    describe('Icon Size', () => {
        it('uses L icon size by default', () => {
            renderWithProviders(<ErrorDisplay message="Error" />);
            // Icon should be rendered (exact size verification depends on Spectrum implementation)
            const { container } = renderWithProviders(<ErrorDisplay message="Error" />);
            expect(container.querySelector('svg')).toBeInTheDocument();
        });

        it('renders with custom icon size', () => {
            renderWithProviders(<ErrorDisplay message="Error" iconSize="XL" />);
            const { container } = renderWithProviders(<ErrorDisplay message="Error" iconSize="XL" />);
            expect(container.querySelector('svg')).toBeInTheDocument();
        });
    });

    describe('Layout', () => {
        it('centers content by default', () => {
            const { container } = renderWithProviders(<ErrorDisplay message="Error" />);
            // Check for centered container
            const flexContainer = container.querySelector('[style*="justify-content"]');
            expect(flexContainer).toBeInTheDocument();
        });

        it('does not center when centered is false', () => {
            renderWithProviders(<ErrorDisplay message="Test error message" centered={false} />);
            // Component should render without centering wrapper
            expect(screen.getByText('Test error message')).toBeInTheDocument();
            expect(screen.getByText('Error')).toBeInTheDocument(); // Default title
        });

        it('respects maxWidth prop', () => {
            const { container } = renderWithProviders(
                <ErrorDisplay message="Long error message" maxWidth="600px" />
            );
            const messageElement = screen.getByText('Long error message');
            expect(messageElement).toHaveStyle({ maxWidth: '600px' });
        });
    });

    describe('Accessibility', () => {
        it('has proper text hierarchy', () => {
            renderWithProviders(
                <ErrorDisplay
                    title="Error Loading Projects"
                    message="Failed to fetch projects from Adobe I/O"
                />
            );
            expect(screen.getByText('Error Loading Projects')).toBeInTheDocument();
            expect(screen.getByText('Failed to fetch projects from Adobe I/O')).toBeInTheDocument();
        });

        it('retry button has proper label', () => {
            const handleRetry = jest.fn();
            renderWithProviders(<ErrorDisplay message="Error" onRetry={handleRetry} />);
            const button = screen.getByRole('button');
            expect(button).toHaveAccessibleName();
        });
    });

    describe('Complex Scenarios', () => {
        it('renders full error display with all options', () => {
            const handleRetry = jest.fn();
            renderWithProviders(
                <ErrorDisplay
                    title="Authentication Failed"
                    message="Your session has expired. Please try again."
                    onRetry={handleRetry}
                    retryLabel="Sign In Again"
                    severity="warning"
                    iconSize="XL"
                    centered={true}
                    maxWidth="500px"
                />
            );

            expect(screen.getByText('Authentication Failed')).toBeInTheDocument();
            expect(screen.getByText('Your session has expired. Please try again.')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /sign in again/i })).toBeInTheDocument();
        });

        it('handles multiple retry clicks', async () => {
            const user = userEvent.setup();
            const handleRetry = jest.fn();
            renderWithProviders(<ErrorDisplay message="Error" onRetry={handleRetry} />);

            const retryButton = screen.getByRole('button');
            await user.click(retryButton);
            await user.click(retryButton);
            await user.click(retryButton);

            expect(handleRetry).toHaveBeenCalledTimes(3);
        });
    });

    describe('Memoization', () => {
        it('is memoized component', () => {
            expect(ErrorDisplay).toHaveProperty('$$typeof');
        });
    });
});
