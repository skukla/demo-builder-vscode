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
