# Category pages through the product-page overlay (EDS-61)

## Revised 2026-10-22: top-level addresses (owner decision) — this section wins

The owner changed D1 the same day the design was approved. Everything below this section is
the original design; where it says `/categories/{url_path}`, read the category's own url
path. What changed, and what was built (extension and block library in their worktrees,
uncommitted; service reworked in parallel):

- **URL shape.** Each category's page is its own cleaned url path: `/signs`,
  `/signs/danger-signs`, `safety_cabinets` → `/safety-cabinets`. The template stays at
  `/categories/default`. The menu block links each category to `/{cleaned url path}`.
- **S0 is measured.** On scratch-1022-b, 2026-10-22, an authored DA.live page at a product
  path, previewed and published, was NOT served: the overlay's product page was. The
  overlay is asked first on preview and beats an authored page — section 1's "documented,
  not measured" row is now measured.
- **The authored-pages sheet.** So that authored pages at category addresses survive, the
  overlay steps aside for every path listed in a public published sheet,
  `/authored-category-pages.json` (`{data:[{path:"/signs"}, ...]}`), and renders category
  pages only on a site where that sheet exists (an empty list = opted in, nothing authored).
  Demo Builder writes it with its own DA.live access.
- **Order of one run** (setup, reset, republish, store change; one shared step,
  `catalogMenuStep.ts`): read everything first (categories, nav, pages, which category
  addresses DA.live holds a document for) → remove the old per-category documents Demo
  Builder wrote and nobody edited (stored record) → template starter → publish the sheet →
  publish category paths (generated ones on ACCS; authored ones again, so DA.live wins) →
  take down pages of categories that are gone → nav switch. A sheet that fails to publish
  means no category path is published that run.
- **What the sheet lists:** every category address with a DA.live document that is not one
  of Demo Builder's own unedited generated pages (an edited old page lands in it; one whose
  removal failed does not).
- **Undo.** The sheet is part of what the step makes: reset takes it out before the content
  is published again (so the overlay leaves the site alone meanwhile) and writes it first
  when it puts things back; no block or overlay off takes it out with the generated pages,
  template and switch; project delete removes the site. Republish never takes it out.
- **Sites without the block** get no sheet, so the overlay leaves them alone.
- **Republish's bulk publish** goes after an early sheet (`publishAuthoredListStep`, same
  computation), so no authored page at a category address is previewed while unlisted
  (owner, open point 3). Pinned by a test in `storefrontContentRepublishService.test.ts`.
- **Known limit (owner, open point 4, not built):** a category page first published by a
  shopper's visit is not on the record; if the category is later deleted it stays live
  until a reset.
- **ADR-005** has a "Category pages ride the same overlay" section (open point 5).
- **Smart-404.** A category address cannot be told by shape, so the `delayed.js` snippet
  asks `prepublish-pdp` for any other lowercase missing path, with no loading state, and
  leaves the storefront's own 404 untouched when the action refuses.
- **Unchanged from the approved design:** D2–D8 (template + fallback + starter; delete the
  menu's HEAD check and search fallback; delete both tools; overlay-off sentence; all
  categories with a url path; migration at next reset/republish only), the watcher,
  setting, override and timer deletions, and the ACCS/PaaS/ACO behaviour.

