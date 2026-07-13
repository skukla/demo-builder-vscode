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

export type IntegrationKind = 'mesh' | 'catalog' | 'custom';

export type FlowMode = 'add' | 'destination';

export type FlowStageId =
    | 'kind'
    | 'source-catalog'
    | 'source-custom'
    | 'dest-signin'
    | 'dest-project'
    | 'dest-workspace'
    | 'dest-summary'
    | 'api-access';

/** Modal-local draft; committed to wizard state only at the flow's commit points. */
export interface FlowDraft {
    kind?: IntegrationKind;
    catalogId?: string;
    customSource?: { owner: string; repo: string };
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
    'source-custom',
    'dest-signin',
    'dest-project',
    'dest-workspace',
    'dest-summary',
    'api-access',
];

/** Whether the kind picker should offer mesh (stack supports it, not yet added). */
export function meshKindOffered(
    slice: Pick<FlowStateSlice, 'meshAvailable' | 'meshSelected'>,
): boolean {
    return slice.meshAvailable && !slice.meshSelected;
}

function sourceStages(kind: IntegrationKind | undefined): FlowStageId[] {
    if (kind === 'catalog') return ['source-catalog'];
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
    if (mode === 'destination') return destinationStages(slice);

    const dest: FlowStageId[] =
        slice.destinationCommitted && !draft.changingDestination
            ? ['dest-summary']
            : destinationStages(slice);
    return ['kind', ...sourceStages(draft.kind), ...dest, 'api-access'];
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
    'source-catalog': (draft) => draft.catalogId !== undefined,
    'source-custom': customSourceValid,
    'dest-signin': (_draft, slice) => slice.isSignedIn,
    'dest-project': (draft, slice) =>
        (draft.pendingProject !== undefined || slice.projectCommitted) && !slice.phaseRunning,
    'dest-workspace': (draft, slice) =>
        (draft.pendingWorkspace !== undefined || slice.workspaceCommitted) && !slice.phaseRunning,
    'dest-summary': () => true,
    // Informational only — shows the API access this integration grants (always
    // on, subscribed at deploy). Nothing to select, so it never blocks.
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
