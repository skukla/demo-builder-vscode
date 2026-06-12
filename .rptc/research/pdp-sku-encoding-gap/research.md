# Research: PDP blank page — lossy SKU→URL encoding (not a prerender/smart-404 break)

**Date:** 2026-06-12
**Mode:** A (codebase) + external repo verification
**Trigger:** Field report (friend's store `cmco-demo` / `jenhankib2bbodea`, owner `sayurihanki`). A PDP rendered a blank shell. She root-caused it to non-reversible SKU slugification in `scripts/commerce.js` and fixed it with a reversible encode/decode.
**Status:** Complete — shipped 2026-06-12. Decision of record: [ADR-007](../../../docs/architecture/adr/007-pdp-sku-url-encoding.md); plan: [`.rptc/plans/pdp-sku-reversible-encoding/overview.md`](../../plans/pdp-sku-reversible-encoding/overview.md).

> **Update (2026-06-12):** the Phase 0 gate flipped the encoding choice. This doc's original recommendation (`encodeURIComponent`) was **ruled out** — empirical probes showed aem.live's CDN rejects percent-encoded paths with a bare 404 before the storefront renders. The shipped approach is reversible **underscore hex-escape** over the proven-safe `[a-z0-9_-]` alphabet. urlKey-resolve was also evaluated and ruled out (Lighthouse). Full evidence and rationale in ADR-007.

## Question

Is the blank PDP a break in our prerendering / smart-404 functionality, or something else?

## Answer

Something else. Our prerendering (`render-pdp`), smart-404 lowercase-redirect, and catalog
prewarm all work as designed. The blank page comes from **lossy SKU→URL encoding in the
storefront's `scripts/commerce.js`** — fundamentally upstream Adobe behavior, only partially
mitigated by our code-patches. The friend's catalog triggers it because its SKUs are
descriptive prose (`Yale UNOplus-Series A Rachet Lever Hoist`) with spaces, mixed case, and
punctuation.

## Evidence

### The broken behavior is stock Adobe boilerplate

`hlxsites/aem-boilerplate-commerce` `scripts/commerce.js:676`:

```js
const sanitizedSku = sku ? sanitizeName(sku) : '';   // lossy: spaces→'-', lowercased, punct stripped
```

`sanitizeName()` is irreversible. This predates anything we do and is the true root cause.

### Our two patches fix only forward-slashes, not spaces/case/punctuation

From `skukla/eds-demo-patches` (`citisignal/code-patches.json`, identical in `b2b/`):

- `product-link-sku-slash-encoding` (write side, `getProductLink`):
  `sku.split('/').map((part) => sanitizeName(part)).join('__')`
- `product-link-sku-encoding` (read side, `getSkuFromUrl`):
  `result[1].replace(/__/g, '/')`

These preserve `sanitizeName()` per segment and only round-trip the `/` character via `__`.
A SKU with spaces is still destroyed.

**The friend's "Before" snippet is `product-link-sku-slash-encoding` verbatim** — proving her
storefront went through our pipeline and the patch applied successfully. The bug survived the
patch because the patch was never designed for prose-like SKUs.

### Her catalog is the trigger, not a regression

`Yale UNOplus-Series A Rachet Lever Hoist` → `yale-unoplus-series-a-rachet-lever-hoist`.
Spaces→hyphens is unrecoverable. Clean SKUs (CitiSignal `VD-001`) never hit this. No code of
ours changed to cause it; the gap was always present for this data shape.

### Our prerender / smart-404 path is orthogonal and intact

- `src/features/eds/services/pdp404HandlerPublisher.ts:95,162` — only **lowercases** path segments.
- `src/features/eds/services/catalogPrewarmService.ts:312` — builds `/products/{urlKey}/{sku}` with
  raw `.toLowerCase()`, no slugify.
- `render-pdp` (Phase 2, live) serves the authored `/products/default` shell; the drop-in resolves
  product data client-side via `getMetadata('sku') || getSkuFromUrl()`. On an overlay PDP with no
  authored meta, `getSkuFromUrl()` returns the mangled slug → empty product → blank shell. Our
  prerender faithfully renders the shell; the storefront's own link logic feeds it a broken SKU.

## Cross-system interaction (load-bearing for the fix)

Our smart-404 handler **lowercases the SKU segment**, relying on Adobe Commerce Catalog Service
case-insensitivity (see MEMORY: `reference_catalog_service_sku_case_insensitive`). Any replacement
encoding must therefore be **lowercase-stable** — i.e. survive a `.toLowerCase()` of the whole path
and still decode to the original SKU (modulo case, which the catalog tolerates).

- `encodeURIComponent` **is** lowercase-stable: `%2F`→`%2f` still decodes to `/`; letter case in the
  SKU is recoverable modulo the catalog's case-insensitivity. ✅
- A case-sensitive scheme (e.g. base64) would be corrupted by the lowercase redirect. ❌ (This is the
  one risk to flag if the friend used base64 rather than `encodeURIComponent`.)

Our extension's path builders (`catalogPrewarmService.ts`, `pdp404HandlerPublisher.ts`) must use the
**same** encoding as the storefront link builders, or prewarmed/published paths won't match
navigable links.

## Producers and consumers of `/products/{urlKey}/{sku}` (must stay consistent)

Producers (encode the SKU):
1. `getProductLink()` — `scripts/commerce.js` (patched)
2. `product-teaser.js` — patched separately (`product-teaser-sku-encoding`, slash-only today)
3. **Audit risk:** other blocks may build links via `rootLink()` directly, bypassing `getProductLink`
   (the teaser comment confirms at least one does). Needs an audit.
4. Our `catalogPrewarmService.ts` and `pdp404HandlerPublisher.ts` (extension-side path builders)

Consumer (decode the SKU):
1. `getSkuFromUrl()` — `scripts/commerce.js` (patched)

`aem-assets-sku-sanitization` (replace `/`→`-` for AEM Assets alias URLs) is a **separate** concern
(asset delivery path, not the PDP URL). Out of scope, but review for consistency.

## Key files

- `src/features/eds/services/pdp404HandlerPublisher.ts` — smart-404 vendor + lowercase redirect
- `src/features/eds/services/catalogPrewarmService.ts` — proactive prewarm path builder
- `src/features/eds/services/codePatchPipelineHelpers.ts` — applies canonical-phase patches to `scripts/commerce.js`
- `src/features/project-creation/config/demo-packages.json` — wires patch IDs per package
- External: `skukla/eds-demo-patches` `{citisignal,b2b,custom}/code-patches.json` — patch ledger
- Upstream: `hlxsites/aem-boilerplate-commerce` `scripts/commerce.js` (676, 629, 668) — owns the lossy behavior

## Recommendations

1. Tell the friend: correct diagnosis, correct fix. Caveat: confirm her encoding is lowercase-stable
   (`encodeURIComponent` is; base64 is not) or it collides with the smart-404 lowercase redirect.
2. Replace the slash-only SKU patches with a **reversible, lowercase-stable** encoding
   (`encodeURIComponent`) across all producers + the single consumer, plus the two extension-side
   path builders. Design: [`.rptc/backlog/2026-06-12-pdp-sku-reversible-encoding.md`](../../backlog/2026-06-12-pdp-sku-reversible-encoding.md).
3. File the upstream PR the patch `exit` notes already promise — the real fix belongs in Adobe's
   `sanitizeName(sku)` usage.

## Open risk requiring Phase 0 validation

Whether a percent-encoded PDP path (`/products/cmlodestar/yale%20unoplus...`) survives Helix
preview/publish + the smart-404 round-trip is **unverified**. The friend confirmed her encode/decode
round-trip locally, not the full Helix publish path. Validate on a real storefront before shipping;
if Helix mangles `%`, fall back to a `%`-free reversible scheme.
