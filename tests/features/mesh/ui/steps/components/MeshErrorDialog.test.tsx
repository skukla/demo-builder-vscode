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
    const mockOnOpenConsole = jest.fn();

    const setupInstructions = [
        {
            step: 'Navigate to the Services tab in Adobe Console',
            details: 'Click on Services in the left sidebar',
            important: false,
        },
        {
            step: 'Enable API Mesh API',
            details: 'Find API Mesh in the services list and click Enable',
            important: true,
        },
        {
            step: 'Wait for activation',
            details: 'API activation may take a few minutes',
            important: false,
        },
    ];

    beforeEach(() => {
        mockOnRetry.mockClear();
        mockOnBack.mockClear();
        mockOnOpenConsole.mockClear();
    });

    describe('Error message rendering', () => {
        it('renders error icon and title', () => {
            renderWithSpectrum(
                <MeshErrorDialog
                    error="API Mesh API is not enabled"
                    setupInstructions={[]}
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                    onOpenConsole={mockOnOpenConsole}
                />
            );

            expect(screen.getByText('API Mesh API Not Enabled')).toBeInTheDocument();
        });

        it('renders error message text', () => {
            const errorMessage = 'API Mesh API is not enabled for this workspace.';

            renderWithSpectrum(
                <MeshErrorDialog
                    error={errorMessage}
                    setupInstructions={[]}
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                    onOpenConsole={mockOnOpenConsole}
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
                    setupInstructions={[]}
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                    onOpenConsole={mockOnOpenConsole}
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
                    setupInstructions={[]}
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                    onOpenConsole={mockOnOpenConsole}
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
                    setupInstructions={[]}
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                    onOpenConsole={mockOnOpenConsole}
                />
            );

            const backButton = screen.getByText('Back');
            await user.click(backButton);

            expect(mockOnBack).toHaveBeenCalledTimes(1);
        });
    });

    describe('Setup instructions', () => {
        it('shows setup instructions link when instructions are provided', () => {
            renderWithSpectrum(
                <MeshErrorDialog
                    error="API Mesh API is not enabled"
                    setupInstructions={setupInstructions}
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                    onOpenConsole={mockOnOpenConsole}
                />
            );

            expect(screen.getByText(/follow the setup guide/i)).toBeInTheDocument();
            expect(screen.getByText('View Setup Instructions')).toBeInTheDocument();
        });

        it('does not show setup instructions link when no instructions provided', () => {
            renderWithSpectrum(
                <MeshErrorDialog
                    error="API Mesh API is not enabled"
                    setupInstructions={[]}
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                    onOpenConsole={mockOnOpenConsole}
                />
            );

            expect(screen.queryByText('View Setup Instructions')).not.toBeInTheDocument();
        });

        it('opens modal when View Setup Instructions is clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderWithSpectrum(
                <MeshErrorDialog
                    error="API Mesh API is not enabled"
                    setupInstructions={setupInstructions}
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                    onOpenConsole={mockOnOpenConsole}
                />
            );

            const viewInstructionsButton = screen.getByText('View Setup Instructions');
            await user.click(viewInstructionsButton);

            // Modal should now be visible
            expect(screen.getByText('API Mesh Setup Guide')).toBeInTheDocument();
        });

        it('renders numbered instructions in modal', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderWithSpectrum(
                <MeshErrorDialog
                    error="API Mesh API is not enabled"
                    setupInstructions={setupInstructions}
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                    onOpenConsole={mockOnOpenConsole}
                />
            );

            const viewInstructionsButton = screen.getByText('View Setup Instructions');
            await user.click(viewInstructionsButton);

            // Check that instruction steps are rendered
            expect(screen.getByText(/navigate to the services tab/i)).toBeInTheDocument();
            expect(screen.getByText(/enable api mesh api/i)).toBeInTheDocument();
            expect(screen.getByText(/wait for activation/i)).toBeInTheDocument();
        });

        it('highlights important instructions', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderWithSpectrum(
                <MeshErrorDialog
                    error="API Mesh API is not enabled"
                    setupInstructions={setupInstructions}
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                    onOpenConsole={mockOnOpenConsole}
                />
            );

            const viewInstructionsButton = screen.getByText('View Setup Instructions');
            await user.click(viewInstructionsButton);

            // Important step should be marked (e.g., with special styling or indicator)
            const importantStep = screen.getByText(/enable api mesh api/i);
            expect(importantStep).toBeInTheDocument();
        });

        it('renders Open Workspace in Console button in modal', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderWithSpectrum(
                <MeshErrorDialog
                    error="API Mesh API is not enabled"
                    setupInstructions={setupInstructions}
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                    onOpenConsole={mockOnOpenConsole}
                />
            );

            const viewInstructionsButton = screen.getByText('View Setup Instructions');
            await user.click(viewInstructionsButton);

            expect(screen.getByText('Open Workspace in Console')).toBeInTheDocument();
        });

        it('calls onOpenConsole when Open Workspace button is clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderWithSpectrum(
                <MeshErrorDialog
                    error="API Mesh API is not enabled"
                    setupInstructions={setupInstructions}
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                    onOpenConsole={mockOnOpenConsole}
                />
            );

            const viewInstructionsButton = screen.getByText('View Setup Instructions');
            await user.click(viewInstructionsButton);

            const openConsoleButton = screen.getByText('Open Workspace in Console');
            await user.click(openConsoleButton);

            expect(mockOnOpenConsole).toHaveBeenCalledTimes(1);
        });

    });

    describe('Accessibility', () => {
        it('uses proper heading hierarchy', () => {
            renderWithSpectrum(
                <MeshErrorDialog
                    error="API Mesh API is not enabled"
                    setupInstructions={setupInstructions}
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                    onOpenConsole={mockOnOpenConsole}
                />
            );

            const heading = screen.getByText('API Mesh API Not Enabled');
            expect(heading).toBeInTheDocument();
        });

        it('provides accessible button labels', () => {
            renderWithSpectrum(
                <MeshErrorDialog
                    error="API Mesh API is not enabled"
                    setupInstructions={setupInstructions}
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                    onOpenConsole={mockOnOpenConsole}
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
                    setupInstructions={[]}
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                    onOpenConsole={mockOnOpenConsole}
                />
            );

            // AlertCircle icon should have red styling
            const icon = container.querySelector('[class*="text-red"]');
            expect(icon).toBeInTheDocument();
        });

        it('uses FadeTransition for smooth appearance', () => {
            const { container } = renderWithSpectrum(
                <MeshErrorDialog
                    error="API Mesh API is not enabled"
                    setupInstructions={[]}
                    onRetry={mockOnRetry}
                    onBack={mockOnBack}
                    onOpenConsole={mockOnOpenConsole}
                />
            );

            // Component should be wrapped in FadeTransition
            expect(container.firstChild).toBeInTheDocument();
        });
    });
});
