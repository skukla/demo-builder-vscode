# Plan: Adobe org-context — lean self-heal (supersedes the org-picker design)

**Branch:** `feature/adobe-org-context-self-heal`
**Status:** Active — replaces the earlier in-app org-picker approach.
**Supersedes:** the picker-based plan (`~/.claude/plans/iridescent-wobbling-valley.md`) and the
picker portions of `.rptc/backlog/2026-06-15-adobe-org-context-self-heal-consolidation.md`.

## Why this supersedes the picker design

Empirical testing (live `aio` probes) corrected two foundational assumptions:

1. **The IMS token is effectively org-bound, not identity-scoped.** One federated Adobe ID projects a
   *different IMS user per org*. A token reaches exactly ONE org; the others return
   `403 ... not allowed to access resources of org <id>`. Re-login **swaps** which org the token can
   reach (proven: signed into Commerce Solution Led → org list = [CSL], 403 on Demo System; force
   re-login into Demo System → org list = [Demo System], 403 on CSL).
2. **Adobe chooses the org at sign-in, not in our UI.** Normal sign-in restores the previous org;
   forced sign-in (`-f`) presents the org chooser *in the browser*. So an in-app org *picker* fights
   the platform: for org-bound users it only ever shows one org and can't switch to another without a
   re-login anyway.

Consequences for the prior design:
- The dedicated **org-picker step** is redundant (sign-in owns selection; org-bound tokens never list
  more than one org).
- **`getOrgSelectability` / `filterToSelectableOrgs` cannot work**: the installed
  `@adobe/aio-lib-console@5.4.2` has no `getOrganizationFeatures`, and `aio-cli-lib-console` is not a
  dependency. `org.runtime` is therefore never populated and `type` is absent on the CLI-fallback
  path → the rule mis-classifies every developer org and every CLI-fallback org as non-selectable.

## The silent-mismatch scenario this must address

A user is unknowingly signed into **another IMS org in a browser tab**. The CLI sign-in piggybacks on
the browser's existing Adobe SSO session, so a CLI sign-in (first-time, or a silent token refresh)
quietly mints a token for the *tab's* org. The user thinks they're in Org A; the token is Org B →
silent mismatch. A naive recovery (plain re-login) reuses the same tab session and **loops** back to
Org B.

## Lean design (behavior)

Principle: **Adobe owns org selection at sign-in. The extension's job is awareness + safe recovery,
not a picker.**

1. **Know the token's org.** Cheaply track which org the current token actually reaches.
2. **Proactive check on entry — existing projects only.** On dashboard open / project resume / update /
   mesh op, compare token-org vs `project.adobe.organization` *before* any work; mismatch → a clear
   banner up front. (Fresh creation needs no check — the org is whatever you signed into.)
3. **Reactive detection.** Any Adobe op that targets the wrong org returns the typed `ORG_MISMATCH`
   (already built) — surfaced, never a silent dead-end.
4. **Force + verify recovery.** One action — **"Switch Adobe account"** → *forced* sign-in (IMS logout
   + browser org chooser, so a stale tab can't silently reassert) → **verify the landed org == target**.
   Match → continue. Still wrong → explicit *"Still signed into <Org B>; you may have another browser
   tab in <Org B> — close it or pick <Org A> in the sign-in window."* No silent loop.

Hygiene retained: per-operation env targeting so the extension **never mutates the global `aio`
selection** (never a clobber source) and can target project/workspace within the token's org.

## Keep / Change / Delete / Add (vs current branch state)

**Keep**
- `orgContextEnv` / `withOrgContext` / `applyAdobeCLIDefaults` (per-op targeting; no global mutation).
- `403 → ORG_MISMATCH` in `adobeEntityFetcher` (reactive detection).
- `ErrorCode.ORG_MISMATCH`.
- MCP `orgMismatchResult` / `isOrgMismatchError` / non-retryable signal.
- `AdobeAuthStep` force-login ("Sign in with a different account") — the switch + recovery trigger.
- SDK entity-fetch timeout fix (already on develop).

**Change**
- `ensureOrgContext`: simplify to reachability only — "is target the token's org (in the token's
  reachable list)? → ok, else → needs_relogin." Drop selectability framing.

**Delete (no soft deprecation)**
- `getOrgSelectability` / `filterToSelectableOrgs` (data-starved; cannot fulfill purpose).
- `AdobeOrgStep` + the `adobe-org` wizard step wiring (`wizard-steps.json`, `WizardStep` union, nav
  index math, cascade-clear hooks, `orgSearchFilter`).
- `handleGetOrganizations` selectability flags / `handleSelectOrg` / the (never-wired) select-org-on-
  Continue path. Re-evaluate `handleReDetectContext` (may be reused by the proactive check).
- All tests bound to the deleted picker/selectability surfaces.

**Add**
- **Verify-landed-org after forced sign-in** (compare resolved org to the pending target; surface a
  no-loop message if still wrong).
- **Proactive entry check** for existing projects (token-org vs expected-org) with an up-front banner.
- **Mismatch messaging + wired "Switch Adobe account"** recovery (names both orgs; triggers force
  login; this is the G1b bridge, minus the picker).

## Build order (each step leaves build + tests green)

1. **Remove the org-picker step** from the wizard (`AdobeOrgStep`, `wizard-steps.json` `adobe-org`,
   `WizardStep` union, navigation indices, cascade, `orgSearchFilter`). Update wizard nav/helper tests.
2. **Remove picker handlers + selectability** (`handleGetOrganizations`/`handleSelectOrg`,
   `getOrgSelectability`/`filterToSelectableOrgs`, `SelectableOrgCandidate` type fields) once no
   consumer remains; delete their tests. Keep `handleReDetectContext` if the proactive check uses it.
3. **Simplify `ensureOrgContext`** to reachability-only; update its tests + `projectHandlers`/MCP
   callers to pass the token's reachable org list.
4. **Add the proactive entry check** (existing-project flows): compare token-org vs
   `project.adobe.organization`; emit a typed mismatch banner before work.
5. **Add force + verify recovery**: on `ORG_MISMATCH`/`needs_relogin`, wire the "Switch Adobe account"
   action to a forced sign-in; after login, verify landed org == target; surface the no-loop message
   if still wrong. Clear copy naming both orgs.

## Test strategy

- Update/remove wizard navigation + step-filtering tests for the dropped step.
- `ensureOrgContext` tests: reachable → ok; not reachable → needs_relogin (assert it never runs
  `aio console * select`).
- New: proactive-check tests (match → silent; mismatch → banner), force+verify tests (landed==target
  → proceed; landed!=target → no-loop message).
- Keep MCP `ORG_MISMATCH` non-retryable tests.
- Full suite green; `tsc --noEmit` clean; lint clean on changed files.

## Out of scope
- Concurrent two-org operation on one machine (needs per-session token isolation: per-agent
  `AIO_CONFIG_FILE` + per-org login) — separate backlog item; the org-bound finding is its premise.
- Dashboard becoming a full org switcher beyond the proactive banner + recovery.
