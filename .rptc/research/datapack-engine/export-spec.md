<!-- Read off the Data Installer service's processors (dsc-data-installer-api, ref
origin/feature/DEMOSYS-1698-add-validator, read with `git show`) on 2026-10-27, to specify Demo
Builder's capture (export) of the catalog kinds (DI-5). A specification of THEIR behaviour, not
ours: where we deliberately differ, the plan says so. Companion to catalog-spec.md (install and
remove). Line citations are to that ref. INFERRED marks anything not read directly in code. -->

# Spec: Data Installer catalog export (ACCS)

Every export processor runs one pipeline: fetch everything, paginated → drop hard-coded
defaults → apply `selections` filters → transform the shape (`actions/processor/dataTransformer.js`)
→ `field_mappings` → `filterExcludedItems` (`config/export_exclusions.json`) → `substitutions`
(id → name) → schema-validate (`config/schemas/<type>.json`) → upsert into MongoDB
(`actions/database/addDataItem.js` L341-372, `updateOne … upsert:true`; the pack is created if
absent, L282). **The output is a stored pack, not a response body.** The working tree's one
relevant difference: `contextBuilder.js` adds `...getMongoParams(params)`, without which the
store step fails on Stage ("MongoDB connection URI required").

## 1. What is exported

- Entry: `process-datapack` with `operation_mode: "export"` (`actions/processor/processDataPack.js`).
  The pack need not exist (L265-280). Kinds come from `data_types` (L337-362); empty means every
  export kind in the config.
- `attribute_assign_to_set` is always taken out of the list (L343-361) and runs automatically after
  `product_attributes` succeeds, reading the just-stored attributes back from MongoDB
  (`processingOrchestration.js` L287-311, L384-440).
- Kinds run in config order, one at a time (`sortItemsByProcessorOrder`, L382). **`depends_on` is
  not enforced**: `dependencyResolver.resolveDependencies` has no caller; it only orders the UI
  list (`getExportDataTypes.js` L32-44). Asking for `products` does not bring `categories`.
- **Always the whole store.** No processor is scoped to a website, store or root category. Every
  fetch is an unfiltered paged loop, page size `EXPORT_PAGE_SIZE` (default 500,
  `actions/utils/runtimeParams.js` L147-153). A page after the first that fails is **silently
  dropped** (e.g. `ProductsExportProcessor.js` L79-82).

| Kind | Excluded | Where |
|---|---|---|
| product_attributes | system attributes (API filter `is_user_defined eq 1`) | `export_exclusions.json` L25-35, `apiFilterBuilder.js` L29-58 |
| attribute_sets | `Default` | `export_exclusions.json` L3-13 |
| attribute_assign_to_set | none: every set, Default included, but only exported attributes | `AttributeAssignmentExportProcessor.js` L207-224 |
| categories | Root Catalog (`parent_id` 0/null, or id 1 named like "root"), filtered four times | `CategoryExportProcessor.js` L137-153, L186-211, L229-249, L258-276 |
| products | `type_id == downloadable` | `export_exclusions.json` L37-47 |
| stocks | `Default Stock` | `StocksExportProcessor.js` L125-133; exclusions L48-58 |
| sources | `default` | `SourcesExportProcessor.js` L125-133; exclusions L59-69 |
| stock_source_links, source_items | nothing: Default Stock links and `default` items are exported | — |

## 2. id → name, against the import transforms

Applied by `BaseProcessor.applySubstitutions` (L115-554), matching field names at any depth;
reverse lookups in `lookups.js` `lookupValueById` (L353-578), first item of a filtered search.

| Field (kind) | Export | Import | Reverse? |
|---|---|---|---|
| `attribute_set_id` (products) | id → set name (`data_processors_export.json` L185; `lookups.js` L308-312, L557-566) | name → id | yes |
| `category_ids`, `category_links[].category_id` (products) | id → url_key via `GET /V1/categories/{id}` (`lookups.js` L1698-1856, L356-387); only string ids; a failed lookup keeps the id | url_key → id | yes |
| `custom_attributes` option values (products) | id → label; one `GET /V1/products/attributes`, pageSize 1000, user-defined select/multiselect/yesno (`lookups.js` L1028-1136, L1147-1359); multiselect split and re-joined on `,` (a label with a comma breaks it, INFERRED) | label → id | yes; system selects (`tax_class_id`) stay numeric both ways |
| `configurable_product_options` | `attribute_id` → code; `values[].value_index` → label; `id`, `product_id` deleted (`lookups.js` L2526-2723) | code/label → ids | yes |
| `configurable_product_links` | ids → SKUs via `GET /V1/products?entity_id eq` (`lookups.js` L2727-2741) | SKU → id | yes |
| `customer_group_id` (tier prices) | id → code via `GET /V1/customerGroups/{id}` (`lookups.js` L423-460) | code → id, with aliases | yes; aliases on import only |
| `website_ids`, tier `website_id`, label `store_id`, stock `sales_channels` | none: source-store values exported | forced to the install target's | no reverse, none needed |
| attribute `options[].value` | value ← label (`data_processors_export.json` L24; `lookups.js` L1867-1928) | none | export only |
| `attributeSetId` (assignments) | set id → name (`dataTransformer.js` L428-442) | name → id | yes |
| `attributeGroupId` (assignments) | source-store group id kept (L432, L439) | ignored | dead data |
| category `path` | `"1/2/41/57"` → `"Default Category/Men/Tops"`, dropping id 1 and its own segment (`lookups.js` L837-877) | names drive parent resolution | yes |
| category `parent_id` | source-store id kept (`dataTransformer.js` L232) | re-resolved from path | ignored on import |
| `stockSourceLink.stock_id` | id → stock name (`data_processors_export.json` L363; `lookups.js` L2105-2200) | name → id | yes |
| SKUs (products, source_items) | **rewritten**: `make_sku_eds_compatible` lowercases, `/` → `-`, drops all but `[a-z0-9-]` (`lookups.js` L3098-3154; config L194, L384) | none | **no: a round trip changes every SKU** |

