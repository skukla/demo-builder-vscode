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
- Auth UI depends on **R1** (ideal-first, no dev-token paste). If verification picks **(A)** reuse-`aio`/IMS, there is **no new auth field** — the content-source step just confirms the AEM author URL + content path. If **(B)** OAuth S2S, render a guided S2S-credential card (client-id/secret → `secrets`), styled like the existing service cards. Build the non-auth fields (author URL, content path, https validation) now; add the auth affordance once A vs B is settled.

## Done-when
- Choice-gating + validation + seeding tests green; DA.live flow regression intact; full regression green.
