---
id: EDS-24
kind: feature
area: eds
needs: []
value: high
status: active
---

# Category pages and the nav are generated from the Commerce category tree

<!-- Do NOT template this body. Items vary because the work varies; the
     provenance, the measurements and the caveats are what make an item useful
     months later. The frontmatter carries the structure so the prose need not. -->

Filed 2026-10-01 from the AB-53 rebuild (`skukla/kukla-justrite`), when the owner asked how
the storefront's nav could reach the actual products: "our North American site is a catchall
site with several brands — not just the signage one. So how could we easily get to the
specific categories for cabinets and signs and so forth?"

## What a category page IS on this storefront (measured)

The storefront is the Adobe Commerce Optimizer boilerplate. A category page is an ordinary
DA.live page at the category's path holding one block. The boilerplate's own `/apparel` page
(`main--boilerplate-aco--adobe-commerce.aem.live/apparel.plain.html`, read 2026-10-01) is
the whole recipe:

```
<h1>Apparel</h1>
product-list-page
  urlPath | apparel
```

The block lists products through Live Search (`productSearch` filtered on `categoryPath`)
with the storefront's scope headers, so company pricing and shared-catalog visibility come
for free. There is no folder mapping and no route: a category without a page is a 404.

## What the generated site had

- The nav document: **26 links, every one of them `/`.** The home page's five "Shop by
  Category" cards: all `/`. The design is a brand mock-up whose links were never pointed
  anywhere. `/safety-signs`, `/categories/safety-signs`, `/products/safety-signs` all 404.
- Commerce (and Catalog Service) already hold a five-branch tree under the Justrite root with
  correct `url_path`s: Safety Signs (24 Accuform configurables, by sign type) and four
  use-case branches holding the 25 visible Justrite-brand signs. Counts by
  `categories/{id}/products`, 2026-10-01.

So the data side is done and the content side is empty, and nothing connects them. Every SC
who loads a custom catalog (a datapack, a bulk load, AI-10) lands here: a tree in Commerce,
a storefront that cannot reach it, and a hand-authored nav to keep in step.

## What to build

One capability, two surfaces (`mcp-tool-authoring`; the human surface is the dashboard's
storefront zone):

1. **Read the tree** from Commerce for the project's store view (Catalog Service
   `categories` by id walks it with `urlPath` and `children`; REST `categories/{id}` gives
   `include_in_menu` and `is_active`).
2. **Write one page per category** at its `urlPath` — the recipe above, heading = category
   name — through the existing `write_page` seam, publish included. Skip categories with
   `include_in_menu: false`. Re-running rewrites the same paths (idempotent); removal is
   `delete_page` over the same list. The ADR-013 rule applies in spirit: a page the SC has
   edited by hand must not be clobbered — record what was written and skip a changed page.
3. **Write the nav** from the top level: one column per top-level category, its children as
   links, "All Products" pointing at a listing page with no `urlPath` so the facets narrow.
   Same hand-edit guard.
4. **Optionally re-point the home page's category cards** by matching card text to category
   names; report the ones it could not match rather than guessing.

Report in plain English: pages written, pages skipped as hand-edited, nav columns, and the
one caveat that matters — **a category page shows nothing until Live Search has indexed the
store view.** On 2026-10-01 the exact query the block sends returned 0 for `justrite_us`
while Catalog Service returned the products; the pages would have been correct and empty.

## The nav: a catalog menu the SC switches on with one line (owner, 2026-10-01)

Step 3 above ("write the nav") is replaced by this. The owner wanted the Commerce menu to be
optional, reusable, and mixable with hand-authored items, and the words an SC types to be
plain enough for a non-technical author.

**What the SC types in the nav document.** One ordinary line in the menu list, in words:

```
Custom Signs                       ← typed by hand, stays as typed
Shop the catalog                   ← becomes one menu entry per top-level category
Shop the catalog: Signs and Labels ← becomes "Signs and Labels" with its sub-categories
Resources                          ← typed by hand
```

- The category is named the way Commerce names it, never by path or id. A name that matches
  nothing renders as plain text and the browser console says which name was not found.
- Hand-typed items keep their place; the line expands where it sits. Hiding a category is
  Commerce's own "Include in Menu" switch, so there is one place to change it.
- No line, no change: the nav is exactly what is authored, as today.

**What makes the line work (measured in the generated header, 2026-10-01).** The header loads
the nav as a fragment, and `loadFragment` decorates and loads the fragment's blocks BEFORE the
header reads its list (`blocks/fragment/fragment.js`: `decorateMain`, then `await
loadSections`). So a block inside the nav document runs first and can rewrite the list in
place. No header change is needed.

**Delivery.** Three parts, and none of them is a code patch:

