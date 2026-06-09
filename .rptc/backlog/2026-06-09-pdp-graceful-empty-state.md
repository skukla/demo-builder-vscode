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

A small change in the storefront's PDP rendering path: when the Commerce drop-in finishes its query and has no product data, render a clear empty state instead of an empty `product-details` block.

The drop-in handles its own no-data rendering today by leaving the block empty. The fix is to add a wrapper that detects empty state and surfaces a user-facing message — something like:

> **Product not available**
> This product is no longer in the catalog. [Continue shopping →]

Implementation likely lives in either:

- The PDP page template's authored content (`/products/default`) — surrounds the `product-details` block with a fallback that shows when the block is empty.
- The block code in the storefront repo's `blocks/commerce-product-details/` (or whatever the actual block name is) — adds an empty-state branch after the Commerce query resolves.

Needs investigation to pick the cleaner approach.

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

~2 hours including testing, assuming the implementation lives in either the page template or a single block. More if it needs to thread through multiple drop-in components.

## Risks

- **False positives**: an empty state shown during the loading window would look like a permanent broken state. Need explicit "loading done, no result" state — not "no result yet."
- **Template surface**: if the fix has to be applied per-template, it's N copies of the same fix to maintain. Strong argument for the Demo Builder code-patch approach.
- **Drop-in API stability**: the empty-state detection depends on how `@dropins/storefront-pdp` signals "query resolved with no data." If that signal changes across drop-in versions (and the citisignal fork is 3 minors behind canonical on this package — see `2026-06-09-dropin-version-coupling.md`), the fix may not transfer cleanly.

## Kickoff prompt

> Implement the graceful empty state described in `.rptc/backlog/2026-06-09-pdp-graceful-empty-state.md`. Start by reading the Commerce drop-in's PDP rendering code on `skukla/citisignal-eds-boilerplate` to identify where the no-data branch should hook in. Pick the cleaner implementation site (block code vs page template) and prototype on citisignal. Verify the fix doesn't fire during the loading window. Once confirmed, the same approach extends to other templates or becomes a Demo Builder code patch depending on the thin-layer evaluation outcome.

## Related work

- `docs/architecture/eds-byom-pdp-routing.md` (Phase 1 scope — out of scope section).
- `2026-06-09-evaluate-thin-layer-storefront-model.md` — determines whether this ships as per-fork commits or as a Demo Builder code patch.
- `2026-06-09-dropin-version-coupling.md` — citisignal's drop-in drift may affect the empty-state detection API.
