---
id: 2026-06-09-pdp-graceful-empty-state
title: Drop-in detects empty Commerce data → redirect to /404 (storefront's native 404)
status: shipped
created: 2026-06-09
updated: 2026-08-23 (CLOSED — warm-path guard shipped and proven live)
priority: low-medium
related: BYOM PDP routing (Phase 1 ship 2026-06-09)
---

# Drop-in: detect empty Commerce data → redirect to native /404

> ## CLOSED 2026-08-23 — shipped as the `pdp-empty-data-redirect` code patch, proven live
>
> The investigate-first gate resolved the cheap way: no dropin empty-state
> callback exists and none is needed. `fetchProductData(sku)` is declared
> `Promise<ProductModel | null>` and the shipped bundle returns null for an
> unknown SKU (`if(!t||t.length===0)return null` — verified in the vendored
> api.js); the boilerplate initializer (`scripts/initializers/pdp.js`) holds
> that null right before mounting and already imports `loadErrorPage` (=
> `window.location.replace('/notfound')`, this item's decided UX) and `IS_UE`.
> The whole fix is a 3-line guard after the fetch — no DOM polling, no dropin
> modification.
>
> Shipped as code patch `pdp-empty-data-redirect` in `eds-demo-patches`
> (`b2b` + `citisignal-b2b` ledgers, LKG gate verified against canonical),
> referenced by all 6 `codePatches` arrays in `demo-packages.json`.
>
> Proven live on the bodea demo 2026-08-23: published a PDP for a fake SKU
> (RED: 200 from the content bus, empty product block), synced the guard
> (`kukla-bodea@9a62e26`), same URL then redirected to the native 404 (GREEN);
> throwaway page deleted, path 404s again. One propagation note: browsers with
> a cached `pdp.js` keep the old behavior until script cache expiry — ordinary
> EDS code-deploy propagation.
>
> The COLD path (URL 404s at the CDN) was already covered by the smart-404
> snippet before this item was picked up; this closes the WARM path, the last
> open half.

## Provenance

Deferred during the BYOM PDP routing Phase 1 ship (2026-06-09). The architecture publishes a PDP template (Phase 2 LIVE 2026-06-09: SC's authored `/products/default`) via smart 404 → action → admin trigger, and the published template stays in Helix content-bus indefinitely. When an SC deletes a SKU in Commerce, the URL still serves the cached template, the drop-in queries Commerce for the missing SKU, gets nothing, and renders an empty `product-details` block. Visible degraded UX whenever a stale URL is reached (bookmark, external link, multi-day POC).

This file was originally framed around showing a custom "Product not available" message in the drop-in. **That framing was wrong** and got corrected later the same day: a custom message preserves the impression that the page exists when it actually doesn't. The honest UX for a deleted SKU is **the storefront's native 404** — same chrome, same layout, same status semantics the rest of the storefront uses.

The Phase 1 research had already established that cleanup-on-deletion infrastructure (a "Refresh PDPs" dashboard action, action-side path telemetry) was overkill for the actual frequency this matters in demo workflows. Drop-in-side detection + redirect to `/404` solves the visible UX cleanly without that infrastructure, and covers more cases — anything that ends with "Commerce returned no product for this SKU" gets the right behavior:

- Stale URL after SKU deletion (the original concern)
- SKU value change (URL parses to a SKU that no longer exists)
- Race condition between Commerce update and Helix cache
- Misconfigured catalog endpoint returning no results
- Any future PDP route that hits a non-existent SKU

## Goal: native /404, not custom messaging

When the drop-in detects "Commerce resolved this SKU lookup with no data," it should redirect the browser to `/404` via `window.location.replace('/404')`. The storefront's native 404 page renders, the browser URL bar updates to `/404`, and the user gets exactly the experience they'd have hit if the URL had never been published.

**Why redirect (not just render in place):**

| | Redirect to `/404` | Render `/404` content in place |
|---|---|---|
| Browser URL bar reflects reality | ✓ | ✗ (shows the stale product URL) |
| Bookmarks: re-bookmarking lands on `/404` | ✓ | ✗ (re-bookmarks the stale URL) |
| Back button history | clean | confusing (looks like a product page) |
| Implementation complexity | one line: `location.replace('/404')` | more — needs to fetch and inject `/404` content |
| SEO signal | correct | wrong (page reports 200 with 404-like body) |
| Browser DOM state | clean (full navigation) | drop-in needs to clean up its own state |

Redirect wins on every axis.

**What we can't do (and don't need to):**

- We cannot change the HTTP response status from JS. The page was served 200; that's fixed.
- We don't need to unpublish the stale URL from content-bus. The redirect handles the visible UX; the URL technically continuing to serve is harmless and out of scope.

## Phase 0: investigate (15–30 min)

Before writing any code, answer: **what does `@dropins/storefront-pdp` currently do when Commerce returns no product?**

1. Read `@dropins/storefront-pdp` source / docs for an empty-state slot, callback, or render prop. Look for a "data resolved + no result" hook specifically (not a generic "loading" or "error" hook).
2. Test current behavior on a Demo-Builder-created storefront: visit a known-missing SKU URL while logged in (e.g., `/products/orchard-2/this-sku-does-not-exist`). Capture what renders and how long it takes for the drop-in to settle into the empty state.
3. Classify the finding against the three-row decision matrix.

## Three possible outcomes

| Finding | What to ship | Effort |
|---|---|---|
| **Drop-in already redirects to /404 on no-data** | Confirm + document. Close as not-needed. | 0 |
| **Drop-in fires a callback on no-data** | Add a thin handler at the mount site: `onEmpty: () => window.location.replace('/404')`. | ~15 min |
| **No empty-state callback — drop-in renders an empty block** | Add a thin wrapper that polls the drop-in's rendered state (or watches the `product-details` block for content after a settle window) and fires `window.location.replace('/404')` when it stays empty past N ms. | ~2 h |

The wrapping fallback (third row) is most likely. Adobe's drop-ins generally optimize for "data exists" and don't ship explicit empty-state callbacks for SKU-not-found because the route layer is supposed to handle that — except in our case, the route IS layered (BYOM cache + Commerce-resolved-empty), so the drop-in inherits the responsibility.

## Implementation sketch (if wrapper needed — third row)

After the drop-in mounts, watch the `product-details` block:

```js
// Pseudo — in the storefront's commerce-product-details block JS
const EMPTY_DETECT_MS = 1500; // generous settle window for slow networks
setTimeout(() => {
  const detailsEl = document.querySelector('.product-details');
  // Drop-in convention: populated detail blocks have specific child nodes;
  // empty state has either nothing or a placeholder skeleton class.
  if (!detailsEl || detailsEl.childElementCount === 0 || detailsEl.querySelector('.skeleton')) {
    window.location.replace('/404');
  }
}, EMPTY_DETECT_MS);
```

The 1.5-second settle window prevents false positives from slow Commerce queries. Tune based on what the drop-in actually does — the investigation step determines the right signal to watch.

## Where the fix lives

This is **storefront-template work**, not Demo Builder extension work. Affected repos:

- `skukla/citisignal-eds-boilerplate` (citisignal package)
- `skukla/buildright-eds` (buildright package — needs PDP check)
- Adobe-owned templates (`adobe-commerce/boilerplate-b2b-template`, `hlxsites/aem-boilerplate-commerce`, `stephen-garner-adobe/isle5`) — fix would be a Demo Builder code patch applied at create time if we don't maintain the forks (see thin-layer evaluation).

If the thin-layer evaluation outcome retires the forks, this ships as a Demo Builder code patch instead of a per-fork commit. Either way, behavior is the same.

## Scope and non-goals

**In scope:**

- Detect empty Commerce response for a SKU lookup, redirect to `/404`.
- Settle window long enough to avoid false positives from slow loads.
- Verify the redirect doesn't fire during legitimate "still loading" — only after the drop-in has resolved with no data.
- Consistent behavior across all storefront templates.

**Out of scope:**

- Custom messaging on the PDP itself ("Product not available"). The native `/404` is the messaging.
- Triggering Helix admin to unpublish the stale URL. The redirect handles the visible UX; the URL continuing to serve is harmless and out of scope.
- "Did you mean…" suggestions on the `/404` page. Possible enhancement; not required.
- Server-side detection / 404 status from the response. Architecturally impossible at this layer (page was served 200).

## Effort

Investigation-bounded:

- **Phase 0 investigation**: 15–30 min, always required.
- **Phase 1 implementation**: 0, ~15 min, or ~2 h depending on Phase 0 outcome.

Worst-case total: ~2.5 hours. Likely-case total: under 1 hour.

## Risks

- **False positives during slow Commerce queries.** The settle window mitigates but doesn't eliminate. On a particularly slow network, a real product might trigger redirect. 1.5s is a reasonable starting point; tune based on real-world testing.
- **Detection signal stability.** Whatever signal we watch (empty `product-details`, drop-in skeleton class, absence of specific child nodes) is internal drop-in implementation. If `@dropins/storefront-pdp` changes its render shape across versions, the detector breaks. Mitigation: prefer a documented callback over DOM polling if one exists.
- **Redirect loops.** If `/404` itself somehow matches PDP-shape routing logic in the future, we could end up in a loop. Today's smart-404 snippet already gates on `pdpRetry` flag; the redirect target here is `/404` not a PDP path, so this shouldn't happen — but worth being explicit in tests.
- **Phase 2 reduces the frequency this matters.** With render-pdp serving the SC's authored template (LIVE 2026-06-09) and pre-warming about to land (eliminating most cold paths), the stale-URL exposure is even smaller. This backlog item is for the edge case where an SC explicitly deletes a SKU after demo setup.

## Kickoff prompt

> Resolve the empty-PDP UX gap described in `.rptc/backlog/2026-06-09-pdp-graceful-empty-state.md`. **Do not write implementation code until Phase 0 is complete.** Start by reading `@dropins/storefront-pdp`'s source/docs for any built-in empty-state callback (specifically: "data resolved + no result" hook, not a generic "loading" hook). Then verify on a Demo-Builder-created storefront by visiting a known-missing SKU URL and capturing what the drop-in does. Classify against the three-row decision matrix in the file. **Goal is redirect to `/404`, not custom messaging.** Prototype on `skukla/citisignal-eds-boilerplate` first; the same change either propagates per-fork or becomes a Demo Builder code patch depending on the thin-layer evaluation outcome.

## Related work

- `docs/architecture/eds-byom-pdp-routing.md` — Phase 1 / 2 architecture
- `docs/architecture/adr/005-byom-pdp-routing.md` — original design rationale; stale-URL cleanup explicitly out of scope, this backlog item is the chosen approach
- `2026-06-09-evaluate-thin-layer-storefront-model.md` — determines per-fork commits vs Demo Builder code patch
- `2026-06-09-dropin-version-coupling.md` — citisignal's drop-in drift may affect detection-signal stability
