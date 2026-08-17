# A refused credential is reported as a missing permission

> ## PARTLY FIXED 2026-08-16 — `dcac1475`, `e79cca3c`
>
> **Done.** Helix 403s at the preview/publish/code sites now throw
> `DaLiveAuthError` rather than "you do not have permission", and the Code Sync
> inner `code.status` no longer reports a refusal as a missing App. Crucially the
> classification ACTIVATED a retry that already existed — `runContentPipeline` was
> keyed on `DaLiveAuthError` and had simply never seen one from Helix. Three
> hand-rolled copies of the recovery are now one shared `withDaLiveAuthRetry`
> (`services/daLiveAuthRetry.ts`).
>
> **What remains, and why each was left:**
>
> 1. **`syncCodeAndPermissions` has no retry wrapper** — and it is where run 1
>    first failed, at config-service registration. Wrapping it is small, but its
>    phases are not obviously idempotent on replay, which needs checking before a
>    retry is safe to add.
> 2. **The 52 unpublish 403s are logged as warnings, never thrown**, so nothing can
>    catch them even now. Making them throw changes reset's failure semantics — a
>    403 there is non-fatal by design today — so it is a product decision, not a
>    refactor.
> 3. **The probe (option 1 below) was not built.** With mid-pipeline recovery
>    working it is now an optimisation — fail before the repo is rewritten rather
>    than recover after — not the main fix. Re-evaluate on its own merits.
> 4. **`configAccessRecovery` and `configurationService` still say "no admin
>    role"** on a 403. `siteConfigRegistrar` already throws `DaLiveAuthError`, so
>    the wiring is closer than it looks; the wording is downstream of item 1.

**Filed:** 2026-08-16, from two reset runs on `bodea-template-test` forty minutes apart.
**Shipped defect, user-facing, and it sends people to fix the wrong thing.**

## The evidence — one project, one operation, two runs

Both runs reset the same project with the same identity. The only difference is that the
second re-authenticated to DA.live first.

| | Run 1 — 19:53 (`[Dashboard]`) | Run 2 — 23:28 (`[ProjectsList]`) |
|---|---|---|
| DA.live token | locally valid, **server-refused** | re-authenticated |
| Code Sync check | `code.status 403` → "App is not installed" | `code.status 400` → installed |
| ConfigAccess | "holds no admin role on the site configuration" | "config readable — admin role held" |
| Config Service PUT | 403 ×4 (30s/45s/60s retries) → failed | 409 → delete → **201 OK** |
| Unpublish | **0/52** — all `403 [admin] not authorized` | **52/52** |
| Outcome | reset FAILED | reset succeeded, 30/30 SKUs pre-warmed |

Run 1's messages were all false. The role was held the whole time.

## Root cause

`daLiveAuthService.isAuthenticated()` is a **local** check:

```ts
const tokenInfo = await this.getStoredToken();
return tokenInfo !== null && tokenInfo.expiresAt > Date.now();
```

Token present, own `expiresAt` in the future. It cannot see whether the server will accept
the token — and in run 1 Helix would not. Every downstream 403 was then read as a statement
about the user's PERMISSIONS rather than about the CREDENTIAL.

`ensureDaLiveAuth` (`edsResetUI.ts:70`) exists and did not fire, because the local check
said "authenticated". Run 2 only caught it because the ProjectsList entry point probes
earlier and independently.

## The three surfaces

| Surface | Message | State |
|---|---|---|
| `githubAppService` code.status | "the App is not installed" | **FIXED** `dcac1475` — non-definitive inner statuses are now `transient` |
| `configAccessRecovery.ts:85,169` | "this Adobe identity holds no admin role on the site configuration" | open |
| `configurationService.ts:525` | "…lacks admin access… **ask an Adobe admin to grant it**" | open |

The third is the most costly: it names a remedy that cannot work, and asks the user to
request a role they already hold. This codebase has already paid for this exact mistake once
— the eleven-reinstalls incident recorded in `appInstallationResolver.ts`. Same shape, new
surface.

## Why better wording is not the fix

The tempting change is to soften the messages. That is wrong: a 403 genuinely CAN mean a
missing role, and blurring the two makes the real case unactionable. The two are only
distinguishable by asking a question nothing currently asks — **is this credential
acceptable to the server right now?**

Two candidate shapes, and picking between them is the decision this item exists to make:

1. **Probe before acting.** `ensureDaLiveAuth` performs a cheap authenticated round-trip
   rather than reading `expiresAt`. Cost: one request per guarded operation, and a
   suitable endpoint has to be chosen. Benefit: the failure is caught before a
   three-minute pipeline starts, which is where run 1's user time went.
2. **Classify on the way out.** Any 403 that follows a locally-valid token is reported as
   "credential refused — re-authenticate", and only a 403 with a server-confirmed-good
   credential is reported as a missing role. Cheaper, but every surface must participate,
   and a surface that forgets silently reverts to today's behaviour.

The `githubAppService` fix took shape 2 for its own layer. Doing 1 as well would let the
whole pipeline stop early instead of failing 52 times.

## Do not

- Do not conclude the local check is useless — it correctly catches an absent or genuinely
  expired token, cheaply, and that is most cases.
- Do not fix only the wording of the three messages. Tonight's run would still have failed;
  it would just have failed less confidently.
- Do not treat this as EDS-only. The same "locally valid, server-refused" gap exists
  anywhere a stored token is checked by expiry — the Adobe I/O guard
  (`adobeAuthGuard.ts:80`) has the same shape and was not exercised here.

## Kickoff prompt

> Read `.rptc/backlog/2026-08-16-refused-credential-reported-as-missing-permission.md`,
> then `daLiveAuthService.isAuthenticated`, `ensureDaLiveAuth` in `edsHelpers.ts`, and the
> `dcac1475` fix in `githubAppService.ts` — that one is the pattern to follow at the
> classification layer. Decide between the probe and the classify shapes (or both) BEFORE
> writing code; the wording is downstream of that choice. Every test must use a resolved
> 403 with a locally-valid token, since a rejected promise passes against today's code and
> proves nothing.
