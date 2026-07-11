/**
 * useIntegrationFlow — stage-machine hook for the Add Integration modal.
 *
 * Holds the modal-local {@link FlowDraft} and the stored stage id, derives
 * everything else (the {@link FlowStateSlice}, stage order, gates, labels) from
 * wizard state via the pure flowStages module. Wizard-state writes happen ONLY
 * at the commit points:
 *   - Continue off `dest-project` commits `adobeProject` (clearing the dependent
 *     workspace + `workspacesCache`) — skipped when the pending pick equals the
 *     already-committed project;
 *   - Continue off `dest-workspace` commits `adobeWorkspace`;
 *   - the LAST stage finishes through the UNCHANGED useProjectBuilder handlers
 *     (mesh/catalog toggle — which carries the load-bearing mesh mirror-write —
 *     custom add) plus the keyed `selectedConsoleApis` merge, then closes.
 *
 * Cancel is the modal closing without onContinue: draft mutations never touch
 * wizard state, so discarding the draft discards everything. A destination
 * committed mid-flow survives cancel by design (matches the previous UI).
 *
 * `phaseRunning` (blocks the dest Continues while a create/workspace phase is in
 * flight) has no wizard-state source — the phase machine is component-local in
 * useProjectCreationPhases — so the hook holds it locally and exposes
 * `setPhaseRunning` for the DestinationStage to report through.
 *
 * @module features/project-creation/ui/components/integration-flow/useIntegrationFlow
 */

import { useCallback, useMemo, useState } from 'react';
import type { SelectableAppBuilderComponent } from '../../../services/appBuilderComponentSelection';
import { isAdobeSignedIn, isMeshSelected } from '../../steps/tileStatus';
import type { UseProjectBuilderReturn } from '../../steps/useProjectBuilder';
import {
    canContinue as canContinueGate,
    continueLabel as continueLabelFor,
    deriveStageOrder,
    nextStage,
    prevStage,
    type FlowDraft,
    type FlowMode,
    type FlowStageId,
    type FlowStateSlice,
    type IntegrationKind,
} from './flowStages';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AdobeProject, WizardState, Workspace } from '@/types/webview';

/** Stable empty array for slice defaults (avoids the infinite-re-render gotcha). */
const EMPTY_STRING_ARRAY: string[] = [];

export interface UseIntegrationFlowArgs {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    /** 'add' = full journey; 'destination' = Set up / Change on a result row. */
    mode: FlowMode;
    /** The stack's mesh catalog entry (tileStatus.meshComponentForStack), if any. */
    meshComponent?: SelectableAppBuilderComponent;
    /** The addable catalog entries (threaded to the source/API stages by the modal). */
    catalog: AppBuilderComponentCatalogEntry[];
    /** The unchanged useProjectBuilder handlers the finish commits route through. */
    builder: Pick<
        UseProjectBuilderReturn,
        'onAppBuilderComponentToggle' | 'onAddCustomAppBuilderComponent'
    >;
    onClose: () => void;
}

export interface UseIntegrationFlowReturn {
    stage: FlowStageId;
    draft: FlowDraft;
    canContinue: boolean;
    canGoBack: boolean;
    continueLabel: string;
    onContinue: () => void;
    onBack: () => void;
    pickKind: (kind: IntegrationKind) => void;
    pickCatalog: (id: string) => void;
    /** Set the parsed custom source; undefined clears it (cleared/invalid URL re-disables Continue). */
    setCustomSource: (source: { owner: string; repo: string } | undefined) => void;
    setPendingProject: (project: AdobeProject | undefined) => void;
    setPendingWorkspace: (workspace: Workspace | undefined) => void;
    /** Re-expands the dest stages from the later-add summary ("Change"). */
    changeDestination: () => void;
    toggleApi: (code: string) => void;
    /** DestinationStage reports its create/workspace phase activity through this. */
    setPhaseRunning: (running: boolean) => void;
}

/** The draft every journey starts from (and resets to after a finish). */
function createInitialDraft(): FlowDraft {
    return { changingDestination: false, selectedApis: [] };
}

/** Derive the narrow read-only slice flowStages consumes from wizard state. */
function computeSlice(
    state: WizardState,
    meshComponent: SelectableAppBuilderComponent | undefined,
    phaseRunning: boolean,
): FlowStateSlice {
    const projectCommitted = Boolean(state.adobeProject?.id);
    const workspaceCommitted = Boolean(state.adobeWorkspace?.id);
    return {
        isSignedIn: isAdobeSignedIn(state),
        destinationCommitted: projectCommitted && workspaceCommitted,
        projectCommitted,
        workspaceCommitted,
        phaseRunning,
        selectedIds: state.selectedAppBuilderComponents ?? EMPTY_STRING_ARRAY,
        meshAvailable: meshComponent !== undefined,
        meshSelected: meshComponent ? isMeshSelected(state, meshComponent.id) : false,
    };
}

/** The first stage of the derived order at mount (mode-aware). */
function initialStageFor(
    state: WizardState,
    meshComponent: SelectableAppBuilderComponent | undefined,
    mode: FlowMode,
): FlowStageId {
    return deriveStageOrder(
        createInitialDraft(),
        computeSlice(state, meshComponent, false),
        mode,
    )[0];
}

/** Immutable membership toggle for the draft's free API picks. */
function toggledApis(selected: string[], code: string): string[] {
    return selected.includes(code)
        ? selected.filter((existing) => existing !== code)
        : [...selected, code];
}

/**
 * The stage-machine hook for the Add Integration modal journey.
 *
 * @param args - wizard state + updater, flow mode, catalog inputs, the
 *   useProjectBuilder finish handlers, and the modal's close callback
 * @returns the current stage, draft, footer surfaces, and the flow's handlers
 */
