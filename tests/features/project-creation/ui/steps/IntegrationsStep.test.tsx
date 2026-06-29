/**
 * IntegrationsStep Tests (Integrations area — top-rail sub-steps)
 *
 * The Integrations area renders a sub-step strip (Services · Destination) over a
 * dedicated view, like Commerce/Storefront. These tests pin the contract:
 *  - Services: the API Mesh card with an Add/Remove toggle (real useProjectBuilder
 *    mesh dual-flow), a "N/A for this architecture" pill + no toggle on a non-mesh
 *    stack, and a dashed "add an integration" simulated slot;
 *  - the "Destination" tab appears only once a deployable is selected;
 *  - Destination: signed out → the subsumed AdobeAuthStep; signed in → the real
 *    project picker + provision list, with the workspace picker revealed progressively.
 *
 * The real catalog (app-builder-components.json) drives availability, so fixtures use
 * real stack backend/frontend ids. vscode-api is stubbed so the real hooks run;
 * WebviewClient is stubbed so the sign-in trigger is observable. The picker bodies are
 * mocked to sentinels (they have their own suites).
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

// The Deployment-target sub-step subsumes the full AdobeAuthStep (sign-in / connected);
// mock it to a sentinel so this suite stays focused on the Integrations wiring.
jest.mock('@/features/authentication/ui/steps/AdobeAuthStep', () => ({
    AdobeAuthStep: () => <div data-testid="adobe-auth-step">Adobe Auth Step</div>,
}));
jest.mock('@/features/authentication/ui/components/AdobeProjectPicker', () => ({
    AdobeProjectPicker: () => <div data-testid="project-picker">Project Picker</div>,
}));
jest.mock('@/features/authentication/ui/components/AdobeWorkspacePicker', () => ({
    AdobeWorkspacePicker: () => <div data-testid="workspace-picker">Workspace Picker</div>,
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

function baseState(overrides: Partial<WizardState> = {}): WizardState {
    return { selectedPackage: 'citisignal', ...overrides } as WizardState;
}

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
    it('renders the Deployables view with the Mesh row (Off + Add) and the simulated add slot', () => {
        renderStep(baseState({ selectedStack: 'eds-paas' }));
        expect(screen.getByText('API Mesh')).toBeInTheDocument();
        expect(screen.getByText('Off')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
        expect(screen.getByText('+ Add an integration')).toBeInTheDocument();
        // Destination tab hidden until a deployable is selected.
        expect(screen.queryByRole('tab', { name: 'Destination' })).not.toBeInTheDocument();
    });

    it('toggles the mesh ON when Add is pressed (mesh dual-flow)', () => {
        const { updateState } = renderStep(baseState({ selectedStack: 'eds-paas' }));
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

    it('shows the Remove action on the Deployables view when mesh is On', () => {
        renderStep(
            baseState({
                selectedStack: 'eds-paas',
                selectedAppBuilderComponents: ['commerce-paas-mesh'],
                activeIntegrationsStep: 'deployables',
            }),
        );
        expect(screen.getByText('On')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
        // The Destination tab now exists in the strip.
        expect(screen.getByRole('tab', { name: 'Destination' })).toBeInTheDocument();
    });

    it('subsumes AdobeAuthStep on the Deployment target view; no pickers when signed out', () => {
        // Mesh selected → target sub-step is the first OPEN step (active by default).
        renderStep(
            baseState({
                selectedStack: 'eds-paas',
                selectedAppBuilderComponents: ['commerce-paas-mesh'],
            }),
        );
        expect(screen.getByTestId('adobe-auth-step')).toBeInTheDocument();
        // Signed out → the project/workspace pickers + provision list are not shown yet.
        expect(screen.queryByTestId('project-picker')).not.toBeInTheDocument();
        expect(screen.queryByText(/On create, the extension will/i)).not.toBeInTheDocument();
    });

    it('shows AdobeAuthStep + the project picker (not yet workspace) + provision list when On + signed in, no project', () => {
        renderStep(
            baseState({
                selectedStack: 'eds-paas',
                selectedAppBuilderComponents: ['commerce-paas-mesh'],
                adobeAuth: { isAuthenticated: true, isChecking: false },
                adobeOrg: signedInOrg,
            }),
        );
        expect(screen.getByTestId('adobe-auth-step')).toBeInTheDocument();
        expect(screen.getByTestId('project-picker')).toBeInTheDocument();
        expect(screen.queryByTestId('workspace-picker')).not.toBeInTheDocument();
        expect(screen.getByText(/On create, the extension will/i)).toBeInTheDocument();
        expect(screen.getByText(/GraphQL Service SDK/i)).toBeInTheDocument();
    });

    it('reveals the workspace picker once a project is chosen (progressive)', () => {
        renderStep(
            baseState({
                selectedStack: 'eds-paas',
                selectedAppBuilderComponents: ['commerce-paas-mesh'],
                adobeAuth: { isAuthenticated: true, isChecking: false },
                adobeOrg: signedInOrg,
                adobeProject: { id: 'p1', name: 'proj', title: 'Demo Project' },
            }),
        );
        expect(screen.getByTestId('project-picker')).toBeInTheDocument();
        expect(screen.getByTestId('workspace-picker')).toBeInTheDocument();
    });
});
