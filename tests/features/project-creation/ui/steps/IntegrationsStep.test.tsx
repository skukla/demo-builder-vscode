/**
 * IntegrationsStep Tests (Integrations area — a single "Services" screen)
 *
 * The Integrations area is now ONE screen: the deployable list. The API Mesh renders as a
 * selection-aware card that, when added, expands INLINE to host its Adobe I/O destination
 * (a sign-in gate when signed out; the project/workspace select-or-create fields when
 * signed in) — the former Sign in / Destination sub-step TABS are gone.
 *
 * The real catalog (app-builder-components.json) drives availability, so fixtures use real
 * stack backend/frontend ids. AdobeAuthStep + the entity fields are mocked to sentinels.
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

// Generic webview-client stub for anything in the render tree that requests (the mesh
// card / project-builder hook). The Integrations area itself makes no requests on mount.
const request = jest.fn().mockResolvedValue({ success: true });
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: { request: (...args: unknown[]) => request(...args) },
}));

// The mesh card's inline sign-in gate reuses AdobeAuthStep; the destination reuses the
// select-or-create fields. Mock them to sentinels (they have their own suites).
jest.mock('@/features/authentication/ui/steps/AdobeAuthStep', () => ({
    AdobeAuthStep: () => <div data-testid="adobe-auth-step">Adobe Auth Step</div>,
}));
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

beforeEach(() => request.mockClear());

describe('IntegrationsStep (single Services screen)', () => {
    it('renders the Services view: the Mesh card (Add) + the simulated add slot, no tabs', () => {
        renderStep(baseState({ selectedStack: 'eds-paas', selectedBackend: PAAS }));
        expect(screen.getByText('API Mesh')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
        expect(screen.getByText('+ Add an integration')).toBeInTheDocument();
        // No sub-step tabs — Integrations is one screen.
        expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    });

    it('adds the mesh when Add is pressed (mesh dual-flow)', () => {
        const { updateState } = renderStep(baseState({ selectedStack: 'eds-paas', selectedBackend: PAAS }));
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({ selectedAppBuilderComponents: ['commerce-paas-mesh'] }),
        );
    });

    it('shows the "N/A" label and NO action on a non-mesh stack', () => {
        renderStep(baseState({ selectedStack: 'eds-none' }));
        expect(screen.getByText('N/A for this architecture')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /add|remove/i })).not.toBeInTheDocument();
    });

    it('PaaS + mesh, signed out: the card expands to the inline sign-in gate', () => {
        renderStep(
            baseState({
                selectedStack: 'eds-paas',
                selectedBackend: PAAS,
                selectedAppBuilderComponents: ['commerce-paas-mesh'],
            }),
        );
        expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
        expect(screen.getByTestId('adobe-auth-step')).toBeInTheDocument();
        // No destination fields until signed in.
        expect(screen.queryByTestId('project-field')).not.toBeInTheDocument();
    });

    it('ACCS + mesh, signed in: the card expands to the destination project field (no gate)', () => {
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
    });

    it('reveals the workspace field once a project is chosen (progressive, in-card)', () => {
        renderStep(
            baseState({
                selectedStack: 'eds-paas',
                selectedBackend: ACCS,
                selectedAppBuilderComponents: ['commerce-paas-mesh'],
                ...SIGNED_IN,
                adobeProject: { id: 'p1', name: 'proj', title: 'Demo Project' },
            }),
        );
        expect(screen.getByTestId('workspace-field')).toBeInTheDocument();
    });
});
