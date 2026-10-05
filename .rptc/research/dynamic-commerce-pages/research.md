# Dynamic Commerce pages: one template per page type, routed like product pages

Research for the owner decision of 2026-10-05: storefront pages that show Commerce data
work the way a real brand builds them. Each page type has one authored template. The page
fills from live Commerce data when someone views it. Routing uses the same mechanism Demo
Builder already uses for product pages. Pages are not written ahead of time by a Demo
Builder button.

Status: **partial.** The Demo Builder side and the shared render action were read in full.
Two research threads did not finish before this file was written:

- Adobe's canonical docs and `adobe-rnd/aem-commerce-prerender`, on whether it covers
  category pages (question 2)
- the storefront templates' block code, including whether `product-list-page` can take
  its category from the URL (questions 1 and 3b)

Every claim that depends on those threads is marked **UNVERIFIED** below.

Read at: Demo Builder worktree `feature/erp-integration` @ `c18830210`; discovery service
@ `2fb1924`; block library @ `4412770`.

## UPDATE (same day): Adobe's canonical answer arrived, and it changes two recommendations

The docs and prerender thread returned after the sections below were drafted. Its findings
take precedence over anything marked UNVERIFIED below.

Sources:
- `adobe-rnd/aem-commerce-prerender` @ `91a491c0` (2026-09-23), read with `gh api` GET.
- The storefront docs bundle
  `experienceleague.adobe.com/en/tools/commerce-storefront/llms-full.txt` (2026-10-02).
- `aem.live/developer/byom`.
- `aem.live/docs/admin.html`.

### Prerender now renders category pages

**VERIFIED.** It renders category pages as well as product pages:

- README line 3.
- Commit "feature: Adds Category (PLP) support for aco (#267)", 2026-08-26.
- `actions/plp-renderer/`, `actions/render-all-categories/{index,poller}.js`.

How it works:

- **Discovery.** For ACCS and PaaS it uses the Catalog Service `categories` query. For ACO
  it uses `categoryTree` per `ACO_CATEGORY_FAMILIES` (`render-all-categories/poller.js`
  :241-252).
- **Re-rendering.** It polls only: categories every 15 minutes, product changes every 5
  minutes. Every cycle it re-renders each category and republishes only if the HTML hash
  changed (:90-104, :283). Categories that vanish are unpublished (:118-163).
- **Docs limitation.** The docs say "Category updates aren't detected reactively."

### Category URLs sit at the site root

**VERIFIED.** `getCategoryUrl` (`actions/utils.js` :544-579) builds
`/{locale?}/{urlPath segments}` with each segment sanitized. There is no prefix and no
configurable format. A code comment says a `CATEGORY_PAGE_URL_FORMAT` "can be added".

### Prerender has no authored template for category pages

**VERIFIED.** It renders from repo Handlebars files
(`plp-renderer/templates/{page,head,product-listing}.hbs`). The output is:

- an `<h1>`
- a `product-list-page` block **with a `urlPath` row**
- breadcrumbs and the description
- the first 9 products
- JSON-LD (`BreadcrumbList`, `ItemList`)

The product page path is different. Prerender fetches the authored `/products/default`
and swaps only its `.product-details` block (`pdp-renderer/render.js` :100-111).

### The list block reads its category only from its own table

**VERIFIED.** `product-list-page` takes `urlpath` from the block table alone
(`hlxsites/aem-boilerplate-commerce/blocks/product-list-page/product-list-page.js`
:29, :55-79). It never reads page metadata or the URL. With no `urlPath` it acts as the
search page (:88-90).

This answers 3(b). The block cannot take its category from the URL. **The renderer must
write the `urlPath` row into the page**, which is exactly what Adobe's renderer does. No
template-side patch is needed.

### Adobe's documented order for category pages

**VERIFIED.**
1. Prerender.
2. A DA page authored by hand.
3. A script that generates DA pages.

EDS-24 as built is option 3, Adobe's last choice.

### One overlay per site; the overlay wins

