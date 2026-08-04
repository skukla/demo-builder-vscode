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

/** The blank starter app the "Build custom" kind instances from. */
const BLANK: AppBuilderComponentCatalogEntry = {
    id: 'app-builder-shell',
    name: 'Custom Integration',
    description: 'A minimal custom integration to build out with AI',
    kind: 'integration',
    blank: true,
    source: { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' },
};

/** The composed collision domain IntegrationsStep threads in (catalog + selections). */
const RESERVED_IDS = new Set([
    'app-builder-shell',
    'erp-sync',
    'crm-connect',
    'commerce-mesh',
    'existing-integration',
    'eds-storefront',
]);

const PROJECT: AdobeProject = { id: 'proj-1', name: 'proj-one', title: 'Demo Project' };
const WORKSPACE: Workspace = { id: 'ws-1', name: 'Stage', title: 'Stage' };

const SIGNED_IN: Partial<WizardState> = {
    adobeAuth: { isAuthenticated: true, isChecking: false },
    adobeOrg: { id: 'org-1', code: 'ORG@AdobeOrg', name: 'Test Org' },
};
const COMMITTED_DEST: Partial<WizardState> = {
    adobeProject: PROJECT,
    adobeWorkspace: WORKSPACE,
    // A committed shared destination co-occurs with at least one existing integration
    // (the "later add" case). Without a referencing integration the flow treats the
    // destination as a clean slate and re-walks the picker instead of collapsing to
    // the summary, so a later-add fixture must include one.
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
    onMeshEnableResult: jest.Mock;
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
    onMeshEnableResult,
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
            blankComponent={BLANK}
            reservedIds={RESERVED_IDS}
            builder={builder}
            meshBackendId="backend-1"
            meshFrontendId="frontend-1"
            onMeshEnableResult={onMeshEnableResult}
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
    const onMeshEnableResult = jest.fn();
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
                onMeshEnableResult={onMeshEnableResult}
            />
        </Provider>
    );
    const view = render(makeElement(options.isOpen ?? true));
    return {
        onClose,
        builder,
        updateSpy,
        onMeshEnableResult,
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

beforeEach(() => {
    jest.clearAllMocks();
    setPhases();
    mockRequest.mockResolvedValue({ success: true, data: { apis: APIS } });
});

// --- tests -----------------------------------------------------------------------
describe('AddIntegrationFlowModal — host & shell', () => {
    it('renders nothing while closed (conditional mount under the eager dialog mock)', () => {
        renderModal({ isOpen: false });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /API Mesh/ })).not.toBeInTheDocument();
    });

    it('titles the add mode "Add Integration"', () => {
        renderModal();
        expect(screen.getByRole('heading', { name: 'Add Integration' })).toBeInTheDocument();
    });

    it('titles the destination mode "Deployment Destination" and skips the kind stage', () => {
        renderModal({ mode: 'destination' });
        expect(screen.getByRole('heading', { name: 'Deployment Destination' })).toBeInTheDocument();
        expect(screen.getByTestId('project-field')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /Pre-built integration/ })
        ).not.toBeInTheDocument();
    });

    it('renders the Cancel / Back / Continue footer', () => {
        renderModal();
        expect(button('Cancel')).toBeInTheDocument();
        expect(button('Back')).toBeInTheDocument();
        expect(button('Continue')).toBeInTheDocument();
    });
});

describe('AddIntegrationFlowModal — kind stage', () => {
    it('offers the mesh tile when the stack has an unadded mesh', () => {
        renderModal();
        expect(button(/API Mesh/)).toBeInTheDocument();
    });

    // Changed 2026-08-04: already-added DISABLES the tile rather than hiding it.
    // A vanished tile is ambiguous — it looks the same as a stack with no mesh at
    // all (the case immediately below, which still hides).
    it('disables the mesh tile, with a reason, when mesh is already selected', () => {
        renderModal({ initial: { selectedAppBuilderComponents: ['commerce-mesh'] } });
        expect(screen.getByRole('button', { name: /API Mesh/ })).toBeDisabled();
        expect(screen.getByText('Already added — one per project')).toBeInTheDocument();
    });

    it('hides the mesh tile when the stack has no mesh component', () => {
        renderModal({ meshComponent: undefined });
        expect(screen.queryByRole('button', { name: /API Mesh/ })).not.toBeInTheDocument();
    });

    it('disables Back and Continue at the unpicked kind stage; a pick enables Continue', () => {
        renderModal();
        expectDisabled('Back');
        expectDisabled('Continue');
        click(/Import a repo/);
        expectEnabled('Continue');
        expectDisabled('Back');
    });
});

