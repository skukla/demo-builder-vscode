/**
 * buildSummary — per-area providers for the unified "Your project" summary.
 *
 * The Build Your Project step renders ONE persistent summary (see
 * {@link BuildYourProjectSummary}) fed by these pure functions. Each area
 * contributes a {@link SummaryGroup}; a shared {@link architectureLabel} derives
 * the read-only stack line. Aggregation includes only the VISIBLE areas and drops
 * groups with no rows (e.g. Integrations with nothing configured yet).
 *
 * @module features/project-creation/ui/steps/buildSummary
 */

import { getAvailableAppBuilderComponents } from '@/features/components/services/appBuilderComponentCatalogLoader';
import type { SummaryRow, SummaryGroup } from '../components/BuildYourProjectSummary';
import { resolveIntegrationRows } from '../components/integration-flow';
import { commerceSectionStates, ROW_LABELS } from './commerceSections';
import { STOREFRONT_SECTION_TITLES } from './storefrontSections';
import { isAdobeSignedIn, meshComponentForStack } from './tileStatus';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

/** Stable empty defaults for catalog props (avoids the infinite-re-render gotcha). */
const EMPTY_PACKAGES: DemoPackage[] = [];
const EMPTY_STACKS: Stack[] = [];

/** Backend id whose flow adds the Adobe sign-in gate (duplicated literal, cf. CommerceStep). */
const ACCS_BACKEND = 'adobe-commerce-accs';

/** Resolve the selected Stack object from the catalog (the persisted value is an id). */
function selectedStackObject(state: WizardState, stacks: Stack[]): Stack | undefined {
    return state.selectedStack ? stacks.find((s) => s.id === state.selectedStack) : undefined;
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
    const rows: SummaryRow[] = sectionStates.map((s) => {
        const done = s.status === 'done' && committed.has(s.id);
        return { label: ROW_LABELS[s.id], value: done ? s.value : undefined, done };
    });
    return { heading: 'Commerce', rows };
}

/**
 * The Storefront group: mirrors the Storefront sub-steps the way the Commerce group
 * mirrors its sub-steps — Accounts (both services connected), Repository, Code Sync,
 * and Block Libraries. Each row shows ✓ + value once that sub-step's PERSISTED state
 * is satisfied (Storefront has no commit-gating, so no Continue-press is required).
 * The chosen frontend isn't a sub-step — it lives in the architecture line above.
 */
export function storefrontSummaryGroup(state: WizardState): SummaryGroup {
    const eds = state.edsConfig;
    const accountsDone =
        Boolean(eds?.githubAuth?.isAuthenticated) && Boolean(eds?.daLiveAuth?.isAuthenticated);
    const repoDone = state.storefrontRepoValid === true;
    const codeSyncDone = state.storefrontCodeSyncValid === true;
    const libCount =
        (state.selectedBlockLibraries?.length ?? 0) + (state.customBlockLibraries?.length ?? 0);

    const rows: SummaryRow[] = [
        {
            label: STOREFRONT_SECTION_TITLES.accounts,
            value: accountsDone ? 'Connected' : undefined,
            done: accountsDone,
        },
        {
            label: STOREFRONT_SECTION_TITLES.repository,
            value: repoDone ? eds?.repoName : undefined,
            done: repoDone && Boolean(eds?.repoName),
        },
    ];
    // Code Sync only applies to a NEW repo (mirrors storefrontSectionOrder); an existing
    // repo has no Code Sync sub-step, so omit the row.
    if (eds?.repoMode === 'new') {
        rows.push({
            label: STOREFRONT_SECTION_TITLES['code-sync'],
            value: codeSyncDone ? 'Verified' : undefined,
            done: codeSyncDone,
        });
    }
    rows.push({
        label: STOREFRONT_SECTION_TITLES['block-libraries'],
        value: libCount > 0 ? `${libCount} selected` : undefined,
        done: libCount > 0,
    });
    return { heading: 'Storefront', rows };
}

/**
 * The Integrations group: one row per CONFIGURED integration, mirroring the
 * center column ({@link resolveIntegrationRows} — mesh via the both-key check,
 * then catalog, then custom). A row reads "Ready" ✓ once the shared Adobe
 * project + workspace destination is committed, "Needs setup" until then.
 * With nothing configured the group has no rows, so aggregation drops it.
 */
export function integrationsSummaryGroup(
    state: WizardState,
    packages: DemoPackage[],
    stacks: Stack[],
): SummaryGroup {
    const meshComponent = meshComponentForStack(state, packages, stacks);
    const stack = selectedStackObject(state, stacks);
    const catalog = getAvailableAppBuilderComponents(
        stack?.backend ?? '',
        stack?.frontend ?? '',
    ).filter((entry) => entry.kind === 'integration');
    const rows: SummaryRow[] = resolveIntegrationRows(state, meshComponent, catalog).map((row) => ({
        label: row.name,
        value: row.needsSetup ? 'Needs setup' : 'Ready',
        done: !row.needsSetup,
    }));
    return { heading: 'Integrations', rows };
}

/** Map an area id to its provider. */
function groupForArea(
    areaId: string,
    state: WizardState,
    packages: DemoPackage[],
    stacks: Stack[],
): SummaryGroup | null {
    switch (areaId) {
        case 'commerce':
            return commerceSummaryGroup(state);
        case 'storefront':
            return storefrontSummaryGroup(state);
        case 'integrations':
            return integrationsSummaryGroup(state, packages, stacks);
        default:
            return null;
    }
}

/**
 * Aggregate the summary groups for the VISIBLE areas (in order), dropping any
 * group with no rows so empty placeholders don't show.
 *
 * @param state - wizard state
 * @param visibleAreaIds - the ids of the areas currently visible, in order
 * @param packages - demo-package catalog (drives the Integrations mesh row)
 * @param stacks - stack catalog (drives the Integrations mesh row)
 */
export function buildSummaryGroups(
    state: WizardState,
    visibleAreaIds: string[],
    packages: DemoPackage[] = EMPTY_PACKAGES,
    stacks: Stack[] = EMPTY_STACKS,
): SummaryGroup[] {
    return visibleAreaIds
        .map((id) => groupForArea(id, state, packages, stacks))
        .filter((g): g is SummaryGroup => g !== null && g.rows.length > 0);
}
