/**
 * useIntegrationFlow tests (Integrations flow redesign — Step 4)
 *
 * The stage-machine hook behind the Add Integration modal: walks the derived
 * stage order (flowStages), keeps a modal-local FlowDraft, commits the shared
 * Adobe I/O destination on the dest-stage Continues, and on the LAST stage
 * finishes through the UNCHANGED useProjectBuilder handlers (mesh/catalog
 * toggle, custom add). API access is deterministic — no per-integration API
 * picks are merged. Cancel is the modal closing without onContinue — draft
 * mutations never write wizard state.
 *
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import type { RenderHookResult } from '@testing-library/react';
import { useIntegrationFlow } from '@/features/project-creation/ui/components/integration-flow/useIntegrationFlow';
import type {
    UseIntegrationFlowArgs,
    UseIntegrationFlowReturn,
} from '@/features/project-creation/ui/components/integration-flow/useIntegrationFlow';
import type { FlowMode } from '@/features/project-creation/ui/components/integration-flow/flowStages';
import type { SelectableAppBuilderComponent } from '@/features/project-creation/services/appBuilderComponentSelection';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AdobeProject, WizardState, Workspace } from '@/types/webview';

/** The mesh enable (ensure-mesh-api-subscribed) runs on Add via webviewClient. */
const mockMeshRequest = jest.fn();
jest.mock('@/core/ui/utils/vscode-api', () => ({
    webviewClient: {
        request: (...args: unknown[]) => mockMeshRequest(...args),
        postMessage: jest.fn(),
        onMessage: jest.fn(() => () => {}),
    },
}));

beforeEach(() => {
    mockMeshRequest.mockReset();
    mockMeshRequest.mockResolvedValue({ success: true, data: { apis: [] } });
});

/** Stable empty catalog (module-level — avoids new-reference hook churn). */
const EMPTY_CATALOG: AppBuilderComponentCatalogEntry[] = [];

