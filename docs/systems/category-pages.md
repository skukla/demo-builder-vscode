# Category pages and the catalog menu

How an Edge Delivery storefront's nav reaches the Commerce catalog without anyone typing
the category structure into it (EDS-24), and how each category gets its page from the
product page overlay (EDS-61). Design: `.rptc/plans/category-pages-overlay/overview.md`.

## What the SC gets

When the storefront has the **Demo Builder Blocks** library (a checkbox in the Storefront
area, off by default) and the product page overlay is on, storefront setup:

1. publishes a page for every Commerce category with a url path, **at the category's own
   address** (`/signs`, `/signs/danger-signs`; owner decision 2026-10-22). Where nobody
   wrote a page at that address, the shared action that makes product pages (`render-pdp`)
   makes it from one template page. Where somebody did — Justrite's hand-built `/apparel`,
   say — that page is kept and served.
2. writes that template, **`/categories/default`**, when the site has none: a heading and
   a `product-list-page` block with a `urlPath` row. It is an ordinary DA.live page. To
   change how every generated category page looks, the SC edits it (keeping the heading
   and the `urlPath` row) and republishes.
3. adds a "Shop the catalog" line and a `catalog-menu` block to `/nav`. In the browser the
   block reads the category tree from Catalog Service, as the shopper, turns the line into
   one menu entry per top-level category, and links each to its own address. Hand-typed
   nav items stay where they are.

There is no button. The pages, the template, the switch and the sheet below are made by
storefront setup and kept in step by reset and republish.

## Why authored pages need a list

The overlay is asked only when a path is **previewed**; a shopper's visit never calls it,
so a page is live only once something publishes it.

On a preview, Helix asks the overlay **first**. **Measured 2026-10-22 on scratch-1022-b:**
an authored DA.live page at a product path, previewed and published, was not served — the
overlay's product page was. So at a category's address the overlay would replace any
authored page there the next time anything previewed it (the SC pressing Publish in
DA.live, or a reset or republish).

The overlay therefore steps aside for every path listed in a public published sheet,
**`/authored-category-pages.json`**, served as `{data: [{path: "/apparel"}, ...]}`; Helix
then falls through to DA.live. And it renders category pages **only on a site where that
sheet exists**: no sheet, no category pages, which is how every site behaved before. An
empty sheet means "opted in, nothing authored".

Demo Builder keeps the sheet (`catalogMenu/authoredCategoryPages.ts`):

- **What it lists:** every category address (each segment cleaned as Helix cleans a
  published path) where DA.live holds a document that is not one of Demo Builder's own
  unedited generated pages. Found by reading DA.live at each address with the SC's own
  DA.live sign-in, the same reads the content copy makes.
- **When:** setup, reset, republish and a store change, every time, written to DA.live as
  a JSON sheet and then previewed and published at its `.json` path — **before** any
  category path is published. If it cannot be published, no category path is published
  that run, and the sentence says so.
- **Republish publishes it twice.** Republish previews every DA.live page in its bulk
  publish, before the catalog menu step runs; an authored page at a category address that
  the published sheet does not list yet would be replaced right then. So the sheet goes out
  before the bulk publish too (`publishAuthoredListStep`, the same computation), and the
  step writes it again afterwards. Reset has no such window: it takes the sheet out before
  re-publishing the content, so the overlay leaves the site alone until the sheet is back.
