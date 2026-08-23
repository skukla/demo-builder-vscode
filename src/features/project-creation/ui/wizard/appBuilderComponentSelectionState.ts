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

import { isMeshComponentId } from '@/core/constants';

/** Stable empty array for hook defaults (avoids the infinite-re-render gotcha). */
const EMPTY_STRING_ARRAY: readonly string[] = [];

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
    return current.filter((existing) => existing !== id);
}

/**
 * Map a mesh catalog appBuilderComponent id to its mesh component id(s).
 *
 * Now an identity check rather than a translation table. Mesh catalog entries are
 * derived from the registry (`meshCatalogDerivation`), so a mesh appBuilderComponent
 * id IS its component id and the two namespaces this function once bridged are one.
 * The table it replaced was the last place the catalog's own id namespace survived —
 * and it was correct, which is how the mismatched `source.repo` beside it went
 * unnoticed.
 *
 * @param appBuilderComponentId - A catalog appBuilderComponent id
 * @returns `[id]` for a mesh appBuilderComponent, or [] for non-mesh
 */
export function meshAppBuilderComponentToComponentIds(appBuilderComponentId: string): string[] {
    return isMeshComponentId(appBuilderComponentId) ? [appBuilderComponentId] : [];
}
