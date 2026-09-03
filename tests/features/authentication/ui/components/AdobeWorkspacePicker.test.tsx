import { render, screen } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { AdobeWorkspacePicker } from '@/features/authentication/ui/components/AdobeWorkspacePicker';
import type { WizardState, Workspace } from '@/types/webview';
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
jest.mock('@/core/ui/hooks/useSelectionStep', () => ({
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

import { useSelectionStep } from '@/core/ui/hooks/useSelectionStep';
import {
    mockWorkspaces,
    baseState,
    createMockUseSelectionStepReturn,
    createStateWithoutProject,
} from './AdobeWorkspacePicker.testUtils';

const mockUseSelectionStep = useSelectionStep as jest.Mock;

describe('AdobeWorkspacePicker', () => {

    /**
     * WHAT THE PICKER HANDS THE HOOK. See the twin block in
     * AdobeProjectPicker.test.tsx for the measurement that prompted these: with
     * `useSelectionStep` mocked, every test that asserts the SCREEN is asserting
     * what the mock was told to return, so a picker asking the backend for the
     * wrong entity passed its whole suite.
     */
    describe('the configuration it hands useSelectionStep', () => {
        function configPassed(state = baseState): Record<string, unknown> {
            mockUseSelectionStep.mockReturnValue(createMockUseSelectionStepReturn({}));
            render(
                <Provider theme={defaultTheme}>
                    <AdobeWorkspacePicker
                        state={state as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );
            return mockUseSelectionStep.mock.calls[0][0] as Record<string, unknown>;
        }

        it('asks the backend for WORKSPACES, and caches them under the workspaces key', () => {
            const config = configPassed();
            expect(config.messageType).toBe('get-workspaces');
            expect(config.cacheKey).toBe('workspacesCache');
            expect(config.errorMessageType).toBe('workspace-error');
        });

        it('threads the selected org and project so the backend targets THEM', () => {
            // Not cached — threaded per request. A stale in-memory cache would
            // otherwise decide which project's workspaces come back.
            expect(configPassed().messagePayload).toEqual({
                orgId: baseState.adobeOrg?.id,
                projectId: baseState.adobeProject?.id,
            });
        });

        it('searches title and name', () => {
            expect(configPassed().searchFields).toEqual(['title', 'name']);
        });

        it('threads an undefined orgId when no org is selected, rather than throwing', () => {
            // The Add-Integration flow can mount this picker before an org is chosen.
            const config = configPassed({ ...baseState, adobeOrg: undefined });
            expect(config.messagePayload).toEqual({ orgId: undefined, projectId: 'project1' });
        });

        it('lets the load proceed once a project is selected', () => {
            const validateBeforeLoad = configPassed().validateBeforeLoad as () => unknown;
            expect(validateBeforeLoad()).toEqual({ valid: true });
        });
    });

    /**
     * The Stage finder is handed to the hook and called by IT, so the only way to
     * pin what it decides is to call it with lists that differ in one respect each.
     * The fixture list has Stage FIRST, which is why "returns the first item" passed
     * as "finds Stage" until these were written.
     */
    describe('the Stage finder it hands useSelectionStep', () => {
        function stageFinder(): (items: Workspace[]) => Workspace | undefined {
            mockUseSelectionStep.mockReturnValue(createMockUseSelectionStepReturn({}));
            render(
                <Provider theme={defaultTheme}>
                    <AdobeWorkspacePicker
                        state={baseState as WizardState}
                        updateState={mockUpdateState}
                    />
                </Provider>
            );
            return mockUseSelectionStep.mock.calls[0][0].autoSelectCustom;
        }

        it('finds Stage wherever it sits in the list', () => {
            const [stage, production, development] = mockWorkspaces;
            expect(stageFinder()([production, development, stage])?.id).toBe('workspace1');
        });

        it('finds nothing when no workspace mentions stage', () => {
            const [, production, development] = mockWorkspaces;
            expect(stageFinder()([production, development])).toBeUndefined();
        });

        it('matches on the name alone', () => {
            const byName: Workspace = { id: 'w', name: 'stage-eu', title: 'Pre-Production' };
            expect(stageFinder()([mockWorkspaces[1], byName])?.id).toBe('w');
        });

        it('matches on the title alone', () => {
            const byTitle: Workspace = { id: 'w', name: 'ws-2', title: 'Stage Environment' };
            expect(stageFinder()([mockWorkspaces[1], byTitle])?.id).toBe('w');
        });

        it('matches regardless of case, and tolerates a workspace with no title', () => {
            const untitled: Workspace = { id: 'p', name: 'Production' };
            const shouting: Workspace = { id: 'w', name: 'STAGE' };
            expect(stageFinder()([untitled, shouting])?.id).toBe('w');
        });
    });
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
    });

    describe('Error Handling', () => {
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
    });

    describe('Refresh Functionality', () => {
    });
});
