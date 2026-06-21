/**
 * Wizard Deployable-Selection State (D2 Track B — Step 02)
 *
 * Pure helpers that carry selected deployable ids through the wizard, mirroring
 * the existing selectedOptionalDependencies array-of-ids pattern. The picker
 * (Step 03) writes WizardState.selectedDeployables via these helpers.
 *
 * Mesh DUAL-FLOW (transitional, documented for D3 removal): a mesh deployable
 * also flows through selectedOptionalDependencies (the legacy mesh component
 * ids) so the existing Adobe-I/O wizard step-filtering — gated on
 * hasMeshInDependencies (useWizardState.ts) — keeps working unchanged. The
 * mesh catalog-id ↔ component-id mapping below is the single source of truth
 * for that bridge. Do NOT delete the isMeshComponentId step-filter path.
 *
 * @module features/project-creation/ui/wizard/deployableSelectionState
 */

import { COMPONENT_IDS } from '@/core/constants';

/** Stable empty array for hook defaults (avoids the infinite-re-render gotcha). */
const EMPTY_STRING_ARRAY: readonly string[] = [];

/**
 * Mesh catalog deployable id → legacy mesh component id(s).
 *
 * Catalog ids (deployables.json) live in a different namespace than the stack
 * optionalDependencies component ids (components.json). This map bridges the
 * two so a selected mesh deployable still drives hasMeshInDependencies.
 */
const MESH_DEPLOYABLE_TO_COMPONENT_IDS: Readonly<Record<string, string[]>> = {
    'commerce-paas-mesh': [COMPONENT_IDS.EDS_COMMERCE_MESH],
    'commerce-eds-mesh': [COMPONENT_IDS.EDS_ACCS_MESH],
    'headless-commerce-mesh': [COMPONENT_IDS.HEADLESS_COMMERCE_MESH],
};

/**
 * Add or remove a deployable id immutably.
 *
 * @param selected - Current selection (undefined treated as empty)
 * @param id - The deployable id to toggle
 * @param isSelected - true to add, false to remove
 * @returns A new array reflecting the toggle (never mutates the input)
 */
export function withSelectedDeployable(
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
 * (required deployables are always present even if never toggled).
 *
 * @param selected - The user-toggled selection (undefined treated as empty)
 * @param requiredIds - Ids the package marks required (auto-included)
 * @returns The deduped union of selected + required ids
 */
export function computeSelectedDeployables(
    selected: readonly string[] | undefined,
    requiredIds: readonly string[],
): string[] {
    return [...new Set([...requiredIds, ...(selected ?? EMPTY_STRING_ARRAY)])];
}

/**
 * Map a mesh catalog deployable id to its legacy mesh component id(s).
 *
 * @param deployableId - A catalog deployable id
 * @returns The mesh component ids for a mesh deployable, or [] for non-mesh
 */
export function meshDeployableToComponentIds(deployableId: string): string[] {
    return MESH_DEPLOYABLE_TO_COMPONENT_IDS[deployableId] ?? [];
}
