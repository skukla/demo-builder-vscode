<!-- Read off the Data Installer service (dsc-data-installer-api, local clone at 3ced647) on
2026-10-30 for datapack-engine step 14 item 19 (G5, PL-60). A specification of THEIR ACO export,
then what Demo Builder's port does with each part. Sibling of export-spec.md (the Commerce
export). Line citations are to that clone. INFERRED marks anything not read directly in code. -->

# Spec: the Data Installer's ACO export, and its port

`process-aco-datapack` with `operation_mode: "export"` reads a Commerce store (ACCS or PaaS) and
stores an ACO pack: rows shaped for Adobe Commerce Optimizer's ingestion API. **Every read is a
Commerce read.** No ACO endpoint is called on export (the ACO routes in `config/endpoints/aco.json`
are import and delete only). So the port runs on the project's own signed Commerce client, like
the rest of Demo Builder's engine.

## 1. The run

- Entry `actions/processor/processAcoDataPack.js`. Export skips the pack-exists check (L197-204)
  and the row validation (L288-295). Kinds come from `data_types`, or every kind in
  `config/data_processors_aco_export.json` (L250-262), run in that file's order (L281):
  `aco_metadata`, `aco_categories`, `aco_products`, `aco_price_books`, `aco_prices`,
  `aco_product_layers`. `depends_on` only orders them.
- Before any kind: **store view codes** (L337-354, `fetchAcoExportStoreViewCodes.js` L40-63,
  L76-144): `GET V1/store/storeViews`, drop id 0 (admin) and blank codes, unique, **sorted**. These
  are the "session codes": every per-locale row is made once per code, with `source.locale` set to
  the store view code. There is no choice of store views; every one is exported.
- Each kind: fetch, transform, `filterExcludedItems` (`config/export_exclusions_aco.json`),
  substitutions, JSON-schema check (`config/schemas/aco_<kind>.json`), then
  `addDataItem._internal` (one data item per kind, the rows as a JSON string). A kind with no rows
  stores nothing and still succeeds (e.g. `AcoCatalogExportProcessor.js` L277-296). A failed first
  page fails the kind; a failed later page is **silently dropped** (e.g. L199-222).
- `datapack_type` is stored only when the caller sent one (`runtimeParams.js` L27-37); otherwise
  the store's default, `accs` (`.env.example` L14-16).

## 2. Every Commerce read

Page size `EXPORT_PAGE_SIZE` (500 by default). "Store" means the request carries a `Store:
<store view code>` header (`acoProductsCommerceFetch.js` L50-56).

| # | Read | Scope | Where | Used for |
|---|---|---|---|---|
| R1 | `GET V1/store/storeViews` | none | `fetchAcoExportStoreViewCodes.js` L90-118 | session codes |
| R2 | `GET V1/products/attributes` filtered `is_user_defined eq 1` | none | `AcoCatalogExportProcessor.js` L180-245; filter `export_exclusions_aco.json` L6-13 | `aco_metadata` |
| R3 | `GET V1/categories/list` | Store, per session code | L424-433 → `acoProductsCommerceFetch.js` L32-92 | `aco_categories` |
| R4 | `GET V1/products/attributes` (no filter) | none | `acoProductAttributesCatalog.js` L63-117, called L926-953 | attribute id ↔ code, labels, options |
| R5 | `GET V1/categories/list` (again) | Store, per code | L988-1013 | product route slugs |
| R6 | `GET V1/products` with two `type_id neq` filters | Store, per code | L1015-1039 → `acoProductsCommerceFetch.js` L98-162 | `aco_products` |
| R7 | `GET V1/products/{sku}` | Store, per code | `acoConfigurableProductsEnrich.js` L92-133, L143-185 | a configurable missing `configurable_product_options` or `_links`, a bundle with no `product_links` |
| R8 | `GET V1/products/attributes/{code}/options` | none | `acoProductAttributesCatalog.js` L177-248, called L1074-1086 | super-attribute option labels, once per code per run |
| R9 | `GET V1/store/websites` | none | `acoPriceBooksCommerceFetch.js` L22-37 (drop id 0) | price books, prices |
| R10 | `GET V1/customerGroups/search` | none | same file L43-100 | price books, prices |
| R11 | `GET V1/store/storeViews` (again) | none | same file L106-117 | which store view speaks for a website |
| R12 | GraphQL `currency { default_display_currency_code }` | Store, the website's view; then none | same file L181-244 | a website's currency |
| R13 | `GET V1/products` with one `type_id neq downloadable` filter | Store, one view per website | `AcoCatalogExportProcessor.js` L1359-1418 | `aco_prices` |

