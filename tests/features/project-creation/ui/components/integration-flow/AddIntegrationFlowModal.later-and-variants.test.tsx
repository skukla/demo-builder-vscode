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
    click(/Pre-built integration/);
    click('Continue');
    click(/ERP Sync/);
    click('Continue');
}

async function waitForApiAccessStep(): Promise<void> {
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
describe('AddIntegrationFlowModal — later add (destination committed)', () => {
    it('mesh later-add: informational step, then Add runs the enable in the modal → finish', async () => {
        const { builder, updateSpy, onClose } = renderModal({ initial: COMMITTED_DEST });
        click(/API Mesh/);
        click('Continue');
        expect(screen.getByText('Demo Project')).toBeInTheDocument();
        expect(screen.getByText('Stage')).toBeInTheDocument();
        click('Continue');
        await waitForApiAccessStep();
        // Nothing provisioned until Add is pressed.
        expect(mockRequest).not.toHaveBeenCalledWith(
            'ensure-mesh-api-subscribed',
            expect.anything()
        );
        expectEnabled('Add API Access');
        click('Add API Access');
        // The enable runs in the modal, then holds on the ✓ terminal state (Done).
        await waitFor(() =>
            expect(mockRequest).toHaveBeenCalledWith(
                'ensure-mesh-api-subscribed',
                expect.anything()
            )
        );
        await waitFor(() => expectEnabled('Done'));
        // Done → commit + close.
        click('Done');
        await waitFor(() =>
            expect(builder.onAppBuilderComponentToggle).toHaveBeenCalledWith('commerce-mesh', true)
        );
        expect(updateSpy).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('catalog later-add walks summary → api-access → finish', async () => {
        const { builder, onClose } = renderModal({ initial: COMMITTED_DEST });
        walkCatalogPastPick();
        expect(screen.getByText('Demo Project')).toBeInTheDocument();
        click('Continue');
        await waitForApiAccessStep();
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
        click(/Pre-built integration/);
        click('Continue');
        expect(button(/ERP Sync/)).toBeInTheDocument();
        expect(button(/CRM Connect/)).toBeInTheDocument();
        expectDisabled('Continue');
        click(/ERP Sync/);
        expectEnabled('Continue');
    });

    it('walks the dest stages then reaches the informational api-access step (no fetch)', async () => {
        renderModal({ initial: { selectedAppBuilderComponents: ['other-app'] } });
        walkCatalogPastPick();
        click('pick-project');
        click('Continue');
        click('pick-ws');
        click('Continue');
        await waitForApiAccessStep();
        // Deterministic — no org-API list is fetched anymore.
        expect(mockRequest).not.toHaveBeenCalledWith(
            'list-org-console-apis',
            expect.anything(),
            expect.anything()
        );
    });

    it('a catalog finish writes no selectedConsoleApis (deterministic API access)', async () => {
        const { builder, updateSpy } = renderModal({ initial: COMMITTED_DEST });
        walkCatalogPastPick();
        click('Continue');
        await waitForApiAccessStep();
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
        walkCatalogPastPick();
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

    it('holds on a ✓ confirmation, then finishes a custom add on Done', async () => {
        const { builder, onClose } = renderModal({ initial: COMMITTED_DEST });
        click(/Import a repo/);
        click('Continue');
        const input = screen.getByPlaceholderText('https://github.com/owner/repo');
        fireEvent.change(input, { target: { value: 'https://github.com/acme/widget' } });
        click('Continue');
        expect(screen.getByText('Demo Project')).toBeInTheDocument();
        click('Continue');
        // Custom/import gets the INTERACTIVE picker (it can add any entitled API),
        // which fetches the org's list — not the informational deterministic panel.
        await waitFor(() => expect(screen.getByTestId('api-picker-stage')).toBeInTheDocument());
        expect(mockRequest).toHaveBeenCalledWith('list-org-console-apis', expect.anything());
        // Add API Access HOLDS on an in-modal ✓ confirmation (parity with mesh) —
        // no commit/close yet; the footer becomes Done.
        click('Add API Access');
        await waitFor(() => expect(screen.getByTestId('api-picker-confirmed')).toBeInTheDocument());
        expect(builder.onAddCustomAppBuilderComponent).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
        // Done commits + closes.
        click('Done');
        await waitFor(() =>
            expect(builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith({
                owner: 'acme',
                repo: 'widget',
            })
        );
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
