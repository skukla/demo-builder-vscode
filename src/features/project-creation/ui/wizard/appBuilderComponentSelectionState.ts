/**
 * Wizard AppBuilderComponent-Selection State (D2 Track B — Step 02)
 *
 * Pure helpers that carry selected appBuilderComponent ids through the wizard, mirroring
 * the existing selectedOptionalDependencies array-of-ids pattern. The picker
 * (Step 03) writes WizardState.selectedAppBuilderComponents via these helpers.
 *
 * Mesh DUAL-FLOW (transitional, documented for D3 removal): a mesh appBuilderComponent
 * also flows through selectedOptionalDependencies (the legacy mesh component
 * ids) so the existing Adobe-I/O wizard step-filtering — gated on
 * hasMeshInDependencies (useWizardState.ts) — keeps working unchanged. The
 * mesh catalog-id ↔ component-id mapping below is the single source of truth
 * for that bridge. Do NOT delete the isMeshComponentId step-filter path.
 *
 * @module features/project-creation/ui/wizard/appBuilderComponentSelectionState
 */

import { COMPONENT_IDS } from '@/core/constants';

/** Stable empty array for hook defaults (avoids the infinite-re-render gotcha). */
const EMPTY_STRING_ARRAY: readonly string[] = [];

/**
 * Mesh catalog appBuilderComponent id → legacy mesh component id(s).
 *
 * Catalog ids (app-builder-components.json) live in a different namespace than the stack
 * optionalDependencies component ids (components.json). This map bridges the
 * two so a selected mesh appBuilderComponent still drives hasMeshInDependencies.
 */
const MESH_APP_BUILDER_COMPONENT_TO_COMPONENT_IDS: Readonly<Record<string, string[]>> = {
    'commerce-paas-mesh': [COMPONENT_IDS.EDS_COMMERCE_MESH],
    'commerce-eds-mesh': [COMPONENT_IDS.EDS_ACCS_MESH],
    'headless-commerce-mesh': [COMPONENT_IDS.HEADLESS_COMMERCE_MESH],
};

/**
 * Add or remove an App Builder component id immutably.
 *
 * @param selected - Current selection (undefined treated as empty)
 * @param id - The appBuilderComponent id to toggle
 * @param isSelected - true to add, false to remove
 * @returns A new array reflecting the toggle (never mutates the input)
 */
export function withSelectedAppBuilderComponent(
    selected: readonly string[] | undefined,
    id: string,
    isSelected: boolean,
): string[] {
    const current = selected ?? EMPTY_STRING_ARRAY;
    if (isSelected) {
        if (current.includes(id)) return [...current];
        return [...current, id];
    }
    return current.filter(existing => existing !== id);
}

/**
 * Compute the effective selection: user toggles UNIONed with required ids
 * (required appBuilderComponents are always present even if never toggled).
 *
 * @param selected - The user-toggled selection (undefined treated as empty)
 * @param requiredIds - Ids the package marks required (auto-included)
 * @returns The deduped union of selected + required ids
 */
export function computeSelectedAppBuilderComponents(
    selected: readonly string[] | undefined,
    requiredIds: readonly string[],
): string[] {
    return [...new Set([...requiredIds, ...(selected ?? EMPTY_STRING_ARRAY)])];
}

/**
 * Map a mesh catalog appBuilderComponent id to its legacy mesh component id(s).
 *
 * @param appBuilderComponentId - A catalog appBuilderComponent id
 * @returns The mesh component ids for a mesh appBuilderComponent, or [] for non-mesh
 */
export function meshAppBuilderComponentToComponentIds(appBuilderComponentId: string): string[] {
    return MESH_APP_BUILDER_COMPONENT_TO_COMPONENT_IDS[appBuilderComponentId] ?? [];
}
