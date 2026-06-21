import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider as SpectrumProvider, defaultTheme } from '@adobe/react-spectrum';
import { MeshErrorDialog } from '@/features/mesh/ui/steps/components/MeshErrorDialog';

// Test wrapper for Spectrum components
function renderWithSpectrum(ui: React.ReactElement) {
    return render(
        <SpectrumProvider theme={defaultTheme}>
            {ui}
        </SpectrumProvider>
    );
}

describe('MeshErrorDialog', () => {
    const mockOnRetry = jest.fn();
    const mockOnBack = jest.fn();

    beforeEach(() => {
        mockOnRetry.mockClear();
        mockOnBack.mockClear();
    });

    describe('Error message rendering', () => {
        it('renders error icon and title', () => {
            renderWithSpectrum(
                <MeshErrorDialog
                    error="API Mesh API is not enabled"
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText('API Mesh API Not Enabled')).toBeInTheDocument();
        });

        it('renders error message text', () => {
            const errorMessage = 'API Mesh API is not enabled for this workspace.';

            renderWithSpectrum(
                <MeshErrorDialog
                    error={errorMessage}
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText(errorMessage)).toBeInTheDocument();
        });
    });

    describe('Action buttons', () => {
        it('renders Retry and Back buttons', () => {
            renderWithSpectrum(
                <MeshErrorDialog
                    error="API Mesh API is not enabled"
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
                <MeshErrorDialog
                    error="API Mesh API is not enabled"
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
                <MeshErrorDialog
                    error="API Mesh API is not enabled"
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                />
            );

            const backButton = screen.getByText('Back');
            await user.click(backButton);

            expect(mockOnBack).toHaveBeenCalledTimes(1);
        });
    });

    describe('Setup instructions retired (Step 04)', () => {
        // The manual Console-UI remediation is replaced by auto-subscribe on deploy.
        it('does not render the View Setup Instructions affordance', () => {
            renderWithSpectrum(
                <MeshErrorDialog
                    error="API Mesh API is not enabled"
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                />
            );

            expect(screen.queryByText('View Setup Instructions')).not.toBeInTheDocument();
            expect(screen.queryByText(/follow the setup guide/i)).not.toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('uses proper heading hierarchy', () => {
            renderWithSpectrum(
                <MeshErrorDialog
                    error="API Mesh API is not enabled"
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                />
            );

            const heading = screen.getByText('API Mesh API Not Enabled');
            expect(heading).toBeInTheDocument();
        });

        it('provides accessible button labels', () => {
            renderWithSpectrum(
                <MeshErrorDialog
                    error="API Mesh API is not enabled"
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                />
            );

            const retryButton = screen.getByRole('button', { name: /retry/i });
            const backButton = screen.getByRole('button', { name: /back/i });

            expect(retryButton).toBeInTheDocument();
            expect(backButton).toBeInTheDocument();
        });
    });

    describe('Visual styling', () => {
        it('renders error icon with red styling', () => {
            const { container } = renderWithSpectrum(
                <MeshErrorDialog
                    error="API Mesh API is not enabled"
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                />
            );

            // AlertCircle icon should have red styling
            const icon = container.querySelector('[class*="text-red"]');
            expect(icon).toBeInTheDocument();
        });
    });
});
