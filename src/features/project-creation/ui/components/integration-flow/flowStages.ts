/**
 * flowStages — PURE stage machine for the Add Integration modal journey.
 *
 * No React, no wizard-state writes. Callers pass a narrow {@link FlowStateSlice}
 * computed from wizard state; every function derives from (draft, slice, mode).
 *
 * Vanished-stage clamp rule (e.g. `dest-signin` disappears after the user signs
 * in mid-flow): when the current stage is no longer in the derived order,
 * `nextStage` returns the stage after the nearest surviving canonical
 * predecessor (or the first stage when none survives), and `prevStage` returns
 * that surviving predecessor itself (or null when none survives).
 */

import type { AdobeProject, Workspace } from '@/types/webview';

export type IntegrationKind = 'mesh' | 'catalog' | 'blank' | 'custom';

/**
 * Reserved `selectedConsoleApis` key carrying a project's pre-existing
 * `additionalConsoleApis` in edit mode. Serialization-only: it joins the
 * subscription union, is never surfaced as a row, and blocks instance ids
 * (buildReservedIds). The ONE definition — edit-mode seeding (useWizardState),
 * the row resolver, and the instance-id collision domain all import it.
 */
export const RESERVED_EXISTING_KEY = '__existing__';

/**
 * A named blank (AI-built) integration instance: the user-entered display name
 * and the collision-checked id derived from it (instanceId.ts). The FlowDraft
 * is the canonical carrier; every producer/consumer of the pair reuses this type.
 */
export interface BlankInstance {
    id: string;
    name: string;
}

export type FlowMode = 'add' | 'destination' | 'api-edit';

export type FlowStageId =
    | 'kind'
    | 'source-catalog'
    | 'source-blank'
    | 'source-custom'
    | 'dest-signin'
    | 'dest-project'
    | 'dest-workspace'
    | 'api-access';

/** Modal-local draft; committed to wizard state only at the flow's commit points. */
export interface FlowDraft {
    kind?: IntegrationKind;
    catalogId?: string;
    customSource?: { owner: string; repo: string };
    /**
     * A blank (AI-built) integration's identity ({@link BlankInstance}). Set by
     * the source-blank stage; committed as the selection id + source-map key.
     */
    instance?: BlankInstance;
    /**
     * The catalog entry the Build-custom instance is SEEDED from (e.g. the
     * Commerce starter kit) — undefined means the blank shell. The commit clones
     * the seed's repo under the instance's name; the seed's capability fields
     * survive via the loader's source recognition, not via this draft.
     */
    seedId?: string;
    /**
     * Free Console API picks for a custom/import app's api-access step (the user
     * knows what APIs the app needs up front). Locked codes (baseline + APIs other
     * integrations already cover) are derived, never stored here. Committed to
     * `selectedConsoleApis[componentId]` and subscribed at deploy. Mesh/catalog
     * have deterministic APIs and never populate this.
     */
    selectedApis?: string[];
    pendingProject?: AdobeProject;
    pendingWorkspace?: Workspace;
    changingDestination: boolean;
}

/** Narrow read-only view of wizard state; the caller computes these booleans. */
export interface FlowStateSlice {
    isSignedIn: boolean;
    /** adobeProject?.id && adobeWorkspace?.id — the shared destination exists. */
    destinationCommitted: boolean;
    projectCommitted: boolean;
    workspaceCommitted: boolean;
    /** A destination phase (project/workspace creation, loading) is in flight. */
    phaseRunning: boolean;
    /** Selected integration ids, for the custom-source duplicate guard. */
    selectedIds: string[];
    meshAvailable: boolean;
    meshSelected: boolean;
}

/** Canonical full ordering — used only to resolve vanished-stage clamps. */
const CANONICAL_ORDER: FlowStageId[] = [
    'kind',
    'source-catalog',
    'source-blank',
    'source-custom',
    'dest-signin',
    'dest-project',
    'dest-workspace',
    'api-access',
];

function sourceStages(kind: IntegrationKind | undefined): FlowStageId[] {
    if (kind === 'catalog') return ['source-catalog'];
    if (kind === 'blank') return ['source-blank'];
    if (kind === 'custom') return ['source-custom'];
    return [];
}

function destinationStages(slice: FlowStateSlice): FlowStageId[] {
    return slice.isSignedIn
        ? ['dest-project', 'dest-workspace']
        : ['dest-signin', 'dest-project', 'dest-workspace'];
}

