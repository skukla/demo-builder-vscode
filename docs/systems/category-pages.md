# Category pages and the catalog menu

How an Edge Delivery storefront's nav reaches the Commerce catalog without anyone typing
the category structure into it (EDS-24). Plan: `.rptc/plans/dynamic-commerce-pages/`.

## What the SC gets

When the storefront has the **Demo Builder Blocks** library (a checkbox in the Storefront
area, off by default), storefront setup:

1. writes one page per Commerce category marked **Include in Menu**, at the category's
   own address (`/signs`, `/signs/danger-signs`). Each page is the boilerplate's recipe:
   the category name as a heading and a `product-list-page` block with that `urlPath`.
   They are ordinary DA.live pages; an author can edit them.
2. adds a "Shop the catalog" line and a `catalog-menu` block to `/nav`. In the browser the
   block reads the category tree from Catalog Service, as the shopper, and turns the line
   into one menu entry per top-level category. Hand-typed nav items stay where they are.

There is no button. The pages and the switch are written by storefront setup and kept in
step by reset and republish.

## When it runs

| Flow | What it does | Where |
|---|---|---|
| Project creation | After the datapack is installed (the categories arrive with it) | `project-creation/services/catalogMenuPhase.ts` |
| Reset (dashboard, `reset_project`) | Takes out what Demo Builder wrote, with the stored record, before re-copying the content; writes it again after publishing | `eds/services/reset/edsResetCatalogMenu.ts` |
| Republish (dashboard, `sync_content`) | Writes pages for categories added since; refreshes ours if unedited | `eds/services/storefront/storefrontRepublishService.ts` |

All three call one step, `eds/services/catalogMenu/catalogMenuStep.ts`, on a site built by
`catalogMenuSiteDeps.ts`. The step never fails the flow around it: every outcome comes
back as one sentence for the progress line and the log (and as `categoryPages` on the
`reset_project` and `sync_content` results).

An existing project picks this up at its next reset or republish. Nothing is written to a
live site on extension start.

## A category that already has a page

**A hand-built page for a category is always honored** (owner's rule, 2026-10-05).

Adobe lets a category page live at any address. What ties a page to a category is the
`urlPath` row of its `product-list-page` block (older storefronts: a `category` row
holding the category id), not the page's own path. So before writing anything, setup reads
the storefront's pages and looks for one that already shows each category
(`existingCategoryPages.ts`). Matching ignores case and stray slashes, and covers block
variants whose class starts with `product-list-page`.

When Signs already has a page at `/safety-signage`:

- No `/signs` page is written.
- The menu links Signs to `/safety-signage`. The link is a row in the `catalog-menu` table
  in `/nav` — the category's url path, then the page:

  | catalog-menu | |
  |---|---|
  | signs | /safety-signage |

- The summary says so by name: "Signs uses your page at /safety-signage."
- If Demo Builder wrote `/signs` on an earlier run, it removes it — only when nobody has
  edited it. An edited one stays and is reported.

The rows are authored content. The SC can see them, change them, and type their own to
point any category at any page; a category with a typed row gets no page from Demo
Builder either. **Ours are told from theirs by the record**: a row is ours only while it
still says exactly what the record holds. A typed row, or one of ours the SC changed, is
theirs from then on — never rewritten, never removed, and it wins over a row Demo Builder
would add for the same category.

Details that decide edge cases:

- A hand-built page AT the category's own address is the older case ("a page someone else
  made", below) and needs no row.
- When two pages name the same category, the first address in alphabetical order is used.
  Type a row to choose the other.
- A category whose own address the storefront cannot serve still gets its link when a
  hand-built page exists for it.
- The page is found in DA.live, published or not. A page that was never published will
  404 from the menu until it is.

### How the pages are found, and what it costs

One DA.live list call per folder (with the SC's sign-in), then one read per page, six at
a time. Never opened: `/products`, any `fragments` or `drafts` folder, and dot-folders
(`.da`). Left out: nav and footer documents, sheets, media. On a site with 300 pages in 20
folders that is about 320 requests on each setup, reset and republish — the same order of
work those flows already do per page. The published content index is not used: it lists
only published pages and carries page metadata, not blocks (the boilerplate's columns,
read 2026-10-05: path, title, description, image, lastModified, robots, template).

If the pages cannot be listed or read, nothing is written and the sentence says why.
Writing blind is how a second Signs page gets made.

## What is never touched

- **A page someone else made.** If a category's address already holds a page Demo
  Builder did not write — a colleague's hand-made `/apparel`, say — it is left alone and
  named in the sentence: "Left 1 page alone because Demo Builder didn't write it
  (Apparel (/apparel))."
- **A page edited since.** Each page's hash is recorded after it is written. A page whose
  content no longer matches is the SC's now: it is not refreshed, not removed, and drops
  out of the record.

The record lives on the project, `componentInstances['eds-storefront'].metadata.catalogMenu`
(`catalogMenuRecord.ts`): the pages written, with hashes, the category → page rows written
in the nav table, and whether the nav switch was added.
A record kept before the rows existed reads as having written none. Edit mode carries it over when the storefront stays the same.

## Undo

Reset removes exactly what the record proves Demo Builder wrote — its pages and its rows —
and takes the switch out of `/nav` byte-for-byte, then setup writes them again. Hand-built
pages are not touched. A `catalog-menu` table that still holds a row the SC typed stays in
the nav with that row; the sentence says the typed links were kept. A storefront whose repository no
longer has the block gets its menu taken out the same way, so the nav never names a block
the site does not have. Project delete removes the whole site.

## A category added after setup

It appears in the menu at once (the block reads Commerce live). Its page arrives at the
next republish or reset. Until then the block links it to the search page filtered to
that category, `/search?filter=categoryPath:<url path>`, which lists its products. The
block finds out which pages are missing with one `HEAD` request per shown category. A
category with a row in the table is taken to have a page: no request, no fallback.

Verified 2026-10-05 on the Justrite store: Catalog Service answers `categoryPath` with
`in` (what the search page sends) the same as `eq` (what a category page sends) —
45 and 45 for `signs`, 7 and 7 for `signs/danger-signs`, 0 and 0 for a path that does
not exist.

## Caveats

- A category page shows nothing until Catalog Service has indexed the store view, and
  on a B2B website until a shared catalog grants the category. Pages are written right
  after the datapack import at creation; if the catalog is not readable yet, the step
  says so and Republish writes them later.
- The block also checks, as the current shopper, that each category has products to
  show, so a buyer group never sees menu entries whose pages would be empty.
- The library is off by default until the first watched live run.
