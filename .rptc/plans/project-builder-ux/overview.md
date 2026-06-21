# Slice 2 — Two-column "Project Builder" wizard step

**Status:** Implemented + verified (two review passes). Awaiting commit approval.
**Branch/worktree:** `feature/project-builder-ux` (stacked on `feature/appbuilder-component-rename` / PR #59; rebase onto develop after #59 merges).
**Research:** `.rptc/research/project-builder-ux/research.md`.

## Context

Project composition (stack, addons, App Builder components, block libraries) ran through a multi-step **modal** (`ArchitectureModal`) opened from a brand card — the wrong container for interdependent, revisited composition (the shared `Modal` even caps `fullscreen`→Dialog L). Research recommended a two-column hub-and-spoke "Project Builder." PM decisions: a new **wizard step** (not a webview); **selection only** this slice (per-component config stays in post-creation ConfigureScreen); **Pragmatic** approach; card → builder is **mark-and-Continue**.

## What changed

- **New `project-builder` wizard step**, placed **right after `welcome`** (corrected from the original "before review" — `welcome` now picks the package only; the builder owns stack selection; downstream steps filter on `selectedStack`). Registered in the `WizardStep` union + `wizard-steps.json` + `WizardContainer` renderStep.
- **New `src/features/project-creation/ui/builder/`:** `ProjectBuilderStep.tsx` (hosts `TwoColumnLayout`), `ProjectBuilderRail.tsx` (StatusCard rail: status + required/optional tag + greyed-not-ready), `ProjectBuilderDetail.tsx` (right-pane panel switch), `projectBuilderAreas.ts` (pure gating/areas + `isReadyToProceed`), `useProjectBuilder.ts` (selection + the mesh dual-flow + stack-select seeding).
- **Reused verbatim:** `ArchitectureStepContent`, `AppBuilderComponentsStepContent`, `BlockLibrariesStepContent` as right-pane panels; `StatusCard`; selection services + state helpers.
- **`TwoColumnLayout`** gained an additive `leftWidth?` prop (fixed narrow rail; default behavior unchanged).
- **Retired (deleted, no soft-deprecation):** `ArchitectureModal.tsx`, `useModalState.ts` + tests. `BrandGallery`/`WelcomeStep` rewired to package-select + mark-and-Continue.
- **Mesh dual-flow PRESERVED** (mesh toggle mirror-writes `selectedOptionalDependencies`; gates the Adobe-auth/IO steps) — moved verbatim + locked by `useWizardState-dualFlow.test.tsx`. D3 owns its removal.
- **Parity restored** (caught in review): stack-select seeds default addons + EDS block libraries; the one-time "save block library defaults" tip; cross-package mesh-leak reset on package change.
- **Custom-URL door hidden** (`showCustomDoor={false}`) — inert until creation-side provisioning exists (backlog).
- **Docs synced** (6 stale refs across two review passes): root CLAUDE.md, hooks CLAUDE.md, custom-block-libraries.md, and component/handler header comments.

## Verification (all green)

- `tsc --noEmit` 0 · `npm run lint` (whole repo) 0 errors · `npx jest --no-coverage` 792 suites / 9685 tests.
- Two review passes (code + docs) + re-verify; dual-flow regression test green; no live refs to the deleted modal.

## Deferred (tracked)

`.rptc/backlog/2026-06-21-appbuilder-component-first-class-persistence.md` — the 3 coupled first-class-persistence gaps (edit-mode rehydration, custom-URL creation-side provisioning + re-enabling the door, `buildProjectConfig` serialization), to land with D3's dual-flow removal.

## Notes
- Stacked PR; rebase onto develop after #59. No commit without approval; no AI-attribution.
