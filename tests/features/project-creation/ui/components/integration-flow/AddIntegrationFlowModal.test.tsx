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
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

async function waitForApiAccessStep(): Promise<void> {
    // The step is informational + static (no fetch), so it appears as soon as the
    // walk reaches it.
    await waitFor(() => {
        expect(screen.getByTestId('api-access-included')).toBeInTheDocument();
    });
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

    it('hides the mesh tile when mesh is already selected', () => {
        renderModal({ initial: { selectedAppBuilderComponents: ['commerce-mesh'] } });
        expect(screen.queryByRole('button', { name: /API Mesh/ })).not.toBeInTheDocument();
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
    it('walks kind → project → workspace → api-access (informational), then finishes', async () => {
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
        expect(screen.getByTestId('workspace-field')).toBeInTheDocument();
        click('pick-ws');
        click('Continue');
        expect(updateSpy).toHaveBeenCalledWith({
            adobeWorkspace: { id: 'w-picked', name: 'Stage', title: 'Stage' },
        });
        // api-access: informational only — the mesh's required API + baseline show
        // as "always on"; nothing is provisioned or selected here.
        await waitForApiAccessStep();
        const included = screen.getByTestId('api-access-included');
        expect(within(included).getByText('API Mesh')).toBeInTheDocument();
        expect(within(included).getByText('I/O Management API')).toBeInTheDocument();
        expect(mockRequest).not.toHaveBeenCalledWith(
            'ensure-mesh-api-subscribed',
            expect.anything()
        );
        // Add is ready immediately (informational stage never gates the footer).
        expectEnabled('Add API Access');
        click('Add API Access');
        // The mesh enable runs IN the modal on Add (not deferred to the result row).
        await waitFor(() =>
            expect(mockRequest).toHaveBeenCalledWith(
                'ensure-mesh-api-subscribed',
                expect.objectContaining({ workspaceId: 'w-picked' })
            )
        );
        // Success HOLDS on the ✓ terminal state (footer → Done); nothing committed yet.
        await waitFor(() => expectEnabled('Done'));
        expect(builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
        // Done → commit + close.
        click('Done');
        await waitFor(() =>
            expect(builder.onAppBuilderComponentToggle).toHaveBeenCalledWith('commerce-mesh', true)
        );
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('the mesh api-access stage is informational: facts only, no picker, no fetch', async () => {
        renderModal({ initial: COMMITTED_DEST });
        click(/API Mesh/);
        click('Continue'); // kind → dest-summary
        click('Continue'); // dest-summary → api-access
        await waitForApiAccessStep();
        // No org-API fetch, no checkboxes, no provisioning.
        expect(mockRequest).not.toHaveBeenCalledWith(
            'list-org-console-apis',
            expect.anything(),
            expect.anything()
        );
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        const included = screen.getByTestId('api-access-included');
        expect(within(included).getByText('API Mesh')).toBeInTheDocument();
        expect(within(included).getByText('I/O Management API')).toBeInTheDocument();
    });

    it('a mesh finish writes no selectedConsoleApis (deterministic API access)', async () => {
        const { builder, updateSpy } = renderModal({ initial: COMMITTED_DEST });
        click(/API Mesh/);
        click('Continue'); // kind → dest-summary
        click('Continue'); // dest-summary → api-access
        await waitForApiAccessStep();
        expectEnabled('Add API Access');
        click('Add API Access');
        await waitFor(() => expectEnabled('Done'));
        click('Done');
        await waitFor(() =>
            expect(builder.onAppBuilderComponentToggle).toHaveBeenCalledWith('commerce-mesh', true)
        );
        expect(updateSpy).not.toHaveBeenCalledWith(
            expect.objectContaining({ selectedConsoleApis: expect.anything() })
        );
    });

    it('a failed mesh enable keeps the modal open; the footer becomes Retry (no text instruction)', async () => {
        const { builder, onClose } = renderModal({ initial: COMMITTED_DEST });
        mockRequest.mockResolvedValue({ success: false, error: 'needs Developer role' });
        click(/API Mesh/);
        click('Continue');
        click('Continue');
        await waitForApiAccessStep();
        click('Add API Access');
        // Error surfaces; nothing committed, modal stays open, footer becomes "Retry"
        // (the button IS the retry affordance — no "press Add Integration…" instruction).
        await waitFor(() => expect(screen.getByText(/needs Developer role/i)).toBeInTheDocument());
        expect(screen.queryByText(/press Add Integration to try again/i)).not.toBeInTheDocument();
        await waitFor(() => expectEnabled('Retry'));
        expect(builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
        // Retry succeeds → holds on Done → commit + close.
        mockRequest.mockResolvedValue({ success: true, data: { apis: [] } });
        click('Retry');
        await waitFor(() => expectEnabled('Done'));
        click('Done');
        await waitFor(() =>
            expect(builder.onAppBuilderComponentToggle).toHaveBeenCalledWith('commerce-mesh', true)
        );
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Back from dest-project returns to the kind stage', () => {
        renderModal();
        walkMeshToProject();
        click('Back');
        expect(button(/API Mesh/)).toBeInTheDocument();
        expect(screen.queryByTestId('project-field')).not.toBeInTheDocument();
    });
});
