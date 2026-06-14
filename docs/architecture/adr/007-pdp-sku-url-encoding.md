# ADR-007: PDP SKU URL Encoding — Reversible, Lowercase-Stable, Helix-Safe

**Status**: Accepted
**Date**: 2026-06-12
**Decision Maker**: Project Owner
**Implementer**: 2026-06-12 (this slice)

Related: [ADR-005 BYOM PDP Routing](005-byom-pdp-routing.md), [ADR-006 Thin-Layer Storefront Customization](006-thin-layer-storefront-customization.md).

---

## Context

### The problem

A field report (a partner's `cmco-demo` storefront) surfaced a blank PDP: the page
shell loads but product data never hydrates. The product detail page lives at
`/products/{urlKey}/{sku}`. Adobe's canonical commerce boilerplate slugifies the
SKU into the URL with `sanitizeName()` (lowercase, strip diacritics, collapse
non-alphanumerics to `-`), then on PDP load reads the last path segment back and
sends it to Commerce as the SKU.

Slugification is **one-way**. For a SKU like `Yale UNOplus-Series A Rachet Lever
Hoist`, the URL becomes `yale-unoplus-series-a-rachet-lever-hoist`, and the
storefront then queries Commerce with that slug — which is not the real SKU.
Commerce returns nothing, so the PDP template mounts but never hydrates.

This is **not** a regression in our prerender/smart-404 path (ADR-005); those are
intact and orthogonal. The lossiness is upstream behavior. Our prior code-patches
(`__`-slash encoding) only made forward slashes reversible, not spaces, mixed
case, or other punctuation. The bug surfaces only for catalogs whose SKUs are
descriptive prose; clean-SKU catalogs (the norm) are unaffected.

### What the URL serving model requires

PDP paths are published to the Helix content bus by `prepublish-pdp`; `render-pdp`
supplies the body (the authored `/products/default`). The SKU is read **client-side**
from the URL (`getProductSku()` → `getMetadata('sku') || getSkuFromUrl()`); on an
overlay PDP there is no authored per-product `sku` meta, so the URL is the only
source. Therefore the SKU must survive `getProductLink → URL → getSkuFromUrl →
Commerce` for any SKU.

## Decision

Encode the SKU URL segment with a **reversible, lowercase-stable, Helix-path-safe**
scheme: keep `[a-z0-9-]` literal and escape every other UTF-8 byte (including `_`)
as `_HH` lowercase hex (`encodeSkuForUrl` / `decodeSkuFromUrl`).

```
Yale UNOplus-Series A Rachet Lever Hoist
  -> products/cmlodestar/yale_20unoplus-series_20a_20rachet_20lever_20hoist
DigiWristExplorer  ->  digiwristexplorer        (clean SKU: byte-identical to before)
```

Properties:
- **Reversible** for spaces, punctuation, slashes, and unicode (modulo case).
- **Lowercase-stable** — output is already lowercase, so the smart-404 lowercase
  redirect and Helix's lowercase content bus are no-ops on it; decode parses hex
  case-insensitively.
- **No-op for clean SKUs** — output ⊆ `[a-z0-9_-]`; `[a-z0-9-]` SKUs are unchanged.
- Relies on Catalog Service SKU **case-insensitivity** (an assumption the prior
  lowercasing already depended on; verified — see Evidence).

Implementation: `src/features/eds/services/pdpUrlEncoding.ts` (used by the catalog
prewarm path builder) and byte-identical `encodeSkuForUrl`/`decodeSkuFromUrl`
patches in `skukla/eds-demo-patches` (`citisignal/`, `b2b/`) applied to the
storefront's `scripts/commerce.js`.

## Alternatives considered (ruled out by evidence)

### 1. `encodeURIComponent` — ruled out by the Phase 0 gate

The natural first choice. Empirical probes against the live
`main--citisignal-b2b--skukla.aem.live` storefront:

| Request | Result |
|---|---|
| `/products/verify-pub-…/probe` (published) | **200**, 5530 B |
| same with `%6f` for `o` | **404, 13 B** ("404 Not Found") |
| `…/a%20b` (a space, encodeURIComponent style) | **404, 13 B** |
| nonexistent **clean** path | **404, 5043 B** (storefront's styled 404) |

aem.live's CDN rejects percent-encoded paths with a **bare 13-byte 404 before the
storefront renders** — not the storefront's styled 404 — so a `%`-encoded PDP
never reaches the overlay, the content bus, or the smart-404 recovery JS. Helix
does not decode `%XX` in path matching (`pr%6fbe` ≠ `probe`). Character probes
established the safe alphabet: `a-z 0-9 _ -` enter normal routing; `% ~ .` are
rejected. The escape scheme targets exactly this alphabet.

### 2. urlKey-resolve (industry-standard) — ruled out by performance

Look the product up by the clean `urlKey` and treat the SKU segment as decorative.
A spike confirmed Catalog Service can resolve a product from `url_key`
(`productSearch(filter:[{attribute:"url_key",eq:…}])` returns the SKU), and that
the PDP drop-in is strictly SKU-keyed (`fetchProductData(sku)`, `initialize({sku})`),
so it would need a urlKey→SKU resolution call. That adds **one serial Catalog
round-trip (~50–150 ms measured) on the LCP path of every PDP**. SCs demo
Lighthouse / Core Web Vitals — EDS's core value proposition — so degrading the
demoed page's score is unacceptable. It also degrades the *common* (clean-SKU)
case to fix the *rare* one. Underscore-escape is performance-neutral
(`getProductSku()` stays synchronous; one Catalog call, same as today).

## Evidence (gathered 2026-06-12, recorded here for posterity)

- aem.live path probes (above) — establish CDN rejection of `%` and the safe alphabet.
- `productSearch(filter:[{attribute:"url_key",eq:"pulsewear-max-3"}])` → resolved
  `sku: DigiWristExplorer` (urlKey lookup works, but **case-sensitive**: uppercase
  url_key returned no match).
- `products(skus:["digiwristexplorer"])` → resolved `DigiWristExplorer` (SKU lookup
  is **case-insensitive** — the load-bearing assumption for the lowercased path).

## Consequences

### For Solutions Consultants — how SKUs affect the URL

PDP URLs are `/products/{urlKey}/{sku}`; the `sku` segment is now reversibly encoded.

- **Clean SKUs** (letters, digits, hyphens — e.g. `DigiWristExplorer`, `24-MB01`)
  produce clean URLs, unchanged from before, with unchanged Lighthouse scores.
- **SKUs with spaces/punctuation** still work (this fix), but the URL's `sku`
  segment shows `_HH` markers (a space becomes `_20`).
- **Guidance:** for the cleanest demo URLs, create products with clean alphanumeric
  SKUs and avoid spaces/special characters in the SKU. The product *name* can be
  anything — only the SKU drives the URL segment.
- **Operational:** existing already-published PDP URLs keep their old slug; a
  storefront rebuild/republish (or reset) regenerates links in the new format.

### Custom blocks that build PDP links

The encoding lives in `getProductLink`. Every Adobe canonical product block
(`product-list-page`, `product-recommendations`, `commerce-order-product-list`)
already routes through it, so they get the fix for free. The audit found exactly
one bypasser — the demo-team `product-teaser` block — which we changed to call
`getProductLink` instead of hand-building the link.

| Block | boilerplate | b2b | citisignal | Links via |
|---|:--:|:--:|:--:|---|
| `product-list-page` | ✅ | ✅ | ✅ | `getProductLink` |
| `product-recommendations` | ✅ | ✅ | ✅ | `getProductLink` |
| `commerce-order-product-list` | ✅ | ✅ | ✅ | `getProductLink` |
| `carousel` | ✅ | ✅ | ✅ | no product links |
| `product-teaser` | — | absent | ✅ | now `getProductLink` (was `rootLink`) |

**Residual risk (accepted):** an SC-authored block that hand-builds a PDP href
*and* uses a prose SKU reintroduces the bug. Mitigations: the clean-SKU guidance
makes it moot (encode is a no-op for clean SKUs); document "build PDP hrefs with
`getProductLink(urlKey, sku)`." This fragility is inherent to the encoding approach
(the prior `__` patch had it too); urlKey-resolve would have been immune — an
accepted trade-off for the performance win.

### Cross-repo encoder coupling

`encodeSkuForUrl`/`decodeSkuFromUrl` exist twice — in
`src/features/eds/services/pdpUrlEncoding.ts` (extension, builds prewarm/publish
paths) and in the `eds-demo-patches` commerce.js patches (storefront, builds
links). They cannot share code across repos, so they must stay byte-for-byte
identical; a published path must match the link the browser requests. The test
fixture in `pdpUrlEncoding.test.ts` is the contract; both carry cross-reference
comments.

### Scope

`custom/code-patches.json` has no SKU patches (Custom-package storefronts keep
current behavior). PaaS catalog prewarm is still a follow-up (ADR-005); the
storefront-side encoding applies regardless of backend.