Not made, though the code reaches for it: the attribute-by-code read in R8's enrichment needs an
endpoint named `product_attributes_update` or `product_attribute_by_code`
(`AcoCatalogExportProcessor.js` L958-960), and the config declares neither (config L57-83), so
`enrichAttributeDefinitionByCode` returns at once (`acoProductAttributesCatalog.js` L127-130).

**The two `neq` filters do nothing.** `addApiFiltersToSearchCriteria` puts both into filter
group 0 (`apiFilterBuilder.js` L72-84), and filters inside one group are ORed by Commerce, so
`type_id != downloadable OR type_id != grouped` matches every product. The post-fetch rule
(`export_exclusions_aco.json` L21-34, applied L1053-1055) is what drops them.

## 3. Every transform, by kind

### aco_metadata (`acoMetadataExportTransform.js`)

- One row per (attribute × session code), `source.locale` = the code (L173-196, L207-215).
- `code` = `attribute_code` (L124). `label` = `label` ?? `frontend_label` ??
  `default_frontend_label` ?? code (L134-141).
- `visibleIn` (L55-77): `PRODUCT_DETAIL` unless `is_visible_on_front === false` or
  `is_visible_in_advanced_search === false`; `PRODUCT_LISTING` if `used_in_product_listing === true`
  or `is_used_in_grid === true`; `SEARCH_RESULTS` if `is_searchable === true` or
  `is_visible_in_advanced_search === true`; `PRODUCT_COMPARE` if `is_comparable === true`; all four
  when none.
- `dataType` (L83-99): `BOOLEAN` for `frontend_input` boolean; `DECIMAL` for price or
  `backend_type` decimal; `INTEGER` for `backend_type` int; else `TEXT`.
- `filterable` = `Boolean(is_filterable)`, `sortable` = `Boolean(used_for_sort_by)`, `searchable`
  = `Boolean(is_searchable)`, each only when the field is present (L151-159).
- Substitutions (config L14-17, `substitutions.js` L784-806): every row gets
  `searchTypes: ["AUTOCOMPLETE"]` and `searchWeight: 1`.
- **INFERRED quirk:** Magento's attribute interface types `is_searchable`, `is_comparable`,
  `is_visible_on_front`, `used_in_product_listing` and `is_visible_in_advanced_search` as strings
  (`"0"`/`"1"`). If REST answers them that way, `Boolean("0")` is true, and the `=== true` tests are
  never true. The service's own tests use booleans
  (`tests/actions/processor/acoMetadataExportTransform.test.js` L14-27).
  **Read live 2026-10-30 (ACCS sandbox, `GET products/attributes`): confirmed.** `is_filterable`,
  `is_filterable_in_search` and `is_used_in_grid` come back as booleans; `is_searchable`,
  `is_comparable`, `is_visible_on_front` and `used_in_product_listing` as `"0"`/`"1"`. So the
  service marks every attribute searchable and almost never lists one. Our port reads both forms
  (`flag` in `acoCatalogRows.ts`) and does NOT carry the quirk.
- Not applied: the selection filter runs on the RAW rows and so would store Magento rows, not
  ACO rows (L256-262); our port takes no selections.

### aco_categories (`acoCategoriesExportTransform.js`, `acoCategoriesCommerceFetch.js`)

- Per session code: every category the list returns, **from every root**, minus Root Catalog
  (`parent_id` 0 or null), every root's direct children (the store roots), and id 1 named like
  "root" (`acoCategoriesCommerceFetch.js` L237-274).
