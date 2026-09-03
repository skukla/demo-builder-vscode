/**
 * IntegrationsStep Tests (Integrations flow redesign — Step 9)
 *
 * The Integrations area body is RESULTS ONLY: an area heading (no sub-step rail),
 * an empty state when nothing is configured, ONE destination line above the list,
 * one shared `IntegrationCard` per configured integration (resolved from wizard
 * state — including a PACKAGE-SEEDED mesh arriving via
 * selectedAppBuilderComponents, the single mesh authority since D3), and an
 * accent "Add Integration" button hosting
 * the AddIntegrationFlowModal journey.
 *
 * Spectrum comes from the repo-wide stub (`tests/__mocks__/@adobe/react-spectrum`),
 * which renders every Menu EAGERLY and inline. So a card's kebab items are in the
 * DOM from the first render and there is one `role="menu"` PER CARD — a bare
 * `getByRole('menu')` finds them all. Always scope to the card: `pickMenuItem`
 * does.
 *
 * Graybox: the integration-flow module and useProjectBuilder are REAL — only
 * module-external boundaries are mocked (webviewClient, useProjectCreationPhases,
 * AdobeAuthStep, AdobeEntityFields, and one appended catalog entry).
 *
 */

import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';

import { change, press, settle } from '../../../../helpers/reactSettle';
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
jest.mock('@/features/components/services/appBuilderComponentCatalogLoader', () => {
    const actual = jest.requireActual(
        '@/features/components/services/appBuilderComponentCatalogLoader'
    );
    const reco = {
        id: 'cat-reco',
        name: 'Recommendations',
        description: 'Personalized product recommendations',
        kind: 'integration',
        requiredApis: ['AnalyticsSDK'],
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

/** The stack's mesh catalog entry (real catalog). */
const MESH_ID = 'eds-commerce-mesh';
const MESH_NAME = 'EDS Commerce API Mesh';

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

async function renderStep(state: WizardState, updateState = jest.fn()) {
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
    // Mount effects fire requests; settle so their responses commit inside
    // act() rather than in the next query's wait loop.
    await settle();
    return { updateState };
}

/** The shared `.integration-card` root, addressed by its name text. */
function row(name: string): HTMLElement {
    return screen.getByText(name).closest('.integration-card') as HTMLElement;
}

/**
 * The surface's ONE destination line. Deliberately not scoped to a card: that
 * it is not per-card is the point, and `getBy*` throws on a second match, so
 * this helper fails loudly if the per-row repetition ever comes back.
 */
function destinationLine(): HTMLElement {
    return document.querySelector('.int-destination') as HTMLElement;
}

/**
 * A card's kebab menu — scoped to that card.
 *
 * The Spectrum stub renders menus eagerly and inline, so every card contributes
 * its own `role="menu"`. Scoping is mandatory, not tidiness: an unscoped query
 * throws "Found multiple elements" the moment a second card exists.
 */
function menuOf(cardEl: HTMLElement): HTMLElement {
    return within(cardEl).getByRole('menu');
}

/** Press one item in a card's kebab. */
async function pickMenuItem(cardEl: HTMLElement, label: RegExp): Promise<void> {
    await press(within(menuOf(cardEl)).getByRole('menuitem', { name: label }));
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
    it('renders the Integrations area heading with NO sub-step rail', async () => {
        await renderStep(baseState());
        expect(screen.getByText('Integrations')).toBeInTheDocument();
        expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    });

    it('shows the empty state and the Add Integration button when nothing is configured', async () => {
        await renderStep(baseState());
        expect(screen.getByText('No integrations yet.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add Integration' })).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not render the old deployable type-rows', async () => {
        await renderStep(baseState());
        expect(screen.queryByText('Pre-built integration')).not.toBeInTheDocument();
        expect(screen.queryByText('Import a repo')).not.toBeInTheDocument();
        expect(screen.queryByText('API Mesh')).not.toBeInTheDocument();
    });

    it('hides the empty state once a row exists', async () => {
        await renderStep(baseState({ selectedAppBuilderComponents: [MESH_ID] }));
        expect(screen.queryByText('No integrations yet.')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add Integration' })).toBeInTheDocument();
    });
});

describe('IntegrationsStep — result cards from state', () => {
    it('renders a selected mesh as a card, with the destination unset', async () => {
        await renderStep(baseState({ selectedAppBuilderComponents: [MESH_ID] }));
        expect(row(MESH_NAME)).not.toBeNull();
        expect(within(destinationLine()).getByText('Not set')).toBeInTheDocument();
        expect(
            within(destinationLine()).getByRole('button', { name: 'Set up' })
        ).toBeInTheDocument();
    });

    it('renders a PACKAGE-SEEDED mesh (arriving via selectedAppBuilderComponents) as a card', async () => {
        // onStackSelect seeds a required mesh into selectedAppBuilderComponents (D3).
        await renderStep(baseState({ selectedAppBuilderComponents: [MESH_ID] }));
        expect(row(MESH_NAME)).not.toBeNull();
        expect(within(destinationLine()).getByText('Not set')).toBeInTheDocument();
    });

    // The destination is ONE project and ONE workspace for the whole build. It
    // used to print on every card, identically. `getByText` throws on a second
    // match, so these two assertions fail if the repetition returns.
    it('shows the committed destination ONCE, above the cards, with Change', async () => {
        await renderStep(baseState({ ...CUSTOM_ADDED, ...COMMITTED_DEST }));
        expect(screen.getByText('Demo Project · Stage')).toBeInTheDocument();
        expect(
            within(destinationLine()).getByRole('button', { name: 'Change' })
        ).toBeInTheDocument();
    });

    it('prints the destination once even with several integrations configured', async () => {
        await renderStep(
            baseState({
                ...COMMITTED_DEST,
                selectedAppBuilderComponents: [MESH_ID, 'cat-reco', 'acme-widget'],
                appBuilderComponentSources: { 'acme-widget': { owner: 'acme', repo: 'widget' } },
            })
        );
        expect(screen.getAllByText('Demo Project · Stage')).toHaveLength(1);
        expect(document.querySelectorAll('.integration-card').length).toBeGreaterThan(1);
    });

    it('puts the source line and API count in the card subline', async () => {
        await renderStep(baseState({ ...CUSTOM_ADDED, ...COMMITTED_DEST }));
        const custom = row('widget');
        expect(
            within(custom).getByText(/Custom integration · acme\/widget · 1 API$/)
        ).toBeInTheDocument();
        expect(screen.queryByText('API access enabled')).not.toBeInTheDocument();
    });

    it('renders a catalog integration card from its catalog entry', async () => {
        await renderStep(baseState({ selectedAppBuilderComponents: ['cat-reco'] }));
        const reco = row('Recommendations');
        expect(
            within(reco).getByText(/Personalized product recommendations · 2 APIs$/)
        ).toBeInTheDocument();
    });

    it('renders a card for a committed blank "Build custom" app', async () => {
        // Regression: the blank shell was resolved against the blank-FILTERED catalog,
        // so a committed "Build custom" app produced no row.
        await renderStep(baseState({ selectedAppBuilderComponents: ['app-builder-shell'] }));
        expect(row('Custom Integration')).not.toBeNull();
    });

    // The count replaces the old collapsible "APIs in use" list. The NAMES now
    // live one click away in the picker (Manage APIs), so only the count is
    // pinned on the face.
    it('counts baseline + picks on a custom card', async () => {
        await renderStep(
            baseState({
                ...CUSTOM_ADDED,
                selectedConsoleApis: { 'acme-widget': ['AnalyticsSDK', 'CampaignSDK'] },
            })
        );
        // baseline + 2 picks
        expect(within(row('widget')).getByText(/· 3 APIs$/)).toBeInTheDocument();
    });

    it('counts baseline + requiredApis on a catalog card', async () => {
        await renderStep(baseState({ selectedAppBuilderComponents: ['cat-reco'] }));
        expect(within(row('Recommendations')).getByText(/· 2 APIs$/)).toBeInTheDocument();
    });

    it('counts a committed mesh without ever subscribing', async () => {
        await renderStep(
            baseState({
                selectedAppBuilderComponents: [MESH_ID],
                ...SIGNED_IN,
                ...COMMITTED_DEST,
            })
        );
        expect(within(row(MESH_NAME)).getByText(/· 2 APIs$/)).toBeInTheDocument();
        // The step must NOT issue a subscribe (re-mounting via Continue→Back
        // would otherwise "re-enable").
        expect(mockRequest).not.toHaveBeenCalledWith(
            'ensure-mesh-api-subscribed',
            expect.anything()
        );
    });

    // Deterministic APIs are not editable, and a card with nothing to open must
    // not claim to be a control (IntegrationCard drops role/tabIndex without
    // onOpen).
    it('offers Manage APIs on custom cards only', async () => {
        await renderStep(
            baseState({
                ...COMMITTED_DEST,
                selectedAppBuilderComponents: [MESH_ID, 'cat-reco', 'acme-widget'],
                appBuilderComponentSources: { 'acme-widget': { owner: 'acme', repo: 'widget' } },
            })
        );

        const customMenu = menuOf(row('widget'));
        expect(
            within(customMenu).getByRole('menuitem', { name: /Manage APIs/i })
        ).toBeInTheDocument();

        const meshMenu = menuOf(row(MESH_NAME));
        expect(within(meshMenu).queryByRole('menuitem', { name: /Manage APIs/i })).toBeNull();
    });

    it('leaves mesh and catalog cards non-interactive (no dead control)', async () => {
        await renderStep(
            baseState({
                ...COMMITTED_DEST,
                selectedAppBuilderComponents: [MESH_ID, 'acme-widget'],
                appBuilderComponentSources: { 'acme-widget': { owner: 'acme', repo: 'widget' } },
            })
        );
        expect(row(MESH_NAME)).not.toHaveAttribute('role');
        expect(row('widget')).toHaveAttribute('role', 'button');
    });
});

describe('IntegrationsStep — modal wiring', () => {
    it('the Add Integration button opens the flow modal in add mode', async () => {
        await renderStep(baseState());
        await press(screen.getByRole('button', { name: 'Add Integration' }));
        const dialog = screen.getByRole('dialog');
        expect(
            within(dialog).getByRole('heading', { name: 'Add Integration' })
        ).toBeInTheDocument();
        // The kind picker renders inside the journey.
        expect(
            within(dialog).getByRole('button', { name: /Pre-built integration/ })
        ).toBeInTheDocument();
    });

    it("the destination line's Set up opens the modal in destination mode", async () => {
        await renderStep(baseState({ selectedAppBuilderComponents: [MESH_ID], ...SIGNED_IN }));
        await press(within(destinationLine()).getByRole('button', { name: 'Set up' }));
        const dialog = screen.getByRole('dialog');
        expect(
            within(dialog).getByRole('heading', { name: 'Deployment Destination' })
        ).toBeInTheDocument();
        expect(within(dialog).getByTestId('project-field')).toBeInTheDocument();
    });

    it("the destination line's Change opens the modal in destination mode", async () => {
        await renderStep(baseState({ ...CUSTOM_ADDED, ...COMMITTED_DEST, ...SIGNED_IN }));
        await press(within(destinationLine()).getByRole('button', { name: 'Change' }));
        const dialog = screen.getByRole('dialog');
        expect(
            within(dialog).getByRole('heading', { name: 'Deployment Destination' })
        ).toBeInTheDocument();
        expect(within(dialog).getByTestId('project-field')).toBeInTheDocument();
    });

    it("a custom card's Manage APIs opens the modal in api-edit mode (the picker)", async () => {
        await renderStep(baseState({ ...CUSTOM_ADDED, ...COMMITTED_DEST, ...SIGNED_IN }));
        await pickMenuItem(row('widget'), /Manage APIs/i);
        const dialog = await screen.findByRole('dialog');
        expect(
            within(dialog).getByRole('heading', { name: 'Edit API Access' })
        ).toBeInTheDocument();
        expect(within(dialog).getByTestId('api-picker-stage')).toBeInTheDocument();
    });

    it('pressing a custom card opens the same picker (its only detail)', async () => {
        await renderStep(baseState({ ...CUSTOM_ADDED, ...COMMITTED_DEST, ...SIGNED_IN }));
        await press(row('widget'));
        const dialog = await screen.findByRole('dialog');
        expect(
            within(dialog).getByRole('heading', { name: 'Edit API Access' })
        ).toBeInTheDocument();
    });

    it('the optional-name stage shows NO collision errors — identity is minted at commit', async () => {
        // Optional-name model (owner, 2026-08-27): the label is a convenience;
        // a colliding label is deduped silently at mint time, so the stage has
        // no error affordance at all.
        await renderStep(baseState());
        await press(screen.getByRole('button', { name: 'Add Integration' }));
        const dialog = screen.getByRole('dialog');
        await press(within(dialog).getByRole('button', { name: /Build custom/ }));
        await press(within(dialog).getByRole('button', { name: 'Continue' }));
        const input = within(dialog).getByLabelText(/Name \(optional\)/);
        const DUPLICATE = 'That name is already used by another part of this project.';
        await change(input, 'App Builder Shell');
        expect(within(dialog).queryByText(DUPLICATE)).not.toBeInTheDocument();
        expect(within(dialog).getByRole('button', { name: 'Continue' })).toBeEnabled();
    });
});

describe('IntegrationsStep — Rename (AI-built instance rows only)', () => {
    /** Two shell instances + an import + a mesh — the full affordance matrix. */
    const INSTANCES_ADDED: Partial<WizardState> = {
        selectedAppBuilderComponents: ['firefly-image-gen', 'order-sync', 'acme-widget'],
        appBuilderComponentSources: {
            'firefly-image-gen': {
                owner: 'skukla',
                repo: 'app-builder-shell',
                branch: 'main',
                name: 'Firefly Image Gen',
            },
            'order-sync': {
                owner: 'skukla',
                repo: 'app-builder-shell',
                branch: 'main',
                name: 'Order Sync',
            },
            'acme-widget': { owner: 'acme', repo: 'widget' },
        },
    };

    /** Start an inline rename on a card and return its editor field. */
    async function startRename(cardEl: HTMLElement): Promise<HTMLElement> {
        await press(within(cardEl).getByRole('button', { name: /rename/i }));
        return await within(cardEl).findByRole('textbox');
    }

    it('offers the rename pencil on instance cards only — never import, catalog, or mesh', async () => {
        await renderStep(
            baseState({
                ...INSTANCES_ADDED,
                selectedAppBuilderComponents: [
                    ...INSTANCES_ADDED.selectedAppBuilderComponents!,
                    'cat-reco',
                    MESH_ID,
                ],
            })
        );
        expect(
            within(row('Firefly Image Gen')).getByRole('button', { name: /rename/i })
        ).toBeInTheDocument();
        expect(within(row('widget')).queryByRole('button', { name: /rename/i })).toBeNull();
        expect(
            within(row('Recommendations')).queryByRole('button', { name: /rename/i })
        ).toBeNull();
        expect(within(row(MESH_NAME)).queryByRole('button', { name: /rename/i })).toBeNull();
    });

    it('commits an inline rename, writing sources[id].name ONLY', async () => {
        const { updateState } = await renderStep(baseState(INSTANCES_ADDED));
        const field = await startRename(row('Firefly Image Gen'));
        expect(field).toHaveValue('Firefly Image Gen');

        await change(field, 'Firefly Video Gen');
        fireEvent.keyDown(field, { key: 'Enter' });

        // Display-name only: the id (source-map key), selection, and picks are untouched.
        await waitFor(() =>
            expect(updateState).toHaveBeenCalledWith({
                appBuilderComponentSources: {
                    ...INSTANCES_ADDED.appBuilderComponentSources,
                    'firefly-image-gen': {
                        owner: 'skukla',
                        repo: 'app-builder-shell',
                        branch: 'main',
                        name: 'Firefly Video Gen',
                    },
                },
            })
        );
    });

    it("rejects another card's display name inline, writing nothing", async () => {
        const { updateState } = await renderStep(baseState(INSTANCES_ADDED));
        const field = await startRename(row('Firefly Image Gen'));

        await change(field, 'order sync');
        fireEvent.keyDown(field, { key: 'Enter' });

        expect(
            await screen.findByText('That name is already used by another integration.')
        ).toBeInTheDocument();
        expect(updateState).not.toHaveBeenCalled();
    });

    // `InlineRenameField` cancels an empty or unchanged name before the host's
    // commit ever runs — the house behaviour everywhere the pencil appears. So an
    // empty name writes nothing and simply leaves edit mode; there is no message,
    // and the step carries no branch for one.
    it('discards an empty name without writing', async () => {
        const { updateState } = await renderStep(baseState(INSTANCES_ADDED));
        const field = await startRename(row('Firefly Image Gen'));

        await change(field, '   ');
        fireEvent.keyDown(field, { key: 'Enter' });

        await waitFor(() =>
            expect(within(row('Firefly Image Gen')).queryByRole('textbox')).toBeNull()
        );
        expect(updateState).not.toHaveBeenCalled();
    });

    it('Escape discards the rename without writing', async () => {
        const { updateState } = await renderStep(baseState(INSTANCES_ADDED));
        const field = await startRename(row('Order Sync'));

        await change(field, 'Something Else');
        fireEvent.keyDown(field, { key: 'Escape' });

        expect(updateState).not.toHaveBeenCalled();
    });
});

// Remove moved from a face button to a kebab item with the card. The ROUTING is
// what these pin, and it is unchanged: a mesh clears its selection (the single
// authority since D3 — no legacy dependency key exists to clear).
describe('IntegrationsStep — Remove routing', () => {
    it('mesh Remove routes through the component toggle (selection cleared)', async () => {
        const { updateState } = await renderStep(
            baseState({ selectedAppBuilderComponents: [MESH_ID] })
        );
        await pickMenuItem(row(MESH_NAME), /Remove/i);
        expect(updateState).toHaveBeenCalledWith({
            selectedAppBuilderComponents: [],
        });
    });

    it('custom Remove clears the selection AND its source', async () => {
        const { updateState } = await renderStep(baseState(CUSTOM_ADDED));
        await pickMenuItem(row('widget'), /Remove/i);
        expect(updateState).toHaveBeenCalledWith({
            selectedAppBuilderComponents: [],
            appBuilderComponentSources: {},
        });
    });

    it('catalog Remove routes through onRemoveAppBuilderComponent', async () => {
        const { updateState } = await renderStep(
            baseState({ selectedAppBuilderComponents: ['cat-reco'] })
        );
        await pickMenuItem(row('Recommendations'), /Remove/i);
        expect(updateState).toHaveBeenCalledWith({
            selectedAppBuilderComponents: [],
            appBuilderComponentSources: {},
        });
    });
});

describe('IntegrationsStep — mesh add commits without subscribing', () => {
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

    it('Add commits the mesh row immediately and NEVER subscribes in the modal', async () => {
        mockRequest.mockResolvedValue({ success: true });
        render(<StatefulStep />);
        // Mount effects fire requests; settle so their responses commit inside
        // act() rather than in the next query's wait loop.
        await settle();

        await press(screen.getByRole('button', { name: 'Add Integration' }));
        const dialog = screen.getByRole('dialog');
        await press(within(dialog).getByRole('button', { name: /API Mesh/ }));
        // A committed destination is a context LINE, not a step, and the deterministic
        // mesh has no api-access — so the KIND stage is terminal. Selection NEVER
        // provisions.
        await waitFor(() => {
            // The terminal stage just commits the integration — plain "Add Integration".
            expect(within(dialog).getByRole('button', { name: 'Add Integration' })).toHaveAttribute(
                'aria-disabled',
                'false'
            );
        });

        // A single Add press commits + closes; the card appears with its API count.
        await press(within(dialog).getByRole('button', { name: 'Add Integration' }));
        await waitFor(() => {
            expect(within(row(MESH_NAME)).getByText(/· 2 APIs$/)).toBeInTheDocument();
        });

        // The modal provisions nothing — the APIs subscribe later, at the rebuild.
        const ensureCalls = mockRequest.mock.calls.filter(
            ([type]) => type === 'ensure-mesh-api-subscribed'
        );
        expect(ensureCalls).toHaveLength(0);
    });
});
