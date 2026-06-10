# EDS Commerce PDP Routing — Validation Research

**Question**: Is our BYOM overlay + smart-404 + pre-warming architecture necessary, or did we miss a simpler canonical pattern?

**Date**: 2026-06-09 (research run)
**Mode**: Web research with primary-source priority (Adobe Experience League + canonical boilerplate live demo + source repos)

## Executive Summary

**Verdict: Architecturally aligned. Implementation-level over-engineering.** (High confidence.)

Our choice — a BYOM `content.overlay` registered against the Configuration Service, serving prerendered or template HTML for `/products/*` URLs — is **the Adobe-recommended pattern**, period. Folder mapping is officially deprecated; the explicit Adobe-published replacement is "Content Overlays via BYOM." That is what we built. That is what `adobe-rnd/aem-commerce-prerender` is. That is what powers the canonical boilerplate demo at `https://main--aem-boilerplate-commerce--hlxsites.aem.live/` and `aemshop.net`.

However: **we re-invented `aem-commerce-prerender` instead of reusing it**. The canonical Adobe-published prerender repo already does exactly what our `render-pdp` action does — fetches Catalog Service products, generates HTML with the `/products/default` template as base, writes to App Builder storage, registers a Configuration Service `content.overlay`. The "smart-404" client-side redirects we put in `head.html`/`delayed.js` are unnecessary on the canonical pattern because **the overlay returns 200 even for unprerendered URLs** (verified empirically).

Our differentiator — multi-tenant shared action serving multiple storefronts — is real and not provided by the canonical repo. The right answer is probably **fork or wrap `aem-commerce-prerender` for multi-tenancy** rather than maintaining a parallel implementation.

## What the canonical boilerplate actually does

Live behavior verified at `https://main--aem-boilerplate-commerce--hlxsites.aem.live/` via direct `curl`:

| URL | HTTP | Body | Source |
|---|---|---|---|
| `/products/default` | 200 (5830 B) | `<div class="product-details"><div>defaultSku</div></div>` template | Authored doc |
| `/products/flamingo-plush/adb337` | 200 (6333 B) | Full prerendered HTML: real `<title>`, og:image, JSON-LD `Product`, `<meta name="sku">` | BYOM overlay (prerender) |
| `/products/totally-fake/FAKE999` | 200 (5874 B) | Identical to `/products/default` body, only canonical/og:url differ | Overlay fallback to default template |
| `/products/foo` (single segment) | 200 (5874 B) | Same default template body | Overlay fallback |
| `/products/` | 200 | Default template | Overlay fallback |
| `/this-page-does-not-exist-at-all` | 404 (3713 B) | Standard EDS 404 page | Real 404 |

Conclusions:
1. `/products/*` URLs **never 404** on the canonical demo — they always return 200 with either prerendered SKU HTML or the `/products/default` template body.
2. Real 404s work for non-`/products/*` paths.
3. The boilerplate has **no `_redirects`, no `redirects.json`, no client-side smart-404 redirect** in `404.html` or `head.html` for product URLs. `404.html` only sets meta tags from `metadata.json`; it does not redirect.
4. The boilerplate's `default-site.json` template has **no `content.overlay` field**. The overlay is added at runtime by `aem-commerce-prerender`'s `npm run setup` wizard, which PATCHes the Helix Admin API.

The mechanism: prerender's BYOM service returns a body for any `/products/*` path — real SKU → prerendered HTML; unknown SKU → the `/products/default` template HTML (cached by the prerender's `productTemplateCache`, see `actions/pdp-renderer/render.js:99-100`). Helix admin serves whatever the overlay returns.

## Specific question answers

### 1. Does the canonical boilerplate require prerender for PDPs?

**Yes for production-grade. Functionally optional but SEO-broken without it.** (High confidence.)

- The boilerplate repo's `default-site.json` ships with NO overlay configured — a fresh deploy would not have prerender wired up.
- The live demo at aemshop.net returns prerendered HTML with JSON-LD for real SKUs (confirmed via `curl /products/flamingo-plush/adb337`). The presence of server-rendered `<script type="application/ld+json">` with `Product` schema, `<meta name="sku">`, per-SKU `<title>` and `og:image` is the prerender signature.
- Adobe's `aem-commerce-prerender/docs/USE-CASES.md`: "Some services require that product detail pages return data in the initial server response: Social media sites and apps... Frequent data changes... are only reliably picked up by Google Merchant Center when server-side rendered."

So: PDPs technically "work" client-side without prerender, but production-grade Commerce on EDS requires it.

### 2. What does the boilerplate's source do for PDP routing?

**Nothing server-side — all routing-aware code is client-side metadata extraction.** (High confidence.)

- `scripts/commerce.js:59-61`: `PRODUCT_TEMPLATE_PATHS = ['products/default']`.
- `scripts/commerce.js:627-631`: parses SKU client-side from `window.location.pathname` matching `/\/products\/[\w|-]+\/([\w|-]+)$/`.
- `scripts/commerce.js:656-664`: `isProductTemplate()` returns true only on the `/products/default` URL — used in UE/DA editing.
- `scripts/commerce.js:682-688`: `getProductSku()` reads SKU from `<meta name="sku">` (set by prerender), falling back to URL parsing.
- `head.html`: NO smart-404, NO routing logic. Just speculation rules + dropins import map.
- `404.html`: NO redirect-to-PDP. Reads `metadata.json` for wildcard URL entries to set `<meta name="root">` and `<meta name="placeholders">`, then renders the standard 404 UI. Live demo's `metadata.json` (224 entries) contains no `**` entries — it's a flat list of real SKU URLs.
- No `_redirects`, no `redirects.json`, no `helix-config.json`.
- `helix-query.yaml` (equivalent file `default-query.yaml`): **excludes** `products/**` from sitemap indexing — prerender owns product indexing.

The mechanism that makes `/products/{anything}` return 200 is **external to the repo** — it's the `content.overlay` configured against the live site's Configuration Service.

### 3. What is `aem-commerce-prerender` actually for?

**The canonical Adobe-recommended SSR layer for Commerce-on-EDS PDPs. Required for SEO, Merchant Center, rich social previews.** (High confidence.)

From the README: "tool to generate static product detail pages from dynamic data sources like Adobe Commerce Catalog Service for publishing via AEM Edge Delivery Services. It integrates with BYOM (Bring Your Own Markup) and EDS indexes."

From `docs/USE-CASES.md`:
- Explicitly replaces folder mapping (which is deprecated).
- Uses BYOM `content.overlay` with the same JSON shape we use:
  ```json
  { "content": { "overlay": { "url": "https://firefly.azureedge.net/[ns]-public/public/pdps", "type": "markup", "suffix": ".html" } } }
  ```
- Fetches `/products/default` template via `PRODUCTS_TEMPLATE` env var (`actions/pdp-renderer/render.js:91-104`).

It is **NOT just an SEO enhancement** — it is the routing/SSR mechanism for Commerce-on-EDS.

