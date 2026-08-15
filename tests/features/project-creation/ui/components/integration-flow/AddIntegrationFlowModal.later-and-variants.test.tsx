/**
 * AddIntegrationFlowModal Tests (Integrations flow redesign — Step 7)
 *
 * The one-modal journey shell: a DialogContainer host with a CONDITIONAL mount
 * (the Spectrum test mock renders dialogs eagerly), the shared core Modal whose
 * Back/Continue footer is driven ENTIRELY by useIntegrationFlow, and a stage
 * switch mapping the hook's stage to the stage bodies. Graybox: the stages and
 * the ApiAccessPicker render REAL — only module-external boundaries are mocked
 * (webviewClient, useProjectCreationPhases, AdobeAuthStep, AdobeEntityFields).
 *
 * Reset-on-open is the conditional mount itself: closing unmounts the journey,
 * reopening mounts a fresh hook (pinned by the reopen test).
 *
 * @jest-environment jsdom
 */

import React, { useCallback, useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';

// --- module-external mocks --------------------------------------------------
const mockRequest = jest.fn();
jest.mock('@/core/ui/utils/vscode-api', () => ({
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
    AdobeProjectField: ({
        selectedProjectId,
        onProjectSelect,
    }: {
        selectedProjectId?: string;
        onProjectSelect?: (p: { id: string; name: string; title?: string }) => void;
    }) => (
        <div data-testid="project-field" data-selected={selectedProjectId ?? ''}>
            <button
                type="button"
                onClick={() =>
                    onProjectSelect?.({ id: 'p-picked', name: 'picked', title: 'Picked Project' })
                }
            >
                pick-project
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

import { AddIntegrationFlowModal } from '@/features/project-creation/ui/components/integration-flow/AddIntegrationFlowModal';
import type { FlowMode } from '@/features/project-creation/ui/components/integration-flow/flowStages';
import type { SelectableAppBuilderComponent } from '@/features/project-creation/services/appBuilderComponentSelection';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AdobeProject, WizardState, Workspace } from '@/types/webview';

// --- fixtures ----------------------------------------------------------------
const MESH = {
    id: 'commerce-mesh',
    name: 'API Mesh',
    description: 'Mesh for the stack',
    kind: 'mesh',
    requiredApis: ['GraphQLServiceSDK'],
    source: { owner: 'adobe', repo: 'commerce-mesh', branch: 'main' },
    requirement: 'optional',
} as unknown as SelectableAppBuilderComponent;

const ERP: AppBuilderComponentCatalogEntry = {
    id: 'erp-sync',
    name: 'ERP Sync',
    description: 'Sync orders with your ERP',
    kind: 'integration',
    source: { owner: 'adobe', repo: 'erp-sync', branch: 'main' },
};
const CRM: AppBuilderComponentCatalogEntry = {
    id: 'crm-connect',
    name: 'CRM Connect',
    description: 'Connect your CRM',
    kind: 'integration',
    source: { owner: 'adobe', repo: 'crm-connect', branch: 'main' },
};
const CATALOG = [ERP, CRM];

/** The composed collision domain the host threads in (blank naming). */
const RESERVED_IDS = new Set(['app-builder-shell', 'erp-sync', 'crm-connect', 'commerce-mesh']);

const PROJECT: AdobeProject = { id: 'proj-1', name: 'proj-one', title: 'Demo Project' };
const WORKSPACE: Workspace = { id: 'ws-1', name: 'Stage', title: 'Stage' };

const SIGNED_IN: Partial<WizardState> = {
    adobeAuth: { isAuthenticated: true, isChecking: false },
    adobeOrg: { id: 'org-1', code: 'ORG@AdobeOrg', name: 'Test Org' },
};
const SIGNED_OUT: Partial<WizardState> = {
    adobeAuth: { isAuthenticated: false, isChecking: false },
    adobeOrg: undefined,
};
const COMMITTED_DEST: Partial<WizardState> = {
    adobeProject: PROJECT,
    adobeWorkspace: WORKSPACE,
    // A committed shared destination co-occurs with an existing integration (later
    // add) — required for the destination to collapse to the summary rather than
    // re-walking the picker as a clean slate.
    selectedAppBuilderComponents: ['existing-integration'],
};

const APIS = [
    { code: 'GraphQLServiceSDK', name: 'Mesh Gateway', locked: true },
    { code: 'AnalyticsSDK', name: 'Adobe Analytics', locked: false },
    { code: 'CampaignSDK', name: 'Adobe Campaign', locked: false },
];

// --- phase-hook helper (DestinationStage's create/workspace flow) -------------
function setPhases(overrides: { phase?: string; phaseMessage?: string } = {}): void {
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
        ...overrides,
    });
}

// --- harness ------------------------------------------------------------------
function makeState(initial: Partial<WizardState> = {}): WizardState {
    return {
        currentStep: 'build-your-project',
        projectName: '',
        selectedPackage: 'citisignal',
        selectedStack: 'headless-paas',
        ...SIGNED_IN,
        ...initial,
    } as WizardState;
}

interface HarnessProps {
    isOpen: boolean;
    mode: FlowMode;
    initial?: Partial<WizardState>;
    meshComponent?: SelectableAppBuilderComponent;
    catalog: AppBuilderComponentCatalogEntry[];
    onClose: jest.Mock;
    builder: {
        onAppBuilderComponentToggle: jest.Mock;
        onAddCustomAppBuilderComponent: jest.Mock;
    };
    updateSpy: jest.Mock;
}

/** Hosts the modal over a REAL useState wizard state (commits re-render the tree). */
function Harness({
    isOpen,
    mode,
    initial,
    meshComponent,
    catalog,
    onClose,
    builder,
    updateSpy,
}: HarnessProps): React.ReactElement {
    const [state, setState] = useState<WizardState>(() => makeState(initial));
    const updateState = useCallback(
        (partial: Partial<WizardState>): void => {
            updateSpy(partial);
            setState((current) => ({ ...current, ...partial }));
        },
        [updateSpy]
    );
    return (
        <AddIntegrationFlowModal
            isOpen={isOpen}
            onClose={onClose}
            mode={mode}
            state={state}
            updateState={updateState}
            meshComponent={meshComponent}
            catalog={catalog}
            reservedIds={RESERVED_IDS}
            builder={builder}
        />
    );
}

interface RenderOptions {
    isOpen?: boolean;
    mode?: FlowMode;
    initial?: Partial<WizardState>;
    meshComponent?: SelectableAppBuilderComponent;
    catalog?: AppBuilderComponentCatalogEntry[];
}

function renderModal(options: RenderOptions = {}) {
    const onClose = jest.fn();
    const builder = {
        onAppBuilderComponentToggle: jest.fn(),
        onAddCustomAppBuilderComponent: jest.fn(),
    };
    const updateSpy = jest.fn();
    const meshComponent = 'meshComponent' in options ? options.meshComponent : MESH;
    const makeElement = (isOpen: boolean): React.ReactElement => (
        <Provider theme={defaultTheme} colorScheme="light">
            <Harness
                isOpen={isOpen}
                mode={options.mode ?? 'add'}
                initial={options.initial}
                meshComponent={meshComponent}
                catalog={options.catalog ?? CATALOG}
                onClose={onClose}
                builder={builder}
                updateSpy={updateSpy}
            />
        </Provider>
    );
    const view = render(makeElement(options.isOpen ?? true));
    return {
        onClose,
        builder,
        updateSpy,
        /** Rerender the tree (setOpen(true) doubles as a plain force-rerender). */
        setOpen: (open: boolean) => view.rerender(makeElement(open)),
    };
}

// --- interaction helpers -------------------------------------------------------
function button(name: string | RegExp): HTMLElement {
    return screen.getByRole('button', { name });
}

function click(name: string | RegExp): void {
    fireEvent.click(button(name));
}

function expectDisabled(name: string | RegExp): void {
    expect(button(name)).toHaveAttribute('aria-disabled', 'true');
}

function expectEnabled(name: string | RegExp): void {
    expect(button(name)).toHaveAttribute('aria-disabled', 'false');
}

/** kind → dest-project for a mesh add (signed in, nothing committed). */
function walkMeshToProject(): void {
    click(/API Mesh/);
    click('Continue');
}

/**
 * kind → source-catalog → pick ERP. Stops BEFORE the stage-advancing press,
 * because what that press DOES now depends on the destination: with one committed
 * the source stage is terminal (the press is "Add Integration"); without one it
 * advances to dest-project.
 */
function walkCatalogToPick(): void {
    click(/Pre-built integration/);
    click('Continue');
    click(/ERP Sync/);
}

beforeEach(() => {
    jest.clearAllMocks();
    setPhases();
    mockRequest.mockResolvedValue({ success: true, data: { apis: APIS } });
});

// --- tests -----------------------------------------------------------------------
describe('AddIntegrationFlowModal — later add (destination committed)', () => {
    it('mesh later-add: the KIND stage is terminal, then Add commits + closes (never subscribes)', () => {
        // No dest-summary step any more: a committed destination shows as a context
        // LINE, so picking the kind lands straight on the commit.
        const { builder, updateSpy, onClose } = renderModal({ initial: COMMITTED_DEST });
        click(/API Mesh/);
        expect(screen.getByText('Demo Project · Stage')).toBeInTheDocument();
        // The modal provisions nothing — Add commits + closes in one press.
        expect(screen.queryByTestId('api-access-included')).not.toBeInTheDocument();
        expectEnabled('Add Integration');
        click('Add Integration');
        expect(builder.onAppBuilderComponentToggle).toHaveBeenCalledWith('commerce-mesh', true);
        expect(mockRequest).not.toHaveBeenCalledWith(
            'ensure-mesh-api-subscribed',
            expect.anything()
        );
        expect(updateSpy).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('catalog later-add finishes on the SOURCE stage (no dest step, no api-access)', () => {
        const { builder, onClose } = renderModal({ initial: COMMITTED_DEST });
        walkCatalogToPick(); // kind → source-catalog → pick (terminal — dest is a line)
        expect(screen.getByText('Demo Project · Stage')).toBeInTheDocument();
        expect(screen.queryByTestId('api-access-included')).not.toBeInTheDocument();
        click('Add Integration');
        expect(builder.onAppBuilderComponentToggle).toHaveBeenCalledWith('erp-sync', true);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Change on the destination CONTEXT LINE re-enters dest-project', () => {
        renderModal({ initial: COMMITTED_DEST });
        click(/API Mesh/);
        click('Change');
        expect(screen.getByTestId('project-field')).toBeInTheDocument();
    });
});

describe('AddIntegrationFlowModal — catalog first-add walk', () => {
    it('gates Continue on the catalog stage until an entry is picked', () => {
        renderModal();
        click(/Pre-built integration/);
        click('Continue');
        expect(button(/ERP Sync/)).toBeInTheDocument();
        expect(button(/CRM Connect/)).toBeInTheDocument();
        expectDisabled('Continue');
        click(/ERP Sync/);
        expectEnabled('Continue');
    });

    it('walks the dest stages to the terminal workspace step — no api-access, no fetch', () => {
        renderModal({ initial: { selectedAppBuilderComponents: ['other-app'] } });
        walkCatalogToPick();
        click('Continue'); // no committed destination — advances to dest-project
        click('pick-project');
        click('Continue');
        click('pick-ws');
        // dest-workspace is terminal for the deterministic catalog kind — no
        // api-access step and no org-API list fetch.
        expect(screen.queryByTestId('api-access-included')).not.toBeInTheDocument();
        expect(mockRequest).not.toHaveBeenCalledWith(
            'list-org-console-apis',
            expect.anything(),
            expect.anything()
        );
        expectEnabled('Add Integration');
    });

    it('a catalog finish writes no selectedConsoleApis (deterministic API access)', () => {
        const { builder, updateSpy } = renderModal({ initial: COMMITTED_DEST });
        walkCatalogToPick(); // source-catalog is terminal (dest is a context line)
        click('Add Integration');
        expect(builder.onAppBuilderComponentToggle).toHaveBeenCalledWith('erp-sync', true);
        expect(updateSpy).not.toHaveBeenCalledWith(
            expect.objectContaining({ selectedConsoleApis: expect.anything() })
        );
    });
});

describe('AddIntegrationFlowModal — signed-out routing', () => {
    it('routes a signed-out add through dest-signin with a gated Continue', () => {
        renderModal({ initial: SIGNED_OUT });
        walkCatalogToPick();
        click('Continue'); // signed out — the destination stages still run as steps
        expect(screen.getByTestId('adobe-auth-step')).toBeInTheDocument();
        expectDisabled('Continue');
    });
});

describe('AddIntegrationFlowModal — custom integration', () => {
    it('gates Continue until a valid URL and flags duplicates', () => {
        renderModal({ initial: { selectedAppBuilderComponents: ['acme-widget'] } });
        click(/Import a repo/);
        click('Continue');
        const input = screen.getByPlaceholderText('https://github.com/owner/repo');
        fireEvent.change(input, { target: { value: 'https://github.com/acme/widget' } });
        expect(screen.getByText('This integration is already added.')).toBeInTheDocument();
        expectDisabled('Continue');
        fireEvent.change(input, { target: { value: 'https://github.com/acme/other' } });
        expectEnabled('Continue');
    });

    it('disables Continue again when a previously valid URL is cleared or invalidated', () => {
        renderModal({ initial: COMMITTED_DEST });
        click(/Import a repo/);
        click('Continue');
        const input = screen.getByPlaceholderText('https://github.com/owner/repo');
        fireEvent.change(input, { target: { value: 'https://github.com/acme/widget' } });
        expectEnabled('Continue');

        fireEvent.change(input, { target: { value: '' } });
        expectDisabled('Continue');

        fireEvent.change(input, { target: { value: 'not-a-url' } });
        expectDisabled('Continue');
    });

    it('finishes a custom add on Add (interactive picker, no confirmation hold)', async () => {
        const { builder, onClose } = renderModal({ initial: COMMITTED_DEST });
        click(/Import a repo/);
        click('Continue');
        const input = screen.getByPlaceholderText('https://github.com/owner/repo');
        fireEvent.change(input, { target: { value: 'https://github.com/acme/widget' } });
        // No dest step: source-custom advances straight to api-access, with the
        // committed destination riding along as the context line.
        click('Continue');
        expect(screen.getByText('Demo Project · Stage')).toBeInTheDocument();
        // Custom/import gets the INTERACTIVE picker (it can add any entitled API),
        // which fetches the org's list — not the informational deterministic panel.
        await waitFor(() => expect(screen.getByTestId('api-picker-stage')).toBeInTheDocument());
        expect(mockRequest).toHaveBeenCalledWith('list-org-console-apis', expect.anything());
        // Add commits the repo + closes in a SINGLE press — no in-modal confirmation.
        click('Add Integration');
        await waitFor(() =>
            expect(builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith({
                owner: 'acme',
                repo: 'widget',
            })
        );
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

describe('AddIntegrationFlowModal — org-API prefetch (warm the cache)', () => {
    it('fires exactly one list-org-console-apis warm request when opened signed in', () => {
        renderModal();
        const warmCalls = mockRequest.mock.calls.filter(
            ([type]) => type === 'list-org-console-apis'
        );
        expect(warmCalls).toHaveLength(1);
        expect(warmCalls[0]).toEqual(['list-org-console-apis', { componentIds: [] }]);
    });

    it('does not warm the cache while the modal is closed', () => {
        renderModal({ isOpen: false });
        expect(mockRequest).not.toHaveBeenCalledWith('list-org-console-apis', expect.anything());
    });

    it('does not warm the cache when signed out', () => {
        renderModal({ initial: SIGNED_OUT });
        expect(mockRequest).not.toHaveBeenCalledWith('list-org-console-apis', expect.anything());
    });
});

describe('AddIntegrationFlowModal — destination mode', () => {
    it('walks project → workspace and Saves without builder calls', () => {
        const { builder, updateSpy, onClose } = renderModal({ mode: 'destination' });
        click('pick-project');
        click('Continue');
        expect(screen.getByTestId('workspace-field')).toBeInTheDocument();
        click('pick-ws');
        click('Save');
        expect(updateSpy).toHaveBeenCalledWith({
            adobeWorkspace: { id: 'w-picked', name: 'Stage', title: 'Stage' },
        });
        expect(builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();
        expect(builder.onAddCustomAppBuilderComponent).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

describe('AddIntegrationFlowModal — cancel & reopen', () => {
    it('Cancel calls onClose without builder calls or state writes', () => {
        const { builder, updateSpy, onClose } = renderModal();
        walkMeshToProject();
        click('pick-project');
        click('Cancel');
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(updateSpy).not.toHaveBeenCalled();
        expect(builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();
        expect(builder.onAddCustomAppBuilderComponent).not.toHaveBeenCalled();
    });

    it('reopening starts a fresh journey at the kind stage', () => {
        const { setOpen } = renderModal();
        click(/Pre-built integration/);
        click('Continue');
        expect(button(/ERP Sync/)).toBeInTheDocument();
        setOpen(false);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        setOpen(true);
        expect(button(/Pre-built integration/)).toBeInTheDocument();
        expectDisabled('Continue');
    });
});

describe('AddIntegrationFlowModal — phase-running bridge', () => {
    it('a running destination phase disables Continue (setPhaseRunning seam)', () => {
        const { setOpen } = renderModal();
        walkMeshToProject();
        click('pick-project');
        expectEnabled('Continue');
        setPhases({ phase: 'creating', phaseMessage: 'Creating project…' });
        setOpen(true);
        expect(screen.getByText('Creating project…')).toBeInTheDocument();
        expectDisabled('Continue');
    });
});

describe('integration-flow module index', () => {
    it('exposes exactly the public runtime API', () => {
        const index = require('@/features/project-creation/ui/components/integration-flow');
        // Every integration card lists its APIs uniformly (no per-kind mesh slot), so
        // the former MeshApiEnableRow export is gone; EnsureResult is a type-only export.
        // buildReservedIds joined the surface for shell instancing: the HOST composes
        // the blank-naming collision domain and threads it to the modal.
        // RESERVED_EXISTING_KEY joined when the '__existing__' literal was
        // deduplicated into flowStages: useWizardState (an OUTSIDE consumer)
        // seeds edit-mode selectedConsoleApis with it via this surface.
        // IntegrationResultRow and RenameIntegrationModal LEFT when the area
        // adopted the shared IntegrationCard: the card replaced the row, and the
        // card's inline pencil replaced the rename modal. toIntegrationCards and
        // sublineFor took their place — the pure producer feeding that card.
        expect(Object.keys(index).sort()).toEqual([
            'AddIntegrationFlowModal',
            'RESERVED_EXISTING_KEY',
            'buildReservedIds',
            'isApiEditable',
            'resolveIntegrationRows',
            'sublineFor',
            'toIntegrationCards',
        ]);
        expect(typeof index.AddIntegrationFlowModal).toBe('function');
        expect(typeof index.buildReservedIds).toBe('function');
        expect(typeof index.resolveIntegrationRows).toBe('function');
        expect(typeof index.toIntegrationCards).toBe('function');
        expect(typeof index.sublineFor).toBe('function');
        expect(typeof index.isApiEditable).toBe('function');
        expect(index.RESERVED_EXISTING_KEY).toBe('__existing__');
    });
});