/** The blank starter app the "Start from scratch" kind commits. */
const BLANK_COMPONENT: AppBuilderComponentCatalogEntry = {
    id: 'app-builder-shell',
    name: 'App Builder App',
    description: 'A blank App Builder app to build out with AI',
    kind: 'integration',
    blank: true,
    source: { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' },
};

const MESH_COMPONENT = {
    id: 'headless-commerce-mesh',
    name: 'API Mesh',
    description: 'API Mesh for the headless stack',
    kind: 'mesh',
    source: { type: 'git', url: 'https://github.com/adobe/mesh', branch: 'main' },
    requirement: 'optional',
} as unknown as SelectableAppBuilderComponent;

const PROJECT: AdobeProject = { id: 'proj-1', name: 'proj-one', title: 'Project One' };
const OTHER_PROJECT: AdobeProject = { id: 'proj-2', name: 'proj-two', title: 'Project Two' };
const WORKSPACE: Workspace = { id: 'ws-1', name: 'Stage', title: 'Stage' };

const SIGNED_IN: Partial<WizardState> = {
    adobeAuth: { isAuthenticated: true, isChecking: false },
    adobeOrg: { id: 'org-1', code: 'ORG@AdobeOrg', name: 'Test Org' },
};

const SIGNED_OUT: Partial<WizardState> = {
    adobeAuth: { isAuthenticated: false, isChecking: false },
    adobeOrg: undefined,
};

interface SetupOptions {
    mode?: FlowMode;
    initial?: Partial<WizardState>;
    meshComponent?: SelectableAppBuilderComponent;
}

interface Setup {
    result: RenderHookResult<UseIntegrationFlowReturn, { state: WizardState }>['result'];
    /** Re-render the hook with the state accumulated by prior updateState calls. */
    sync: () => void;
    updateState: jest.Mock;
    builder: {
        onAppBuilderComponentToggle: jest.Mock;
        onAddCustomAppBuilderComponent: jest.Mock;
    };
    onClose: jest.Mock;
    stateRef: { current: WizardState };
}

/**
 * Render the hook over a controlled WizardState. updateState applies partials
 * to a mutable ref; `sync()` re-renders the hook with the accumulated state
 * (mirrors the wizard's reducer + re-render cycle).
 */
function setup(options: SetupOptions = {}): Setup {
    const { mode = 'add', initial = {}, meshComponent = MESH_COMPONENT } = options;
    const stateRef: { current: WizardState } = {
        current: {
            currentStep: 'build-your-project',
            projectName: '',
            selectedPackage: 'citisignal',
            selectedStack: 'headless-paas',
            ...SIGNED_IN,
            ...initial,
        } as WizardState,
    };
    const updateState = jest.fn((partial: Partial<WizardState>) => {
        stateRef.current = { ...stateRef.current, ...partial };
    });
    const builder = {
        onAppBuilderComponentToggle: jest.fn(),
        onAddCustomAppBuilderComponent: jest.fn(),
    };
    const onClose = jest.fn();

    const { result, rerender } = renderHook(
        ({ state }: { state: WizardState }) =>
            useIntegrationFlow({
                state,
                updateState,
                mode,
                meshComponent,
                catalog: EMPTY_CATALOG,
                blankComponent: BLANK_COMPONENT,
                builder,
                onClose,
            } as UseIntegrationFlowArgs),
        { initialProps: { state: stateRef.current } }
    );

    const sync = (): void => rerender({ state: stateRef.current });
    return { result, sync, updateState, builder, onClose, stateRef };
}

/** Pick a kind on the kind stage and Continue past it. */
function pickKindAndContinue(s: Setup, kind: 'mesh' | 'catalog' | 'blank' | 'custom'): void {
    act(() => s.result.current.pickKind(kind));
    act(() => s.result.current.onContinue());
}

/** Walk a signed-in catalog add to the dest-project stage. */
function walkCatalogToDestProject(s: Setup, catalogId = 'erp-sync'): void {
    pickKindAndContinue(s, 'catalog');
    act(() => s.result.current.pickCatalog(catalogId));
    act(() => s.result.current.onContinue());
}

describe('useIntegrationFlow — initial stage and kind walk (add mode)', () => {
    it('starts at the kind stage in add mode', () => {
        const s = setup();
        expect(s.result.current.stage).toBe('kind');
    });

    it('starts at dest-project in destination mode when signed in', () => {
        const s = setup({ mode: 'destination' });
        expect(s.result.current.stage).toBe('dest-project');
    });

    it('starts at dest-signin in destination mode when signed out', () => {
        const s = setup({ mode: 'destination', initial: SIGNED_OUT });
        expect(s.result.current.stage).toBe('dest-signin');
    });

    it('blocks Continue on the kind stage before a kind is picked', () => {
        const s = setup();
        expect(s.result.current.canContinue).toBe(false);
    });

    it('enables Continue once a kind is picked', () => {
        const s = setup();
        act(() => s.result.current.pickKind('catalog'));
        expect(s.result.current.canContinue).toBe(true);
    });

    it('makes onContinue a no-op while the gate fails (stage kept, no writes)', () => {
        const s = setup();
        act(() => s.result.current.onContinue());
        expect(s.result.current.stage).toBe('kind');
        expect(s.updateState).not.toHaveBeenCalled();
    });

    it('advances catalog kind to source-catalog', () => {
        const s = setup();
        pickKindAndContinue(s, 'catalog');
        expect(s.result.current.stage).toBe('source-catalog');
    });

    it('blocks Continue on source-catalog until an entry is picked, then advances to dest-project', () => {
        const s = setup();
        pickKindAndContinue(s, 'catalog');
        expect(s.result.current.canContinue).toBe(false);
        act(() => s.result.current.pickCatalog('erp-sync'));
        act(() => s.result.current.onContinue());
        expect(s.result.current.stage).toBe('dest-project');
    });

    it('advances mesh kind straight to dest-project (no source stage)', () => {
        const s = setup();
        pickKindAndContinue(s, 'mesh');
        expect(s.result.current.stage).toBe('dest-project');
    });

    it('routes a signed-out catalog add through dest-signin and gates Continue there', () => {
        const s = setup({ initial: SIGNED_OUT });
        pickKindAndContinue(s, 'catalog');
        act(() => s.result.current.pickCatalog('erp-sync'));
        act(() => s.result.current.onContinue());
        expect(s.result.current.stage).toBe('dest-signin');
        expect(s.result.current.canContinue).toBe(false);
    });

    it('clamps forward off dest-signin when the user signs in mid-flow', () => {
        const s = setup({ initial: SIGNED_OUT });
        pickKindAndContinue(s, 'catalog');
        act(() => s.result.current.pickCatalog('erp-sync'));
        act(() => s.result.current.onContinue());
        expect(s.result.current.stage).toBe('dest-signin');
        s.stateRef.current = { ...s.stateRef.current, ...SIGNED_IN } as WizardState;
        s.sync();
        expect(s.result.current.stage).toBe('dest-project');
    });
});

describe('useIntegrationFlow — footer surfaces', () => {
    it('labels Continue mid-flow', () => {
        const s = setup();
        expect(s.result.current.continueLabel).toBe('Continue');
    });

    it('labels the last add-mode stage (api-access — mesh included) Add Integration', () => {
        const s = setup();
        pickKindAndContinue(s, 'mesh');
        act(() => s.result.current.setPendingProject(PROJECT));
        act(() => s.result.current.onContinue());
        s.sync();
        expect(s.result.current.stage).toBe('dest-workspace');
        expect(s.result.current.continueLabel).toBe('Continue');
        act(() => s.result.current.setPendingWorkspace(WORKSPACE));
        act(() => s.result.current.onContinue());
        s.sync();
        expect(s.result.current.stage).toBe('api-access');
        expect(s.result.current.continueLabel).toBe('Add Integration');
    });

    it('labels the last destination-mode stage Save', () => {
        const s = setup({
            mode: 'destination',
            initial: { adobeProject: PROJECT },
        });
        act(() => s.result.current.onContinue());
        expect(s.result.current.stage).toBe('dest-workspace');
        expect(s.result.current.continueLabel).toBe('Save');
    });

    it('disables Back on the first stage', () => {
        const s = setup();
        expect(s.result.current.canGoBack).toBe(false);
    });

    it('enables Back mid-flow and walks back through the order', () => {
        const s = setup();
        pickKindAndContinue(s, 'catalog');
        expect(s.result.current.canGoBack).toBe(true);
        act(() => s.result.current.onBack());
        expect(s.result.current.stage).toBe('kind');
    });

    it('makes onBack a no-op on the first stage', () => {
        const s = setup();
        act(() => s.result.current.onBack());
        expect(s.result.current.stage).toBe('kind');
    });
});

describe('useIntegrationFlow — dest-project Continue', () => {
    it('commits the pending project and clears the workspace + cache', () => {
        const s = setup({
            initial: { adobeWorkspace: WORKSPACE, workspacesCache: [WORKSPACE] },
        });
        pickKindAndContinue(s, 'mesh');
        act(() => s.result.current.setPendingProject(PROJECT));
        act(() => s.result.current.onContinue());
        expect(s.updateState).toHaveBeenCalledWith({
            adobeProject: PROJECT,
            adobeWorkspace: undefined,
            workspacesCache: undefined,
        });
    });

    it('advances to dest-workspace after committing the project', () => {
        const s = setup();
        pickKindAndContinue(s, 'mesh');
        act(() => s.result.current.setPendingProject(PROJECT));
        act(() => s.result.current.onContinue());
        s.sync();
        expect(s.result.current.stage).toBe('dest-workspace');
    });

    it('advances without any write when the project is already committed and no pending exists', () => {
        const s = setup({ initial: { adobeProject: PROJECT } });
        pickKindAndContinue(s, 'mesh');
        expect(s.result.current.stage).toBe('dest-project');
        act(() => s.result.current.onContinue());
        expect(s.updateState).not.toHaveBeenCalled();
        expect(s.result.current.stage).toBe('dest-workspace');
    });

    it('does NOT clear the workspace when the pending project equals the committed one', () => {
        const s = setup({ initial: { adobeProject: PROJECT } });
        pickKindAndContinue(s, 'mesh');
        act(() => s.result.current.setPendingProject({ ...PROJECT }));
        act(() => s.result.current.onContinue());
        expect(s.updateState).not.toHaveBeenCalled();
        expect(s.result.current.stage).toBe('dest-workspace');
    });

    it('commits a DIFFERENT pending project over an already-committed one', () => {
        const s = setup({ initial: { adobeProject: PROJECT, adobeWorkspace: WORKSPACE } });
        // Committed destination → later-add summary; Change re-expands the dest stages.
        pickKindAndContinue(s, 'mesh');
        act(() => s.result.current.changeDestination());
        expect(s.result.current.stage).toBe('dest-project');
        act(() => s.result.current.setPendingProject(OTHER_PROJECT));
        act(() => s.result.current.onContinue());
        expect(s.updateState).toHaveBeenCalledWith({
            adobeProject: OTHER_PROJECT,
            adobeWorkspace: undefined,
            workspacesCache: undefined,
        });
    });

    it('blocks Continue while a destination phase is running (setPhaseRunning seam)', () => {
        const s = setup();
        pickKindAndContinue(s, 'mesh');
        act(() => s.result.current.setPendingProject(PROJECT));
        expect(s.result.current.canContinue).toBe(true);
        act(() => s.result.current.setPhaseRunning(true));
        expect(s.result.current.canContinue).toBe(false);
        act(() => s.result.current.setPhaseRunning(false));
        expect(s.result.current.canContinue).toBe(true);
    });
});

describe('useIntegrationFlow — dest-workspace Continue and mesh finish', () => {
    function walkMeshToDestWorkspace(s: Setup): void {
        pickKindAndContinue(s, 'mesh');
        act(() => s.result.current.setPendingProject(PROJECT));
        act(() => s.result.current.onContinue());
        s.sync();
    }

    it('commits the pending workspace', () => {
        const s = setup();
        walkMeshToDestWorkspace(s);
        act(() => s.result.current.setPendingWorkspace(WORKSPACE));
        act(() => s.result.current.onContinue());
        expect(s.updateState).toHaveBeenCalledWith({ adobeWorkspace: WORKSPACE });
    });

    it('finishes the mesh add: Add runs the enable, then toggle (meshId, true) + close', async () => {
        const s = setup();
        walkMeshToDestWorkspace(s);
        act(() => s.result.current.setPendingWorkspace(WORKSPACE));
        act(() => s.result.current.onContinue());
        // The workspace Continue advances to the informational api-access step — no finish yet.
        expect(s.builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();
        s.sync();
        expect(s.result.current.stage).toBe('api-access');
        // Add runs the mesh enable (async), then commits + closes on success.
        await act(async () => {
            s.result.current.onContinue();
        });
        expect(mockMeshRequest).toHaveBeenCalledWith(
            'ensure-mesh-api-subscribed',
            expect.anything()
        );
        expect(s.builder.onAppBuilderComponentToggle).toHaveBeenCalledWith(
            'headless-commerce-mesh',
            true
        );
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });

    it('a pick-less mesh finish writes no selectedConsoleApis', async () => {
        const s = setup();
        walkMeshToDestWorkspace(s);
        act(() => s.result.current.setPendingWorkspace(WORKSPACE));
        act(() => s.result.current.onContinue());
        s.sync();
        await act(async () => {
            s.result.current.onContinue();
        });
        expect(s.onClose).toHaveBeenCalledTimes(1);
        const wroteApis = s.updateState.mock.calls.some(
            ([partial]) => 'selectedConsoleApis' in (partial as Partial<WizardState>)
        );
        expect(wroteApis).toBe(false);
    });

    it('a failed mesh enable keeps the modal open (no commit, no close)', async () => {
        mockMeshRequest.mockResolvedValue({ success: false, error: 'nope' });
        const s = setup({ initial: { adobeProject: PROJECT, adobeWorkspace: WORKSPACE } });
        pickKindAndContinue(s, 'mesh');
        act(() => s.result.current.onContinue()); // → api-access
        await act(async () => {
            s.result.current.onContinue();
        });
        expect(s.result.current.enableError).toBe('nope');
        expect(s.builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();
        expect(s.onClose).not.toHaveBeenCalled();
    });

    it('finishes a later-add mesh from dest-summary → api-access (destination already committed)', async () => {
        const s = setup({ initial: { adobeProject: PROJECT, adobeWorkspace: WORKSPACE } });
        pickKindAndContinue(s, 'mesh');
        expect(s.result.current.stage).toBe('dest-summary');
        act(() => s.result.current.onContinue());
        expect(s.result.current.stage).toBe('api-access');
        await act(async () => {
            s.result.current.onContinue();
        });
        expect(s.builder.onAppBuilderComponentToggle).toHaveBeenCalledWith(
            'headless-commerce-mesh',
            true
        );
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });
});

describe('useIntegrationFlow — catalog/custom finish (deterministic, no API picks)', () => {
    const COMMITTED_DEST: Partial<WizardState> = {
        adobeProject: PROJECT,
        adobeWorkspace: WORKSPACE,
    };

    function walkCatalogToApiAccess(s: Setup, catalogId = 'erp-sync'): void {
        walkCatalogToDestProject(s, catalogId);
        expect(s.result.current.stage).toBe('dest-summary');
        act(() => s.result.current.onContinue());
        expect(s.result.current.stage).toBe('api-access');
    }

    it('finishes a catalog add: adds the component and writes NO selectedConsoleApis', () => {
        const s = setup({ initial: COMMITTED_DEST });
        walkCatalogToApiAccess(s);
        act(() => s.result.current.onContinue());
        expect(s.builder.onAppBuilderComponentToggle).toHaveBeenCalledWith('erp-sync', true);
        // API access is deterministic — the add flow never merges per-integration APIs.
        expect(s.updateState).not.toHaveBeenCalled();
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });

    it('finishes a "start from scratch" add: commits the blank shell component', () => {
        const s = setup({ initial: COMMITTED_DEST });
        // Blank has no source stage — kind pick goes straight to the destination.
        pickKindAndContinue(s, 'blank');
        expect(s.result.current.stage).toBe('dest-summary');
        act(() => s.result.current.onContinue()); // dest-summary → api-access
        expect(s.result.current.stage).toBe('api-access');
        act(() => s.result.current.onContinue()); // finish
        expect(s.builder.onAppBuilderComponentToggle).toHaveBeenCalledWith(
            'app-builder-shell',
            true
        );
        expect(s.builder.onAddCustomAppBuilderComponent).not.toHaveBeenCalled();
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });

    it('finishes a custom add: onAddCustomAppBuilderComponent, no API write', () => {
        const s = setup({ initial: COMMITTED_DEST });
        pickKindAndContinue(s, 'custom');
        expect(s.result.current.stage).toBe('source-custom');
        act(() => s.result.current.setCustomSource({ owner: 'acme', repo: 'widget' }));
        act(() => s.result.current.onContinue());
        expect(s.result.current.stage).toBe('dest-summary');
        act(() => s.result.current.onContinue());
        expect(s.result.current.stage).toBe('api-access');
        act(() => s.result.current.onContinue());
        expect(s.builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith({
            owner: 'acme',
            repo: 'widget',
        });
        expect(s.updateState).not.toHaveBeenCalled();
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });

    it('clears the draft source when setCustomSource receives undefined (cleared/invalid URL)', () => {
        const s = setup({ initial: COMMITTED_DEST });
        pickKindAndContinue(s, 'custom');
        act(() => s.result.current.setCustomSource({ owner: 'acme', repo: 'widget' }));
        expect(s.result.current.canContinue).toBe(true);

        act(() => s.result.current.setCustomSource(undefined));

        expect(s.result.current.draft.customSource).toBeUndefined();
        expect(s.result.current.canContinue).toBe(false);
    });

    it('finish commits then closes — draft reset is the shell mount seam, not the hook', () => {
        // The modal shell mounts the journey only while open, so closing
        // unmounts the hook; reopening mounts a fresh one (pinned by the
        // AddIntegrationFlowModal reopen test). The hook itself only closes.
        const s = setup({ initial: COMMITTED_DEST });
        walkCatalogToApiAccess(s);
        act(() => s.result.current.onContinue());
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });
});

describe('useIntegrationFlow — destination mode', () => {
    it('Save with an already-committed destination performs no writes, only onClose', () => {
        const s = setup({
            mode: 'destination',
            initial: { adobeProject: PROJECT, adobeWorkspace: WORKSPACE },
        });
        act(() => s.result.current.onContinue()); // dest-project (committed) → dest-workspace
        act(() => s.result.current.onContinue()); // dest-workspace (committed) → Save
        expect(s.updateState).not.toHaveBeenCalled();
        expect(s.builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();
        expect(s.builder.onAddCustomAppBuilderComponent).not.toHaveBeenCalled();
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });

    it('Change flow commits new pendings then Saves without a builder call', () => {
        const s = setup({
            mode: 'destination',
            initial: { adobeProject: PROJECT, adobeWorkspace: WORKSPACE },
        });
        act(() => s.result.current.setPendingProject(OTHER_PROJECT));
        act(() => s.result.current.onContinue());
        expect(s.updateState).toHaveBeenCalledWith({
            adobeProject: OTHER_PROJECT,
            adobeWorkspace: undefined,
            workspacesCache: undefined,
        });
        s.sync();
        expect(s.result.current.stage).toBe('dest-workspace');
        act(() => s.result.current.setPendingWorkspace(WORKSPACE));
        act(() => s.result.current.onContinue());
        expect(s.updateState).toHaveBeenCalledWith({ adobeWorkspace: WORKSPACE });
        expect(s.builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });
});

describe('useIntegrationFlow — changingDestination', () => {
    it('changeDestination re-expands the dest stages at dest-project and flags the draft', () => {
        const s = setup({ initial: { adobeProject: PROJECT, adobeWorkspace: WORKSPACE } });
        pickKindAndContinue(s, 'mesh');
        expect(s.result.current.stage).toBe('dest-summary');
        act(() => s.result.current.changeDestination());
        expect(s.result.current.draft.changingDestination).toBe(true);
        expect(s.result.current.stage).toBe('dest-project');
    });
});

describe('useIntegrationFlow — cancel path (draft-only, no commits)', () => {
    it('draft setters never write wizard state', () => {
        const s = setup();
        act(() => s.result.current.pickKind('catalog'));
        act(() => s.result.current.pickCatalog('erp-sync'));
        act(() => s.result.current.setCustomSource({ owner: 'acme', repo: 'widget' }));
        act(() => s.result.current.setPendingProject(PROJECT));
        act(() => s.result.current.setPendingWorkspace(WORKSPACE));
        expect(s.updateState).not.toHaveBeenCalled();
        expect(s.builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();
        expect(s.builder.onAddCustomAppBuilderComponent).not.toHaveBeenCalled();
        expect(s.onClose).not.toHaveBeenCalled();
    });
});
