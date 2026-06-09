---
id: 2026-06-09-pdp-graceful-empty-state
title: Drop-in shows "Product not available" when Commerce has no data for a SKU
status: backlog
created: 2026-06-09
priority: low-medium
related: BYOM PDP routing (Phase 1 ship 2026-06-09)
---

# Drop-in: graceful "Product not available" for stale PDP URLs

## Provenance

Deferred during the BYOM PDP routing Phase 1 ship (2026-06-09). The Phase 1 architecture publishes a generic PDP template via the smart 404 → action → admin trigger flow, and the published template stays in Helix content-bus indefinitely. When an SC deletes a SKU in Commerce, the URL still serves the template, and the drop-in queries Commerce for the missing SKU — gets nothing — and the page renders with an empty `product-details` block. Visible degraded UX in the narrow band of scenarios where a stale URL is reached (bookmark, external link, multi-day POC).

The Phase 1 research established that cleanup-on-deletion infrastructure (a "Refresh PDPs" dashboard action, action-side path telemetry, etc.) is overkill for the actual frequency this matters in demo workflows. The drop-in showing a clean "Product not available" message instead of broken empty content **handles the same degradation more cleanly, with less infrastructure, and covers more cases** — anything that ends with "Commerce returned no product for this SKU" gets the right UX:

- Stale URL after SKU deletion
- SKU value change (URL parses to a SKU that no longer exists)
- Race condition between Commerce update and Helix cache
- Misconfigured catalog endpoint returning no results
- Any future PDP route that hits a non-existent SKU

This is mentioned explicitly in `docs/architecture/eds-byom-pdp-routing.md` Phase 1 scope as "out of scope for Phase 1, see backlog."

## What to ship

Possibly very little. The principle is **let the drop-in do the empty-state work if it can** — Adobe's `@dropins/storefront-pdp` is designed for production storefronts where Commerce occasionally returns empty, so a built-in or configurable empty state is more likely than not. Investigation first; implementation only as much as needed.

### Phase 0: investigate (15–30 min)

Before writing any code, answer: **what does `@dropins/storefront-pdp` actually do when Commerce returns no product?**

1. Read the drop-in's source / docs for an empty-state slot, callback, or render prop.
2. Test the current behavior on a Demo-Builder-created storefront: visit a known-missing SKU URL while logged in (e.g., `/products/orchard-2/this-sku-does-not-exist`). Capture what renders.
3. Classify the finding into one of three buckets.

### Three possible outcomes — effort scales accordingly

| Finding | What to ship | Effort |
|---|---|---|
| **Built-in acceptable empty state** | Confirm the message is clear, document the finding, close as not-needed. | 0 (investigation only) |
| **Configurable empty state we have to opt into** | Enable / configure the existing mechanism at the drop-in's mount point. | ~15 min |
| **No empty state — renders nothing or a broken skeleton** | Add a thin wrapper around the drop-in that detects "Commerce resolved with no data" and surfaces a user-facing message. | ~2 h |

The wrapping fallback (third row) is what the original Phase 1 deferral assumed — but it was speculation. The investigation is what decides.

### If a wrapper IS needed (third row only)

Likely message:

> **Product not available**
> This product is no longer in the catalog. [Continue shopping →]

Implementation site (only relevant if we're actually building):

- Page template (`/products/default`) — surround the `product-details` block with a fallback that shows when the block is empty.
- Block code (`blocks/commerce-product-details/` or wherever the drop-in mounts) — extend the no-data branch.

The cleaner choice depends on what the drop-in exposes; settle this during Phase 0.

## Where the fix lives

This is **storefront-template work**, not Demo Builder extension work. Affected repos:

- `skukla/citisignal-eds-boilerplate` (citisignal package)
- `skukla/buildright-eds` (buildright package — if it has PDP rendering, needs checking)
- Adobe-owned templates (`adobe-commerce/boilerplate-b2b-template`, `hlxsites/aem-boilerplate-commerce`, `stephen-garner-adobe/isle5`) — fix would be a code patch applied by Demo Builder at create time if we don't maintain the forks (see thin-layer evaluation).

If the thin-layer evaluation outcome retires the forks, this fix ships as a Demo Builder code patch instead of a per-fork commit. Either way, the user-facing behavior is the same.

## Scope and non-goals

**In scope**:

- Detect empty Commerce response for a SKU lookup and render a clear message.
- Make the message consistent across templates (same wording, same visual treatment).
- Verify the empty state doesn't fire for legitimate "still loading" states — the message must only appear after the drop-in has resolved with no data, not while a query is in flight.

**Out of scope**:

- Triggering Helix admin to unpublish the stale URL. Phase 1 explicitly accepts that stale paths persist in content-bus; cleanup tooling was rejected as overkill. The empty state handles the visible problem; the URL technically continuing to serve is fine.
- "Did you mean…" suggestions for similar SKUs. Possible enhancement; not required.
- Redirecting to the product listing page. Could be added; default empty state should be sufficient.

## Effort

Investigation-bounded:

- **Phase 0 investigation**: 15–30 min, always required.
- **Phase 1 implementation**: 0, ~15 min, or ~2 h depending on what Phase 0 finds. Most likely outcome is the middle row (config the drop-in), based on how Adobe's drop-ins generally handle missing data.

Worst-case total: ~2.5 hours. Likely-case total: under 1 hour.

## Risks

- **False positives**: an empty state shown during the loading window would look like a permanent broken state. Need explicit "loading done, no result" state — not "no result yet."
- **Template surface**: if the fix has to be applied per-template, it's N copies of the same fix to maintain. Strong argument for the Demo Builder code-patch approach.
- **Drop-in API stability**: the empty-state detection depends on how `@dropins/storefront-pdp` signals "query resolved with no data." If that signal changes across drop-in versions (and the citisignal fork is 3 minors behind canonical on this package — see `2026-06-09-dropin-version-coupling.md`), the fix may not transfer cleanly.

## Kickoff prompt

> Resolve the empty-PDP UX gap described in `.rptc/backlog/2026-06-09-pdp-graceful-empty-state.md`. **Do not write implementation code until Phase 0 is complete.** Start by reading `@dropins/storefront-pdp`'s source/docs for any built-in or configurable empty state, then verify on a Demo-Builder-created storefront by visiting a known-missing SKU URL and capturing what renders. Classify the finding against the three-row decision matrix in the file. Most likely outcome is "configure the drop-in" (~15 min). If a wrapper is genuinely required, prototype on `skukla/citisignal-eds-boilerplate` first; the same change either propagates per-fork or becomes a Demo Builder code patch depending on the thin-layer evaluation outcome.

## Related work

- `docs/architecture/eds-byom-pdp-routing.md` (Phase 1 scope — out of scope section).
- `2026-06-09-evaluate-thin-layer-storefront-model.md` — determines whether this ships as per-fork commits or as a Demo Builder code patch.
- `2026-06-09-dropin-version-coupling.md` — citisignal's drop-in drift may affect the empty-state detection API.
