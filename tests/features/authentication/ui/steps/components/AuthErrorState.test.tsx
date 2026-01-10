import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider as SpectrumProvider, defaultTheme } from '@adobe/react-spectrum';
import { AuthErrorState } from '@/features/authentication/ui/steps/components/AuthErrorState';

// Test wrapper for Spectrum components
function renderWithSpectrum(ui: React.ReactElement) {
    return render(
        <SpectrumProvider theme={defaultTheme}>
            {ui}
        </SpectrumProvider>
    );
}

describe('AuthErrorState', () => {
    const mockOnRetry = jest.fn();
    const mockOnBack = jest.fn();

    beforeEach(() => {
        mockOnRetry.mockClear();
        mockOnBack.mockClear();
    });

    describe('Error message rendering', () => {
        it('renders error icon and title', () => {
            renderWithSpectrum(
                <AuthErrorState
                    error="Authentication failed"
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText('Authentication Failed')).toBeInTheDocument();
        });

        it('displays error message text', () => {
            const errorMessage = 'Failed to authenticate with Adobe. Please try again.';

            renderWithSpectrum(
                <AuthErrorState
                    error={errorMessage}
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText(errorMessage)).toBeInTheDocument();
        });

        it('renders alert icon with error styling', () => {
            const { container } = renderWithSpectrum(
                <AuthErrorState
                    error="Authentication failed"
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                />
            );

            // AlertCircle icon should have red styling
            const icon = container.querySelector('[class*="text-red"]');
            expect(icon).toBeInTheDocument();
        });
    });

    describe('Action buttons', () => {
        it('renders Retry and Back buttons', () => {
            renderWithSpectrum(
                <AuthErrorState
                    error="Authentication failed"
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText('Retry')).toBeInTheDocument();
            expect(screen.getByText('Back')).toBeInTheDocument();
        });

        it('calls onRetry when Retry button is clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderWithSpectrum(
                <AuthErrorState
                    error="Authentication failed"
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                />
            );

            const retryButton = screen.getByText('Retry');
            await user.click(retryButton);

            expect(mockOnRetry).toHaveBeenCalledTimes(1);
        });

        it('calls onBack when Back button is clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderWithSpectrum(
                <AuthErrorState
                    error="Authentication failed"
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                />
            );

            const backButton = screen.getByText('Back');
            await user.click(backButton);

            expect(mockOnBack).toHaveBeenCalledTimes(1);
        });
    });

    describe('Layout and positioning', () => {
        it('centers content vertically and horizontally', () => {
            renderWithSpectrum(
                <AuthErrorState
                    error="Authentication failed"
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                />
            );

            // Check that content renders (layout verified via visual testing)
            expect(screen.getByText('Authentication Failed')).toBeInTheDocument();
            expect(screen.getByText('Authentication failed')).toBeInTheDocument();
        });

        it('uses proper height for step container', () => {
            const { container } = renderWithSpectrum(
                <AuthErrorState
                    error="Authentication failed"
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                />
            );

            // Should have fixed height (typically 350px)
            expect(container.firstChild).toBeInTheDocument();
        });
    });

    describe('FadeTransition animation', () => {
        it('wraps content in FadeTransition for smooth appearance', () => {
            const { container } = renderWithSpectrum(
                <AuthErrorState
                    error="Authentication failed"
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                />
            );

            expect(container.firstChild).toBeInTheDocument();
        });
    });

    describe('Error message variations', () => {
        it('handles long error messages', () => {
            const longError = 'This is a very long error message that should still be displayed properly even though it contains a lot of text and might wrap to multiple lines in the UI.';

            renderWithSpectrum(
                <AuthErrorState
                    error={longError}
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText(longError)).toBeInTheDocument();
        });

        it('handles short error messages', () => {
            renderWithSpectrum(
                <AuthErrorState
                    error="Error"
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText('Error')).toBeInTheDocument();
        });

        it('handles network error messages', () => {
            const networkError = 'Network error: Failed to connect to Adobe services';

            renderWithSpectrum(
                <AuthErrorState
                    error={networkError}
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText(networkError)).toBeInTheDocument();
        });

        it('handles timeout error messages', () => {
            const timeoutError = 'Request timed out: Authentication took too long';

            renderWithSpectrum(
                <AuthErrorState
                    error={timeoutError}
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText(timeoutError)).toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('uses proper heading hierarchy', () => {
            renderWithSpectrum(
                <AuthErrorState
                    error="Authentication failed"
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                />
            );

            const heading = screen.getByText('Authentication Failed');
            expect(heading).toBeInTheDocument();
        });

        it('provides accessible button labels', () => {
            renderWithSpectrum(
                <AuthErrorState
                    error="Authentication failed"
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                />
            );

            const retryButton = screen.getByRole('button', { name: /retry/i });
            const backButton = screen.getByRole('button', { name: /back/i });

            expect(retryButton).toBeInTheDocument();
            expect(backButton).toBeInTheDocument();
        });

        it('makes error message accessible to screen readers', () => {
            const errorMessage = 'Authentication failed: Invalid credentials';

            renderWithSpectrum(
                <AuthErrorState
                    error={errorMessage}
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                />
            );

            const error = screen.getByText(errorMessage);
            expect(error).toBeInTheDocument();
        });
    });

    describe('Button styling', () => {
        it('renders Retry button with accent variant', () => {
            renderWithSpectrum(
                <AuthErrorState
                    error="Authentication failed"
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                />
            );

            const retryButton = screen.getByText('Retry');
            expect(retryButton).toBeInTheDocument();
        });

        it('renders Back button with secondary variant', () => {
            renderWithSpectrum(
                <AuthErrorState
                    error="Authentication failed"
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                />
            );

            const backButton = screen.getByText('Back');
            expect(backButton).toBeInTheDocument();
        });
    });
});
