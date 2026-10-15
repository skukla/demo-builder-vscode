---
id: EDS-44
kind: fix
area: eds
needs: []
value: med
status: built
---

# Changing the store in Configure makes pages for the new catalog

Filed 2026-10-15 from the release walk. The scratch storefront `my-commerce-demo` was created
on Main Website (which has no categories or products), then switched to the CitiSignal website
on Configure and republished. The config reached the live site, but:

- **Category pages:** none for the CitiSignal catalog. The nav's `catalog-menu` linked each
  category to a filtered search instead, and the new-category check (EDS-27) then offered all
  11 categories. Add pages made them. So category pages recover, one offer later.
- **Product pages:** none at all. Listings link to `/products/<urlKey>/<sku>`, which answers
  "Page not found". Setup pre-publishes product pages for the store chosen at creation, and
  nothing re-runs that after a store change short of Reset.

## What done looks like

A store change on Configure (and `configure_project`) that changes the catalog the storefront
reads ends with that catalog's category and product pages in place, or says plainly that a
Reset is needed and offers it. Decide which by measuring how long a product-page publish takes
for a real catalog: the creation path already knows how.

Related: EDS-27 (new categories get pages), EDS-24 (category pages at setup).

## Shipped so far

- 2026-10-15  feat(eds): a store change replaces the storefront's product and category pages (`54e5d35f3`)
