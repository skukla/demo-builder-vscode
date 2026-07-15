/**
 * IntegrationsStep Tests (Integrations flow redesign — Step 9)
 *
 * The Integrations area body is RESULTS ONLY: an area heading (no sub-step rail),
 * an empty state when nothing is configured, one IntegrationResultRow per
 * configured integration (resolved from wizard state — including a PACKAGE-SEEDED
 * mesh arriving via selectedOptionalDependencies), and an accent "Add Integration"
 * button hosting the AddIntegrationFlowModal journey.
 *
 * Graybox: the integration-flow module and useProjectBuilder are REAL — only
 * module-external boundaries are mocked (webviewClient, useProjectCreationPhases,
 * AdobeAuthStep, AdobeEntityFields, and one appended catalog entry).
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';

// --- module-external mocks --------------------------------------------------
const mockRequest = jest.fn();
jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: { postMessage: jest.fn() },
    webviewClient: {
        request: (...args: unknown[]) => mockRequest(...args),
        postMessage: jest.fn(),
        // The mesh enable subscribes to per-API progress ticks; return an unsubscribe.
        onMessage: jest.fn(() => () => {}),
    },
}));

const phasesMock = jest.fn();
jest.mock('@/features/project-creation/ui/hooks/useProjectCreationPhases', () => ({
    useProjectCreationPhases: (...args: unknown[]) => phasesMock(...args),
}));

jest.mock('@/features/authentication/ui/steps/AdobeAuthStep', () => ({
    AdobeAuthStep: () => <div data-testid="adobe-auth-step">Adobe Auth Step</div>,
}));
jest.mock('@/features/authentication/ui/components/AdobeEntityFields', () => ({
    AdobeProjectField: () => <div data-testid="project-field">Project Field</div>,
    AdobeWorkspaceField: () => <div data-testid="workspace-field">Workspace Field</div>,
}));

// Append one integration entry to the real catalog so a catalog-kind integration
// resolves to a row (mesh resolution reads the SAME loader — never replace it).
jest.mock('@/features/project-creation/services/appBuilderComponentCatalogLoader', () => {
    const actual = jest.requireActual(
        '@/features/project-creation/services/appBuilderComponentCatalogLoader'
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
        getAvailableAppBuilderComponents: (backendId: string, frontendId: string) => [
            ...actual.getAvailableAppBuilderComponents(backendId, frontendId),
            reco,
        ],
    };
});

import { IntegrationsStep } from '@/features/project-creation/ui/steps/IntegrationsStep';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

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
const stacks = [meshStack] as Stack[];

/** The stack's mesh catalog entry (real catalog) and its legacy dependency mirror. */
const MESH_ID = 'commerce-paas-mesh';
const MESH_NAME = 'Commerce PaaS API Mesh';
const MESH_LEGACY_DEP = 'eds-commerce-mesh';

const SIGNED_IN: Partial<WizardState> = {
    adobeAuth: { isAuthenticated: true, isChecking: false },
    adobeOrg: { id: 'org-1', code: 'ORG@AdobeOrg', name: 'Test Org' },
};
const COMMITTED_DEST: Partial<WizardState> = {
    adobeProject: { id: 'proj-1', name: 'proj-one', title: 'Demo Project' },
    adobeWorkspace: { id: 'ws-1', name: 'Stage' },
};
const CUSTOM_ADDED: Partial<WizardState> = {
    selectedAppBuilderComponents: ['acme-widget'],
    appBuilderComponentSources: { 'acme-widget': { owner: 'acme', repo: 'widget' } },
};

function baseState(overrides: Partial<WizardState> = {}): WizardState {
    return {
        selectedPackage: 'citisignal',
        selectedStack: 'eds-paas',
        ...overrides,
    } as WizardState;
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
        </Provider>
    );
    return { updateState };
}

/** The `.int-row` root for a result row, addressed by its name text. */
function row(name: string): HTMLElement {
    return screen.getByText(name).closest('.int-row') as HTMLElement;
}

/** The destination line within a row (scopes its Change/Set up away from the API line). */
function destinationOf(rowEl: HTMLElement): HTMLElement {
    return rowEl.querySelector('.int-row-destination') as HTMLElement;
}

