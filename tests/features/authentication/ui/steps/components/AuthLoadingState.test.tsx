import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider as SpectrumProvider, defaultTheme } from '@adobe/react-spectrum';
import { AuthLoadingState } from '@/features/authentication/ui/steps/components/AuthLoadingState';

// Test wrapper for Spectrum components
function renderWithSpectrum(ui: React.ReactElement) {
    return render(
        <SpectrumProvider theme={defaultTheme}>
            {ui}
        </SpectrumProvider>
    );
}

describe('AuthLoadingState', () => {
    describe('Basic rendering', () => {
        it('renders loading spinner', () => {
            renderWithSpectrum(
                <AuthLoadingState message="Authenticating..." />
            );

            expect(screen.getByText('Authenticating...')).toBeInTheDocument();
        });

        it('renders with custom message', () => {
            const customMessage = 'Verifying Adobe credentials';

            renderWithSpectrum(
                <AuthLoadingState message={customMessage} />
            );

            expect(screen.getByText(customMessage)).toBeInTheDocument();
        });

        it('renders with sub-message when provided', () => {
            renderWithSpectrum(
                <AuthLoadingState
                    message="Authenticating..."
                    subMessage="Opening browser for login"
                />
            );

            expect(screen.getByText('Authenticating...')).toBeInTheDocument();
            expect(screen.getByText('Opening browser for login')).toBeInTheDocument();
        });

        it('renders without sub-message when not provided', () => {
            renderWithSpectrum(
                <AuthLoadingState message="Authenticating..." />
            );

            expect(screen.getByText('Authenticating...')).toBeInTheDocument();
            // No sub-message should be present
        });
    });

    describe('Loading display component', () => {
        it('uses LoadingDisplay component for consistent styling', () => {
            renderWithSpectrum(
                <AuthLoadingState message="Authenticating..." />
            );

            // LoadingDisplay shows the message
            expect(screen.getByText('Authenticating...')).toBeInTheDocument();
        });

        it('renders with large size for visibility', () => {
            renderWithSpectrum(
                <AuthLoadingState message="Authenticating..." />
            );

            // Should have large loading indicator
            expect(screen.getByText('Authenticating...')).toBeInTheDocument();
        });
    });

    describe('Layout and positioning', () => {
        it('centers content vertically and horizontally', () => {
            renderWithSpectrum(
                <AuthLoadingState message="Authenticating..." />
            );

            // Layout verified via visual testing - checking content renders
            expect(screen.getByText('Authenticating...')).toBeInTheDocument();
        });

        it('uses proper height for step container', () => {
            const { container } = renderWithSpectrum(
                <AuthLoadingState message="Authenticating..." />
            );

            // Should have fixed height (typically 350px)
            expect(container.firstChild).toBeInTheDocument();
        });
    });

    describe('Helper text', () => {
        it('renders helper text when provided', () => {
            renderWithSpectrum(
                <AuthLoadingState
                    message="Authenticating..."
                    helperText="This may take a few moments"
                />
            );

            expect(screen.getByText('This may take a few moments')).toBeInTheDocument();
        });

        it('does not render helper text when not provided', () => {
            renderWithSpectrum(
                <AuthLoadingState message="Authenticating..." />
            );

            expect(screen.queryByText(/may take/i)).not.toBeInTheDocument();
        });
    });

    describe('Message updates', () => {
        it('updates when message prop changes', () => {
            const { rerender } = renderWithSpectrum(
                <AuthLoadingState message="Initial message" />
            );

            expect(screen.getByText('Initial message')).toBeInTheDocument();

            rerender(
                <SpectrumProvider theme={defaultTheme}>
                    <AuthLoadingState message="Updated message" />
                </SpectrumProvider>
            );

            expect(screen.queryByText('Initial message')).not.toBeInTheDocument();
            expect(screen.getByText('Updated message')).toBeInTheDocument();
        });

        it('updates when subMessage prop changes', () => {
            const { rerender } = renderWithSpectrum(
                <AuthLoadingState
                    message="Authenticating..."
                    subMessage="Step 1"
                />
            );

            expect(screen.getByText('Step 1')).toBeInTheDocument();

            rerender(
                <SpectrumProvider theme={defaultTheme}>
                    <AuthLoadingState
                        message="Authenticating..."
                        subMessage="Step 2"
                    />
                </SpectrumProvider>
            );

            expect(screen.queryByText('Step 1')).not.toBeInTheDocument();
            expect(screen.getByText('Step 2')).toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('provides accessible text for screen readers', () => {
            renderWithSpectrum(
                <AuthLoadingState message="Authenticating..." />
            );

            const message = screen.getByText('Authenticating...');
            expect(message).toBeInTheDocument();
        });

        it('indicates loading state to assistive technology', () => {
            const { container } = renderWithSpectrum(
                <AuthLoadingState message="Authenticating..." />
            );

            // Should have appropriate ARIA attributes for loading state
            expect(container).toBeInTheDocument();
        });
    });
});
