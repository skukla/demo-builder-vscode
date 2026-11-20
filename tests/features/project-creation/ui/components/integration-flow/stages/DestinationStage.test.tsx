/**
 * DestinationStage Tests (Add Integration flow — guided destination stage)
 *
 * The AdobeIoStep body RELOCATED into the modal journey: one stage rendering the
 * view the stage machine asks for ('signin' | 'project' | 'workspace').
 * Pendings are MODAL-LOCAL DRAFT props (pendingProject / pendingWorkspace fed back via
 * onPendingProject / onPendingWorkspace) — the stage never writes wizard pendings itself.
 * A list's New hands up to onNew: the create window is the modal's
 * (AddIntegrationFlowModal.create.test.tsx), so nothing here creates.
 *
 * AdobeAuthStep + the entity fields are mocked to sentinels exposing the props under
 * test (no real fetch fires).
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
// The summary view was removed with the dest-summary stage: a committed
// destination is now a context LINE in AddIntegrationFlowModal (covered by
// AddIntegrationFlowModal.later-and-variants).
import { DestinationStage } from '@/features/project-creation/ui/components/integration-flow/stages/DestinationStage';
import type { WizardState } from '@/types/webview';

// --- mocks -----------------------------------------------------------------
jest.mock('@/features/authentication/ui/steps/AdobeAuthStep', () => ({
    AdobeAuthStep: ({ onOutcome }: { onOutcome?: unknown }) => (
        <div data-testid="adobe-auth-step" data-reports={String(typeof onOutcome === 'function')}>Adobe Auth Step</div>
    ),
}));

jest.mock('@/features/authentication/ui/components/AdobeEntityFields', () => ({
    AdobeProjectField: ({
        selectedProjectId,
        onProjectSelect,
        onNew,
        dialogHost,
    }: {
        dialogHost?: { onOutcome: unknown; onSignIn?: unknown };
        selectedProjectId?: string;
        onProjectSelect?: (p: { id: string; name: string; title?: string }) => void;
        onNew: () => void;
    }) => (
        <div
            data-testid="project-field"
            data-reports={String(typeof dialogHost?.onOutcome === 'function')}
            data-signs-in={String(typeof dialogHost?.onSignIn === 'function')}
            data-selected={selectedProjectId ?? ''}
        >
            <button
                type="button"
                onClick={() =>
                    onProjectSelect?.({ id: 'p-picked', name: 'picked', title: 'Picked Project' })
                }
            >
                pick-project
            </button>
            <button type="button" onClick={onNew}>
                new-project
            </button>
        </div>
    ),
    AdobeWorkspaceField: ({
        selectedWorkspaceId,
        onWorkspaceSelect,
        onNew,
        dialogHost,
    }: {
        dialogHost?: { onOutcome: unknown };
        selectedWorkspaceId?: string;
        onWorkspaceSelect?: (ws: { id: string; name: string; title?: string }) => void;
        onNew: () => void;
    }) => (
        <div
            data-testid="workspace-field"
            data-reports={String(typeof dialogHost?.onOutcome === 'function')}
            data-selected={selectedWorkspaceId ?? ''}
        >
            <button
                type="button"
                onClick={() =>
                    onWorkspaceSelect?.({ id: 'w-picked', name: 'Stage', title: 'Stage' })
                }
            >
                pick-ws
            </button>
            <button type="button" onClick={onNew}>
                new-workspace
            </button>
        </div>
    ),
}));

// --- helpers ---------------------------------------------------------------
const PROJECT = { id: 'p1', name: 'proj', title: 'Demo Project' };
/** Shape only — the summary view that consumed the value is gone. */
type Workspace = { id: string; name: string; title: string };

type View = 'signin' | 'project' | 'workspace';

interface StageOverrides {
    state?: Partial<WizardState>;
    pendingProject?: typeof PROJECT;
    pendingWorkspace?: Workspace;
}