/** The editable API line within a custom/import row (scopes its Change). */
function apiLineOf(rowEl: HTMLElement): HTMLElement {
    return rowEl.querySelector('.int-row-apis') as HTMLElement;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRequest.mockResolvedValue({ success: true, data: { apis: [] } });
    phasesMock.mockReturnValue({
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
    });
});

describe('IntegrationsStep — results-only layout', () => {
    it('renders the Integrations area heading with NO sub-step rail', () => {
        renderStep(baseState());
        expect(screen.getByText('Integrations')).toBeInTheDocument();
        expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    });

    it('shows the empty state and the Add Integration button when nothing is configured', () => {
        renderStep(baseState());
        expect(screen.getByText('No integrations yet.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add Integration' })).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not render the old deployable type-rows', () => {
        renderStep(baseState());
        expect(screen.queryByText('Pre-built integration')).not.toBeInTheDocument();
        expect(screen.queryByText('Import a repo')).not.toBeInTheDocument();
        expect(screen.queryByText('API Mesh')).not.toBeInTheDocument();
    });

    it('hides the empty state once a row exists', () => {
        renderStep(baseState({ selectedAppBuilderComponents: [MESH_ID] }));
        expect(screen.queryByText('No integrations yet.')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add Integration' })).toBeInTheDocument();
    });
});

