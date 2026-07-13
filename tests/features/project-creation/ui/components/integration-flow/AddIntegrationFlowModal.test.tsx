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
    it('walks kind → project → workspace → api-access (Included, no provisioning), then finishes', async () => {
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
        // api-access: the required API shows in the Included summary; selection
        // NEVER provisions (no ensure-mesh-api-subscribed here).
        await waitForApiPicker();
        const included = screen.getByTestId('api-summary-included');
        // Included shows the curated SHORT label for the required API, not the
        // org list's verbose name ("Mesh Gateway") — stable + instant.
        expect(within(included).getByText('API Mesh')).toBeInTheDocument();
        expect(mockRequest).not.toHaveBeenCalledWith(
            'ensure-mesh-api-subscribed',
            expect.anything()
        );
        // The footer is not gated by any enable — Add is ready immediately.
        expectEnabled('Add Integration');
        click('Add Integration');
        expect(builder.onAppBuilderComponentToggle).toHaveBeenCalledWith('commerce-mesh', true);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('prefetches the org APIs at the kind pick and NEVER provisions during selection', async () => {
        renderModal({ initial: COMMITTED_DEST });
        click(/API Mesh/);
        await waitFor(() => {
            expect(mockRequest).toHaveBeenCalledWith(
                'list-org-console-apis',
                { componentIds: ['commerce-mesh'] },
                expect.any(Number)
            );
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
        // Still no provisioning after reaching (and standing on) the stage.
        expect(mockRequest).not.toHaveBeenCalledWith(
            'ensure-mesh-api-subscribed',
            expect.anything()
        );
    });

    it('the mesh api-access stage: free picks in the list, required in the Included summary', async () => {
        renderModal({ initial: COMMITTED_DEST });
        click(/API Mesh/);
        click('Continue');
        click('Continue');
        await waitForApiPicker();
        expect(mockRequest).toHaveBeenCalledWith(
            'list-org-console-apis',
            { componentIds: ['commerce-mesh'] },
            expect.any(Number)
        );
        // Locked (required) API is NOT a checkbox — it lives in the Included
        // summary under its curated short label; free APIs are checkboxes.
        expect(screen.queryByText('API Mesh')?.closest('label') ?? null).toBeNull();
        expect(screen.getByText('Adobe Analytics').closest('label')).not.toBeNull();
        const included = screen.getByTestId('api-summary-included');
        expect(within(included).getByText('API Mesh')).toBeInTheDocument();
    });

    it('the Included summary renders even if the org list errors (timeout-resilient)', async () => {
        mockRequest.mockImplementation((type: unknown) =>
            type === 'list-org-console-apis'
                ? Promise.resolve({ success: false, error: 'list timed out' })
                : Promise.resolve({ success: true, data: { apis: APIS } })
        );
        renderModal({ initial: COMMITTED_DEST });
        click(/API Mesh/);
        click('Continue');
        click('Continue');
        // The left degrades to an inline error…
        await waitFor(() => expect(screen.getByText('list timed out')).toBeInTheDocument());
        // …but Included shows the curated short label instantly — never the raw
        // sdkCode, so there's no code→name swap when the list eventually lands.
        const included = screen.getByTestId('api-summary-included');
        expect(within(included).getByText('API Mesh')).toBeInTheDocument();
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
        expectEnabled('Add Integration');
        click('Add Integration');
        expect(builder.onAppBuilderComponentToggle).toHaveBeenCalledWith('commerce-mesh', true);
        expect(updateSpy).toHaveBeenCalledWith({
            selectedConsoleApis: { 'commerce-mesh': ['AnalyticsSDK'] },
        });
    });

    it('Back from dest-project returns to the kind stage', () => {
        renderModal();
        walkMeshToProject();
        click('Back');
        expect(button(/API Mesh/)).toBeInTheDocument();
        expect(screen.queryByTestId('project-field')).not.toBeInTheDocument();
    });
});
