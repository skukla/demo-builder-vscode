# PL-60 — finish Adobe Commerce Optimizer (ACO) support: plan and design gate

Unattended loop, 2026-10-04 (night 4, stream A). Lane: **research/design**. Nothing was built:
every next step depends on a product choice below, and building ahead of them would add more of
the unreachable code this item exists to remove.

Evidence: `.rptc/research/aco-support/research.md` (Adobe's ACO docs and the three local ACO
repos, each claim labelled), and a re-check of the item against the code on 2026-10-04.

## The three setups (2026-11-23) — read this first

This section supersedes the rest of the plan where they disagree. The owner asked for the
connectors and the Data Installer service to be re-researched; the earlier plan assumed every ACO
project loads ACO datapacks straight into ACO, and that is true of only one setup.

### What is true (sources: Experience League, read 2026-11-23)

**ACCS with Merchandising Services.** `experienceleague.adobe.com/en/docs/commerce/cloud-service/merchandising-services`
(updated 2026-11-11): on an ACCS instance provisioned with the Composable Catalog Data Model
(CCDM), product and price data "synchronize one way to CCDM through a native ... integration", with
no connector to install. It "does not require a separate Adobe Commerce Optimizer purchase,
entitlement, or tenant", and the page says: "Do not create a second product catalog." Catalog
sources and price books are generated from store views, websites and customer groups ("They are
not manually created"). B2C catalog views and policies are made by hand in Commerce Admin
(Catalog > Catalog Views, Catalog > Policies); for B2B they are generated from shared catalogs.
New organizations get it by default; an existing organization can switch on "Enable CCDM" only
when creating a new instance, it cannot be switched off, and existing instances are not migrated.

**PaaS with the ACO connector.** `experienceleague.adobe.com/en/docs/commerce/aco-optimizer-connector/`:
package `adobe-commerce/commerce-data-export-aco-adapter`, Commerce 2.4.7+, generally available.
One way, Commerce to ACO: products, categories, attributes, prices and price books, by a cron job
every minute. It makes a price book per website and per customer group and a catalog source per
store view. It does not make catalog views or policies ("Create catalog views and policies in the
Commerce Optimizer UI"); its B2B add-on does, and is still marked private beta. Rows written to ACO
directly "can be overwritten during a later sync"; the docs suggest product layers for outside
changes.

**The Data Installer service** (its source as of 2026-10-01, `config/data_processors_aco_import.json`):
the same seven ACO data types as our engine, sent straight to ACO's ingestion API in the same
order; never to Commerce. A mixed pack's Commerce rows are skipped. Removal sends ACO's deletes for
the pack's current rows.

**Our own probe** (read-only, the scratch ACCS store, 2026-11-23): the store's GraphQL address
takes ACO's request headers (`AC-View-ID`, then it asks for `AC-Scope-Locale`), and the ACO admin
GraphQL path exists on the same tenant. So on ACCS the ACO instance is the ACCS tenant.

### What follows

| Setup | Datapack | ACO writes Demo Builder makes |
|---|---|---|
| ACCS with CCDM | A Commerce datapack, through the engine as on any ACCS project | Catalog views and policies (or the SC makes them in Commerce Admin) |
| PaaS with the connector | A Commerce datapack | Catalog views, policies, product layers |
| ACO with no sync from Commerce | An ACO datapack, straight to ACO (built on the branch) | Everything in the pack |

Inference, not tested: our add-on keeps carts and orders in Commerce, so in the third setup a
product loaded only into ACO shows on the storefront but cannot be added to a cart unless Commerce
has the same SKU.

### Build order (replaces "Build order once P1–P4 are answered" for the data and config steps)

1. **Know the setup.** Decide from the project which of the three it is. PaaS: the connector is
   installed AND configured. ACCS: CCDM or not. How to tell CCDM from outside is open (below).
2. **Narrow the refusal.** With a sync on, refuse ACO catalog rows (products, categories,
   attributes, prices, price books) and allow catalog views, policies and product layers. Reword
   the message: the docs support "overwritten by the next sync", not "left behind".
3. **Commerce datapacks for the synced setups.** No ACO path: develop's engine, replace, save and
   update features as they are.
4. **The ACO instance on ACCS** is filled from the ACCS endpoint's tenant, not typed or picked.
5. **The wizard gap** (owner, 2026-11-01): the instance and catalog view in the wizard; on CCDM the
   view is made in Commerce Admin, elsewhere through the admin API (`createCatalogView`).
6. **The third setup:** owner's decision. Recommended: the datapack stays a Commerce datapack in
   all three setups, and in the third Demo Builder sends its ACO rows itself (the Commerce-instance
   export already builds them), so the storefront and the cart agree.
7. **Live checks** on the first CCDM instance, below.

### Open, needs a live check

- Whether the sync (CCDM or the connector) deletes or overwrites ACO rows it never sent.
- How to tell an ACCS instance has CCDM from outside: ACO's request headers are accepted even on
  an instance made before CCDM shipped, so they do not tell.
- Whether ACO's admin GraphQL accepts our credential on a CCDM instance (views and policies).

## Staleness check — the item is still accurate

No commit since the item was filed (2026-09-17) changed ACO code in `src/`. Every claim held, and
two understate it:

- `executeCommerceCleanup` is dead too, not only the ACO path: nothing sets
  `cleanupBackendData`, and nothing writes `backendType` (`cleanupService.ts`,
  `resourceCleanupHelpers.ts`, `eds/services/types.ts`).
- `filterAddonsByPackage` (`brandGalleryHelpers.ts`) has no caller.

Dead or unreachable today: `executeAcoIngestion`, `executeAcoCleanup`, `executeCommerceCleanup`,
`configureToolEnvironment`, `validateAcoConfig` (`toolManager.ts`); `cleanupBackendData` and
`backendType`; `skipTools` (written in `wizardHelpers.ts`, read nowhere); the `'aco'` case in
`configGenerator.ts`; `onAddonsChange` (tests only); `filterAddonsByPackage`; the ACO service
group (never rendered). Live: `selectedAddons` persistence, the `configure_project` add-on input,
`injectAddonConfigFlags` (runs, adds nothing for ACO), and `ACO_API_KEY` stripping on export.

## What the research changed

1. **The storefront config the extension generates for ACO is wrong in shape, not just
   unreachable.** Adobe's documented ACO storefront sends `AC-View-ID` (required),
   `AC-Source-Locale`, and optionally `AC-Price-Book-ID` under `cs`, to
   `https://{region}[-sandbox].api.commerce.adobe.com/{tenantId}/graphql`; no `all.Store`, no
   `Magento-*` headers, and an ACO-shaped analytics block. Today's case emits placeholders
   (`{{AC_VIEW_ID}}`) plus `all.Store`.
2. **Two of the four credentials are the wrong shape.** `ACO_API_KEY` is not how ingestion
   authenticates (an IMS client id + secret, scope `commerce.aco.ingestion`); `ACO_ENVIRONMENT_ID`
   has no documented use; `ACO_API_URL` derives from tenant + region + sandbox. Only
   `ACO_TENANT_ID` survives as an input. The storefront itself needs no credential.
3. **A catalog view cannot be created by API** (every Adobe page describes UI steps; BuildRight's
   own notes say "cannot be created programmatically"). So the SC creates it in ACO's screens and
   gives us its id. Price books CAN be created through the ingestion API.
4. **Ingestion has delete endpoints but no list.** Reversal must be driven by what the extension
   recorded when it loaded, the same shape as `reset_datapack` walking its own files.
5. **AB-14 (ERP prices on ACO):** per-customer prices are price books; the storefront must send
   the buyer's price-book id after sign-in. Corrected 2026-11-01: this IS a config change. Adobe's
   template does it when `adobe-commerce-optimizer` is true
   (`.rptc/research/aco-support/customer-pricing.md`).

## Design gate

- **What entity is ACO?** It is already modelled: an **add-on** (`addonDefinitions` in
  `stacks.json`, a catalog entry in `components.json`) that `providesServices` catalog-service
  and live-search. That fits: ACO replaces where the storefront reads its catalog, while the
  Commerce backend still owns carts and orders (`commerce-core-endpoint` stays the backend's).
  It is NOT a backend, which is why `mapBackendToEnvironmentType` never sees it — the fix is to
  ask "is the ACO add-on selected?" alongside the backend id, not to make ACO a backend.
- **What owns it, where does it live?** The add-on's inputs belong in
  `componentConfigs['adobe-commerce-aco']` like every other component's settings; the storefront
  config is `configGenerator.ts`; the wizard control is the Commerce area's Catalog step
  (`commerceSections.ts`), which the v6/v7 prototypes already show.
- **Alternatives rejected.** *ACO as a fourth backend* — wrong: ACO has no cart or checkout, and
  every backend-keyed code path (REST tools, mesh, discovery) would have to learn it is not one.
  *ACO as a stack* — multiplies `stacks.json` by two for one catalog choice.
- **Product intent — the owner decides (not built):**

| # | Decision | Recommendation |
|---|---|---|
| P1 | Is ACO offered in the wizard (Commerce → Catalog), or agent-only for now? | Offer it in the Catalog step, off by default, only where the package allows it — the prototypes' design |
| P2 | What does the SC type? | Tenant id, region, sandbox/production, catalog view id, locale (the optional price book id was removed 2026-11-01: the storefront replaces it with the buyer's). Drop `ACO_API_KEY`, `ACO_ENVIRONMENT_ID`, `ACO_API_URL` as inputs (no soft deprecation: delete them in the same change) |
| P3 | Where does ACO data come from? | The Data Installer's ACO datapack family (it already exists there, and import/reset/export are built), not the bundled `commerce-demo-ingestion` tool (the local `buildright-aco` loader that used Adobe's ACO TypeScript SDK was itself archived on 2025-12-16, per its `DEPRECATED-NOTICE.md`; that is our repo, not Adobe's SDK). Then delete `ToolManager`'s ACO paths and the dead `executeCommerceCleanup` |
| P4 | Does the extension load data itself (needs an ingestion client id + secret) or only point the storefront at ACO? | Point only, first. Loading is P3's datapack; a client secret is one more SecretStorage value to manage for no demo gain yet |
| P5 | AB-14 per-customer prices | Separate item: a storefront block change (send the buyer's price-book id after sign-in) plus an ERP price-book writer |

### The owner's answers (2026-10-31)

| # | Answer | Who builds it |
|---|---|---|
| P1 | **Both places.** ACO is offered in the wizard's Commerce → Catalog step, off by default and only where the package allows it. It is ALSO a choice in "Create datapack", where the ACO pack offers two sources: **"From this Commerce instance"** (built: G5's ACO export) and **"From a website"** (scrape a public listing page into a pack) | wizard and Configure: slice C; "From a website": slice A (`aco/aco-scrape-to-pack`) |
| P2 | **The SC types nothing for credentials.** Demo Builder creates the ACO credential in the project's own Developer Console workspace. The SC picks the ACO instance and the catalog view. The three never-used fields (`ACO_API_KEY`, `ACO_ENVIRONMENT_ID`, `ACO_API_URL`) are deleted, not deprecated | the credential: slice B; the fields and the pickers: slice C |
| P3 | **One ACO pack format, three sources.** The format is the Data Installer's `aco_*` kinds. The sources are: library packs (`aco_bodea` and the other seven), the Commerce-instance export (G5), and website scraping. A scraped pack lands in the SC's own datapack library first, for review, before anything is loaded | the website source: slice A |
| P4 | **Demo Builder loads ACO packs itself,** through one ACO client, and removes them by the pack's own keys (`sku`, `slug`, `code`, `priceBookId`), since ingestion has no list | slice B |
| P5 | **Unchanged:** a separate item, `AB-14` | — |

P4 overrides the 2026-10-04 recommendation ("point only, first"); P2 makes the credential the
extension's job, so the client-secret cost that recommendation weighed is no longer the SC's.

#### Slice A: "From a website" (branch `aco/aco-scrape-to-pack`)

DSC 3.0 scrapes with a separate Adobe service that refused our sign-in (2026-10-31; what it does
is in `.rptc/research/aco-support/dsc-scraper.md`, reported by FluffyJaws and not verified by us).
So Demo Builder rebuilds it with what every project already has:

1. **The project's own agent scrapes**, with the `@playwright/mcp` browser tool every project
   ships, following a generated skill, `scrape-products-to-aco`: open the listing, scroll until
   the page stops growing, read the product cards, prefer what the page itself states
   (schema.org `Product` JSON-LD when present, which DSC does not read), and mark every value it
   had to propose (price, SKU, currency) instead of passing it off as read.
2. **One MCP tool, `make_aco_pack_from_products`,** turns those typed products
   (`ScrapedProduct`, `src/types/scrapedProduct.ts`) into rows of the existing ACO pack shapes
   (`src/types/acoPack.ts`), checks them against the Data Installer's schemas, and saves the pack
   into the SC's library through the house writer (`openLibraryWriter`). Its answer names every
   proposed value. Undo: `delete_library_datapack`.
3. **The human surface:** "Create datapack" → ACO → "From a website" takes a URL and opens the
   project's AI with a prompt to do steps 1 and 2.

Loading the pack into ACO is slice B's (P4); nothing in slice A writes to ACO or Commerce.

## Build order once P1–P4 are answered

1. Delete the dead paths P3 makes dead (tool manager ACO ingestion/cleanup, `cleanupBackendData`,
   `backendType`, `skipTools`), with their tests.
2. The add-on's fields per P2 — the JSON registry, its schema and the TypeScript type together.
3. `configGenerator`: when the ACO add-on is selected, emit the documented `commerce-endpoint`,
   `cs` headers and analytics block; drop `all.Store`. Pin with fixtures copied from the
   documented shape. Regenerate path and creation path both run `generateConfigJson`.
4. Wizard: the Catalog step control (`wizard-step-authoring`), and Configure rendering the ACO
   group (fix `useSelectedComponents` to include add-ons).
5. Data: datapack import scoped to an ACO site type (Data Installer), with `reset_datapack` as
   the undo.
6. Agent surface: `configure_project` already takes add-ons; add the ACO fields to its schema.
7. Live check (owner): a sandbox ACO tenant with one catalog view; storefront PLP and PDP render.

## Reversibility

Selecting ACO is undone by deselecting it (config regenerates without the ACO block). Data
loaded through a datapack is removed by `reset_datapack`. A catalog view the SC creates in ACO's
screens is theirs to delete there; the extension never creates one (no API exists).

## Open, needs a live check

Whether any API creates catalog views; which Developer Console API grants
`commerce.aco.ingestion`; whether the boilerplate needs `AC-Environment-Id` (BuildRight sends it,
no Adobe page lists it).