function renderStage(view: View, overrides: StageOverrides = {}) {
    const updateState = jest.fn();
    const onPendingProject = jest.fn();
    const onPendingWorkspace = jest.fn();
    const onNew = jest.fn();
    const onOutcome = jest.fn();
    const onSignIn = jest.fn(async () => undefined);
    render(
        <Provider theme={defaultTheme} colorScheme="light">
            <DestinationStage
                state={(overrides.state ?? {}) as WizardState}
                updateState={updateState}
                view={view}
                pendingProject={overrides.pendingProject}
                pendingWorkspace={overrides.pendingWorkspace}
                onPendingProject={onPendingProject}
                onPendingWorkspace={onPendingWorkspace}
                onNew={onNew}
                onOutcome={onOutcome}
                onWaiting={jest.fn()}
                onSignIn={onSignIn}
            />
        </Provider>
    );
    return {
        updateState,
        onPendingProject,
        onPendingWorkspace,
        onNew,
        onOutcome,
    };
}

describe('DestinationStage', () => {
    describe('signin view', () => {
        it('renders the inline auth gate and no pickers', () => {
            renderStage('signin');
            expect(screen.getByTestId('adobe-auth-step')).toBeInTheDocument();
            // Its outcome is the dialog's title, not the whole-screen view the wizard draws.
            expect(screen.getByTestId('adobe-auth-step')).toHaveAttribute('data-reports', 'true');
            expect(screen.queryByTestId('project-field')).not.toBeInTheDocument();
            expect(screen.queryByTestId('workspace-field')).not.toBeInTheDocument();
        });
    });

    describe('project view', () => {
        it('renders the project field (idle) and no workspace field', () => {
            renderStage('project');
            expect(screen.getByTestId('project-field')).toBeInTheDocument();
            expect(screen.queryByTestId('workspace-field')).not.toBeInTheDocument();
        });

        it('highlights the DRAFT pendingProject (not any committed project)', () => {
            renderStage('project', {
                state: { adobeProject: PROJECT },
                pendingProject: { id: 'p-draft', name: 'draft', title: 'Draft' },
            });
            expect(screen.getByTestId('project-field')).toHaveAttribute('data-selected', 'p-draft');
        });

        it('picking a project feeds onPendingProject and does NOT write wizard state', () => {
            const { onPendingProject, updateState } = renderStage('project');
            fireEvent.click(screen.getByRole('button', { name: 'pick-project' }));
            expect(onPendingProject).toHaveBeenCalledWith({
                id: 'p-picked',
                name: 'picked',
                title: 'Picked Project',
            });
            expect(updateState).not.toHaveBeenCalled();
        });

        it('New asks for the project create window', () => {
            const { onNew, updateState } = renderStage('project');
            fireEvent.click(screen.getByRole('button', { name: 'new-project' }));
            expect(onNew).toHaveBeenCalledWith('project');
            expect(updateState).not.toHaveBeenCalled();
        });

        it('tells the field which dialog it sits in, so its own outcomes reach the title', () => {
            renderStage('project');
            expect(screen.getByTestId('project-field')).toHaveAttribute('data-reports', 'true');
            expect(screen.getByTestId('project-field')).toHaveAttribute('data-signs-in', 'true');
        });
    });

    describe('workspace view', () => {
        it('renders the workspace field highlighting the DRAFT pendingWorkspace', () => {
            renderStage('workspace', {
                pendingWorkspace: { id: 'w-draft', name: 'Stage', title: 'Stage' },
            });
            const field = screen.getByTestId('workspace-field');
            expect(field).toBeInTheDocument();
            expect(field).toHaveAttribute('data-selected', 'w-draft');
            expect(screen.queryByTestId('project-field')).not.toBeInTheDocument();
        });

        it('picking a workspace feeds onPendingWorkspace and does NOT write wizard state', () => {
            const { onPendingWorkspace, updateState } = renderStage('workspace');
            fireEvent.click(screen.getByRole('button', { name: 'pick-ws' }));
            expect(onPendingWorkspace).toHaveBeenCalledWith({
                id: 'w-picked',
                name: 'Stage',
                title: 'Stage',
            });
            expect(updateState).not.toHaveBeenCalled();
        });

        it('New asks for the workspace create window', () => {
            const { onNew } = renderStage('workspace');
            fireEvent.click(screen.getByRole('button', { name: 'new-workspace' }));
            expect(onNew).toHaveBeenCalledWith('workspace');
        });

        it('tells the field which dialog it sits in', () => {
            renderStage('workspace');
            expect(screen.getByTestId('workspace-field')).toHaveAttribute('data-reports', 'true');
        });
    });
});