Design only below this line. The revision above has been built in the extension and
block-library worktrees (uncommitted); nothing has been deployed or written live.
Backlog item: EDS-61 (`/private/tmp/rc-merge/.rptc/backlog/2026-10-22-category-pages-through-the-overlay.md`;
not yet in this worktree's `.rptc/backlog/`).

Read at: extension worktree `feature/erp-integration` @ `c9b0d1d2a`; `accs-discovery-service`
local checkout on `feature/datapack-store` @ `e4ccd65`, deployed build `origin/main` @ `8035199`
(the render-pdp, prepublish-pdp and pdp-product code is identical on both, checked with
`git diff --stat origin/main feature/datapack-store`); block library @ `b160c2f`.
Live reads were plain GETs (and one read-only Catalog Service query) on the scratch-1022 site,
2026-10-22.

## The short version

- Category pages move under a prefix, **`/categories/{url_path}`**, served by the same overlay as
  product pages, from one authored template, **`/categories/default`**.
- The reason for the prefix is one hard rule: when a page is previewed, Helix asks the overlay
  **first**. At root addresses the overlay would replace every authored page that shares a
  category's address, on every site at once. Under a prefix it cannot collide with anything.
- The overlay only runs when a page is previewed. A shopper's visit never calls it. So pages
  still have to be published: at setup, reset and republish (like product pages today), and on
  first visit through the smart-404 script (like product pages today).
- Demo Builder stops writing a DA.live document per category. The watcher (EDS-27), its setting
  and both agent tools go.
- EDS-24 has not shipped. Its first commit (`f7b196e3c`) is on no tag, not on `origin/develop`
  or `origin/master`. Only dev and scratch sites hold its pages, so the migration is small.

## 1. How render-pdp decides a request today

All citations are `accs-discovery-service/actions/...`.

| Step | What happens | Where |
|---|---|---|
| Path | `__ow_path`; `/__version` answers the build first | `render-pdp/index.js:89-96` |
| Shape | Path must be exactly `/products/{urlKey}/{sku}`. It strips the query, trailing slashes and the `.html` suffix first. `urlKey === 'default'` is refused, so `/products/default` stays authored content | `render-pdp/parse-path.js:23-58` |
| Not a product shape | `404`, empty body. Helix falls back to DA.live | `render-pdp/index.js:98-104`, `:227-233` |
| Product lookup | Reads the site's served `config.json` (`public.default`, `commerce-endpoint`, `headers.cs`). Then asks Catalog Service by `url_key`, then by SKU. Three answers: `found`, `absent`, `unknown` | `lib/pdp-product.js:65-101`, `:144-171` |
| Template | GET `https://main--{site}--{org}.aem.live/products/default` with a browser UA. Cached per `org/site` for 5 minutes in the warm container. Failures are not cached | `render-pdp/index.js:157-190` |
| Absent product, or not the canonical path | `404` | `render-pdp/index.js:115-122` |
| Otherwise | `200`: the authored template (or the bundled shell `PDP_TEMPLATE` when the fetch fails), plus `<meta name="sku">` when found. `unknown` fails open | `render-pdp/index.js:124-131`, `render-pdp/template.js:11-28` |
| Crash | `500` | `render-pdp/index.js:132-139` |

`org`/`site` are checked against `[a-zA-Z0-9_-]` before any URL is built, and the host is pinned
to `aem.live` (`render-pdp/index.js:36,158`; `lib/pdp-product.js:24,66`).

**How Helix reaches it.** `registerSite` PUTs
`content.overlay = { url, type: 'markup', suffix: '.html' }` with no path pattern
(`src/features/eds/services/configService/siteConfigParams.ts:85-111`). The URL carries
`?org=&site=` (`src/features/eds/handlers/byomOverlay.ts:97-116`). So Helix asks the overlay for
**every** path it previews, with `.html` added. Measured today: the deployed action answers
`/signs.html`, `/nav.html` and `/products/default.html` for scratch-1022 with `404` and an empty
body. Deployed build: `8035199`.

**Overlay vs DA content: which wins.**

| Claim | Status | Source |
|---|---|---|
| The overlay is asked only when a page is previewed, never on a shopper's request. An unpublished path is a 404 on the live site | **Measured** 2026-06-09 | `.rptc/research/multitenant-prerender-evaluation/addendum-2026-06-09-runtime-validation.md:11-35`; ADR-005 `docs/architecture/adr/005-byom-pdp-routing.md:30` |
| On preview, the overlay is asked **first**. Its 404/401/403 falls through to DA.live. So an overlay that answers a path **beats** an authored page at that path | **Documented by Adobe, not measured here.** aem.live/developer/byom: a preview "will always result in the path being fetched from the overlay content source first" | `.rptc/research/eds-pdp-routing-validation/findings.md:101,154`; `.rptc/research/dynamic-commerce-pages/research.md:92-98` |
| A repository file beats a DA.live sheet at the same path | **Measured** 2026-10-12 (a different question: code vs content, not overlay vs content) | `.claude/skills/eds-publish-and-config/SKILL.md:39` |
| A page already live stays as it is until something previews that path again | Follows from the first row; not separately measured | |

**The backlog item says the opposite of the documented rule.** It says an edited page "stays and
wins, since published content is served before the overlay's fallback". That holds only until the
next preview of that path. Then the overlay wins. Previews happen often: the SC presses Publish in
DA.live, and reset and republish preview every DA page. So at root addresses an SC's edited
`/signs` would be replaced the next time they published it. That is why this design uses a prefix
(section 4).

The overlay cannot check whether DA.live has a document at a path. Measured today:
`content.da.live/skukla/scratch-1022/signs.html` answers `401` without credentials, and so does
`admin.hlx.page/status/...` on a locked site.

## 2. How the overlay tells a category path from any other path

**Shape first.** Under the prefix, only `/categories/{a}[/{b}...]` is a candidate. `/categories/default`
is refused, like `/products/default`, so the authored template stays authored. Every other path
keeps today's 404. No Commerce call is made for `/nav`, `/index` or anything else.

**Then Commerce.** The overlay already reads everything it needs per site, with no credentials:
the site's served `config.json` gives the Catalog Service endpoint and the store headers
(`lib/pdp-product.js:144-171`). One query lists the store view's categories:

```graphql
{ categories(ids: []) { urlPath name } }
```

Measured today on scratch-1022 (Justrite store, guest headers from its `config.json`): `200`,
15 categories, including `signs`, `signs/danger-signs`, `safety-cabinets`, `5s-visual-workplace`,
and two root categories with an empty `urlPath`. `categories(roles: ["show_in_menu"])` returned
the same 15. `categories(subtree: ...)` without an id is an error. `includeInMenu` is not a field
(`CategoryView` has `roles` instead).

Rules:

- **Which categories get a page:** every category with a non-empty `urlPath`, not only menu ones.
  A link from a promo or a hand-typed nav item should work too.
- **Cache:** one map `urlPath → name` per `org/site`, 5 minutes in the warm container, the same
  as the template and config caches. Failures are not cached. No explicit invalidation: a new
  category is seen within 5 minutes, and only previews ever ask.
- **Answers:** `found` (serve the page), `absent` (the list came back and does not hold it: `404`),
  `unknown` (config or Catalog Service failed). `render-pdp` fails open on `unknown` for products;
  for categories it should **fail closed (404)**. A made-up `/categories/x` that gets published
  stays live forever, and only the extension can remove it.
- **Non-category miss:** `404` with an empty body, the same as today, so Helix falls back to DA.
- **B2B:** `categories` lists a category whether or not a shared catalog grants it (measured: guest
  headers saw all 15). The page exists for everyone. Its product list is per buyer group, which is
  what happens today.

**PaaS and ACO.** The same query runs on Catalog Service for PaaS. Not measured here.
ACO uses `categoryTree` per category family, not `categories`
(`.rptc/research/dynamic-commerce-pages/research.md:42-46`, reading `aem-commerce-prerender`).
On ACO the lookup returns `unknown`, so no page. The catalog-menu block uses the same `categories`
query, so it has the same gap today.

## 3. The template

**Where:** `/categories/default`, an authored DA.live page, the same pattern as `/products/default`.
It does not exist on any site today (measured: scratch-1022 `/categories/default` → 404; no
package's content copies one).

**What it holds:** at minimum

```
<h1>Category name</h1>
product-list-page
  urlPath | default
```

Anything else the SC adds (a hero, enrichment, recommendations) is kept as written.

**What the overlay changes in it, per category:**

1. The text of the first `<h1>` → the category name (HTML-escaped).
2. The value cell of the `product-list-page` block's `urlPath` row → the category's url path. The
   block reads its category only from that row, never from the URL
   (`.rptc/research/dynamic-commerce-pages/research.md:79-88`, re-read across every template in
   UPDATE 2). So the overlay has to write the row.
3. `<title>`, `og:title`, `twitter:title` → the category name. Measured: today's DA-written
   `/signs` carries `<title>Signs and Labels</title>`. Helix set the canonical link itself
   (`https://main--scratch-1022--skukla.aem.live/signs`). For product pages, the earlier research
   saw the canonical and `og:url` rewritten per path (`eds-pdp-routing-validation/findings.md:26`).

If the template is missing, or has no `product-list-page` block with a `urlPath` row, the overlay
serves a bundled shell instead: the three lines above inside `<div class="section">`. This is the
category version of `PDP_TEMPLATE`. Adobe's prerender serves the same shape.

**How SC edits reach the pages.** An edit to `/categories/default` reaches a category page only
when that page is next previewed. The template cache adds up to 5 minutes. This is also true for
product pages today. The README's "SC customizations inherit on every PDP automatically"
(`accs-discovery-service/README.md:167-174`) is true only for pages previewed after the edit.
Republish re-publishes every category page (section 6), so that is the "apply my template edit"
button. Say so in the docs and the bundle skill.

**Who writes the template.** Recommendation: storefront setup writes a starter
`/categories/default` when the site has none. It never overwrites one that exists, and it records
the hash so reset can tell an untouched starter from an edited one, using the same record as
today. Without this, the SC has no page to edit and does not know one is expected. Content copy
must keep `/categories/default`: `filterProductOverlays` only special-cases `/products/`
(`src/features/eds/services/daLive/daLiveContentReferences.ts:37-48`), so it already passes. Add a
test pinning that.

## 4. The URL shape

**Can the overlay serve root paths?** Technically yes. It is asked about every previewed path
(section 1). But three things make root paths the wrong choice here:

1. **It replaces authored pages on every site at once.** One deploy reaches every SC's site.
   Any site with an authored page at a category's address loses it on its next preview. Justrite
   has hand-built `/apparel`, `/hazard-communication` and `/workplace-safety`
   (`dynamic-commerce-pages/research.md:418-424`). The boilerplate has `/apparel`. Reset and
   republish preview every DA page, so this happens on the next reset, without anyone choosing it.
2. **Edited pages cannot win.** Section 1: the overlay cannot see DA.live, and it is asked first.
3. **Smart-404 cannot recognise a category by shape.** It would have to call the shared action
   for every 404 on the site.

**Recommendation: `/categories/{url_path}`**, for example `/categories/signs/danger-signs`. It
mirrors `/products/`. Adobe's prerender uses root paths
(`dynamic-commerce-pages/research.md:48-53`). That is the cost of this choice: the URLs are not
Adobe's canonical shape. For demos that is cosmetic.

Segments outside `[a-z0-9_-]` cannot be served: the CDN 404s percent-encoded paths (skill rule 8;
`categoryPages.ts:48-57`). Today's check moves to the publish planner and keeps reporting them.

**What the menu links to.** The catalog-menu block (`demo-builder-block-library/blocks/catalog-menu/`):

- builds `/${urlPath}` for every category (`catalog-menu-core.js:218-223`);
- sends one `HEAD` per shown category to find missing pages and, for a missing one, links to
  `/search?filter=categoryPath:<urlPath>` (`catalog-menu-core.js:191-216`, `catalog-menu.js:27-31`);
- honours `category | page` rows in its table, with no check (`catalog-menu-core.js:97-105,218-220`).

The change: links become `/categories/${urlPath}`. Rows stay as they are. Recommendation: delete
the per-category `HEAD` and the search fallback, because smart-404 now makes every category page
exist on first visit. That is the owner's call (decision D3).

**Hand-built pages stay honoured** by the rows. Demo Builder already finds a page anywhere on the
site that shows a category and writes a `category | page` row for it
(`existingCategoryPages.ts`, `catalogMenuService.ts:282-334`). An edited page Demo Builder wrote at
`/signs` becomes one of those: it stays at `/signs` and the menu links Signs to it.

## 5. Existing projects

**Who has them.** Only sites built from unreleased branches (section "short version"). Measured
on scratch-1022: `/signs`, `/signs/danger-signs` are live DA pages (`/signs.plain.html` is the
EDS-24 recipe: `<h1>` and `product-list-page` with `urlPath | signs`).

**The record.** `componentInstances['eds-storefront'].metadata.catalogMenu`
(`src/features/eds/services/catalogMenu/catalogMenuRecord.ts:20,38-49`):
`pages: [{path, hash}]`, `links: [{urlPath, path}]`, `navSwitch`. The hash is taken from a read
after the write (`catalogMenuService.ts:131-161`).

**What happens to each page:**

| Page | What happens | Why |
|---|---|---|
| On the record, content still matches the hash | Unpublish and delete, with the existing `removeOwnedPage` (`catalogMenuService.ts:166-180`) | Nobody edited it |
| On the record, content changed | Kept. Gets a `category | page` row in the nav so the menu links to it. Dropped from the record | It is the SC's page now. Rows are how hand-built pages are honoured |
| Not on the record | Never touched | Someone else's page |

**When:** the next reset or republish, as one step inside them (`takeOutCatalogMenu` already runs
the removal on reset: `src/features/eds/services/reset/edsResetCatalogMenu.ts:54-67`). Not on
extension start: removing pages is a cloud write (property 5). After the removal, the same run
publishes the `/categories/*` pages and refreshes the rows, so the menu never points at nothing.
With the old block still in the repository, links to the removed root pages fall back to search
(its `HEAD` check), so nothing breaks between the two halves.

The pages part of the record (`pages`) is deleted from the type once nothing writes it. A record
that still carries `pages` is read once by the migration and then rewritten without it.

**Agent surface:**

| Tool / field | Fate | Where |
|---|---|---|
| `add_category_pages` | **Delete** (recommended, D4). There is nothing to add: a category's page exists on first visit, and `sync_content` re-publishes all of them | `src/features/ai/server/categoryPageTools.ts:137-...`; narration `toolNarration.ts:230`; alert copy `agentAlertCopy.ts:213`; ledger `tests/sop/reversibility.ledger.json:118`; pin `tests/templates/spine-chokepoints.test.ts:545` |
| `check_category_pages` | **Delete** with it | `categoryPageTools.ts:110-...`; `toolNarration.ts:229` |
| `sync_content`, `reset_project` | Keep the `categoryPages` field. It now says how many category pages were published, how many old ones were removed, and which edited pages were kept | `storefrontTools.ts:265`, `edsResetTool.ts:168` |
| `get_settings` allow-list | Remove `demoBuilder.categoryPages.autoAdd` | `settingsTools.ts:79` |
| Bundle skills | Rewrite the category paragraphs; bump `AI_CONTEXT_VERSION` (now 42, `src/core/constants.ts:300`; comment at `:272`) | `templates/skills/header-nav-footer.md:62`, `templates/skills/author-commerce-data.md:89-99` |

Agents keep the same reach as people: no button exists for this either.

## 6. What changes

### accs-discovery-service

1. **`render-pdp` gets a second branch.** A small dispatcher: product shape → today's code,
   unchanged; category shape → the new branch; anything else → 404. The cache key becomes
   `org/site/kind`, so the two templates do not share a slot. The action name and URL stay the
   same: every site's registration points at it (`package.json:434-440` in the extension).
2. **`lib/category-page.js`**: the category list lookup (section 2) and the template surgery
   (section 3), in their own file next to `pdp-product.js`.
3. **`prepublish-pdp` accepts category paths** behind their own guard. Only `found` publishes
   (fail closed). The scope guard stays explicit: product shape or category shape, nothing else
   (`prepublish-pdp/index.js:57-61`). It publishes at the path Helix reports back (`:91-93`).
   Recommendation: keep the one action with two named guards, rather than a third action, so the
   smart-404 script and the key store stay as they are.
4. **Tests:** parse, dispatch, lookup (found/absent/unknown), template surgery (missing h1,
   missing block, escaping), cache per kind, prepublish guard. Every render test calls the path
   with `.html`, the way Helix does (`docs/architecture/eds-byom-pdp-routing.md:293`).
5. **README:** the category branch, its responses, and the corrected sentence about which source
   wins.

**Deploy.** `npm run deploy` runs `aio app deploy` for the whole app (`package.json:8`).
**Deploy from a branch cut from `origin/main`**, not from the local `feature/datapack-store`
checkout: that branch would ship the unreleased datapack-store actions as well.
**This is a live change for every SC's storefront. It is the owner's go.** The deploy is low-risk
on its own: until a site publishes a `/categories/*` path, nothing changes for it. Any other path
still gets the same 404. Confirm with `GET /render-pdp/__version` after the deploy.

### Extension

**Delete** (no soft deprecation):

- `catalogMenu/categoryPages.ts` (the page writer; its safe-path check moves to the publish
  planner), `newCategoryPages.ts`, `newCategoryPagesWatcher.ts`, `categoryPageAutoAdd.ts`,
  `eds/handlers/newCategoryPagesWatch.ts`, the watcher wiring in `extension.ts:521`, the setting
  `demoBuilder.categoryPages.autoAdd` (`package.json:336`), the per-project override
  `metadata.autoAddCategoryPages`, `TIMEOUTS.NEW_CATEGORY_PAGES_CHECK_INTERVAL`,
  `findNewCategoryPagesStep` / `addNewCategoryPagesStep` (`catalogMenuStep.ts:208-285`), both
  tools (section 5), and their tests (`newCategoryPagesStep.test.ts`,
  `newCategoryPagesWatcher.test.ts`, `categoryPages.test.ts`, `categoryPageTools.test.ts` and
  the rows in `responseCeilings.ts`, `tool-auth-declarations.test.ts`).
- In `catalogMenuService.ts`: `writePlannedPage`, `yieldToOwnPage`, `writeOwnedPage` and the
  `pages` half of the record, once the migration step has run its course (step E5).

**Keep:**

- `categoryReader.ts`: it now feeds the publish planner and the hand-built-page matching.
- `existingCategoryPages.ts`, `navSwitch.ts`, `blockTable.ts`: hand-built pages and rows.
- `catalogMenuStep.ts`, `catalogMenuSiteDeps.ts`, `catalogMenuSummary.ts`: the one step every
  flow calls. The sentences change.

**Add:**

- **Category publish** next to product pre-warm (`catalogPrewarmService.ts`). It publishes
  `/categories/{urlPath}` for every category, through the extension's own authenticated Helix path
  (`publishOne`, `:274`). It runs where pre-warm runs: creation, reset, republish, and a store
  change.
- **Category page removal**, by generalising `storefront/productPageRemoval.ts`. It lists
  published `/categories/*` paths from Helix, leaves out any path DA.live has a document for
  (`/categories/default`), and unpublishes the rest, with the same shared-repository refusal. Reset
  and the store-change flow (`storeScopePages.ts:176`) call it. This is the undo (property 1).
- **Smart-404:** the `delayed.js` snippet (`pdp/pdp404Snippet.ts:117-209`) learns the
  `/categories/...` shape and calls the same prepublish endpoint. The `delayed.js` block is
  re-written in place when it changes (`pdp404HandlerPublisher.ts:156-181`), on creation, reset
  and updates (`thinLayerUpdate.ts`). The eager `head.html` redirect is product-only and is
  skipped when present (`:237,264`). Categories do not need it, because category url paths are
  already lowercase.
- **Starter template:** write `/categories/default` when the site has none (section 3).

**The menu block** (block library): link prefix, and D3.

**Tests:** extension changes follow `gate`. The reversibility ledger loses the
`add_category_pages` row. Category removal gets a row. The spine-chokepoint pin for the watcher
goes.

## 7. Risks

| Risk | What it means | Handling |
|---|---|---|
| **SEO** | Published category pages are HTML with the heading and the block settings. Products load in the browser. That is the same as today's DA pages, and less than Adobe's prerender (first 9 products and JSON-LD in the HTML). Whether the site's query index and sitemap list `/categories/*` is not checked | Fine for demos. Say it in the doc |
| **Stale pages** | A published page is a snapshot. A renamed category keeps its old heading. A template edit does not show. A deleted category's page stays live with an empty list. All three last until the next republish or reset. Products and prices are always current | Republish re-publishes all of them and removes pages for categories that are gone. The docs say this plainly |
| **Overlay off** | `demoBuilder.byom.enabled` false, or `demoBuilder.byom.overlayUrl` empty: no overlay is registered (`byomOverlay.ts:97-116`), so no product page works and no category page can exist | Recommendation (D5): no category pages, and the nav switch is not added. The step's sentence says category pages need the product page overlay. No second, DA-page path is kept |
| **PaaS** | Product pre-warm skips non-ACCS backends (`catalogPrewarmService.ts:140-144`). The overlay lookup should work against PaaS Catalog Service, but this is not measured | Category publish follows the same gate as product pre-warm. PaaS gets pages through smart-404 until someone measures it |
| **ACO** | `categories` is not ACO's query (section 2) | Lookup answers `unknown` → no page. The same as the menu block today. Separate item if needed |
| **Store change (EDS-44)** | The overlay picks up the new store's `config.json` within 5 minutes. Pages published for the old store stay live | The store-change flow removes `/categories/*` and publishes the new store's set, the same way it handles products today |
| **Shared action** | One deploy changes behaviour for every site. The project is in a Stage workspace the maintainer does not administer (`accs-discovery-service/README.md:232-245`) | Owner's go. Product branch unchanged. Version check after deploy |
| **Precedence is documented, not measured here** | If Adobe's rule were wrong, nothing in this design breaks: the prefix holds no authored pages to compete with | Step S0 measures it anyway, on a scratch site, with the owner's go |
| **Arbitrary publishes** | Anyone can call prepublish with a made-up path | Category prepublish fails closed: only a confirmed category is published |

## Stepwise plan

**Service (accs-discovery-service, a branch from `origin/main`)**

- S0. **Measured 2026-10-22 on scratch-1022-b:** an authored DA document at a product path,
  previewed and published, lost to the overlay's answer. The overlay wins on preview.
- S1. `lib/category-page.js`: list lookup with cache, three answers. Tests first.
- S2. Template surgery and the bundled shell. Tests first.
- S3. Dispatcher in `render-pdp`; product branch untouched (its tests must pass unedited).
- S4. Category guard in `prepublish-pdp`, fail closed.
- S5. README.
- S6. **Owner's go:** deploy; check `/__version`; GET `/render-pdp/categories/signs.html?org=&site=`
  on scratch-1022 (a read).

**Extension (after S6)**

- E1. Category publish beside product pre-warm; wire it into creation, reset, republish and the
  store change.
- E2. Category page removal (generalised `productPageRemoval`); wire it into reset and the store
  change.
- E3. Smart-404 `delayed.js` snippet learns the category shape.
- E4. Starter `/categories/default`, with a recorded hash.
- E5. Migration inside the existing step: remove unedited recorded pages, turn edited ones into
  nav rows, then drop `pages` from the record. Delete the page writer.
- E6. Delete the watcher, setting, override, timer and both tools, with their tests and pins.
- E7. Block library: `/categories/` links (and D3).
- E8. Bundle skills, with an `AI_CONTEXT_VERSION` bump.

**Docs**

- D-1. Rewrite `docs/systems/category-pages.md`. Add a category section to
  `docs/architecture/eds-byom-pdp-routing.md` and ADR-005 (or a new ADR).
- D-2. Fix the precedence sentence in the skill's knowledge: add one line to
  `eds-publish-and-config` ("the overlay is asked first on preview; it beats an authored page at
  the same path").
- D-3. `mcp-server.md`, `mcp-tools.md`, `agent-alerts.md`: tool rows removed. CHANGELOG.
- D-4. Correct EDS-61's "an edited one stays and wins" line.

**Order:** service first, then the extension, then the block library. The extension must not
publish `/categories/*` before the overlay answers them: Helix would fall through to DA, find
nothing, and publish nothing (or a 404).

## Decisions for the owner

| # | Decision | Recommendation |
|---|---|---|
| D1 | URL shape: root (`/signs`, Adobe's form) or prefix (`/categories/signs`) | Recommended prefix. **Owner chose root, 2026-10-22**, with the authored-pages sheet to keep authored pages (see the revision at the top) |
| D2 | Template: authored `/categories/default` with a bundled fallback, and a starter written by setup? | **Yes to all three.** The starter is what tells the SC the template exists |
| D3 | Menu block: keep the per-category `HEAD` check and search fallback, or link straight to the page? | **Link straight; delete the check.** Smart-404 makes every category page exist on first visit, and the check costs one request per category per page view |
| D4 | `add_category_pages` / `check_category_pages`: delete or repurpose? | **Delete both.** `sync_content` re-publishes every category page; nothing is left to add |
| D5 | Overlay off: no category pages, or keep writing DA pages for those sites? | **No category pages, no nav switch, a sentence that says why.** Two paths for one job is what this item removes |
| D6 | Which categories get a page: all with a url path, or only "show in menu"? | **All.** On Justrite the two sets are the same today (15 and 15) |
| D7 | Deploy the shared action (live for every SC) | Your go, after S1–S5. Run S0 first if you want the precedence rule measured rather than taken from Adobe's docs |
| D8 | Migration trigger: next reset/republish only, or also an explicit one-off? | **Next reset/republish only.** Only dev and scratch sites have these pages |
