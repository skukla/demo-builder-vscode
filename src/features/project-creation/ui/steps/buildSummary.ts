/**
 * buildSummary — per-area providers for the unified "Your project" summary.
 *
 * The Build Your Project step renders ONE persistent summary (see
 * {@link BuildYourProjectSummary}) fed by these pure functions. Each area
 * contributes a {@link SummaryGroup}; a shared {@link architectureLabel} derives
 * the read-only stack line. Aggregation includes only the VISIBLE areas and drops
 * groups with no rows (e.g. Integrations until its slice fills it in).
 *
 * @module features/project-creation/ui/steps/buildSummary
 */

import type {
    SummaryRow,
    SummaryGroup,
} from '../components/BuildYourProjectSummary';
import { commerceSectionStates, ROW_LABELS } from './commerceSections';
import { isAdobeSignedIn, isStorefrontConfigured } from './tileStatus';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

/** Backend id whose flow adds the Adobe sign-in gate (duplicated literal, cf. CommerceStep). */
const ACCS_BACKEND = 'adobe-commerce-accs';

/** Frontend id → display label (cf. BACKEND_LABELS; only two frontends exist). */
const FRONTEND_LABELS: Record<string, string> = {
    'eds-storefront': 'Edge Delivery Storefront',
    headless: 'Headless',
};

/** Resolve the selected Stack object from the catalog (the persisted value is an id). */
function selectedStackObject(state: WizardState, stacks: Stack[]): Stack | undefined {
    return state.selectedStack ? stacks.find(s => s.id === state.selectedStack) : undefined;
}

/**
 * The read-only architecture line: the full stack label once a stack is committed,
 * "Frontend pending" when only the backend is chosen, else null (pending placeholder).
 */
export function architectureLabel(state: WizardState, stacks: Stack[]): string | null {
    const stack = selectedStackObject(state, stacks);
    if (stack) return stack.name;
    if (state.selectedBackend) return 'Frontend pending';
    return null;
}

/**
 * The Commerce group. A row shows ✓ + value only when its sub-step is BOTH done
 * AND committed (the user pressed Continue past it) — values never appear alone.
 */
export function commerceSummaryGroup(state: WizardState): SummaryGroup {
    const isAccs = state.selectedBackend === ACCS_BACKEND;
    const signedIn = isAdobeSignedIn(state);
    const sectionStates = commerceSectionStates(state, { isAccs, signedIn });
    const committed = new Set(state.committedCommerceSteps ?? []);
    const rows: SummaryRow[] = sectionStates.map(s => {
        const done = s.status === 'done' && committed.has(s.id);
        return { label: ROW_LABELS[s.id], value: done ? s.value : undefined, done };
    });
    return { heading: 'Commerce', rows };
}

/**
 * The Storefront group: the chosen Frontend (known once a stack is committed) and
 * the Repository (shown once the storefront is fully configured — commit-gated).
 */
export function storefrontSummaryGroup(state: WizardState, stacks: Stack[]): SummaryGroup {
    const frontendId = selectedStackObject(state, stacks)?.frontend;
    const frontendLabel = frontendId ? FRONTEND_LABELS[frontendId] ?? frontendId : undefined;
    const configured = isStorefrontConfigured(state);
    const repoName = state.edsConfig?.repoName;
    const rows: SummaryRow[] = [
        { label: 'Frontend', value: frontendLabel, done: Boolean(frontendLabel) },
        {
            label: 'Repository',
            value: configured ? repoName : undefined,
            done: configured && Boolean(repoName),
        },
    ];
    return { heading: 'Storefront', rows };
}

/**
 * The Integrations group. Minimal until the Integrations slice (R2) lands — it
 * contributes no rows yet, so aggregation drops it from the summary for now.
 */
export function integrationsSummaryGroup(_state: WizardState): SummaryGroup {
    return { heading: 'Integrations', rows: [] };
}

/** Map an area id to its provider. */
function groupForArea(areaId: string, state: WizardState, stacks: Stack[]): SummaryGroup | null {
    switch (areaId) {
        case 'commerce':
            return commerceSummaryGroup(state);
        case 'storefront':
            return storefrontSummaryGroup(state, stacks);
        case 'integrations':
            return integrationsSummaryGroup(state);
        default:
            return null;
    }
}

/**
 * Aggregate the summary groups for the VISIBLE areas (in order), dropping any
 * group with no rows so empty placeholders don't show.
 *
 * @param state - wizard state
 * @param stacks - the stack catalog (to resolve names/frontend)
 * @param visibleAreaIds - the ids of the areas currently visible, in order
 */
export function buildSummaryGroups(
    state: WizardState,
    stacks: Stack[],
    visibleAreaIds: string[],
): SummaryGroup[] {
    return visibleAreaIds
        .map(id => groupForArea(id, state, stacks))
        .filter((g): g is SummaryGroup => g !== null && g.rows.length > 0);
}