describe('AddIntegrationFlowModal — full mesh walk (first add)', () => {
    it('walks kind → project → workspace (terminal), then commits on Add — no api-access step', async () => {
        const { builder, updateSpy, onClose } = renderModal();
        walkMeshToProject();
        expect(screen.getByTestId('project-field')).toBeInTheDocument();
        click('pick-project');
        click('Continue');
        expect(updateSpy).toHaveBeenCalledWith({
            adobeProject: { id: 'p-picked', name: 'picked', title: 'Picked Project' },
            adobeWorkspace: undefined,
            workspacesCache: undefined,
        });
        // dest-workspace is the TERMINAL stage for the deterministic mesh (no
        // api-access step): its footer button reads "Add Integration" and commits +
        // closes in a single press, which also commits the pending workspace.
        expect(screen.getByTestId('workspace-field')).toBeInTheDocument();
        click('pick-ws');
        expect(screen.queryByTestId('api-access-included')).not.toBeInTheDocument();
        expectEnabled('Add Integration');
        click('Add Integration');
        expect(updateSpy).toHaveBeenCalledWith({
            adobeWorkspace: { id: 'w-picked', name: 'Stage', title: 'Stage' },
        });
        // Add commits the mesh and closes in a SINGLE press — no subscribe (the APIs
        // are subscribed later, at the rebuild).
        expect(builder.onAppBuilderComponentToggle).toHaveBeenCalledWith('commerce-mesh', true);
        expect(mockRequest).not.toHaveBeenCalledWith(
            'ensure-mesh-api-subscribed',
            expect.anything()
        );
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('mesh later-add finishes on the KIND stage: no dest step, no api-access, no fetch', () => {
        renderModal({ initial: COMMITTED_DEST });
        click(/API Mesh/);
        // A committed destination is a context LINE, not a step, and the deterministic
        // mesh has no api-access — so picking the kind is the whole flow.
        expect(screen.queryByTestId('api-access-included')).not.toBeInTheDocument();
        expect(mockRequest).not.toHaveBeenCalledWith(
            'list-org-console-apis',
            expect.anything(),
            expect.anything()
        );
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        expectEnabled('Add Integration');
    });

    it('a mesh finish writes no selectedConsoleApis and never subscribes', () => {
        const { builder, updateSpy } = renderModal({ initial: COMMITTED_DEST });
        click(/API Mesh/); // kind is terminal — dest is a line, mesh has no api-access
        expectEnabled('Add Integration');
        click('Add Integration');
        expect(builder.onAppBuilderComponentToggle).toHaveBeenCalledWith('commerce-mesh', true);
        expect(mockRequest).not.toHaveBeenCalledWith(
            'ensure-mesh-api-subscribed',
            expect.anything()
        );
        expect(updateSpy).not.toHaveBeenCalledWith(
            expect.objectContaining({ selectedConsoleApis: expect.anything() })
        );
    });

    it('Back from dest-project returns to the kind stage', () => {
        renderModal();
        walkMeshToProject();
        click('Back');
        expect(button(/API Mesh/)).toBeInTheDocument();
        expect(screen.queryByTestId('project-field')).not.toBeInTheDocument();
    });
});

describe('AddIntegrationFlowModal — build custom (blank instance naming)', () => {
    const NAME_PLACEHOLDER = 'e.g. Order Sync, Salesforce CRM, Firefly Image Gen';

    /** kind → source-blank (the naming stage). */
    function walkToBlankNaming(): HTMLElement {
        click(/Build custom/);
        click('Continue');
        return screen.getByPlaceholderText(NAME_PLACEHOLDER);
    }

    it('gates Continue on the naming stage until a valid name is typed', () => {
        renderModal({ initial: COMMITTED_DEST });
        const input = walkToBlankNaming();
        expectDisabled('Continue');
        fireEvent.change(input, { target: { value: 'Firefly Image Gen' } });
        expectEnabled('Continue');
        fireEvent.change(input, { target: { value: '' } });
        expectDisabled('Continue');
    });

    it('flags a name colliding with a reserved id inline and keeps Continue disabled', () => {
        renderModal({ initial: COMMITTED_DEST });
        const input = walkToBlankNaming();
        // Slugs to 'app-builder-shell' — the blank catalog id itself is reserved
        // (the executor's catalog-first lookup would clone the wrong repo).
        fireEvent.change(input, { target: { value: 'App Builder Shell' } });
        expect(
            screen.getByText('That name is already used by another part of this project.')
        ).toBeInTheDocument();
        expectDisabled('Continue');
        fireEvent.change(input, { target: { value: 'Firefly Image Gen' } });
        expectEnabled('Continue');
    });

    it('walks kind → source-blank → api-access and commits the named instance', async () => {
        const { builder, updateSpy, onClose } = renderModal({ initial: COMMITTED_DEST });
        const input = walkToBlankNaming();
        fireEvent.change(input, { target: { value: 'Firefly Image Gen' } });
        // Straight to api-access: the committed destination rides along as the
        // context line instead of costing a step.
        click('Continue');
        expect(screen.getByText('Demo Project · Stage')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByTestId('api-picker-stage')).toBeInTheDocument());
        click('Add Integration');
        // The commit routes through the custom add with the INSTANCE identity —
        // never the fixed-id toggle (which capped a project at one shell).
        await waitFor(() =>
            expect(builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith(
                { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' },
                { id: 'firefly-image-gen', name: 'Firefly Image Gen' }
            )
        );
        expect(builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();
        expect(updateSpy).not.toHaveBeenCalledWith(
            expect.objectContaining({
                selectedConsoleApis: expect.objectContaining({
                    'app-builder-shell': expect.anything(),
                }),
            })
        );
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