export function useIntegrationFlow(args: UseIntegrationFlowArgs): UseIntegrationFlowReturn {
    const { state, updateState, mode, meshComponent, builder, onClose } = args;

    const [draft, setDraft] = useState<FlowDraft>(createInitialDraft);
    const [phaseRunning, setPhaseRunning] = useState(false);
    // The stored stage id is the only walked state; the DISPLAYED stage is
    // derived — when the stored stage vanishes from the order (e.g. dest-signin
    // after a mid-flow sign-in), the flowStages clamp resolves the survivor.
    const [storedStage, setStoredStage] = useState<FlowStageId>(() =>
        initialStageFor(state, meshComponent, mode),
    );

    const slice = useMemo(
        () => computeSlice(state, meshComponent, phaseRunning),
        [state, meshComponent, phaseRunning],
    );
    const order = useMemo(() => deriveStageOrder(draft, slice, mode), [draft, slice, mode]);
    const stage: FlowStageId = order.includes(storedStage)
        ? storedStage
        : (nextStage(storedStage, draft, slice, mode) ?? order[0]);

    /** Commit the pending project unless it matches the committed one (a re-pick must not clear the workspace). */
    const commitProjectIfChanged = useCallback((): void => {
        const pending = draft.pendingProject;
        if (!pending || pending.id === state.adobeProject?.id) return;
        updateState({
            adobeProject: pending,
            adobeWorkspace: undefined,
            workspacesCache: undefined,
        });
    }, [draft.pendingProject, state.adobeProject?.id, updateState]);

    /** Merge the free API picks under the integration's id (only when any exist). */
    const mergeSelectedApis = useCallback(
        (id: string): void => {
            if (draft.selectedApis.length === 0) return;
            updateState({
                selectedConsoleApis: { ...state.selectedConsoleApis, [id]: draft.selectedApis },
            });
        },
        [draft.selectedApis, state.selectedConsoleApis, updateState],
    );

    /** Route the add-mode finish through the unchanged useProjectBuilder handlers. */
    const commitSelection = useCallback((): void => {
        if (draft.kind === 'mesh' && meshComponent) {
            builder.onAppBuilderComponentToggle(meshComponent.id, true);
            mergeSelectedApis(meshComponent.id);
            return;
        }
        if (draft.kind === 'catalog' && draft.catalogId) {
            builder.onAppBuilderComponentToggle(draft.catalogId, true);
            mergeSelectedApis(draft.catalogId);
            return;
        }
        if (draft.kind === 'custom' && draft.customSource) {
            const { owner, repo } = draft.customSource;
            builder.onAddCustomAppBuilderComponent(draft.customSource);
            mergeSelectedApis(`${owner}-${repo}`);
        }
    }, [draft, meshComponent, builder, mergeSelectedApis]);

    const finishFlow = useCallback((): void => {
        if (mode === 'add') commitSelection();
        // No draft reset here: the modal shell's conditional mount unmounts the
        // journey on close, so reopening mounts a fresh hook (the reset seam).
        onClose();
    }, [mode, commitSelection, onClose]);

    const onContinue = useCallback((): void => {
        if (!canContinueGate(stage, draft, slice)) return;
        if (stage === 'dest-project') commitProjectIfChanged();
        if (stage === 'dest-workspace' && draft.pendingWorkspace) {
            updateState({ adobeWorkspace: draft.pendingWorkspace });
        }
        if (order[order.length - 1] === stage) {
            finishFlow();
            return;
        }
        const next = nextStage(stage, draft, slice, mode);
        if (next) setStoredStage(next);
    }, [stage, draft, slice, order, mode, commitProjectIfChanged, updateState, finishFlow]);

    const onBack = useCallback((): void => {
        const previous = prevStage(stage, draft, slice, mode);
        if (previous) setStoredStage(previous);
    }, [stage, draft, slice, mode]);

    const pickKind = useCallback((kind: IntegrationKind): void => {
        setDraft((current) => ({ ...current, kind }));
    }, []);

    const pickCatalog = useCallback((id: string): void => {
        setDraft((current) => ({ ...current, catalogId: id }));
    }, []);

    const setCustomSource = useCallback(
        (source: { owner: string; repo: string } | undefined): void => {
            setDraft((current) => ({ ...current, customSource: source }));
        },
        [],
    );

    const setPendingProject = useCallback((project: AdobeProject | undefined): void => {
        setDraft((current) => ({ ...current, pendingProject: project }));
    }, []);

    const setPendingWorkspace = useCallback((workspace: Workspace | undefined): void => {
        setDraft((current) => ({ ...current, pendingWorkspace: workspace }));
    }, []);

    const changeDestination = useCallback((): void => {
        setDraft((current) => ({ ...current, changingDestination: true }));
        // Jump to the first re-expanded destination stage (destinationStages order).
        setStoredStage(slice.isSignedIn ? 'dest-project' : 'dest-signin');
    }, [slice.isSignedIn]);

    const toggleApi = useCallback((code: string): void => {
        setDraft((current) => ({
            ...current,
            selectedApis: toggledApis(current.selectedApis, code),
        }));
    }, []);

    return {
        stage,
        draft,
        canContinue: canContinueGate(stage, draft, slice),
        canGoBack: prevStage(stage, draft, slice, mode) !== null,
        continueLabel: continueLabelFor(stage, order, mode),
        onContinue,
        onBack,
        pickKind,
        pickCatalog,
        setCustomSource,
        setPendingProject,
        setPendingWorkspace,
        changeDestination,
        toggleApi,
        setPhaseRunning,
    };
}
