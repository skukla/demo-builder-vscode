# Step 02 — Robust auth-page acquisition (Layer 1) · reliably copy the account shell

**Goal:** Make sure `/customer/account` (and the other auth pages) are actually pulled from
canonical, so Step 01's discovery has the account page to follow `/customer/nav` from. Today the
probe HEADs the **bare** rendered URL, which for dropin pages gates to login / may not 200 →
silently falls to a generic, B2B-unaware stub.

## Why / evidence

`copyContentFromSource` (`:1880-1893`) probes `fetch(\`${baseUrl}${authPage.path}\`, {HEAD})`.
Live finding: `/customer/account` (bare) **gates to login**; `/customer/account.plain.html` returns
real content. So the existence check should target what we actually copy (`.plain.html`), and a
present page should never be replaced by a stub.

## Test-first (RED)

Extend auth-page tests (new `daLiveContentOperations-authPages.test.ts` or extend `-content`):

1. When `.plain.html` for `/customer/account` returns 200, the path is enumerated/copied and **no**
   stub is created (even if the bare URL 404s/redirects).
2. When neither the bare nor `.plain.html` exists, the generic stub is still created (preserve
   today's fallback for genuinely-absent pages).
3. The probe uses `.plain.html` (assert the fetched URL), aligning existence with copy.

## Implement (GREEN)

- Change the auth-page existence probe to check `<baseUrl><path>.plain.html` (reuse
  `buildSourceUrl`) instead of the bare path; a GET/HEAD 200 there means "copy it," not "stub it."
- Equivalent acceptable approach: **attempt the copy first; only stub on real 404.** I.e. fold auth
  pages into the normal copy attempt and treat `copySingleFile===false` (404) as the stub trigger.
  This removes the separate probe entirely and is more robust — prefer if it stays simple.
- Keep stub markup as last-resort only; do not let a present canonical page be stubbed.

## Files

- `src/features/eds/services/daLiveContentOperations.ts` (auth-page probe/stub logic, `:1872-1983`).
- Test file above.

## Acceptance

- `/customer/account` is copied from canonical for `b2b` (not stubbed); combined with Step 01 the
  account menu renders.
- Genuinely-missing auth pages still get the stub (no regression for non-B2B packages that rely on
  stubs).

## Notes

- Consider extending the auth-page set later via the Step 04 inventory (cart/checkout/order/wishlist
  /addresses/forgot-password) — but only after confirming which the templates author. Keep this step
  scoped to making the **existing** three robust + stub-only-on-404.
