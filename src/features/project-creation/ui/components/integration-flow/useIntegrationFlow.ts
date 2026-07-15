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
import type { EnsureResult } from './meshApiSubscription';
import { webviewClient } from '@/core/ui/utils/vscode-api';
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
    /** Selected stack backend/frontend ids — the mesh-enable payload on finish. */
    backendId?: string;
    frontendId?: string;
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
    /** Toggle a free API pick on the custom/import api-access step. */
    toggleApi: (code: string) => void;
    setPendingProject: (project: AdobeProject | undefined) => void;
    setPendingWorkspace: (workspace: Workspace | undefined) => void;
    /** Re-expands the dest stages from the later-add summary ("Change"). */
    changeDestination: () => void;
    /** DestinationStage reports its create/workspace phase activity through this. */
    setPhaseRunning: (running: boolean) => void;
    /** True while the mesh API enable runs on Add (footer shows "Enabling…"). */
    enabling: boolean;
    /** Per-API completion during the enable (sdk code → true once it subscribes). */
    enableDone: Record<string, boolean>;
    /** The enable succeeded and the modal is holding on the ✓ state (footer → "Done"). */
    enableComplete: boolean;
    /** The last enable failure message (shown in the modal; Add becomes Retry). */
    enableError?: string;
    /**
     * A custom/import app's picks are confirmed in-modal (footer → "Done"): the
     * picker holds on a ✓ summary instead of closing on Add. Back un-confirms →
     * revise the picks (nothing is provisioned yet; the picks subscribe at deploy).
     */
    picksConfirmed: boolean;
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
    const { blankComponent, backendId, frontendId, editTarget } = args;

    const [draft, setDraft] = useState<FlowDraft>(() => createInitialDraft(editTarget));
    const [phaseRunning, setPhaseRunning] = useState(false);
    // The mesh API enable runs on Add (in the modal): footer shows "Enabling…"
    // and a failure keeps the modal open with an inline error + Retry.
    const [enabling, setEnabling] = useState(false);
    // Per-API completion, filled live from the handler's per-subscribe ticks so
    // each API row flips ✓ as it lands (rather than all at once at the end).
    const [enableDone, setEnableDone] = useState<Record<string, boolean>>({});
    const [enableError, setEnableError] = useState<string | undefined>(undefined);
    // After a successful mesh enable the modal STAYS open (symmetry with the
    // failure path's Retry): the rows show ✓ and the footer becomes "Done". The
    // commit + close happen when the user clicks Done — not automatically.
    const [enableComplete, setEnableComplete] = useState(false);
    // Custom/import parity with the mesh terminal state: on Add the picker HOLDS on
    // a ✓ confirmation (footer → "Done") instead of closing, so the picks read as
    // "added in place". Nothing is provisioned now (custom APIs subscribe at
    // deploy), so Back safely un-confirms → back to the interactive picker to revise.
    const [picksConfirmed, setPicksConfirmed] = useState(false);
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
     * Route the add-mode finish through the unchanged useProjectBuilder handlers.
     * Mesh/catalog APIs are deterministic (subscribed at deploy). A custom/import
     * app carries the user's free API picks (`draft.selectedApis`) — written to
     * `selectedConsoleApis[componentId]` so the deploy subscribe includes them.
     */
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

    const commitSelection = useCallback((): void => {
        if (draft.kind === 'mesh' && meshComponent) {
            builder.onAppBuilderComponentToggle(meshComponent.id, true);
            return;
        }
        if (draft.kind === 'catalog' && draft.catalogId) {
            builder.onAppBuilderComponentToggle(draft.catalogId, true);
            return;
        }
        // "Build custom" adds the blank starter app (the shell) — a custom app that
        // begins from a working deploy and grows via AI, with the APIs picked here.
        if (draft.kind === 'blank' && blankComponent) {
            builder.onAppBuilderComponentToggle(blankComponent.id, true);
            writeApiPicks(blankComponent.id);
            return;
        }
        if (draft.kind === 'custom' && draft.customSource) {
            builder.onAddCustomAppBuilderComponent(draft.customSource);
            // Mirror useProjectBuilder's id derivation so the picks key matches the row.
            writeApiPicks(`${draft.customSource.owner}-${draft.customSource.repo}`);
        }
    }, [draft, meshComponent, blankComponent, builder, writeApiPicks]);

    /**
     * Provision the mesh API access on Add — the enable runs HERE, in the modal,
     * so "Add Integration" is a complete action (progress in the footer, a failure
     * keeps the modal open with Retry). The mesh commits only on success, so the
     * result row is purely visual (a static ✓) — no result forwarding needed.
     */
    const enableMeshApi = useCallback(async (): Promise<EnsureResult> => {
        // Listen for the handler's per-API ticks only for this run's duration, so
        // each row flips ✓ as its subscribe lands. Unsubscribe in `finally`.
        const unsubscribe = webviewClient.onMessage(
            'mesh-api-subscribe-progress',
            (data: unknown) => {
                const evt = data as { code?: string; done?: boolean };
                if (evt?.code && evt.done) {
                    setEnableDone((prev) => ({ ...prev, [evt.code as string]: true }));
                }
            },
        );
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
        } finally {
            unsubscribe();
        }
    }, [
        state.adobeOrg?.id,
        state.adobeProject?.id,
        state.adobeWorkspace?.id,
        backendId,
        frontendId,
    ]);

    const finishFlow = useCallback(async (): Promise<void> => {
        // Re-editing an existing integration's APIs: Save writes the picks (even an
        // empty set clears them) and closes — no builder toggle (the component exists).
        if (mode === 'api-edit') {
            saveEditedPicks();
            onClose();
            return;
        }
        if (mode !== 'add') {
            onClose();
            return;
        }
        // Mesh: the enable runs in the modal on Add. On success the modal HOLDS on
        // a ✓ terminal state (footer → "Done"); the commit + close happen on the
        // Done click below. A failure stays open too (Add becomes Retry). Non-mesh
        // adds have no in-modal work, so they commit + close immediately.
        if (draft.kind === 'mesh' && meshComponent) {
            if (enableComplete) {
                // Second press ("Done"): the enable already succeeded — finish now.
                commitSelection();
                onClose();
                return;
            }
            setEnabling(true);
            setEnableError(undefined);
            setEnableDone({});
            const result = await enableMeshApi();
            setEnabling(false);
            if (!result.success) {
                setEnableError(result.error ?? 'Could not enable API access.');
                return;
            }
            setEnableComplete(true);
            return;
        }
        // Custom/import (blank shell or imported repo): the picks aren't provisioned
        // now — they subscribe at deploy — but Add still HOLDS on an in-modal ✓
        // confirmation (parity with mesh). First press confirms; Done commits +
        // closes. Back un-confirms → revise the picks (safe: nothing provisioned).
        if (draft.kind === 'blank' || draft.kind === 'custom') {
            if (picksConfirmed) {
                commitSelection();
                onClose();
                return;
            }
            setPicksConfirmed(true);
            return;
        }
        commitSelection();
        // No draft reset here: the modal shell's conditional mount unmounts the
        // journey on close, so reopening mounts a fresh hook (the reset seam).
        onClose();
    }, [
        mode,
        draft.kind,
        meshComponent,
        enableComplete,
        picksConfirmed,
        enableMeshApi,
        commitSelection,
        saveEditedPicks,
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
        // On the custom/import confirmation, Back un-confirms → returns to the
        // interactive picker (picks preserved) rather than leaving the api-access step.
        if (picksConfirmed) {
            setPicksConfirmed(false);
            return;
        }
        const previous = prevStage(stage, draft, slice, mode);
        if (previous) setStoredStage(previous);
    }, [picksConfirmed, stage, draft, slice, mode]);

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

    // Footer label. Base = the stage's normal label, EXCEPT the mesh api-access step,
    // whose button action is enabling the APIs (in the modal), not just adding the
    // integration — so it reads "Add API Access". The live states then override:
    // "Enabling…" while provisioning, "Retry" after a failed enable (the button IS
    // the retry affordance), "Done" on the ✓ terminal state. (A block, not a nested
    // ternary.)
    let continueLabel = continueLabelFor(stage, order, mode);
    // The api-access step's action IS the API access, so label it "Add API Access"
    // for the kinds where it's active — mesh (enables in-modal) and custom/import
    // (picks the APIs). Catalog's api-access is fixed/informational, so it keeps the
    // generic "Add Integration".
    // Only in the ADD journey — an api-edit re-open keeps the base "Save" label.
    if (
        mode === 'add' &&
        stage === 'api-access' &&
        (draft.kind === 'mesh' || draft.kind === 'blank' || draft.kind === 'custom')
    ) {
        continueLabel = 'Add API Access';
    }
    if (enabling) continueLabel = 'Enabling…';
    else if (enableComplete || picksConfirmed) continueLabel = 'Done';
    else if (enableError) continueLabel = 'Retry';

    return {
        stage,
        draft,
        // Disabled while the enable runs; Back blocked during the enable AND on the
        // ✓ terminal state (the APIs are already provisioned — only Done moves on).
        canContinue: !enabling && canContinueGate(stage, draft, slice),
        // Back blocked during the enable and on the mesh ✓ terminal (APIs already
        // provisioned). The custom/import confirmation ALLOWS Back — it un-confirms
        // to revise the picks, since nothing is provisioned until deploy.
        canGoBack:
            !enabling &&
            !enableComplete &&
            (picksConfirmed || prevStage(stage, draft, slice, mode) !== null),
        continueLabel,
        onContinue,
        onBack,
        pickKind,
        pickCatalog,
        setCustomSource,
        toggleApi,
        setPendingProject,
        setPendingWorkspace,
        changeDestination,
        setPhaseRunning,
        enabling,
        enableDone,
        enableComplete,
        enableError,
        picksConfirmed,
    };
}
