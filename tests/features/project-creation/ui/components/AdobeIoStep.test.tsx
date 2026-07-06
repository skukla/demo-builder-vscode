/**
 * AdobeIoStep Tests
 *
 * The "Adobe I/O" sub-step body of the Integrations area — provisions the ONE shared Adobe
 * project + workspace every deployable reads. It reuses the mesh card's create→workspace
 * phase flow (via useProjectCreationPhases with skipEnabling: true — NO mesh API-enable
 * step) and makes the workspace a PENDING default (state.pendingAdobeWorkspace) committed to
 * state.adobeWorkspace only when the sub-step's Continue fires (see areaSubSteps commit).
 *
 * The phase hook is mocked so each phase view is drivable; AdobeAuthStep + the entity fields
 * are mocked to sentinels that expose the props under test (no real fetch fires).
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { AdobeIoStep } from '@/features/project-creation/ui/components/AdobeIoStep';
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
    }: {
        onCreateFlow?: (name: string) => void;
        createError?: string;
        initialCreateName?: string;
    }) => (
        <div
            data-testid="project-field"
            data-create-error={createError ?? ''}
            data-initial-name={initialCreateName ?? ''}
        >
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
                onClick={() => onWorkspaceSelect?.({ id: 'w-picked', name: 'Stage', title: 'Stage' })}
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

const SIGNED_IN: Partial<WizardState> = {
    adobeAuth: { isAuthenticated: true, isChecking: false },
    adobeOrg: { id: 'org-1', name: 'Acme', code: 'ACME' } as WizardState['adobeOrg'],
};
const PROJECT = { id: 'p1', name: 'proj', title: 'Demo Project' };
const WORKSPACE = { id: 'w1', name: 'Stage', title: 'Stage' };

function renderStep(state: Partial<WizardState> = {}, updateState = jest.fn()) {
    render(
        <Provider theme={defaultTheme} colorScheme="light">
            <AdobeIoStep state={state as WizardState} updateState={updateState} />
        </Provider>,
    );
    return { updateState };
}

beforeEach(() => {
    phasesMock.mockReset();
    setPhases();
});

describe('AdobeIoStep', () => {
    it('passes skipEnabling: true to the phase hook (no mesh enable step)', () => {
        renderStep({ ...SIGNED_IN });
        expect(phasesMock).toHaveBeenCalledWith(
            expect.objectContaining({ skipEnabling: true }),
        );
    });

    it('not signed in: renders the auth-gate stub (no project field)', () => {
        renderStep({});
        expect(screen.getByTestId('adobe-auth-step')).toBeInTheDocument();
        expect(screen.queryByTestId('project-field')).not.toBeInTheDocument();
    });

    it('signed in + no project (idle): renders the project field', () => {
        renderStep({ ...SIGNED_IN });
        expect(screen.getByTestId('project-field')).toBeInTheDocument();
        expect(screen.queryByTestId('workspace-field')).not.toBeInTheDocument();
    });

    it('creating a project delegates to phases.start via the field', () => {
        const started = setPhases();
        renderStep({ ...SIGNED_IN });
        fireEvent.click(screen.getByRole('button', { name: 'create-project' }));
        expect(started.start).toHaveBeenCalledWith('typed-name');
    });

    it('project + no committed workspace: renders the PENDING workspace picker', () => {
        renderStep({
            ...SIGNED_IN,
            adobeProject: PROJECT,
            pendingAdobeWorkspace: { id: 'w-pending', name: 'Stage', title: 'Stage' },
        });
        const field = screen.getByTestId('workspace-field');
        expect(field).toBeInTheDocument();
        // The highlight tracks PENDING, not the committed default.
        expect(field).toHaveAttribute('data-selected', 'w-pending');
        expect(screen.queryByTestId('project-field')).not.toBeInTheDocument();
    });

    it('selecting a workspace writes pendingAdobeWorkspace (NOT adobeWorkspace)', () => {
        const { updateState } = renderStep({ ...SIGNED_IN, adobeProject: PROJECT });
        fireEvent.click(screen.getByRole('button', { name: 'pick-ws' }));
        expect(updateState).toHaveBeenCalledWith({
            pendingAdobeWorkspace: { id: 'w-picked', name: 'Stage', title: 'Stage' },
        });
        // Must NOT commit to adobeWorkspace here — that happens on Continue.
        const wrote = updateState.mock.calls.some(
            ([u]: [Partial<WizardState>]) => 'adobeWorkspace' in u,
        );
        expect(wrote).toBe(false);
    });

    it('project + committed workspace: shows Project + Workspace summary rows with Change', () => {
        renderStep({ ...SIGNED_IN, adobeProject: PROJECT, adobeWorkspace: WORKSPACE });
        expect(screen.getByText('Project')).toBeInTheDocument();
        expect(screen.getByText('Demo Project')).toBeInTheDocument();
        expect(screen.getByText('Workspace')).toBeInTheDocument();
        expect(screen.getByText('Stage')).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'Change' })).toHaveLength(2);
        expect(screen.queryByTestId('workspace-field')).not.toBeInTheDocument();
    });

    it('Change on Project clears project + workspace + pending', () => {
        const { updateState } = renderStep({
            ...SIGNED_IN,
            adobeProject: PROJECT,
            adobeWorkspace: WORKSPACE,
            pendingAdobeWorkspace: WORKSPACE,
        });
        fireEvent.click(screen.getAllByRole('button', { name: 'Change' })[0]);
        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({
                adobeProject: undefined,
                adobeWorkspace: undefined,
                pendingAdobeWorkspace: undefined,
            }),
        );
    });

    it('Change on Workspace clears workspace + pending (keeps the project)', () => {
        const { updateState } = renderStep({
            ...SIGNED_IN,
            adobeProject: PROJECT,
            adobeWorkspace: WORKSPACE,
            pendingAdobeWorkspace: WORKSPACE,
        });
        fireEvent.click(screen.getAllByRole('button', { name: 'Change' })[1]);
        const call = updateState.mock.calls.find(
            ([u]: [Partial<WizardState>]) => 'adobeWorkspace' in u,
        )?.[0];
        expect(call).toEqual(
            expect.objectContaining({
                adobeWorkspace: undefined,
                pendingAdobeWorkspace: undefined,
            }),
        );
        expect('adobeProject' in (call as Record<string, unknown>)).toBe(false);
    });

    it('phase running: shows the centered spinner with the phase message', () => {
        setPhases({ phase: 'creating', phaseMessage: 'Creating project…', phaseSubMessage: 'sub' });
        renderStep({ ...SIGNED_IN });
        expect(screen.getByText('Creating project…')).toBeInTheDocument();
        expect(screen.queryByTestId('project-field')).not.toBeInTheDocument();
    });

    it('non-creating failure: shows an error with a Retry that calls phases.retry', () => {
        const value = setPhases({ phase: 'failed', failedPhase: 'workspace', error: 'boom' });
        renderStep({ ...SIGNED_IN, adobeProject: PROJECT });
        expect(screen.getByText('boom')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(value.retry).toHaveBeenCalled();
    });

    it('creating failure: returns to the project form with the error + name prefilled', () => {
        setPhases({
            phase: 'failed',
            failedPhase: 'creating',
            error: 'name taken',
            projectName: 'my-demo',
        });
        renderStep({ ...SIGNED_IN });
        const field = screen.getByTestId('project-field');
        expect(field).toHaveAttribute('data-create-error', 'name taken');
        expect(field).toHaveAttribute('data-initial-name', 'my-demo');
    });
});
