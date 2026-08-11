# Research: Create-project wizard shows the wrong IMS org → empty Adobe I/O project picker

**Date:** 2026-07-01
**Branch:** `fix/wizard-org-mismatch` (off `develop`)
**Bug class:** S2 (core functionality broken, no in-flow workaround except "Switch IMS Org")
**Method:** two independent code-traces (org-display path + project-load path), cross-verified.

## Symptom
On Commerce → "Sign in to Adobe", the green **"Connected — <org>"** shows a stale org (e.g.
"Adobe Commerce Solution Led") even though the user's IMS token / App Builder projects live in a
different org ("Adobe Demo System"). The Integrations project picker (`get-projects`) then returns
an empty list, silently ("No projects found"), with no org-mismatch signal. The canonical
org-context approach (`ensureOrgContext` / `detectProjectOrgMismatch` / `withOrgContext`) exists but
is **not applied to the wizard path**.

## Root cause — two layers, both choose the wrong org

### Layer 1 — the displayed/cached org is the CLI console org, not the token org
`AdobeAuthStep.tsx:68-77` renders `state.adobeOrg.name`, written by `useAuthStatus.ts:186-190` from
the `auth-status` message. That org is resolved by `getAuthContext` (`authenticationHandlers.ts:97-118`,
via `handleCheckAuth:126`):
- `getCachedOrganization()` (in-memory cache) → else `getCurrentOrganization()`
  (`adobeContextResolver.ts:157-177`) → `getConsoleWhereContext()` → **`aio console where --json`**
  (`adobeContextResolver.ts:55-81`) = the CLI's **persisted `console.org`**.

That source is **token-independent** and goes stale after an org switch — the *exact* thing
`detectProjectOrgMismatch.ts:16-21` warns against ("We deliberately do NOT use
`getCurrentOrganization()` … goes stale after a forced account switch"). The token's real org
(`getOrganizations()[0]`) is never consulted on the on-mount quick check. `autoSelectSingleOrg`
(`authenticationHandlers.ts:258-277`) DOES source from the token — but only on the forced-login path.

### Layer 2 — the project fetch ignores the threaded org anyway
`AdobeProjectPicker.tsx:75` correctly threads `{ orgId: state.adobeOrg.id }` into `get-projects`.
`handleGetProjects` (`projectHandlers.ts:105-168`) runs `ensureOrgContext(orgId)` — which **PASSES**
(the org is reachable) so no mismatch is surfaced. But the SDK primary path
`adobeEntityFetcher.tryFetchProjectsViaSDK` (`adobeEntityFetcher.ts:328-331`) calls
`client.getProjectsForOrg(cachedOrg.id)` — the **cached/ambient (stale) org** — dropping the threaded
`orgId`. `withOrgContext` (`adobeEntityFetcher.ts:344-351`) only sets `AIO_CONSOLE_*` env for spawned
CLI children (`commandExecutor.ts:103-107`), never the SDK HTTP call; and the CLI fallback is
**ID-only ("leaky", `orgContextEnv.ts:29-33`)** so the stale persisted org *code* still wins.

Also the `can-create-adobe-project` probe (`organizationValidator.ts:62-65` via
`testDeveloperPermissions`) runs `aio app list` on the **ambient** org with no org targeting — a third,
possibly-different org.

**Secondary gap:** non-forced login (`authenticationService.ts:254-259`) clears auth/token/validation
caches but **not** the org cache — so a non-forced re-auth keeps showing the stale org. Forced login
(`authenticationService.ts:213-217`, `clearAll()`) does clear it — which is why "Switch IMS Org" works.

## Why the canonical guard didn't fire
`detectProjectOrgMismatch` (token-bound truth = `getOrganizations()[0]`) is wired only into the
dashboard/deploy paths (`orgContextCheck.ts:129`, `appBuilderComponentHandlers.ts:107`,
`ensureProjectOrgContext.ts:71,112`, `deployApp.ts:103`) — **never the create-project wizard**. The
wizard's only org check is `ensureOrgContext(staleOrgId)`, which passes because the stale org is a
*reachable* org (just not the one holding the projects).

## Fix direction (align the wizard with "the token org is the truth")
a. Source the displayed/selected org from the **token** (`getOrganizations()[0]`, like
   `autoSelectSingleOrg`) rather than `getCurrentOrganization()`/CLI console org — cache that.
b. Make `tryFetchProjectsViaSDK` fetch for the **intended `orgId`** (pass it to `getProjectsForOrg`,
   not `cachedOrg.id`).
c. Enrich `withOrgContext` with org **code/name** so the CLI fallback isn't ID-only/leaky, and align
   `testDeveloperPermissions` to the same org target.
d. Fix the non-forced-login org-cache-clear gap.
e. (Optional) run `detectProjectOrgMismatch` before showing "Connected" so a display-vs-token
   divergence forces re-selection instead of a silent empty picker.

**Constraint:** load-bearing auth/caching code — needs TDD around org scoping + cache behavior, and
must not regress the <1s quick-auth-check perf (do NOT call `getOrganizations()` on every mount; cache
the token org and invalidate on login/logout/org-change).

## Follow-ups (out of scope for this fix — from Phase 4 review; net-positive-preserving, non-blocking)
- **Project/org mispairing on cache-miss** (code-review Finding 2, ~80): `getAuthContext` now sources
  `currentOrg` from the token but `currentProject` still from `getCurrentProject()` (stale CLI
  console), so after an org switch the returned `{currentOrg, currentProject}` can be mispaired until
  the wizard re-selects a project downstream (self-heals; the project is not shown on the auth step).
  Full fix: resolve the displayed project against the token org, or run `detectProjectOrgMismatch`
  before "Connected" (research point e).
- **`getOrganizations()[0]` arbitrary for multi-org users** (security ~30): not cross-tenant (always
  the user's own memberships; org-bound tokens fail-safe with 403), but the displayed org label can be
  wrong for a multi-org user. Same `[0]` convention `detectProjectOrgMismatch` already uses. Remedy:
  explicit org selection / mismatch guard before any provisioning op.
- **Optional hardening (research c):** enrich `withOrgContext` with org code/name (the CLI env is
  ID-only/"leaky") and align `organizationValidator.testDeveloperPermissions` / the
  `can-create-adobe-project` probe to the same org target.

## Key files
- `authenticationHandlers.ts:97-118,126` — `getAuthContext`/`handleCheckAuth` (stale org source)
- `adobeContextResolver.ts:55-81,157-177` — `aio console where` → org
- `adobeEntityFetcher.ts:328-333,343-389` — SDK fetch uses `cachedOrg.id`, ignores threaded org
- `organizationValidator.ts:62-65` — `testDeveloperPermissions` on ambient org, no targeting
- `authenticationService.ts:213-217,254-259` — forced vs non-forced cache-clear (org-cache gap)
- `projectHandlers.ts:105-168` — `handleGetProjects` / `ensureOrgContext` gate (passes on stale org)
- `AdobeProjectPicker.tsx:75` / `AdobeAuthStep.tsx:68-77` — threaded org / displayed org
- `ensureOrgContext.ts`, `detectProjectOrgMismatch.ts`, `orgContextEnv.ts` — canonical helpers
