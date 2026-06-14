# ADR-005: BYOM PDP Routing — Canonical Pattern with Multi-Tenancy and Smart-404 Gap-Fill

**Status**: Accepted
**Date**: 2026-06-09 (revised 2026-06-10 after canonical anchoring research)
**Decision Maker**: Project Owner
**Implementer**: Phase 1 ship 2026-06-09 (this slice). Phase 2 ship 2026-06-09 (later same day; verified live on `citisignal-b2b`).

Related: [ADR-007](007-pdp-sku-url-encoding.md) — reversible SKU URL encoding (the `/products/{urlKey}/{sku}` path's SKU segment).

---

## Context

### The Problem

Demo Builder ships EDS storefronts whose product detail pages live at `/products/{urlKey}/{sku}`. There's no per-product authored content — the storefront has a single `/products/default` template that Adobe Commerce's PDP drop-in mounts onto. Without some routing mechanism, `/products/{urlKey}/{sku}` 404s on EDS for every product.

The question this ADR resolves: **what routing mechanism does Demo Builder ship to solve PDP 404s, and how does that mechanism relate to Adobe's documented patterns?**

### What Adobe documents as the canonical pattern

Adobe's canonical pattern for Commerce-on-EDS PDP routing is **BYOM (Bring Your Own Markup) `content.overlay`** registered against the Configuration Service. Folder mapping is officially deprecated; per-product DA pages don't scale. The published reference implementation is `adobe-rnd/aem-commerce-prerender`, which:

1. Registers a `content.overlay` block in the storefront's Configuration Service registration
2. Deploys an App Builder action that returns the SC's authored `/products/default` template for any `/products/{urlKey}/{sku}` path
3. Runs a scheduled poller (5-min default) that enumerates Catalog Service and triggers Helix admin preview+publish for each SKU — populating content-bus
4. Documents that recovery for paths the poller hasn't yet published is via manual CLI tools (`refresh-pdps.js`) or operator UI buttons ("Reset + Trigger Scraper")
5. Has [open issue #262 "feature: event-driven updates"](https://github.com/adobe-rnd/aem-commerce-prerender/issues/262), acknowledging that polling is the only current mechanism and event-driven recovery is a desired future feature

The BYOM spec ([aem.live/developer/byom](https://www.aem.live/developer/byom)) is explicit: overlay is consulted during **preview**, not live-tier delivery. For a path to return 200 on the live tier, it must already be in content-bus. This is an intentional contract, not a bug.

### What our use case requires beyond canonical

Demo Builder serves Adobe Solutions Consultants prepping demos. Two requirements push beyond what `aem-commerce-prerender` natively provides:

1. **Multi-tenancy** — SCs spin up demos at a rate of dozens per team per week. Asking each SC to deploy and maintain their own App Builder workspace with `aem-commerce-prerender` is operational friction at odds with the "install-and-go" UX Demo Builder exists to provide.
2. **Catalog-churn recovery within a demo cycle** — SCs occasionally add SKUs to Commerce during demo prep. Adobe's canonical pattern accepts a 5–30 minute staleness window between poller cycles, with operator intervention required for faster recovery. That's correct for production storefronts but breaks the demo workflow, where a live demo might hit a SKU added moments earlier. This gap is exactly what Adobe's issue #262 captures.

---

## Decision

**Use the canonical BYOM pattern, with two deliberate, documented innovations on top.**

### Layer-by-layer

| Layer | What | Status vs canonical |
|---|---|---|
| **Routing** — Configuration Service `content.overlay` registration | Same JSON shape as `aem-commerce-prerender`'s setup wizard, including `suffix: '.html'` | **Aligned with canonical** |
| **SSR template** — `render-pdp` action returns SC's authored `/products/default` | Phase 2 LIVE 2026-06-09; fetches `https://main--{site}--{org}.aem.live/products/default` with browser User-Agent, caches per org/site, generic shell fallback | **Aligned with canonical** (line-for-line equivalent of `actions/pdp-renderer/render.js`) |
| **Multi-tenant hosting** of the action | One shared `accs-discovery-service` workspace; `?org=&site=` query params on the registered overlay URL route per-tenant | **Innovation #1** — canonical is single-tenant per workspace |
| **Catalog publishing** — pre-warming at create/reset | Enumerate Catalog Service, fire `prepublish-pdp` for each SKU in batches of 5 | **Aligned with canonical** — same operation as one poller cycle, run synchronously |
| **Catalog-churn recovery** — smart-404 client-side trigger | Vendored into `head.html`, `404.html`, `delayed.js`; on cold-visit, POSTs to `prepublish-pdp` to publish on demand | **Innovation #2** — closes the gap Adobe acknowledges in issue #262 |
| **Server-side SSR injection** — JSON-LD, per-SKU og:image, Merchant Center metadata | Not built | **Deliberately omitted** — Tier 3 from canonical; not required for demo audiences |

### What this means

- The routing layer (`content.overlay`) is the documented Adobe-canonical pattern. Folder mapping was deprecated specifically in favor of this; per-product DA pages don't scale; there is no other working alternative.
- The pre-warming at create/reset is functionally one cycle of the canonical poller. The cadence differs (synchronous one-shot vs scheduled background), but the operation is identical: enumerate catalog → publish each SKU.
- The two innovations on top — multi-tenant hosting and smart-404 — are deliberate deviations, each justified by a Demo-Builder-specific requirement the canonical doesn't address.
- The SSR injection layer (JSON-LD etc.) is correct to omit for demos. Demo audiences are humans on calls, not crawlers. SCs who later need production-grade SEO can deploy `aem-commerce-prerender` directly to their own workspace alongside Demo Builder's overlay.

---

## What This ADR Does Not Decide

- **Authentication for `prepublish-pdp` if Helix admin POST is ever locked down.** The current design depends on the open-admin behavior. If Helix changes, the path forward is the GitHub App pattern (action authenticates as an app SCs install), but that's significant infrastructure not part of this slice.
- **Cleanup after SKU deletion.** Tracked in `.rptc/backlog/2026-06-09-pdp-graceful-empty-state.md` — drop-in detects empty Commerce data and redirects to native `/404`. The stale URL itself stays in content-bus but the UX is correct.
- **PDP staleness in multi-day POCs.** Same backlog item handles the realistic exposure path (external link to a deleted SKU).
- **Full SSR (Tier 3).** Out of scope. If a customer needs production-grade SEO on a demo storefront, they deploy `aem-commerce-prerender` themselves to their own workspace.
- **Migration to canonical when issue #262 ships.** When Adobe ships event-driven recovery in `aem-commerce-prerender`, Demo Builder can reevaluate whether to retire smart-404. Not urgent; both can coexist.

---

## Consequences

### Positive

- **Adobe-supported routing pattern.** The `content.overlay` mechanism is the documented replacement for folder mapping. Aligned with Adobe's published direction.
- **PDPs work end-to-end** for every storefront with zero per-SKU manual setup. Catalog churn during demo prep is handled instantly by smart-404 instead of requiring a reset.
- **Multi-tenant hosting** eliminates per-storefront App Builder deployment burden. SCs never run `aio app deploy` for PDP routing.
- **Catalog scale doesn't matter.** A 10K-SKU prospect catalog works the same as a 50-SKU sample catalog. Pre-warming uses bounded concurrency (5 parallel POSTs to respect Helix admin's 10 req/s).
- **Phase 2 upgrade path was clean as predicted.** Only the `render-pdp` action changed; every existing storefront's PDPs picked up SC customizations on next reset without an extension ship. Shipped same day as Phase 1.

### Negative

- **Smart-404 has no canonical equivalent today.** We built what Adobe has acknowledged as a desired feature (issue #262) but hasn't shipped. If issue #262 ships, Demo Builder might migrate to the canonical mechanism. Until then, smart-404 is custom code we own.
- **No server-side SSR / JSON-LD / Merchant Center support.** Acceptable for demos (humans on calls). If production-grade SEO is ever needed on a demo storefront, that requires layering `aem-commerce-prerender` on top — a meaningful additional setup step for the SC.
- **~2-second cold-path latency** the first time a never-warmed SKU is visited (smart-404 cycle). Pre-warming covers the catalog at create/reset, so cold paths only fire for catalog churn. Spinner + storefront chrome stay visible during the cycle.
- **Depends on Helix admin POST being unauthenticated** for our origin. If Helix changes that contract, the smart-404 cold-path mechanism needs follow-up.
- **Depends on Catalog Service being case-insensitive on SKU lookups.** If that changes, PDPs render with empty product data (silent rot). Detection probe documented in memory entry `catalog-service-sku-case-insensitive`.

### Neutral

- **The dual-repo coordination** (this extension + `accs-discovery-service`) is a coupling we accept. It's bounded by three URL strings; the action and extension can evolve independently as long as the URLs stay stable.
- **Multi-tenancy via `?org=&site=` query params** is our routing convention, not Adobe's. If the canonical ever adds multi-tenancy support, we'd reevaluate the wrapper.

---

## Why Smart-404 Specifically

Smart-404 is the load-bearing innovation that distinguishes our pattern from canonical. The justification needs to be explicit.

### What it does

When a user visits `/products/{urlKey}/{sku}` and Helix returns 404 (path not in content-bus), the smart-404 snippet in the storefront's static `404.html`:

1. Detects PDP-shape URLs via regex
2. Lower-cases the path (Helix content-bus normalizes lowercase)
3. POSTs to `prepublish-pdp` action with the lowercase path
4. The action triggers Helix admin preview+publish; the overlay is consulted per BYOM contract; content-bus is populated
5. Redirects the user to the now-published URL

The cycle takes ~2 seconds total. The user sees a spinner against storefront chrome rather than a 404 page.

### Why the canonical doesn't have this

Reading every action in `aem-commerce-prerender`, all docs, and the boilerplate frontend confirms: no equivalent exists. Recovery is via:

- The scheduled poller (5-min default), which catches up over time
- Manual CLI tool `refresh-pdps.js` (operator-only)
- The management UI's "Reset + Trigger Scraper" button (operator-only)

The RUNBOOK's 404 guidance literally says: *"check the Management Tool... it is very likely that the product was not published."* This is operator-driven recovery, not user-driven.

Adobe collaborator @sirugh filed [issue #262 "feature: event-driven updates"](https://github.com/adobe-rnd/aem-commerce-prerender/issues/262) explicitly acknowledging this gap and that event-driven recovery is on Adobe's roadmap. As of this ADR's date, it remains open.

### Why we built it anyway

The canonical's "operator-driven recovery" assumes a production storefront with a 24/7 operator and acceptable staleness windows. The demo workflow has neither:

- **No operator during demos.** A SC presenting to a prospect can't pause to run `refresh-pdps.js`.
- **No tolerance for staleness during demos.** A SKU added five minutes before the demo must work on click.

So the trade is: accept the maintenance burden of custom code that fills a documented Adobe-acknowledged gap, in exchange for instant catalog-churn recovery during demos. The alternative (accepting churn 404s + operator intervention) breaks the demo workflow.

### When to revisit

Two triggers should cause us to revisit smart-404:

1. **Adobe ships event-driven recovery** (resolves issue #262). At that point, evaluate whether the canonical mechanism is sufficient for demo workflows. If so, retire smart-404.
2. **Helix locks down admin POST.** Smart-404's cold-path trigger relies on this; we'd need to switch to authenticated trigger or accept the churn-404 behavior.

---

## Cross-References

- **Architecture explanation**: [eds-byom-pdp-routing.md](../eds-byom-pdp-routing.md)
- **Empirical research**: `.rptc/research/eds-pdp-routing-validation/findings.md` (canonical anchoring + corrected conclusions, 2026-06-10)
- **Earlier research**: `.rptc/research/multitenant-prerender-evaluation/research.md` (original Phase 1/2 evaluation), `addendum-2026-06-09-runtime-validation.md` (live findings), `addendum-2026-06-09-helix-admin-auth-and-trigger-placement.md` (auth investigation)
- **External primary sources**: [BYOM spec](https://www.aem.live/developer/byom), [`adobe-rnd/aem-commerce-prerender`](https://github.com/adobe-rnd/aem-commerce-prerender), [issue #262 — event-driven updates](https://github.com/adobe-rnd/aem-commerce-prerender/issues/262)
- **Memory entries**: `project-byom-pdp-routing`, `catalog-service-sku-case-insensitive`, `reference-commerce-prerender-unfit`
- **Related ADRs**: ADR-003 (Multisite Architecture Seam — what Phase 1 doesn't address)
