# Category menu and pages without a button (EDS-24, redesigned)

Research: `.rptc/research/dynamic-commerce-pages/research.md` (read its UPDATE 3 first — the
web research on how brands actually do this). Replaces the button-driven shape of
`.rptc/plans/category-pages/overview.md`.

## The problem (owner, 2026-10-05)

An author has to type the Commerce category structure into the storefront's nav by hand.
The Demo Builder `catalog-menu` block removes that: it reads the category tree from Commerce
live in the shopper's browser, filtered to what that shopper may see. That is the core of
this item and it stays as built. What the menu still needs is somewhere for each link to
land.

## Decision (owner-approved 2026-10-05)

1. **The menu is the live block, switched on by storefront setup.** No tile, no button.
2. **Category pages are written automatically at storefront setup and reset**, as real,
   editable DA.live pages: the brand pattern (all four brands checked hand-author one page
   per category), done for the SC. Adobe documents this as "programmatic generation", one of
   its three category-page options.
3. **A page someone else made or edited is never touched** (ADR-013 hash-and-skip, already
   in `catalogMenuService`). A colleague's hand-made category pages stay theirs.
4. **A category added after setup** appears in the menu at once; its page arrives at the
   next reset or republish. **Fallback, if step 0 proves it:** until then its menu link goes
   to the search page filtered to that category, so it never lands on a 404.
5. **Not chosen:** Adobe's generated-template option (prerender-style overlay). Generated
   pages win over authored pages at the same path (aem.live BYOM precedence), no brand uses
   it yet, and it allows no per-category content. Kept open as research for product pages
   (backlog item EDS-25).
6. **Scope:** every Edge Delivery project, built and proven first against Adobe's boilerplate
   (the template every shipped package uses), and also any storefront an SC adds from a
   colleague. Nothing may depend on one store's categories, pages or blocks.

## Design gate

**What entity this is.** A storefront setup step: the menu switch in `/nav` plus one
generated page per category, each recorded with its hash. Not a dashboard action.

**What owns it.** Storefront setup and reset (Demo Builder) own writing and removing; the
`catalog-menu` block (Demo Builder Blocks library) owns drawing the menu; Commerce owns the
tree and who may see it. The record (pages written + hashes, whether the switch was added)
lives on the EDS instance: `componentInstances['eds-storefront'].metadata.catalogMenu`
(already a free-form record, so no schema change).

**Alternatives rejected.** The dashboard tile and button (owner: a brand would not need a
refresh button). A `/categories/` prefix (owner: no fixed URL structure). Generated
template pages via the overlay (see decision 5). Converting colleague pages into enrichment
content (rewrites their work).

**Product-intent choices still open:** none for this plan; the fallback in decision 4 is
built only if step 0 verifies it.

## Steps

Each step has tests and an undo. No cloud write until the live checks.

**0. Verify (reads only).**
- The search page's list block with `?filter=categoryPath:<urlPath>`: does Catalog Service
  accept it (`search-url.js` turns it into `in`, not `eq`)? Decides the decision-4 fallback.
- How reset clears pages setup published, so category pages follow the same path.
- Whether Justrite holds category pages from a dev run of the old button.

**1. Setup writes the pages and the switch.** Call `applyCatalogMenu` from the storefront
setup pipeline (after content copy and publish), only when the storefront's own copy has
`blocks/catalog-menu/`. Persist the record on the EDS instance. Report clashes (a category
whose path already holds a page we did not write) in setup's summary, by name. Tests: a
setup-phase test with and without the block; a clash is reported and the page untouched.
Undo: reset (step 2).

**2. Reset and delete undo it.** Reset calls `removeCatalogMenu` with the stored record
before re-copying content, then setup (step 1) runs again; project delete already removes the
site. Round-trip test: setup then reset returns `/nav` byte-for-byte and leaves no page
Demo Builder wrote.

**3. Republish picks up new categories.** Republish re-runs step 1's apply with the stored
record: new categories get pages, ours are refreshed only if unedited, others untouched.

**4. The fallback link (only if step 0 passes).** The block links a category with no page
to `/search?filter=categoryPath:<urlPath>`. Block-library change plus its tests.

**5. Delete the button.** The dashboard tile, `CatalogMenuModal`, `useCatalogMenu`,
`catalogMenuHandlers`, the `build_catalog_menu` / `remove_catalog_menu` tools, their
narration, consent copy, ledger rows, request types and tests. Nothing soft-deprecated;
count pins move down. `catalogMenuService`, `categoryPages`, `categoryReader`, `navSwitch`
and the block stay.

**6. Existing projects.** The next reset or republish applies it (no activation-sweep write
to a live site). Say so in the changelog.

**7. The library.** The Demo Builder Blocks library is off by default today. Recommend
default-on for packages that load a catalog, after the first live run passes.

**8. Docs and the AI bundle.** `docs/systems/` storefront setup page; `mcp-server.md`,
`mcp-tools.md`, `agent-alerts.md` lose the two tools; the generated AI files say category
pages are written at setup (AI_CONTEXT_VERSION bump).

## Live checks for the owner (watched; they write to live sites)

Run twice: first a fresh project from a shipped package (the boilerplate), then an added
colleague storefront (Justrite).

1. After setup: the nav shows the catalog menu with no typing; each top-level category
   opens its page with products.
2. As a guest vs a B2B buyer: the menu differs as their permissions say.
3. On the added storefront: its hand-made category pages are named in setup's clash report
   and unchanged.
4. Add a category in Commerce: it appears in the menu at once; with the fallback, its link
   opens the filtered search page; after Republish it has its own page.
5. Edit one generated page, then Republish: the edit stays.
6. Reset: the nav and pages return to the template's state.
