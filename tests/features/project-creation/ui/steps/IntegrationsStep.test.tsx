/**
 * IntegrationsStep Tests (Integrations area — top-rail sub-steps)
 *
 * The Integrations area renders a sub-step strip (Services · [Sign in] · Destination)
 * over a dedicated view, like Commerce/Storefront. These tests pin the contract:
 *  - Services: the API Mesh card with an Add/Remove toggle (real useProjectBuilder
 *    mesh dual-flow), a "N/A for this architecture" pill + no toggle on a non-mesh
 *    stack, and a dashed "add an integration" simulated slot;
 *  - Sign in: a CONDITIONAL sub-step — present for backends with no earlier sign-in
 *    (PaaS), skipped for ACCS (which signs in at Commerce). Its body is AdobeAuthStep;
 *  - Destination: NO auth — the project + workspace select-or-create fields (workspace
 *    revealed once a project is chosen) + the provision summary.
 *
 * The real catalog (app-builder-components.json) drives availability, so fixtures use
 * real stack backend/frontend ids. AdobeAuthStep + the create fields are mocked to
 * sentinels (they have their own suites).
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { IntegrationsStep } from '@/features/project-creation/ui/steps/IntegrationsStep';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: { postMessage: jest.fn(), request: jest.fn(), onMessage: jest.fn(() => jest.fn()) },
}));

// The Sign-in sub-step body reuses the full AdobeAuthStep; mock it to a sentinel.
jest.mock('@/features/authentication/ui/steps/AdobeAuthStep', () => ({
    AdobeAuthStep: () => <div data-testid="adobe-auth-step">Adobe Auth Step</div>,
}));
// The Destination body uses the select-or-create fields; mock them to sentinels.
jest.mock('@/features/authentication/ui/components/AdobeEntityFields', () => ({
    AdobeProjectField: () => <div data-testid="project-field">Project Field</div>,
    AdobeWorkspaceField: () => <div data-testid="workspace-field">Workspace Field</div>,
}));

// ---------------------------------------------------------------------------
// Fixtures — real stack backend/frontend ids so the real catalog resolves a mesh.
// ---------------------------------------------------------------------------
const packages = [{ id: 'citisignal', name: 'Citisignal' }] as unknown as DemoPackage[];
const meshStack = {
    id: 'eds-paas',
    name: 'EDS + PaaS',
    frontend: 'eds-storefront',
    backend: 'adobe-commerce-paas',
} as unknown as Stack;
const nonMeshStack = {
    id: 'eds-none',
    name: 'EDS + (no mesh backend)',
    frontend: 'eds-storefront',
    backend: 'no-mesh-backend',
} as unknown as Stack;
const stacks = [meshStack, nonMeshStack] as Stack[];

const signedInOrg = { id: 'org-1', name: 'Acme', code: 'ACME' } as WizardState['adobeOrg'];
const ACCS = 'adobe-commerce-accs';
const PAAS = 'adobe-commerce-paas';

function baseState(overrides: Partial<WizardState> = {}): WizardState {
    return { selectedPackage: 'citisignal', ...overrides } as WizardState;
}

/** A signed-in Adobe session (org selected). */
const SIGNED_IN: Partial<WizardState> = {
    adobeAuth: { isAuthenticated: true, isChecking: false },
    adobeOrg: signedInOrg,
};

function renderStep(state: WizardState, updateState = jest.fn()) {
    render(
        <Provider theme={defaultTheme}>
            <IntegrationsStep
                state={state}
                updateState={updateState}
                setCanProceed={jest.fn()}
                packages={packages}
                stacks={stacks}
            />
        </Provider>,
    );
    return { updateState };
}

