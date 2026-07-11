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
    source: { owner: 'adobe', repo: 'commerce-mesh', branch: 'main' },
    requirement: 'optional',
} as unknown as SelectableAppBuilderComponent;

const ERP: AppBuilderComponentCatalogEntry = {
    id: 'erp-sync',
    name: 'ERP Sync',
    description: 'Sync orders with your ERP',
    kind: 'integration',
    source: { owner: 'adobe', repo: 'erp-sync', branch: 'main' },
    suggestedApis: ['CampaignSDK'],
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
const SIGNED_OUT: Partial<WizardState> = {
    adobeAuth: { isAuthenticated: false, isChecking: false },
    adobeOrg: undefined,
};
const COMMITTED_DEST: Partial<WizardState> = {
    adobeProject: PROJECT,
    adobeWorkspace: WORKSPACE,
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

/** kind → source-catalog → pick ERP → Continue (next stage depends on state). */
function walkCatalogPastPick(): void {
    click(/Integration Catalog/);
    click('Continue');
    click(/ERP Sync/);
    click('Continue');
}

async function waitForApiPicker(): Promise<void> {
    await waitFor(() => {
        expect(screen.getByText('Adobe Analytics')).toBeInTheDocument();
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
            screen.queryByRole('button', { name: /Integration Catalog/ })
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
        click(/Custom Integration/);
        expectEnabled('Continue');
        expectDisabled('Back');
    });
});

describe('AddIntegrationFlowModal — full mesh walk (first add)', () => {
    it('walks kind → project → workspace → in-modal API enable, then finishes through the mesh toggle', async () => {
        const { builder, updateSpy, onClose, onMeshEnableResult } = renderModal();
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
        // The api-access stage runs the idempotent enable INSIDE the modal,
        // against the just-committed destination + the stack's mesh axes.
        await waitFor(() => {
            expect(mockRequest).toHaveBeenCalledWith('ensure-mesh-api-subscribed', {
                orgId: 'org-1',
                projectId: 'p-picked',
                workspaceId: 'w-picked',
                backendId: 'backend-1',
                frontendId: 'frontend-1',
            });
        });
        // The outcome is handed up so the result row can adopt it (no re-run).
        await waitFor(() => {
            expect(onMeshEnableResult).toHaveBeenCalledWith({
                success: true,
                data: { apis: APIS },
            });
        });
        await waitFor(() => expectEnabled('Add Integration'));
        click('Add Integration');
        expect(builder.onAppBuilderComponentToggle).toHaveBeenCalledWith('commerce-mesh', true);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('the footer waits for the enable to settle (disabled while running)', async () => {
        let resolveEnable!: (value: unknown) => void;
        mockRequest.mockReturnValue(
            new Promise((res) => {
                resolveEnable = res;
            })
        );
        renderModal();
        walkMeshToProject();
        click('pick-project');
        click('Continue');
        click('pick-ws');
        click('Continue');
        await waitFor(() => expect(mockRequest).toHaveBeenCalled());
        expectDisabled('Add Integration');
        resolveEnable({ success: true, data: { apis: APIS } });
        await waitFor(() => expectEnabled('Add Integration'));
    });

    it('PREFETCHES the org APIs at the kind pick — picker ready at api-access, one spinner max', async () => {
        // The fetch fires the moment the pick is known, BEFORE the enable ever
        // starts — it can't starve behind the enable's 180s Adobe-session
        // budget, and by api-access the picker is ready (the only remaining
        // loading state is the summary's enable row).
        renderModal({ initial: COMMITTED_DEST });
        click(/API Mesh/);
        await waitFor(() => {
            expect(mockRequest).toHaveBeenCalledWith('list-org-console-apis', {
                componentIds: ['commerce-mesh'],
            });
        });
        expect(mockRequest).not.toHaveBeenCalledWith(
            'ensure-mesh-api-subscribed',
            expect.anything()
        );

        click('Continue');
        click('Continue');
        await waitForApiPicker();
        // The list resolved during the walk — no center loading spinner remains.
        expect(screen.queryByText('Loading Adobe APIs…')).not.toBeInTheDocument();
        expect(
            mockRequest.mock.calls.filter(([type]) => type === 'list-org-console-apis')
        ).toHaveLength(1);
    });

    it('a failed enable still loads the picker (locked display is independent)', async () => {
        mockRequest.mockImplementation((type: unknown) =>
            type === 'ensure-mesh-api-subscribed'
                ? Promise.resolve({ success: false, error: 'no permissions' })
                : Promise.resolve({ success: true, data: { apis: APIS } })
        );
        renderModal({ initial: COMMITTED_DEST });
        click(/API Mesh/);
        click('Continue');
        click('Continue');
        await waitForApiPicker();
        expect(screen.getByText('Failed')).toBeInTheDocument();
    });

    it('the mesh api-access stage is two-column: free picks center, enable row in the summary', async () => {
        renderModal({ initial: COMMITTED_DEST });
        click(/API Mesh/);
        click('Continue');
        click('Continue');
        await waitForApiPicker();
        // The picker fetch carries the mesh id so its requiredApis come back locked…
        expect(mockRequest).toHaveBeenCalledWith('list-org-console-apis', {
            componentIds: ['commerce-mesh'],
        });
        // …and locked APIs are NOT checkboxes: the required set lives in the
        // summary column, whose Applied section is the live enable row.
        expect(screen.queryByText('Mesh Gateway')?.closest('label') ?? null).toBeNull();
        expect(screen.getByText('Adobe Analytics').closest('label')).not.toBeNull();
        const applied = screen.getByTestId('api-summary-applied');
        expect(within(applied).getByText('API ACCESS', { exact: false })).toBeInTheDocument();
    });

    it('merges toggled mesh free picks under the mesh id on finish', async () => {
        const { builder, updateSpy } = renderModal({ initial: COMMITTED_DEST });
        click(/API Mesh/);
        click('Continue');
        click('Continue');
        await waitForApiPicker();
        const checkbox = screen
            .getByText('Adobe Analytics')
            .closest('label')
            ?.querySelector('input[type="checkbox"]') as HTMLInputElement;
        fireEvent.click(checkbox);
        await waitFor(() => expectEnabled('Add Integration'));
        click('Add Integration');
        expect(builder.onAppBuilderComponentToggle).toHaveBeenCalledWith('commerce-mesh', true);
        expect(updateSpy).toHaveBeenCalledWith({
            selectedConsoleApis: { 'commerce-mesh': ['AnalyticsSDK'] },
        });
    });

    it('a failed enable re-enables the footer (creation re-ensures idempotently)', async () => {
        // Only the ENABLE fails — the picker fetch succeeds (separate concerns).
        mockRequest.mockImplementation((type: unknown) =>
            type === 'ensure-mesh-api-subscribed'
                ? Promise.resolve({ success: false, error: 'no permissions' })
                : Promise.resolve({ success: true, data: { apis: APIS } })
        );
        const { onMeshEnableResult } = renderModal();
        walkMeshToProject();
        click('pick-project');
        click('Continue');
        click('pick-ws');
        click('Continue');
        await waitFor(() => expectEnabled('Add Integration'));
        expect(onMeshEnableResult).toHaveBeenCalledWith({
            success: false,
            error: 'no permissions',
        });
        expect(screen.getByText('Failed')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('Back from dest-project returns to the kind stage', () => {
        renderModal();
        walkMeshToProject();
        click('Back');
        expect(button(/API Mesh/)).toBeInTheDocument();
        expect(screen.queryByTestId('project-field')).not.toBeInTheDocument();
    });
});

describe('AddIntegrationFlowModal — later add (destination committed)', () => {
    it('mesh later-add walks summary → in-modal API enable → finish (no state writes)', async () => {
        const { builder, updateSpy, onClose } = renderModal({ initial: COMMITTED_DEST });
        click(/API Mesh/);
        click('Continue');
        expect(screen.getByText('Demo Project')).toBeInTheDocument();
        expect(screen.getByText('Stage')).toBeInTheDocument();
        click('Continue');
        await waitFor(() => {
            expect(mockRequest).toHaveBeenCalledWith(
                'ensure-mesh-api-subscribed',
                expect.objectContaining({ projectId: 'proj-1', workspaceId: 'ws-1' })
            );
        });
        await waitFor(() => expectEnabled('Add Integration'));
        click('Add Integration');
        expect(builder.onAppBuilderComponentToggle).toHaveBeenCalledWith('commerce-mesh', true);
        expect(updateSpy).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('catalog later-add walks summary → api-access → finish', async () => {
        const { builder, onClose } = renderModal({ initial: COMMITTED_DEST });
        walkCatalogPastPick();
        expect(screen.getByText('Demo Project')).toBeInTheDocument();
        click('Continue');
        await waitForApiPicker();
        click('Add Integration');
        expect(builder.onAppBuilderComponentToggle).toHaveBeenCalledWith('erp-sync', true);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Change on the destination summary re-enters dest-project', () => {
        renderModal({ initial: COMMITTED_DEST });
        click(/API Mesh/);
        click('Continue');
        click('Change');
        expect(screen.getByTestId('project-field')).toBeInTheDocument();
    });
});

describe('AddIntegrationFlowModal — catalog first-add walk', () => {
    it('gates Continue on the catalog stage until an entry is picked', () => {
        renderModal();
        click(/Integration Catalog/);
        click('Continue');
        expect(button(/ERP Sync/)).toBeInTheDocument();
        expect(button(/CRM Connect/)).toBeInTheDocument();
        expectDisabled('Continue');
        click(/ERP Sync/);
        expectEnabled('Continue');
    });

    it('walks the dest stages then fetches api-access with the pick + selected ids', async () => {
        renderModal({ initial: { selectedAppBuilderComponents: ['other-app'] } });
        walkCatalogPastPick();
        click('pick-project');
        click('Continue');
        click('pick-ws');
        click('Continue');
        await waitForApiPicker();
        expect(mockRequest).toHaveBeenCalledTimes(1);
        expect(mockRequest).toHaveBeenCalledWith('list-org-console-apis', {
            componentIds: ['erp-sync', 'other-app'],
        });
    });

    it("renders the Suggested group from the picked entry's suggestedApis", async () => {
        renderModal({ initial: COMMITTED_DEST });
        walkCatalogPastPick();
        click('Continue');
        await waitForApiPicker();
        expect(screen.getByText('Suggested')).toBeInTheDocument();
        expect(screen.getByText('Adobe Campaign')).toBeInTheDocument();
    });

    it('merges the toggled free APIs keyed by the entry id on finish', async () => {
        const { updateSpy } = renderModal({ initial: COMMITTED_DEST });
        walkCatalogPastPick();
        click('Continue');
        await waitForApiPicker();
        const checkbox = screen
            .getByText('Adobe Analytics')
            .closest('label')
            ?.querySelector('input[type="checkbox"]') as HTMLInputElement;
        fireEvent.click(checkbox);
        click('Add Integration');
        expect(updateSpy).toHaveBeenCalledWith({
            selectedConsoleApis: { 'erp-sync': ['AnalyticsSDK'] },
        });
    });
});

describe('AddIntegrationFlowModal — signed-out routing', () => {
    it('routes a signed-out add through dest-signin with a gated Continue', () => {
        renderModal({ initial: SIGNED_OUT });
        walkCatalogPastPick();
        expect(screen.getByTestId('adobe-auth-step')).toBeInTheDocument();
        expectDisabled('Continue');
    });
});

describe('AddIntegrationFlowModal — custom integration', () => {
    it('gates Continue until a valid URL and flags duplicates', () => {
        renderModal({ initial: { selectedAppBuilderComponents: ['acme-widget'] } });
        click(/Custom Integration/);
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
        click(/Custom Integration/);
        click('Continue');
        const input = screen.getByPlaceholderText('https://github.com/owner/repo');
        fireEvent.change(input, { target: { value: 'https://github.com/acme/widget' } });
        expectEnabled('Continue');

        fireEvent.change(input, { target: { value: '' } });
        expectDisabled('Continue');

        fireEvent.change(input, { target: { value: 'not-a-url' } });
        expectDisabled('Continue');
    });

    it('finishes a custom add through onAddCustomAppBuilderComponent', async () => {
        const { builder, onClose } = renderModal({ initial: COMMITTED_DEST });
        click(/Custom Integration/);
        click('Continue');
        const input = screen.getByPlaceholderText('https://github.com/owner/repo');
        fireEvent.change(input, { target: { value: 'https://github.com/acme/widget' } });
        click('Continue');
        expect(screen.getByText('Demo Project')).toBeInTheDocument();
        click('Continue');
        await waitForApiPicker();
        expect(mockRequest).toHaveBeenCalledWith('list-org-console-apis', {
            componentIds: ['acme-widget'],
        });
        click('Add Integration');
        expect(builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith({
            owner: 'acme',
            repo: 'widget',
        });
        expect(onClose).toHaveBeenCalledTimes(1);
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
        click(/Integration Catalog/);
        click('Continue');
        expect(button(/ERP Sync/)).toBeInTheDocument();
        setOpen(false);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        setOpen(true);
        expect(button(/Integration Catalog/)).toBeInTheDocument();
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
        // MeshApiEnableRow is public since Step 9: IntegrationsStep mounts it in
        // the mesh row's meshEnableSlot, and consumers import ONLY from index.ts.
        expect(Object.keys(index).sort()).toEqual([
            'AddIntegrationFlowModal',
            'IntegrationResultRow',
            'MeshApiEnableRow',
            'resolveIntegrationRows',
        ]);
        expect(typeof index.AddIntegrationFlowModal).toBe('function');
        expect(typeof index.IntegrationResultRow).toBe('function');
        expect(typeof index.MeshApiEnableRow).toBe('function');
        expect(typeof index.resolveIntegrationRows).toBe('function');
    });
});
