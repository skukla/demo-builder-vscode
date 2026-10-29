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

import type { SummaryRow, SummaryGroup } from '../components/BuildYourProjectSummary';
import { commerceSectionStates, ROW_LABELS } from './commerceSections';
import { isSetInConfigure } from './editLocks';
import { STOREFRONT_SECTION_TITLES } from './storefrontSections';
import { isAdobeSignedIn, meshComponentForStack } from './tileStatus';
import { ACCS_STORE_VIEW_CODE, PAAS_STORE_VIEW_CODE } from '@/core/config/envVarKeys';
import { getAvailableAppBuilderComponents } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { isAlwaysIncludedBlockLibrary } from '@/features/components/services/blockLibraryLoader';
import { resolveIntegrationRows } from '@/features/project-creation/ui/components/integration-flow/integrationRows';
import type { DemoPackage } from '@/types/demoPackages';
import type { AddedDemo } from '@/types/projectFile';
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
    if (isSetInConfigure(state)) {
        return { heading: 'Commerce', rows: editingRows(state, sectionStates) };
    }
    const committed = new Set(state.committedCommerceSteps ?? []);
    const rows: SummaryRow[] = sectionStates.map((s) => {
        const done = s.status === 'done' && committed.has(s.id);
        return { label: ROW_LABELS[s.id], value: done ? s.value : undefined, done };
    });
    return { heading: 'Commerce', rows };
}

/**
 * Edit, before the backend or package changes: the project already has every
 * Commerce setting. The rows read what it has, not what was clicked past (going
 * Back cleared that, and a working project read "Not set"), and the three settings
 * rows are added here because their steps are not in Edit's strip (owner,
 * 2026-10-17).
 */
function editingRows(
    state: WizardState,
    sectionStates: ReturnType<typeof commerceSectionStates>,
): SummaryRow[] {
    const rows: SummaryRow[] = sectionStates.map((s) => {
        const done = s.status === 'done';
        return { label: ROW_LABELS[s.id], value: done ? s.value : undefined, done };
    });
    const settings: SummaryRow[] = [
        { label: ROW_LABELS.connection, value: 'Connected', done: true },
        { label: ROW_LABELS['business-structure'], value: storeViewCodeOf(state) ?? 'Selected', done: true },
        { label: ROW_LABELS.catalog, value: 'Configured', done: true },
    ];
    // Before Datapacks, the last row, as in the strip they came from.
    rows.splice(rows.length - 1, 0, ...settings);
    return rows;
}

/** The store view code the project records, under either backend's name for it. */
function storeViewCodeOf(state: WizardState): string | undefined {
    const configs = state.componentConfigs?.[state.selectedBackend ?? ''];
    const code = configs?.[ACCS_STORE_VIEW_CODE] ?? configs?.[PAAS_STORE_VIEW_CODE];
    return typeof code === 'string' && code !== '' ? code : undefined;
}

/**
 * The Storefront group: mirrors the Storefront sub-steps the way the Commerce group
 * mirrors its sub-steps — Accounts (both services connected), Repository and Block
 * Libraries. Each row shows ✓ + value once that sub-step's PERSISTED state
 * is satisfied (Storefront has no commit-gating, so no Continue-press is required).
 * The chosen frontend isn't a sub-step — it lives in the architecture line above.
 */
export function storefrontSummaryGroup(state: WizardState): SummaryGroup {
    const eds = state.edsConfig;
    const accountsDone =
        Boolean(eds?.githubAuth?.isAuthenticated) && Boolean(eds?.daLiveAuth?.isAuthenticated);
    const repoDone = state.storefrontRepoValid === true;
    // What the picker shows: the always-included library is kept out of it, though a
    // built project records it, so Edit counted 2 beside 1 card (owner, 2026-10-17).
    const chosen = (state.selectedBlockLibraries ?? []).filter(
        (id) => !isAlwaysIncludedBlockLibrary(id),
    );
    const libCount = chosen.length + (state.customBlockLibraries?.length ?? 0);

    const rows: SummaryRow[] = [
        // An added demo names itself first (D21): the card is far away by now.
        ...(state.demo ? [demoRow(state.demo)] : []),
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
    rows.push({
        label: STOREFRONT_SECTION_TITLES['block-libraries'],
        value: libCount > 0 ? `${libCount} selected` : undefined,
        done: libCount > 0,
    });
    return { heading: 'Storefront', rows };
}

/** "Demo — Isle5 by Jen · Edge Delivery", with a note when it has no pages to copy. */
function demoRow(demo: AddedDemo): SummaryRow {
    const kind = demo.storefrontKind === 'headless' ? 'Headless' : 'Edge Delivery';
    const pages = demo.storefrontKind === 'eds' && !demo.contentSource ? ' (no published pages yet: the site starts empty)' : '';
    return { label: 'Demo', value: `${demo.name} · ${kind}${pages}`, done: true };
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
    ).filter((entry) => entry.kind === 'integration' || entry.kind === 'system');
    // The system that comes with an integration (the ERP) is its own row: the
    // summary names everything the build will deploy (decision 2).
    const rows: SummaryRow[] = resolveIntegrationRows(state, meshComponent, catalog).flatMap((row) => {
        const own: SummaryRow = {
            label: row.name,
            value: row.needsSetup ? 'Needs setup' : 'Ready',
            done: !row.needsSetup,
        };
        return row.companion ? [own, { ...own, label: row.companion }] : [own];
    });
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
