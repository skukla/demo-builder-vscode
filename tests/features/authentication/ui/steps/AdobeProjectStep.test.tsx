import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { AdobeProjectStep } from '@/features/authentication/ui/steps/AdobeProjectStep';
import { WizardState, AdobeProject } from '@/types/webview';
import '@testing-library/jest-dom';

// Mock WebviewClient
const mockPostMessage = jest.fn();
const mockOnMessage = jest.fn();
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: mockPostMessage,
        onMessage: mockOnMessage,
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

import { useSelectionStep } from '@/features/authentication/ui/hooks/useSelectionStep';

const mockUseSelectionStep = useSelectionStep as jest.Mock;

describe('AdobeProjectStep', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();

    const mockProjects: AdobeProject[] = [
        {
            id: 'project1',
            name: 'project-1',
            title: 'Test Project 1',
            description: 'First test project',
            org_id: 'org123',
        },
        {
            id: 'project2',
            name: 'project-2',
            title: 'Test Project 2',
            description: 'Second test project',
            org_id: 'org123',
        },
        {
            id: 'project3',
            name: 'project-3',
            title: 'Test Project 3',
            description: 'Third test project',
            org_id: 'org123',
        },
    ];

    const baseState: Partial<WizardState> = {
        adobeOrg: { id: 'org1', code: 'ORG1', name: 'Test Organization' },
        adobeProject: undefined,
        projectsCache: undefined,
        currentStep: 'adobe-project',
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockOnMessage.mockReturnValue(jest.fn());
    });

    describe('Happy Path - Project Selection', () => {
        it('should render project selection UI', () => {
            mockUseSelectionStep.mockReturnValue({
                items: mockProjects,
                filteredItems: mockProjects,
                isLoading: false,
                showLoading: false,
                isRefreshing: false,
                hasLoadedOnce: true,
                error: null,
                searchQuery: '',
                setSearchQuery: jest.fn(),
                load: jest.fn(),
                refresh: jest.fn(),
                selectItem: jest.fn(),
            });

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
            mockUseSelectionStep.mockReturnValue({
                items: mockProjects,
                filteredItems: mockProjects,
                isLoading: false,
                showLoading: false,
                isRefreshing: false,
                hasLoadedOnce: true,
                error: null,
                searchQuery: '',
                setSearchQuery: jest.fn(),
                load: jest.fn(),
                refresh: jest.fn(),
                selectItem: jest.fn(),
            });

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
            const mockOnSelect = jest.fn();
            mockUseSelectionStep.mockReturnValue({
                items: mockProjects,
                filteredItems: mockProjects,
                isLoading: false,
                showLoading: false,
                isRefreshing: false,
                hasLoadedOnce: true,
                error: null,
                searchQuery: '',
                setSearchQuery: jest.fn(),
                load: jest.fn(),
                refresh: jest.fn(),
                selectItem: jest.fn(),
            });

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

            mockUseSelectionStep.mockReturnValue({
                items: mockProjects,
                filteredItems: mockProjects,
                isLoading: false,
                showLoading: false,
                isRefreshing: false,
                hasLoadedOnce: true,
                error: null,
                searchQuery: '',
                setSearchQuery: jest.fn(),
                load: jest.fn(),
                refresh: jest.fn(),
                selectItem: jest.fn(),
            });

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
            mockUseSelectionStep.mockReturnValue({
                items: mockProjects,
                filteredItems: mockProjects,
                isLoading: false,
                showLoading: false,
                isRefreshing: false,
                hasLoadedOnce: true,
                error: null,
                searchQuery: '',
                setSearchQuery: jest.fn(),
                load: jest.fn(),
                refresh: jest.fn(),
                selectItem: jest.fn(),
            });

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

    describe('Loading States', () => {
        it('should display loading indicator when loading projects', () => {
            mockUseSelectionStep.mockReturnValue({
                items: [],
                filteredItems: [],
                isLoading: true,
                showLoading: true,
                isRefreshing: false,
                hasLoadedOnce: false,
                error: null,
                searchQuery: '',
                setSearchQuery: jest.fn(),
                load: jest.fn(),
                refresh: jest.fn(),
                selectItem: jest.fn(),
            });

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
            mockUseSelectionStep.mockReturnValue({
                items: [],
                filteredItems: [],
                isLoading: true,
                showLoading: true,
                isRefreshing: false,
                hasLoadedOnce: false,
                error: null,
                searchQuery: '',
                setSearchQuery: jest.fn(),
                load: jest.fn(),
                refresh: jest.fn(),
                selectItem: jest.fn(),
            });

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
            mockUseSelectionStep.mockReturnValue({
                items: mockProjects,
                filteredItems: mockProjects,
                isLoading: true,
                showLoading: false,
                isRefreshing: true,
                hasLoadedOnce: true,
                error: null,
                searchQuery: '',
                setSearchQuery: jest.fn(),
                load: jest.fn(),
                refresh: jest.fn(),
                selectItem: jest.fn(),
            });

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
            mockUseSelectionStep.mockReturnValue({
                items: [],
                filteredItems: [],
                isLoading: false,
                showLoading: false,
                isRefreshing: false,
                hasLoadedOnce: false,
                error: 'Failed to load projects',
                searchQuery: '',
                setSearchQuery: jest.fn(),
                load: jest.fn(),
                refresh: jest.fn(),
                selectItem: jest.fn(),
            });

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

        it('should provide retry button on error', () => {
            const mockLoad = jest.fn();
            mockUseSelectionStep.mockReturnValue({
                items: [],
                filteredItems: [],
                isLoading: false,
                showLoading: false,
                isRefreshing: false,
                hasLoadedOnce: false,
                error: 'Failed to load projects',
                searchQuery: '',
                setSearchQuery: jest.fn(),
                load: mockLoad,
                refresh: jest.fn(),
                selectItem: jest.fn(),
            });

            render(
                <Provider theme={defaultTheme}>
                    <AdobeProjectStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            const retryButton = screen.getByText('Try Again');
            fireEvent.click(retryButton);

            expect(mockLoad).toHaveBeenCalled();
        });

        it('should display empty state when no projects available', () => {
            mockUseSelectionStep.mockReturnValue({
                items: [],
                filteredItems: [],
                isLoading: false,
                showLoading: false,
                isRefreshing: false,
                hasLoadedOnce: true,
                error: null,
                searchQuery: '',
                setSearchQuery: jest.fn(),
                load: jest.fn(),
                refresh: jest.fn(),
                selectItem: jest.fn(),
            });

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

            mockUseSelectionStep.mockReturnValue({
                items: [],
                filteredItems: [],
                isLoading: false,
                showLoading: false,
                isRefreshing: false,
                hasLoadedOnce: false,
                error: null,
                searchQuery: '',
                setSearchQuery: jest.fn(),
                load: jest.fn(),
                refresh: jest.fn(),
                selectItem: jest.fn(),
            });

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

    describe('Search and Filter', () => {
        it('should display search field when more than 5 projects', () => {
            const manyProjects = Array.from({ length: 10 }, (_, i) => ({
                id: `project${i}`,
                name: `project-${i}`,
                title: `Test Project ${i}`,
                description: `Project ${i}`,
                org_id: 'org123',
            }));

            mockUseSelectionStep.mockReturnValue({
                items: manyProjects,
                filteredItems: manyProjects,
                isLoading: false,
                showLoading: false,
                isRefreshing: false,
                hasLoadedOnce: true,
                error: null,
                searchQuery: '',
                setSearchQuery: jest.fn(),
                load: jest.fn(),
                refresh: jest.fn(),
                selectItem: jest.fn(),
            });

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
            mockUseSelectionStep.mockReturnValue({
                items: mockProjects,
                filteredItems: [mockProjects[0]], // Filtered to one project
                isLoading: false,
                showLoading: false,
                isRefreshing: false,
                hasLoadedOnce: true,
                error: null,
                searchQuery: 'Project 1',
                setSearchQuery: mockSetSearchQuery,
                load: jest.fn(),
                refresh: jest.fn(),
                selectItem: jest.fn(),
            });

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
            mockUseSelectionStep.mockReturnValue({
                items: mockProjects,
                filteredItems: [], // No matches
                isLoading: false,
                showLoading: false,
                isRefreshing: false,
                hasLoadedOnce: true,
                error: null,
                searchQuery: 'nonexistent',
                setSearchQuery: mockSetSearchQuery,
                load: jest.fn(),
                refresh: jest.fn(),
                selectItem: jest.fn(),
            });

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
            mockUseSelectionStep.mockReturnValue({
                items: mockProjects,
                filteredItems: mockProjects,
                isLoading: false,
                showLoading: false,
                isRefreshing: false,
                hasLoadedOnce: true,
                error: null,
                searchQuery: '',
                setSearchQuery: jest.fn(),
                load: jest.fn(),
                refresh: jest.fn(),
                selectItem: jest.fn(),
            });

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

        it('should call refresh when refresh button is clicked', () => {
            const mockRefresh = jest.fn();
            mockUseSelectionStep.mockReturnValue({
                items: mockProjects,
                filteredItems: mockProjects,
                isLoading: false,
                showLoading: false,
                isRefreshing: false,
                hasLoadedOnce: true,
                error: null,
                searchQuery: '',
                setSearchQuery: jest.fn(),
                load: jest.fn(),
                refresh: mockRefresh,
                selectItem: jest.fn(),
            });

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
            fireEvent.click(refreshButton);

            expect(mockRefresh).toHaveBeenCalled();
        });
    });

    describe('Two-Column Layout', () => {
        it('should display configuration summary panel', () => {
            mockUseSelectionStep.mockReturnValue({
                items: mockProjects,
                filteredItems: mockProjects,
                isLoading: false,
                showLoading: false,
                isRefreshing: false,
                hasLoadedOnce: true,
                error: null,
                searchQuery: '',
                setSearchQuery: jest.fn(),
                load: jest.fn(),
                refresh: jest.fn(),
                selectItem: jest.fn(),
            });

            render(
                <Provider theme={defaultTheme}>
                    <AdobeProjectStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            expect(screen.getByTestId('config-summary')).toBeInTheDocument();
        });
    });

    describe('Backend Call on Continue Pattern', () => {
        it('should update state immediately without backend call', () => {
            mockUseSelectionStep.mockReturnValue({
                items: mockProjects,
                filteredItems: mockProjects,
                isLoading: false,
                showLoading: false,
                isRefreshing: false,
                hasLoadedOnce: true,
                error: null,
                searchQuery: '',
                setSearchQuery: jest.fn(),
                load: jest.fn(),
                refresh: jest.fn(),
                selectItem: jest.fn(),
            });

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