- `slug` = `custom_attributes.url_path`, lowercased, `_` to `-`, all but `[a-z0-9-/]` dropped,
  repeated `/` collapsed, outer `/` trimmed; a category with no valid slug is left out (L11-26,
  L49-58). `name` trimmed, required (L60-63). `description` = the TOP-LEVEL `description`, else
  `null` (L71-75). INFERRED: Commerce returns a category's description inside
  `custom_attributes`, so this is null for every category.

### aco_products (`acoProductsExportTransform.js`, `acoConfigurableProductsExport.js`, `acoBundleProductsExport.js`)

- Per session code, rows R6, minus `downloadable` and `grouped`; configurables and bundles
  completed from R7 (merge rules `acoConfigurableProductsEnrich.js` L12-82).
- One product (`acoProductsExportTransform.js` L262-366): needs `sku`, `name`, `url_key` and
  status 1 or 2, else left out. `slug` = `url_key` as is. `status` 1 `ENABLED`, 2 `DISABLED`.
  `visibleIn`: visibility 2 `[CATALOG]`, 3 `[SEARCH]`, 4 both, 1 omitted. `description` = custom
  attribute or `null`; `shortDescription` when present. `metaTags` from `meta_title`,
  `meta_description`, `meta_keyword` (keywords split on `,`). `attributes`: every other custom
  attribute with a value, `{code, values: [String(value)]}`, minus the 22 structural codes (L9-33)
  and a configurable's super attributes. `images` from `media_gallery_entries`: `url` = `file` (the
  media path, not a URL), roles `image` → `BASE`, `small_image`/`thumbnail` → `THUMBNAIL`, default
  `BASE` (L169-194). `routes`: each `category_ids` id with a slug (R5's `url_path`), with
  `category_links` position (L128-163).
- Configurables (`acoConfigurableProductsExport.js` L234-342): the parent gets `configurations`
  (L128-199), one per `configurable_product_options` entry by position: attribute code from
  `attribute_id` (R4), else the label snake-cased; `label` = R4's `default_frontend_label` ?? the
  option's label; each value's label from R8's options by `value_index`, and
  `variantReferenceId` = `<parentSku>-<code>-<label slug>` (L20-40); `defaultVariantReferenceId`
  from the parent's own value of that attribute, else the first value; `type: "CONFIGURABLE"`.
  Each child named in `configurable_product_links` (SKU, or id via this view's products) is a row
  with `links: [{type: "VARIANT_OF", sku: parent}]` and `attributes` replaced by its super-attribute
  values, each with its `variantReferenceId` (L208-224, L293-310).
- Bundles (`acoBundleProductsExport.js` L168-226): the parent gets `bundles` (L72-122): one per
  option by position, `group` = the title slugged, `required`, `multiSelect` (type `multi` or
  `checkbox`), `items: [{sku, qty (default 1), userDefinedQty}]`, `defaultItemSkus`. A bundle with
  no items is left out. Each selection gets `links: [{type: "in_bundle", sku: bundle}]`, appended to
  a row already made (a variant in a bundle keeps both links).
- Then every other product not yet made and not a child or a selection (L323-339). The config's
  `sort_order` (L56) is never read.

### aco_price_books (`acoPriceBooksExportTransform.js`)

- Every website (R9), whatever the session codes: a root book `{priceBookId: website code,
  name: website name, currency}` and, per customer group (R10), a child
  `{priceBookId: "<code>:<group slug>", parentId, name: "<group code> (<website name>)"}`
  (L99-131). Group slug: lowercased, spaces to `-`, all but `[a-z0-9-]` dropped; child id cut to 64
  characters (L28-74).
- Currency (R12): the website's store view (`session_store_code` if the request carried one, else
  the lowest-id active view of that website, `acoPriceBooksCommerceFetch.js` L127-157), else the
  request's `aco_export_price_book_currency`, else GraphQL with no store. No currency stops the kind
  (`AcoCatalogExportProcessor.js` L709-739).

### aco_prices (`acoPricesExportTransform.js`)

- Per website with a store view (L1359-1371): R13 through one view, minus `downloadable`. The view
  is meant to be "the first session code that belongs to this website" (L187-203); as written it
  returns on the first code tried, so it is that code only when it is the alphabetically first one,
  else the website's lowest-id active view.
- Per product (L114-185): `regular` = `price` (or the `price` custom attribute); no price, no row.
  Root row `{sku, priceBookId: website code, regular}`; tier prices for all groups (32000) on this
  website (or website 0) become `tierPrices` (qty and price), and a qty-1 tier replaces `regular`
  (L94-106); `special_price` below `regular` becomes `discounts: [{code: "special_price", price:
  amount off}]` (L45-55). A child row per customer group with its own tiers, under the child book
  id, when they change anything. Rows deduplicated on (sku, priceBookId), the last kept (L209-219).

### aco_product_layers

A stub: no endpoints (config L138-146), so the processor answers success with nothing stored
(`AcoCatalogExportProcessor.js` L99-120).

## 4. Exclusions and the schema check

`export_exclusions_aco.json`: metadata user-defined only (the API filter); products drop
`downloadable` and `grouped`; prices drop `downloadable`. Every kind is checked against
`config/schemas/aco_<kind>.json` before it is stored, and a failure fails that kind.

## 5. What Demo Builder's port does

`src/features/data-installer/services/acoExport/`. Saved into the SC's **datapack library**
(private), through the same seam "Save store changes" uses: `writePackToStore` (never `update`,
so an existing name and version is refused) over `DatapackStoreWriter`. Undone by deleting the
pack from the library (`delete_library_datapack`).

| Service | Port | Why |
|---|---|---|
| every store view, no choice | the SC picks store views; none picked means every one, as the service | the item: "per chosen store views" |
| price books and prices for every website | every website when none picked; else the websites of the picked views | a subset of views names its websites |
| no Store header on store-wide reads (R1, R2, R4, R8-R11) | the project's client store-wide (`Store: all`, as the engine reads) | one client; option labels are the admin's (R8), where the service's are the default store view's. Same unless a view relabels options |
| R3 and R5 read twice per view; R13 re-reads products | each read once per view and shared | same answers |
| R12 GraphQL currency | `GET store/storeConfigs`, `default_display_currency_code` of the website's view | REST, the same field, the same Store; no new client |
| GraphQL with no store, for a website with no store view | that website gets no price book (it gets no prices in the service either) | no REST read names a store-wide display currency |
| the price view: the first code, as written | the first PICKED view of that website, else its lowest-id active view (the code's docstring) | website-scoped prices read the same through any view of it |
| the two `neq` filters | not sent; the post-fetch rule only | they match everything (§2) |
| `selections` | not taken | the export has no picker |
| schema check | the service's six schemas, copied verbatim (`config/aco-schemas/`), checked with ajv | same check, same failure per kind |
| `aco_product_layers` stub | not written, and said so | the service writes none |
| later page fails silently | a failed page fails the kind | `readAllPages` throws; never a silent short pack |
| `datapack_type` | not sent: the store's default (`accs`), as the service when not told | the library's `batch-get-data-items` defaults to `accs` (`accs-discovery-service/actions/lib/datapack.js` L47-51); typing it `aco` would hide it from every read the extension makes |
| the metadata quirk (§3) | fixed after the live read (2026-10-30) | "0" reads as no, "1" as yes |
| category description from the top level | fixed after the live read (2026-10-30) | read from `custom_attributes` first; `categories/list` has no top-level description |

**Not portable without a live check:** whether REST answers the attribute flags as strings
(metadata `visibleIn`, `searchable`); whether the product list carries
`configurable_product_options` and `bundle_product_options` (R7 covers it either way); whether
`store/storeConfigs` honours the scope the same as GraphQL's `currency` (INFERRED yes: both read
the store view's config); whether the library takes ACO kinds (yes by code: its `DATA_TYPES` lists
all seven `aco_*`, `accs-discovery-service/actions/lib/datapack.js` L37-45).