**VERIFIED.**
- One overlay per site, tied to the base content.
- At preview the overlay is tried first. A 404, 401 or 403 from it falls through to DA.
- Prerender puts product and category HTML behind the **same** overlay.
- So an overlay that answers a path wins over an authored page at that path.

### Search stays in the browser

**VERIFIED.** Search is `product-list-page` with no `urlPath` plus a query parameter.
Nothing prerenders it.

### Sitemaps are not automatic

The docs claim prerender "updates the sitemap". **UNVERIFIED in code:** prerender has no
sitemap logic. Product pages are excluded from the default sitemap index. Root-level
category pages would likely be included once published. That last point is an inference.

### What changes in the recommendations

1. **Path shape.** Adobe's canonical form is root paths: `/{urlPath}`, the same as the
   boilerplate's `/apparel` and the links the catalog-menu block already builds. The
   prefix recommendation in 3(c) is downgraded to an owner decision; see the plan.
   - The price of root paths is the collision risk in 3(c). A category path that matches
     an authored page shadows it.
   - Adobe accepts that price. The action can limit it by answering only paths that
     Commerce confirms are categories (one cached category list per site), and setup can
     report any collision with existing DA pages.
2. **How the block gets its category.** The action writes the `urlPath` row. This
   resolves 3(b) without a patch.
3. **The template.** We can keep the owner's "one authored template per page type".
   Fetch an authored `/categories/default` and swap in the `<h1>` and the
   `product-list-page` `urlPath`, the way prerender treats `/products/default`. Fall back
   to Adobe's bare shape when the site has no template doc.

The storefront-template inventory thread (exact block lists per template) had still not
returned when this file was handed back. Those details remain **UNVERIFIED**.

## 1. Inventory: which pages show Commerce data, and which belong in this approach

The test is one question. Is the data **public catalog data** that one URL per entity
should serve? If so, the page is in scope: it gets a crawlable URL and a server-routed
template. If the data belongs to one shopper's session, the page stays a fixed authored
page and the drop-in renders it in the browser.

| Page type | Data | Verdict | Why |
|---|---|---|---|
| Product detail `/products/{urlKey}/{sku}` | public catalog | **IN (already built)** | ADR-005. Overlay, pre-warm and smart-404 exist |
| Category / product list | public catalog | **IN (new)** | One URL per category; the menu links to it. Today it is one DA page per category (EDS-24) |
| Search results `/search?q=` | public, query-driven | **OUT** | One page; the query is a parameter, not a path. Nothing to pre-render per entity |
| Brand / collection pages | public, if modelled as categories | **IN, as categories** | No separate brand entity exists in Catalog Service. A brand modelled as a category (or a category plus a facet) is a category page. Template support for a brand block: **UNVERIFIED** |
| Compare | per-shopper selection | OUT | Session state |
| Wishlist | per-shopper | OUT | Account data |
| Cart, mini-cart, checkout, order confirmation | per-shopper | OUT | Session and account data |
| Account pages (orders, addresses, returns) | per-shopper | OUT | Account data |
| B2B: quotes, requisition lists, purchase orders, company, company users | per-company / per-buyer | OUT | Account data; must never be cached at a public URL |
| Product recommendations (a block, not a page) | public, but placed on a page | OUT (block) | Rides on whatever page holds it |

**Verdict: two page types are in.** Product detail is already done. Category / product
list is new. Every other Commerce page is per-shopper and stays a fixed authored page
(`/cart`, `/checkout`, `/customer/...`, `/search`).

The exact block list in each template (ACO boilerplate for Justrite, the commerce
boilerplate, the B2B template) was not re-read for this file: **UNVERIFIED**. The
per-shopper classification above follows from what each page shows, not from the code.

## 2. Adobe's canonical way

**VERIFIED (from ADR-005 and its research, re-read today):**

- Adobe's canonical routing for product pages is a BYOM `content.overlay` registered with
  the Configuration Service. Folder mapping is deprecated.
