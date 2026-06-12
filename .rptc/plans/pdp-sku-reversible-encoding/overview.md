# Plan: Reversible, lowercase-stable SKU encoding in PDP URLs

**Status**: Implemented 2026-06-12 (pending commit). Decision of record: [ADR-007](../../../docs/architecture/adr/007-pdp-sku-url-encoding.md).

## Context

A field report (a partner's `cmco-demo` storefront) surfaced a blank PDP: the shell loads but
product data never hydrates. Root cause is lossy SKU→URL slugification in the EDS storefront's
`scripts/commerce.js` — canonical slugifies the SKU with `sanitizeName()`, then reverses the slug
on PDP load to query Commerce. Slugifying is one-way, so SKUs with spaces/punctuation/mixed case
fail. Not a prerender/smart-404 regression; surfaces only for prose-SKU catalogs.

## Decision (see ADR-007 for full rationale + alternatives)

Reversible, lowercase-stable, Helix-safe **underscore hex-escape**: keep `[a-z0-9-]` literal,
escape every other UTF-8 byte (incl. `_`) as `_HH`. No-op for clean SKUs; performance/Lighthouse-
neutral. Ruled out: `encodeURIComponent` (aem.live CDN rejects `%`-paths — empirically verified),
urlKey-resolve (extra Catalog round-trip on the LCP path — Lighthouse hit).

## What was built

- **Extension**: new `src/features/eds/services/pdpUrlEncoding.ts` (`encodeSkuForUrl`,
  `decodeSkuFromUrl`, `sanitizeUrlKey`); `catalogPrewarmService.ts` builds the prewarm path with it
  (byte-identical to `getProductLink`). `pdp404HandlerPublisher.ts` unchanged (operates on the
  already-encoded path). Tests: `pdpUrlEncoding.test.ts` (26) + `catalogPrewarmService.test.ts` (+1).
- **Patches** (`skukla/eds-demo-patches`, citisignal + b2b): `product-link-sku-encoding` (read-side
  decode + helpers), `product-link-sku-slash-encoding` (write-side `getProductLink`),
  `product-teaser-sku-encoding` + new `product-teaser-getproductlink-import` (route the demo-team
  teaser through canonical `getProductLink`). Dry-run + LKG gate green. README patch-reference added.
- **Wiring**: `demo-packages.json` citisignal arrays gain `product-teaser-getproductlink-import`.
- **Docs**: ADR-007; `eds-byom-pdp-routing.md` load-bearing dependency #4.

## Producer audit (done)

Only the demo-team `product-teaser` (citisignal-only; absent in b2b) bypassed `getProductLink`;
now routed through it. `product-list-page`, `product-recommendations`, `commerce-order-product-list`
already use `getProductLink` (fixed for free). `carousel` builds no product links. Residual risk:
custom SC blocks that hand-build links + prose SKUs — mitigated by clean-SKU guidance + the
"use getProductLink" convention (ADR-007).

## Verification

Unit (40 EDS-encoder/prewarm tests green; 261 EDS-suite green; tsc clean), patch dry-run + LKG gate
green, aem.live alphabet probes + live Catalog Service resolution recorded in ADR-007. End-to-end
(operational): reset a prose-SKU storefront, confirm PDP hydrates and a clean-SKU PDP is unchanged.

## Cross-repo coupling

`encodeSkuForUrl`/`decodeSkuFromUrl` live in both `pdpUrlEncoding.ts` and the eds-demo-patches
commerce.js patches — keep byte-identical (test fixture is the contract).
