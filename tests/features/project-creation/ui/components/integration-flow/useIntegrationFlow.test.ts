/**
 * useIntegrationFlow tests (Integrations flow redesign — Step 4)
 *
 * The stage-machine hook behind the Add Integration modal: walks the derived
 * stage order (flowStages), keeps a modal-local FlowDraft, commits the shared
 * Adobe I/O destination on the dest-stage Continues, and on the LAST stage
 * finishes through the UNCHANGED useProjectBuilder handlers (mesh/catalog
 * toggle, custom add). API access is deterministic and the modal provisions
 * NOTHING — every kind commits + closes immediately on Add; the APIs subscribe
 * later, at the rebuild/deploy. Cancel is the modal closing without onContinue —
 * draft mutations never write wizard state.
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

/**
 * The webview client is mocked so a test can assert the modal NEVER subscribes
 * (no `ensure-mesh-api-subscribed` request) — all provisioning moved to the rebuild.
 */
const mockRequest = jest.fn();
jest.mock('@/core/ui/utils/vscode-api', () => ({
    webviewClient: {
        request: (...args: unknown[]) => mockRequest(...args),
        postMessage: jest.fn(),
        onMessage: jest.fn(() => () => {}),
    },
}));

beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ success: true, data: { apis: [] } });
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
/**
 * A committed shared destination WITH an existing integration referencing it — the
 * realistic "later add" state. A committed destination alone (no integration) is a
 * clean slate that re-walks the picker, so later-add tests must include one.
 */
const LATER_ADD: Partial<WizardState> = {
    adobeProject: PROJECT,
    adobeWorkspace: WORKSPACE,
    selectedAppBuilderComponents: ['existing-integration'],
};

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
    /** Catalog entries the flow can seed a custom build from (default empty). */
    catalog?: AppBuilderComponentCatalogEntry[];
    /** The minting collision domain (default: the blank shell's id, as buildReservedIds would). */
    reservedIds?: Set<string>;
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
    const {
        mode = 'add',
        initial = {},
        meshComponent = MESH_COMPONENT,
        catalog = EMPTY_CATALOG,
        reservedIds = new Set(['app-builder-shell']),
    } = options;
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
                catalog,
                reservedIds,
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

    it('labels the mesh dest-workspace step (terminal) with the plain add label', () => {
        const s = setup();
        pickKindAndContinue(s, 'mesh');
        expect(s.result.current.stage).toBe('dest-project');
        expect(s.result.current.continueLabel).toBe('Continue');
        act(() => s.result.current.setPendingProject(PROJECT));
        act(() => s.result.current.onContinue());
        s.sync();
        // dest-workspace is terminal for the deterministic mesh (no api-access step),
        // so its footer already reads the finish label — nothing provisioned here.
        expect(s.result.current.stage).toBe('dest-workspace');
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

    it('commits the pending workspace and finishes (dest-workspace is terminal for mesh)', () => {
        const s = setup();
        walkMeshToDestWorkspace(s);
        act(() => s.result.current.setPendingWorkspace(WORKSPACE));
        act(() => s.result.current.onContinue());
        expect(s.updateState).toHaveBeenCalledWith({ adobeWorkspace: WORKSPACE });
    });

    it('Add commits the mesh and closes immediately — no subscribe, no Done hold', () => {
        const s = setup();
        walkMeshToDestWorkspace(s);
        expect(s.result.current.stage).toBe('dest-workspace');
        act(() => s.result.current.setPendingWorkspace(WORKSPACE));

        // dest-workspace is terminal for the deterministic mesh (no api-access step):
        // a single Add press commits the workspace, toggles the mesh, and closes —
        // no enable request, no "Done" hold.
        act(() => s.result.current.onContinue());
        expect(s.updateState).toHaveBeenCalledWith({ adobeWorkspace: WORKSPACE });
        expect(s.builder.onAppBuilderComponentToggle).toHaveBeenCalledWith(MESH_ID, true);
        expect(s.onClose).toHaveBeenCalledTimes(1);
        // The modal provisions nothing — all APIs subscribe at the rebuild.
        expect(mockRequest).not.toHaveBeenCalledWith(
            'ensure-mesh-api-subscribed',
            expect.anything()
        );
    });

    it('finishes a later-add mesh from the KIND stage in one Add press', () => {
        const s = setup({ initial: LATER_ADD });
        // Later-add drops the destination stages entirely (it shows as a context
        // line), so the kind stage is terminal for the mesh.
        act(() => s.result.current.pickKind('mesh'));
        expect(s.result.current.stage).toBe('kind');
        act(() => s.result.current.onContinue()); // Add → commit + close
        expect(s.builder.onAppBuilderComponentToggle).toHaveBeenCalledWith(MESH_ID, true);
        expect(s.onClose).toHaveBeenCalledTimes(1);
        expect(mockRequest).not.toHaveBeenCalledWith(
            'ensure-mesh-api-subscribed',
            expect.anything()
        );
    });
});

