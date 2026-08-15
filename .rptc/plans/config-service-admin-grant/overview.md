# Config Service admin access — detect, recover, verify, prevent

**Promoted from backlog 2026-08-14** (research: `research.md`, all API facts
live-verified that day). Trigger: `leahrayard/leah-b2b-demo` could not register
its BYOM overlay — every `/config/*` call refused `403 [admin] not authorized`
— so no PDP could render, and the extension's only response was prose telling
her to reset, which repeats the same refused call.

## The constraint that shapes everything (MEASURED, not assumed)

**Nobody can grant themselves, and no outsider can grant them either.**

| Probe (2026-08-14, Steve's identity, admin on `skukla`) | Result |
|---|---|
| `GET config/skukla/sites/bodea-source.json` | 200 |
| `POST config/skukla/sites/bodea-source/access/admin.json` | 200, persisted |
| `GET config/leahrayard.json` | **403 `[admin] not authorized`** |
| `GET config/leahrayard/sites/leah-b2b-demo.json` | **403** |
| `GET config/leahrayard/sites/leah-b2b-demo/access/admin.json` | **403** |

Two conclusions, both load-bearing:

1. **The access endpoint sits behind the same gate as the config read.** A user
   refused on the read is refused on the grant. Self-heal is impossible by
   construction — asking for it is asking the extension to escalate privilege.
2. **Authorization is per-org.** An admin of one org cannot grant into another.
   So "have a teammate fix it" only works for a teammate already inside that org.

Also established: **the org roster is the blanket grant.** `bodea-source` has
`access.admin.role = {}` (empty) yet its owner has full access, because
`config/{org}.json` lists `{email, roles:["admin"]}`. Site-level access is
ADDITIVE on top. So a missing org roster entry refuses every site in the org —
which is Leah's shape.

**Therefore the only bootstrap for a user with no role is a flow that writes with
authority that is not theirs** — the AEM Code Sync bot. `tools.aem.live/bot/setup`
is that flow with a UI on it, and its URL is fully constructible from data the
extension already holds:

```
https://tools.aem.live/bot/setup?user={email}&site={repo}&url={contentSourceUrl}&org={owner}
```

(observed verbatim 2026-08-14 on `skukla/bodea-source`; `user` was empty in that
run and the tool reported "Configured 0 site users").

## Why the edit/republish flow can carry the fix

Nothing technical gates recovery to new repos. Today the Code Sync install URL is
surfaced only for `repoMode === 'new'` (`RepoSelectionInline.tsx`) and the 403
propagation retry is gated on `repoMode === 'new'`
(`storefrontSetupPhase3.ts`) — both by ASSUMPTION that an existing repo's 403 is
permanent. That assumption is what left Leah with no path. Un-gating it is small.

What we cannot promise is that the Adobe flow re-mints a role for an org that
already exists. So the design **verifies instead of assuming**: it polls the
config read until 403 flips to 200, and if it never flips it says exactly that
rather than reporting success. Same discipline as the storefront probe — report
the leg, never the wish.

## Steps

| # | Step | State |
|---|---|---|
| 01 | `configServiceAccess`: read roster/site access, grant admin, `probeConfigWriteAccess` (the 403→200 oracle), `buildCodeSyncSetupUrl` | **SHIPPED** — `configServiceAccess.test.ts`, 34 tests |
| 02 | Recovery on 403: `configAccessRecovery` (`announceConfigAccess` + `waitForConfigAccess` poll), deep link wired into the create/edit 403 surface | **SHIPPED** — `configAccessRecovery.test.ts`, 7 tests |
| 03 | Prevention: `ensureSiteAdmin` (read-merge-write) pins the creating user's role at registration, so it never depends solely on the install side effect | **SHIPPED** — primitive covered in step 01; the phase-3 wiring is covered by `storefrontSetupPhases-configService.test.ts` (14 tests) only since its mock was repaired 2026-08-14 |
| 04 | `Demo Builder: Manage Site Access` — QuickPick over `siteAccessManagerHeadless` (list / add / remove), every mutation verified by re-read | **SHIPPED** — headless core `siteAccessManagerHeadless.test.ts`, 16 tests. The COMMAND itself has no suite; `commandManager.test.ts` pins only its id |
| 05 | Grants survive an edit: `updateSiteConfig` captures the access list before the delete/re-register cycle and `restoreSiteRoles` hands it back. BOTH failure surfaces are now explicit — the update is REFUSED when the list cannot be captured (carrying the refusal's REAL status — 403 drives the propagation retry and the recovery dialog, 401 drives re-auth, because folding the two together sent an expired session to grant itself a role), and reports `grantsRestored: false` with masked `lostGrants` when it cannot be handed back, surfaced on all three paths (wizard toast, reset report line, repair warning) | **SHIPPED** — `configurationService-updateSiteConfig.test.ts` (split out when the original passed the 750-line ceiling) |
| 06 | `Demo Builder: Repair Site Configuration` — the retry that did not exist. `siteConfigRegistrar` (the 409/401/403 protocol, shared by the wizard, the reset path and the repair command) + `repairSiteConfigHeadless` (read-back `verified`) + the command composing repair → republish | **SHIPPED** — `repairSiteConfigHeadless.test.ts`, 12 tests + `siteConfigRegistrar.test.ts`, 16 tests (both mutation-checked). The COMMAND has no suite; `commandManager.test.ts` pins only its id |
| 07 | Publishing on a protected site: any `access.admin` role sets `requireAuth: "auto"` and closes the whole admin API, so `tryAdminBearer()` attaches the DA.live Bearer to every admin-API call | **SHIPPED** — `helixService.test.ts` pins both the attached and degraded header shapes |

Steps 01–02 give a refused user a verified route where they previously had none.
The recovery is NOT gated on `repoMode`, so an edit/republish reaches it exactly
as a new project does — the gap that left Leah stranded.

All seven steps have shipped. Four safety properties are load-bearing and
pinned by tests:

- **Grants MERGE, never replace.** `grantSiteAdmin` overwrites the role list, so
  writing one email would silently remove every other admin. `ensureSiteAdmin`
  reads first; it also refuses to write at all when the current list cannot be
  read, since writing blind is the same clobber.
- **The last admin cannot be removed.** Nobody could grant it back — the access
  endpoint requires the very role being removed — so the site would be stranded
  with no in-app recovery.
- **`verified` is read back, never inferred.** A 2xx on the write and a live
  overlay are different claims, and only the second means product pages load.
  `repairSiteConfig` reports them separately for that reason.
- **An edit never risks the admin list it cannot see.** The delete inside
  `updateSiteConfig` destroys the access sub-resource, and a failed capture is
  indistinguishable from "no grants" — so the update is refused rather than run
  blind. When the capture succeeds but the write-back fails, the update still
  reports success (it did land) and names the masked grants that were lost,
  because nothing in the app can restore them: the access endpoint requires the
  very role that went missing.

Verify-loop follow-through (2026-08-14, iteration 2): admin emails are MASKED in
the pasteable report and the exportable debug dump (`maskEmail`), full only in the
transient surfaces (QuickPick, wizard message). `storefrontSetupPhase3.ts` was
split — the Configuration Service half moved to `configServiceRegistration.ts`,
and its two access blocks became `announceConfigAccess` / `pinSiteAdmin` in
`configAccessRecovery`. Measured after step 06 moved the registration protocol
out again: 598 → 248 (`storefrontSetupPhase3`) + 182 (`configServiceRegistration`)
+ 204 (`siteConfigRegistrar`, which also absorbed the reset path's retry helper
when `configServiceRetry` was deleted).

Coverage gaps, stated rather than implied (verify-loop, 2026-08-14): the
`ManageSiteAccessCommand` UX has no test of its own, and the phase-3 admin pin is
exercised only indirectly. Both are known, neither blocks the release.

A verify-loop pass also found the phase-3 suite's `edsHelpers` mock omitting
`byomRegistrationFailureMessage`, so the new 403 branch threw and every
registration-failure test silently ran the catch path instead. Fixed; the lesson
is the one `webview-test-authoring` §8 already states — change a contract, audit
its MOCKS, not just its callers.

**Resolved 2026-08-14 (throwaway-site probe, both sites deleted):** a freshly
registered site has NO access doc. `PUT /config/{org}/sites/{site}.json` → 201
leaves `access/admin.json` at **404** and the site config carries no `access`
key; `bodea-source` only has one because the setup tool's Users step created it.
`POST` onto that 404 → **200**, creating the doc. `readSiteAccess` now treats 404
as an empty role map, which is what makes the step-03 pin work at all — it was
classifying 404 as unreadable and silently refusing to write on every new site.
A drifted 200 is still refused: an absent resource holds no admins, an
uninterpretable one might.

Remaining (not blocking a release): the MCP tool surface over
`siteAccessManagerHeadless`, now filed as its own backlog item
(`.rptc/backlog/mcp-site-access-tools.md`) so it survives this plan being
archived; and the one live unknown — whether the Code Sync bot re-mints a role
for an org that already exists, which only an affected user can answer.

## Constraints

- **Never claim a grant worked without re-reading.** The oracle is the refused
  user's own `GET config/{org}/sites/{site}.json` returning 200.
- Read-only by default; the only write is an explicit user-initiated grant.
- Headless-safe: MCP/AI callers get the same logic with logging, no toasts
  (mirror `surfaceOverlayRegistrationFailure`).
- No credential material in messages or logs (the probe pattern already enforces
  this; a test pins it).
