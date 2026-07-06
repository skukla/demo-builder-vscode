/**
 * IntegrationsStep Tests (Integrations area — TWO sub-steps: Services → Adobe I/O)
 *
 * The Integrations area mirrors Commerce: a left rail (VerticalStepList) over a dedicated view
 * of the active sub-step's body.
 *   - Services (`deployables`) — the persistent type-rows (API Mesh, Integration Catalog,
 *     Custom Integration) plus one card per added integration. The Catalog row's Add opens the
 *     browse modal; the Custom row adds inline. There is NO header add button.
 *   - Adobe I/O (`adobe-io`) — the shared Adobe I/O project + workspace (AdobeIoStep). Appears
 *     in the rail only once a deployable is selected.
 *
 * The real mesh catalog drives mesh availability (real stack ids); the integration catalog
 * loader is mocked to a single entry so the Catalog row is enabled. AdobeAuthStep + the entity
 * fields are mocked to sentinels.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { IntegrationsStep } from '@/features/project-creation/ui/steps/IntegrationsStep';
import { DeployablesBody } from '@/features/project-creation/ui/steps/integrationsStepBodies';
import type { SelectedIntegration } from '@/features/project-creation/ui/components/appBuilderIntegrationList';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
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

// Add one integration entry to the catalog so the Catalog row is enabled and an added
// catalog integration resolves to a card (this worktree's real catalog is mesh-only). APPEND
// to the real getAvailableAppBuilderComponents result — the mesh-selection path reads the same
// loader, so replacing it would drop the mesh entries — and resolve the same id by entry.
jest.mock('@/features/project-creation/services/appBuilderComponentCatalogLoader', () => {
    const actual = jest.requireActual(
        '@/features/project-creation/services/appBuilderComponentCatalogLoader',
    );
    const reco = {
        id: 'cat-reco',
        name: 'Recommendations',
        description: 'Personalized product recommendations',
        kind: 'integration',
        source: { owner: 'adobe', repo: 'reco', branch: 'main' },
    };
    return {
        ...actual,
        getAvailableAppBuilderComponents: (
            backendId: string,
            frontendId: string,
        ): AppBuilderComponentCatalogEntry[] => [
            ...actual.getAvailableAppBuilderComponents(backendId, frontendId),
            reco,
        ],
        getAppBuilderComponentEntry: (id: string) =>
            id === 'cat-reco' ? reco : actual.getAppBuilderComponentEntry(id),
    };
});

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

const MESH_ID = 'commerce-paas-mesh';

/** The `.int-card` root for a row/card, addressed by its heading text. */
function card(name: string): HTMLElement {
    return screen.getByText(name).closest('.int-card') as HTMLElement;
}

function baseState(overrides: Partial<WizardState> = {}): WizardState {
    return { selectedPackage: 'citisignal', ...overrides } as WizardState;
}

/** A signed-in Adobe session (org selected). */
const SIGNED_IN: Partial<WizardState> = {
    adobeAuth: { isAuthenticated: true, isChecking: false },
    adobeOrg: signedInOrg,
};

/** State pinned to the Services sub-step. */
function servicesState(overrides: Partial<WizardState> = {}): WizardState {
    return baseState({ activeIntegrationsStep: 'deployables', ...overrides });
}

