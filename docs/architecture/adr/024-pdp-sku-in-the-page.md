# ADR-024: Product pages carry their SKU — URLs are Helix-clean, the SKU lives in the page

**Status**: Accepted (owner-approved 2026-10-06). Supersedes [ADR-007](007-pdp-sku-url-encoding.md).

**Date**: 2026-10-06

Related: [ADR-005 BYOM PDP Routing](005-byom-pdp-routing.md), [ADR-006 Thin-Layer Storefront Customization](006-thin-layer-storefront-customization.md).

---

## Context

### What broke

On the JustRite storefront, every product whose SKU contains an underscore
showed the loading spinner and then "Page Not Found". Measured 2026-10-06,
read-only, across the whole catalog: 39 of 39 products with plain SKUs
(letters, digits, hyphens) had a live page; 10 of 10 with `_` returned 404.

ADR-007 put the SKU in the URL with a reversible encoding: keep `[a-z0-9-]`,
write every other byte as `_HH`. `RRE-805_White_on_CharcoalGray` became
`rre-805_5fwhite_5fon_5fcharcoalgray`. Its evidence established that the CDN
*accepts a request* for a path containing `_`. It never published a page at
one.

Helix cleans every path it **publishes** — `sanitizeName` in
`@adobe/helix-shared-string`: lowercase, strip diacritics, every run of
characters outside `[a-z0-9]` becomes one `-`, no leading or trailing `-`. The
page was stored at `rre-805-5fwhite-5fon-5fcharcoalgray`. The prepublish action
reported success, the smart-404 snippet redirected the shopper to the `_5f` path
it had asked for, and nothing lived there. At the path where the page did live,
`-5f` no longer decoded to the SKU. ADR-007's own motivating case — SKUs with
spaces, encoded `_20` — fails the same way.

So no URL alphabet wider than `[a-z0-9-]` survives a publish, and that alphabet
cannot carry an arbitrary SKU reversibly.

### What Adobe's own tool does

`adobe-rnd/aem-commerce-prerender` builds `/products/{urlKey}/{sku}` and passes it
through `sanitizePath` — the URL already equals where Helix will store the page.
It does not rely on the URL to identify the product: its page template writes
`<meta name="sku" content="{{sku}}">`. The canonical storefront reads
`getProductSku()` as `getMetadata('sku') || getSkuFromUrl()` — the tag first.
Canonical `getProductLink` already cleans both segments with `sanitizeName`.

How the rest of our pipeline compares with the reference — what matches, what
differs on purpose, and the one demo-only piece (the smart-404 snippet) — is laid
out in [eds-byom-pdp-routing.md § Is this what a merchant would run?](../eds-byom-pdp-routing.md#is-this-what-a-merchant-would-run).

Canonical was never wrong. What it lacked in our setup was the tag: the
`render-pdp` overlay served the authored `/products/default` markup verbatim, so
the URL fallback was the only source, and the fallback is lossy.

## Decision

1. **One path per product, Helix-clean.** A product's page is
   `/products/{sanitizeName(urlKey)}/{sanitizeName(sku)}`. The storefront's
   canonical `getProductLink`, the extension (`pdpPathFor` in
   `src/features/eds/services/pdp/pdpPath.ts`), and Helix all compute it the same
   way. `sanitizeName` is idempotent, so publishing never moves the page.
2. **The page carries the real SKU.** `render-pdp` looks the product up by URL key
   (unique per store view; SKU lookup as fallback) and adds
   `<meta name="sku">` to the page head. The lookup runs when Helix *previews* the
   page — once per publish — never on a shopper's page load. This is the
   performance objection ADR-007 raised against URL-key resolution, answered: the
   round-trip it measured on the LCP path is now on the publish path instead.
3. **Publish where the product lives, and say where.** `prepublish-pdp` resolves
   the product, publishes its canonical path whatever form the incoming link took,
   and returns that path (Helix's reported `webPath` when given). The smart-404
   snippet redirects to the returned path, so a link from before this change
   still lands on its product.
4. **Refuse duplicates.** `render-pdp` answers 404 for a path that names no
   product or is not the product's canonical path, so nothing else can be
   published. A lookup that cannot answer (config or Catalog Service unreachable)
   serves the page without the tag — the URL fallback — rather than failing.
5. **No encoder.** `encodeSkuForUrl` / `decodeSkuFromUrl` are deleted from all
   three places they lived: the extension, the `eds-demo-patches` commerce.js
   patches (`product-link-sku-encoding`, `product-link-sku-slash-encoding`), and
   `check-sku-exists.js` in `accs-discovery-service`. The storefront runs
   canonical code for this.

## Alternatives considered

- **Keep `_HH`, map the path back after publish.** The cleaned path loses the
  information the encoding was meant to carry (`_5f` → `-5f` is
  indistinguishable from a SKU containing `-5f`). Not reversible.
- **An escape inside `[a-z0-9-]`** (e.g. `-x5f-`). Collides with real SKUs that
  contain the escape sequence, and still needs a decoder in three repositories
  that must stay byte-identical — the coupling ADR-007 already paid for.
- **Resolve the SKU in the browser from the URL key** — ADR-007's rejected
  alternative 2. Still rejected for the reason it gave: a Catalog round-trip on
  every product page load.

## Evidence

- 2026-10-06, `main--kukla-justrite--skukla.aem.live`: 39/39 plain SKUs 200,
  10/10 `_` SKUs 404; `…/rre-805-5fwhite-5fon-5fcharcoalgray` 200 rendering
  "Page not found".
- `productSearch(phrase:"", filter:[{attribute:"url_key", eq:…}])` resolves the
  exact SKU on the JustRite ACCS catalog; a URL key that does not exist returns an
  empty list.
- The new lookup, run read-only against JustRite's served `config.json`: 49 of 49
  products resolve to their real SKU at their canonical path.
- aem.live BYOM documentation: page metadata can be provided by `meta` tags in
  the HTML head.

## Consequences

- **Existing storefronts** have product pages published at old `_HH` paths and,
  until their code is reset, patched `commerce.js` that still builds `_HH` links.
  Those links keep working through the smart-404 redirect, one hop slower; a
  storefront reset restores canonical `commerce.js` and its links point straight
  at the canonical path.
- **Added demos keep their source's code.** A demo built on someone else's
  repository (JustRite, from `kmanns/justrite`) resets to THAT repository's
  `commerce.js`, encoder included — the reset restores the source faithfully and
  no patch runs over it. Its `_HH` links keep landing through the smart-404
  redirect until the source repository drops the encoder; plain SKUs are
  unaffected, since the encoder leaves `[a-z0-9-]` alone.
- **SCs** no longer need clean SKUs. Any SKU works; the URL shows the cleaned
  form.
- **Custom blocks** that link to a product page must call
  `getProductLink(urlKey, sku)`. A hand-built link keeps the SKU's case and
  punctuation and misses the page.
- **The rule to remember:** a path segment that Helix would clean is a path no
  page will ever have. The `eds-publish-and-config` skill's rule 8 says so.

## Reference notes

- `getProductLink`, `getProductSku`, `getSkuFromUrl`, `scripts/commerce.js` —
  belong to the generated EDS storefront repository.
- `render-pdp`, `prepublish-pdp`, `check-sku-exists.js`, `lib/pdp-product.js` —
  belong to `accs-discovery-service`.
- `encodeSkuForUrl`, `decodeSkuFromUrl`, `product-link-sku-encoding`,
  `product-link-sku-slash-encoding` — removed by this decision; named so the
  supersession can be followed.
- `sanitizeName`, `sanitizePath` — `@adobe/helix-shared-string`.