- **Root category:** `selections.categories.root_category: {id|name}` moves the match into
  `root_category` (`CategoryExportProcessor.js` L278-336). Matching by id never succeeds, because
  the transform drops `id` (`dataTransformer.js` L229-239). Without it the store root is exported
  as an ordinary category with `path: ""` (L873); INFERRED: import then makes a second
  "Default Category" under the real one.

## 3. Fields removed or rewritten

- products, `field_mappings.remove` (`data_processors_export.json` L167-183): `id`, `entity_id`,
  `created_at`, `updated_at`, `media_gallery_entries`, configurable option `id`, custom option ids,
  gift card `value_id`/`row_id`, bundle option ids, `product_links.id`/`option_id`. Not removed:
  `stock_item` with its `item_id`, `product_id`, `stock_id`. `stock_item` gains
  `{"is_in_stock": true}` only when absent (L190; `substitutions.js` L376-486). Sorted simple →
  virtual → configurable → bundle → grouped (L193) and wrapped `[{product}]` (L233).
- attribute_sets rebuilt as `{attributeSet:{attribute_set_name, sort_order||0, entity_type_id||4},
  skeletonId: entity_type_id||4}` (`dataTransformer.js` L59-66): `skeletonId` is the entity type,
  not the source skeleton.
- categories keep `name, parent_id, path, is_active, position, include_in_menu,
  custom_attributes` (L229-239), minus custom attributes `path`, `children_count`, `url_path`
  (`data_processors_export.json` L136-143).
- stocks lose `stock_id` (L503-511); sources keep the whole row plus defaults for `enabled` and
  `use_default_carrier_config` (L538-566); links `{stock_id, source_code, priority||1,
  extension_attributes}` (L593-601); source items `{sku, source_code, quantity||0, status||0,
  extension_attributes}` (L468-476).

## 4. Exporting some items

- Listing: `get-export-items` (`actions/config/getExportItems.js`; `app.config.yaml` L596-597),
  called by the extension's `list_datapack_export_items` (`dataInstallerExportClient.ts` L124).
  One search call per page (page size default 50, max 1000), same filters and exclusions.
  **Its `total_count` and `total_pages` count this page only** (L526-527).
- Selecting: `process-datapack` param `selections`,
  `selections.<data_type>.filters = { "<raw field>": {operator, value} }`; operators equals,
  not-equals, in, not-in (strict `===`, so number and string ids do not match), and numeric
  comparisons (`selectionFilter.js` L49-85); fields ANDed. Applied to raw Commerce items before
  any transform. **A selection pulls in no dependencies**: selected products still name sets and
  categories that were not exported (INFERRED consequence).
- `process-datapack-async` does not forward `selections` (`processDataPackAsync.js` L27-57), so an
  async export exports everything. The extension uses the sync action (300 s timeout).

## 5. `product_export` (Luma, Venia)

- Cannot be exported: not in `data_processors_export.json`. Packs of this kind were made some
  other way (INFERRED).
- Import (`data_processors_import.json` L239-259): `JsonImportProcessor` POSTs the whole item once
  to `/V1/import/json` (`config/endpoints/base.json` L45), unchunked. It rewrites `_store`,
  `store_view_code`, `_website`, `product_websites` and the first path segment of `categories`
  to the target's, and **`behavior` to the literal `"import"`** (`substitutions.js` L632-651).
  INFERRED: not one of Commerce's behaviours (`append`, `add_update`, `replace`, `delete`); how
  ACCS treats it is unverified.
- Remove: `ProductExportDeleteProcessor` sends the SKUs alone with `behavior: "delete"` to the same
  route (L21-66, L81-105).
- Synchronous, judged from the response text (`"Entities Processed: N"`; errors by words), no
  polling (`JsonImportProcessor.js` L50-106; `BaseProcessor.js` L766-830).

## 6. Images

`media_gallery_entries` is removed from products (`data_processors_export.json` L173), though the
schema allows it (`config/schemas/products.json` L196-198). The `image`, `small_image`,
`thumbnail` and `swatch_image` attributes are kept: file paths in the source store, re-sent to a
store that does not have the files (INFERRED). No processor downloads or uploads media.
`product_images_import` (`/V1/async/bulk/products`, `base.json` L11) is defined and referenced by
nothing.
