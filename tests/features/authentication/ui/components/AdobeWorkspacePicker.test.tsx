import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { AdobeWorkspacePicker } from '@/features/authentication/ui/components/AdobeWorkspacePicker';
import { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';

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
    LoadingDisplay: ({ message }: { message: string }) => (
        <div data-testid="loading-display">{message}</div>
    ),
}));

// Mock FadeTransition component
jest.mock('@/core/ui/components/ui/FadeTransition', () => ({
    FadeTransition: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { useSelectionStep } from '@/core/ui/hooks';
import {
    mockWorkspaces,
    baseState,
    createMockUseSelectionStepReturn,
    createStateWithoutProject,
    createManyWorkspaces,
} from './AdobeWorkspacePicker.testUtils';

const mockUseSelectionStep = useSelectionStep as jest.Mock;

describe('AdobeWorkspacePicker', () => {
    const mockUpdateState = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Auto-select suppression (Change workspace)', () => {
        it('auto-selects Stage by default (autoSelectSingle on, Stage finder present)', () => {
            mockUseSelectionStep.mockReturnValue(createMockUseSelectionStepReturn());
            render(
                <Provider theme={defaultTheme}>
                    <AdobeWorkspacePicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );
            const config = mockUseSelectionStep.mock.calls[0][0];
            expect(config.autoSelectSingle).toBe(true);
            expect(config.autoSelectCustom).toBeInstanceOf(Function);
        });

        it('disables auto-select when suppressAutoSelect is set', () => {
            mockUseSelectionStep.mockReturnValue(createMockUseSelectionStepReturn());
            render(
                <Provider theme={defaultTheme}>
                    <AdobeWorkspacePicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        suppressAutoSelect
                    />
                </Provider>
            );
            const config = mockUseSelectionStep.mock.calls[0][0];
            expect(config.autoSelectSingle).toBe(false);
            expect(config.autoSelectCustom).toBeUndefined();
        });
    });

    describe('Pending-default overrides (Adobe I/O sub-step)', () => {
        it('onWorkspaceSelect overrides the default commit — writes NOTHING to adobeWorkspace', () => {
            mockUseSelectionStep.mockReturnValue(createMockUseSelectionStepReturn());
            const onWorkspaceSelect = jest.fn();
            render(
                <Provider theme={defaultTheme}>
                    <AdobeWorkspacePicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        onWorkspaceSelect={onWorkspaceSelect}
                    />
                </Provider>
            );

            const onSelect = mockUseSelectionStep.mock.calls[0][0].onSelect;
            onSelect(mockWorkspaces[1]);

            expect(onWorkspaceSelect).toHaveBeenCalledWith({
                id: 'workspace2',
                name: 'Production',
                title: 'Production Environment',
            });
            expect(mockUpdateState).not.toHaveBeenCalled();
        });

        it('selectedWorkspaceId overrides the highlighted row (not state.adobeWorkspace)', () => {
            mockUseSelectionStep.mockReturnValue(createMockUseSelectionStepReturn());
            render(
                <Provider theme={defaultTheme}>
                    <AdobeWorkspacePicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                        selectedWorkspaceId="workspace2"
                    />
                </Provider>
            );

            const selected = screen
                .getAllByRole('gridcell')
                .filter((r) => r.getAttribute('aria-selected') === 'true');
            expect(selected).toHaveLength(1);
            expect(selected[0]).toHaveTextContent('Production');
        });

        it('without the overrides, the default commit + highlight hold', () => {
            mockUseSelectionStep.mockReturnValue(createMockUseSelectionStepReturn());
            render(
                <Provider theme={defaultTheme}>
                    <AdobeWorkspacePicker
                        state={
                            { ...baseState, adobeWorkspace: mockWorkspaces[0] } as WizardState
                        }
                        updateState={mockUpdateState}
                    />
                </Provider>
            );

            const onSelect = mockUseSelectionStep.mock.calls[0][0].onSelect;
            onSelect(mockWorkspaces[1]);
            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    adobeWorkspace: expect.objectContaining({ id: 'workspace2' }),
                })
            );
            const selected = screen
                .getAllByRole('gridcell')
                .filter((r) => r.getAttribute('aria-selected') === 'true');
            expect(selected[0]).toHaveTextContent('Stage');
        });
    });

    describe('Happy Path - Workspace Selection', () => {
        it('should render workspace selection UI', () => {
            mockUseSelectionStep.mockReturnValue(createMockUseSelectionStepReturn());

            render(
                <Provider theme={defaultTheme}>
                    <AdobeWorkspacePicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );

            expect(screen.getByRole('grid', { name: /workspaces/i })).toBeInTheDocument();
        });

        it('should display all workspaces in list', async () => {
            mockUseSelectionStep.mockReturnValue(createMockUseSelectionStepReturn());

            render(
                <Provider theme={defaultTheme}>
                    <AdobeWorkspacePicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );

            expect(await screen.findByText('Stage')).toBeInTheDocument();
            expect(screen.getByText('Production')).toBeInTheDocument();
            expect(screen.getByText('Development')).toBeInTheDocument();
        });

        it('should write adobeWorkspace to state on select', () => {
            mockUseSelectionStep.mockReturnValue(createMockUseSelectionStepReturn());

            render(
                <Provider theme={defaultTheme}>
                    <AdobeWorkspacePicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );

            const onSelect = mockUseSelectionStep.mock.calls[0][0].onSelect;
            onSelect(mockWorkspaces[0]);

            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    adobeWorkspace: expect.objectContaining({
                        id: 'workspace1',
                        name: 'Stage',
                        title: 'Stage Environment',
                    }),
                })
            );
        });

        it('should auto-select "Stage" workspace when available', () => {
            mockUseSelectionStep.mockReturnValue(createMockUseSelectionStepReturn());

            render(
                <Provider theme={defaultTheme}>
                    <AdobeWorkspacePicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );

            const autoSelectCustom = mockUseSelectionStep.mock.calls[0][0].autoSelectCustom;
            const selected = autoSelectCustom(mockWorkspaces);

            expect(selected?.name).toBe('Stage');
        });
    });

    describe('Backend Call on Continue Pattern', () => {
        it('should update state immediately without backend call', () => {
            mockUseSelectionStep.mockReturnValue(createMockUseSelectionStepReturn());

            render(
                <Provider theme={defaultTheme}>
                    <AdobeWorkspacePicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );

            const onSelect = mockUseSelectionStep.mock.calls[0][0].onSelect;
            onSelect(mockWorkspaces[0]);

            expect(mockUpdateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    adobeWorkspace: expect.objectContaining({ id: 'workspace1' }),
                })
            );

            // Should NOT post message (backend call deferred to Continue button)
            expect(mockPostMessage).not.toHaveBeenCalled();
        });
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
                    <AdobeWorkspacePicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
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
                    <AdobeWorkspacePicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );

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
                    <AdobeWorkspacePicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );

            expect(screen.getByText('Error Loading Workspaces')).toBeInTheDocument();
            expect(screen.getByText('Failed to load workspaces')).toBeInTheDocument();
        });

        it('should provide retry button on error', () => {
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
                    <AdobeWorkspacePicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );

            fireEvent.click(screen.getByText('Try Again'));

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
                    <AdobeWorkspacePicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );

            expect(screen.getByText('No Workspaces Found')).toBeInTheDocument();
            expect(
                screen.getByText(/create a workspace in Adobe Console first/)
            ).toBeInTheDocument();
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
                    <AdobeWorkspacePicker
                        state={stateWithoutProject as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );

            const validateBeforeLoad =
                mockUseSelectionStep.mock.calls[0][0].validateBeforeLoad;
            const result = validateBeforeLoad();

            expect(result.valid).toBe(false);
            expect(result.error).toContain('No project selected');
        });
    });

    describe('Search and Filter', () => {
        it('should filter workspaces based on search query', () => {
            mockUseSelectionStep.mockReturnValue(
                createMockUseSelectionStepReturn({
                    filteredItems: [mockWorkspaces[0]], // Filtered to "Stage"
                    searchQuery: 'Stage',
                })
            );

            render(
                <Provider theme={defaultTheme}>
                    <AdobeWorkspacePicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );

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
                    <AdobeWorkspacePicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
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
                    <AdobeWorkspacePicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );

            expect(screen.getByLabelText('Refresh workspaces')).toBeInTheDocument();
        });

        it('should call refresh when refresh button is clicked', () => {
            const mockRefresh = jest.fn();
            mockUseSelectionStep.mockReturnValue(
                createMockUseSelectionStepReturn({
                    refresh: mockRefresh,
                })
            );

            render(
                <Provider theme={defaultTheme}>
                    <AdobeWorkspacePicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );

            fireEvent.click(screen.getByLabelText('Refresh workspaces'));

            expect(mockRefresh).toHaveBeenCalled();
        });
    });
});