1. **The code is a block** (`catalog-menu`) in a **Demo Builder block library — ours, and
   optional** (owner, 2026-10-01: "we don't own the demo team block library … the demo builder
   needs to create its own block library that can optionally be added"). It reads the Commerce
   tree from Catalog Service with the storefront's own headers and replaces each "Shop the
   catalog" line. The library is a new `block-libraries.json` entry pointing at a repository we
   own, offered as a checkbox in the Storefront area like the others; it installs the way every
   library block does — copied into the storefront repository at creation — so it reaches
   packages and shared demos alike. The catalog menu is its first block, not its only reason.
   A code patch was considered and rejected: patches rewrite a canonical file against an
   exact-match precondition, and header code differs per storefront (Khalil's is custom), so
   the patch would fail silently on exactly the sites that need it.
2. **The switch is content**: the block's one-cell table at the end of the nav document plus
   the line(s) above. The builder writes both when the SC asks for a catalog menu (wizard
   Storefront area: "Build the menu from the Commerce catalog", default on for a catalog the
   project loaded; and the same action on the dashboard and as an agent tool), and removing the
   block and lines is the undo.
3. **The pages behind the links** are steps 1–2 above: one page per category.

**To prove before building:** whether Catalog Service's `categories` read honours the B2B
grants per customer group. If it does not, the block must filter by what `productSearch`
can see for the shopper's group, or a guest gets menu entries whose pages are empty.

## A category is invisible until a shared catalog grants it (B2B), measured 2026-10-01

The empty Live Search index on `justrite_us` was never an index problem. Adobe's answer
(owner relayed it, 2026-10-01): "there is an issue with sync if B2B is enabled. By default, the
permission takes as deny and does not sync products." Measured the same hour, `productSearch`
on the Justrite store view, one call per `Magento-Customer-Group` header (SHA-1 of the group id):

| Group | `total_count` |
|---|---|
| none (the storefront's guest header) | 0 |
| 0 NOT LOGGED IN | 0 |
| 1 General | 0 |
| 20 Northgate (shared catalog 15) | 49 |
| 21 Harbor (shared catalog 16) | 49 |

`sharedCatalog/1/categories` (the public catalog: guests and General) granted Bodea's tree and
none of Justrite's; catalogs 15 and 16 granted the Justrite sub-categories but not Safety Signs
itself. Catalog Service `products(skus:)` returned the products for every group, because only
the search applies category permissions. That split is the diagnostic: **products by SKU but
zero from search, on a B2B website, means permissions before it means indexing.**

So this capability, and anything else that creates categories (a datapack, a bulk load, an
agent with `write_commerce_rest`), has a second half the category write does not do:

1. **Find the shared catalogs that apply** to the website: the public one (guests, General) and
   every custom one, with the companies and buyer groups each serves.
2. **Grant each new category to each catalog that should see it**
   (`POST sharedCatalog/{id}/assignCategories`), and say which were left out and why — "only
   Northgate's buyers will see Safety Cabinets" is a decision, not an accident.
3. **Verify by searching as each group**, the table above, not by reading the category back.
4. **Undo includes the grants.** Removing a category takes its grants with it; restoring one
   from a snapshot must restore them too.

The same rule belongs in the agent surface: `write_commerce_rest`'s description (or a skill the
SC's agent reads) should say that on a B2B website a new category needs a shared-catalog grant
before anyone can see it.

## Caveats

- The tree is the nav. A catch-all site wants its top level to be product FAMILIES
  (cabinets, signs, lockout) with brand as a facet, not one taxonomy per brand. That is a
  catalog design question for the SC, not for this tool; the tool should take whatever tree
  Commerce has.
- `brand` as a Live Search facet makes the multi-supplier point visible on the list page.
  Worth checking whether the generated storefront's attribute metadata already marks it
  filterable.
- Related: [[AI-10]] (the datapack/bulk loader should end with the storefront reaching what
  it loaded, not with the REST writes), [[EDS-22]].

## Shipped so far

- 2026-10-03  catalog-menu block built in a new local repo (demo-builder-block-library, no remote, uncommitted; 15 node tests); Demo Builder service that writes one page per category + the nav switch and undoes both, hand-edit guarded, tested with stubs (src/features/eds/services/catalogMenu/, 30 tests), not yet wired to a surface. block-libraries.json entry withheld: a missing source repo fails every library install it is selected with. Live B2B read not run (no extension answering the probe). Owner steps: .rptc/plans/category-pages/overview.md
- 2026-10-03  feat(eds): category pages and the catalog-menu nav switch, as a service built to the cloud edge (EDS-24) (`5249890a4`)
- 2026-10-03  2026-10-04 category-pages plan step 3 built on loop/2026-10-04-step5 (staged, not committed): block-libraries.json gains demo-builder-blocks (standalone, skukla/demo-builder-block-library main, eds-storefront), offered to every EDS package and OFF by default (no defaultForPackages, owner-approved: off until the first real run passes). Also added to the demoBuilder.blockLibraries.defaults settings enum in package.json (the sync test requires every global library there). Schema and BlockLibrary type unchanged (every field already existed). Steps 4-6 not run.
- 2026-10-03  2026-10-04 category-pages plan step 6 built on loop/2026-10-04-catalog-menu (staged, not committed): one handler pair (dashboard catalogMenuHandlers buildCatalogMenu/removeCatalogMenu, Pattern B) behind both a Catalog Menu tile in the dashboard storefront zone (dialog with Build / Remove, Remove confirms) and the agent tools build_catalog_menu (declared as write_page) and remove_catalog_menu (confirm + consent dialog). Categories from Catalog Service with run_commerce_query's own request (resolveCommerceRequest extracted), falling back to a subtree walk from the store's root category when the tree read is empty (subtree numbers unverified). Pages through one DA.live+Helix adapter (ai/server/storefrontPages.ts, which now also owns the storefront target helpers moved out of contentAuthoringTools). Record kept on componentInstances['eds-storefront'].metadata.catalogMenu. Build refuses and changes nothing when blocks/catalog-menu/catalog-menu.js is not in the storefront repo. Wizard checkbox NOT built (creation path needs a new phase after the storefront exists); next step. No live run.
- 2026-10-03  Correction to the step 6 entry (coordinator, property 5): build_catalog_menu is now confirm:true-gated with consent copy (destructiveHint true), not declared as write_page; its refusal reads the tree first (previewCatalogMenu) and names the site and the page count. The dashboard Build asks first, like Remove. write_page itself unchanged — same property-5 exposure, an open owner question.
- 2026-10-03  feat(eds): the catalog menu from the dashboard and for agents; building asks first (EDS-24 step 6) (`f7b196e3c`)
