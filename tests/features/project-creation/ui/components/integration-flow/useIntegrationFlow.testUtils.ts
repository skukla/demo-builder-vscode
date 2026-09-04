/**
 * The harness both useIntegrationFlow suites build, and only that.
 *
 * Their `setup()` functions are genuinely different — the base suite takes a
 * mode, a mesh component, a catalog and a reserved-id set, and returns a `sync`
 * that re-renders; the api-edit suite takes an edit target and never re-renders.
 * Neither is a variant of the other and merging them would produce a helper with
 * an options bag nobody reads in full.
 *
 * What they DO share, identically, is the controlled-state harness underneath:
 * a mutable `stateRef`, an `updateState` that applies partials to it, and the
 * two builder callbacks. That is what lives here.
 *
 * The api-edit suite's `SIGNED_IN` is deliberately NOT here. It carries a project
 * and a workspace because its flow needs a committed destination, so sharing the
 * bare name while the content differs is how a fixture starts lying — the add-mode
 * one below is exported under its own name, `ADD_SIGNED_IN`.
 *
 * The add-mode `setupAddFlow` IS here, because two suites now render it: the base
 * stage-walk suite and the finish suite split out of it.
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

/** The two `useProjectBuilder` handlers the flow finishes through. */
export interface FlowBuilderStub {
    onAppBuilderComponentToggle: jest.Mock;
    onAddCustomAppBuilderComponent: jest.Mock;
}

export interface FlowHarness {
    /** Mutable current state — `updateState` writes here, a re-render reads it. */
    stateRef: { current: WizardState };
    updateState: jest.Mock;
    builder: FlowBuilderStub;
    onClose: jest.Mock;
}

/**
 * A controlled WizardState plus the callbacks the hook writes through.
 *
 * `updateState` applies partials to `stateRef` rather than replacing it, which
 * is what lets a suite re-render the hook with everything the flow has written
 * so far — the wizard's reducer-and-re-render cycle, in miniature.
 *
 * @param base - the fields this flow needs on top of an empty wizard state
 */
export function makeFlowHarness(base: Partial<WizardState>): FlowHarness {
    const stateRef: { current: WizardState } = {
        current: {
            currentStep: 'build-your-project',
            projectName: '',
            selectedPackage: 'citisignal',
            selectedStack: 'headless-paas',
            ...base,
        } as WizardState,
    };
    const updateState = jest.fn((partial: Partial<WizardState>) => {
        stateRef.current = { ...stateRef.current, ...partial };
    });
    return {
        stateRef,
        updateState,
        builder: {
            onAppBuilderComponentToggle: jest.fn(),
            onAddCustomAppBuilderComponent: jest.fn(),
        },
        onClose: jest.fn(),
    };
}

// --- add-mode fixtures -------------------------------------------------------

/** Stable empty catalog (module-level — avoids new-reference hook churn). */
export const EMPTY_CATALOG: AppBuilderComponentCatalogEntry[] = [];

/** The blank starter app the "Build custom" kind commits. */
export const BLANK_COMPONENT: AppBuilderComponentCatalogEntry = {
    id: 'app-builder-shell',
    name: 'App Builder App',
    description: 'A blank App Builder app to build out with AI',
    kind: 'integration',
    blank: true,
    source: { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' },
};

export const MESH_ID = 'headless-commerce-mesh';
export const MESH_COMPONENT = {
    id: MESH_ID,
    name: 'API Mesh',
    description: 'API Mesh for the headless stack',
    kind: 'mesh',
    source: { type: 'git', url: 'https://github.com/adobe/mesh', branch: 'main' },
    requirement: 'optional',
} as unknown as SelectableAppBuilderComponent;

export const PROJECT: AdobeProject = { id: 'proj-1', name: 'proj-one', title: 'Project One' };
export const OTHER_PROJECT: AdobeProject = { id: 'proj-2', name: 'proj-two', title: 'Project Two' };
export const WORKSPACE: Workspace = { id: 'ws-1', name: 'Stage', title: 'Stage' };

/**
 * A committed shared destination WITH an existing integration referencing it — the
 * realistic "later add" state. A committed destination alone (no integration) is a
 * clean slate that re-walks the picker, so later-add tests must include one.
 */
export const LATER_ADD: Partial<WizardState> = {
    adobeProject: PROJECT,
    adobeWorkspace: WORKSPACE,
    selectedAppBuilderComponents: ['existing-integration'],
};

export const ADD_SIGNED_IN: Partial<WizardState> = {
    adobeAuth: { isAuthenticated: true, isChecking: false },
    adobeOrg: { id: 'org-1', code: 'ORG@AdobeOrg', name: 'Test Org' },
};

export const ADD_SIGNED_OUT: Partial<WizardState> = {
    adobeAuth: { isAuthenticated: false, isChecking: false },
    adobeOrg: undefined,
};

export interface AddFlowOptions {
    mode?: FlowMode;
    initial?: Partial<WizardState>;
    /** The stack's mesh entry; pass `null` for a stack that has none. */
    meshComponent?: SelectableAppBuilderComponent | null;
    /** Catalog entries the flow can seed a custom build from (default empty). */
    catalog?: AppBuilderComponentCatalogEntry[];
    /** The minting collision domain (default: the blank shell's id, as buildReservedIds would). */
    reservedIds?: Set<string>;
    /** The blank starter app; pass `null` for a stack that ships none. */
    blankComponent?: AppBuilderComponentCatalogEntry | null;
}

export interface AddFlowSetup {
    result: RenderHookResult<UseIntegrationFlowReturn, { state: WizardState }>['result'];
    /** Re-render the hook with the state accumulated by prior updateState calls. */
    sync: () => void;
    updateState: jest.Mock;
    builder: FlowBuilderStub;
    onClose: jest.Mock;
    stateRef: { current: WizardState };
}

/**
 * Render the hook over a controlled WizardState. updateState applies partials
 * to a mutable ref; `sync()` re-renders the hook with the accumulated state
 * (mirrors the wizard's reducer + re-render cycle).
 */
export function setupAddFlow(options: AddFlowOptions = {}): AddFlowSetup {
    const {
        mode = 'add',
        initial = {},
        meshComponent = MESH_COMPONENT,
        catalog = EMPTY_CATALOG,
        reservedIds = new Set(['app-builder-shell']),
        blankComponent = BLANK_COMPONENT,
    } = options;
    const { stateRef, updateState, builder, onClose } = makeFlowHarness({
        ...ADD_SIGNED_IN,
        ...initial,
    });

    const { result, rerender } = renderHook(
        ({ state }: { state: WizardState }) =>
            useIntegrationFlow({
                state,
                updateState,
                mode,
                meshComponent: meshComponent ?? undefined,
                catalog,
                reservedIds,
                blankComponent: blankComponent ?? undefined,
                builder,
                onClose,
            } as UseIntegrationFlowArgs),
        { initialProps: { state: stateRef.current } }
    );

    const sync = (): void => rerender({ state: stateRef.current });
    return { result, sync, updateState, builder, onClose, stateRef };
}

/** Pick a kind on the kind stage and Continue past it. */
export function pickKindAndContinue(
    s: AddFlowSetup,
    kind: 'mesh' | 'catalog' | 'blank' | 'custom'
): void {
    act(() => s.result.current.pickKind(kind));
    act(() => s.result.current.onContinue());
}
