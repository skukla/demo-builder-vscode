# Addendum — Helix admin auth + where the PDP preview-trigger belongs (2026-06-09)

Handoff from the `accs-discovery-service` side. Resolves the auth question that was
blocking the runtime preview-trigger, and frames the build decision: **a browser-side
storefront code patch vs. a shared App Builder action.** Full evidence doc lives at
`accs-discovery-service/docs/research/helix-admin-auth-findings.md`.

## TL;DR

- **Auth is not a blocker.** On demo-builder storefronts, Helix admin `POST /preview` **and**
  `POST /live` (publish) are **open to unauthenticated callers** — verified empirically on
  citisignal-b2b. So the trigger can publish PDPs with **zero credentials**.
- **EDS has no request-time dynamic serving** for unpublished paths — they 404 on the live tier.
  The overlay (`render-pdp`) is a *publish-time* source, not a live renderer. So a PDP must be
  **published** to resolve → something must publish-on-demand. That "something" is the trigger.
- **The trigger is shopper-time work (SC not present) → it lives on the runtime/shared side, NOT
  the extension.** But *both* candidate designs still need a tiny browser-side hook; the real
  decision is **where the logic + any future credential live.**
- **Cleanup is the asymmetric catch:** publish is credential-free but `DELETE` (unpublish) is
  auth-gated (403). The trigger can create but not reap. Deleted SKUs orphan live pages.

## Verified findings (empirical, citisignal-b2b, no credentials sent — `curl -v` confirmed)

| Endpoint (no auth) | Result | Meaning |
|---|---|---|
| `GET /status/.../{path}` | 200 | readable |
| `POST /preview/.../{path}` | 200 + mutated (404→200 on a fresh path) | **preview OPEN** |
| `POST /live/.../{path}` | 200 + mutated (404→200) | **publish OPEN** |
| `DELETE /preview/.../{path}` | 403 | unpublish/delete **protected** |
| `GET /config/{org}/{site}.json` | 401 | config protected |

`/status` reports `permissions:["read","write"]` even to anonymous callers, but DELETE→403 proves
that array is not a reliable predictor — each verb was tested directly. **Flag:** this open-admin
posture is a real exposure (anyone on the internet can publish to these storefronts). Confirm it's
intentional (may be a repoless Helix-5 default) before depending on it long-term.

## The architecture boundary (the test that resolves placement)

> Does it happen **while the SC is actively driving the extension**, or **autonomously in response
> to a shopper/Helix when no SC is around?**

- **Extension = control plane.** SC-active: provisioning, config, overlay registration, and
  SC-initiated lifecycle (incl. unpublish-on-SKU-delete — it already holds the SC's `x-auth-token`).
- **Shared App Builder app = runtime plane.** Always-on, shopper/Helix-facing: `render-pdp` overlay,
  and the publish-on-shopper-hit trigger. The SC's laptop is closed when a shopper browses, so this
  **cannot** be the extension.

This matches the two-tier model already in the plan (shared `accs-discovery-service` tier + per-SC
extension tier). The trigger is cross-demo + shopper-facing → shared tier.

## The decision: storefront code patch vs. App Builder action

Important: **both options require a browser-side smart-404 hook** (the 404 originates in the
shopper's browser; EDS has no server-side "on-404 call my endpoint"). They differ only in *what the
hook calls* and *where the logic/credential live*.

**Option 1 — Browser patch calls `admin.hlx.page` directly (no action).**
The smart-404 handler, added to each storefront template, calls `POST /preview` + `/live` on
`admin.hlx.page` directly (works today, credential-free), then reloads.
- ✅ No new server component; simplest path to a working demo now.
- ❌ Must patch **every** storefront template the extension supports and keep them in sync.
- ❌ Admin URL + flow live in client code; **if admin ever locks down (needs a credential), the
  browser can't hold a secret → this approach breaks** and forces a migration to an action.
- ❌ Depends on (and bakes in) the open-admin exposure.

**Option 2 — Browser hook calls a shared `prepublish-pdp` action.**
A thin action in `accs-discovery-service` takes `{org, site, path}` → does preview+live. Each
storefront's 404 hook just `fetch()`es the action URL.
- ✅ Logic lives **once**, server-side; per-template code is a trivial one-line fetch (stable).
- ✅ **Credential boundary:** the day admin locks down, drop an org-scoped API key into the action —
  **no re-patching N templates.**
- ✅ Central place for rate-limiting, validation, telemetry; admin calls not exposed in client JS.
- ❌ A server component to build/deploy/maintain; still needs the (thin) browser hook.

**The nuance that matters:** Option 2 does **not** eliminate touching storefront templates — both do.
What Option 2 buys is that the *per-template surface shrinks to a stable one-liner* and the
*volatile parts (admin calls + future credential) move server-side where they can change without
re-patching every template.*

## Lifecycle / cleanup (decides how much to build now)

- Publishing on demand creates **persistent live pages**. Deleting a SKU in Commerce leaves an
  orphaned live page (200, generic template, drop-in shows "not found"). EDS has no TTL.
- The credential-free trigger **can publish but cannot unpublish** (DELETE→403). Cleanup needs a
  credentialed actor → **the extension** (SC-initiated delete, it has the token) or a credentialed
  janitor (org API key). For ephemeral demo storefronts, "accept staleness" is a viable v1 punt.

## Recommendation

1. **Trigger logic → shared side; minimal hook → storefront.** Prefer **Option 2** (thin
   `prepublish-pdp` action + one-line per-template hook). It keeps template edits trivial/stable and
   puts the volatile admin/credential logic where it can evolve. Use Option 1 (direct-to-admin) only
   if you want the absolute fastest demo and accept re-patching all templates when admin locks down.
2. **Cleanup → extension**, on SC-initiated SKU delete (accept staleness for Commerce-direct deletes
   until it proves to matter). Do **not** let cleanup block shipping the create path.
3. **Raise the open-admin exposure** to the storefront-platform owner — independent of this feature.

## What the extension side needs to decide / do

- Pick Option 1 vs 2 (the `accs-discovery-service` side will build the `prepublish-pdp` action if
  Option 2).
- Where does the smart-404 hook live — a shared EDS boilerplate `scripts.js`, or per-template? (Drives
  the patch maintenance cost; this is extension-side knowledge.)
- Own the **cleanup-on-SKU-delete** path (extension holds the token).

## References
- Deployed `render-pdp` (current default overlay URL): `https://<runtime-namespace>.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp`
- Full auth evidence: `accs-discovery-service/docs/research/helix-admin-auth-findings.md`
- Cleanup debt created during probing (need an authed DELETE to remove, on citisignal-b2b):
  previews `/products/orchard-2/probe`, `/products/verify-1781012023/probe`,
  `/products/verify-pub-1781012309/probe`; live `/products/verify-pub-1781012309/probe`.
