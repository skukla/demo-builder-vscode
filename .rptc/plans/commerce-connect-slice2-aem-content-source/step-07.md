# Step 07 — Wizard surface: declare AEM content source on the Connect/Join path

**Goal:** Let the joiner choose "AEM Sites" as the content source and enter the **author URL + content path** — **no auth fields** (R1 resolved: read is AEM-owned, write reuses the existing login). Parallels Slice 1's `ConnectServicesStep` discipline. (R4 — ACCEPTED: extend `ConnectServicesStep`, not a standalone step.)

## RED tests
- `tests/features/eds/ui/steps/...` (React, jsdom):
  - A content-source choice gates `canProceed`; selecting AEM reveals **author-URL + content-path** fields (no auth field); selecting DA.live preserves today's flow exactly (regression).
  - Validation: author URL must be https; content path required; enforced before Continue (mirror `useCanProceedAll`).
  - Seeding: `contentSourceType` / `aemContentSource` flow into `edsConfig` (mirror Slice 1's `buildJoinModeState` seeding tests). No `aemAuth`.

## GREEN surface
- Edit `ConnectServicesStep.tsx` (or a thin content-source sub-step) + a `useAemContentSource` hook mirroring `useDaLiveAuth` **minus the credential bits** (URL + path only).
- Thread fields into `useWizardState` / `computeInitialState`.

## REFACTOR
- Reuse existing service-card components; no new card framework. No credential card — there is no AEM secret to collect.

## Scope note
- **No auth affordance here.** Read auth is AEM-owned; the config-write reuses the existing Adobe IMS login. The in-AEM Authentication-tab setup (Site Auth Token / technical account / Product Profile) is **Slice-3 front-door** work — the joiner's AEM is already EDS-configured in the point-at model.

## Done-when
- Choice-gating + validation + seeding tests green; DA.live flow regression intact; full regression green.
