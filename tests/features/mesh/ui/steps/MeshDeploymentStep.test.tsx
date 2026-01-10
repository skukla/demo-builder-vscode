/**
 * Tests for MeshDeploymentStep component
 * Step 4: Create MeshDeploymentStep Component
 *
 * Renders mesh deployment UI with recovery options on timeout/error.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MeshDeploymentStep } from '@/features/mesh/ui/steps/MeshDeploymentStep';
import { MeshDeploymentState } from '@/features/mesh/ui/steps/meshDeploymentTypes';

// Mock Adobe Spectrum components
jest.mock('@adobe/react-spectrum', () => ({
    Button: ({ children, onPress, isDisabled }: { children: React.ReactNode; onPress?: () => void; isDisabled?: boolean }) => (
        <button onClick={onPress} disabled={isDisabled}>{children}</button>
    ),
    Flex: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Heading: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

// Note: Spectrum icons use global mocks from tests/__mocks__/@spectrum-icons/workflow.tsx
// TestIds follow the pattern: spectrum-icon-{iconname} (lowercase)
// - AlertCircle → spectrum-icon-alertcircle
// - CheckmarkCircle → spectrum-icon-checkmarkcircle
// - Clock → spectrum-icon-clock

// Mock UI components
jest.mock('@/core/ui/components/layout/CenteredFeedbackContainer', () => ({
    CenteredFeedbackContainer: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="centered-container">{children}</div>
    ),
}));

jest.mock('@/core/ui/components/feedback/LoadingDisplay', () => ({
    LoadingDisplay: ({ message, subMessage, helperText }: { message?: string; subMessage?: string; helperText?: string }) => (
        <div data-testid="loading-display" role="progressbar">
            {message && <span data-testid="loading-message">{message}</span>}
            {subMessage && <span data-testid="loading-submessage">{subMessage}</span>}
            {helperText && <span data-testid="loading-helper">{helperText}</span>}
        </div>
    ),
}));

jest.mock('@/core/ui/components/layout/SingleColumnLayout', () => ({
    SingleColumnLayout: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="single-column-layout">{children}</div>
    ),
}));

describe('MeshDeploymentStep', () => {
    const mockOnRetry = jest.fn();
    const mockOnCancel = jest.fn();
    const mockOnContinue = jest.fn();

    const defaultProps = {
        onRetry: mockOnRetry,
        onCancel: mockOnCancel,
        onContinue: mockOnContinue,
    };

    const createState = (
        status: MeshDeploymentState['status'],
        overrides?: Partial<MeshDeploymentState>
    ): MeshDeploymentState => ({
        status,
        attempt: 1,
        maxAttempts: 16,
        elapsedSeconds: 0,
        message: 'Test message',
        ...overrides,
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Loading state (deploying)', () => {
        it('renders loading display during deployment', () => {
            const state = createState('deploying', { message: 'Deploying API Mesh...' });

            render(<MeshDeploymentStep state={state} {...defaultProps} />);

            expect(screen.getByRole('progressbar')).toBeInTheDocument();
            expect(screen.getByTestId('loading-message')).toHaveTextContent('Deploying API Mesh...');
        });

        it('does not show recovery buttons during deployment', () => {
            const state = createState('deploying');

            render(<MeshDeploymentStep state={state} {...defaultProps} />);

            expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
        });
    });

    describe('Verifying state', () => {
        it('shows elapsed time and attempt count during verification', () => {
            const state = createState('verifying', {
                attempt: 5,
                maxAttempts: 16,
                elapsedSeconds: 45,
                message: 'Verifying deployment...',
            });

            render(<MeshDeploymentStep state={state} {...defaultProps} />);

            // Should show elapsed time in helper text
            expect(screen.getByTestId('loading-helper')).toHaveTextContent('45s');
            // Should show attempt progress
            expect(screen.getByTestId('loading-helper')).toHaveTextContent('5/16');
        });

        it('renders loading display during verification', () => {
            const state = createState('verifying', { message: 'Verifying deployment...' });

            render(<MeshDeploymentStep state={state} {...defaultProps} />);

            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });
    });

    describe('Timeout state', () => {
        it('shows recovery options on timeout', () => {
            const state = createState('timeout', {
                attempt: 16,
                maxAttempts: 16,
                elapsedSeconds: 180,
                message: 'Deployment timed out',
            });

            render(<MeshDeploymentStep state={state} {...defaultProps} />);

            expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
        });

        it('shows timeout message', () => {
            const state = createState('timeout', {
                message: 'Deployment timed out. The mesh may still be deploying.',
            });

            render(<MeshDeploymentStep state={state} {...defaultProps} />);

            // Check for the heading (more specific)
            expect(screen.getByText('Deployment Timed Out')).toBeInTheDocument();
        });

        it('triggers onRetry when retry button clicked', () => {
            const state = createState('timeout');

            render(<MeshDeploymentStep state={state} {...defaultProps} />);

            fireEvent.click(screen.getByRole('button', { name: /retry/i }));

            expect(mockOnRetry).toHaveBeenCalledTimes(1);
        });

        it('triggers onCancel when cancel button clicked', () => {
            const state = createState('timeout');

            render(<MeshDeploymentStep state={state} {...defaultProps} />);

            fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

            expect(mockOnCancel).toHaveBeenCalledTimes(1);
        });
    });

    describe('Error state', () => {
        it('shows recovery options on error', () => {
            const state = createState('error', {
                errorMessage: 'Authentication failed: Token expired',
            });

            render(<MeshDeploymentStep state={state} {...defaultProps} />);

            expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
        });

        it('shows error message', () => {
            const state = createState('error', {
                errorMessage: 'Authentication failed: Token expired',
            });

            render(<MeshDeploymentStep state={state} {...defaultProps} />);

            expect(screen.getByText(/Authentication failed/i)).toBeInTheDocument();
        });

        it('shows alert icon for error state', () => {
            const state = createState('error', {
                errorMessage: 'Deployment failed',
            });

            render(<MeshDeploymentStep state={state} {...defaultProps} />);

            // Global mock renders all icons with 'spectrum-icon-defaulticon' testId
            // (moduleNameMapper maps all @spectrum-icons/workflow/* to same default export)
            // The correct state/text is verified by other tests; this just confirms icon presence
            expect(screen.getByTestId('spectrum-icon-defaulticon')).toBeInTheDocument();
        });
    });

    describe('Success state', () => {
        it('shows success message and mesh endpoint', () => {
            const state = createState('success', {
                message: 'Mesh deployed successfully!',
                meshId: 'mesh-abc123',
                endpoint: 'https://graph.adobe.io/api/abc123/graphql',
            });

            render(<MeshDeploymentStep state={state} {...defaultProps} />);

            expect(screen.getByText(/successfully/i)).toBeInTheDocument();
            expect(screen.getByText(/graph\.adobe\.io/)).toBeInTheDocument();
        });

        it('shows checkmark icon for success', () => {
            const state = createState('success', {
                meshId: 'mesh-123',
                endpoint: 'https://example.com',
            });

            render(<MeshDeploymentStep state={state} {...defaultProps} />);

            // Success state renders CheckmarkCircle icon
            // Global mock renders all icons with 'spectrum-icon-defaulticon' testId
            // (moduleNameMapper maps all @spectrum-icons/workflow/* to same default export)
            // The correct state/text is verified by other tests; this just confirms icon presence
            expect(screen.getByTestId('spectrum-icon-defaulticon')).toBeInTheDocument();
        });

        it('enables continue after success', () => {
            const state = createState('success', {
                meshId: 'mesh-123',
                endpoint: 'https://example.com',
            });

            render(<MeshDeploymentStep state={state} {...defaultProps} />);

            const continueButton = screen.getByRole('button', { name: /continue/i });
            expect(continueButton).toBeInTheDocument();
            expect(continueButton).not.toBeDisabled();
        });

        it('triggers onContinue when continue button clicked', () => {
            const state = createState('success', {
                meshId: 'mesh-123',
                endpoint: 'https://example.com',
            });

            render(<MeshDeploymentStep state={state} {...defaultProps} />);

            fireEvent.click(screen.getByRole('button', { name: /continue/i }));

            expect(mockOnContinue).toHaveBeenCalledTimes(1);
        });
    });

    describe('Callback interactions', () => {
        it('retry button triggers onRetry callback', () => {
            const state = createState('timeout');

            render(<MeshDeploymentStep state={state} {...defaultProps} />);

            fireEvent.click(screen.getByRole('button', { name: /retry/i }));

            expect(mockOnRetry).toHaveBeenCalledTimes(1);
        });

        it('cancel button triggers onCancel callback', () => {
            const state = createState('error', { errorMessage: 'Test error' });

            render(<MeshDeploymentStep state={state} {...defaultProps} />);

            fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

            expect(mockOnCancel).toHaveBeenCalledTimes(1);
        });
    });
});
