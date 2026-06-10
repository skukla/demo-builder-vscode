# Research: B2B Boilerplate PDP 404 — Builder Never Authors Per-Product Pages

**Date**: 2026-06-08
**Branch**: develop (HEAD `825ab043`)
**Status**: Complete — proceeding to plan Option A
**Decision**: Implement Option A (catalog-driven per-product page authoring). Track Option B (BYOM overlay + App Builder action) as a follow-on.

---

## Problem

A colleague built a demo with the **B2B Boilerplate** option. Selecting a product on the landing page hits `/products/{urlkey}/{sku}` and returns 404. He fixed it manually:

- Created 25 individual DA.live pages, one per product, at the exact `/products/{urlkey}/{sku}` paths.
- Used `/products/default` as the template content.
- Previewed each one via the Helix admin API.

After that, every PDP worked. The Commerce drop-in extracted the SKU from the URL and rendered the product correctly.

## Three questions the user asked

1. Is this related to something we already fixed?
2. Is this a brand-new gap?
3. Can the builder address it automatically?

## Answers

### 1. Not the bug `eds-publish-404-fix` addressed

Commit `6779c85f` (slice-1 branch; same fix shipped as the closed PR #42 `2ed8c930`) forces `skipPublish: false` so an already-authored `/` page gets republished when a user recreates a storefront with the same name. That is a **whole-site never-published** 404.

The PDP 404 is **per-PDP never-authored**. The site index loads fine; only `/products/{urlkey}/{sku}` 404s. Even with the publish fix in place, `helixService.publishAllSiteContent` calls `listAllPages` on the user's DA.live site — and nothing is there for `/products/{urlkey}/{sku}` to publish in the first place.

Different layer (publish vs. content-author), different mechanism, different symptom.

### 2. Yes — a new structural gap

Three independent confirmations:

- **The builder filters out per-product paths on purpose.** `filterProductOverlays` in `daLiveContentOperations.ts:61-73` drops every `/products/*` path except `/products/default` during the template copy. Tests at `tests/features/eds/services/daLiveContentOperations-utils.test.ts:135-189` lock this in.
- **The upstream template ships only the catch-all.** The live `adobe-commerce/boilerplate-b2b` sitemap (`https://main--boilerplate-b2b--adobe-commerce.aem.live/sitemap.xml`) lists 165 URLs. Two are `/products/...` and both point at `/products/default`. Zero per-product URLs.
- **Nothing downstream fans it out.** The codebase configures neither folder mapping (deprecated; never written to `fstab.yaml` per `fstabGenerator.ts:24-27`) nor a BYOM overlay (`byomOverlayUrl` is plumbed end-to-end through to `configurationService.ts:140-142`, but no entry in `demo-packages.json` sets it). The template's `commerce.js` does have the client-side router (regex `/\/products\/[\w|-]+\/([\w|-]+)$/`) but it only runs *after* Helix delivers an HTML shell — which Helix won't do without an authored page or an overlay.

The colleague's manual fix is doing what the builder is silently expected to do.

### 3. Yes — and the builder already has every primitive

| Need | Already exists? | Where |
|------|----------------|-------|
| DA.live page-to-page copy | Yes | `DaLiveContentOperations.copyContent` (`daLiveContentOperations.ts:218-282`) |
| Single-file copy with content patches | Yes | `copySingleFile` (`daLiveContentOperations.ts:412-498`) |
| Bulk preview by arbitrary path array | Yes | `helixService.previewAllContent` (`helixService.ts:936-1020`) |
| Bulk publish by arbitrary path array | Yes | `helixService.publishAllContent` (`helixService.ts:1039-1123`) |
| Commerce credentials at create-time | Yes | Connect-Store step (`ConnectStoreStepContent.tsx`) — same auth used by `commerceStoreDiscovery.ts` |
| BYOM overlay registration | Yes (unwired) | `ConfigurationService.registerSite` (`configurationService.ts:54-56`, `140-146`) |
| **Commerce catalog query for SKUs/urlkeys** | **No** | Missing |

The single missing piece is a Commerce product-list fetcher. Everything else is already in place.

---

## Two viable options

### Option A — Catalog-driven per-product page authoring at create-time

What the colleague did manually, automated. New pipeline step between content-copy and publish:

1. Query Commerce for `{sku, urlKey}` pairs (PaaS REST `/rest/V1/products?searchCriteria...` with the admin Bearer token already in use; ACCS via Catalog Service GraphQL or extended discovery service with the IMS token already in `params.imsToken`).
2. For each pair, call existing `copyContent('/products/default' → '/products/{urlKey}/{sku}')`. Reuse the parallel-batch pattern from `copyContentFromSource` (`daLiveContentOperations.ts:1825-1843`).
3. Existing publish step picks up the new pages via `listAllPages`. No publish-side change.
4. Loosen `filterProductOverlays` to opt-in per storefront entry so the per-product path can co-exist with the catch-all `/products/default`.

**New pieces**: a Commerce product-list fetcher (~50 lines, alongside `fetchStoreStructurePaas` in `commerceStoreDiscovery.ts`); a fan-out copier on `DaLiveContentOperations`; one new step in `executeEdsPipeline`; a `pdpStrategy: 'per-product'` flag on B2B entries in `demo-packages.json`.

**Pros**:
- No new external infrastructure.
- Matches what the colleague proved by hand.
- Uses the auth + connectivity already established at Connect Store.
- Pages are real DA documents — author-time tooling (editing, content patches) works on them.

**Cons**:
- Pages are static after create. New products in Commerce don't appear until storefront re-create.
- Doesn't scale to large catalogs (every page is a real DA document).
- Catalog churn → stale pages.

**Fit for use case**: Demo storefronts with ~25 products. YAGNI-perfect for the builder's customer.

### Option B — BYOM overlay + App Builder action

Adobe's documented architecture for exactly this scenario. The Adobe Developers Live 2025 talk *"Dynamic Publishing at the Edge with BYOM and App Builder"* describes it directly:

> "Instead of sinking product data into the CMS, we configured an overlay that allows product page requests to be rendered directly by App Builder. App Builder fetches the latest product data, metadata, pricing, availability, promotions and transforms that into semantic HTML. Edge Delivery delivers this with the same set of blocks and styles as the authored part of the page."

Mechanism: register `content.overlay.url` on the Configuration Service (the exact JSON shape `ConfigurationService.registerSite` already supports). The overlay URL points at an App Builder action. Helix calls the overlay first for every preview request; the action returns rendered HTML for `/products/{urlkey}/{sku}`, or 404 to fall through to the authored content source.

**New pieces**: a deployable App Builder action; an `byomOverlayUrl` field populated on `demo-packages.json` B2B entries; an opinion on whether the action is hosted by Adobe (one shared instance) or per-customer (each project deploys its own).

**Pros**:
- Dynamic — catalog changes appear immediately.
- Scales to any catalog size.
- Adobe-documented pattern, demo-able as best practice.
- Demo Builder is itself an App Builder tool — this is its native ecosystem.

**Cons**:
- Real infrastructure: an App Builder action to write, deploy, maintain.
- Provisioning question (per-project vs. shared) is non-trivial.
- Failure mode is harder to debug than a static page.

**Fit for use case**: Production-faithful demos. Future state.

---

## Decision

**Now**: Option A. Same shape as the proven manual workaround; ships with the primitives the codebase already has.

**Next**: Option B as a follow-on. Worth doing — Adobe's official answer to PDPs-on-EDS deserves a place in a demo builder. Track separately so it doesn't block Option A.

The two options are **complementary, not exclusive**: Option A populates real DA documents that an Option B overlay can still override later if a customer wires the action. The `filterProductOverlays` opt-in flag covers both worlds.

---

## Methodology

Three parallel `rptc:research-agent` runs on the codebase:

1. **Existing patterns + recent fixes** — found `filterProductOverlays`, confirmed the deliberate exclusion; established that `eds-publish-404-fix` is a separate publish-layer bug.
2. **Architecture analysis** — mapped the 5-layer pipeline (`executeStorefrontSetupPhases` → `executeEdsPipeline` → primitives); identified Step 1.5 as the seam.
3. **Integration map** — proved every external dependency is already in place; the only missing call is Commerce-catalog.

External verification (six fetches):

- `aem.live/developer/byom` — confirmed BYOM is documented as the modern alternative; confirmed the `content.source` + `content.overlay` JSON shape exactly matches what `ConfigurationService.registerSite` already builds.
- `github.com/adobe-commerce/boilerplate-b2b-template/blob/main/scripts/commerce.js` — confirmed the client-side URL regex `/\/products\/[\w|-]+\/([\w|-]+)$/` and the EDS-serves-first contract.
- `https://main--boilerplate-b2b--adobe-commerce.aem.live/sitemap.xml` — confirmed no per-product URLs in the upstream template (165 pages, only `/products/default` and its French variant).
- `https://main--boilerplate-b2b--adobe-commerce.aem.live/products/default` — confirmed the catch-all template renders as a generic PDP.
- ExL search → *Dynamic Page Publishing in AEM Edge Delivery with BYOM and App Builder* (community) and *Dynamic Publishing at the Edge with BYOM and App Builder* (Adobe Developers Live 2025) — confirmed Adobe's documented pattern matches the scenario exactly.

---

## Load-bearing file references

- `src/features/eds/handlers/storefrontSetupPhases.ts:263-328` — main orchestrator
- `src/features/eds/services/edsPipeline.ts:392-508` — `executeEdsPipeline`; new Step 1.5 inserts here
- `src/features/eds/services/daLiveContentOperations.ts:61-73` — `filterProductOverlays` (loosen for per-product opt-in)
- `src/features/eds/services/daLiveContentOperations.ts:218-282` — `copyContent` (fan-out copier reuses this)
- `src/features/eds/services/daLiveContentOperations.ts:412-498` — `copySingleFile` with content-patch support
- `src/features/eds/services/daLiveContentOperations.ts:1689-1730` — `enumerateAndFilterContentPaths`
- `src/features/eds/services/daLiveContentOperations.ts:1825-1843` — parallel-batch copy pattern (template for the fan-out)
- `src/features/eds/services/helixService.ts:936-1020`, `:1039-1123` — `previewAllContent` / `publishAllContent`
- `src/features/eds/services/helixService.ts:1159-1205` — `listAllPages` (automatic publish discovery)
- `src/features/eds/services/commerceStoreDiscovery.ts:105-122`, `:139-168` — Commerce auth + connectivity already established (extend here for product-list)
- `src/features/eds/services/configurationService.ts:54-56`, `:140-146` — BYOM overlay seam (Option B path)
- `src/features/eds/services/fstabGenerator.ts:24-27` — folder-mapping deprecation note
- `src/features/project-creation/config/demo-packages.json:162-233` — B2B Boilerplate entries (add `pdpStrategy: 'per-product'` here)
- `src/features/project-creation/ui/components/ConnectStoreStepContent.tsx` — Connect Store step; could cache the product list for the create step

## External references

- aem.live BYOM docs: <https://www.aem.live/developer/byom>
- Adobe Developers Live 2025 — *Dynamic Publishing at the Edge with BYOM and App Builder*: <https://experienceleague.adobe.com/en/docs/events/adobe-developers-live-recordings/2025/dynamic-publishing>
- ExL community thread — *Dynamic Page Publishing in AEM Edge Delivery with BYOM and App Builder*: <https://experienceleaguecommunities.adobe.com/adobe-experience-manager-sites-8/dynamic-page-publishing-in-aem-edge-delivery-with-byom-and-app-builder-143653>
- `adobe-commerce/boilerplate-b2b-template/scripts/commerce.js` — client-side `/products/{urlkey}/{sku}` router
- Live boilerplate-b2b sitemap: <https://main--boilerplate-b2b--adobe-commerce.aem.live/sitemap.xml>
