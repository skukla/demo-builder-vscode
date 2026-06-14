# EDS BYOM PDP Routing

How the extension makes `/products/{urlKey}/{sku}` URLs work for every storefront, dynamically, without per-product authoring.

For the decision rationale behind the architecture, see [ADR-005](adr/005-byom-pdp-routing.md). For the empirical evidence behind the design, see `.rptc/research/eds-pdp-routing-validation/findings.md` (canonical anchoring + corrected conclusions, 2026-06-10) and `.rptc/research/multitenant-prerender-evaluation/` (original Phase 1/2 research).

---

## Problem

EDS storefronts have no built-in routing for per-product URLs (`/products/{urlKey}/{sku}`). The historical mechanism — folder mapping — has been deprecated by Adobe. The official replacement is **BYOM (Bring Your Own Markup) `content.overlay`** registered against the Configuration Service. That's the canonical pattern, documented at [aem.live/developer/byom](https://www.aem.live/developer/byom) and implemented by Adobe's reference `adobe-rnd/aem-commerce-prerender`.

Demo Builder uses the canonical BYOM pattern with **two deliberate innovations** on top, each justified by the demo workflow's needs (see ADR-005 for full rationale):

1. **Multi-tenant hosted action** — Adobe's reference is single-tenant (one App Builder workspace per storefront). Demo Builder hosts one shared `render-pdp` action serving every SC's storefronts via `?org=&site=` query params on the registered overlay URL.
2. **Smart-404 client-side recovery** — Adobe's reference relies on a scheduled poller to publish catalog SKUs into Helix content-bus over time, with operator CLI tools (`refresh-pdps.js`) for manual recovery. Demo Builder adds a JS snippet vendored into the storefront's `head.html` / `404.html` / `delayed.js` that triggers on-demand publish for any unknown PDP URL on first visit. Closes the gap Adobe acknowledges in [`aem-commerce-prerender` issue #262](https://github.com/adobe-rnd/aem-commerce-prerender/issues/262) (event-driven recovery, OPEN).

**Phase 2 status: LIVE as of 2026-06-09.** The `render-pdp` overlay fetches the storefront's authored `/products/default` (per-org/site cache, generic shell as fallback on failure) and serves that on real product URLs. SC customizations to `/products/default` inherit on every PDP automatically.

---

## Architecture

```
┌─ This repo (demo-builder-vscode) ──────────────────────────┐
│                                                            │
│  Create / reset / edit pipeline writes:                    │
│    • Configuration Service site config with                │
│      content.overlay.url = <render-pdp endpoint>           │
│      ?org=<daLiveOrg>&site=<daLiveSite>                    │
│    • Eager mixed-case → lowercase redirect snippet         │
│      prepended to head.html. Runs synchronously before     │
│      body paint. Handles the common case (PLP click on a   │
│      mixed-case product URL) with zero visible 404 flash.  │
│    • Smart-404 JS snippet appended to                      │
│      scripts/delayed.js in the storefront's GitHub repo,   │
│      with the storefront's org, site, and the              │
│      prepublish-pdp endpoint URL templated in. Gated on    │
│      window.isErrorPage. Handles the cold case (lowercase  │
│      URL that's never been published yet) by calling       │
│      prepublish-pdp and redirecting after success.         │
│                                                            │
└────────────────────────────────────────────────────────────┘
                              │
                              │ Helix Configuration Service +
                              │ Helix preview/publish
                              ▼
┌─ accs-discovery-service (sibling repo) ────────────────────┐
│                                                            │
│  render-pdp:  GET /api/v1/web/accs-discovery/render-pdp    │
│    Called by Helix during admin preview/publish.           │
│    Fetches the storefront's authored /products/default     │
│    from https://main--{site}--{org}.aem.live and serves    │
│    it (per-org/site cache; generic shell on fetch fail).   │
│    Returns 404 for non-PDP paths so Helix falls back to    │
│    authored content.                                       │
│                                                            │
│  prepublish-pdp: POST .../prepublish-pdp                   │
│    Called by the smart 404 from the visitor's browser.     │
│    Triggers Helix admin POST /preview + POST /live for     │
│    the requested path. Gated to PDP-shape paths only.      │
│    No auth (Helix admin POST is currently open).           │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

The two repos coordinate via three URL strings — the `render-pdp` overlay URL, the `prepublish-pdp` trigger URL, and the storefront's `?org=&site=` stamping. No per-tenant credentials, no per-tenant state, no shared secret.

---

## Request flows

### First visitor to a PDP path (cold path)

```
1. Visitor clicks product card on PLP → /products/orchard-2/Orchard2
2. Helix looks up content-bus at the mixed-case path → 404 (Helix
   stores content-bus paths in lowercase; mixed case never matches).
3. head.html eager redirect fires synchronously before body paint:
   detects PDP shape, computes lowercase /products/orchard-2/orchard2,
   calls location.replace(). No visible 404 flash.
4. Browser navigates to lowercase URL. Helix looks up the lowercase
   path:
   - If already published (warm path): Helix serves the cached page
     → drop-in runs → done.
   - If not yet published (cold path): Helix 404s again → storefront
     renders its default 404 chrome. delayed.js loads, the smart-404
     snippet checks window.isErrorPage:
   a. Recognizes PDP-shape URL
   b. Computes lowercase variant /products/orchard-2/orchard2
   c. HEAD checks lowercase variant → 404 (not yet published)
   d. POST to prepublish-pdp action with the lowercase path
4. prepublish-pdp action:
   a. Validates path matches /products/{urlKey}/{sku} shape
   b. POST admin.hlx.page/preview/.../products/orchard-2/orchard2
      → Helix calls render-pdp overlay → gets SC's authored /products/default template
      → stores at lowercase path in content-bus
   c. POST admin.hlx.page/live/.../products/orchard-2/orchard2
      → Helix promotes preview to live
   d. Returns 200 to the browser
5. Smart-404 JS: location.replace('/products/orchard-2/orchard2?pdpRetry=1')
6. Browser navigates to lowercase URL → Helix serves the cached template → 200
7. Drop-in runs, reads SKU=orchard2 from URL, queries Catalog Service
   → Catalog Service returns the canonical Orchard2 product (case-insensitive lookup)
8. Page populates with product data. Total time: ~2-3 seconds for cold path.
```

### Subsequent visitors to the same SKU (warm path)

```
1. Visitor clicks another product card → /products/droidview-1/DroidView1
   OR same product from a fresh session
2. Helix → content-bus → not found (mixed case) OR found (lowercase) → 404 or 200
3. If 404:
   - Smart-404 JS HEAD-checks lowercase variant
   - Lowercase variant exists (previous visitor's publish persists in content-bus)
   - location.replace(lowercase) → instant
4. If 200 already (lowercase URL):
   - Page serves directly, no smart-404 involved
```

The cold path runs once per SKU across all visitors to a storefront. Every subsequent hit — same SKU, same case, different case, different session — serves instantly from Helix's CDN cache.

---

## What ships

| Piece | Where | Behavior |
|---|---|---|
| `render-pdp` overlay action | `accs-discovery-service`, deployed (Phase 2 LIVE) | Fetches and returns the storefront's authored `/products/default` for `/products/{urlKey}/{sku}`; generic shell fallback on failure; returns 404 for non-PDP paths |
| `prepublish-pdp` trigger action | `accs-discovery-service`, deployed | Validates + relays to Helix admin preview/publish |
| Configuration Service registration with overlay URL | This repo (`ConfigurationService.registerSite` / `updateSiteConfig` with `byomOverlayUrl`) | Wires the overlay into the site config with `{ url, type: "markup", suffix: ".html" }` — shape matches canonical `aem-commerce-prerender` setup wizard |
| **Catalog pre-warming at create/reset** | This repo (`catalogPrewarmService.ts` + pipeline step) | Enumerates the Commerce catalog via Catalog Service GraphQL and pre-publishes every SKU's PDP URL via batches of 5 to `prepublish-pdp`. Equivalent to one cycle of the canonical scheduled poller. v1 supports ACCS storefronts; PaaS follow-up tracked separately. |
| Smart-404 snippet install step | This repo (`pdp404HandlerPublisher.ts` + pipeline step) | Vendors three pieces into the storefront: (1) cold-path action call + spinner UI in `scripts/delayed.js`, (2) eager mixed-case → lowercase redirect in `head.html`, (3) same eager redirect in static `404.html` |
| `demoBuilder.byom.enabled` setting | This repo | Master toggle; when off, no overlay registers and no 404 publishes |
| `demoBuilder.byom.overlayUrl` setting | This repo | Override for non-default deployments. Defaults to the team's shared deployment. |

### Out of scope (later workstreams or deliberate non-goals)

- **~~SC template customizations on real product URLs.~~** Resolved — Phase 2 shipped 2026-06-09. The overlay now fetches the storefront's authored `/products/default` and serves it on `/products/{urlKey}/{sku}`. SC customizations inherit automatically.
- **PDP cleanup after SKU deletion.** When an SC deletes a SKU from Commerce, the URL stays published in content-bus. Backlog item (`.rptc/backlog/2026-06-09-pdp-graceful-empty-state.md`) plans the fix: drop-in detects empty Commerce data and redirects to the storefront's native `/404` page (NOT a custom "Product not available" message — the native 404 is the honest UX). For demos, this case rarely matters during a live demo.
- **PaaS catalog pre-warming.** v1 of pre-warming covers ACCS only because the PaaS direct `/graphql` auth requirements are unverified for our use case. PaaS storefronts continue to work via the smart-404 fallback for catalog-churn paths; their warm catalog still loads (just less aggressively pre-warmed at setup).
- **Server-side SSR (Tier 3) — JSON-LD per SKU, og:image per SKU, Merchant Center metadata.** Deliberately omitted. The canonical `aem-commerce-prerender` does this; we don't, because demo audiences are humans on calls, not crawlers. If an SC ever needs production-grade SEO, they can deploy `aem-commerce-prerender` to their own workspace alongside Demo Builder's overlay.

---

## Load-bearing dependencies

These empirical facts make the routing work. If any changes upstream, it breaks silently.

### 1. Helix normalizes paths to lowercase before storing in content-bus

Verified 2026-06-09: `POST /preview/.../products/orchard-2/Orchard2` returns `resourcePath: "/products/orchard-2/orchard2.md"`. Helix lowercases on write.

**Why it matters**: motivates the entire smart-404 redirect. PLPs generate mixed-case URLs (Commerce SKUs are often PascalCase like `Orchard4`); Helix would serve those paths only if it stored them mixed-case, which it doesn't. The redirect routes the visitor to the lowercase URL that matches Helix's storage.

**If this ever changes** (Helix preserves case): the redirect becomes harmless overhead; everything continues to work.

### 2. Catalog Service is case-insensitive on SKU lookups

Verified 2026-06-09: `products(skus: ["Orchard2"])` and `products(skus: ["orchard2"])` both return the canonical `{sku: "Orchard2", name: "Orchard 2"}` product.

**Why it matters**: after the smart-404 redirects to a lowercase URL, the drop-in reads `sku=orchard2` from the URL path and queries Commerce. The query must still return the canonical product for the page to populate.

**If this ever changes** (Catalog Service becomes case-sensitive): every PDP across every storefront resolves at the routing layer but renders with empty product details — silent rot. Detection probe in `.rptc/research/multitenant-prerender-evaluation/addendum-2026-06-09-runtime-validation.md` (Finding 4 + reproducibility block). Mitigation paths documented in the same Finding.

### 3. Helix admin `POST /preview` and `POST /live` are currently unauthenticated for these storefronts

Verified by the `accs-discovery-service` team (research doc at `accs-discovery-service/docs/research/helix-admin-auth-findings.md`, summarized in this repo's addendum at `.rptc/research/multitenant-prerender-evaluation/addendum-2026-06-09-helix-admin-auth-and-trigger-placement.md`).

**Why it matters**: `prepublish-pdp` has no credentials yet. It can call Helix admin freely because Helix doesn't gate those endpoints. `DELETE` (unpublish) is gated, but Phase 1 doesn't need DELETE — the extension owns cleanup via the SC's local tokens.

**If this ever changes** (Helix locks down admin POST): `prepublish-pdp` would need to authenticate. The shape of that authentication is the question we'd revisit. The shared-secret pattern is rejected (see commit `facaec19` rationale); the most likely path is a GitHub App that SCs install on their account. That's significant new infrastructure — at minimum, a multi-day project on the `accs-discovery-service` side. Worth flagging early so it's not a surprise.

### 4. The SKU URL segment is reversibly encoded (not slugified)

The PDP URL is `/products/{urlKey}/{sku}`, and the drop-in reads the SKU back from the URL to query Commerce. Adobe canonical slugifies the SKU lossily (`sanitizeName`), which breaks any SKU with spaces/punctuation/mixed case (blank PDP). Demo Builder patches `getProductLink`/`getSkuFromUrl` to use a **reversible, lowercase-stable, Helix-safe** encoding (`encodeSkuForUrl`/`decodeSkuFromUrl` — keep `[a-z0-9-]` literal, escape every other UTF-8 byte as `_HH`). Clean SKUs encode unchanged; only messy SKUs gain `_HH` markers.

**Why it matters**: builds on #1 and #2 — the encoding stays lowercase (so the redirect is a no-op on it) and decodes modulo case (so the case-insensitive Catalog lookup still resolves the product). `encodeURIComponent` is unusable here: aem.live's CDN rejects `%`-encoded paths with a bare 404 before the storefront renders. The same encoder lives in `catalogPrewarmService.ts` (extension) and the `eds-demo-patches` commerce.js patches — they must stay byte-identical so published paths match generated links.

**SC guidance**: for the cleanest demo URLs, give products clean alphanumeric SKUs (avoid spaces/special characters); the product *name* is unconstrained. Custom blocks that link to PDPs should build the href with `getProductLink(urlKey, sku)`. Full rationale, alternatives, and the producer audit are in [ADR-007](adr/007-pdp-sku-url-encoding.md).

**If this ever changes** (canonical adopts reversible encoding, or Catalog Service becomes case-sensitive): see ADR-007 — the former retires the patch, the latter is the same silent-rot risk as #2.

---

## Verifying the live system

The full chain can be verified end-to-end with curl probes against any deployed storefront. The reproducibility block in `.rptc/research/multitenant-prerender-evaluation/addendum-2026-06-09-runtime-validation.md` has the exact commands. Briefly:

1. Cold PDP path 404s on live.
2. `POST /preview` + `POST /live` via Helix admin succeed without auth.
3. After the publish, the lowercase URL serves 200; mixed-case URL still 404s (drives the redirect).
4. Catalog Service returns the same product for any-case SKU query.

If Phase 1's behavior diverges from this in production, those four probes localize where the chain broke.

---

## Code reference map

| Concern | File |
|---|---|
| Overlay URL resolution + stamping | `src/features/eds/handlers/edsHelpers.ts` (`resolveByomOverlayConfig`, `appendOverlayParams`) |
| Overlay registration failure surfacing | `src/features/eds/handlers/edsHelpers.ts` (`surfaceOverlayRegistrationFailure`), wired from `storefrontSetupPhase3.ts` (create, toast) and `edsResetService.ts` (reset, `report()` — headless-safe) |
| Configuration Service registration with overlay (incl. `suffix: ".html"`) | `src/features/eds/services/configurationService.ts` (`registerSite`, `updateSiteConfig`, `buildSiteConfigParams`) |
| Smart-404 snippet generation + install (head.html, 404.html, delayed.js) | `src/features/eds/services/pdp404HandlerPublisher.ts` |
| **Catalog pre-warming (enumerate + bulk pre-publish)** | `src/features/eds/services/catalogPrewarmService.ts` |
| Pipeline integration (smart-404 install + pre-warming) | `src/features/eds/services/edsPipeline.ts`, `src/features/eds/handlers/storefrontSetupPhase2.ts` (create / edit), `src/features/eds/services/edsResetRepoHelper.ts` (reset) |
| Settings | `package.json` (`demoBuilder.byom.enabled`, `demoBuilder.byom.overlayUrl`) |

---

## Cross-references

- **Decision rationale**: [ADR-005: BYOM PDP Routing — Canonical Pattern with Multi-Tenancy and Smart-404 Gap-Fill](adr/005-byom-pdp-routing.md)
- **Canonical anchoring research**: `.rptc/research/eds-pdp-routing-validation/findings.md` (BYOM spec verification + canonical anchoring against `aem-commerce-prerender` issue #262, 2026-06-10)
- **Original Phase 1/2 research**: `.rptc/research/multitenant-prerender-evaluation/` (full doc + runtime-validation addendum + auth-findings addendum)
- **External primary sources**:
  - [BYOM spec](https://www.aem.live/developer/byom) — `content.overlay` registration contract
  - [`adobe-rnd/aem-commerce-prerender`](https://github.com/adobe-rnd/aem-commerce-prerender) — canonical reference implementation
  - [Issue #262 — event-driven updates](https://github.com/adobe-rnd/aem-commerce-prerender/issues/262) — OPEN; our smart-404 closes this gap
- **Memory entries**:
  - `project-byom-pdp-routing` — the two-repo model summary + multi-tenant rationale
  - `catalog-service-sku-case-insensitive` — load-bearing case-handling dependency
  - `reference-commerce-prerender-unfit` — why deploying Adobe's prerender per-storefront doesn't fit the demo workflow
- **Sister architecture docs**:
  - `eds-content-separation.md` — the broader two-repo content/code split
  - `eds-backend-configuration.md` — how `config.json` gets generated and published
