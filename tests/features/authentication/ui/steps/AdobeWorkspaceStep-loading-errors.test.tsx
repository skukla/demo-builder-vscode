import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { AdobeWorkspaceStep } from '@/features/authentication/ui/steps/AdobeWorkspaceStep';
import { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';

// Mock WebviewClient
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        onMessage: jest.fn(),
    },
}));

// Mock useSelectionStep hook
jest.mock('@/features/authentication/ui/hooks/useSelectionStep', () => ({
    useSelectionStep: jest.fn(),
}));

// Mock ConfigurationSummary component
jest.mock('@/features/project-creation/ui/components/ConfigurationSummary', () => ({
    ConfigurationSummary: () => <div data-testid="config-summary">Configuration Summary</div>,
}));

// Mock LoadingDisplay component
jest.mock('@/core/ui/components/feedback/LoadingDisplay', () => ({
    LoadingDisplay: ({ message }: { message: string }) => (
        <div data-testid="loading-display">{message}</div>
    ),
}));

// Mock FadeTransition component
jest.mock('@/core/ui/components/ui/FadeTransition', () => ({
    FadeTransition: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { useSelectionStep } from '@/features/authentication/ui/hooks/useSelectionStep';
import {
    mockOnMessage,
    mockWorkspaces,
    baseState,
    createMockUseSelectionStepReturn,
    createStateWithoutProject,
} from './AdobeWorkspaceStep.testUtils';

const mockUseSelectionStep = useSelectionStep as jest.Mock;

describe('AdobeWorkspaceStep - Loading and Errors', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        mockOnMessage.mockReturnValue(jest.fn());
    });

    describe('Loading States', () => {
        it('should display loading indicator when loading workspaces', () => {
            mockUseSelectionStep.mockReturnValue(
                createMockUseSelectionStepReturn({
                    items: [],
                    filteredItems: [],
                    isLoading: true,
                    showLoading: true,
                    hasLoadedOnce: false,
                })
            );

            render(
                <Provider theme={defaultTheme}>
                    <AdobeWorkspaceStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            expect(screen.getByTestId('loading-display')).toBeInTheDocument();
            expect(screen.getByText('Loading workspaces...')).toBeInTheDocument();
        });

        it('should indicate refreshing state without hiding list', () => {
            mockUseSelectionStep.mockReturnValue(
                createMockUseSelectionStepReturn({
                    isLoading: true,
                    showLoading: false,
                    isRefreshing: true,
                })
            );

            render(
                <Provider theme={defaultTheme}>
                    <AdobeWorkspaceStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            // List should still be visible during refresh
            expect(screen.getByText('Stage')).toBeInTheDocument();
        });
    });

    describe('Error Handling', () => {
        it('should display error message when loading fails', () => {
            mockUseSelectionStep.mockReturnValue(
                createMockUseSelectionStepReturn({
                    items: [],
                    filteredItems: [],
                    hasLoadedOnce: false,
                    error: 'Failed to load workspaces',
                })
            );

            render(
                <Provider theme={defaultTheme}>
                    <AdobeWorkspaceStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            expect(screen.getByText('Error Loading Workspaces')).toBeInTheDocument();
            expect(screen.getByText('Failed to load workspaces')).toBeInTheDocument();
        });

        it('should provide retry button on error', async () => {
            const mockLoad = jest.fn();
            mockUseSelectionStep.mockReturnValue(
                createMockUseSelectionStepReturn({
                    items: [],
                    filteredItems: [],
                    hasLoadedOnce: false,
                    error: 'Failed to load workspaces',
                    load: mockLoad,
                })
            );

            render(
                <Provider theme={defaultTheme}>
                    <AdobeWorkspaceStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            const user = userEvent.setup();
            const retryButton = screen.getByText('Try Again');
            await user.click(retryButton);

            expect(mockLoad).toHaveBeenCalled();
        });

        it('should display empty state when no workspaces available', () => {
            mockUseSelectionStep.mockReturnValue(
                createMockUseSelectionStepReturn({
                    items: [],
                    filteredItems: [],
                })
            );

            render(
                <Provider theme={defaultTheme}>
                    <AdobeWorkspaceStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            expect(screen.getByText('No Workspaces Found')).toBeInTheDocument();
            expect(screen.getByText(/create a workspace in Adobe Console first/)).toBeInTheDocument();
        });

        it('should validate project before loading', () => {
            const stateWithoutProject = createStateWithoutProject();

            mockUseSelectionStep.mockReturnValue(
                createMockUseSelectionStepReturn({
                    items: [],
                    filteredItems: [],
                    hasLoadedOnce: false,
                })
            );

            render(
                <Provider theme={defaultTheme}>
                    <AdobeWorkspaceStep
                        state={stateWithoutProject as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            // Verify validateBeforeLoad was provided
            const useSelectionStepCall = mockUseSelectionStep.mock.calls[0][0];
            const validateBeforeLoad = useSelectionStepCall.validateBeforeLoad;
            const result = validateBeforeLoad();

            expect(result.valid).toBe(false);
            expect(result.error).toContain('No project selected');
        });
    });
});
