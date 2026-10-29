---
id: EDS-62
kind: fix
area: eds
needs: []
value: high
status: active
---

# A demo made before a storefront fix never gets it

Filed 2026-10-22 from the owner's phone: on JustRite, a product never opened before
showed "Configuration Error", then "Loading product...", then the product about 8 s in.
Owner: "We're not releasing broken stuff." Fixed in this release, not after it.

## What was measured (iPhone WebKit, fresh profile, 2026-10-22)

Two faults, both on storefronts created before the fix for each existed.

1. **The 404 page could not start.** JustRite's `404.html` import map named 4 dropins,
   `head.html` 18. The start-up code loads the company switcher on B2B sites, the import
   failed, and the storefront swapped in its 418 "Configuration Error" page. Demo Builder
   has repaired this since 2026-10-15 (EDS-45, `notFoundPage.ts`), but only at creation,
   reset and thin-layer update. JustRite was created on 2026-09-30 and had been through
   none of them. The Adobe boilerplate update (EDS-56) deliberately re-applies no Demo
   Builder fix (D6), so it did not either.
2. **Links and product pages disagreed for 10 of 49 products.** JustRite still carried two
   retired patches (`product-link-sku-encoding`, `product-link-sku-slash-encoding`) from
   Khalil's source site, copied in before they were retired (eds-demo-patches `21f7e02`,
   2026-10-06, ADR-024). Links wrote SKUs as `_HH` (`nfpa_5fprinted_5f1200`); the service
   publishes at Helix's cleaned path (`nfpa-printed-1200`). Every tap on a SKU with `_`
   went through the 404 page and the smart-404 redirect.

Fault 1 was repaired on JustRite by hand on 2026-10-22 (`skukla/kukla-justrite` `1e2c163`,
the extension's own `alignNotFoundImportMap` run on the real files). After it: no error
screen; "Loading product..." then the product.

## What was decided and built (owner, 2026-10-23)

- **No in-place repair.** A "Repair the storefront" row was built and then removed: the
  owner judged repairs not worth their upkeep. An older storefront is brought up to date
  by a reset.
- **Reset and creation clean up what an old source still carries.** A reset of a
  colleague-track storefront re-copies a repository that may still hold the old code, so
  the build step aligns `404.html`'s import map with `head.html` and undoes retired ledger
  patches (verbatim only, all-or-nothing per retirement), at creation, reset and template
  update. Retired patches are listed under `retired` in the eds-demo-patches ledgers
  (`9db0943`, release v1.1.3); a patch retired because upstream now ships it is never listed.
- **Needs reset.** Each storefront records internally which Demo Builder storefront changes
  it was built with. A storefront that predates any listed change shows **Needs reset** on
  its project card, the dashboard's Reset tile, the storefront report, Diagnostics and to
  agents; a current one shows nothing. No date is shown (owner: "too busy").
- **Found on the way:** Check for Updates and its apply made every project they saved the
  open one, leaving the SC on whichever came last. Both now save through a view that never
  switches the open project.

## Shipped so far

- 2026-10-23  feat(eds): every known fix reaches every storefront; the report is a window (`c75b52793`)
