/**
 * DestinationStage Tests (Add Integration flow — guided destination stage)
 *
 * The AdobeIoStep body RELOCATED into the modal journey: one stage rendering the
 * view the stage machine asks for ('signin' | 'project' | 'workspace' | 'summary').
 * Pendings are MODAL-LOCAL DRAFT props (pendingProject / pendingWorkspace fed back via
 * onPendingProject / onPendingWorkspace) — the stage never writes wizard pendings itself.
 * It reuses useProjectCreationPhases({ skipEnabling: true }) for the create flow's
 * spinner / failed-with-Retry views, exactly like AdobeIoStep did.
 *
 * The phase hook is mocked so each phase view is drivable; AdobeAuthStep + the entity
 * fields are mocked to sentinels exposing the props under test (no real fetch fires).
 *
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
const phasesMock = jest.fn();
jest.mock('@/features/project-creation/ui/hooks/useProjectCreationPhases', () => ({
    useProjectCreationPhases: (...args: unknown[]) => phasesMock(...args),
}));

jest.mock('@/features/authentication/ui/steps/AdobeAuthStep', () => ({
    AdobeAuthStep: () => <div data-testid="adobe-auth-step">Adobe Auth Step</div>,
}));
jest.mock('@/features/authentication/ui/components/AdobeEntityFields', () => ({
    AdobeProjectField: ({
        onCreateFlow,
        createError,
        initialCreateName,
        selectedProjectId,
        onProjectSelect,
    }: {
        onCreateFlow?: (name: string) => void;
        createError?: string;
        initialCreateName?: string;
        selectedProjectId?: string;
        onProjectSelect?: (p: { id: string; name: string; title?: string }) => void;
    }) => (
        <div
            data-testid="project-field"
            data-selected={selectedProjectId ?? ''}
            data-create-error={createError ?? ''}
            data-initial-name={initialCreateName ?? ''}
        >
            <button
                type="button"
                onClick={() =>
                    onProjectSelect?.({ id: 'p-picked', name: 'picked', title: 'Picked Project' })
                }
            >
                pick-project
            </button>
            <button type="button" onClick={() => onCreateFlow?.('typed-name')}>
                create-project
            </button>
        </div>
    ),
    AdobeWorkspaceField: ({
        selectedWorkspaceId,
        onWorkspaceSelect,
    }: {
        selectedWorkspaceId?: string;
        onWorkspaceSelect?: (ws: { id: string; name: string; title?: string }) => void;
    }) => (
        <div data-testid="workspace-field" data-selected={selectedWorkspaceId ?? ''}>
            <button
                type="button"
                onClick={() =>
                    onWorkspaceSelect?.({ id: 'w-picked', name: 'Stage', title: 'Stage' })
                }
            >
                pick-ws
            </button>
        </div>
    ),
}));

// --- helpers ---------------------------------------------------------------
interface PhaseOverrides {
    phase?: string;
    phaseMessage?: string;
    phaseSubMessage?: string;
    error?: string;
    failedPhase?: string;
    projectName?: string;
    start?: jest.Mock;
    retry?: jest.Mock;
    reset?: jest.Mock;
}

function setPhases(overrides: PhaseOverrides = {}) {
    const value = {
        phase: 'idle',
        phaseMessage: undefined,
        phaseSubMessage: undefined,
        error: undefined,
        failedPhase: undefined,
        enableResult: undefined,
        projectName: '',
        start: jest.fn(),
        retry: jest.fn(),
        reset: jest.fn(),
        ...overrides,
    };
    phasesMock.mockReturnValue(value);
    return value;
}

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
    const onPhaseRunningChange = jest.fn();
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
                onPhaseRunningChange={onPhaseRunningChange}
            />
        </Provider>
    );
    return {
        updateState,
        onPendingProject,
        onPendingWorkspace,
        onPhaseRunningChange,
    };
}

beforeEach(() => {
    phasesMock.mockReset();
    setPhases();
});

describe('DestinationStage', () => {
    it('passes skipEnabling: true to the phase hook (no mesh enable step)', () => {
        renderStage('project');
        expect(phasesMock).toHaveBeenCalledWith(expect.objectContaining({ skipEnabling: true }));
    });

    describe('signin view', () => {
        it('renders the inline auth gate and no pickers', () => {
            renderStage('signin');
            expect(screen.getByTestId('adobe-auth-step')).toBeInTheDocument();
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

        it('creating a project delegates to phases.start via the field', () => {
            const value = setPhases();
            renderStage('project');
            fireEvent.click(screen.getByRole('button', { name: 'create-project' }));
            expect(value.start).toHaveBeenCalledWith('typed-name');
        });

        it('creating failure: returns to the project form with the error + name prefilled', () => {
            setPhases({
                phase: 'failed',
                failedPhase: 'creating',
                error: 'name taken',
                projectName: 'my-demo',
            });
            renderStage('project');
            const field = screen.getByTestId('project-field');
            expect(field).toHaveAttribute('data-create-error', 'name taken');
            expect(field).toHaveAttribute('data-initial-name', 'my-demo');
        });

        it('phase running: shows the centered spinner with the phase message, no field', () => {
            setPhases({
                phase: 'creating',
                phaseMessage: 'Creating project…',
                phaseSubMessage: 'sub',
            });
            renderStage('project');
            expect(screen.getByText('Creating project…')).toBeInTheDocument();
            expect(screen.queryByTestId('project-field')).not.toBeInTheDocument();
        });

        it('non-creating failure: shows an error with a Retry that calls phases.retry', () => {
            const value = setPhases({ phase: 'failed', failedPhase: 'workspace', error: 'boom' });
            renderStage('project');
            expect(screen.getByText('boom')).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
            expect(value.retry).toHaveBeenCalled();
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

        it('phase running: shows the spinner instead of the field', () => {
            setPhases({ phase: 'workspace', phaseMessage: 'Setting up workspace…' });
            renderStage('workspace');
            expect(screen.getByText('Setting up workspace…')).toBeInTheDocument();
            expect(screen.queryByTestId('workspace-field')).not.toBeInTheDocument();
        });

        it('non-creating failure: shows the Retry view', () => {
            const value = setPhases({ phase: 'failed', failedPhase: 'workspace', error: 'nope' });
            renderStage('workspace');
            expect(screen.getByText('nope')).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
            expect(value.retry).toHaveBeenCalled();
        });
    });

    describe('phase-running reporting (onPhaseRunningChange)', () => {
        it('reports true while a creation phase is running', () => {
            setPhases({ phase: 'creating', phaseMessage: 'Creating project…' });
            const { onPhaseRunningChange } = renderStage('project');
            expect(onPhaseRunningChange).toHaveBeenLastCalledWith(true);
        });

        it('reports false when the phase flow is idle', () => {
            const { onPhaseRunningChange } = renderStage('project');
            expect(onPhaseRunningChange).toHaveBeenLastCalledWith(false);
        });
    });

});
