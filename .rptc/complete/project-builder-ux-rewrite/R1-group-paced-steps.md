# R1 — Wizard restructure into group-paced steps (APPROVED 2026-06-22)

**Slice 1 of 3** of the Project Builder UX rewrite (see `overview.md`). UX is **LOCKED** — see
`../../research/project-builder-ux/research.md` + `prototype.html`. Do not redesign. Worktree:
`feature/project-builder-ux`. No commit without approval; no AI-attribution trailer.

## Context
The creation wizard funnels composition through many per-concern steps plus the Slice-2 `project-builder`
two-column hub (PR #60, closed/superseded). The locked redesign reorganizes the wizard around component
**groups as steps** — the SETUP PROGRESS timeline is the linear guide. R1 introduces the three group steps,
absorbs the per-concern steps into them, deletes the superseded Slice-2 hub, and generalizes App Builder
step-gating from mesh-only to any App Builder component. R2 adds the tiled Integrations surface; R3 makes the
dashboard runtime-only. Preserve the mesh→storefront `MESH_ENDPOINT`→config.json edge and the mesh dual-flow.

**Adobe sign-in placement (PM decision): interim gated steps.** Keep `adobe-auth → adobe-project →
adobe-workspace` as gated steps before Commerce in R1; R2 folds them into the Integrations setup. They appear
only for ACCS or mesh/App-Builder projects — a plain PaaS storefront already gets the clean 3-group timeline.

## Target wizard order
`welcome (Demo Setup) → prerequisites → [adobe-auth → adobe-project → adobe-workspace]ᵍᵃᵗᵉᵈ → commerce →
integrations → storefront → review → storefront-setup (Publish) → create-project`

> `storefront` (new config group step) ≠ `storefront-setup` (existing EDS publish/execution step — KEPT).

## Keep / Reuse / Delete
**Create** (`src/features/project-creation/ui/steps/`): `CommerceStep.tsx` (ArchitectureStepContent +
ConnectStoreStepContent), `StorefrontStep.tsx` (ConnectServicesStep body + inline repo + BlockLibrariesStepContent),
`IntegrationsStep.tsx` (minimal placeholder, `setCanProceed(true)`, gated `requiresAdobeAuth`).
`src/features/eds/ui/steps/RepoSelectionInline.tsx` (GitHubRepoSelectionStep body re-homed TwoColumn→single).
**Reuse as-is:** ArchitectureStepContent, ConnectStoreStepContent, BlockLibrariesStepContent, ConnectServicesStep,
StorefrontSetupStep, useArrowKeyNavigation, useCanProceedAll, useSelectionStep, SingleColumnLayout.
**Move (byte-identical):** `useProjectBuilder.ts` `ui/builder/` → `ui/steps/` (holds mesh dual-flow mirror-write).
**Delete (no soft deprecation):** `ui/builder/ProjectBuilderStep.tsx`, `ui/builder/projectBuilderAreas.ts`, the
`ui/builder/` dir; registrations (JSON + union + renderStep) for `project-builder`, `component-selection`,
`settings`, `eds-connect-services`, `eds-repository-config` (content components reused; only standalone
registrations go); obsolete tests. `ComponentSelectionStep` file: retire registration; delete file only if
`grep -rn ComponentSelectionStep src/` shows no other production importer.

## Gating generalization (`ui/wizard/hooks/useWizardState.ts` ~336-355, additive only)
Add `const hasAppBuilderComponent = (state.selectedAppBuilderComponents?.length ?? 0) > 0;`
`hasAdobeAuth: meshIncluded || isAccsBackend || hasAppBuilderComponent` (KEEP `hasAdobeIO: meshIncluded`).
**Critical:** add `state.selectedAppBuilderComponents` to the memo dep array (~line 355). Mesh path verbatim.

## 4-place registration (sync) + ID-coupled fixes
JSON (remove retired; add `commerce`/`integrations`[`requiresAdobeAuth`]/`storefront`[`stackRequiresAny:
["requiresGitHub","requiresDaLive"]`]); `WizardStep` union; `renderStep` cases; `StepCondition` (import the
real one from `stepFiltering.ts`, kill the lossy `wizardHelpers.ts:56-61` duplicate). Fixes: org-reset list
`useWizardState.ts:394-398` `'settings'`→`'commerce'`; `getFirstEnabledStep` fallback `'adobe-auth'`→`'welcome'`;
`getNextButtonText` simplify to `currentStepId==='review'`.

## Build sequence (TDD-first; suite green per step; never pipe jest through `tail`)
1. Gating generalization (pure). 2. Registration + retirements (renderStep nulls). 3. CommerceStep.
4. StorefrontStep + RepoSelectionInline. 5. IntegrationsStep + wire renderStep. 6. Coupling cleanup.
7. Full reconcile (WizardContainer mocks; lint+tsc+jest green).

## Risks
GitHubRepoSelectionStep TwoColumn→inline (keep App-install gate in canProceed); `storefront` vs
`storefront-setup` collision; `useCanProceedAll` primitive booleans + module-level `const EMPTY` (React
array-ref infinite-loop); dual-flow byte-identical move; ACCS org context (adobe-* precede commerce).

## Verification
`tsc --noEmit` 0 · `npm run lint` (whole repo) 0 · `npx jest --no-coverage` green. Dual-flow regression +
non-mesh gating test pass. F5 smoke: PaaS → clean 3-group timeline; ACCS/mesh → adobe-* + Integrations appear.
