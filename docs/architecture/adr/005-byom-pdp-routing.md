# ADR-005: BYOM PDP Routing via Shared Overlay + Smart 404

**Status**: Accepted
**Date**: 2026-06-09
**Decision Maker**: Project Owner
**Implementer**: Phase 1 ship 2026-06-09 (this slice). Phase 2 ship 2026-06-09 (later same day; verified live on `citisignal-b2b`).

---

## Context

### The Problem

Demo Builder ships EDS storefronts whose product detail pages live at `/products/{urlKey}/{sku}`. There's no per-product authored content — the storefront has a single `/products/default` template that Magento/Commerce's PDP drop-in mounts onto. Without some routing mechanism, `/products/{urlKey}/{sku}` 404s on EDS for every product.

The original routing mechanism — **folder mapping** — has been deprecated by Adobe. The alternative we've seen used in the wild — **per-product DA pages** — was a colleague's manual workaround for 25 specific SKUs on B2B Boilerplate. Neither fits Demo Builder's multi-tenant model (any SC, any catalog, install-and-go).

The question this ADR resolves: **what routing mechanism does Demo Builder ship to solve PDP 404s, and why?**

### Candidates Evaluated

| Option | Owns where | Why considered | Why rejected (if applicable) |
|---|---|---|---|
| **A. Per-product DA pages** (the colleague's pattern) | DA.live | Direct, works without infrastructure | Manual at create + every catalog change. Breaks the moment a SKU is added/deleted. Wouldn't scale across the SC team. |
| **B. Adobe Commerce Prerender** (`adobe-rnd/aem-commerce-prerender`) | Adobe's pre-render service | Adobe's own answer to this problem | Per-storefront deployment model. Conflicts with Demo Builder's multi-tenant install-and-go. Documented in `reference_commerce_prerender_unfit` memory entry. |
| **C. Pre-publish all SKUs at create** (extension queries Commerce, calls Helix admin per SKU) | This extension | Simple, deterministic | Snapshot becomes stale immediately. Doesn't scale to large catalogs. Doesn't handle catalog churn. Re-introduces the per-tenant-state coupling the team had walked away from. |
| **D. BYOM overlay + smart-404 admin trigger** (the chosen design) | Shared `accs-discovery-service` action + this extension publishes /404.html | Multi-tenant by construction; URLs publish on-demand on first visitor; no per-tenant state | — |
| **E. Client-side preview-on-miss without the action proxy** (smart 404 calls Helix admin directly from browser) | Each storefront's HTML | One fewer hop | Per-template admin contract lives in every storefront's HTML; breaks if Helix ever locks down admin POST. The action proxy (D) makes the contract a server-side concern. |

### Why D Wins

Option D's key properties:

- **Multi-tenant by construction** — one shared `render-pdp` action serves every SC's storefronts. The URL stamping `?org=&site=` provides per-storefront identification without per-storefront state in the action.
- **No per-tenant credentials** — Catalog Service uses the storefront's *public* config keys (separately verified — see Finding 3 of the runtime-validation addendum). Helix admin `POST /preview` and `POST /live` are currently unauthenticated for these storefronts (separately verified — see the auth-findings addendum). The action holds no credentials per storefront.
- **No stored per-tenant output** — Helix's own content-bus holds the responses. Reset wipes them as a side effect of the existing pipeline; nothing else owns lifecycle.
- **No state coupling to Demo Builder** — the extension wires up the overlay URL at create/reset, then walks away. The action and the 404 page do everything else at runtime.
- **Catalog churn handled by smart-404** — new SKUs publish on first hit. No pre-publish snapshot to go stale.
- **Catalog scale doesn't matter** — there's no cap. A 10K-SKU prospect catalog works exactly the same as a 50-SKU sample catalog.

The combination of "publish on first hit" (smart-404) + "no per-tenant state" (action proxy) is what makes Option D distinctly better than C (pre-publish snapshot) for this use case. C would have shipped sooner but rotted faster.

---

## Decision

Phase 1 ships:

1. The `render-pdp` overlay action in `accs-discovery-service` returns a PDP template for `/products/{urlKey}/{sku}` paths and 404 for everything else. Phase 2 (LIVE 2026-06-09) has the action fetch the storefront's authored `/products/default` from `main--{site}--{org}.aem.live` and serve that template (per-org/site cached, generic shell as fallback on fetch failure); Phase 1 originally shipped a generic shell.
2. The Configuration Service registration in this extension (`buildSiteConfigParams` → `registerSite` / `updateSiteConfig`) sets `content.overlay.url` to the deployed `render-pdp` URL with `?org=&site=` stamped on per storefront.
3. The extension publishes a custom `/404.html` to DA.live at create/reset. The page's embedded JS detects PDP-shape URLs, redirects to the lowercase variant if it exists, and otherwise POSTs to a sibling `prepublish-pdp` action that calls Helix admin to publish the path on demand.
4. The `prepublish-pdp` action is gated to PDP-shape paths only; relies on Helix admin POST being currently unauthenticated.

Phase 2 (LIVE 2026-06-09):

- `render-pdp` fetches the storefront's authored `/products/default` from `https://main--{site}--{org}.aem.live/products/default` with a browser User-Agent, caches the result per org/site, and serves it. Generic shell remains as a fallback on fetch failure. Same admin trigger flow; only what the action returns changes. Honors SC template customizations automatically. Verified live on `citisignal-b2b` — published PDPs structurally match the authored template (same block classes, same header/footer markers).

---

## What This ADR Does Not Decide

- **The shape of authentication for `prepublish-pdp` if Helix admin POST is ever locked down.** Phase 1 explicitly depends on the current open-admin behavior. If Helix changes, the path forward is the GitHub App pattern (action authenticates as an app SCs install), but that's significant infrastructure and is not part of Phase 1.
- **Cleanup after SKU deletion.** Tracked separately in the backlog as "graceful 'Product not available' handling in the drop-in" — a smaller fix than a dedicated cleanup workstream.
- **PDP staleness in multi-day POCs.** Same backlog item handles the realistic exposure path (external link to a deleted SKU).
- ~~**Phase 2 implementation timing.**~~ Resolved — Phase 2 shipped 2026-06-09.

---

## Consequences

### Positive

- PDPs work end-to-end for every storefront with zero per-SKU manual setup.
- Catalog churn is invisible from the SC's perspective — new SKUs work on first click, deletions don't break navigation.
- Storefront repositories are untouched. No coordination required with Adobe or with Stephen Garner (Isle5 owner) for Phase 1. No extension-side patches against the canonical templates.
- Demo Builder's role is bounded: register the overlay, publish one custom 404 page, done. No ongoing per-storefront state to manage.
- Phase 2 upgrade path was clean as predicted: only the `render-pdp` action changed; every existing storefront's PDPs pick up SC customizations on next reset (or on next per-URL re-publish) without any extension shipping. Shipped same day as Phase 1.

### Negative

- ~~Phase 1 PDPs render the *generic* template, not the SC's customized PDP.~~ Resolved — Phase 2 (LIVE 2026-06-09) has `render-pdp` fetch the authored template, so SC customizations now appear on every product URL.
- ~2-3 second latency on the cold path (first visitor per SKU). Acceptable for demos, would not be for production.
- Phase 1 depends on Helix admin POST being unauthenticated. If Helix changes, Phase 1 needs follow-up work in the action repo.
- Phase 1 depends on Catalog Service being case-insensitive on SKU lookups. If that changes, every PDP renders with empty product data (silent rot). Detection probe is documented.

### Neutral

- The dual-repo coordination (this extension + `accs-discovery-service`) is a coupling we accept. It's bounded by three URL strings; the action and extension can evolve independently as long as the URLs stay stable.

---

## Cross-References

- **Architecture explanation**: [eds-byom-pdp-routing.md](../eds-byom-pdp-routing.md)
- **Empirical research**: `.rptc/research/multitenant-prerender-evaluation/research.md` (original Phase 1/2 evaluation), `addendum-2026-06-09-runtime-validation.md` (live findings), `addendum-2026-06-09-helix-admin-auth-and-trigger-placement.md` (auth investigation)
- **Memory entries**: `project-byom-pdp-routing`, `catalog-service-sku-case-insensitive`, `reference-commerce-prerender-unfit`
- **Related ADRs**: ADR-003 (Multisite Architecture Seam — what Phase 1 doesn't address)