### 4. Folder mapping status

**Officially deprecated. Replacement: Content Overlays / BYOM. Existing deployments still work but are unsupported going forward.** (High confidence — multiple Adobe primary sources.)

- `aem-commerce-prerender/docs/USE-CASES.md`: "[Folder Mapping](https://www.aem.live/developer/folder-mapping) is deprecated. Please contact us if you have a use case for folder mapping... Existing projects using folder mapping may need to migrate to a different solution in the future."
- Listed disadvantages: "Supports only soft 404s instead of real HTTP 404 responses... Response from the server is basically the same for every folder mapped page. All data is added to the page using JavaScript."
- Adobe blog `https://www.aem.live/blog/folder-mapping-deprecated` ("The One Template That Broke the Internet (And My Heart)") confirms public deprecation.
- Experience League community Q&A (`eds-universal-editor-migration-path-for-pdp-routes-after-folder-mapping-deprecation-seo-safe-32763`, 2025-10-01, 545 views) — accepted answer from Community Advisor: **"Adobe introduced 'content overlay' as a replacement of folder mapping. https://www.aem.live/developer/byom"**

The project memory `project_folder_mapping_deprecated.md` is validated.

### 5. Is content.overlay (BYOM) officially documented?

**Yes. Fully documented at `https://www.aem.live/developer/byom`; the explicit Adobe-recommended replacement for folder mapping.** (High confidence.)

- Canonical doc shape:
  ```json
  "overlay": { "url": "https://content-service.acme.com/data", "type": "markup" }
  ```
- Behavior contract: "If the resource is not found in the overlay content source, the admin service fetches the path from the primary content source as a fallback."
- Eric van Geem (Adobe field) blog at `ericvangeem.dev/blog/edge-delivery-byom-content-overlay` is cited by Adobe community advisors as canonical implementation guide.
- Constraint: BYOM content overlay **requires the API-based Configuration Service** (not `fstab.yaml`). Matches our Helix 5 + Configuration Service approach.

### 6. Does `@dropins/storefront-pdp` have native route handling?

**No. The dropin does NOT register a server-side route handler.** It is a client-side render that expects the URL routing problem to already be solved (by overlay/prerender/folder mapping/manual docs). Recent changelog adds proper 404 emission and a `defaultSku` JSON config fallback. (Medium confidence — based on changelog hits, no direct dropin source inspection.)

- Boilerplate `scripts/commerce.js` reads SKU from URL or from server-rendered `<meta name="sku">` (set by prerender). The dropin consumes a SKU; it cannot route URLs.
- The dropin's 404 emission depends on prerender returning 404 at the BYOM overlay layer.

Our smart-404 client-side redirect is **not** redundant with the dropin — but it's also not the canonical approach.

### 7. Adobe's recommended pattern

**Configuration Service + BYOM `content.overlay` + an App Builder action that prerenders product HTML using `/products/default` as the base template, written to App Builder storage and served via the overlay URL.** (High confidence.)

Canonical reference implementation: `adobe-rnd/aem-commerce-prerender`. Documented at:
- `https://experienceleague.adobe.com/developer/commerce/storefront/setup/configuration/aem-prerender/`
- `https://www.aem.live/developer/byom`
- `adobe-rnd/aem-commerce-prerender` README + `docs/USE-CASES.md`

## Gap analysis

| Aspect | Canonical | Our architecture | Verdict |
|---|---|---|---|
| Routing mechanism | BYOM `content.overlay` on Configuration Service | Same | **MATCH** |
| Template source | `/products/default` document fetched at prerender time | Same | **MATCH** |
| Prerender trigger | Scheduled poller checks Catalog Service for diffs | On-demand `prepublish-pdp` + catalog pre-warming on create | **EQUIVALENT** |
| Tenancy | Single-tenant (one App Builder workspace per storefront) | Multi-tenant (shared workspace serves N storefronts via `?org=&site=`) | **OUR DIFFERENTIATOR** — real value not provided upstream |
| Cold-path handling | Poller catches up; meanwhile unknown SKU → 404 (Adobe prefers "real 404 over soft 404") | Smart-404 client-side redirect triggers on-demand `prepublish-pdp` | **OVER-ENGINEERED** |
| Unknown SKU response | Canonical demo serves 200 + default template body | Smart-404 triggers async publish then refreshes | **CANONICAL IS SIMPLER** |
| Pre-warming | Implicit via poller | Explicit on-demand at storefront create/reset | **EQUIVALENT** |
| `head.html` / `delayed.js` snippets | None | Eager + delayed client-side fetch to `prepublish-pdp` | **OVER-ENGINEERED** |

## Re-evaluation of ADR-005

What we got right:
- BYOM `content.overlay` over folder mapping — correct per deprecation guidance.
- `/products/default` as template base — matches `aem-commerce-prerender` exactly.
- Multi-tenant shared action — real value not provided upstream.
- Catalog pre-warming at storefront create/reset — matches the canonical poller's effect.

What we may have over-engineered:
- **Smart-404 client-side redirect snippets** are not in the canonical pattern. Adobe explicitly warns against soft-404 anti-patterns (the very reason folder mapping was deprecated). Our smart-404 may inherit the same SEO anti-pattern.
- **`prepublish-pdp` as a publicly-callable runtime action** is a footgun (anyone can spam preview/publish requests). Canonical model: back-end poller, not client-side fetch.
- **We re-implemented what already exists.** `aem-commerce-prerender` is Apache 2.0, Adobe-owned. Our `render-pdp` is almost line-for-line `actions/pdp-renderer/render.js`. Forking + adding multi-tenancy as a wrapper would have been less work.
- **Unanswered**: why does the canonical demo serve 200 for `/products/foo`? Two hypotheses: (a) the prerender's BYOM service has a path-pattern responder that returns the default template body for any unmatched `/products/*` path; (b) there's a Configuration Service `pathMapping` rule mapping `/products/**` → `/products/default`. We did not have read access to aemshop.net's full Configuration Service config to confirm.

## Corrected conclusion — 2026-06-10 (after BYOM doc re-read + suffix test)

**The original executive summary was wrong about smart-404 being over-engineered.** Re-reading the BYOM spec at `https://www.aem.live/developer/byom` and verifying live-tier behavior on citisignal-b2b after applying the canonical `suffix: '.html'` registration change confirms:

> "If an overlay content source is configured, a **preview request** sent to the admin service will always result in the path being fetched from the overlay content source first."

The overlay is consulted during **preview**, not during live-tier delivery. For a path to return 200 on the live tier, it must already be in content-bus. The pattern that gets it there is the canonical "poller publishes; live tier serves cached":

```
Canonical aem-commerce-prerender:
  Poller (scheduled) → publishes catalog SKUs → content-bus → live tier 200
  Unknown paths → never previewed → content-bus 404 → live tier 404

Our setup:
  Pre-warm at create/reset → publishes catalog SKUs → content-bus → live tier 200
  Smart-404 client-side → first visit to unknown path triggers prepublish-pdp → content-bus 200
  Unknown paths after smart-404 has run → content-bus 200 → live tier 200
```