/** State pinned to the Adobe I/O sub-step. */
function workspaceState(overrides: Partial<WizardState> = {}): WizardState {
    return baseState({ activeIntegrationsStep: 'adobe-io', ...overrides });
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

beforeEach(() => request.mockClear());

describe('IntegrationsStep — rail (Services → Adobe I/O)', () => {
    it('shows only Services in the rail when nothing is selected', () => {
        renderStep(servicesState({ selectedStack: 'eds-paas', selectedBackend: PAAS }));
        expect(screen.getByRole('tab', { name: 'Services' })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: 'Adobe I/O' })).not.toBeInTheDocument();
    });

    it('shows Services + Adobe I/O once a deployable is selected', () => {
        renderStep(
            servicesState({
                selectedStack: 'eds-paas',
                selectedBackend: PAAS,
                selectedAppBuilderComponents: [MESH_ID],
            }),
        );
        expect(screen.getByRole('tab', { name: 'Services' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Adobe I/O' })).toBeInTheDocument();
    });

    it('selecting a rail item sets activeIntegrationsStep', () => {
        const { updateState } = renderStep(
            servicesState({
                selectedStack: 'eds-paas',
                selectedBackend: PAAS,
                selectedAppBuilderComponents: [MESH_ID],
            }),
        );
        fireEvent.click(screen.getByRole('tab', { name: 'Adobe I/O' }));
        expect(updateState).toHaveBeenCalledWith({ activeIntegrationsStep: 'adobe-io' });
    });
});

describe('IntegrationsStep — Services sub-step body', () => {
    it('renders the three type-rows and NO header add button', () => {
        renderStep(servicesState({ selectedStack: 'eds-paas', selectedBackend: PAAS }));
        expect(screen.getByText('API Mesh')).toBeInTheDocument();
        expect(screen.getByText('Integration Catalog')).toBeInTheDocument();
        expect(screen.getByText('Custom Integration')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '+ Add integration' })).not.toBeInTheDocument();
        // The modal is closed initially — no dialog.
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('adds the mesh when the Mesh card Add is pressed (mesh dual-flow)', () => {
        const { updateState } = renderStep(
            servicesState({ selectedStack: 'eds-paas', selectedBackend: PAAS }),
        );
        fireEvent.click(within(card('API Mesh')).getByRole('button', { name: 'Add' }));
        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({ selectedAppBuilderComponents: [MESH_ID] }),
        );
    });

    it('shows the "N/A" label and NO action on the Mesh card for a non-mesh stack', () => {
        renderStep(servicesState({ selectedStack: 'eds-none' }));
        const mesh = card('API Mesh');
        expect(within(mesh).getByText('N/A for this architecture')).toBeInTheDocument();
        expect(within(mesh).queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
        expect(within(mesh).queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    });

    it('opens the Integration Catalog modal from the Catalog row Add', () => {
        renderStep(servicesState({ selectedStack: 'eds-paas', selectedBackend: PAAS }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        fireEvent.click(within(card('Integration Catalog')).getByRole('button', { name: 'Add' }));
        const dialog = screen.getByRole('dialog');
        expect(dialog).toBeInTheDocument();
        // The catalog tile (mocked entry) renders in the modal.
        expect(within(dialog).getByRole('button', { name: /Recommendations/ })).toBeInTheDocument();
        expect(screen.queryByText('Pre-built')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    });

    it('PaaS + mesh, signed out: the Mesh card expands to the inline sign-in gate', () => {
        renderStep(
            servicesState({
                selectedStack: 'eds-paas',
                selectedBackend: PAAS,
                selectedAppBuilderComponents: [MESH_ID],
            }),
        );
        expect(within(card('API Mesh')).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
        expect(screen.getByTestId('adobe-auth-step')).toBeInTheDocument();
        expect(screen.queryByTestId('project-field')).not.toBeInTheDocument();
    });

    it('ACCS + mesh, signed in: the Mesh card expands to the destination project field', () => {
        renderStep(
            servicesState({
                selectedStack: 'eds-paas',
                selectedBackend: ACCS,
                selectedAppBuilderComponents: [MESH_ID],
                ...SIGNED_IN,
            }),
        );
        expect(screen.queryByTestId('adobe-auth-step')).not.toBeInTheDocument();
        expect(screen.getByTestId('project-field')).toBeInTheDocument();
        expect(screen.queryByTestId('workspace-field')).not.toBeInTheDocument();
    });

    it('renders an added integration as its own card after the type-rows', () => {
        renderStep(
            servicesState({
                selectedStack: 'eds-paas',
                selectedBackend: PAAS,
                selectedAppBuilderComponents: ['acme-widget'],
                appBuilderComponentSources: { 'acme-widget': { owner: 'acme', repo: 'widget' } },
            }),
        );
        expect(screen.getByText('widget')).toBeInTheDocument();
        expect(screen.getByText('App Builder app · acme/widget')).toBeInTheDocument();
        const custom = screen.getByText('Custom Integration');
        const integ = screen.getByText('widget');
        expect(custom.compareDocumentPosition(integ) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('a card\'s "Change" reopens the catalog with its tile STILL selected (no removal)', () => {
        const { updateState } = renderStep(
            servicesState({
                selectedStack: 'eds-paas',
                selectedBackend: PAAS,
                selectedAppBuilderComponents: ['cat-reco'],
            }),
        );
        // The added catalog integration renders as its own card.
        expect(screen.getByText('Recommendations')).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Change' }));
        // Change does NOT remove the selection — it just reopens the catalog.
        expect(updateState).not.toHaveBeenCalled();
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByRole('button', { name: 'Done' })).toBeInTheDocument();
        // The previously-selected tile is still checked.
        expect(within(dialog).getByRole('button', { name: /Recommendations/ })).toHaveAttribute(
            'data-selected',
            'true',
        );
    });

    it('removing an added integration clears its selection + source', () => {
        const { updateState } = renderStep(
            servicesState({
                selectedStack: 'eds-paas',
                selectedBackend: PAAS,
                selectedAppBuilderComponents: ['acme-widget'],
                appBuilderComponentSources: { 'acme-widget': { owner: 'acme', repo: 'widget' } },
            }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
        expect(updateState).toHaveBeenCalledWith({
            selectedAppBuilderComponents: [],
            appBuilderComponentSources: {},
        });
    });
});

describe('IntegrationsStep — Adobe I/O sub-step body', () => {
    it('renders the AdobeIoStep on the Adobe I/O sub-step', () => {
        renderStep(
            workspaceState({
                selectedStack: 'eds-paas',
                selectedBackend: PAAS,
                selectedAppBuilderComponents: [MESH_ID],
                ...SIGNED_IN,
            }),
        );
        expect(screen.getByTestId('adobe-io-step')).toBeInTheDocument();
    });

    it('does NOT show the deployable type-rows on the Adobe I/O sub-step', () => {
        renderStep(
            workspaceState({
                selectedStack: 'eds-paas',
                selectedBackend: PAAS,
                selectedAppBuilderComponents: [MESH_ID],
                ...SIGNED_IN,
            }),
        );
        expect(screen.queryByText('API Mesh')).not.toBeInTheDocument();
        expect(screen.queryByText('Integration Catalog')).not.toBeInTheDocument();
        expect(screen.queryByText('Custom Integration')).not.toBeInTheDocument();
    });
});

describe('DeployablesBody — type-rows + delegated Change/Remove', () => {
    const INTEGRATION: SelectedIntegration = {
        id: 'acme-widget',
        name: 'widget',
        owner: 'acme',
        repo: 'widget',
    };

    function renderDeployables(
        overrides: Partial<React.ComponentProps<typeof DeployablesBody>> = {},
    ) {
        const onRemoveIntegration = jest.fn();
        const onChangeIntegration = jest.fn();
        const onOpenCatalog = jest.fn();
        const onAddCustom = jest.fn();
        render(
            <Provider theme={defaultTheme}>
                <DeployablesBody
                    state={baseState({ ...SIGNED_IN }) as WizardState}
                    updateState={jest.fn()}
                    meshAvailable={false}
                    meshSelected={false}
                    onMeshToggle={jest.fn()}
                    onOpenCatalog={onOpenCatalog}
                    catalogEmpty={false}
                    onAddCustom={onAddCustom}
                    selectedIntegrationIds={[]}
                    integrations={[INTEGRATION]}
                    onRemoveIntegration={onRemoveIntegration}
                    onChangeIntegration={onChangeIntegration}
                    {...overrides}
                />
            </Provider>,
        );
        return { onRemoveIntegration, onChangeIntegration, onOpenCatalog, onAddCustom };
    }

    it('renders the Integration Catalog + Custom Integration type-rows', () => {
        renderDeployables();
        expect(screen.getByText('Integration Catalog')).toBeInTheDocument();
        expect(screen.getByText('Custom Integration')).toBeInTheDocument();
        // No inline catalog gallery leaks into the list.
        expect(screen.queryByText('Pre-built')).not.toBeInTheDocument();
    });

    it('shows an "Added" section label separating the add menu from added integrations', () => {
        renderDeployables();
        expect(screen.getByText('Added')).toBeInTheDocument();
    });

    it('hides the "Added" section label when nothing is added yet', () => {
        renderDeployables({ integrations: [] });
        expect(screen.queryByText('Added')).not.toBeInTheDocument();
    });

    it('does NOT render a workspace row (moved to the Adobe I/O sub-step)', () => {
        renderDeployables();
        expect(screen.queryByTestId('adobe-io-step')).not.toBeInTheDocument();
        expect(screen.queryByTestId('adobe-destination-row')).not.toBeInTheDocument();
    });

    it('the Catalog row Add calls onOpenCatalog', () => {
        const { onOpenCatalog } = renderDeployables();
        fireEvent.click(within(card('Integration Catalog')).getByRole('button', { name: 'Add' }));
        expect(onOpenCatalog).toHaveBeenCalledTimes(1);
    });

    it('the Catalog row is muted (no Add) when the catalog is empty', () => {
        renderDeployables({ catalogEmpty: true });
        const catalog = card('Integration Catalog');
        expect(within(catalog).getByText('None available yet')).toBeInTheDocument();
        expect(within(catalog).queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
    });

    it('the Custom row adds inline: Add → URL → commit calls onAddCustom', () => {
        const { onAddCustom } = renderDeployables();
        const custom = card('Custom Integration');
        fireEvent.click(within(custom).getByRole('button', { name: 'Add' }));
        fireEvent.change(screen.getByLabelText('Custom GitHub URL'), {
            target: { value: 'https://github.com/acme/widget' },
        });
        fireEvent.click(within(card('Custom Integration')).getByRole('button', { name: 'Add' }));
        expect(onAddCustom).toHaveBeenCalledWith({ owner: 'acme', repo: 'widget' });
    });

    it('a card\'s "Change" calls the passed onChangeIntegration(id)', () => {
        const { onChangeIntegration } = renderDeployables();
        fireEvent.click(screen.getByRole('button', { name: 'Change' }));
        expect(onChangeIntegration).toHaveBeenCalledWith('acme-widget');
    });

    it('a card\'s "Remove" calls the passed onRemoveIntegration(id)', () => {
        const { onRemoveIntegration } = renderDeployables();
        fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
        expect(onRemoveIntegration).toHaveBeenCalledWith('acme-widget');
    });
});