describe('IntegrationsStep (top-rail sub-steps)', () => {
    it('renders the Services view with the Mesh card (Off + Add) and the simulated add slot', () => {
        renderStep(baseState({ selectedStack: 'eds-paas', selectedBackend: PAAS }));
        expect(screen.getByText('API Mesh')).toBeInTheDocument();
        expect(screen.getByText('Off')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
        expect(screen.getByText('+ Add an integration')).toBeInTheDocument();
        // No Sign in / Destination tabs until a deployable is selected.
        expect(screen.queryByRole('tab', { name: 'Sign in' })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: 'Destination' })).not.toBeInTheDocument();
    });

    it('toggles the mesh ON when Add is pressed (mesh dual-flow)', () => {
        const { updateState } = renderStep(baseState({ selectedStack: 'eds-paas', selectedBackend: PAAS }));
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({ selectedAppBuilderComponents: ['commerce-paas-mesh'] }),
        );
    });

    it('shows the "N/A" pill and NO action on a non-mesh stack', () => {
        renderStep(baseState({ selectedStack: 'eds-none' }));
        expect(screen.getByText('N/A for this architecture')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /add|remove|sign in/i }),
        ).not.toBeInTheDocument();
    });

    it('PaaS: shows a Sign in tab AND a Destination tab once mesh is On', () => {
        renderStep(
            baseState({
                selectedStack: 'eds-paas',
                selectedBackend: PAAS,
                selectedAppBuilderComponents: ['commerce-paas-mesh'],
                activeIntegrationsStep: 'deployables',
            }),
        );
        expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Sign in' })).toBeInTheDocument();
        // target is locked while Sign in is current → its name includes the lock reason.
        expect(screen.getByRole('tab', { name: /Destination/ })).toBeInTheDocument();
    });

    it('ACCS: NO Sign in tab (already signed in at Commerce) — just Services + Destination', () => {
        renderStep(
            baseState({
                selectedStack: 'eds-paas',
                selectedBackend: ACCS,
                selectedAppBuilderComponents: ['commerce-paas-mesh'],
                activeIntegrationsStep: 'deployables',
                ...SIGNED_IN,
            }),
        );
        expect(screen.queryByRole('tab', { name: 'Sign in' })).not.toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Destination' })).toBeInTheDocument();
    });

    it('PaaS not signed in: the Sign-in sub-step (AdobeAuthStep) is active', () => {
        // Mesh selected, PaaS, signed out → `signin` is the first OPEN step.
        renderStep(
            baseState({
                selectedStack: 'eds-paas',
                selectedBackend: PAAS,
                selectedAppBuilderComponents: ['commerce-paas-mesh'],
            }),
        );
        expect(screen.getByTestId('adobe-auth-step')).toBeInTheDocument();
        // The Destination fields are NOT shown while on the Sign-in step.
        expect(screen.queryByTestId('project-field')).not.toBeInTheDocument();
    });

    it('Destination has NO auth — shows the project field + provision list (signed in)', () => {
        // ACCS + signed in → no Sign-in step; Destination is active.
        renderStep(
            baseState({
                selectedStack: 'eds-paas',
                selectedBackend: ACCS,
                selectedAppBuilderComponents: ['commerce-paas-mesh'],
                ...SIGNED_IN,
            }),
        );
        expect(screen.queryByTestId('adobe-auth-step')).not.toBeInTheDocument();
        expect(screen.getByTestId('project-field')).toBeInTheDocument();
        expect(screen.queryByTestId('workspace-field')).not.toBeInTheDocument();
        expect(screen.getByText(/On create, the extension will/i)).toBeInTheDocument();
        expect(screen.getByText(/GraphQL Service SDK/i)).toBeInTheDocument();
    });

    it('reveals the workspace field once a project is chosen (progressive)', () => {
        renderStep(
            baseState({
                selectedStack: 'eds-paas',
                selectedBackend: ACCS,
                selectedAppBuilderComponents: ['commerce-paas-mesh'],
                ...SIGNED_IN,
                adobeProject: { id: 'p1', name: 'proj', title: 'Demo Project' },
            }),
        );
        expect(screen.getByTestId('project-field')).toBeInTheDocument();
        expect(screen.getByTestId('workspace-field')).toBeInTheDocument();
    });
});
