# Category pages for any catalog arrangement: plan (2026-10-29)

Backlog: [EDS-61](../../backlog/2026-10-22-category-pages-through-the-overlay.md). After the
beta.152 cut. Owner's goal (2026-10-29): an SC arranges Commerce categories and storefront
pages however they like, and the menu and category pages follow.

## How it works today (verified 2026-10-29)

- **The menu reads Commerce live.** The `catalog-menu` block asks Catalog Service for the
  category tree on every page load (`blocks/catalog-menu/catalog-menu-core.js`). A nav line
  "Shop the catalog" shows each top category with its direct children; "Shop the catalog:
  <name>" shows that category (any depth) with its direct children. Two levels, always.
- **Each menu link is, in order:** the SC's own page from the nav table (`products/racks` →
  `/racks`); else the category's own Commerce address (`/signs/fire`); else, for a top-level
  entry whose page is missing, a search page filtered to the category.
- **A category page names its category.** Its one `product-list-page` block carries the
  category's Commerce address (`urlPath`); the products load live in the browser.
- **The page itself is built on request** by the shared page service (`render-pdp` in
  `accs-discovery-service`) from the site's `/categories/default`, but **AEM serves only
  published addresses** and never asks the service on a shopper's visit. So every category
  address is published once: by Demo Builder at setup, reset and republish.
- **Product addresses are Adobe's:** `/products/<url key>/<SKU>`, in both boilerplates
  (`scripts/commerce.js`). Category addresses come from the SC's catalog (Commerce joins the
  url keys down the tree).
- **Shipped 2026-10-29 (`719652e5c`):** no generated page for a category the menu links to the
  SC's own page elsewhere. Bodea's republish went from 8 failures to 2.

## What is still wrong

1. **A category address with the product-page shape is refused.** Bodea's Servers and Racks
   (`/products/racks/servers`, `/products/racks/racks`) have no own page; the service reads
   every `/products/a/b` as a product page and refuses. Only catalogs with a top category whose
   url key is `products` hit this.
2. **A category added in Commerce has no page until the next republish.** The menu shows it at
   once (live), but links to search until then.
3. **The menu can link a missing page.** Children shown under a named line ("Shop the catalog:
   <name>") are linked to their address without the missing-page check top-level entries get.

## The design (owner, 2026-10-29)

| Event | What happens |
|---|---|
| Setup, reset, republish | Demo Builder publishes every category address that has no own page (as now), so known categories open instantly in a demo |
| A shopper opens an unpublished category address | The 404 page's script (as for product pages: "Loading…", publish, reload) asks the service to publish it; the service publishes only a category the store confirms. A few seconds, once |
| A category is added in Commerce | In the menu after Commerce's catalog sync; the menu links its own address; the first click publishes it |
| A category is deleted in Commerce | Gone from the menu after the sync. Its published page stays, linked from nowhere, its product list empty, until the next republish or reset takes it down; then 404, and the first-visit publish refuses it (no such category). **Accepted gap:** no event-driven take-down (owner, 2026-10-29: not worth the machinery for a page nothing links to) |
| A category has the SC's own page | The menu links to it; Demo Builder never generates or touches a page for it |

## Steps

1. **Service: ask the store before calling `/products/a/b` a product page.** Two segments under
   `products/` and four or more are never product pages; for exactly three, look the product up
   and, when there is none, render the category whose url path matches. Same rule in Demo
   Builder's plan (`categoryPagePlan.ts`) so the two cannot disagree. Test catalog: Bodea's.
2. **Service: publish a category on first visit.** Extend `prepublish-pdp` to category
   addresses, keeping the deployed hardening (main branch only; publish only what the store
   confirms; fail closed). The category half of `1975d00` (branch
   `feature/category-pages-overlay`) is the starting point; its loosening of the product guard
   is not taken. Plus the storefront's 404 script (`scripts/delayed.js`) for category
   addresses.
3. **Menu block: link the category's own address whenever the store has the category,** every
   level a line shows; search only when the publish fails. The current search fallback for a
   missing page stops first-visit publishing from ever firing from the menu.
4. **Deploy and prove:** deploy the service (owner's go: every storefront uses it), update the
   block through the normal block update, republish Bodea, check its two addresses and a
   category added and then deleted in Commerce, from outside.

## Open, to check rather than build for

- Whether anything other than the menu links shoppers to a category address (breadcrumbs on a
  product page). A missing page there 404s today; first-visit publishing would cover it.
- What a published page shows for a deleted category (empty list or "no products").
- How long Commerce's catalog sync takes on the sandbox.
- A category whose url key is a storefront page name (`cart`, `search`), or two url keys that
  clean to one address: tell the SC once, in one sentence, to change the url key.