describe('IntegrationsStep — result rows from state', () => {
    it('renders a selected mesh as a needs-setup row (Not set + Set up)', () => {
        renderStep(baseState({ selectedAppBuilderComponents: [MESH_ID] }));
        const mesh = row(MESH_NAME);
        expect(within(mesh).getByText('Deploys to — Not set')).toBeInTheDocument();
        expect(within(mesh).getByRole('button', { name: 'Set up' })).toBeInTheDocument();
    });

    it('renders a PACKAGE-SEEDED mesh (dependency key only) as a needs-setup row', () => {
        renderStep(baseState({ selectedOptionalDependencies: [MESH_LEGACY_DEP] }));
        const mesh = row(MESH_NAME);
        expect(within(mesh).getByText('Deploys to — Not set')).toBeInTheDocument();
        expect(within(mesh).getByRole('button', { name: 'Set up' })).toBeInTheDocument();
    });

    it('shows the committed destination as "Project · Workspace" with Change', () => {
        renderStep(baseState({ ...CUSTOM_ADDED, ...COMMITTED_DEST }));
        const custom = row('widget');
        expect(within(custom).getByText('Deploys to Demo Project · Stage')).toBeInTheDocument();
        expect(
            within(destinationOf(custom)).getByRole('button', { name: 'Change' })
        ).toBeInTheDocument();
    });

    it('renders a custom integration row with its source line and no API-access slot', () => {
        renderStep(baseState({ ...CUSTOM_ADDED, ...COMMITTED_DEST }));
        const custom = row('widget');
        expect(within(custom).getByText('App Builder app · acme/widget')).toBeInTheDocument();
        expect(screen.queryByText('API access')).not.toBeInTheDocument();
    });

    it('renders a catalog integration row from its catalog entry', () => {
        renderStep(baseState({ selectedAppBuilderComponents: ['cat-reco'] }));
        const reco = row('Recommendations');
        expect(within(reco).getByText('Personalized product recommendations')).toBeInTheDocument();
        expect(within(reco).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    });

    it('renders a result row for a committed blank "Build custom" app', () => {
        // Regression: the blank shell was resolved against the blank-FILTERED catalog,
        // so a committed "Build custom" app produced no row.
        renderStep(baseState({ selectedAppBuilderComponents: ['app-builder-shell'] }));
        const blank = row('App Builder App');
        expect(blank).not.toBeNull();
        expect(within(blank).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    });

    it('shows the API count line (baseline + picks) on a custom row', () => {
        renderStep(
            baseState({
                ...CUSTOM_ADDED,
                selectedConsoleApis: { 'acme-widget': ['AnalyticsSDK', 'CampaignSDK'] },
            })
        );
        // Baseline (I/O Management) + 2 free picks.
        expect(within(row('widget')).getByText('APIs: 3 selected')).toBeInTheDocument();
    });

    it('shows no API line on a deterministic catalog row (its APIs are fixed)', () => {
        renderStep(
            baseState({
                selectedAppBuilderComponents: ['cat-reco'],
                selectedConsoleApis: { 'cat-reco': ['AnalyticsSDK'] },
            })
        );
        expect(within(row('Recommendations')).queryByText(/APIs/)).not.toBeInTheDocument();
    });

    it('shows a static "API access enabled" for a committed mesh — never subscribes (purely visual)', () => {
        renderStep(
            baseState({
                selectedAppBuilderComponents: [MESH_ID],
                ...SIGNED_IN,
                ...COMMITTED_DEST,
            })
        );
        // The enable is owned by the Add modal (commits only on success); this step
        // just displays ✓ and must NOT issue a subscribe — re-mounting (Continue to
        // the summary and Back) would otherwise "re-enable".
        expect(within(row(MESH_NAME)).getByText('API access enabled')).toBeInTheDocument();
        expect(mockRequest).not.toHaveBeenCalledWith(
            'ensure-mesh-api-subscribed',
            expect.anything()
        );
    });
});

describe('IntegrationsStep — modal wiring', () => {
    it('the Add Integration button opens the flow modal in add mode', () => {
        renderStep(baseState());
        fireEvent.click(screen.getByRole('button', { name: 'Add Integration' }));
        const dialog = screen.getByRole('dialog');
        expect(
            within(dialog).getByRole('heading', { name: 'Add Integration' })
        ).toBeInTheDocument();
        // The kind picker renders inside the journey.
        expect(
            within(dialog).getByRole('button', { name: /Pre-built integration/ })
        ).toBeInTheDocument();
    });

    it("a needs-setup row's Set up opens the modal in destination mode", () => {
        renderStep(baseState({ selectedAppBuilderComponents: [MESH_ID], ...SIGNED_IN }));
        fireEvent.click(within(row(MESH_NAME)).getByRole('button', { name: 'Set up' }));
        const dialog = screen.getByRole('dialog');
        expect(
            within(dialog).getByRole('heading', { name: 'Deployment Destination' })
        ).toBeInTheDocument();
        expect(within(dialog).getByTestId('project-field')).toBeInTheDocument();
    });

    it("a committed row's destination Change opens the modal in destination mode", () => {
        renderStep(baseState({ ...CUSTOM_ADDED, ...COMMITTED_DEST, ...SIGNED_IN }));
        fireEvent.click(
            within(destinationOf(row('widget'))).getByRole('button', { name: 'Change' })
        );
        const dialog = screen.getByRole('dialog');
        expect(
            within(dialog).getByRole('heading', { name: 'Deployment Destination' })
        ).toBeInTheDocument();
        expect(within(dialog).getByTestId('project-field')).toBeInTheDocument();
    });

    it("a custom row's API Change opens the modal in api-edit mode (the picker)", () => {
        renderStep(baseState({ ...CUSTOM_ADDED, ...COMMITTED_DEST, ...SIGNED_IN }));
        fireEvent.click(within(apiLineOf(row('widget'))).getByRole('button', { name: 'Change' }));
        const dialog = screen.getByRole('dialog');
        expect(
            within(dialog).getByRole('heading', { name: 'Edit API Access' })
        ).toBeInTheDocument();
        expect(within(dialog).getByTestId('api-picker-stage')).toBeInTheDocument();
    });
});

describe('IntegrationsStep — Remove routing', () => {
    it('mesh Remove routes through the mesh dual-flow toggle (both keys cleared)', () => {
        const { updateState } = renderStep(
            baseState({
                selectedAppBuilderComponents: [MESH_ID],
                selectedOptionalDependencies: [MESH_LEGACY_DEP],
            })
        );
        fireEvent.click(within(row(MESH_NAME)).getByRole('button', { name: 'Remove' }));
        expect(updateState).toHaveBeenCalledWith({
            selectedAppBuilderComponents: [],
            selectedOptionalDependencies: [],
        });
    });

    it('a PACKAGE-SEEDED mesh Remove clears the dependency mirror key', () => {
        const { updateState } = renderStep(
            baseState({ selectedOptionalDependencies: [MESH_LEGACY_DEP] })
        );
        fireEvent.click(within(row(MESH_NAME)).getByRole('button', { name: 'Remove' }));
        expect(updateState).toHaveBeenCalledWith({
            selectedAppBuilderComponents: [],
            selectedOptionalDependencies: [],
        });
    });

    it('custom Remove clears the selection AND its source', () => {
        const { updateState } = renderStep(baseState(CUSTOM_ADDED));
        fireEvent.click(within(row('widget')).getByRole('button', { name: 'Remove' }));
        expect(updateState).toHaveBeenCalledWith({
            selectedAppBuilderComponents: [],
            appBuilderComponentSources: {},
        });
    });

    it('catalog Remove routes through onRemoveAppBuilderComponent', () => {
        const { updateState } = renderStep(
            baseState({ selectedAppBuilderComponents: ['cat-reco'] })
        );
        fireEvent.click(within(row('Recommendations')).getByRole('button', { name: 'Remove' }));
        expect(updateState).toHaveBeenCalledWith({
            selectedAppBuilderComponents: [],
            appBuilderComponentSources: {},
        });
    });
});

describe('IntegrationsStep — in-modal mesh enable hand-off', () => {
    /** Hosts the step over REAL useState so the modal's finish commits re-render rows. */
    function StatefulStep(): React.ReactElement {
        const [state, setState] = React.useState<WizardState>(() =>
            // An existing integration (CUSTOM_ADDED) already references the committed
            // destination, so adding the mesh collapses to the summary rather than
            // re-walking the picker as a clean slate.
            baseState({ ...SIGNED_IN, ...COMMITTED_DEST, ...CUSTOM_ADDED })
        );
        const updateState = React.useCallback(
            (partial: Partial<WizardState>) => setState((current) => ({ ...current, ...partial })),
            []
        );
        return (
            <Provider theme={defaultTheme}>
                <IntegrationsStep
                    state={state}
                    updateState={updateState}
                    setCanProceed={jest.fn()}
                    packages={packages}
                    stacks={stacks}
                />
            </Provider>
        );
    }

    it('the mesh result row runs the enable AFTER add — never during selection', async () => {
        mockRequest.mockResolvedValue({ success: true });
        render(<StatefulStep />);

        fireEvent.click(screen.getByRole('button', { name: 'Add Integration' }));
        const dialog = screen.getByRole('dialog');
        fireEvent.click(within(dialog).getByRole('button', { name: /API Mesh/ }));
        fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
        // Committed destination → summary → api-access. Selection NEVER provisions.
        fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
        await waitFor(() => {
            // The mesh api-access footer reads "Add API Access" (its action enables the APIs).
            expect(within(dialog).getByRole('button', { name: 'Add API Access' })).toHaveAttribute(
                'aria-disabled',
                'false'
            );
        });
        expect(mockRequest).not.toHaveBeenCalledWith(
            'ensure-mesh-api-subscribed',
            expect.anything()
        );

        fireEvent.click(within(dialog).getByRole('button', { name: 'Add API Access' }));

        // The enable runs IN the modal on Add (against the stack's mesh axes),
        // then the modal holds on the ✓ terminal state (footer → Done).
        await waitFor(() => {
            expect(mockRequest).toHaveBeenCalledWith(
                'ensure-mesh-api-subscribed',
                expect.objectContaining({
                    workspaceId: 'ws-1',
                    backendId: 'adobe-commerce-paas',
                    frontendId: 'eds-storefront',
                })
            );
        });
        // Done → commit + close. The result row then ADOPTS the modal's outcome
        // (no re-run) and shows the confirmation.
        await waitFor(() =>
            expect(within(dialog).getByRole('button', { name: 'Done' })).toBeInTheDocument()
        );
        fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
        await waitFor(() => {
            expect(within(row(MESH_NAME)).getByText('API access enabled')).toBeInTheDocument();
        });
        const ensureCalls = mockRequest.mock.calls.filter(
            ([type]) => type === 'ensure-mesh-api-subscribed'
        );
        expect(ensureCalls).toHaveLength(1);
    });
});
