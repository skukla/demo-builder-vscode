# Step 07 — Wizard surface: declare AEM content source + auth on the Connect/Join path

**Goal:** Let the joiner choose "AEM Sites" as the content source and enter the author URL + auth, paralleling Slice 1's `ConnectServicesStep` discipline. (R4 — ACCEPTED: extend `ConnectServicesStep`, not a standalone step.)

## RED tests
- `tests/features/eds/ui/steps/...` (React, jsdom):
  - A content-source choice gates `canProceed`; selecting AEM reveals author-URL + auth fields; selecting DA.live preserves today's flow exactly (regression).
  - Validation: author URL must be https; required fields enforced before Continue (mirror `useCanProceedAll`).
  - Seeding: `contentSourceType` / `aemContentSource` / `aemAuth` flow into `edsConfig` (mirror Slice 1's `buildJoinModeState` seeding tests).

## GREEN surface
- Edit `ConnectServicesStep.tsx` (or a thin content-source sub-step) + a `useAemContentSource` hook mirroring `useDaLiveAuth`.
- Thread fields into `useWizardState` / `computeInitialState`.

## REFACTOR
- Reuse existing service-card components; no new card framework.

## Dependency note
- Auth field shape depends on **R1**. If R1 = defer-with-stub, render a single secret-ref field now and refine when the grant is pinned.

## Done-when
- Choice-gating + validation + seeding tests green; DA.live flow regression intact; full regression green.