- The reference implementation is `adobe-rnd/aem-commerce-prerender`: an overlay action,
  plus a poller that enumerates the catalog and previews/publishes each product path.
  Event-driven updates are an open issue (#262).
- The overlay is consulted at **preview** time, not on the live tier. A path returns 200
  live only after something has previewed and published it.
- If the overlay does not have a path (404), the admin service falls back to the primary
  content source (aem.live/developer/byom, quoted in
  `.rptc/research/eds-pdp-routing-validation/findings.md:101`).

**UNVERIFIED (the docs thread did not return):**

- Whether `aem-commerce-prerender` renders product **list** / category pages, or only
  product pages. ADR-005 describes it as product-only. That needs re-checking against the
  current README and source, because the repo may have gained list pages since 2026-06.
- Whether Adobe documents a category URL format (for example a `categoryPageUrlFormat`)
  or recommends authored per-category pages. The boilerplate's own `/apparel` page is an
  authored page holding `product-list-page` with `urlPath | apparel`, read 2026-10-01
  (EDS-24 item). That suggests authored pages are the boilerplate default. It does not
  show they are the recommended pattern at scale.

## 3. Our mechanism, generalized

### (a) One overlay per site, so one action serves every page type by path shape

**VERIFIED.**

- The overlay is registered with no path pattern:
  `configurationService.ts:204-231` PUTs `content.overlay = {url, type:'markup', suffix:'.html'}`.
  It is consulted for **every** path, and render-pdp's 404 is what hands non-product paths
  back to authored content (`render-pdp/index.js:178-184`).
- The Admin API schema says one overlay per base content
  (`docs/architecture/eds-byom-pdp-routing.md` dependency 5).

So categories need **no Configuration Service change.** They need a second branch in the
same action.

render-pdp is hard-wired today:

- `main` (`index.js:75-117`) is one linear chain: a version check, then `parsePdpPath`,
  then the template.
- `parsePdpPath` (`parse-path.js:22-56`) requires exactly `/products/{a}/{b}`.
- `prepublish-pdp` imports the same `parsePdpPath` as its security scope guard
  (`prepublish-pdp/index.js:26,50`).
- The template cache key is `org/site`, which allows one template per site.

Adding categories cleanly means:

- a small dispatcher (path shape → page kind)
- a per-kind template path and cache key (`org/site/kind`)
- a separate category guard in `prepublish-pdp`, so widening one cannot widen the other

render-pdp never reads Commerce. It serves the site's authored template, and the drop-in
fills the data in the browser at view time. That is the owner's "rendered from live data
at view time", and it should stay that way for categories.

### (b) Can `product-list-page` take its category from the URL?

**UNVERIFIED** (the template thread did not return). What is known:

- The authored recipe passes `urlPath` as block config (EDS-24 item).
- The block filters `productSearch` on `categoryPath` (EDS-24 item).

If the block reads only its config, the category template needs one of two things. The
first is a small template-side change: when config `urlPath` is empty or `{path}`, derive
it from `location.pathname` minus the route prefix. That would be a code patch through
eds-demo-patches, like the SKU-encoding patch (ADR-007), or a Demo Builder block. The
second is for the overlay to substitute the urlPath into the template HTML per request.
The second is cheaper to ship (one action deploy reaches every site) but breaks the
"template served as-is" property and needs the action to do string surgery on authored
HTML. **This is the first thing to read before building.**

### (c) Category URL shape and encoding

**VERIFIED, from code:**

- The aem.live CDN 404s percent-encoded paths. The safe alphabet is `[a-z0-9_-]`
  (`categoryPages.ts` `SAFE_SEGMENT`; ADR-007).
- EDS-24 already reports categories whose url path falls outside that alphabet and does
  not write them.
- Commerce `url_path` is nested (`safety-signs/exit-signs`), lowercase and hyphenated by
  default. A hand-set url key can contain other characters.
- Helix lowercases content-bus paths (`eds-byom-pdp-routing.md` dependency 1).

**Recommendation:** route at `/categories/{url_path}`, not at the bare `{url_path}`.

- A bare path cannot be recognised by shape. The overlay would have to look up Commerce
  on every preview of every page (`/nav`, `/index`, `/footer`).
- Smart-404 could not regex-detect a bare path.
- Worst, the overlay is consulted **first**: a category whose url path equals an authored
  page (`/about`, `/contact`) would shadow the SC's page. That is property 2 in spirit.

A prefix makes all three problems disappear. Segments outside the safe alphabet keep
being reported and skipped, as today. A reversible escape like the SKU `_HH` one is not
needed, because the url path is a key Commerce looks up, not free text. Whether
`productSearch` `categoryPath` accepts the url path verbatim was measured on 2026-10-01
for one store (EDS-24).

### (d) Pre-warm and smart-404 for categories

**VERIFIED, from code:**

- Pre-warm (`catalogPrewarmService.ts:215`) enumerates `productSearch` and publishes
  `/products/...` through the extension's authenticated Helix path (`publishOne`, :468-483).
  It is called at creation (`catalogPrewarmPhase.ts:103`), from the pipeline
  (`edsPipeline.ts:883`) and from Republish (`storefrontRepublishService.ts:500`).
- A category pass goes beside it: read the menu categories (EDS-24's `categoryReader`
  survives for this) and publish `/categories/{urlPath}`.
- Smart-404 is three marker-bounded snippets in the storefront repo
  (`pdp404HandlerPublisher.ts:226-276`). All three match `^/products/{a}/{b}$` only.
  Adding the category shape means a new snippet version.
- `installSmart404Handler` **skips when the marker is already present** (docstring,
  `pdp404HandlerPublisher.ts:100-120`). An existing storefront would therefore never get
  the new regex unless the install compares content, not just the marker. This is a
  property-3 trap.
- `prepublish-pdp` checks a SKU exists before publishing (`check-sku-exists.js`). The
  category branch needs the same kind of check against `categories`, so it never caches
  an empty page for a made-up path.
- The runtime path authenticates with the per-site publish key
  (`publishKeyRegistrar.ts`, `register-publish-key` action). Categories reuse it as-is.

### (e) B2B: what a guest sees on a category page

**VERIFIED (EDS-24 measurements, 2026-10-01):**

- On a B2B website a category not granted to a shared catalog is denied.
- `productSearch` returned 0 for guest and General on Justrite and 49 for the two company
  groups. `products(skus:)` ignores grants.

A pre-rendered category page is the same template for everyone. The drop-in queries with
the shopper's group header, so a guest sees an empty list and a buyer sees products. That
is correct and is how a real B2B storefront behaves. The template is public; the data is
per group.

What is NOT acceptable is the **menu** offering a guest a category that shows nothing.
The catalog-menu block already filters each category by a one-row `productSearch` as the
shopper (`FILTER_BY_VISIBLE_PRODUCTS = true`, `catalog-menu-core.js:37`). Keep it.

The shared-catalog grant work (the EDS-24 item's second half) stays a separate concern:
it decides what buyers see, not how pages route.

### (f) The menu

**VERIFIED.**

- The catalog-menu block reads the tree live in the browser (`catalog-menu-core.js`), and
  its links are `/${urlPath}` (:135, :143). It survives with one change: links become
  `/categories/${urlPath}`.
- It is switched on by content: a "Shop the catalog" line plus a one-cell block table in
  the nav (`navSwitch.ts`).

The switch should be applied by storefront setup, like the overlay registration, when the
Demo Builder Blocks library is installed. It should not be applied by a button. Removing
the switch is the undo, and `removeCatalogMenuSwitch` already does that byte-for-byte
(`catalogMenuHandlers.test.ts`).

## 4. What happens to what is built

EDS-24 is **unreleased**: commit `f7b196e3c` is on no tag and not on `develop`
(`git merge-base --is-ancestor` → NOT_ON_DEVELOP, checked today). No shipped project
carries `metadata.catalogMenu`. One unknown remains: whether the owner's own Justrite site
ever got pages from a dev run. The plan tabled the first real run, so probably not. Check
before deleting.

| Piece | Fate |
|---|---|
| `catalog-menu` block (block library) | **keep**; hrefs → `/categories/...` |
| `categoryReader.ts` | **keep**; feeds category pre-warm |
| `navSwitch.ts` | **keep**; applied by setup and removed by reset/undo |
| `categoryPages.ts` | **delete** the page writer; move its servable-path check to the pre-warm path planner |
| `catalogMenuService.ts`, `catalogMenuRecord.ts`, `catalogMenuSummary.ts` | **delete** |
| `catalogMenuHandlers.ts`, dashboard tile, `CatalogMenuModal`, `useCatalogMenu` | **delete** |
| `build_catalog_menu` / `remove_catalog_menu` tools, narration, alert copy, ledger row, docs rows | **delete** |
| `storefrontPages.ts` | **keep** the target helpers (`storefrontTarget`, `daLiveOps`, `helixFor`, used by `contentAuthoringTools`); delete `createStorefrontPages` / `storefrontPagesFor` if nothing else uses them |
| `resolveCommerceRequest` extraction | **keep** (used by `run_commerce_query`) |

**Undo story (property 1).** Each setup step pairs with its reversal:

- The category template doc is content copied at creation; reset recopies it, and delete
  removes the site.
- The nav switch is added by setup and removed by `removeCatalogMenuSwitch`.
- Pre-warmed category paths are published pages. Reset must unpublish them the way it
  handles product paths. **UNVERIFIED** how reset clears pre-warmed `/products/*` today;
  read `edsResetService` before building.
- The action branch is shared infrastructure, not per-project state.

## 5. Every surface

- **Creation vs Regenerate/reset (property 3).** Creation runs storefront setup
  (template copy, smart-404 install, pre-warm). Reset re-runs the repo helper
  (`edsResetRepoHelper.ts:357`) and pre-warm. Republish re-runs pre-warm.
- **Existing storefronts that are not reset get:**
  - the action branch: automatically, one deploy, every site
  - the category template doc: not automatically, because content is copied once. The
    action's built-in fallback shell covers it, like the `PDP_TEMPLATE` fallback.
  - the smart-404 regex: not automatically. The marker-skip must become
    replace-on-difference, run from the activation sweep that already renews publish keys
    (`publishKeyRenewalSweep.ts`) or from Republish.
  - the menu: only when they add the library.
- **Content copy.** `filterProductOverlays` keeps only `/products/default`
  (`daLiveContentReferences.ts:36-46`). `/categories/default` needs the same rule, and
  generated `/categories/*` docs must never be copied.
- **Agent surface.** No new tool is needed: routing is setup, not an action. The bundle's
  `register-custom-block` and `commerce-block-mapper` skills teach that a block on
  `/products/default` shows on every product page. The same sentence for
  `/categories/default` needs an `AI_CONTEXT_VERSION` bump (now 36).
- **Docs.** ADR-005 gains a "category pages" section (or a new ADR that supersedes the
  product-only scope), plus `eds-byom-pdp-routing.md`, `docs/systems/mcp-server.md`,
  `mcp-tools.md` and `agent-alerts.md` (tool rows removed).

## Verified vs unverified, in one list

**Verified:**

- Overlay covers every path; one overlay per content source.
- render-pdp is hard-wired and never reads Commerce.
- prepublish shares its guard.
- Smart-404 regexes are product-only, and the installer skips on an existing marker.
- Pre-warm entry points.
- B2B search denies ungranted categories.
- EDS-24 is unreleased.
- The catalog-menu block's link shape.

**Unverified:**

- Adobe's canonical treatment of category pages and the current `aem-commerce-prerender`
  scope.
- Whether `product-list-page` can read its category from the URL.
- The exact Commerce block list per template.
- How reset clears pre-warmed paths.
- Whether the owner's Justrite site holds EDS-24 pages from a dev run.
- Whether `productSearch` `categoryPath` accepts nested url paths on every store.

## UPDATE 2: the template read (same day)

A separate read of every storefront template our packages use (upstream at default-branch
HEAD via `gh api`; Justrite from its local clone; live pages by plain GET) settles two of the
unverified points above:

- **The list block reads its category ONLY from its own table.** In the B2B template,
  `hlxsites/aem-boilerplate-commerce@main`, isle5 and Justrite, `product-list-page.js` takes
  `urlpath` from `readBlockConfig` and filters `categoryPath eq urlpath`; it reads the URL
  only for `q`/`page`/`sort`/`filter`, never the path. With no `urlpath` it is the search
  page. So the render action filling in the block's `urlPath` row (the plan's step 2) is the
  way in; changing the block to read the path would be a fork of Adobe's code.
- **Block lists per template** are recorded: the main boilerplate's shop, account and order
  blocks; the B2B template (and Justrite) add company, quote, purchase-order, quick-order and
  requisition-list blocks; isle5 adds search-bar and store-locator; BuildRight is custom code
  (category from `?category=`, a `/catalog/<slug>` router). No template has a brand,
  collection or compare block — the inventory verdict (only product and category pages in
  scope) stands.
- **There is no separate ACO boilerplate.** ACO is the same boilerplate switched on by
  `demo-config-aco.json` (`"adobe-commerce-optimizer": true`).
- **Justrite is an added package** (`kmanns/justrite`, a copy of the B2B template plus a few
  blocks), and it **already has hand-authored category pages**: `/apparel`,
  `/hazard-communication`, `/workplace-safety`, each a list block with a fixed `urlPath` plus
  `enrichment` and `product-recommendations` blocks. Because the overlay wins over authored
  content, root-level category addresses would replace these pages with the template — so
  the template must carry the same enrichment and recommendations blocks, and setup's clash
  report must name them.

Still unverified: whether Catalog Service accepts `categoryPath` with `in` rather than `eq`
(not needed by this design), and the citisignal and bodea local clones (both point at the
B2B template).

## UPDATE 3: how brands actually do it — web research (2026-10-05). Supersedes the recommendations above.

Four live brands on Adobe Commerce + EDS were checked (public `.plain.html`, query
indexes, nav fragments): bulk.com, hanes.com, maidenform.com, fountaintire.com.

- **4 of 4 hand-author one page per category; 0 of 4 use generated pages.** Key categories
  are rich landing pages (carousels, promos, FAQs); long-tail pages are a heading, the list
  block and a line of copy (e.g. hanes `/men/socks/no-show` is 524 bytes).
- **URLs are plain root paths** (`/men/socks/no-show`, `/uk/foods/...` with a locale), no
  prefix, no `.html`.
- **Every menu is an authored nav document.** Adobe documents no menu built from the
  category tree; the boilerplate header reads the authored `/nav` fragment.
- **Adobe's guidance** ("Generate category pages programmatically", updated 2026-09-09)
  offers three options: prerender for most catalogs, manual authoring for a few with custom
  content, and programmatic generation (a script writes real, editable DA documents).
- **`aem-commerce-prerender` gained category pages on 2026-08-26**: every category, root
  path `/{urlPath}`, fixed Handlebars markup (no authored template), re-rendered every 15
  minutes, no per-category overrides, no exclusions.
- **Precedence (aem.live BYOM, quoted):** a preview "will always result in the path being
  fetched from the overlay content source first", so a generated page shadows an authored
  one at the same path. Adobe's commerce docs do not warn about this.

Sources: experienceleague.adobe.com commerce-storefront pages (aem-prerender,
automatic-category-page, manual-category-page, product-list-page), github.com/adobe-rnd/
aem-commerce-prerender (commit 91a491c), www.aem.live/developer/byom,
github.com/hlxsites/aem-boilerplate-commerce, and the four brand sites. Not verified: any
brand using prerendered category pages (the feature is about six weeks old).

**Consequence.** The owner's problem is the nav: authors type the category structure by
hand. The live `catalog-menu` block solves that and stays. For pages, the decision
(2026-10-05) is the brand pattern done for the SC — editable pages written at setup and
reset, never touching pages someone else made — with no button. See the plan.
