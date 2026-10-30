---
id: PL-60
kind: feature
area: platform
needs: []
value: high
status: active
---

# Finish Adobe Commerce Optimizer (ACO) support

Filed 2026-09-17 by the owner. The extension carries ACO code that was built for a plan
that never finished; this item finishes it. `AB-14` (ERP prices on an ACO storefront)
waits on it, and `EDS-1` (multisite) specifies ACO catalog views per locale.

## What is already there, and why none of it runs (surveyed 2026-09-17)

- **The add-on.** `adobe-commerce-aco` in `stacks.json` `addonDefinitions`, offered on
  `eds-paas` and `eds-accs`; in `components.json` with `providesServices`
  `catalog-service` and `live-search` and four credentials (`ACO_API_URL`,
  `ACO_API_KEY`, `ACO_TENANT_ID`, `ACO_ENVIRONMENT_ID`; `ACO_API_KEY` is a secret key).
  No wizard control adds it: `useProjectBuilder`'s `onAddonsChange` has no UI caller. The
  one package that requires it is hidden and coming soon; the shipped ones exclude it.
  An agent can add it through `configure_project`.
- **Storefront config.** `configGenerator.ts` has an `'aco'` case that emits
  `AC-View-ID` and `AC-Price-Book-ID` headers, as placeholders. It never runs:
  `mapBackendToEnvironmentType` is given the backend id, which is never the add-on. The
  add-on has no `configFlags`, so `injectAddonConfigFlags` adds nothing for it.
- **Data.** `toolManager.ts` writes the ACO credentials for the `commerce-demo-ingestion`
  tool and has `executeAcoIngestion` (`import:aco`) and `executeAcoCleanup`
  (`delete:aco`). Nothing calls the import; the cleanup runs only when a backend type of
  `aco` is set, and nothing sets it. `skipTools` is set from the add-on and read nowhere.
- **Configure.** A service group exists for the ACO fields; the configure-field-grouping
  research found it never renders, and editing ACO credentials after creation is an open
  question (`.rptc/complete/2026-08-11-project-level-facts-stored-per-component.md`).
- **Not there at all:** an ACO source in the API Mesh, any ACO API client, any creation of
  catalog views or price books, and any App Builder integration that reads the add-on.

## Earlier thinking to start from

- `.rptc/research/demo-template-architecture/research.md`: PaaS, PaaS + ACO, and ACCS as
  three models, with catalog and pricing in ACO for the second.
- `.rptc/complete/backend-matrix-or-logic/`: where the add-on came from, as a placeholder.
- `.rptc/research/project-builder-ux/research.md` and
  `.rptc/complete/project-builder-ux-rewrite/commerce-v6.md`: ACO is chosen under
  Commerce → Catalog, offered only where the package allows it (the v6/v7 prototypes show
  it).
- `.rptc/research/data-installer/spike-01-live-api.md`: the Data Installer service has an
  ACO datapack family (metadata, categories, products, price books, prices) behind its own
  pipeline; `.rptc/complete/data-installer-plan/overview.md` deferred it.
- `EDS-1` and `docs/research/2026-05-19-multisite-multillocale-research.md`: catalog view
  id and scope locale per store view; catalog views are created in ACO's own screens, with
  no provisioning API. Its Cycle A lists four ACO config fixes as prerequisites: add
  `configFlags`, fix the environment mapping, drop `all.Store` from ACO headers, and emit
  ACO analytics fields.
- `.rptc/research/multitenant-prerender-evaluation/research.md`: a live ACO storefront
  reads an ACO-native GraphQL endpoint.

## What finishing it takes (to be planned)

1. The choice: ACO under Commerce → Catalog in the wizard, and in Configure afterwards,
   with its credentials and catalog view id.
2. The storefront config: real ACO endpoint and headers when the add-on is on, and a test
   that the path is reachable.
3. Data: ACO datapacks through the Data Installer, or the bundled ingestion tool, with
   removal. (The 2026-06-15 cleanup notes that `ToolManager` is hard-coded to ACO and
   should not be reused as a general class; it says nothing against it for ACO.)
