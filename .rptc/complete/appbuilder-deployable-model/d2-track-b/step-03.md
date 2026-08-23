# Step 03 — Generalize ArchitectureModal's mesh toggle into a deployables picker

**Purpose:** Replace the single hardcoded mesh on/off toggle in `ArchitectureModal` with a
catalog-filtered deployables picker (mesh becomes one row). Preserve every package-driven behavior:
required deployables auto-included + shown locked; optional toggleable; curated-list-filtered-by-stack +
custom-URL door (reusing the block-library selector pattern). NOT a new wizard step (locked decision).

## Prerequisites

- Steps 01 (`getSelectableDeployables`) + 02 (`selectedDeployables` state + `withSelectedDeployable`).
- Reuse (do NOT fork): `ArchitectureStepContent.tsx` mesh section (`:133-155`),
  `BlockLibrariesStepContent.tsx` (the curated + custom checkbox-list pattern), `AppBuilderCard`'s
  public-GitHub URL input + its canonicalization/charset validation (extract for shared use — see Step
  05 note; if Step 05 runs after, extract the validator here and Step 05 reuses it).

## Tests to write FIRST (RED)

**File:** `tests/unit/features/project-creation/ui/components/DeployablesStepContent.test.tsx`
(@testing-library/react)

- [ ] Renders one checkbox row per `getSelectableDeployables(...)` entry (catalog filtered by
      backend/frontend), with name + description.
- [ ] A `requirement:'required'` row renders checked + disabled ("Included with your storefront",
      mirroring the native-block-library row).
- [ ] A `requirement:'optional'` row toggles → calls `onDeployableToggle(id, isSelected)`.
- [ ] The mesh entry appears as ONE row (no special-case mesh section); toggling it drives the same
      handler (proves the generalization).
- [ ] Custom-URL door: entering a valid public GitHub URL + clicking Add calls `onAddCustomDeployable`
      with a canonicalized source; an invalid URL disables Add (reuse AppBuilderCard's validation).
- [ ] Empty catalog → an empty-state message, no crash (Edge).
- [ ] Stable empty arrays passed to any hook are module-level constants (no infinite re-render —
      assert via a render-count guard or rely on the lint rule; document the gotcha).

**File:** `tests/unit/features/project-creation/ui/components/ArchitectureModal.test.tsx` (extend)

- [ ] The modal renders the deployables picker in place of the old mesh section.
- [ ] Selecting/deselecting deployables calls `onSelectedDeployablesChange` (the Step 02 state setter).
- [ ] The mesh-requirement mapping still drives Adobe I/O step inclusion (integration with Step 02's
      backward-compat path) — at minimum assert the mesh row's selection propagates to the existing
      `onOptionalDependenciesChange`.

## Implementation (GREEN)

- Create `src/features/project-creation/ui/components/DeployablesStepContent.tsx` — presentational,
  modeled on `BlockLibrariesStepContent.tsx`: a curated checkbox list (required rows disabled+checked,
  optional rows toggleable) + a custom-URL sub-section reusing the shared GitHub-URL input/validator.
  Props are data + callbacks only (no internal fetching). < 350 lines.
- Modify `ArchitectureModal.tsx`:
  - Replace `meshOptionalDeps`/`isMeshComponentId`/`showMeshToggle`/`handleMeshToggle` block
    (`:123-154`, `:298-304`) with `getSelectableDeployables(pkg, backend, frontend)` + a
    `handleDeployableToggle` that calls `withSelectedDeployable` (Step 02) and ALSO maps the mesh id to
    `onOptionalDependenciesChange` for backward compat.
  - Pass `selectedDeployables` + handlers down to `DeployablesStepContent` via the `architecture` step
    content (or as a sibling section in the architecture step — keep it in the architecture modal step,
    not a new modal step).
  - Keep `ArchitectureModal` under 500 lines (it's ~324 now; the picker logic moves OUT to
    `DeployablesStepContent` + Step 01 helpers, so net lines should be flat/lower).
- Wire the new props through `BrandGallery.tsx` → `WelcomeStep.tsx` → `useModalState.ts` (the existing
  `selectedOptionalDependencies` plumbing path); add `selectedDeployables` alongside.

## Files

| File | Action |
|---|---|
| `src/features/project-creation/ui/components/DeployablesStepContent.tsx` | create |
| `src/features/project-creation/ui/components/ArchitectureModal.tsx` | modify (replace mesh toggle) |
| `src/features/project-creation/ui/components/ArchitectureStepContent.tsx` | modify (remove mesh section OR host the picker) |
| `src/features/project-creation/ui/components/BrandGallery.tsx` | modify (prop passthrough) |
| `src/features/project-creation/ui/steps/WelcomeStep.tsx` | modify (prop passthrough) |
| `src/features/project-creation/ui/hooks/useModalState.ts` | modify (selectedDeployables wiring) |
| (shared URL validator) `src/core/validation/` or `@/features/dashboard` extraction | create/extract |
| `tests/unit/.../DeployablesStepContent.test.tsx` | create |
| `tests/unit/.../ArchitectureModal.test.tsx` | modify |

## Dependencies / ordering

- After Steps 01 + 02. Independent of Step 04 (Configure). Shares the GitHub-URL validator with Step 05
  — extract it ONCE (here) and let Step 05 import it (Rule of Three: 2 uses → extract now since both are
  in-plan).

## Risks

- **Removing the mesh special-case breaks step-filtering** (HIGH): the wizard gates Adobe I/O steps on
  `hasMeshInDependencies`. Mitigation: Step 02's mesh-id mapping + the ArchitectureModal integration
  test keep the mesh selection flowing into `onOptionalDependenciesChange`. Do NOT delete
  `isMeshComponentId` usage in the step-filter path.
- **Prop-drilling churn** (MEDIUM): the selection threads through 4 components. Mitigation: mirror the
  EXISTING `selectedOptionalDependencies` prop path exactly; no new context.
- **File-size creep on ArchitectureModal** (MEDIUM): keep the picker presentational in
  `DeployablesStepContent`; only handlers live in the modal.

## Self-critique (KISS/YAGNI)

- Reuses the block-library selector pattern verbatim (curated + custom + settings link). No new modal
  step, no new wizard step. The custom-URL door reuses AppBuilderCard's validator (extracted once).
- Mesh is no longer special-cased in the UI; the ONE transitional special-case (mesh→optionalDeps
  mapping for step-filtering) is isolated to a single handler line and documented for D3 removal.

## Acceptance criteria

- Mesh renders as a normal catalog row; required locked / optional toggleable; custom-URL door works
  with shared validation; Adobe I/O step-filtering unchanged; component tests green; files within limits.