export function deriveStageOrder(
    draft: FlowDraft,
    slice: FlowStateSlice,
    mode: FlowMode,
): FlowStageId[] {
    // Re-editing an existing integration's API picks is just the picker — no kind,
    // source, or destination stages (those are already committed on the row).
    if (mode === 'api-edit') return ['api-access'];
    if (mode === 'destination') return destinationStages(slice);

    // Skip the destination stages ENTIRELY when the destination is committed, we
    // have a live Adobe session, AND something already references that shared
    // destination. The destination is then shown as a persistent context line in the
    // modal (with its own Change), because confirming state the user never chose
    // does not deserve a step of its own.
    // Two guards on top of destinationCommitted:
    //   - signed out: a persisted project/workspace (Edit mode) makes
    //     destinationCommitted true, but the api-access picker needs a live org —
    //     so walk the destination stages (sign-in first) instead of the summary.
    //   - nothing references it: after removing the last integration the shared
    //     destination stays committed but is orphaned, so re-walk the picker (a
    //     clean-slate re-confirm) rather than silently reusing it. A mesh counts as
    //     a reference-holder (slice.meshSelected, resolved via isMeshSelected over
    //     selectedAppBuilderComponents) alongside the ids in slice.selectedIds.
    const hasIntegrations = slice.selectedIds.length > 0 || slice.meshSelected;
    const dest: FlowStageId[] =
        slice.destinationCommitted &&
        slice.isSignedIn &&
        hasIntegrations &&
        !draft.changingDestination
            ? []
            : destinationStages(slice);
    // api-access is the INTERACTIVE picker — appended ONLY for custom/import apps
    // (blank shell or imported repo), which can need any entitled API the user picks
    // up front. Mesh and catalog have DETERMINISTIC APIs subscribed at the build, so
    // their destination stage is terminal (no informational step). Undefined kind
    // (kind not yet picked) also omits it.
    const apiAccess: FlowStageId[] =
        draft.kind === 'custom' || draft.kind === 'blank' ? ['api-access'] : [];
    return ['kind', ...sourceStages(draft.kind), ...dest, ...apiAccess];
}

/** Nearest canonical predecessor of `stage` that survives in `order`, or null. */
function survivingPredecessor(stage: FlowStageId, order: FlowStageId[]): FlowStageId | null {
    for (let i = CANONICAL_ORDER.indexOf(stage) - 1; i >= 0; i--) {
        const candidate = CANONICAL_ORDER[i];
        if (order.includes(candidate)) return candidate;
    }
    return null;
}

export function nextStage(
    current: FlowStageId,
    draft: FlowDraft,
    slice: FlowStateSlice,
    mode: FlowMode,
): FlowStageId | null {
    const order = deriveStageOrder(draft, slice, mode);
    const index = order.indexOf(current);
    if (index >= 0) {
        return index + 1 < order.length ? order[index + 1] : null;
    }
    const predecessor = survivingPredecessor(current, order);
    if (predecessor === null) return order[0];
    const after = order.indexOf(predecessor) + 1;
    return after < order.length ? order[after] : null;
}

export function prevStage(
    current: FlowStageId,
    draft: FlowDraft,
    slice: FlowStateSlice,
    mode: FlowMode,
): FlowStageId | null {
    const order = deriveStageOrder(draft, slice, mode);
    const index = order.indexOf(current);
    if (index >= 0) {
        return index > 0 ? order[index - 1] : null;
    }
    return survivingPredecessor(current, order);
}

function customSourceValid(draft: FlowDraft, slice: FlowStateSlice): boolean {
    const source = draft.customSource;
    if (!source) return false;
    return !slice.selectedIds.includes(`${source.owner}-${source.repo}`);
}

const CONTINUE_GATES: Record<FlowStageId, (draft: FlowDraft, slice: FlowStateSlice) => boolean> = {
    kind: (draft) => draft.kind !== undefined,
    // A pick AND a valid name: the stage prefills the name from the picked
    // entry (emitting immediately), so Continue enables on pick exactly as
    // before — it only disables while an EDITED name is invalid or colliding.
    'source-catalog': (draft) => draft.catalogId !== undefined && draft.instance !== undefined,
    // The stage emits instance only for a valid, non-colliding name (instanceId.ts).
    'source-blank': (draft) => draft.instance !== undefined,
    'source-custom': customSourceValid,
    'dest-signin': (_draft, slice) => slice.isSignedIn,
    'dest-project': (draft, slice) =>
        (draft.pendingProject !== undefined || slice.projectCommitted) && !slice.phaseRunning,
    'dest-workspace': (draft, slice) =>
        (draft.pendingWorkspace !== undefined || slice.workspaceCommitted) && !slice.phaseRunning,
    // The interactive picker (custom/import only): free API picks are optional —
    // locked codes are already covered — so it never blocks Continue.
    'api-access': () => true,
};

export function canContinue(
    current: FlowStageId,
    draft: FlowDraft,
    slice: FlowStateSlice,
): boolean {
    return CONTINUE_GATES[current](draft, slice);
}

export function continueLabel(current: FlowStageId, order: FlowStageId[], mode: FlowMode): string {
    const isLast = order[order.length - 1] === current;
    if (!isLast) return 'Continue';
    return mode === 'add' ? 'Add Integration' : 'Save';
}
