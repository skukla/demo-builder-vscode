# Plan: IMS Org Mismatch — Action-Time Gate + Switch Feedback

**Source research:** `.rptc/research/ims-org-mismatch-notification/research.md`
**Branch:** `claude/ims-mismatch-notification-treo89`
**Decision:** Keep the badge + banner. Close the two gaps the research surfaced, lead with
the layer-3 action-time gate (the highest-value, most concrete fix).

## Scope (this iteration)

### Step 01 — Reactive action-time org-context gate *(the lead)*
Today, when a gated action (mesh deploy) hits an org mismatch, `deployMesh.ts:81-91` shows a
**button-less warning** that just tells the user to go use "Switch IMS Org" on the dashboard —
a dead end. Mirror the existing `ensureAdobeIOAuth` pause-and-prompt guard with a sibling
**`ensureProjectOrgContext`** that turns this into a real blocking **"Switch IMS Org / Cancel"**
prompt performing the forced switch + re-verify inline, then adopt it in `deployMesh`.

- **Location:** `src/features/authentication/services/ensureProjectOrgContext.ts` (NOT
  `core/auth/` — the guard needs `detectProjectOrgMismatch`, and `core/` may not import
  `@/features/*`; the org-context logic already lives in this feature).
- Shape mirrors `ensureAdobeIOAuth`: `detect → (mismatch?) warn[Switch/Cancel] → forced
  login → re-verify`. Returns `{ reachable, cancelled?, currentOrg? }`.
- `deployMesh` replaces the dead-end warning with the guard; on `!reachable && !cancelled`
  show a concise "still wrong org" error; on cancel, silent early-return + refreshStatus.

### Step 02 — In-flight feedback on the banner's `Switch IMS Org` *(layer-2 polish)*
`handleSwitchOrg` posts the message with no in-flight state; during the multi-second forced
login + re-verify the button stays live/silent. Add a local `isSwitchingOrg` state in
`ProjectDashboardScreen`, set on press, cleared when the org check resolves
(`orgCheckState` leaves `checking`); `OrgContextNotice` shows a disabled "Switching…" button
and guards double-submit.

## Deferred (not this iteration)

- **`InlineNotice` extraction** (bespoke banner → shared Spectrum-aligned component). Pure
  refactor, and the project SOP flags reusable components with a single use case. Revisit
  when a 2nd persistent-alert caller appears. Recorded in research §4.

## Guardrails

- Do **not** convert the banner to `withProgress`/toast (research conclusion).
- The gate is the *reactive* layer — it does **not** replace the proactive badge/banner;
  it fills the action-time slot that today dead-ends.
- Keep the guard's auth surface structural (interface), mirroring `ensureAdobeIOAuth` — no
  hard dependency on the concrete service for testability.

## Tests (TDD)

- New `tests/features/authentication/services/ensureProjectOrgContext.test.ts`
  (mirror `tests/core/auth/adobeAuthGuard.test.ts`).
- New `tests/features/mesh/commands/deployMesh-orgContext.test.ts` (mock the guard;
  switch-success proceeds, cancel/fail early-returns + refreshStatus).
- Extend `tests/features/dashboard/ui/ProjectDashboardScreen-orgMismatch.test.tsx`
  for the `Switching…` state.

See `step-01-action-gate.md` and `step-02-switch-feedback.md`.
