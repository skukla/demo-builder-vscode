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
/** Captured extension→webview listeners, keyed by type (drive progress in tests). */
const mockMessageHandlers: Record<string, (data: unknown) => void> = {};
jest.mock('@/core/ui/utils/vscode-api', () => ({
    webviewClient: {
        request: (...args: unknown[]) => mockMeshRequest(...args),
        postMessage: jest.fn(),
        onMessage: (type: string, handler: (data: unknown) => void) => {
            mockMessageHandlers[type] = handler;
            return () => delete mockMessageHandlers[type];
        },
    },
}));

beforeEach(() => {
    mockMeshRequest.mockReset();
    mockMeshRequest.mockResolvedValue({ success: true, data: { apis: [] } });
    for (const key of Object.keys(mockMessageHandlers)) delete mockMessageHandlers[key];
});

/** Stable empty catalog (module-level — avoids new-reference hook churn). */
const EMPTY_CATALOG: AppBuilderComponentCatalogEntry[] = [];

/** The blank starter app the "Build custom" kind commits. */
const BLANK_COMPONENT: AppBuilderComponentCatalogEntry = {
    id: 'app-builder-shell',
    name: 'App Builder App',
    description: 'A blank App Builder app to build out with AI',
    kind: 'integration',
    blank: true,
    source: { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' },
};

const MESH_ID = 'headless-commerce-mesh';
const MESH_COMPONENT = {
    id: MESH_ID,
    name: 'API Mesh',
    description: 'API Mesh for the headless stack',
    kind: 'mesh',
    source: { type: 'git', url: 'https://github.com/adobe/mesh', branch: 'main' },
    requirement: 'optional',
} as unknown as SelectableAppBuilderComponent;

const PROJECT: AdobeProject = { id: 'proj-1', name: 'proj-one', title: 'Project One' };
const OTHER_PROJECT: AdobeProject = { id: 'proj-2', name: 'proj-two', title: 'Project Two' };
const WORKSPACE: Workspace = { id: 'ws-1', name: 'Stage', title: 'Stage' };
/** The baseline API sdk code the enable subscribes (for progress-tick tests). */
const MGMT = 'AdobeIOManagementAPISDK';

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

    it('labels the mesh api-access step "Add API Access" (its action enables the APIs)', () => {
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
        // The mesh press ENABLES the APIs in-modal — not just "Add Integration".
        expect(s.result.current.continueLabel).toBe('Add API Access');
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

    /** Walk a mesh add all the way to the informational api-access step. */
    function walkMeshToApiAccess(s: Setup): void {
        walkMeshToDestWorkspace(s);
        act(() => s.result.current.setPendingWorkspace(WORKSPACE));
        act(() => s.result.current.onContinue());
        s.sync();
    }

    /** Press the footer primary on the api-access step (Add → enable, then Done → close). */
    async function finishMesh(s: Setup): Promise<void> {
        await act(async () => s.result.current.onContinue());
    }

    it('commits the pending workspace', () => {
        const s = setup();
        walkMeshToDestWorkspace(s);
        act(() => s.result.current.setPendingWorkspace(WORKSPACE));
        act(() => s.result.current.onContinue());
        expect(s.updateState).toHaveBeenCalledWith({ adobeWorkspace: WORKSPACE });
    });

    it('Add runs the enable and HOLDS on Done (no commit/close); Done then commits + closes', async () => {
        const s = setup();
        walkMeshToApiAccess(s);
        expect(s.result.current.stage).toBe('api-access');

        // First press (Add): runs the enable (enableComplete implies the request
        // resolved), then holds on the ✓ terminal state — footer becomes "Done",
        // nothing committed yet (a premature close is caught by the final count).
        await finishMesh(s);
        expect(s.result.current.enableComplete).toBe(true);
        expect(s.result.current.continueLabel).toBe('Done');
        expect(s.builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();

        // Second press (Done): commit + close.
        await finishMesh(s);
        expect(s.builder.onAppBuilderComponentToggle).toHaveBeenCalledWith(MESH_ID, true);
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });

    it('flips each API row done as its subscribe tick arrives during the enable', async () => {
        // The real handler pushes per-API ticks mid-request; drive one.
        mockMeshRequest.mockImplementation(async () => {
            mockMessageHandlers['mesh-api-subscribe-progress']?.({ code: MGMT, done: true });
            return { success: true, data: { apis: [] } };
        });
        const s = setup();
        walkMeshToApiAccess(s);
        await finishMesh(s);
        expect(s.result.current.enableDone).toEqual({ [MGMT]: true });
    });

    it('a failed mesh enable keeps the modal open (no commit, no close)', async () => {
        mockMeshRequest.mockResolvedValue({ success: false, error: 'nope' });
        const s = setup({ initial: { adobeProject: PROJECT, adobeWorkspace: WORKSPACE } });
        pickKindAndContinue(s, 'mesh');
        act(() => s.result.current.onContinue()); // → api-access
        await finishMesh(s);
        expect(s.result.current.enableError).toBe('nope');
        // The footer becomes the retry affordance (no "press Add…" text needed).
        expect(s.result.current.continueLabel).toBe('Retry');
        expect(s.builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();
        expect(s.onClose).not.toHaveBeenCalled();
    });

    it('finishes a later-add mesh from dest-summary → api-access (destination already committed)', async () => {
        const s = setup({ initial: { adobeProject: PROJECT, adobeWorkspace: WORKSPACE } });
        pickKindAndContinue(s, 'mesh');
        expect(s.result.current.stage).toBe('dest-summary');
        act(() => s.result.current.onContinue());
        expect(s.result.current.stage).toBe('api-access');
        await finishMesh(s); // Add → enable → holds on Done
        expect(s.onClose).not.toHaveBeenCalled();
        await finishMesh(s); // Done → commit + close
        expect(s.builder.onAppBuilderComponentToggle).toHaveBeenCalledWith(MESH_ID, true);
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

    it('build custom HOLDS on Done, Back un-confirms to revise, Done commits + closes', () => {
        const s = setup({ initial: COMMITTED_DEST });
        pickKindAndContinue(s, 'blank'); // blank has no source stage → straight to dest
        expect(s.result.current.stage).toBe('dest-summary');
        act(() => s.result.current.onContinue()); // → api-access
        act(() => s.result.current.toggleApi('FireflyServicesSDK'));
        // First press ("Add API Access") confirms in-modal — footer → Done, no commit/close.
        act(() => s.result.current.onContinue());
        expect(s.result.current.picksConfirmed).toBe(true);
        expect(s.result.current.continueLabel).toBe('Done');
        expect(s.builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();
        expect(s.onClose).not.toHaveBeenCalled();
        // Back un-confirms → the picker returns, picks preserved (nothing provisioned yet).
        expect(s.result.current.canGoBack).toBe(true);
        act(() => s.result.current.onBack());
        expect(s.result.current.picksConfirmed).toBe(false);
        expect(s.result.current.stage).toBe('api-access');
        expect(s.result.current.draft.selectedApis).toEqual(['FireflyServicesSDK']);
        // Re-confirm, then Done commits the shell + closes.
        act(() => s.result.current.onContinue());
        act(() => s.result.current.onContinue());
        const toggle = s.builder.onAppBuilderComponentToggle;
        expect(toggle).toHaveBeenCalledWith('app-builder-shell', true);
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });

    it('a "build custom" finish writes the picked APIs to selectedConsoleApis[shellId]', () => {
        const s = setup({ initial: COMMITTED_DEST });
        pickKindAndContinue(s, 'blank');
        act(() => s.result.current.onContinue()); // dest-summary → api-access
        act(() => s.result.current.toggleApi('FireflyServicesSDK')); // the user knows this up front
        act(() => s.result.current.onContinue()); // Add API Access → confirm
        act(() => s.result.current.onContinue()); // Done → finish
        expect(s.updateState).toHaveBeenCalledWith({
            selectedConsoleApis: { 'app-builder-shell': ['FireflyServicesSDK'] },
        });
    });

    it('a custom (import) finish commits the repo AND keys the picks under owner-repo', () => {
        const s = setup({ initial: COMMITTED_DEST });
        pickKindAndContinue(s, 'custom');
        act(() => s.result.current.setCustomSource({ owner: 'acme', repo: 'widget' }));
        act(() => s.result.current.onContinue()); // → dest-summary
        act(() => s.result.current.onContinue()); // → api-access
        act(() => s.result.current.toggleApi('FireflyServicesSDK'));
        act(() => s.result.current.onContinue()); // Add API Access → confirm
        act(() => s.result.current.onContinue()); // Done → finish
        expect(s.builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith({
            owner: 'acme',
            repo: 'widget',
        });
        expect(s.updateState).toHaveBeenCalledWith({
            selectedConsoleApis: { 'acme-widget': ['FireflyServicesSDK'] },
        });
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
