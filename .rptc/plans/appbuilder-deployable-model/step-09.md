# Step 09 — Retire the manual API-Mesh setup step (automation replaces Console-UI instructions)

> **⚠️ DEFERRED → D2 (2026-06-21).** This step was BLOCKED during D1 TDD and intentionally not executed.
> Steps 07/08 *built* the subscriber (`subscribeRequiredApis`) and the deploy-contract runner
> (`addDeployable`), but **nothing wires them into a live flow** — `DeployMeshCommand` and the wizard's
> `check-api-mesh` handler still never call them (confirmed by repo-wide search). Its stated prerequisite
> ("automation in place") is only half-true: built ≠ wired. Removing the manual `setupInstructions` /
> `MeshErrorDialog` path now would leave the absent-API case with **no remediation and no auto-fix** — a
> regression. **True prerequisite (D2):** a concrete `ApiSubscriberClient` adapter over
> `AdobeEntityFetcher` (incl. the still-missing `ensureOAuthCredentialId`) + a live call site
> (`DeployMeshCommand` / wizard finalization) that invokes `addDeployable` / a bounded pre-deploy
> `subscribeRequiredApis`. Run this step only AFTER that wiring lands and a RED test can assert the
> subscriber runs on the absent-API case. The body below is otherwise correct.

**Purpose:** With step 07 automating the API-Mesh API addition (`createAdobeIdCredential{platform:
'apiKey',domain}` + `subscribeAdobeIdIntegrationToServices('GraphQLServiceSDK')`), remove the shipped
MANUAL remediation: today `checkApiMesh` detects the API absent and returns `setupInstructions` rendered
in `MeshErrorDialog` telling the user to add it by hand in the Console UI. This step automates that
addition in the add/deploy path and retires the manual path. **Done LAST** so remediation is never
removed before the automation that replaces it is wired (step 07 + step 08).

**Prerequisites:** Steps 07 + 08 (automation must be in place and green first).

**Reuse / surgical anchors (verified):**
- `src/features/mesh/handlers/checkHandler.ts` — lines 68–75 (`apiEnabled`, `setupInstructions` in
  result type), line 183 `checkApiMeshEnabled`, lines 188–195 (absent → returns `setupInstructions` via
  `getSetupInstructions`). This is the manual path to retire.
- `src/features/project-creation/config/api-services.json` — `services.apiMesh.setupInstructions`.
- `MeshErrorDialog` (webview) — renders those instructions with an "Open Console" button.
- Post-add verification reuse: success ≡ API Mesh appears in `workspace.details.services` (the SAME
  signal `checkApiMesh` reads) — use it as the automation's built-in check.

## Tests to write FIRST (RED)

Extend `tests/features/mesh/handlers/checkHandler.test.ts` (or create if absent):

- [ ] when the API Mesh API is ABSENT, the add/deploy path INVOKES the subscriber (step 07) to add it,
      rather than `checkApiMesh` returning manual `setupInstructions` (assert subscriber called).
- [ ] after automation, `checkApiMesh` reports `apiEnabled:true` (verification reads
      `workspace.details.services` and finds the API) — the built-in success check.
- [ ] `checkApiMesh` NO LONGER returns a `setupInstructions` array for the missing-API case (the field
      is removed or always empty) — the manual remediation contract is gone.
- [ ] a project that already has the API enabled is a no-op (idempotent; subscriber not re-run
      destructively).

New/updated webview test (if `MeshErrorDialog` retains other uses): assert the manual-API-Mesh branch is
removed; remaining error states (auth, org mismatch) are untouched.

## Files to create / modify

- MODIFY `src/features/mesh/handlers/checkHandler.ts` — remove the `setupInstructions` remediation branch
  for the missing-API case; rely on the add/deploy path's automation (step 07/08) to add the API; keep
  `apiEnabled` detection as the post-automation verification signal.
- MODIFY `src/features/project-creation/config/api-services.json` — remove the now-dead
  `services.apiMesh.setupInstructions` block (no soft-deprecation — delete it; see project memory
  "No Soft Deprecation").
- MODIFY/REMOVE the manual-API-Mesh branch in `MeshErrorDialog` and any `getSetupInstructions` wiring
  specific to API Mesh. Preserve unrelated dialog error states.

## RED → GREEN → REFACTOR

- RED: tests asserting subscriber-on-absent + no-setupInstructions fail against current manual path.
- GREEN: route absent-API through the subscriber; delete manual instructions + dead config/UI.
- REFACTOR: remove now-unused helpers (`getSetupInstructions` for API Mesh), unused imports; run
  `/rptc:helper-sop-scan` to catch dead code.

## Acceptance criteria

- Adding a mesh no longer requires a manual Console-UI step; the API is added automatically and verified
  via `workspace.details.services`; the manual `setupInstructions` path + dead config are deleted; full
  suite GREEN.

## Risks

- **Removing remediation before automation is proven.** Mitigation: this step is sequenced LAST and
  gated on steps 07+08 being GREEN; the RED tests assert the subscriber runs on the absent-API case
  before any instruction-removal is committed.
- **Other `MeshErrorDialog` error states regressing.** Mitigation: only the API-Mesh branch is removed;
  webview test asserts auth/org-mismatch states remain.
