import { render, screen } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { AdobeProjectStep } from '@/features/authentication/ui/steps/AdobeProjectStep';
import { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';
import {
    mockPostMessage,
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

describe('AdobeProjectStep - Project Selection', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();

    beforeEach(() => {
        setupBeforeEach();
    });

    describe('Happy Path - Project Selection', () => {
        it('should render project selection UI', () => {
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

            expect(screen.getByText(/Projects in Test Organization/)).toBeInTheDocument();
            expect(screen.getByText('Test Project 1')).toBeInTheDocument();
        });

        it('should display all projects in list', () => {
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

            expect(screen.getByText('Test Project 1')).toBeInTheDocument();
            expect(screen.getByText('Test Project 2')).toBeInTheDocument();
            expect(screen.getByText('Test Project 3')).toBeInTheDocument();
        });

        it('should clear workspace when project selection changes', () => {
            mockUseSelectionStep.mockReturnValue(
                createMockSelectionStep({
                    items: mockProjects,
                    filteredItems: mockProjects,
                    hasLoadedOnce: true,
                })
            );

            // Get the onSelect callback passed to useSelectionStep
            render(
                <Provider theme={defaultTheme}>
                    <AdobeProjectStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            // Verify useSelectionStep was called with onSelect that clears workspace
            const useSelectionStepCall = mockUseSelectionStep.mock.calls[0][0];
            const onSelect = useSelectionStepCall.onSelect;

            // Simulate selecting a project
            onSelect(mockProjects[0]);

            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    adobeWorkspace: undefined,
                })
            );
        });

        it('should enable proceed when project is selected', () => {
            const stateWithProject = {
                ...baseState,
                adobeProject: mockProjects[0],
            };

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
                        state={stateWithProject as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });

        it('should disable proceed when no project is selected', () => {
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

            expect(mockSetCanProceed).toHaveBeenCalledWith(false);
        });
    });

    describe('Backend Call on Continue Pattern', () => {
        it('should update state immediately without backend call', () => {
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

            // Get the onSelect callback from useSelectionStep
            const useSelectionStepCall = mockUseSelectionStep.mock.calls[0][0];
            const onSelect = useSelectionStepCall.onSelect;

            // Simulate selecting a project
            onSelect(mockProjects[0]);

            // Should update state immediately
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    adobeProject: expect.objectContaining({
                        id: 'project1',
                        name: 'project-1',
                        title: 'Test Project 1',
                    }),
                })
            );

            // Should NOT post message (backend call deferred to Continue button)
            expect(mockPostMessage).not.toHaveBeenCalled();
        });
    });
});