describe('useIntegrationFlow — catalog/custom finish (deterministic, no API picks)', () => {
    /**
     * Walk a signed-in later-add catalog to its terminal stage — which is now
     * source-catalog: a committed destination is a context line, not a step.
     */
    function walkCatalogToTerminal(s: Setup, catalogId = 'erp-sync'): void {
        pickKindAndContinue(s, 'catalog');
        act(() => s.result.current.pickCatalog(catalogId));
        expect(s.result.current.stage).toBe('source-catalog');
    }

    it('finishes a catalog add from the SOURCE stage: adds it and writes NO selectedConsoleApis', () => {
        const s = setup({ initial: LATER_ADD });
        walkCatalogToTerminal(s);
        // source-catalog is terminal for the deterministic catalog — a single Add
        // press commits the component and closes (no dest step, no api-access).
        act(() => s.result.current.onContinue());
        expect(s.builder.onAppBuilderComponentToggle).toHaveBeenCalledWith('erp-sync', true);
        // API access is deterministic — the add flow never merges per-integration APIs.
        expect(s.updateState).not.toHaveBeenCalled();
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });

    it('a RENAMED catalog pick commits a named INSTANCE of the entry source (2026-08-27)', () => {
        // The option to name a pre-built: an edited name routes through the
        // same custom-add machinery the blank/seed path uses, carrying the
        // entry's repo — capabilities then survive via source recognition.
        const KIT_ENTRY: AppBuilderComponentCatalogEntry = {
            id: 'commerce-integration-starter-kit',
            name: 'Commerce Integration Starter Kit',
            description: 'The kit',
            kind: 'integration',
            source: { owner: 'adobe', repo: 'commerce-integration-starter-kit', branch: 'main' },
        };
        const s = setup({ initial: LATER_ADD, catalog: [KIT_ENTRY] });
        pickKindAndContinue(s, 'catalog');
        act(() => s.result.current.pickCatalog(KIT_ENTRY.id));
        act(() => s.result.current.setLabel('Order Sync'));
        act(() => s.result.current.onContinue());

        expect(s.builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith(KIT_ENTRY.source, {
            id: 'order-sync',
            name: 'Order Sync',
        });
        expect(s.builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });

    it('control: a KEPT default name (slug = entry id) still commits the catalog identity', () => {
        const KIT_ENTRY: AppBuilderComponentCatalogEntry = {
            id: 'commerce-integration-starter-kit',
            name: 'Commerce Integration Starter Kit',
            description: 'The kit',
            kind: 'integration',
            source: { owner: 'adobe', repo: 'commerce-integration-starter-kit', branch: 'main' },
        };
        const s = setup({ initial: LATER_ADD, catalog: [KIT_ENTRY] });
        pickKindAndContinue(s, 'catalog');
        act(() => s.result.current.pickCatalog(KIT_ENTRY.id));
        // No label typed: the default (the entry's own name) mints the entry's
        // own id — its id is excluded from its own collision domain.
        act(() => s.result.current.onContinue());

        expect(s.builder.onAppBuilderComponentToggle).toHaveBeenCalledWith(KIT_ENTRY.id, true);
        expect(s.builder.onAddCustomAppBuilderComponent).not.toHaveBeenCalled();
    });

    it('source-blank is answerable immediately — Blank is the default, the name optional', () => {
        const s = setup({ initial: LATER_ADD });
        pickKindAndContinue(s, 'blank');
        expect(s.result.current.stage).toBe('source-blank');
        expect(s.result.current.canContinue).toBe(true);
    });

    it('a SEEDED blank finish commits the seed source (not the shell) with the instance identity', () => {
        // The seed model: "Build custom" starting from the starter kit clones the
        // KIT's repo under the user's name; the blank shell is only the default.
        const KIT_SEED: AppBuilderComponentCatalogEntry = {
            id: 'commerce-integration-starter-kit',
            name: 'Commerce Integration Starter Kit',
            description: 'The kit',
            kind: 'integration',
            layout: 'extension',
            source: { owner: 'adobe', repo: 'commerce-integration-starter-kit', branch: 'main' },
        };
        const s = setup({ initial: LATER_ADD, catalog: [KIT_SEED] });
        pickKindAndContinue(s, 'blank');
        act(() => s.result.current.setSeed('commerce-integration-starter-kit'));
        act(() => s.result.current.setLabel('Order Sync'));
        act(() => s.result.current.onContinue()); // → api-access
        act(() => s.result.current.onContinue()); // Add → commit + close

        expect(s.builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith(KIT_SEED.source, {
            id: 'order-sync',
            name: 'Order Sync',
        });
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });

    it('clearing the seed returns the commit to the blank shell', () => {
        const KIT_SEED: AppBuilderComponentCatalogEntry = {
            id: 'commerce-integration-starter-kit',
            name: 'Commerce Integration Starter Kit',
            description: 'The kit',
            kind: 'integration',
            source: { owner: 'adobe', repo: 'commerce-integration-starter-kit', branch: 'main' },
        };
        const s = setup({ initial: LATER_ADD, catalog: [KIT_SEED] });
        pickKindAndContinue(s, 'blank');
        act(() => s.result.current.setSeed('commerce-integration-starter-kit'));
        act(() => s.result.current.setSeed(undefined));
        act(() => s.result.current.setLabel('My App'));
        act(() => s.result.current.onContinue());
        act(() => s.result.current.onContinue());

        expect(s.builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith(
            BLANK_COMPONENT.source,
            { id: 'my-app', name: 'My App' }
        );
    });

    it('a blank finish commits the INSTANCE id (not app-builder-shell) with picks keyed under it', () => {
        const s = setup({ initial: LATER_ADD });
        pickKindAndContinue(s, 'blank');
        act(() => s.result.current.setLabel('Firefly Image Gen'));
        act(() => s.result.current.onContinue()); // → api-access (no dest step)
        act(() => s.result.current.toggleApi('FireflyServicesSDK'));
        act(() => s.result.current.onContinue()); // Add → commit + close
        // The shell repo is a TEMPLATE: the commit routes through the custom add with
        // the instance identity — never the fixed-id toggle (which capped at one).
        expect(s.builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith(
            BLANK_COMPONENT.source,
            { id: 'firefly-image-gen', name: 'Firefly Image Gen' }
        );
        expect(s.builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();
        expect(s.updateState).toHaveBeenCalledWith({
            selectedConsoleApis: { 'firefly-image-gen': ['FireflyServicesSDK'] },
        });
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });

    it('a blank finish with no picks writes no selectedConsoleApis', () => {
        const s = setup({ initial: LATER_ADD });
        pickKindAndContinue(s, 'blank');
        act(() => s.result.current.setLabel('Order Sync'));
        act(() => s.result.current.onContinue()); // → api-access (no dest step)
        act(() => s.result.current.onContinue()); // Add → commit + close
        expect(s.builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith(
            BLANK_COMPONENT.source,
            { id: 'order-sync', name: 'Order Sync' }
        );
        expect(s.updateState).not.toHaveBeenCalled();
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });

    it('a custom (import) finish mints the repo-named instance; picks key under it', () => {
        // Optional-name model: the import defaults to the REPO's name (the
        // label field's placeholder), and picks key under the minted id.
        const s = setup({ initial: LATER_ADD });
        pickKindAndContinue(s, 'custom');
        act(() => s.result.current.setCustomSource({ owner: 'acme', repo: 'widget' }));
        act(() => s.result.current.onContinue()); // → api-access (no dest step)
        act(() => s.result.current.toggleApi('FireflyServicesSDK'));
        act(() => s.result.current.onContinue()); // Add → commit + close
        expect(s.builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith(
            { owner: 'acme', repo: 'widget' },
            { id: 'widget', name: 'widget' }
        );
        expect(s.updateState).toHaveBeenCalledWith({
            selectedConsoleApis: { widget: ['FireflyServicesSDK'] },
        });
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });

    it('a custom (import) finish honors a typed name', () => {
        const s = setup({ initial: LATER_ADD });
        pickKindAndContinue(s, 'custom');
        act(() => s.result.current.setCustomSource({ owner: 'acme', repo: 'widget' }));
        act(() => s.result.current.setLabel('Order Sync'));
        act(() => s.result.current.onContinue());
        act(() => s.result.current.onContinue());
        expect(s.builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith(
            { owner: 'acme', repo: 'widget' },
            { id: 'order-sync', name: 'Order Sync' }
        );
    });

    it('clears the draft source when setCustomSource receives undefined (cleared/invalid URL)', () => {
        const s = setup({ initial: LATER_ADD });
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
        const s = setup({ initial: LATER_ADD });
        // Change now comes from the context LINE, not a summary stage — the kind
        // stage is where a later-add mesh sits when it fires.
        act(() => s.result.current.pickKind('mesh'));
        expect(s.result.current.stage).toBe('kind');
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
        act(() => s.result.current.setLabel('Order Sync'));
        act(() => s.result.current.setPendingProject(PROJECT));
        act(() => s.result.current.setPendingWorkspace(WORKSPACE));
        expect(s.updateState).not.toHaveBeenCalled();
        expect(s.builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();
        expect(s.builder.onAddCustomAppBuilderComponent).not.toHaveBeenCalled();
        expect(s.onClose).not.toHaveBeenCalled();
    });
});
