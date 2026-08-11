# Step 02 — Wizard selection state shape (componentSelections / project.deployables)

**Purpose:** Decide and implement the exact wizard state shape that carries selected deployables from
the picker (Step 03) through Review and into the created project. This is a small, pure state step that
mirrors the existing `selectedOptionalDependencies` pattern so the wizard plumbing in Step 03 has a
typed target. Splitting it out keeps Step 03 focused on the UI.

## The decision (locked)

Reuse the existing wizard state field rather than inventing a parallel one. Today the mesh toggle writes
into `state.selectedOptionalDependencies` (an array of component ids;
`useWizardState.ts:336-340`, `ArchitectureModal.tsx:139-152`). Track B generalizes this to a
**`selectedDeployables: string[]`** array of catalog deployable **ids** held alongside
`selectedOptionalDependencies`, because:
- deployable ids are catalog ids, not stack `optionalDependencies` component ids (different namespace);
- mesh continues to flow through BOTH for backward compatibility during D2 (the mesh catalog id maps to
  the existing mesh component ids via a small adapter), so the create path and step-filtering
  (`hasMeshInDependencies`, `useWizardState.ts:340`) keep working unchanged.

At project creation, `selectedDeployables` is recorded so the dashboard (Step 05) knows which deployables
the demo intends — distinct from `project.deployables` (the keyed RUNTIME state D1 owns, written on
actual deploy). The wizard does NOT deploy; it records intent. Required deployables are auto-added to
`selectedDeployables`; optional ones are toggled.

## Prerequisites

- Step 01 (`getSelectableDeployables` for the required/optional split).
- Reuse: `useWizardState.ts` state object, `wizardHelpers.ts`, `reviewPredicates.ts`,
  `types/base.ts` Project shape.

## Tests to write FIRST (RED)

**File:** `tests/unit/features/project-creation/ui/wizard/deployableSelectionState.test.ts`

- [ ] A helper `withSelectedDeployable(selected, id, isSelected)` adds/removes an id immutably
      (module-level stable-empty-array default — avoid the infinite-re-render gotcha).
- [ ] Required deployables are always present in the computed selection even if the user never toggled
      them (auto-included), mirroring `requiredAddonIds` (`ArchitectureModal.tsx:203`).
- [ ] Toggling an optional deployable off removes only that id, leaving required + other optionals.
- [ ] The mesh catalog id round-trips: selecting the mesh deployable still yields
      `hasMeshInDependencies(effectiveDeps) === true` via the mesh-id mapping (backward-compat lock).

**File:** `tests/unit/features/project-creation/ui/steps/reviewPredicates.test.ts` (extend existing)

- [ ] Review lists each selected deployable's name (resolved via `getDeployableName`), required ones
      flagged as "Included".

## Implementation (GREEN)

- Add `selectedDeployables?: string[]` to the wizard state type and its initializer (default via a
  module-level `const EMPTY_STRING_ARRAY: readonly string[] = []`).
- Add `withSelectedDeployable` pure helper to `wizardHelpers.ts` (or a new
  `deployableSelectionState.ts` if `wizardHelpers.ts` nears the 500-line limit — check first).
- Add the mesh-id ↔ catalog-id mapping in ONE small helper (reuse `isMeshComponentId` from
  `@/core/constants`); keep mesh flowing through `selectedOptionalDependencies` for step-filtering.
- Extend `reviewPredicates.ts` to surface selected deployables.

## Files

| File | Action |
|---|---|
| `src/features/project-creation/ui/wizard/hooks/useWizardState.ts` | modify (add field + initializer) |
| `src/features/project-creation/ui/wizard/wizardHelpers.ts` (or new `deployableSelectionState.ts`) | modify/create |
| `src/features/project-creation/ui/steps/reviewPredicates.ts` | modify |
| `tests/unit/.../deployableSelectionState.test.ts` | create |
| `tests/unit/.../reviewPredicates.test.ts` | modify |

## Dependencies / ordering

- After Step 01. Blocks Step 03 (the picker writes this state).

## Risks

- **Dual-state drift** (MEDIUM): keeping mesh in both `selectedOptionalDependencies` AND
  `selectedDeployables` risks divergence. Mitigation: the mesh-id mapping is the single source of truth
  for the mesh case; the round-trip test locks it. Do NOT remove `selectedOptionalDependencies` (D3
  may unify; YAGNI now).
- **Step-filtering regression** (MEDIUM): `hasMeshInDependencies` gates Adobe I/O wizard steps. The
  backward-compat test prevents accidentally dropping a mesh selection from the filter input.

## Self-critique (KISS/YAGNI)

- Reuses the existing array-of-ids pattern; adds ONE field + one pure helper. No state machine, no
  context, no reducer rewrite. Mesh dual-flow is a transitional pragma documented for D3, not a new
  abstraction.

## Acceptance criteria

- `selectedDeployables` carries required+optional intent; mesh backward-compat round-trip holds; Review
  lists selections. Suite green.
