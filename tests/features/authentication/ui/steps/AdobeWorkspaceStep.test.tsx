import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { AdobeWorkspaceStep } from '@/features/authentication/ui/steps/AdobeWorkspaceStep';
import { WizardState, Workspace } from '@/types/webview';
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
    LoadingDisplay: ({ message }: { message: string }) => (
        <div data-testid="loading-display">{message}</div>
    ),
}));

// Mock FadeTransition component
jest.mock('@/core/ui/components/ui/FadeTransition', () => ({
    FadeTransition: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { useSelectionStep } from '@/features/authentication/ui/hooks/useSelectionStep';

const mockUseSelectionStep = useSelectionStep as jest.Mock;

describe('AdobeWorkspaceStep', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();

    const mockWorkspaces: Workspace[] = [
        {
            id: 'workspace1',
            name: 'Stage',
            title: 'Stage Environment',
        },
        {
            id: 'workspace2',
            name: 'Production',
            title: 'Production Environment',
        },
        {
            id: 'workspace3',
            name: 'Development',
            title: 'Development Environment',
        },
    ];

    const baseState: Partial<WizardState> = {
        adobeOrg: { id: 'org1', code: 'ORG1', name: 'Test Organization' },
        adobeProject: {
            id: 'project1',
            name: 'test-project',
            title: 'Test Project',
            description: 'Test Description',
            org_id: 'org123',
        },
        adobeWorkspace: undefined,
        workspacesCache: undefined,
        currentStep: 'adobe-workspace',
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockOnMessage.mockReturnValue(jest.fn());
    });

    describe('Happy Path - Workspace Selection', () => {
        it('should render workspace selection UI', () => {
            mockUseSelectionStep.mockReturnValue({
                items: mockWorkspaces,
                filteredItems: mockWorkspaces,
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
                    <AdobeWorkspaceStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            expect(screen.getByText('Select Workspace')).toBeInTheDocument();
        });

        it('should display all workspaces in list', () => {
            mockUseSelectionStep.mockReturnValue({
                items: mockWorkspaces,
                filteredItems: mockWorkspaces,
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
                    <AdobeWorkspaceStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            expect(screen.getByText('Stage')).toBeInTheDocument();
            expect(screen.getByText('Production')).toBeInTheDocument();
            expect(screen.getByText('Development')).toBeInTheDocument();
        });

        it('should auto-select "Stage" workspace when available', () => {
            const mockOnSelect = jest.fn();
            mockUseSelectionStep.mockReturnValue({
                items: mockWorkspaces,
                filteredItems: mockWorkspaces,
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
                    <AdobeWorkspaceStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            // Verify autoSelectCustom was provided to find "Stage"
            const useSelectionStepCall = mockUseSelectionStep.mock.calls[0][0];
            const autoSelectCustom = useSelectionStepCall.autoSelectCustom;
            const selected = autoSelectCustom(mockWorkspaces);

            expect(selected?.name).toBe('Stage');
        });

        it('should enable proceed when workspace is selected', () => {
            const stateWithWorkspace = {
                ...baseState,
                adobeWorkspace: mockWorkspaces[0],
            };

            mockUseSelectionStep.mockReturnValue({
                items: mockWorkspaces,
                filteredItems: mockWorkspaces,
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
                    <AdobeWorkspaceStep
                        state={stateWithWorkspace as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });

        it('should disable proceed when no workspace is selected', () => {
            mockUseSelectionStep.mockReturnValue({
                items: mockWorkspaces,
                filteredItems: mockWorkspaces,
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
                    <AdobeWorkspaceStep
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
        it('should display loading indicator when loading workspaces', () => {
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
            mockUseSelectionStep.mockReturnValue({
                items: mockWorkspaces,
                filteredItems: mockWorkspaces,
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
            mockUseSelectionStep.mockReturnValue({
                items: [],
                filteredItems: [],
                isLoading: false,
                showLoading: false,
                isRefreshing: false,
                hasLoadedOnce: false,
                error: 'Failed to load workspaces',
                searchQuery: '',
                setSearchQuery: jest.fn(),
                load: jest.fn(),
                refresh: jest.fn(),
                selectItem: jest.fn(),
            });

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

        it('should provide retry button on error', () => {
            const mockLoad = jest.fn();
            mockUseSelectionStep.mockReturnValue({
                items: [],
                filteredItems: [],
                isLoading: false,
                showLoading: false,
                isRefreshing: false,
                hasLoadedOnce: false,
                error: 'Failed to load workspaces',
                searchQuery: '',
                setSearchQuery: jest.fn(),
                load: mockLoad,
                refresh: jest.fn(),
                selectItem: jest.fn(),
            });

            render(
                <Provider theme={defaultTheme}>
                    <AdobeWorkspaceStep
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

        it('should display empty state when no workspaces available', () => {
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
            const stateWithoutProject = {
                ...baseState,
                adobeProject: undefined,
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

    describe('Search and Filter', () => {
        it('should filter workspaces based on search query', () => {
            const mockSetSearchQuery = jest.fn();
            mockUseSelectionStep.mockReturnValue({
                items: mockWorkspaces,
                filteredItems: [mockWorkspaces[0]], // Filtered to "Stage"
                isLoading: false,
                showLoading: false,
                isRefreshing: false,
                hasLoadedOnce: true,
                error: null,
                searchQuery: 'Stage',
                setSearchQuery: mockSetSearchQuery,
                load: jest.fn(),
                refresh: jest.fn(),
                selectItem: jest.fn(),
            });

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
            const manyWorkspaces = Array.from({ length: 10 }, (_, i) => ({
                id: `workspace${i}`,
                name: `Workspace ${i}`,
                title: `Workspace ${i}`,
            }));

            mockUseSelectionStep.mockReturnValue({
                items: manyWorkspaces,
                filteredItems: manyWorkspaces,
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
            mockUseSelectionStep.mockReturnValue({
                items: mockWorkspaces,
                filteredItems: mockWorkspaces,
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

        it('should call refresh when refresh button is clicked', () => {
            const mockRefresh = jest.fn();
            mockUseSelectionStep.mockReturnValue({
                items: mockWorkspaces,
                filteredItems: mockWorkspaces,
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
                    <AdobeWorkspaceStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            const refreshButton = screen.getByLabelText('Refresh workspaces');
            fireEvent.click(refreshButton);

            expect(mockRefresh).toHaveBeenCalled();
        });
    });

    describe('Backend Call on Continue Pattern', () => {
        it('should update state immediately without backend call', () => {
            mockUseSelectionStep.mockReturnValue({
                items: mockWorkspaces,
                filteredItems: mockWorkspaces,
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
                    <AdobeWorkspaceStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            // Get the onSelect callback from useSelectionStep
            const useSelectionStepCall = mockUseSelectionStep.mock.calls[0][0];
            const onSelect = useSelectionStepCall.onSelect;

            // Simulate selecting a workspace
            onSelect(mockWorkspaces[0]);

            // Should update state immediately
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    adobeWorkspace: expect.objectContaining({
                        id: 'workspace1',
                        name: 'Stage',
                    }),
                })
            );

            // Should NOT post message (backend call deferred to Continue button)
            expect(mockPostMessage).not.toHaveBeenCalled();
        });
    });

    describe('Two-Column Layout', () => {
        it('should display configuration summary panel', () => {
            mockUseSelectionStep.mockReturnValue({
                items: mockWorkspaces,
                filteredItems: mockWorkspaces,
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
                    <AdobeWorkspaceStep
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        setCanProceed={mockSetCanProceed}
                    />
                </Provider>
            );

            expect(screen.getByTestId('config-summary')).toBeInTheDocument();
        });
    });
});
