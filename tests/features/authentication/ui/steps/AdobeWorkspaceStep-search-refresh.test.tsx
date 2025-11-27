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
    createManyWorkspaces,
} from './AdobeWorkspaceStep.testUtils';

const mockUseSelectionStep = useSelectionStep as jest.Mock;

describe('AdobeWorkspaceStep - Search and Refresh', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        mockOnMessage.mockReturnValue(jest.fn());
    });

    describe('Search and Filter', () => {
        it('should filter workspaces based on search query', () => {
            const mockSetSearchQuery = jest.fn();
            mockUseSelectionStep.mockReturnValue(
                createMockUseSelectionStepReturn({
                    filteredItems: [mockWorkspaces[0]], // Filtered to "Stage"
                    searchQuery: 'Stage',
                    setSearchQuery: mockSetSearchQuery,
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

            // Only the filtered workspace should be shown
            expect(screen.getByText('Showing 1 of 3 workspaces')).toBeInTheDocument();
        });

        it('should show search field when more than 5 workspaces', () => {
            const manyWorkspaces = createManyWorkspaces(10);

            mockUseSelectionStep.mockReturnValue(
                createMockUseSelectionStepReturn({
                    items: manyWorkspaces,
                    filteredItems: manyWorkspaces,
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

            expect(screen.getByPlaceholderText('Type to filter workspaces...')).toBeInTheDocument();
        });
    });

    describe('Refresh Functionality', () => {
        it('should provide refresh button', () => {
            mockUseSelectionStep.mockReturnValue(createMockUseSelectionStepReturn());

            render(
                <Provider theme={defaultTheme}>
                    <AdobeWorkspaceStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            const refreshButton = screen.getByLabelText('Refresh workspaces');
            expect(refreshButton).toBeInTheDocument();
        });

        it('should call refresh when refresh button is clicked', async () => {
            const mockRefresh = jest.fn();
            mockUseSelectionStep.mockReturnValue(
                createMockUseSelectionStepReturn({
                    refresh: mockRefresh,
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
            const refreshButton = screen.getByLabelText('Refresh workspaces');
            await user.click(refreshButton);

            expect(mockRefresh).toHaveBeenCalled();
        });
    });
});
