# Product pages: Helix-clean URLs, SKU carried in the page

Status: implemented 2026-10-06 (accs-discovery-service `e308872`, eds-demo-patches `8a60197`, extension commit alongside); cloud steps pending the owner's go. Decision: ADR-024.
Supersedes: ADR-007's `_HH` SKU encoding.

## The defect

Measured 2026-10-06 on `main--kukla-justrite--skukla.aem.live`, read-only:
every product whose SKU has only letters, digits and hyphens has a live page (39
of 39); every product whose SKU has anything else 404s (10 of 10, all with `_`).

- `encodeSkuForUrl` writes `_` as `_5f`; links and `prepublish-pdp` use that path.
- Helix's publish cleans the path (`sanitizePath`: lowercase, every run of
  non-`[a-z0-9]` → `-`). The page lands at `…/rre-805-5fwhite-5fon-5fcharcoalgray`.
- `prepublish-pdp` reports success, the browser is redirected to the `_5f` path,
  which does not exist → 404.
- At the path it did land on, the page cannot find its product: `-5f` does not
  decode back to the SKU.

ADR-007's evidence probed that the CDN ACCEPTS `_` in a request; it never
published a page at such a path. Its own case (SKUs with spaces → `_20`) fails
the same way.

## What Adobe's own tool does (`adobe-rnd/aem-commerce-prerender`)

- `getProductUrl` builds `/products/{urlKey}/{sku}` and passes it through
  `helixSharedStringLib.sanitizePath` — the URL already equals where Helix stores it.
- `pdp-renderer/templates/head.hbs` writes `<meta name="sku" content="{{sku}}">`.
- The storefront reads `getMetadata('sku') || getSkuFromUrl()` — the tag wins.

## The change

1. **render-pdp** (`accs-discovery-service`): when serving a product page, look
   the product up by its URL key (the first path segment; unique per product in
   Commerce) and add `<meta name="sku" content="…">` to the `/products/default`
   markup it already serves. Lookup happens at PUBLISH time, never on a
   shopper's page load. Unknown URL key → 404, as an unknown SKU does today.
2. **prepublish-pdp**: existence check by URL key instead of decoding the SKU;
   redirect target = the path Helix reports it published (`webPath`), not the
   path it was asked for.
3. **Links** (`eds-demo-patches`, three `code-patches.json`): `getProductLink`
   cleans the SKU segment exactly as Helix does. `encodeSkuForUrl` /
   `decodeSkuFromUrl` deleted; `getSkuFromUrl` stays only as the boilerplate's
   fallback.
4. **Extension**: `catalogPrewarmService` builds paths with the same cleaning;
   `pdpUrlEncoding.ts` becomes the one `sanitizePath`-equivalent rule, pinned by
   fixtures. Smart-404 snippet unchanged in shape.
5. **Records**: ADR-007 marked superseded by a new ADR; `eds-publish-and-config`
   rule 8 corrected (`_` is NOT path-safe on publish).

## Existing storefronts

Pages published under the old scheme sit at wrong paths. Reset already removes
generated product pages (EDS-26) and re-warms; Republish picks up the new
patches. JustRite: one product-page reset after the deploy.

## Cloud writes (each needs the owner's go)

- Redeploy `accs-discovery` actions (render-pdp, prepublish-pdp).
- Push `eds-demo-patches`.
- Republish / product-page reset on JustRite to verify.

## Verify

Live, after deploy: all 49 JustRite products answer 200 at their link path, and
each page's `meta[name=sku]` equals the Commerce SKU; the 10 underscore SKUs
render product data, not the template.
