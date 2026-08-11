import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { AdobeProjectPicker } from '@/features/authentication/ui/components/AdobeProjectPicker';
import { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';
import {
    mockProjects,
    baseState,
    createMockSelectionStep,
    createManyProjects,
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
jest.mock('@/core/ui/hooks', () => ({
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

import { useSelectionStep } from '@/core/ui/hooks';

const mockUseSelectionStep = useSelectionStep as jest.Mock;

describe('AdobeProjectPicker', () => {
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
                    <AdobeProjectPicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );

            expect(screen.getByText('Test Project 1')).toBeInTheDocument();
            expect(screen.getByText('Test Project 2')).toBeInTheDocument();
            expect(screen.getByText('Test Project 3')).toBeInTheDocument();
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
        it('should display loading indicator when loading projects', () => {
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
                    <AdobeProjectPicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );

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
                    <AdobeProjectPicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );

            expect(screen.getByText('Error Loading Projects')).toBeInTheDocument();
            expect(screen.getByText('Failed to load projects')).toBeInTheDocument();
        });

        it('should provide retry button on error', () => {
            const mockLoad = jest.fn();
            mockUseSelectionStep.mockReturnValue(
                createMockSelectionStep({
                    error: 'Failed to load projects',
                    load: mockLoad,
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

            fireEvent.click(screen.getByText('Try Again'));

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
                    <AdobeProjectPicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
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
                    <AdobeProjectPicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );

            expect(screen.getByPlaceholderText('Type to filter projects...')).toBeInTheDocument();
        });

        it('should filter projects based on search query', () => {
            mockUseSelectionStep.mockReturnValue(
                createMockSelectionStep({
                    items: mockProjects,
                    filteredItems: [mockProjects[0]], // Filtered to one project
                    hasLoadedOnce: true,
                    searchQuery: 'Project 1',
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

            expect(screen.getByText('Showing 1 of 3 projects')).toBeInTheDocument();
        });

        it('should show no results message when search returns empty', () => {
            mockUseSelectionStep.mockReturnValue(
                createMockSelectionStep({
                    items: mockProjects,
                    filteredItems: [], // No matches
                    hasLoadedOnce: true,
                    searchQuery: 'nonexistent',
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
                    <AdobeProjectPicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );

            expect(screen.getByLabelText('Refresh projects')).toBeInTheDocument();
        });

        it('should call refresh when refresh button is clicked', () => {
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
                    <AdobeProjectPicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );

            fireEvent.click(screen.getByLabelText('Refresh projects'));

            expect(mockRefresh).toHaveBeenCalled();
        });
    });
});
