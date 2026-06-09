# EDS BYOM PDP Routing

How the extension makes `/products/{urlKey}/{sku}` URLs work for every storefront, dynamically, without per-product authoring.

For the decision rationale behind the architecture, see [ADR-005](adr/005-byom-pdp-routing.md). For the empirical evidence behind the design, see `.rptc/research/multitenant-prerender-evaluation/` (research doc + 2026-06-09 runtime-validation addendum).

---

## Problem

EDS storefronts use one of three mechanisms to route per-product URLs (`/products/{urlKey}/{sku}`) to the storefront's PDP template:

1. **Folder mapping** — deprecated by Adobe.
2. **Per-product DA pages** — manual, one document per SKU, breaks as soon as the catalog changes.
3. **BYOM (Bring Your Own Markup) overlay** — Adobe's documented replacement: the Configuration Service `content.overlay` field, when set, makes Helix call an external action for the path before falling back to authored content.

Demo Builder targets multi-tenant demos: any SC, any catalog, install-and-go. None of the first two options fit. Phase 1 ships the third — a shared overlay action that serves a generic PDP template multi-tenant, paired with a small JS snippet vendored into the storefront's `scripts/delayed.js` that detects 404s on PDP paths and asks Helix admin to publish them on first visit.

---

## Architecture

```
┌─ This repo (demo-builder-vscode) ──────────────────────────┐
│                                                            │
│  Create / reset pipeline writes:                           │
│    • Configuration Service site config with                │
│      content.overlay.url = <render-pdp endpoint>           │
│      ?org=<daLiveOrg>&site=<daLiveSite>                    │
│    • Smart-404 JS snippet appended to                      │
│      scripts/delayed.js in the storefront's GitHub repo,   │
│      with the storefront's org, site, and the              │
│      prepublish-pdp endpoint URL templated in. The         │
│      snippet is gated on window.isErrorPage so it's        │
│      inert on every non-404 page.                          │
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
│    Returns generic PDP template HTML (Phase 1).            │
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
2. Helix looks up content-bus at lowercase path /products/orchard-2/orchard2.md
   → not found → serves the storefront's default 404 page (head.html
   sets window.isErrorPage = true; body shows "Page Not Found")
3. delayed.js loads, the smart-404 snippet checks window.isErrorPage:
   a. Recognizes PDP-shape URL
   b. Computes lowercase variant /products/orchard-2/orchard2
   c. HEAD checks lowercase variant → 404 (not yet published)
   d. POST to prepublish-pdp action with the lowercase path
4. prepublish-pdp action:
   a. Validates path matches /products/{urlKey}/{sku} shape
   b. POST admin.hlx.page/preview/.../products/orchard-2/orchard2
      → Helix calls render-pdp overlay → gets generic template HTML
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

## Phase 1 scope (what ships)

| Piece | Where | Behavior |
|---|---|---|
| `render-pdp` overlay action | `accs-discovery-service`, already deployed | Returns generic PDP template for `/products/{urlKey}/{sku}`; returns 404 for non-PDP paths |
| `prepublish-pdp` trigger action | `accs-discovery-service`, deployed | Validates + relays to Helix admin preview/publish |
| Configuration Service registration with overlay URL | This repo, existing (`ConfigurationService.registerSite` / `updateSiteConfig` with `byomOverlayUrl`) | Wires the overlay into the site config so Helix calls `render-pdp` during admin preview |
| Smart-404 snippet install step | This repo, this slice (`pdp404HandlerPublisher.ts` + pipeline step) | Vendors the smart-404 JS into `scripts/delayed.js` at create/reset |
| `demoBuilder.byom.enabled` setting | This repo, existing | Master toggle; when off, no overlay registers and no 404 publishes |
| `demoBuilder.byom.overlayUrl` setting | This repo, existing | Override for non-default deployments (staging, dev). Defaults to the shared deployed action. |

### Out of scope for Phase 1 (deferred to Phase 2 or later)

- **SC template customizations on real product URLs.** The overlay returns a generic template, not the SC's authored `/products/default`. Customizations applied to `/products/default` (extra blocks, layout tweaks) appear when visiting `/products/default` directly but not on `/products/{urlKey}/{sku}`. Phase 2 Design (A) closes this gap by having the action fetch and inject into the storefront's authored template.
- **PDP cleanup after SKU deletion.** When an SC deletes a SKU from Commerce, the URL stays published in content-bus and serves the generic template (drop-in shows empty product details). For demos this rarely matters — internal navigation can't reach a deleted SKU's URL, and the worst-case "external link to a deleted SKU" is acceptably handled by a graceful "Product not available" message in the drop-in (separate backlog item).
- **Catalog pre-publish.** Pre-publishing all SKUs at create time is the Adobe-prerender model. Explicitly rejected; see [ADR-005](adr/005-byom-pdp-routing.md).

---

## Load-bearing dependencies

Two empirical facts make Phase 1 work. If either ever changes upstream, Phase 1 breaks silently.

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
| Configuration Service registration with overlay | `src/features/eds/services/configurationService.ts` (`registerSite`, `updateSiteConfig`, `buildSiteConfigParams`) |
| Smart-404 snippet generation + install | `src/features/eds/services/pdp404HandlerPublisher.ts` |
| Pipeline integration (the step that vendors into delayed.js) | `src/features/eds/services/edsPipeline.ts` (Step 7, after Library Publish) |
| Settings | `package.json` (`demoBuilder.byom.enabled`, `demoBuilder.byom.overlayUrl`) |

---

## Cross-references

- **Decision rationale**: [ADR-005: BYOM PDP Routing via Shared Overlay + Smart 404](adr/005-byom-pdp-routing.md)
- **Empirical research**: `.rptc/research/multitenant-prerender-evaluation/` (full doc + runtime-validation addendum + auth-findings addendum)
- **Memory entries**:
  - `project-byom-pdp-routing` — the two-repo model summary
  - `catalog-service-sku-case-insensitive` — load-bearing case-handling dependency
  - `reference-commerce-prerender-unfit` — why Adobe Prerender was rejected
- **Sister architecture docs**:
  - `eds-content-separation.md` — the broader two-repo content/code split
  - `eds-backend-configuration.md` — how `config.json` gets generated and published