- **Storefront setup does the same, only where a sheet is already live.** An Edit that
  rebuilds onto an existing storefront refreshes the sheet after the content copy and right
  before the bulk publish (the pipeline's `beforeContentPublish` hook), but only when the
  record says Demo Builder published one: writing an empty sheet on a brand-new site would
  opt it in before the category step at the end of creation does.
- **Every bulk content publish is covered.** Republish and setup as above. Reset takes the
  sheet out first, and when that take-out fails (its sentence says so) the same hook
  refreshes the still-live sheet before reset's bulk publish. The import path runs the same
  hook before its publish, so a site whose published sheet is still live gets it current. A
  store change runs inside republish; the block-library refresh publishes no content. All
  three hooks are one helper, `catalogMenu/authoredSheetRefresh.ts`. Agent tools reach these
  same doors (`republish`, `reset_project`).
- **Then:** each listed address is published again, so DA.live's page is what goes out
  even if an earlier preview let the overlay replace it.
- **Never edited by hand.** Demo Builder rewrites it on each run.

## The page path, and what the overlay fills in

The overlay serves a category at one path only: each url path segment cleaned the way
Helix cleans published paths (lowercase, every run of other characters becomes one `-`).
`safety_cabinets` lives at `/safety-cabinets`. The extension builds the same path
(`categoryPagePlan.ts`), and so does the menu block. A category whose path cleans to
nothing gets no page, and the step's sentence names it. `/categories/default` is never a
category's page.

From `/categories/default` (`accs-discovery-service/actions/lib/category-page.js`): the
first `<h1>` becomes the category name, the `product-list-page` block's `urlPath` row its
url path (the block reads its category only from that row), and the title tags the name.
Everything else the SC put in the template is served as written. With no template, or one
without that block and row, the overlay serves a plain built-in page. The overlay serves,
and the publish action publishes, a category path only when the store's category list holds
it: a made-up path stays a 404.

## When it runs

| Flow | What it does | Where |
|---|---|---|
| Project creation | After the datapack is installed (the categories arrive with it) | `project-creation/services/catalogMenuPhase.ts` |
| Reset (dashboard, `reset_project`) | Takes the sheet out, and the template and switch while unedited, before re-copying the content; then the sheet, the category pages and the switch again | `eds/services/reset/edsResetCatalogMenu.ts` |
| Republish (dashboard, `republish`) | The sheet before the bulk content publish; after it, the sheet again, then every category page; pages of categories the store no longer has come down | `eds/services/storefront/storefrontContentRepublishService.ts` |
| Republish after a store change (EDS-44: Configure, dashboard, `republish`) | The same, for the new store: the old store's category pages come down | `eds/services/storefront/storeScopePages.ts` (`replaceCatalogMenuStep`) |
| A shopper opens a page nobody published | The smart-404 script asks `prepublish-pdp` to publish it, then reloads; when the action refuses, the storefront's own 404 stays as it was | `eds/services/pdp/pdp404Snippet.ts` |

All of the first four call one step file, `eds/services/catalogMenu/catalogMenuStep.ts`,
on a site built by `catalogMenuSiteDeps.ts`, and one run goes in this order:

1. **Read** the categories, the nav, the storefront's pages, and which category addresses
   DA.live holds a document for. A read that fails stops the run before any change.
2. **Remove** the pages the old model wrote (below) that nobody edited — first, so they are
   not mistaken for authored ones.
3. Write the **template** where there is none.
4. Publish the **sheet**, then the **category pages**, then take down the pages of
   **categories that are gone** (`categoryPagePublish.ts`).
5. Switch the **menu** on in `/nav`.

The step never fails the flow around it: every outcome comes back as one sentence for the
progress line and the log (and as `categoryPages` on the `reset_project` and
`republish` results), including how many authored pages the sheet keeps ("Kept 3 pages
you wrote at category addresses (/apparel, /hazard-communication, /workplace-safety): the
product page overlay leaves them alone.").

Category pages are published through the extension's own authenticated Helix path, five
at a time, on ACCS — the backend product pages are published for at setup
(`catalogPrewarmService.ts`). On PaaS the overlay lookup should work but is not measured,
so setup publishes no generated page (the sheet still goes, and authored pages are
published again). On ACO the overlay's category lookup does not apply, so there are no
generated category pages; the menu block has the same gap.

An existing project picks all of this up at its next reset or republish. Nothing is
written to a live site on extension start.

## No block, or no overlay

Without the block, or with `demoBuilder.byom.enabled` off or `demoBuilder.byom.overlayUrl`
empty, the step publishes nothing and writes no sheet, so the overlay leaves every
category address alone. With the overlay off it says why in one sentence (owner decision
D5): "Category pages come from the product page overlay, which is off for this storefront,
so no category pages were published and the catalog menu was not added." Whatever it made
earlier comes out — the generated category pages, the template, the switch, and the sheet.

## A category that already has a page

**A hand-built page for a category is always honored** (owner's rule, 2026-10-05).

- **At the category's own address** (`/apparel`): it is the category's page. The sheet
  keeps the overlay off it, the menu links there, no row is needed.
- **Anywhere else** (`/safety-signage` whose `product-list-page` block names `signs`): the
  menu links Signs to it with a row in the `catalog-menu` table in `/nav` — the category's
  url path, then the page — and the summary says so ("Signs and Labels uses your page at
  /safety-signage."). `/signs` is still published, so a link straight to it works too.

  | catalog-menu | |
  |---|---|
  | signs | /safety-signage |

What ties a page to a category elsewhere is the `urlPath` row of its `product-list-page`
block (older storefronts: a `category` row holding the category id). Setup reads the
storefront's pages to find them (`existingCategoryPages.ts`); matching ignores case and
stray slashes and covers block variants whose class starts with `product-list-page`. A
page at the category's own address wins over a page elsewhere naming the same category;
among pages elsewhere the shallowest wins (a language copy such as
`/citisignal-fr/accessories` sits deeper), then the first in alphabetical order.

The rows are authored content. **Ours are told from theirs by the record**: a row is ours
only while it says exactly what the record holds. A typed row, or one of ours the SC
changed, is theirs — never rewritten, never removed, and it wins over a row Demo Builder
would add for the same category.

### How the pages are found, and what it costs

One DA.live list call per folder (with the SC's sign-in), then one read per page, six at
a time, plus one read per category address for the sheet. Never opened: `/products`,
`/categories`, any `fragments` or `drafts` folder, and dot-folders (`.da`). If the pages
cannot be listed or read, nothing is changed and the sentence says why.

## What is never touched

- **A template Demo Builder did not write.** An existing `/categories/default` is never
  overwritten.
- **A page or template edited since.** Each is recorded with the hash of what DA.live
  stored after the write; content that no longer matches is the SC's now.
- **Any authored page.** Demo Builder writes no DA.live page per category, and never takes
  down an address DA.live holds a document for.

The record lives on the project, `componentInstances['eds-storefront'].metadata.catalogMenu`
(`catalogMenuRecord.ts`): the template's hash, the rows written in the nav table, whether
the switch was added, the generated category pages published (for taking down later),
whether the sheet was written, and — only while one is waiting to be removed — pages the
old model wrote. Edit mode carries it over when the storefront stays the same.

## Projects from before this change

Before EDS-61, Demo Builder wrote one DA.live page per category at the category's own
address (`/signs`) — the same address the overlay now serves. Those exist only on sites
built from unreleased branches. At the next reset or republish (owner decision D8; never
on extension start, because removing pages is a cloud write), FIRST in the run:

| Page | What happens |
|---|---|
| On the record, content still matches | Unpublished and deleted; the overlay's page replaces it |
| On the record, content changed | Kept. It is authored now: it goes on the sheet and stays served |
| On the record, removal failed | Still Demo Builder's: not on the sheet, tried again next run |
| Not on the record | An authored page: on the sheet, never touched |

## Undo

- **Reset** takes the sheet out before the content is published again, so the overlay
  leaves every category address alone meanwhile, then writes it again first.
- **No block, or the overlay off:** the generated category pages, the template, the switch
  and the sheet all come out — the site is back to the overlay leaving it alone.
- **Republish** takes down only the pages of categories the store no longer has.
- **Project delete** unpublishes and deletes the whole site, the sheet included.

Category pages are taken down by `removeCategoryPages` (`storefront/productPageRemoval.ts`,
shared with product pages): live, then preview, refused and named when another local
project publishes to the same repository.

**Known limit (owner, 2026-10-22).** A category page first published by a shopper's visit
(the smart-404 script) is not on the record. If that category is later deleted from
Commerce, its page stays live until a reset.

## Stale pages

A published page is a snapshot. A renamed category keeps its old heading, a template edit
does not show, and a deleted category's page stays live with an empty list — until the
next republish or reset. Products and prices are always current: the block loads them in
the browser. The template cache in the overlay adds up to five minutes. A page an author
writes at a category address after the last run is replaced by the overlay at its next
preview until the next republish lists it.

SEO: a generated page holds the heading and the block settings; products load in the
browser. Whether the query index and sitemap list the category pages is not checked.

## Agents

There is no category page tool. `republish` and `reset_project` run the step and return
its sentence as `categoryPages`. See `docs/systems/mcp-server.md`.

## Caveats

- A category page shows nothing until Catalog Service has indexed the store view, and on
  a B2B website until a shared catalog grants the category.
- The block also checks, as the current shopper, that each category has products to show.
- The library is off by default until the first watched live run.
- **The smart-404 script asks the action for any lowercase missing path** (a category's
  address cannot be told by its shape): one action call per such 404, refused by the
  action for anything that is not a category on an opted-in site.
- **Order of release.** The service that reads the sheet must be deployed first: an
  extension publishing category paths before the overlay answers them publishes 404s.
