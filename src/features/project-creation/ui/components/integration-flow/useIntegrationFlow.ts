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
    type BlankInstance,
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

/** Re-editing an existing custom/import integration's free API picks (row → "Change"). */
export interface ApiEditTarget {
    /** The integration's component id (the `selectedConsoleApis` key to write). */
    componentId: string;
    /** Its kind — blank/custom both render the interactive picker. */
    kind: IntegrationKind;
    /** Its current picks, seeded into the picker so the user edits from where they are. */
    picks: string[];
}

export interface UseIntegrationFlowArgs {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    /**
     * 'add' = full journey; 'destination' = Set up / Change on a result row;
     * 'api-edit' = re-open the picker for an existing integration's APIs.
     */
    mode: FlowMode;
    /** The integration whose API picks are being re-edited (mode 'api-edit' only). */
    editTarget?: ApiEditTarget;
    /** The stack's mesh catalog entry (tileStatus.meshComponentForStack), if any. */
    meshComponent?: SelectableAppBuilderComponent;
    /** The addable catalog entries (threaded to the source/API stages by the modal). */
    catalog: AppBuilderComponentCatalogEntry[];
    /** The blank starter app the "Build custom" kind commits, if any. */
    blankComponent?: AppBuilderComponentCatalogEntry;
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
    /** Set the blank instance identity; undefined clears it (invalid/empty name re-disables Continue). */
    setInstance: (instance: BlankInstance | undefined) => void;
    /** Toggle a free API pick on the custom/import api-access step. */
    toggleApi: (code: string) => void;
    setPendingProject: (project: AdobeProject | undefined) => void;
    setPendingWorkspace: (workspace: Workspace | undefined) => void;
    /** Re-expands the dest stages from the later-add summary ("Change"). */
    changeDestination: () => void;
    /** DestinationStage reports its create/workspace phase activity through this. */
    setPhaseRunning: (running: boolean) => void;
}

/**
 * The draft every journey starts from. An `api-edit` re-open seeds the target's
 * kind + current picks so the picker opens on the existing selection; every other
 * journey starts blank.
 */
