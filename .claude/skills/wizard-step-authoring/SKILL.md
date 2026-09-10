---
name: wizard-step-authoring
description: Add or modify a wizard step, a Build-Your-Project area, or a sub-step inside an area (v6 nested builder). Use when touching wizard-steps.json, buildYourProjectAreas.ts, commerceSections/storefrontSections, areaSubSteps.ts, an area body (*Step.tsx), the integration-flow module, or step order/lock/Continue logic.
---
# Author a Wizard Step or Build-Your-Project Area

## When NOT to use
- Adding an extension↔webview message handler — use the `webview-command-handler` skill.
- Dashboard or Configure screens — those are separate webviews, not wizard steps.
- Do NOT add a new top-level `wizard-steps.json` entry for anything that belongs inside Build Your Project (backend/connect config, storefront setup choices, integrations). Those are areas or sub-steps of the single `build-your-project` entry — a new top-level step for them regresses the v6 design.

## Procedure
1. Pick the level. The v6 structure has three tiers, each with its own home:
   - **Top-level wizard step** (rare): `src/features/project-creation/config/wizard-steps.json` — the canonical step order; one `build-your-project` entry covers all builder content.
   - **Area** inside Build Your Project: `BUILD_AREA_DESCRIPTORS` in `src/features/project-creation/ui/steps/buildYourProjectAreas.ts` — array order IS the canonical display order; visibility via an optional `StepCondition` reusing `filterStepsForStack` (`src/features/project-creation/ui/wizard/stepFiltering.ts`), e.g. storefront's `stackRequiresAny: ['requiresGitHub','requiresDaLive']`.
   - **Sub-step** inside an area: the area's `*Sections.ts` (`commerceSections.ts`, `storefrontSections.ts`) + its driver in `areaSubSteps.ts`. An area may also have NO driver at all (`areaSubSteps(areaId)` → null): Integrations is a single results-only view whose guided configuration lives in a modal journey (`ui/components/integration-flow/` — a deep module; import only from its `index.ts`), gated by the area-status fallback instead of sub-steps.
2. Top-level step only: add the entry to `wizard-steps.json` with an optional `condition`, and give the step component `BaseStepProps` (`{ state, updateState, setCanProceed }` — `src/types/wizard.ts`).
3. New area: add its descriptor to `BUILD_AREA_DESCRIPTORS`, add a completion predicate in `tileStatus.ts` and map it in `statusForArea`, create the area body in `ui/steps/` from the bundled [step-skeleton.tsx](step-skeleton.tsx), and if it has sub-steps register a driver in `areaSubSteps.ts`'s `DRIVERS` map.
4. New sub-step: add the id, `SECTION_TITLES` entry, and section-state logic (status vocabulary `'current' | 'done' | 'upcoming' | 'locked'` + `lockReason`) to the area's `*Sections.ts`; the driver in `areaSubSteps.ts` picks it up via `subSteps()/active()/next()/isComplete()/commit()`. Commit/uncommit is Commerce's commit-gated summary ✓ only — Storefront uses no-ops; Integrations has no driver.
5. Selections go through `useProjectBuilder.ts` — the selection hub. Consume its handlers (`onStackSelect`, `onAppBuilderComponentToggle`, ...) rather than writing parallel state paths; it owns the stack-change reset, and `selectedAppBuilderComponents` is the SINGLE wizard-side mesh authority.
6. Follow Backend Call on Continue (`docs/patterns/selection-pattern.md` + its checklist): selection handlers are UI-only `updateState` calls; backend `request`s happen at the Continue commitment point with a loading overlay and error handling there.
7. Continue gating lives in the `*Sections.ts` predicates (`is<Area>StepComplete`), driven through the driver's `isComplete`; for a driverless area the gate is `statusForArea` → the `tileStatus.ts` completion predicate (Integrations: `isIntegrationsComplete`). The Build step owns the footer gate, so area bodies receive a NO-OP `setCanProceed`. Don't add local can-proceed state in the body.

## Gotchas
- Inline `[]`/`{}` defaults passed into hooks with effect deps create new references every render → infinite re-render loop. Use module-level constants (`EMPTY_PACKAGES`/`EMPTY_STACKS` in `IntegrationsStep.tsx`).
- **The Integrations area renders the SHARED card**, `core/ui/components/integrations/IntegrationCard`
  — the same one the dashboard's integrations page uses. Build a wizard-specific integration row
  and you have rebuilt what drifted last time: the old `IntegrationResultRow` printed the shared
  destination on EVERY row and grew its own rename modal. Give the card a `subline` (the wizard has
  no deploy status) and derive its model with `toIntegrationCards`. The grid and detail drawer are
  deliberately NOT reused — see `.rptc/complete/integrations-surface/overview.md`.
- Adobe Spectrum `Flex` constrains width to 450px — use a plain `div` with flex styles for full-width wizard layouts (root `CLAUDE.md` gotcha).
- An area not appearing for a stack is usually its `StepCondition` working, not a bug — `buildYourProjectAreas.ts` hides non-matching areas exactly like `filterStepsForStack` hides steps (no stack selected hides conditional areas too).
- **The dual-flow mirror is GONE — do not re-add one.** This gotcha used to say the opposite: never remove `onAppBuilderComponentToggle`'s mirror-write to `selectedOptionalDependencies`, because Adobe-auth/IO gating depended on it. ADR-011's D3 removed that mirror on 2026-08-23, and `useProjectBuilder.ts:15` says so in its own header — the skill went on instructing people to preserve a write that no longer existed, citing that header as its authority. `selectedAppBuilderComponents` is the single wizard-side mesh authority now; a second field mirroring it is the defect, not the contract.
- Area completion status (`statusForArea`) is separate from the ACTIVE highlight (`activeChildId` in the timeline) — don't try to mark "active" via the status field.

## Verify
Drive the wizard in the Extension Dev Host — don't trust compilation:
1. `npm run watch:all` in the background; F5 once, then Cmd+R in the Dev Host window after edits.
2. Open Create Project → Welcome → pick a demo package/backend → enter Build Your Project. Confirm: the new area/sub-step appears in the rail at the intended position; locked entries show their `lockReason`; Continue is disabled until the `isComplete` predicate holds and then advances; a `done` sub-step shows its summary value.
3. Switch to a non-EDS stack (and back) and confirm conditional areas hide/show and dependent selections reset.
4. Open the webview devtools console — repeated identical renders or a hang indicates the empty-array reference gotcha.

_If this skill was wrong or incomplete, fix it before closing the task._
