/**
 * Wizard AppBuilderComponent-Selection State (D2 Track B — Step 02)
 *
 * Pure helper that carries selected appBuilderComponent ids through the wizard.
 * `WizardState.selectedAppBuilderComponents` is the SINGLE wizard-side authority
 * for App Builder selections, mesh included (D3): mesh catalog ids ARE registry
 * component ids (`meshCatalogDerivation`), so serialization derives the wire's
 * dependencies from the mesh-kind ids in the selection via `isMeshComponentId`.
 * The legacy `selectedOptionalDependencies` mirror (the "mesh dual-flow") was
 * removed by D3 — git has its history.
 *
 * @module features/project-creation/ui/wizard/appBuilderComponentSelectionState
 */

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
