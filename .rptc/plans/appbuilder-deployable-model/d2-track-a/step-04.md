# Step 04 — Retire the manual API-Mesh setup path (step 09 proper)

**Purpose:** Now that the absent-API case is auto-remediated (Step 03), DELETE the manual Console-UI
remediation: the `setupInstructions` branches in `checkHandler.ts`, the `services.apiMesh.setupInstructions`
config block, the API-Mesh `getSetupInstructions` wiring, and the `MeshErrorDialog` setup-instructions
modal. No soft-deprecation (project memory "No Soft Deprecation"). **Sequenced LAST, gated on Steps 01-03
GREEN.** This executes the DEFERRED `step-09.md` (its body remains the canonical spec).

**Prerequisites:** Steps 01-03 GREEN — a RED test must prove the live path auto-subscribes on the
absent-API case BEFORE any instruction is removed (the regression guard for step 09's central risk).

## Surgical anchors (verified file:line)

- `src/features/mesh/handlers/checkHandler.ts`
  - `MeshCheckResult.setupInstructions?` field (`:75`).
  - absent-API → returns `setupInstructions: getSetupInstructions(...)` — **TWO sites**: Layer 1
    (`:191-196`) and Layer 2 fallback (`:286-293`). Both must drop `setupInstructions`.
  - import of `getSetupInstructions` (`:17`).
- `src/features/project-creation/config/api-services.json` — `services.apiMesh.setupInstructions` block
  (`:12-32`). Keep `detection` (`:6-10`) — `checkApiMeshEnabled` (`:183`) still reads it for the
  post-automation `apiEnabled` verification signal.
- `src/features/project-creation/config/api-services.schema.json` — `setupInstructions` schema entry
  (`:54`). Remove to keep schema in sync (no orphan schema for deleted config).
- `src/features/project-creation/helpers/setupInstructions.ts` — `getSetupInstructions` reads
  `meshConfig?.setupInstructions` (`:82`). After config removal this returns nothing; if API-Mesh is its
  ONLY caller, DELETE the helper + its barrel export (`helpers/index.ts:9`) + its test
  (`tests/features/project-creation/helpers/setupInstructions.test.ts`). Verify no other caller first.
- `src/features/mesh/handlers/shared.ts` — re-exports `getSetupInstructions` (imported at
  `checkHandler.ts:17`). Drop the re-export if dead.
- `src/features/mesh/ui/steps/components/MeshErrorDialog.tsx` — the `setupInstructions` prop (`:19,25`)
  + the entire "View Setup Instructions" modal block (`:37-67`). **Important:** this dialog's title is
  hardcoded `"API Mesh API Not Enabled"` (`:29`) and it has NO auth/org-mismatch states baked in — those
  live in OTHER `ProjectCreationStep` phases (`ProjectCreationStep.tsx:205-215` renders MeshErrorDialog
  ONLY for `phase === 'mesh-error'`; `github-app-install` etc. are separate phases). So "preserve other
  states" = preserve the OTHER PHASES, not branches inside this dialog. Decision: STRIP the
  setup-instructions modal from MeshErrorDialog (it becomes a plain retry/back error dialog), since with
  auto-subscribe a true `mesh-error` is now a deploy/auth failure, not a missing-API case. Keep the
  dialog itself + its Retry/Back actions.
- Type carriers to clean (the `setupInstructions` shape ripples through these — remove the field):
  `src/types/webview.ts:72`, `src/types/handlers.ts:107`,
  `src/features/project-creation/ui/steps/ProjectCreationStep.tsx:209,331`.

## Tests to write FIRST (RED)

The central RED guard (proves automation replaces remediation) — already established by Step 03, restate
as the gate here:

- [ ] **absent-API → live path invokes the subscriber** (Step 03's `deployMesh-subscribe` /
      `meshSetupService` ordering tests are GREEN) — this MUST pass before removing any instruction.

Then, in `tests/features/mesh/handlers/checkHandler.test.ts`:

- [ ] `handleCheckApiMesh`, when API absent (Layer 1), returns `{ apiEnabled: false }` with **NO
      `setupInstructions` field** (assert `result.setupInstructions` is `undefined`).
- [ ] same for the Layer 2 fallback absent-API branch (`:286-293`).
- [ ] when API present, `apiEnabled: true` (the post-automation verification signal still works,
      reading `workspace.details.services` via `checkApiMeshEnabled` + the kept `detection` config).
- [ ] already-enabled project is a no-op (idempotent; no instructions, no re-subscribe in the check).

In `tests/features/mesh/ui/steps/components/MeshErrorDialog.test.tsx` (currently exercises the
setupInstructions modal heavily):

- [ ] MeshErrorDialog NO LONGER renders the "View Setup Instructions" affordance (remove the
      setupInstructions-driven assertions; rewrite to assert the dialog renders error + Retry + Back).
- [ ] other error STATES untouched: org-mismatch / auth phases are rendered by their own components in
      `ProjectCreationStep` (add/keep a test asserting the `mesh-error` phase still shows the dialog;
      the github-app-install phase still shows its dialog).

In `tests/features/project-creation/helpers/setupInstructions.test.ts`:

- [ ] DELETE this test file IF `getSetupInstructions` is removed (no API-Mesh caller remains). If a
      non-mesh caller survives, keep only its still-relevant cases.

## Files to create / modify

- MODIFY `src/features/mesh/handlers/checkHandler.ts` — remove `setupInstructions` from both absent-API
  returns + the result type field (`:75`); drop the `getSetupInstructions` import (`:17`).
- MODIFY `src/features/project-creation/config/api-services.json` — delete the `setupInstructions` block
  (`:12-32`); keep `detection` + `description`.
- MODIFY `src/features/project-creation/config/api-services.schema.json` — delete the `setupInstructions`
  schema entry (`:54`).
- MODIFY `src/features/mesh/ui/steps/components/MeshErrorDialog.tsx` — remove the `setupInstructions`
  prop + the modal block (`:37-67`); keep the error + Retry/Back; drop now-unused imports
  (`DialogTrigger`, `ActionButton`, `InfoOutline`, `Modal`, `NumberedInstructions`, `Text`, `Flex` if
  unused).
- MODIFY `src/features/project-creation/ui/steps/ProjectCreationStep.tsx` — drop the `setupInstructions`
  prop pass-through (`:209`) + the local type field (`:331`).
- MODIFY `src/types/webview.ts` (`:72`), `src/types/handlers.ts` (`:107`) — remove the
  `setupInstructions` field from the mesh-check result types.
- DELETE (if no surviving caller) `src/features/project-creation/helpers/setupInstructions.ts`, its
  barrel export (`helpers/index.ts:9`), the `getSetupInstructions` re-export in
  `mesh/handlers/shared.ts`, and `tests/.../setupInstructions.test.ts`.

## RED → GREEN → REFACTOR

- RED: checkHandler tests asserting `setupInstructions === undefined` fail against the current manual
  path; the MeshErrorDialog test fails (modal still present).
- GREEN: delete the manual path + dead config/UI/types; route absent-API through Step 03's auto-subscribe.
- REFACTOR: `/rptc:helper-sop-scan` to catch dead code (unused imports, the now-orphaned
  `getSetupInstructions`, the `{{ALLOWED_DOMAINS}}` dynamicValues logic if it lived in
  `setupInstructions.ts`). Confirm `deriveAllowedDomain` (Step 03) is now the ONLY producer of the
  `localhost:<port>` allowed-domain value.

## Acceptance criteria

- Adding/deploying a mesh no longer requires a manual Console-UI step; the API is auto-subscribed
  (Step 03) and verified via `workspace.details.services`; the manual `setupInstructions` path + dead
  config/schema/UI/types are DELETED; remaining `ProjectCreationStep` error phases (auth, org mismatch,
  github-app-install) untouched; full suite + repo-wide lint + `tsc --noEmit` GREEN.

## Risks

- **Removing remediation before automation is proven.** Mitigation: this step is LAST and gated — the
  Step 03 absent-API→subscriber RED test must be GREEN before any instruction is deleted.
- **MeshErrorDialog over-deletion.** The dialog is reused for the generic `mesh-error` phase (deploy/auth
  failures), not only missing-API. Mitigation: KEEP the dialog + Retry/Back; remove ONLY the
  setup-instructions modal; a RED test asserts the dialog still renders for `mesh-error`.
- **Orphaned types ripple.** `setupInstructions` appears in 2 type files + the wizard step.
  Mitigation: `tsc --noEmit` over the whole repo (CI gate) surfaces every dangling reference; remove all
  in one step.
- **`getSetupInstructions` has a non-mesh caller.** Mitigation: grep before deleting (research shows only
  API-Mesh + tests reference it); keep the helper if any non-mesh use survives.
