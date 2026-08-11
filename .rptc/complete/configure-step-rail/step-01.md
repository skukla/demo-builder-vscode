# Step 01 — Promote the rail to core as `StepRail`

Independent of step 02. No behaviour change.

## Why

`VerticalStepList` renders horizontally (`<ol aria-orientation="horizontal">` at :134;
`.vsteplist` and `.step-nav` are both `flex-direction: row !important`) while being named
Vertical and carrying a docstring that says "a VERTICAL MENU … renders top-to-bottom".

That is not a cosmetic complaint. In Phase 1, one of three research agents read the
docstring, reported the component as vertical, and warned that a horizontal rail had been
"built and rejected" — the exact opposite of the truth. Configure is its first
cross-feature consumer, which is the moment to fix it.

Also: `src/CLAUDE.md` says features should not import from other features. Leaving it in
`features/project-creation/` makes Configure violate that rule.

## Change

1. Move to `src/core/ui/components/navigation/StepRail.tsx`. Rename the component and
   `VerticalStepListProps` → `StepRailProps`. Keep `StepTab` and `StepTabStatus` — the
   wizard's `areaSubSteps.ts` mirrors that shape and those names are still accurate.
2. **Rewrite the docstring** to describe what it does: a horizontal, fully-controlled rail
   of tabs; only `done`/`current` are actionable; parent owns `activeId`/`onSelect`.
   Keep the history note, corrected: a numbered-circle stepper was rejected, and the
   strip was reinstated after an earlier rejection.
3. Update the two wizard imports (`CommerceStep.tsx:301`, `StorefrontStep.tsx:251`) and
   the export barrel if one covers it.
4. Leave the CSS class names (`.vsteplist*`) alone — renaming them touches the wizard's
   visual surface for no gain, and step 05 needs the styling stable to isolate the
   `--wizard-content-pad` trap.

## Tests

Move `tests/features/project-creation/ui/components/VerticalStepList.test.tsx` →
`tests/core/ui/components/navigation/StepRail.test.tsx`. All **17** cases move unchanged
except the import path and describe name.

Do not add cases here. The proof this step is behaviour-preserving is that the wizard's
`CommerceStep` (25 cases) and `StorefrontStep` suites stay green **without edits**.

Note: the enter-animation cases need `jest.advanceTimersByTime(600)` for `useEnterExit`.

## Done when

- No file under `src/features/dashboard/` imports from `src/features/project-creation/`
  (grep, with a positive control)
- Wizard suites pass untouched
- `gate` green