function createInitialDraft(editTarget?: ApiEditTarget): FlowDraft {
    if (editTarget) {
        return {
            changingDestination: false,
            kind: editTarget.kind,
            selectedApis: editTarget.picks,
        };
    }
    return { changingDestination: false };
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

/**
 * The stage-machine hook for the Add Integration modal journey.
 *
 * @param args - wizard state + updater, flow mode, catalog inputs, the
 *   useProjectBuilder finish handlers, and the modal's close callback
 * @returns the current stage, draft, footer surfaces, and the flow's handlers
 */
export function useIntegrationFlow(args: UseIntegrationFlowArgs): UseIntegrationFlowReturn {
    const { state, updateState, mode, meshComponent, builder, onClose } = args;
    const { blankComponent, editTarget } = args;

    const [draft, setDraft] = useState<FlowDraft>(() => createInitialDraft(editTarget));
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

    /** Record a custom/import app's free API picks under its committed component id. */
    const writeApiPicks = useCallback(
        (componentId: string): void => {
            const picks = draft.selectedApis ?? EMPTY_STRING_ARRAY;
            if (picks.length === 0) return;
            updateState({
                selectedConsoleApis: { ...(state.selectedConsoleApis ?? {}), [componentId]: picks },
            });
        },
        [draft.selectedApis, state.selectedConsoleApis, updateState],
    );

    /**
     * Save re-edited picks (mode 'api-edit') under the target's component id.
     * Unlike {@link writeApiPicks} this writes even an EMPTY set — clearing the key
     * when the user removes every pick, so a de-selection actually takes effect.
     */
    const saveEditedPicks = useCallback((): void => {
        if (!editTarget) return;
        const picks = draft.selectedApis ?? EMPTY_STRING_ARRAY;
        const next = { ...(state.selectedConsoleApis ?? {}) };
        if (picks.length > 0) next[editTarget.componentId] = picks;
        else delete next[editTarget.componentId];
        updateState({ selectedConsoleApis: next });
    }, [editTarget, draft.selectedApis, state.selectedConsoleApis, updateState]);

    /**
     * Route the add finish through the unchanged useProjectBuilder handlers.
     * Mesh/catalog APIs are deterministic (subscribed at the rebuild). A custom/import
     * app carries the user's free API picks (`draft.selectedApis`) — written to
     * `selectedConsoleApis[componentId]` so the rebuild subscribe includes them.
     */
    const commitSelection = useCallback((): void => {
        if (draft.kind === 'mesh' && meshComponent) {
            builder.onAppBuilderComponentToggle(meshComponent.id, true);
            return;
        }
        if (draft.kind === 'catalog' && draft.catalogId) {
            builder.onAppBuilderComponentToggle(draft.catalogId, true);
            return;
        }
        // "Build custom" commits a named INSTANCE of the blank starter app (the
        // shell repo is a template, not an identity): the source-blank gate
        // guarantees draft.instance, and the custom-add handler selects the
        // instance id + records the shell source with the display name. Picks key
        // under the instance id so N instances carry independent API picks.
        // Picks are recorded BEFORE the builder call, not after. The wizard did not
        // care — it persists its state later either way — but the dashboard host
        // POSTS the add inside that callback, so picks written afterwards missed
        // the message entirely and were dropped at the boundary.
        if (draft.kind === 'blank' && blankComponent && draft.instance) {
            writeApiPicks(draft.instance.id);
            builder.onAddCustomAppBuilderComponent(blankComponent.source, draft.instance);
            return;
        }
        if (draft.kind === 'custom' && draft.customSource) {
            // Mirror useProjectBuilder's id derivation so the picks key matches the row.
            writeApiPicks(`${draft.customSource.owner}-${draft.customSource.repo}`);
            builder.onAddCustomAppBuilderComponent(draft.customSource);
        }
    }, [draft, meshComponent, blankComponent, builder, writeApiPicks]);

    const finishFlow = useCallback((): void => {
        // Re-editing an existing integration's APIs: Save writes the picks (even an
        // empty set clears them) and closes — no builder toggle (the component exists).
        if (mode === 'api-edit') {
            saveEditedPicks();
            onClose();
            return;
        }
        // Every add kind (mesh, catalog, custom, blank) commits + closes immediately.
        // The modal provisions NOTHING — all APIs subscribe later, at the rebuild —
        // so there is no in-modal enable, confirmation hold, or Retry. In destination
        // mode `draft.kind` is unset, so commitSelection is a no-op and only onClose
        // runs. No draft reset here: the shell's conditional mount unmounts the
        // journey on close, so reopening mounts a fresh hook (the reset seam).
        commitSelection();
        onClose();
    }, [mode, commitSelection, saveEditedPicks, onClose]);

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

    const setInstance = useCallback(
        (instance: BlankInstance | undefined): void => {
            setDraft((current) => ({ ...current, instance }));
        },
        [],
    );

    /** Toggle a free API pick on the custom/import api-access step (locked codes never call this). */
    const toggleApi = useCallback((code: string): void => {
        setDraft((current) => {
            const picks = current.selectedApis ?? EMPTY_STRING_ARRAY;
            const next = picks.includes(code) ? picks.filter((c) => c !== code) : [...picks, code];
            return { ...current, selectedApis: next };
        });
    }, []);

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

    // Footer label: the stage's normal label ("Continue" mid-flow; on the LAST
    // stage "Add Integration" in add mode or "Save" otherwise). The modal provisions
    // nothing, so there are no "Enabling…"/"Done"/"Retry" states to override it.
    const continueLabel = continueLabelFor(stage, order, mode);

    return {
        stage,
        draft,
        canContinue: canContinueGate(stage, draft, slice),
        canGoBack: prevStage(stage, draft, slice, mode) !== null,
        continueLabel,
        onContinue,
        onBack,
        pickKind,
        pickCatalog,
        setCustomSource,
        setInstance,
        toggleApi,
        setPendingProject,
        setPendingWorkspace,
        changeDestination,
        setPhaseRunning,
    };
}
