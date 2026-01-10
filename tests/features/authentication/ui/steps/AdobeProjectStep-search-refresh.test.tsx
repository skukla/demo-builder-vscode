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
    createManyProjects,
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

describe('AdobeProjectStep - Search and Refresh', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();

    beforeEach(() => {
        setupBeforeEach();
    });

    describe('Search and Filter', () => {
        it('should display search field when more than 5 projects', () => {
            const manyProjects = createManyProjects(10);

            mockUseSelectionStep.mockReturnValue(
                createMockSelectionStep({
                    items: manyProjects,
                    filteredItems: manyProjects,
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

            expect(screen.getByPlaceholderText('Type to filter projects...')).toBeInTheDocument();
        });

        it('should filter projects based on search query', () => {
            const mockSetSearchQuery = jest.fn();
            mockUseSelectionStep.mockReturnValue(
                createMockSelectionStep({
                    items: mockProjects,
                    filteredItems: [mockProjects[0]], // Filtered to one project
                    hasLoadedOnce: true,
                    searchQuery: 'Project 1',
                    setSearchQuery: mockSetSearchQuery,
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

            // Only the filtered project should be visible
            expect(screen.getByText('Showing 1 of 3 projects')).toBeInTheDocument();
        });

        it('should show no results message when search returns empty', () => {
            const mockSetSearchQuery = jest.fn();
            mockUseSelectionStep.mockReturnValue(
                createMockSelectionStep({
                    items: mockProjects,
                    filteredItems: [], // No matches
                    hasLoadedOnce: true,
                    searchQuery: 'nonexistent',
                    setSearchQuery: mockSetSearchQuery,
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

            expect(screen.getByText(/No projects match "nonexistent"/)).toBeInTheDocument();
        });
    });

    describe('Refresh Functionality', () => {
        it('should provide refresh button', () => {
            mockUseSelectionStep.mockReturnValue(
                createMockSelectionStep({
                    items: mockProjects,
                    filteredItems: mockProjects,
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

            const refreshButton = screen.getByLabelText('Refresh projects');
            expect(refreshButton).toBeInTheDocument();
        });

        it('should call refresh when refresh button is clicked', async () => {
            const mockRefresh = jest.fn();
            mockUseSelectionStep.mockReturnValue(
                createMockSelectionStep({
                    items: mockProjects,
                    filteredItems: mockProjects,
                    hasLoadedOnce: true,
                    refresh: mockRefresh,
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
            const refreshButton = screen.getByLabelText('Refresh projects');
            await user.click(refreshButton);

            expect(mockRefresh).toHaveBeenCalled();
        });
    });
});
