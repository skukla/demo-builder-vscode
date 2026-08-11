---
name: adobe-org-context
description: The canonical Adobe IMS org/auth model for EXTENSION CODE — org-bound tokens, ensureOrgContext, detectProjectOrgMismatch, per-op withOrgContext, forced-login recovery. Use when adding any org guard, seeing "wrong org"/org-mismatch/403 from Adobe Console APIs, threading an org through a flow, or tempted to add an org picker or compare org ids by hand.
---

# Adobe Org Context (canonical model)

## When NOT to use
Running `aio` CLI commands against a specific org/project/workspace in a terminal or script → use the **aio-org-target** user skill instead. This skill is for writing/reviewing extension code.

## The empirical truth this model is built on

**IMS tokens are org-bound.** One federated Adobe ID projects a *different IMS user per org*. A token reaches exactly ONE org: `getOrganizations()` / `aio console org list` return only that token's org; every other org 403s. Reaching another org requires a **forced** sign-in (`aio auth login -f` → browser account/org chooser), which *swaps* the token. A non-forced re-login silently reuses the browser SSO session and can loop back to the wrong org (the "another tab is logged into a different org" trap).

Consequences:
- **There is no in-app org picker.** Sign-in owns org selection. The picker was removed deliberately — do not bring it back.
- **The token is the truth**, never the stale CLI console selection (`aio config get console.org` can disagree with the token; the token wins).

## Canonical pieces (single implementations — never hand-roll)

| Need | Use | Where |
|---|---|---|
| "Is this org reachable with the current token?" | `ensureOrgContext(orgId, {listSelectableOrgs, probe?})` → typed status `ok \| needs_relogin \| access_revoked \| org_mismatch` | `src/features/authentication/services/ensureOrgContext.ts` |
| "Is the project's org reachable?" (proactive guard) | `detectProjectOrgMismatch(authManager, project, logger)` → `OrgMismatchInfo` or undefined | `src/features/authentication/services/detectProjectOrgMismatch.ts` |
| Target an org for ONE `aio` invocation | `withOrgContext` / `orgContextEnv` / `applyAdobeCLIDefaults` (env per invocation) | `src/core/shell/orgContextEnv.ts`, `commandExecutor.ts` |
| Sign in / recover | `AuthenticationService.login(force)` and `loginAndRestoreProjectContext(adobeContext, force)` | `src/features/authentication/services/authenticationService.ts` |
| Reactive 403 handling | `ErrorCode.ORG_MISMATCH` (thrown by `adobeEntityFetcher`); MCP treats org-mismatch as non-retryable | `src/types/errorCodes.ts`, `adobeEntityFetcher.ts` |

## Rules

1. Any flow needing an org guard (dashboard status, mesh deploy, new features) calls `detectProjectOrgMismatch` — do NOT write `currentOrg.id !== project.adobe.organization` comparisons.
2. `ensureOrgContext` NEVER runs `aio console * select`; per-op targeting uses env vars, never mutates the global CLI selection.
3. Org-switch recovery = **forced** login (`force=true`, user-facing label "Switch IMS Org") → re-run the check to VERIFY the landed org → if still wrong, surface the no-loop hint (another browser tab holds a different org's SSO session). Session-expiry re-auth stays **non-forced** (`handleReAuthenticate`, `ensureAdobeIOAuth`).
4. Projects store an org **id** only (`project.adobe.organization`) — no org name; don't add one.
5. New Console-API calls that can 403 map the failure to `ErrorCode.ORG_MISMATCH`, not a generic error.

## Verify

After touching org/auth code, probe reality — don't reason from config:
1. `aio console org list` (token truth) vs `aio config get console.org` (stale selection) — code must behave correctly when they disagree.
2. Exercise the mismatch path: with a project whose org ≠ token org, the flow must surface the "Switch IMS Org" recovery, and after a forced login it must RE-CHECK the landed org (step 3 above), not assume success.
3. Grep your diff for `org.id !==`, `console org select`, or a new picker — any hit is a regression against this model.

_If this skill was wrong or incomplete, fix it before closing the task._