4. The mesh, if an ACO storefront needs one.
5. Integrations that write catalog data (the ERP's prices, `AB-14`) told whether the
   project uses ACO.
6. Reversal for everything above, and the dead code either wired or deleted.

## The ACO pack kinds, and why Demo Builder's engine does not install them (2026-10-30)

Decided in datapack-engine step 11 (`.rptc/plans/datapack-engine/step-11-later.md`): the eight
`aco_<brand>` packs (`aco_bodea`, `aco_carvello`, `aco_citisignal_new`, `aco_citisignal_original`,
`aco_frescopa`, `aco_healthbeauty`, `aco_wecafe`, `aco_wknd`, all `main`) stay refused by Demo
Builder's engine, before anything is written, until this item is planned. Rows read from
`aco_wknd@main` with `save_datapack_zip` (read-only, 2026-10-30); endpoints from the Data
Installer's `config/endpoints/aco.json` and `data_processors_aco_import.json`.

| Kind | One row (aco_wknd) | Written by the service with |
|---|---|---|
| `aco_metadata` (5) | `{code, source: {locale}, visibleIn, label, dataType, filterable, sortable, searchable, searchTypes, searchWeight}` | `POST /V1/catalog/products/metadata` (delete: `…/metadata/delete`) |
| `aco_categories` (5) | `{slug, source: {locale}, name, description}` | `POST /V1/catalog/categories` |
| `aco_products` (93) | `{sku, source: {locale}, name, slug, description, status, visibleIn, metaTags, attributes: [{code, values}], configurations, …}` | `POST /V1/catalog/products` |
| `aco_price_books` (5) | `{priceBookId, name, currency}` | `POST /V1/catalog/price-books` |
| `aco_prices` (93) | `{sku, priceBookId, regular}` | `POST /V1/catalog/products/prices` |
| `aco_product_layers`, `aco_product` | not in aco_wknd | `POST /V1/catalog/products/layers`; `aco_product` is a second name for `aco_products` |

Why it does not map onto the engine:

1. **Another backend.** These go to Adobe Commerce Optimizer's data ingestion API, with its own
   tenant and an IMS client id and secret (this item's 2026-10-04 research), not the project's
   signed Commerce REST client every engine kind uses (`projectCommerce`).
2. **No read-back.** Ingestion has deletes but no list or get (same research), so the engine's
   seams cannot be built: no store copy to fingerprint (`decideOwnedChange` has nothing to
   compare), no "edited since", no capture, no container rule, no wipe.
3. **No ids to record.** Every row is keyed by the pack's own name (`sku`, `slug`, `code`,
   `priceBookId`), so the install record would only re-state the pack.

**Recommended:** build ACO data as this item's step 3 (data), after beta.153, through one ACO client
beside `projectCommerce`, with removal by the pack's own keys (the ingestion deletes) and the
catalog view chosen by the SC (no create API). Until then the engine keeps refusing the eight
packs by name, which it already does.

## Shipped so far

- 2026-09-17  docs(backlog): PL-60 finishes ACO support; AB-14 asks where ERP prices go on an ACO storefront (`599c3d9de`)
- 2026-10-04  2026-10-04 loop (night 4): research + design, nothing built (every next step waits on a product choice). Item re-verified accurate; also dead: executeCommerceCleanup and filterAddonsByPackage. Research (.rptc/research/aco-support/research.md): the generated ACO config is wrong in shape (documented: AC-View-ID required, AC-Source-Locale, optional AC-Price-Book-ID, no all.Store, ACO analytics block); only ACO_TENANT_ID survives as an input (ingestion uses an IMS client id+secret, not an API key); catalog views have no create API; ingestion has deletes but no list. Plan with five owner decisions P1-P5: .rptc/plans/aco-support/overview.md.
- 2026-10-04  feat(eds,ai): adopt an empty org repository, explain GitHub org refusals, and a skill for building catalog data (`dd6784bb0`)
- 2026-10-20  DI-4 (has the Data Installer superseded the ACO ingestion tool?) folds in here, owner 2026-10-19: it is this item's data decision (P3). DI-4's findings stand: nothing reaches the ingestion tool, its data source repository is gone, and its own repo is named two ways.
- 2026-10-30  Datapack-engine step 11 decided the eight ACO packs do not map onto Demo Builder's engine (another backend, no read-back); their kinds, row shapes and endpoints recorded above. Not committed.
- 2026-10-30  Merge parity/g5-aco-export: an ACO pack from a Commerce store (step 14, G5) (`becfcb2b6`)
- 2026-10-30  docs(datapack): the ACO pack in the Data Installer doc and step 14 item 19 marked built (`f996b62a2`)
- 2026-10-30  refactor(data-installer): the ACO export opens the library through the house writer (`6622c51c3`)
- 2026-10-30  feat(data-installer): the export screen and start_datapack_export can make an ACO pack (`08711b848`)
- 2026-10-30  feat(data-installer): make an ACO pack from the project's store and save it to the library (`47f47c9c2`)
- 2026-10-30  feat(data-installer): ACO pack rows made from Commerce answers, as the service makes them (`8a3c43e2f`)
- 2026-10-30  docs(datapack): port spec for the Data Installer's ACO export (`6bf5fe8ac`)
