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
import type { EnsureResult } from './MeshApiEnableRow';
import { webviewClient } from '@/core/ui/utils/vscode-api';
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
    /** The blank starter app the "Start from scratch" kind commits, if any. */
    blankComponent?: AppBuilderComponentCatalogEntry;
    /** Selected stack backend/frontend ids — the mesh-enable payload on finish. */
    backendId?: string;
    frontendId?: string;
    /** The unchanged useProjectBuilder handlers the finish commits route through. */
    builder: Pick<
        UseProjectBuilderReturn,
        'onAppBuilderComponentToggle' | 'onAddCustomAppBuilderComponent'
    >;
    /** The mesh-enable outcome, captured on Add so the result row adopts it (no re-run). */
    onMeshEnableResult?: (result: EnsureResult) => void;
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
    /** DestinationStage reports its create/workspace phase activity through this. */
    setPhaseRunning: (running: boolean) => void;
    /** True while the mesh API enable runs on Add (footer shows "Enabling…"). */
    enabling: boolean;
    /** The last enable failure message (shown in the modal; Add becomes Retry). */
    enableError?: string;
}

/** The draft every journey starts from (and resets to after a finish). */
function createInitialDraft(): FlowDraft {
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
    const { blankComponent, backendId, frontendId, onMeshEnableResult } = args;

    const [draft, setDraft] = useState<FlowDraft>(createInitialDraft);
    const [phaseRunning, setPhaseRunning] = useState(false);
    // The mesh API enable runs on Add (in the modal): footer shows "Enabling…"
    // and a failure keeps the modal open with an inline error + Retry.
    const [enabling, setEnabling] = useState(false);
    const [enableError, setEnableError] = useState<string | undefined>(undefined);
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

    /**
     * Route the add-mode finish through the unchanged useProjectBuilder handlers.
     * API access is deterministic — the integration's required APIs subscribe at
     * deploy; there are no per-add optional picks to merge here.
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
        // "Start from scratch" adds the blank starter app (the shell) like a
        // catalog pick — it's a custom app that begins empty and grows via AI.
        if (draft.kind === 'blank' && blankComponent) {
            builder.onAppBuilderComponentToggle(blankComponent.id, true);
            return;
        }
        if (draft.kind === 'custom' && draft.customSource) {
            builder.onAddCustomAppBuilderComponent(draft.customSource);
        }
    }, [draft, meshComponent, blankComponent, builder]);

    /**
     * Provision the mesh API access on Add — the enable runs HERE, in the modal,
     * so "Add Integration" is a complete action (progress in the footer, a failure
     * keeps the modal open with Retry). The captured result flows to the result
     * row (via onMeshEnableResult) so it shows the finished ✓ instead of re-running.
     */
    const enableMeshApi = useCallback(async (): Promise<EnsureResult> => {
        try {
            return await webviewClient.request<EnsureResult>('ensure-mesh-api-subscribed', {
                orgId: state.adobeOrg?.id,
                projectId: state.adobeProject?.id,
                workspaceId: state.adobeWorkspace?.id,
                backendId,
                frontendId,
            });
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }, [
        state.adobeOrg?.id,
        state.adobeProject?.id,
        state.adobeWorkspace?.id,
        backendId,
        frontendId,
    ]);

    const finishFlow = useCallback(async (): Promise<void> => {
        if (mode !== 'add') {
            onClose();
            return;
        }
        // Mesh: run the enable in the modal on Add. Commit + close only on success;
        // a failure stays open (Add becomes Retry). Non-mesh adds commit immediately.
        if (draft.kind === 'mesh' && meshComponent) {
            setEnabling(true);
            setEnableError(undefined);
            const result = await enableMeshApi();
            setEnabling(false);
            if (!result.success) {
                setEnableError(result.error ?? 'Could not enable API access.');
                return;
            }
            onMeshEnableResult?.(result);
        }
        commitSelection();
        // No draft reset here: the modal shell's conditional mount unmounts the
        // journey on close, so reopening mounts a fresh hook (the reset seam).
        onClose();
    }, [
        mode,
        draft.kind,
        meshComponent,
        enableMeshApi,
        onMeshEnableResult,
        commitSelection,
        onClose,
    ]);

    const onContinue = useCallback((): void => {
        if (enabling || !canContinueGate(stage, draft, slice)) return;
        if (stage === 'dest-project') commitProjectIfChanged();
        if (stage === 'dest-workspace' && draft.pendingWorkspace) {
            updateState({ adobeWorkspace: draft.pendingWorkspace });
        }
        if (order[order.length - 1] === stage) {
            void finishFlow();
            return;
        }
        const next = nextStage(stage, draft, slice, mode);
        if (next) setStoredStage(next);
    }, [
        enabling,
        stage,
        draft,
        slice,
        order,
        mode,
        commitProjectIfChanged,
        updateState,
        finishFlow,
    ]);

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

    return {
        stage,
        draft,
        // Disabled while the enable runs; Back also blocked (canGoBack) so the
        // user can't leave mid-provision.
        canContinue: !enabling && canContinueGate(stage, draft, slice),
        canGoBack: !enabling && prevStage(stage, draft, slice, mode) !== null,
        continueLabel: enabling ? 'Enabling…' : continueLabelFor(stage, order, mode),
        onContinue,
        onBack,
        pickKind,
        pickCatalog,
        setCustomSource,
        setPendingProject,
        setPendingWorkspace,
        changeDestination,
        setPhaseRunning,
        enabling,
        enableError,
    };
}