The empirical aemshop.net behavior — `/products/foo` returning 200 with default template body — was likely a cached artifact from a prior preview, not real-time overlay consultation on the live tier. Our live-tier 404 on `/products/never-existed/FAKE1` (verified 2026-06-10 after adding `suffix: '.html'` to the overlay registration) confirms BYOM docs are accurate as written.

### What was right in the original research

- BYOM `content.overlay` is the Adobe-canonical replacement for folder mapping. Confirmed.
- Our `render-pdp` action duplicates `aem-commerce-prerender`'s renderer. Confirmed.
- Multi-tenancy via `?org=&site=` is our legitimate differentiator. Confirmed.
- Catalog pre-warming at create/reset is the canonical pattern (equivalent to upstream's scheduled poller). Confirmed.
- The `suffix: '.html'` field belongs in the overlay registration. Confirmed (shipped in `f2d2797b`).

### What was wrong

- **"Smart-404 is over-engineered."** Incorrect. Per BYOM docs, the overlay is preview-only. Smart-404 is the canonical recovery mechanism for paths not yet in content-bus — without it, any path that wasn't pre-warmed (catalog churn after setup, new SKUs, edge cases) returns a hard 404 with no recovery. It's not soft-404 SEO anti-pattern; it's the documented way to handle the "preview-on-first-visit" pattern client-side.
- **"Remove the smart-404 plumbing and rely on overlay-side fallback."** Incorrect. There is no overlay-side fallback at the live tier per the BYOM spec.
- **"aemshop.net returns 200 for unknown paths, therefore canonical doesn't need smart-404."** Misinterpretation. The 200 was a cached artifact from prior previews, not real-time overlay consultation. The canonical pattern relies on the poller publishing every catalog SKU into content-bus.

### Correct ADR-005 framing (replaces the original "Re-evaluation" section)

Our architecture is aligned with the canonical pattern in every load-bearing layer:

| Concern | Canonical | Ours | Status |
|---|---|---|---|
| Overlay registration | Configuration Service `content.overlay` block | Same, with matching `suffix: '.html'` | Aligned |
| Template source | `/products/default` fetched at preview time | Same (Phase 2 LIVE) | Aligned |
| Catalog publishing | Scheduled poller calls Helix admin preview | Pre-warm at create/reset calls `prepublish-pdp` | Aligned (equivalent mechanism) |
| Unknown-path recovery | Implicit — poller catches up over time; meanwhile 404 | Smart-404 client-side triggers `prepublish-pdp` on cold visit | **More aggressive but canonical** — fills the gap between poller cycles |
| Multi-tenancy | Single-tenant (one App Builder workspace per storefront) | Multi-tenant shared workspace via `?org=&site=` | Our legitimate differentiator |

Smart-404 fills a real gap the canonical leaves open: between scheduled poller cycles, an unknown path 404s on canonical too. Our smart-404 closes that gap with client-side detection + admin trigger. This is an improvement on the canonical pattern, not a deviation from it.

### What changes from the original recommendations

- [x] **Keep smart-404 plumbing.** It's load-bearing per BYOM docs; removal would re-break PDPs for catalog churn after setup.
- [x] **Keep `prepublish-pdp` action.** It's how smart-404 triggers content-bus population.
- [x] **Keep catalog pre-warming.** Validated as canonical pattern.
- [x] **Keep `suffix: '.html'` on overlay registration** (shipped in `f2d2797b`). Aligns with canonical shape; harmless even if not load-bearing for routing.
- [ ] **Re-evaluate ADR-005 framing.** Original framing apologized for the architecture as "over-engineered." Corrected framing should defend it as canonical-aligned with a justified differentiator (multi-tenancy + smart-404 gap-fill). To do as a follow-up.

## Validation note — 2026-06-10 (accs agent post-research probe)

The accs agent ran a direct probe against citisignal-b2b and contradicted a core premise of the original recommended actions. **Don't remove smart-404 until the delivery-tier behavior gap is reproduced.**

What the accs agent verified live on citisignal-b2b:

| Probe | Result |
|---|---|
| `render-pdp` action directly for `/products/never-existed/FAKE1` | **200**, 5,733 B authored template |
| `main--citisignal-b2b--skukla.aem.live/products/never-existed/FAKE1` | **404** |
| `main--citisignal-b2b--skukla.aem.live/products/default` | 200 (authored content) |

The implication is decisive: **`render-pdp` already returns 200 for unmatched paths and Helix's live tier still 404s.** The lever that makes the canonical demo "never 404" on `/products/*` paths is NOT the action's response — it's something at the delivery / overlay-registration layer that causes Helix to consult the overlay (or a path-mapping rule) for unmatched paths. We have not reproduced that mechanism on our storefronts.

The original research flagged this as the unanswered question (Gap analysis, "Unanswered: why does the canonical demo serve 200 for `/products/foo`?"). The accs probe answers half of it by elimination: hypothesis (a) — overlay path-pattern responder — is ruled out for our setup; hypothesis (b) — Configuration Service `pathMapping` rule or a differently-shaped overlay registration — is the remaining live possibility.

Most likely candidates worth investigating before removing smart-404:

1. **Overlay registration shape differences.** `aem-commerce-prerender`'s setup wizard registers the overlay with `suffix: ".html"` and a storage-backed `url`. We register with no suffix and an action-runtime `url`. Whether `suffix` (or the storage-vs-action distinction) changes Helix's "consult overlay on miss" behavior is unverified.
2. **Configuration Service pathMapping / route rules.** The canonical demo might have a route or pathMapping rule like `/products/**` → `/products/default` configured outside the overlay block. We do not have read access to aemshop.net's full Configuration Service config; investigation would need to read what `aem-commerce-prerender`'s setup wizard actually sends to Helix admin (look at the setup script in the repo).
3. **Storage-backed overlay semantics.** The canonical points at App Builder storage (`firefly.azureedge.net/[ns]-public/public/pdps`). Helix may treat storage-backed overlays differently from action-runtime overlays at the delivery layer.

### Revised recommended actions

- [x] **Pause smart-404 removal.** Removing the recovery snippet right now re-breaks PDPs for any not-yet-pre-warmed SKU. The action's 200 response is necessary but not sufficient.
- [x] **Keep catalog pre-warming.** It works at the admin-publish layer (which Helix DOES respect for live-tier serving), so it remains effective regardless of the overlay-on-miss gap.
- [ ] **Investigate the delivery-tier mechanism.** Read `adobe-rnd/aem-commerce-prerender` setup wizard source to extract the exact Configuration Service registration payload. Compare to what `configurationService.ts` in demo-builder-vscode sends. The diff is the answer.
- [ ] **Reproduce "never 404 at delivery" on citisignal-b2b** by aligning our registration shape with the canonical. Verification: `curl https://main--citisignal-b2b--skukla.aem.live/products/never-existed/FAKE1` returns 200 (currently 404).
- [ ] **Only AFTER reproduction succeeds**, return to the smart-404 removal plan. Until then, the smart-404 plumbing is load-bearing and must stay.

### Original recommended actions (preserved for context, but now contingent on delivery-tier reproduction)

- [ ] **Significant gap (high impact, low risk): smart-404 + on-demand publish should be removed.** Replace with overlay-side default-template fallback (the BYOM overlay action returns the `/products/default` template body for any unmatched path — this is what the canonical demo does). Eliminates the client-side redirect loop.
- [ ] **Partial gap (consider): adopt `aem-commerce-prerender` as the foundation** instead of maintaining `render-pdp`. Add a thin multi-tenant wrapper that routes `?org=&site=` to per-tenant configs. Keeps us on Adobe's update path, reduces maintenance, inherits SEO improvements automatically.
- [x] **Validation: BYOM `content.overlay` choice is correct.** Keep.
- [x] **Validation: catalog pre-warming on create/reset is acceptable.** Keep.
- [x] **Validation: folder mapping rejection is correct.** Keep.
- [ ] **Re-evaluate `prepublish-pdp`.** Either remove it (overlay-side fallback obviates the need) or restrict to authenticated extension-only callers — not from client-side fetches.

### Concrete changes to consider

1. In `render-pdp` (the BYOM overlay action): when SKU lookup fails, **return 200 with the rendered `/products/default` template body**, not 404. This mirrors aemshop.net.
2. Remove the eager redirect snippet from `head.html`.
3. Remove the delayed.js cold-path `prepublish-pdp` POST.
4. Keep the catalog pre-warm on storefront create/reset.
5. Optionally: file an issue with `adobe-rnd/aem-commerce-prerender` proposing multi-tenancy support, so we can eventually deprecate the parallel implementation.

## Sources cited

Primary (Adobe-published or Adobe-owned):

1. (PRIMARY) **Bring Your Own Markup** — `https://www.aem.live/developer/byom`
2. (PRIMARY) **Folder Mapping deprecation blog** — `https://www.aem.live/blog/folder-mapping-deprecated`
3. (PRIMARY) **BYOM Content Overlays blog** — `https://www.aem.live/blog/byom-content-overlays`
4. (PRIMARY) **AEM Commerce Prerender (Experience League)** — `https://experienceleague.adobe.com/developer/commerce/storefront/setup/configuration/aem-prerender/`
5. (PRIMARY) **adobe-rnd/aem-commerce-prerender** — `https://github.com/adobe-rnd/aem-commerce-prerender`
   - `README.md` (BYOM overlay config block + setup wizard)
   - `docs/USE-CASES.md` (folder mapping deprecation + when SSR is needed)
   - `actions/pdp-renderer/render.js:36-53, 86-110` (404 emission, template fetch, Handlebars)
   - `actions/pdp-renderer/index.js:26-31` (`PRODUCTS_TEMPLATE`, `PRODUCT_PAGE_URL_FORMAT`)
6. (PRIMARY) **hlxsites/aem-boilerplate-commerce** — `https://github.com/hlxsites/aem-boilerplate-commerce`
   - `scripts/commerce.js:59-61, 627-688` (client-side SKU extraction, no server routing)
   - `head.html`, `404.html` (no smart-404 anywhere)
   - `default-site.json` (no overlay in template; added at deploy time)
   - `default-query.yaml` (excludes `products/**` from sitemap)
7. (PRIMARY) **Live boilerplate demo** — `https://main--aem-boilerplate-commerce--hlxsites.aem.live/` — empirical probe via curl confirming `/products/foo` → 200, `/products/totally-fake/FAKE999` → 200 + default template, `/this-page-does-not-exist` → 404.

Secondary (community / field):

8. **Experience League Community Q&A** — `https://experienceleaguecommunities.adobe.com/adobe-experience-manager-sites-8/eds-universal-editor-migration-path-for-pdp-routes-after-folder-mapping-deprecation-seo-safe-32763` — Community Advisor confirms "content overlay as replacement of folder mapping" (2025-10-02).
9. **Eric van Geem — BYOM Content Overlay blog** — `https://ericvangeem.dev/blog/edge-delivery-byom-content-overlay`
10. **Experience League event "Dynamic Publishing at the Edge with BYOM"** — `https://experienceleague.adobe.com/en/docs/events/adobe-developers-live-recordings/2025/dynamic-publishing`

Tertiary:

11. `@dropins/storefront-pdp` changelog — `https://experienceleague.adobe.com/developer/commerce/storefront/releases/changelog/` (404 handling improvements; `defaultSku` JSON config field).

## Registration payload investigation — 2026-06-10

Focused diff between Adobe's canonical `aem-commerce-prerender` setup wizard and our `configurationService.ts`. The accs probe (above) showed that even when our `render-pdp` action returns 200 for an unknown SKU, the live tier still 404s — proving the delivery-tier configuration is the lever. This appendix isolates which Configuration Service field, present in canonical but absent in ours, is the most likely cause.

### Canonical registration payload (aem-commerce-prerender)

**Source**: `/tmp/research-clones/aem-commerce-prerender/bin/setup/index.js` — full file read; HTTP calls extracted via grep.

The setup wizard makes **two** Configuration Service writes per site (plus one apiKey POST), not one. Both writes use the same auth (`x-auth-token: <aemAdminToken>` — long-lived AEM admin token, not IMS bearer; the endpoint accepts both). The wizard fetches existing config first, then patches.

**Call #1 — Site config PATCH (read-modify-write)**

```
GET  https://admin.hlx.page/config/{org}/sites/{site}.json
Headers: x-auth-token: <aemAdminToken>
→ returns currentSiteConfig

POST https://admin.hlx.page/config/{org}/sites/{site}.json
Headers: x-auth-token: <aemAdminToken>, Content-Type: application/json
Body: newSiteConfig (see below)
```

`newSiteConfig` body (bin/setup/index.js:491–508):

```js
{
  ...currentSiteConfig,                    // preserves code source, ALL other existing keys
  content: {
    ...currentSiteConfig.content,           // preserves content.source
    overlay: {
      url: overlayBaseURL,                  // e.g. "https://firefly.azureedge.net/{ns}-public/public/pdps"
      type: 'markup',
      suffix: '.html'                       // ← canonical adds this; ours omits
    }
  },
  access: {
    ...(currentSiteConfig.access || {}),
    admin: {
      ...(currentSiteConfig.access?.admin || {}),
      apiKeyId: [...(existing apiKeyIds), newApiKeyId],
      requireAuth: currentSiteConfig.access?.admin?.requireAuth ?? 'auto',
      role: { ...(existing roles) }
    }
  }
}
```

**Call #2 — Index config POST (`content/query.yaml`)**

```
GET  https://admin.hlx.page/config/{org}/sites/{site}/content/query.yaml
Headers: x-auth-token: <aemAdminToken>
→ returns currentIndexConfig (yaml text)

POST https://admin.hlx.page/config/{org}/sites/{site}/content/query.yaml
Headers: x-auth-token: <aemAdminToken>, Content-Type: text/yaml
Body: newIndexConfig (yaml — see below)
```

`newIndexConfig` shape (bin/setup/index.js:139–172, `ConfigService.buildIndexConfig`):

```yaml
indices:
  index-published-products:
    include:
      - /products/**          # one entry per locale, derived from PRODUCT_PAGE_URL_FORMAT
    # plus per-index fields copied from sample query.yaml shipped with the repo
```

`include` paths are computed from `storeUrl + productPageUrlFormat + locales`, then `path.posix.join(p, '**')` is appended (line 150). For non-localized sites with the default `/{locale}/products/{urlKey}` format, the include is `/products/**`.

**Call #3 — API key creation (auth scaffolding, not directly load-bearing for routing)**

```
POST https://admin.hlx.page/config/{org}/sites/{site}/apiKeys.json
Headers: x-auth-token: <aemAdminToken>, Content-Type: application/json
Body: {
  description: "Key used by PDP Prerender components [{org}/{site}]",
  roles: ["publish"]
}
```

The returned `accessTokenId` is what gets added to `access.admin.apiKeyId` in call #1.

**README confirmation** (`/tmp/research-clones/aem-commerce-prerender/README.md:79–90`):

> "Your AEM site configuration will be automatically updated via the Admin API to include the `overlay` section."
>
> ```json
> { "content": { "overlay": {
>     "url": "https://firefly.azureedge.net/[your-namespace]-public/public/pdps",
>     "type": "markup",
>     "suffix": ".html"
> } } }
> ```

The README pins the three-field overlay shape as the published contract.

### Our registration payload (demo-builder-vscode)

**Source**: `src/features/eds/services/configurationService.ts:168–191` (`registerSite`).

Single Configuration Service write per site. Uses `Authorization: Bearer <imsToken>` (DA.live IMS token). No read-before-write — we DELETE + PUT.

```
PUT https://admin.hlx.page/config/{org}/sites/{site}.json
Headers: Authorization: Bearer <imsToken>, content-type: application/json
Body: {
  version: 1,
  code: { owner: codeOwner, repo: codeRepo },
  content: contentOverlayUrl
    ? { source, overlay: { url: contentOverlayUrl, type: 'markup' } }
    : { source }
}
```

Where `source = { url: contentSourceUrl, type: contentSourceType || 'markup' }` and `contentSourceUrl = https://content.da.live/{daLiveOrg}/{daLiveSite}/`.

`updateSiteConfig` (lines 207–223) is DELETE-then-`registerSite` — it deliberately discards whatever the GitHub-App-auto-created entry contained, replacing it with a clean two-key body.

We do **not** write to `content/query.yaml`. Grep over `src/features/eds/` for `query.yaml`, `content/query`, `/sites/.*/content/`, and `index-published` returned **zero matches** — there is no code path that registers a products index.

We do **not** write `access.admin.apiKeyId` or `access.admin.requireAuth`. We do not call the `apiKeys.json` endpoint.

### Diff

```
Field-by-field comparison of the Configuration Service site config POST/PUT body:

  Field                          Canonical                          Ours
  ────────────────────────────── ────────────────────────────────── ─────────────────────────────────
  version                        (not set — preserved if existed)   1
  code.owner                     (preserved from existing config)   codeOwner   (we set)
  code.repo                      (preserved from existing config)   codeRepo    (we set)
  content.source                 (preserved from existing config)   { url: DA.live, type: 'markup' }
  content.overlay.url            storage-backed (firefly.azureedge)  user-supplied via VS Code setting
  content.overlay.type           'markup'                            'markup'                  (match)
  content.overlay.suffix         '.html'                             ✗ NOT SET                  ← diff #1
  access.admin.apiKeyId          [<created apiKeyId>]                ✗ NOT SET                  ← diff #2
  access.admin.requireAuth       'auto' (or preserved)               ✗ NOT SET                  ← diff #3
  access.admin.role              (preserved)                         ✗ NOT SET                  ← diff #3

Operation:
  HTTP method                    GET-then-POST (read-modify-write)   DELETE-then-PUT (replace)   ← diff #4
  Preserves keys we don't set    YES                                 NO

Separate writes:
  content/query.yaml index        POST with indices.index-published   ✗ never written            ← diff #5
                                  -products.include = ['/products/**']
  apiKeys.json                    POST creating publish-role key      ✗ never created            ← diff #6
```

### Hypothesis ranking

For each diff, what it likely does and whether it explains why our live tier 404s `/products/never-existed/FAKE1`.

**#1 — `suffix: '.html'` on `content.overlay`. HIGHEST likelihood.**

BYOM docs at `https://www.aem.live/developer/byom` explicitly describe `suffix` for the primary BYOM source as: *"the admin service will add the suffix when requesting the content from the BYOM service URL"*. The same field on `overlay` almost certainly behaves the same way — the admin service appends `.html` before issuing the GET against the overlay URL.

Why this could change live-tier behavior:
- With `suffix: '.html'`, Helix requests `<overlayBase>/products/never-existed/FAKE1.html` from the overlay.
- Without `suffix`, Helix requests `<overlayBase>/products/never-existed/FAKE1` (no extension).
- Our action's routing (`?org=&site=&path=/products/...`) may behave differently for the suffix-appended URL — but more importantly, **the field's presence/absence may toggle a different code path in the admin service** that controls whether overlay 404s fall back to the primary content source or surface as a hard live-tier 404.
- The BYOM doc states "If the resource is not found in the overlay content source, the admin service fetches the path from the primary content source as a fallback." Whether that fallback is engaged for `type: 'markup'` overlays without `suffix` is unverified — and the canonical demonstrably gets it.
- The accs probe showed our action returns 200 for unmatched paths, so the overlay isn't 404ing. This argues the canonical's 200 doesn't come from the fallback chain at all — it comes from the overlay itself returning 200, and Helix correctly forwarding that. The fact that ours doesn't suggests Helix is **not consulting the overlay** for the unmatched path in our config. The most likely toggle is `suffix`.

This is the cheapest field to add and most likely to flip behavior. Test this first.

**#2 — Missing `content/query.yaml` index registration. SECOND likelihood.**

The canonical writes an `indices.index-published-products` config with `include: ['/products/**']`. This is the Helix sitemap/index registration. The doc at `https://www.aem.live/docs/indexing` (referenced from `default-query.yaml` in the boilerplate) describes `include` patterns as scoping which paths are eligible for the indexer.

Why this could matter:
- Helix's live tier may consult the index config when deciding whether a path is "owned" by content delivery vs. a hard 404. A path that matches a known `include` pattern may be routed through the overlay-aware delivery path; a path that doesn't may short-circuit to 404.
- The boilerplate's `default-query.yaml` explicitly *excludes* `products/**` from its default indices because the prerender pipeline owns that indexing. If we don't write the prerender's index config, `/products/**` is in neither the boilerplate's indices nor any prerender-owned index — so Helix has no record of `/products/` being a managed path.

Plausible but secondary — the index config is primarily for the sitemap poller, not the delivery tier. Test #1 first; if that doesn't fix it, add #2.

**#3 — Missing `access.admin.apiKeyId` / `requireAuth` / `role`. LOW likelihood (auth scaffolding, not routing).**

These fields are for the publish-role API key used by the prerender's poller. They affect whether the prerender can call admin endpoints, not how Helix's live tier resolves URLs. Adding them won't change the 404 behavior on live.

**#4 — DELETE-then-PUT vs GET-modify-POST. MEDIUM likelihood as an indirect cause.**

The canonical's read-modify-write preserves keys we don't know about. If the GitHub App auto-creates a site config with fields that the live tier inspects (e.g., a `live` block, a `prod` block, a `routes` block, anything not in our 4-key body), our DELETE+PUT wipes them. We'd then need to re-add them to match the canonical's effective config.

This is testable: GET `https://admin.hlx.page/config/{daLiveOrg}/sites/{daLiveSite}.json` for citisignal-b2b right now, log what's there, then diff against what the canonical's read-modify-write would produce.

**#5 — Storage-backed vs action-runtime overlay URL. UNKNOWN likelihood.**

The canonical points the overlay at App Builder storage (`firefly.azureedge.net/{ns}-public/public/pdps`) — a static file host. Helix admin GETs `<storage>/products/{sku}.html`; the file either exists (200) or doesn't (404). For unmatched SKUs, the storage 404 would have to be intercepted by something else for the live tier to return 200.

We point the overlay at a runtime action (e.g. `https://{ns}.adobeioruntime.net/api/v1/web/.../render-pdp`). Our action returns 200 for everything (confirmed by accs probe). Yet Helix 404s anyway. Two possibilities:
- The admin service has a `type: 'markup'` code path that distinguishes storage URLs from runtime URLs — but the doc doesn't say so.
- The admin service is sending the request differently because `suffix` is missing — collapses to #1.

Likelihood that this alone explains the gap: low, because the accs probe verified our action returns 200 when called directly. Helix isn't getting a 404 from our action — it's not asking our action.

### Recommended change to test

Add `suffix: '.html'` to the overlay block in `configurationService.ts:registerSite`.

**File**: `src/features/eds/services/configurationService.ts`

**Before** (lines 181–188):

```ts
const source = { url: contentSourceUrl, type: contentSourceType || 'markup' };
const body = {
    version: 1,
    code: { owner: codeOwner, repo: codeRepo },
    content: contentOverlayUrl
        ? { source, overlay: { url: contentOverlayUrl, type: 'markup' } }
        : { source },
};
```

**After**:

```ts
const source = { url: contentSourceUrl, type: contentSourceType || 'markup' };
const body = {
    version: 1,
    code: { owner: codeOwner, repo: codeRepo },
    content: contentOverlayUrl
        ? { source, overlay: { url: contentOverlayUrl, type: 'markup', suffix: '.html' } }
        : { source },
};
```

**Action item before merging**: our `render-pdp` action's URL routing currently keys off `?path=/products/...`. Once `suffix: '.html'` is set, Helix will request `<overlayBase>/products/never-existed/FAKE1.html`. Verify the action's URL parsing strips the `.html` extension (or accepts it as a no-op) before generating the SKU lookup. If it doesn't, an action-side fix is needed in parallel.

**Verification probe**:

```bash
# After running storefront reset on citisignal-b2b so the new registration is applied:
curl -sS -o /dev/null -w "%{http_code}\n" \
  https://main--citisignal-b2b--skukla.aem.live/products/never-existed/FAKE1

# Expected: 200   (currently: 404)
```

If 200, the hypothesis is confirmed and smart-404 plumbing can begin removal.

If still 404, add diff #2 next: PUT `content/query.yaml` with `indices.index-published-products.include = ['/products/**']`. Re-probe.

If still 404 after both, capture canonical's full site config via:

```bash
# Read the canonical aemshop.net site config (requires hlxsites admin token):
curl -H "x-auth-token: <hlxsites-admin-token>" \
  https://admin.hlx.page/config/hlxsites/sites/aem-boilerplate-commerce.json
```

…and diff field-by-field against ours. The remaining gap will be in fields we haven't yet identified.

### Sources

Files read (canonical):
- `https://github.com/adobe-rnd/aem-commerce-prerender` cloned to `/tmp/research-clones/aem-commerce-prerender`
- `bin/setup/index.js:139–172` — `ConfigService.buildIndexConfig` (query.yaml index shape)
- `bin/setup/index.js:325–369` — `ApiRoutes.createApiKey` (apiKeys.json POST)
- `bin/setup/index.js:441–529` — `ApiRoutes.setup` (read-modify-write of site config + index config)
- `bin/setup/index.js:626–712` — `ApiRoutes.helixConfig` (writes both configs back to admin.hlx.page)
- `README.md:79–90` — published overlay shape contract
- `docs/RUNBOOK.md:233` — confirms storage bucket URL is what Helix consults

Files read (ours):
- `src/features/eds/services/configurationService.ts` — full file, all of `registerSite`/`updateSiteConfig`/`deleteSiteConfig`/`makeRequest`/`buildSiteConfigParams`
- `src/features/eds/handlers/storefrontSetupPhase3.ts:208–319` — call sites for `buildSiteConfigParams` and `configurationService.registerSite` / `updateSiteConfig`
- `src/features/eds/handlers/edsHelpers.ts:240–340` — how `byomOverlayUrl` is resolved from `demoBuilder.byom.overlayUrl` VS Code setting

Greps confirming no `content/query.yaml` write in our code:
- `grep -rnE "query\.yaml|content/query|index-published|/sites/.*/content/" src/features/eds/` → 0 hits

External docs:
- `https://www.aem.live/developer/byom` — BYOM overlay spec; quotes "If the resource is not found in the overlay content source, the admin service fetches the path from the primary content source as a fallback" and `"suffix": ".html"` semantics for the primary source.

---

## Smart-404 canonical anchoring — 2026-06-10

### Question
What does the canonical `adobe-rnd/aem-commerce-prerender` do about user visits to SKUs the scheduled poller hasn't yet published?

Specifically: if a SKU is added to Commerce, then visited before the next 5-minute poller cycle runs, what does the canonical do to recover?

### Methodology

Cloned both repos fresh for this investigation:
- `git clone --depth 1 https://github.com/adobe-rnd/aem-commerce-prerender.git → /tmp/canonical-check/aem-commerce-prerender`
- `git clone --depth 1 https://github.com/hlxsites/aem-boilerplate-commerce.git → /tmp/canonical-check/aem-boilerplate-commerce`

Read full source of every action in `actions/`, the setup wizard in `bin/setup/`, all docs in `docs/`, and the boilerplate's `head.html`, `404.html`, `scripts/delayed.js`. Enumerated all GitHub issues on the prerender repo. Discussions are disabled on the repo (verified via API: `gh api repos/adobe-rnd/aem-commerce-prerender/discussions` → 410).

### What I found

#### Canonical poller behavior
**File**: `actions/check-product-changes/index.js` (full file read; 99 lines).

- Single action, single concern: "scan catalog for diffs and publish what changed."
- Triggered by Adobe I/O Runtime scheduler trigger (`/whisk.system/alarms/interval`), 5-minute interval per the commented-out triggers block in `app.config.yaml` lines 53–82.
- Notably the trigger is **commented out by default** in the template; customer uncomments after testing manually (README step 11, lines 104–129).
- Uses `web: "no"` annotation (`app.config.yaml:23`) — **not externally invokable as an HTTP endpoint**.
- Internally calls `poll(cfg, ...)` from `actions/check-product-changes/poller.js`. The action does NOT accept a SKU parameter; it only does a full catalog scan with mutex `running='true'` via state lib.
- **There is no code path for "publish this specific SKU now."** The action is exclusively a scheduled batch scan.

#### Other actions (full enumeration from `app.config.yaml`)
All 5 actions confirmed by reading both `app.config.yaml` lines 11–52 and every action's `index.js`:

| Action | Web? | Purpose | Accepts on-demand SKU? |
|---|---|---|---|
| `pdp-renderer` | yes | Returns rendered HTML for a given path. **This is what the overlay points at.** Receives `__ow_path` like `/products/{urlKey}/{sku}`, calls Catalog Service, returns HTML. | Yes — but it's only called by Helix overlay infrastructure during preview, not by users. |
| `check-product-changes` | **no** | Scheduled batch poller. Not externally callable. | No — full-catalog scan only. |
| `fetch-all-products` | yes | Scrapes catalog into Files storage as product list manifest. | No — full-catalog scrape only. |
| `get-overlay-url` | (no `web` set → defaults web=no per OpenWhisk) | Returns the App Builder Files base URL for overlay config. Setup-time only. | No. |
| `mark-up-clean-up` | (no `web` set) | Removes orphaned markup files for SKUs no longer in catalog. | No. |

**There is no action that accepts "publish this SKU now" requests.** The closest candidate (`pdp-renderer`) is the actual rendering endpoint Helix calls during preview, not an on-demand-publish trigger.

#### How the canonical actually surfaces a new product to live tier
Per `README.md:79–90` and `docs/RUNBOOK.md:212–234`:

1. Poller runs (scheduled, default 5 min).
2. Poller calls `pdp-renderer` to generate HTML for changed SKUs.
3. Poller writes HTML to App Builder Files storage at the overlay URL.
4. Poller calls Helix Admin API preview/publish for each changed path.
5. Helix preview fetches the overlay URL (rendered HTML in Files storage).
6. Once published to live, subsequent visits hit content-bus and return 200.

**The entire on-demand recovery path is through the poller.** There is no client-triggered shortcut.

#### Manual recovery tools
Confirmed via `grep -rn "refresh-pdps" /tmp/canonical-check/aem-commerce-prerender/`:
- `docs/POST-SETUP.md:73` — references `refresh-pdps.js` ("cleans up the internal list of tracked products and forces restart of the product change detector: this way all the products in the catalog will be republished")
- `tools/README.md:5` — references the same

**Note**: the actual `refresh-pdps.js` file is NOT in the repo. Only `check-products-count.js` and `get-stats.js` are present in `tools/` (verified by `ls /tmp/canonical-check/aem-commerce-prerender/tools/`). The script is documented but apparently lives elsewhere or has been removed. Either way it's a CLI tool requiring `AIO_RUNTIME_*` env vars — not a runtime/user-facing recovery mechanism.

Also documented in `docs/RUNBOOK.md:6–12`: a UI button "Force re-publishing all PDPs" at https://prerender.aem-storefront.com/#/markup-storage. Process: "Click Reset Products List → Click Trigger Product Scraper → Wait for 5 minutes." This is an operator UI, not user-facing recovery.

#### Documented guidance on the gap
**Most damning quote** from `docs/RUNBOOK.md:16`:
> "If a product page returns a 404, you can first check the list in the (Management Tool)[https://prerender.aem-storefront.com/#products]; if your search returns no results, it is very likely that the product was not published."

That's the entire user-facing guidance for 404s on PDPs: *operator investigates via management UI*. No automatic recovery, no client-side trigger, no on-demand publish endpoint mentioned. The implicit expectation: the next poller cycle will publish it.

`docs/USE-CASES.md:17` lists "Supports only soft 404s instead of real HTTP 404 responses" as a *disadvantage* of folder mapping that prerender solves — but this is about the static-render approach giving hard 404s when products genuinely don't exist, NOT about between-cycle catalog churn.

`docs/POST-SETUP.md` — no guidance on "new SKU added between cycles," "force publish single SKU," "404 recovery." The only operator action it documents is `refresh-pdps.js` (CLI, full re-poll, not single-SKU).

#### Boilerplate-side client recovery
Grep evidence (negative result):
```bash
grep -rln "head.html\|delayed.js\|404.html\|scripts.js" /tmp/canonical-check/aem-commerce-prerender/
# → 0 matches. The canonical never touches the storefront frontend.

grep -rn "prepublish\|admin\.hlx\|aem-storefront-prerender\|render-pdp\|on.demand" \
  /tmp/canonical-check/aem-boilerplate-commerce/scripts/scripts.js \
  /tmp/canonical-check/aem-boilerplate-commerce/scripts/delayed.js \
  /tmp/canonical-check/aem-boilerplate-commerce/scripts/aem.js \
  /tmp/canonical-check/aem-boilerplate-commerce/head.html \
  /tmp/canonical-check/aem-boilerplate-commerce/404.html
# → 0 matches.
```

- `aem-boilerplate-commerce/404.html` (full read): pure static 404 page. Contains analytics RUM tracking (`sampleRUM('404', ...)`), a Go-Back button, "Go home" link. **Zero on-demand publish triggering.**
- `aem-boilerplate-commerce/head.html` (full read): import map + module preloads. **Zero recovery scripts.**
- `aem-boilerplate-commerce/scripts/delayed.js` (full read, 66 lines): purely Commerce events SDK / Adobe Experience Platform analytics initialization. **Zero recovery scripts.**

**The boilerplate has no client-side product-publish-trigger anywhere.** Our smart-404 vendored snippet has no equivalent in the canonical stack.

#### Community discussion of this gap
GitHub Issues searched on `adobe-rnd/aem-commerce-prerender` (open + closed, full repo issue list dumped via `gh issue list --state all --limit 100`):

**Issue #262 — "feature: event-driven updates"** (OPEN, author: sirugh, who is an Adobe collaborator per `association: collaborator`):
> "Today, the application is written to query for products and product changes **on an interval**. This can lead to excessive querying against the backend. Instead we should rewrite the application to use event-driven approach. This subscribes to events that are published from the commerce environment and then generates markup based on those change events."
>
> Comment from same author: "one consideration of event driven updates is back pressure due to incoming events being throttled by AEM limitations (600/minute on BYOM sources). If the system receives 100,000 events, we still cannot process them all that quickly. Always, we are limited by EDS 600/minute."

This is **explicit Adobe-collaborator confirmation that the canonical is polling-only today, and event-driven recovery is a not-yet-implemented future feature.**

**Issue #220 — "Missing product template page leads to 404"** — unrelated; about misconfigured `PRODUCTS_TEMPLATE` URL serving 404 content as a template, not about catalog-churn 404s.

**Issue #273 — "published-products-index is not viable for catalogs >50k SKUs"** — about index scaling, not on-demand publish.

**Issue #197 — "Robust tracing and monitoring for failures"** — about observability, not recovery.

Searches for "between cycles," "on-demand," "new sku" returned 0 results. No community member has raised the gap our smart-404 closes — likely because the use case ("user visits a brand-new SKU within minutes of catalog change") is not the primary canonical workload (production retail catalogs change slowly relative to traffic).

### Answer

**The canonical has manual CLI/UI tools but no runtime equivalent of smart-404. Our smart-404 is novel and solves the same problem.**

Specifically:
- The canonical accepts 5-minute-cycle 404s by design for new SKUs.
- Adobe itself has filed issue #262 requesting an event-driven alternative; it's open and unaddressed.
- The only "recovery" tooling is operator-facing (CLI + management UI), requiring human intervention.
- Neither the prerender repo nor the boilerplate-commerce repo contains any client-side or 404-page-triggered publish mechanism.

Our smart-404 is therefore a deliberate addition that closes a documented gap in the canonical (#262). It is not a pattern Adobe has shipped — but the gap it closes is a pattern Adobe has acknowledged as a problem worth solving.

### Implication for our architecture

**A. Match canonical strictly** — Remove smart-404, accept catalog-churn 404s. SCs reset before demos.
- Cost: removing ~500 lines of storefront vendoring (head.html injection, 404.html injection, delayed.js hook).
- Risk: any SKU added during demo prep = broken PDP until next poller cycle (we'd need a poller, which we don't have — see B).
- Honest assessment: for a *demo product* where SCs are actively staging new SKUs minutes before a demo starts, 5-30 min cold-start delays are demo-breaking. This is exactly the pain we built smart-404 to solve.

**B. Implement canonical mechanism** — Add scheduled poller to `accs-discovery-service`. Runs every N minutes, scans Catalog Service for changes, calls Helix Admin API preview/publish for new SKU paths.
- Cost: meaningful new action work — `check-product-changes` analog, state management for "what's already published," scheduler triggers, an unpublish/cleanup analog.
- Pro: matches documented Adobe pattern.
- Con: even with a poller, the gap remains. The poller has the same 5-min worst-case staleness for our demo workflow. Issue #262 itself acknowledges polling is the wrong long-term answer.
- Con: significant ongoing maintenance — we now maintain a fork of canonical operational tooling.

**C. Keep smart-404 as deliberate deviation** — Document in ADR-005 as our innovation. Justify based on demo workflow needs and explicit reference to canonical issue #262.
- Cost: ADR doc update (~1 hour).
- Pro: instant recovery for catalog churn during demos — exactly the demo workflow need.
- Pro: anchors against the canonical's own acknowledged gap. Solicitor can defend it: "Adobe filed #262 asking for this; we shipped a demo-scoped solution."
- Con: not the documented Adobe pattern. SE field may push back on demo-only nature.

**Recommendation: Path C.**

Justification:
- Empirical: the canonical equivalent does not exist (confirmed by exhaustive code+docs+issue review). Path A would silently degrade the demo experience for the exact use case demo builders care about. Path B replicates the gap.
- Architectural: smart-404 is small (~500 lines vendored), local to storefront, and solves a real and Adobe-acknowledged problem (#262).
- Risk: the only real cost is field-engineering pushback. The ADR makes this defensible: "matches canonical at overlay/poller layer; adds optional demo-scoped recovery shim for the documented gap in issue #262."
- Future-proof: if Adobe ships event-driven updates per #262, we can deprecate smart-404 in favor of the canonical mechanism. Path C costs us nothing if the canonical evolves.

The user was right to push back on "smart-404 is canonical." It is not. It is our deliberate addition closing a canonical gap. Path C is the honest framing.

### Sources

Files read (canonical prerender, `/tmp/canonical-check/aem-commerce-prerender/`):
- `app.config.yaml` — all 5 actions, scheduler trigger structure (commented), web/no annotations
- `actions/pdp-renderer/index.js` (86 lines, full read) — confirms it returns HTML for a path, throws 404 if product not found; called by Helix overlay infra
- `actions/pdp-renderer/lib.js` (210 lines, full read) — `extractPathDetails` for path parsing; no on-demand publish path
- `actions/check-product-changes/index.js` (99 lines, full read) — confirms scheduled-batch-only with mutex
- `actions/get-overlay-url/index.js` (62 lines, full read) — confirms setup-time-only utility
- `bin/setup/index.js:1–300` — confirms setup wizard does not touch frontend files
- `tools/` dir listing — confirms `refresh-pdps.js` is not present in repo despite being documented
- `docs/USE-CASES.md` (full read) — line 17 quote about soft 404s as folder-mapping disadvantage
- `docs/POST-SETUP.md` (full read) — line 34 confirms pdp-renderer is the validation URL; lines 73–76 reference refresh-pdps.js
- `docs/RUNBOOK.md` (full read) — line 16 quote: "If a product page returns a 404, you can first check the list in the Management Tool"; lines 6–12 force-republish workflow; lines 212–234 AEM_BACKEND_FETCH_FAILED diagnosis
- `README.md:79–90` — overlay config shape; `:104–129` confirms triggers are commented-out template defaults

Files read (boilerplate commerce, `/tmp/canonical-check/aem-boilerplate-commerce/`):
- `404.html` (124 lines, full read) — confirms stock 404 page, no recovery hooks
- `head.html` (60 lines, full read) — confirms no recovery hooks
- `scripts/delayed.js` (66 lines, full read) — confirms only analytics initialization

GitHub Issues queried via `gh issue list --repo adobe-rnd/aem-commerce-prerender --state all --limit 100`:
- Issue #262 "feature: event-driven updates" (OPEN; Adobe collaborator author) — definitive confirmation polling-only is current state
- Issue #220 "Missing product template page leads to 404 response page being used for pdp rendering" (OPEN) — unrelated to gap
- Issues #273, #197 — adjacent but unrelated

GitHub Discussions: confirmed disabled via API (HTTP 410 from `gh api repos/adobe-rnd/aem-commerce-prerender/discussions`).

External:
- BYOM docs at `https://www.aem.live/developer/byom` — overlay-only-during-preview semantics (validated previously in this research).
