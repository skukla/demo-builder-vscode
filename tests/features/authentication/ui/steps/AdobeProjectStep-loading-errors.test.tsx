import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { AdobeProjectStep } from '@/features/authentication/ui/steps/AdobeProjectStep';
import { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';
import {
    mockProjects,
    baseState,
    createMockSelectionStep,
    setupBeforeEach,
} from './AdobeProjectStep.testUtils';

// Mock WebviewClient
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        onMessage: jest.fn(),
    },
}));

// Mock useSelectionStep hook
jest.mock('@/core/ui/hooks/useSelectionStep', () => ({
    useSelectionStep: jest.fn(),
}));

// Mock ConfigurationSummary component
jest.mock('@/core/ui/components/wizard', () => ({
    ConfigurationSummary: () => <div data-testid="config-summary">Configuration Summary</div>,
}));

// Mock LoadingDisplay component
jest.mock('@/core/ui/components/feedback/LoadingDisplay', () => ({
    LoadingDisplay: ({ message, subMessage }: { message: string; subMessage?: string }) => (
        <div data-testid="loading-display">
            <div>{message}</div>
            {subMessage && <div>{subMessage}</div>}
        </div>
    ),
}));

// Mock FadeTransition component
jest.mock('@/core/ui/components/ui/FadeTransition', () => ({
    FadeTransition: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { useSelectionStep } from '@/core/ui/hooks/useSelectionStep';

const mockUseSelectionStep = useSelectionStep as jest.Mock;

describe('AdobeProjectStep - Loading States and Errors', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();

    beforeEach(() => {
        setupBeforeEach();
    });

    describe('Loading States', () => {
        it('should display loading indicator when loading projects', () => {
            mockUseSelectionStep.mockReturnValue(
                createMockSelectionStep({
                    isLoading: true,
                    showLoading: true,
                })
            );

            render(
                <Provider theme={defaultTheme}>
                    <AdobeProjectStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            expect(screen.getByTestId('loading-display')).toBeInTheDocument();
            expect(screen.getByText('Loading your Adobe projects...')).toBeInTheDocument();
        });

        it('should show organization name in loading message', () => {
            mockUseSelectionStep.mockReturnValue(
                createMockSelectionStep({
                    isLoading: true,
                    showLoading: true,
                })
            );

            render(
                <Provider theme={defaultTheme}>
                    <AdobeProjectStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            expect(screen.getByText(/Fetching from organization: Test Organization/)).toBeInTheDocument();
        });

        it('should indicate refreshing state without hiding list', () => {
            mockUseSelectionStep.mockReturnValue(
                createMockSelectionStep({
                    items: mockProjects,
                    filteredItems: mockProjects,
                    isLoading: true,
                    isRefreshing: true,
                    hasLoadedOnce: true,
                })
            );

            render(
                <Provider theme={defaultTheme}>
                    <AdobeProjectStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            // List should still be visible during refresh
            expect(screen.getByText('Test Project 1')).toBeInTheDocument();
        });
    });

    describe('Error Handling', () => {
        it('should display error message when loading fails', () => {
            mockUseSelectionStep.mockReturnValue(
                createMockSelectionStep({
                    error: 'Failed to load projects',
                })
            );

            render(
                <Provider theme={defaultTheme}>
                    <AdobeProjectStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            expect(screen.getByText('Error Loading Projects')).toBeInTheDocument();
            expect(screen.getByText('Failed to load projects')).toBeInTheDocument();
        });

        it('should provide retry button on error', async () => {
            const mockLoad = jest.fn();
            mockUseSelectionStep.mockReturnValue(
                createMockSelectionStep({
                    error: 'Failed to load projects',
                    load: mockLoad,
                })
            );

            render(
                <Provider theme={defaultTheme}>
                    <AdobeProjectStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            const retryButton = screen.getByText('Try Again');
            await user.click(retryButton);

            expect(mockLoad).toHaveBeenCalled();
        });

        it('should display empty state when no projects available', () => {
            mockUseSelectionStep.mockReturnValue(
                createMockSelectionStep({
                    hasLoadedOnce: true,
                })
            );

            render(
                <Provider theme={defaultTheme}>
                    <AdobeProjectStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            expect(screen.getByText('No Projects Found')).toBeInTheDocument();
            expect(screen.getByText(/create a project in Adobe Console first/)).toBeInTheDocument();
        });

        it('should validate organization before loading', () => {
            const stateWithoutOrg = {
                ...baseState,
                adobeOrg: undefined,
            };

            mockUseSelectionStep.mockReturnValue(createMockSelectionStep());

            render(
                <Provider theme={defaultTheme}>
                    <AdobeProjectStep
                        state={stateWithoutOrg as WizardState}
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
            expect(result.error).toContain('No organization available');
        });
    });
});
