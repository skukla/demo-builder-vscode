import { render, screen } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { AdobeProjectPicker } from '@/features/authentication/ui/components/AdobeProjectPicker';
import { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';
import {
    mockProjects,
    baseState,
    createMockSelectionStep,
} from './AdobeProjectPicker.testUtils';

// Mock WebviewClient
const mockPostMessage = jest.fn();
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: (...args: unknown[]) => mockPostMessage(...args),
        onMessage: jest.fn(),
    },
}));

// Mock useSelectionStep hook
jest.mock('@/core/ui/hooks/useSelectionStep', () => ({
    useSelectionStep: jest.fn(),
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

describe('AdobeProjectPicker', () => {

    /**
     * WHAT THE PICKER HANDS THE HOOK.
     *
     * Everything else in this file mocks `useSelectionStep` and asserts what came
     * back on screen — which the mock decides, not the component. Measured
     * 2026-09-02 by breaking the wiring four ways: an emptied `searchFields`, a
     * wrong `cacheKey`, and a `messageType` asking the backend for WORKSPACES all
     * left seventeen tests green. Only the inverted auto-select flag was caught,
     * and only because one test reads the config off the mock rather than the
     * screen.
     *
     * A mock cannot see a malformed call. So the config is asserted directly.
     */
    describe('the configuration it hands useSelectionStep', () => {
        function configPassed(): Record<string, unknown> {
            mockUseSelectionStep.mockReturnValue(createMockSelectionStep({}));
            render(
                <Provider theme={defaultTheme}>
                    <AdobeProjectPicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );
            return mockUseSelectionStep.mock.calls[0][0] as Record<string, unknown>;
        }

        it('asks the backend for PROJECTS, and caches them under the projects key', () => {
            const config = configPassed();
            expect(config.messageType).toBe('get-projects');
            expect(config.cacheKey).toBe('projectsCache');
            expect(config.errorMessageType).toBe('project-error');
        });

        it('searches the fields a person would type into — title, name, description', () => {
            expect(configPassed().searchFields).toEqual(['title', 'name', 'description']);
        });

        it('stores the search text under the project search key', () => {
            expect(configPassed().searchFilterKey).toBe('projectSearchFilter');
        });
    });
    const mockUpdateState = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
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
                    <AdobeProjectPicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );

            expect(screen.getByText('Test Project 1')).toBeInTheDocument();
        });

        it('should write adobeProject to state on select', () => {
            mockUseSelectionStep.mockReturnValue(
                createMockSelectionStep({
                    items: mockProjects,
                    filteredItems: mockProjects,
                    hasLoadedOnce: true,
                })
            );

            render(
                <Provider theme={defaultTheme}>
                    <AdobeProjectPicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );

            const onSelect = mockUseSelectionStep.mock.calls[0][0].onSelect;
            onSelect(mockProjects[0]);

            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    adobeProject: expect.objectContaining({
                        id: 'project1',
                        name: 'project-1',
                        title: 'Test Project 1',
                        description: 'First test project',
                        org_id: 'org123',
                    }),
                })
            );
        });

        it('should clear workspace when project selection changes', () => {
            mockUseSelectionStep.mockReturnValue(
                createMockSelectionStep({
                    items: mockProjects,
                    filteredItems: mockProjects,
                    hasLoadedOnce: true,
                })
            );

            render(
                <Provider theme={defaultTheme}>
                    <AdobeProjectPicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );

            const onSelect = mockUseSelectionStep.mock.calls[0][0].onSelect;
            onSelect(mockProjects[0]);

            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    adobeWorkspace: undefined,
                    workspacesCache: undefined, // Cache must also be cleared to trigger reload
                })
            );
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
                    <AdobeProjectPicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );

            const onSelect = mockUseSelectionStep.mock.calls[0][0].onSelect;
            onSelect(mockProjects[0]);

            // Should update state immediately
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    adobeProject: expect.objectContaining({ id: 'project1' }),
                })
            );

            // Should NOT post message (backend call deferred to Continue button)
            expect(mockPostMessage).not.toHaveBeenCalled();
        });
    });

    describe('Loading States', () => {
        it('should show organization name in loading message', () => {
            mockUseSelectionStep.mockReturnValue(
                createMockSelectionStep({
                    isLoading: true,
                    showLoading: true,
                })
            );

            render(
                <Provider theme={defaultTheme}>
                    <AdobeProjectPicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );

            expect(
                screen.getByText(/Fetching from organization: Test Organization/)
            ).toBeInTheDocument();
        });

    });

    describe('Error Handling', () => {
        it('should validate organization before loading', () => {
            const stateWithoutOrg = {
                ...baseState,
                adobeOrg: undefined,
            };

            mockUseSelectionStep.mockReturnValue(createMockSelectionStep());

            render(
                <Provider theme={defaultTheme}>
                    <AdobeProjectPicker
                        state={stateWithoutOrg as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );

            const validateBeforeLoad =
                mockUseSelectionStep.mock.calls[0][0].validateBeforeLoad;
            const result = validateBeforeLoad();

            expect(result.valid).toBe(false);
            expect(result.error).toContain('No organization available');
        });
    });

    describe('Search and Filter', () => {
    });

    describe('Refresh Functionality', () => {
    });
});
