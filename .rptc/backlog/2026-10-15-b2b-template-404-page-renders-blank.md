---
id: EDS-45
kind: fix
area: eds
needs: []
value: low
status: built
---

# The B2B template's 404 page renders blank

Filed 2026-10-15 from the release walk. On a storefront built from
`adobe-commerce/boilerplate-b2b-template`, any missing page (seen on a product page that had
not been published) draws nothing: no header, no footer text.

**Cause, read from the page:** the start-up code (`scripts/initializers/index.js:248`) imports
`@dropins/storefront-company-switcher/api.js`. The site's `head.html` import map names it (18
dropins), but the template's own `404.html` carries its own import map with only four
(`storefront-auth`, `storefront-cart`, `storefront-personalization`, `tools`). The browser
refuses the import ("Failed to resolve module specifier") and the page never initialises.
Checked on `skukla/my-commerce-demo` and on the template's `main` (no company-switcher in its
404.html).

## Options

1. Report it upstream to the template's owners and wait.
2. A code patch on our side (the `codePatches` mechanism, ADR-006) that gives `404.html` the
   same import map as `head.html`, applied at creation, reset and template sync.

Recommendation: 2 while 1 is pending, since every B2B demo shows a blank page for any mistyped
or unpublished link. Check first whether the non-B2B boilerplate has the same gap.

## Shipped so far

- 2026-10-15  fix(eds): a missing page on a B2B storefront shows the site's 404, not a blank page (`e9e76c948`)
- 2026-10-23  feat(eds): every known fix reaches every storefront; the report is a window (`c75b52793`)
