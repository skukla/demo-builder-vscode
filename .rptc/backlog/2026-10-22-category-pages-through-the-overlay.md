---
id: EDS-61
kind: feature
area: eds
needs: []
value: high
status: active
---

# Category pages through the same overlay as product pages

Filed 2026-10-22 (owner: "This is the approach I thought we were already using, so we
must file it and implement it").

## What is true now

- **Product pages** are rendered on request: the shared `render-pdp` action in
  `skukla/accs-discovery-service`, registered as each site's BYOM content overlay
  (`registerSite` in `src/features/eds/services/configurationService.ts`), returns the
  storefront's authored `/products/default` template for any `/products/*/*` path. No
  document per product.
- **Category pages** are written as one DA.live document per category marked Include in
  Menu (`docs/systems/category-pages.md`, EDS-24): heading plus a `product-list-page`
  block with that category's `urlPath`, kept in step by creation, reset, republish and a
  watcher while the project is open (EDS-27). Measured 2026-10-22 on scratch-1022: pages at
  `/signs`, `/signs/danger-signs`, `/signs/fire`, `/safety-cabinets`.
- The gap that shows: a category added in Commerce has no page until a republish or the
  watcher writes one; the menu shows it and clicking through 404s.

## What Adobe documents (FluffyJaws, 2026-10-22)

Three ways a category URL gets a page: hand-authored documents (a few categories), script-
generated documents (what we do; "Generate category pages programmatically", must be
re-run), and rendering on request through Commerce Prerender / a BYOM overlay ("most
catalogs"). The `product-list-page` block does not read the category from the URL; the
page tells it (`urlPath`). Folder mapping is discouraged for indexed commerce pages.
Sources: experienceleague.adobe.com/en/tools/commerce-storefront/how-tos/manual-category-page,
.../how-tos/automatic-category-page, .../setup/configuration/aem-prerender.

## What it would do

The overlay renders category pages too: for a path that is a Commerce category's
`url_path` (looked up per org/site, cached), it returns a page with the category name and a
`product-list-page` block for that `urlPath`, built from an authored template the same way
PDPs use `/products/default`. Demo Builder stops writing per-category documents and removes
the ones it wrote and nobody edited (an edited one stays and wins, since published content
is served before the overlay's fallback). New categories work at once; nothing goes stale;
reset has nothing to clean up.

Open in design: which template the SC authors for category pages; how the overlay tells a
category path from any other missing path (and returns 404 otherwise); caching and its
invalidation; existing projects' written pages (the migration); the watcher (EDS-27)
becomes unnecessary; what the agent surface says.

## Next (2026-10-29)

Plan: `.rptc/plans/category-pages-any-catalog/overview.md` — any catalog arrangement: the
`/products/a/b` store check, first-visit publishing for categories, the menu linking each
category's own address. After the beta.152 cut.

## Shipped so far

- 2026-10-23  feat(eds): every known fix reaches every storefront; the report is a window (`c75b52793`)
- 2026-10-29  fix(eds): no generated category page where the SC's own page is used (`719652e5c`)
