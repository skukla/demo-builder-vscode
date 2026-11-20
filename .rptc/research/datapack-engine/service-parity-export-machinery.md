<!-- Read-only code comparison, 2026-10-30. No live calls of any kind. Service side: the local clone
of dsc-data-installer-api at branch fix/export-context-carries-mongo-params (3ced647 = origin/main's
parent 00f2927 plus the owner's MONGO_* fix; origin/main differs from it only by
`require-adobe-auth: true` on every action, DEMOSYS-1695). Line numbers are to that working tree.
Ours: worktree loop/release-candidate at 00e03c795. Covers export, the shared machinery and the
service-level actions; per-type import and delete are a second agent's. Companion to
export-spec.md (which cites an older ref, origin/feature/DEMOSYS-1698-add-validator). -->

# Does Demo Builder deliver what the Data Installer service's export and machinery did?

## Summary

Mostly yes, and in several places better. The one big hole: **Demo Builder can only save a store
into a pack when Demo Builder installed that pack there.** The service could read any store.

Verdict counts (116 table rows below, counted by script; three rows only point to another row):

| Verdict | Rows |
|---|---|
| SAME | 56 |
| OURS BETTER | 25 |
| GAP, WORTH INHERITING | 15 rows, 9 distinct gaps |
| GAP, NOT WORTH IT | 11 |
| ALREADY FILED | 6 |
| COULD NOT DETERMINE | 1 row, plus 3 open questions below |

### Gaps worth inheriting, ranked by what an SC would hit

1. **No pack from a store Demo Builder did not fill.** An SC who builds a demo by hand in the
   Admin has no way to turn it into a pack with the default engine. "Save store changes" refuses
   without an install record (`storeChanges.ts:293-294`); the service's export is refused with our
   engine (`exportHandlers.ts:97-99`) and its link hidden (`CatalogHeaderActions.tsx:59`). The
   service read every row of each kind (`processDataPack.js:337`, every `*ExportProcessor`).
   DI-1 states this user story but assumes the service's export, which still cannot store what it
   reads on its deployment (its fix is only on the owner's local branch, `contextBuilder.js:60`).
2. **Things the SC adds by hand are left out of "Save store changes".** A new product, a new cart
   rule, customer or company, or an empty new category is not in the saved version: capture reads
   only what the install record lists and what the installed version names (`capture.ts:246-251`,
   `captureB2b.ts:69-80`, `capturePromotions.ts:43-52`). Step 05 says these are "added by picking
   them, through the export item list" (`step-05-capture-and-repeat-installs.md`, "What it takes"
   item 4); that list feeds only the service's export, and nothing sends its picks (gap 1's
   selection row). The save's sentence does not say anything was left out.
3. **Installs by Demo Builder's engine are invisible to "installed" and "activity".** The service
   recorded every install per store (`installationTracker.js`, `get-installed-datapacks`) and
   logged every run (`requestLogger.js`, `logs`). Our `list-installed-datapacks` and
   `get-datapack-activity` read only the service (`dataInstallerHandlers.ts:449-474`), and the
   Activity view reads only that (`DatapackActivityView.tsx:76`). With our engine the default, an
   SC or agent asking "what is installed on this store?" gets an answer missing ours. Not filed.
4. **Making an ACO pack from a Commerce store.** The service's `process-aco-datapack` has an
   export mode (`processAcoDataPack.js:4`, `config/data_processors_aco_export.json`: metadata,
   categories, products, price books, prices, read from an ACCS or PaaS store). It is how new ACO
   packs get made. PL-60 records ACO install and why our engine refuses it, but does not name this.
5. **No round-trip check.** The service has `compare-datapacks` (`compareDatapacks.js`,
   `datapackComparator.js`, `compare_field_exclusions.json`) to prove that exporting what was
   installed gives the same pack. Ours has per-row pack-form tests (`packForm.test.ts`) but no
   test that installs pack rows and captures them back to the same rows (searched
   `tests/features/data-installer` for round trip; hits are in other suites).
6. **Product option ids carried over.** The service strips custom-option ids and bundle option
   and link ids (`data_processors_export.json:175-181`). Ours removes only `id`, timestamps and
   images (`packForm.ts:97`) and the stock block and websites (`packForm.ts:80`), so a captured
   product with custom options or bundle options carries this store's ids to the next. INFERRED:
   Commerce may refuse or mis-map them; not checked.
7. **A saved pack is not checked before it is stored.** The service checks every export against
   its JSON schema (`ProductsExportProcessor.js:232-234`) and every upload (`addDataItem.js:190-201`).
   Ours checks rows only when they are installed or dry-run (`productsKind.ts:73`,
   `kindContext.ts:186`), so a bad save shows up at the next install.
8. **A company with no region id.** The service falls back to the region text or "N/A"
   (`dataTransformer.js:155-159`); ours writes `region_id: Number(raw.region_id)`
   (`companiesKind.ts:194`), which is null when the store had none. INFERRED: matters only for
   countries without regions.
9. **Unnamed ids are kept silently, and then installed as ids.** Both sides keep an id they cannot
   name (`packForm.ts:40-46`; `lookups.js:1698` onward), and the service's own TODO wants a warning
   (`docs/TODO.md`, Medium). Ours then installs a numeric value as an id unchanged
   (`productsKind.ts:137`), so a category id kept from store A links the product to whatever
   category has that id on store B. Worth a count in the save's answer.

Already filed, not new: images (DI-7), `product_export` (DI-8), ACO install, delete and site
details (PL-60), the export user story (DI-1), credentials no longer sent (DI-6). New pointer for
DI-8: the service's `docs/convert_csv_to_json.py` and `docs/CONVERT_CSV_EXPORT.md` turn an
Admin product CSV export into that bulk form, which answers export-spec §5's guess at how those
packs were made.

### What could not be determined

- Anything live. No call was made.
- Whether our install takes a `downloadable` product captured without its links: the service
  leaves them out of export (`export_exclusions.json:37-47`), ours keeps them (`capture.ts:53`).
- Whether a swatch attribute captured by ours reinstalls: capture keeps `frontend_input`
  (`packForm.ts:138-147`), our install refuses `swatch_visual` and `swatch_text`
  (`attributesKind.ts:26-27, 65-66`). Whether Commerce's REST answer reports a swatch that way was
  not checked. Neither side exports swatch values. (Install side: the second agent's.)
- Whether the service's own web page used the `dependencies` block its export answers with.

## 1. Export, per data type (the service's 18)

"Service" is `config/data_processors_export.json` plus the processor; "ours" is capture
(`capture.ts`, `captureB2b.ts`, `capturePromotions.ts`), which runs only for a pack our engine
installed. Scope differs on every row the same way: the service reads the whole store per kind,
ours reads the pack's own objects and what they need. That difference is gap 1 and 2 above and is
not repeated per row.

| Data type | Service (file:line) | Ours (file:line) | Verdict |
|---|---|---|---|
| product_attributes | user-defined only (`export_exclusions.json:25-35`); `attribute_id` removed, option `value` set to its label (`data_processors_export.json:18-25`) | user-defined only, `attribute_id` removed, options as `{label, value: label}`, empty option dropped (`capture.ts:119-129`, `packForm.ts:138-147`) | SAME |
| attribute_sets | `Default` excluded (`export_exclusions.json:3-13`); rebuilt as `{attributeSet, skeletonId: 4}` (`dataTransformer.js:46-66`) | `Default` skipped, same shape (`capture.ts:151-153`) | SAME |
| attribute_assign_to_set | runs after product_attributes (`processingOrchestration.js:391`); keeps a source-store `attributeGroupId` its import ignores (`dataTransformer.js:422-442`) | set name and attribute code only (`capture.ts:154-157`) | SAME (neither carries the attribute group) |
| customer_groups | five Commerce groups excluded (`export_exclusions.json:14-24`); `{code, tax_class_id}` (`dataTransformer.js:78-96`) | same five (`captureB2b.ts:44`); same shape (`customerKinds.ts:94-96`) | SAME |
| customers | removes ids, website, store, timestamps, `extension_attributes`, address ids and region ids; group id to code (`data_processors_export.json:102-119`); keeps `default_billing`/`default_shipping` | removes those plus `default_billing`, `default_shipping`, password fields (`customerKinds.ts:99-102`); group to code (`customerKinds.ts:171-180`); keeps address `region_id` | OURS BETTER (no stale address ids; region ids are Commerce's own list, so keeping them is harmless) |
| categories | whole tree, root filtered four ways; path ids to names (`data_processors_export.json:136-146`); `root_category` only by a selection, which by id never matches (export-spec §2) | categories of captured products and their parents; root read from each path, written as `root_category` when the pack made it (`capture.ts:78-116`); same fields kept (`packForm.ts:122-135`) | OURS BETTER |
| products | see section 2 for each field | see section 2 | see section 2 |
| cart_rules | every rule; group ids to codes; condition ids to names; SKUs in conditions lowercased (`data_processors_export.json:203-277`, L219) | rule's own; groups to codes, conditions to names, SKUs exact, website ids, rule id and counter dropped, only default labels (`cartRulesKind.ts:143-155`, `ruleConditions.ts:80-100`) | OURS BETTER |
| coupons | every coupon, generated codes included, `times_used` kept; rule id to name (`data_processors_export.json:279-305`, `dataTransformer.js:349-389`) | codes typed in only, generated ones left out; id, counter and date dropped; rule by name (`capturePromotions.ts:72-77`, `couponsKind.ts:56, 122-128`) | OURS BETTER (by design: a pack installs every code as typed in) |
| stocks | all but `Default Stock`; `stock_id` removed (`data_processors_export.json:306-328`, `export_exclusions.json:48-58`) | the stocks the record lists (`capture.ts:176`) | SAME |
| sources | all but `default` (`export_exclusions.json:59-69`) | sources holding the captured SKUs, `default` left out (`capture.ts:173-175`) | SAME |
| stock_source_links | all links; stock id to name (`data_processors_export.json:362-364`) | the links the record lists, stock by name (`capture.ts:177`, `storeCopies.ts:139-141`) | SAME |
| source_items | every item in the store, SKUs lowercased (`data_processors_export.json:384`) | items of the captured SKUs, SKUs exact, `default` source included as the service includes it (`capture.ts:170-172`) | OURS BETTER |
| b2b_companies | create-company shape with the admin read by `super_user_id` (`B2BCompanyExportProcessor.js:24-39, 166-180`, `dataTransformer.js:139-189`); no status; `extension_attributes` as read | same shape and admin; status kept; `quote_config.company_id` dropped (`companiesKind.ts:177-200, 91-97`) | OURS BETTER (one small gap: region fallback, gap 8) |
| b2b_shared_catalogs | all but public "Default (General)"; group id to code; `store_id: 0` (`export_exclusions.json:70-82`, `data_processors_export.json:416-419`) | the pack's, public type left out; same fields (`captureB2b.ts:82-86`, `b2bStoreCopies.ts:45-54`) | SAME |
| b2b_shared_catalog_company_assignments | every catalog's companies by name (`SharedCatalogCompanyAssignmentExportProcessor.js:130-144`) | captured catalogs' captured companies by name (`captureB2b.ts:112-115`) | SAME |
| b2b_shared_catalog_categories | category ids to url keys (`SharedCatalogCategoriesExportProcessor.js:4, 130-137`) | the same, limited to captured categories (`captureB2b.ts:116-119`) | SAME |
| b2b_shared_catalog_products | SKUs, lowercased (`data_processors_export.json:469`) | SKUs exact, captured ones only (`captureB2b.ts:120`) | OURS BETTER |

Kinds ours captures that the service cannot export at all:

| Kind | Service | Ours | Verdict |
|---|---|---|---|
| giftcards | import only, no export entry (`data_processors_export.json`, absent) | captured as products, written under `giftcards`, amounts without ids (`capture.ts:249-255`, `giftCardAmounts.ts`) | OURS BETTER |
| store_config | none | each setting at its own scope (`capture.ts:286`, `storeConfigKind.ts:277`) | OURS BETTER |

## 2. Products, field by field

| Behaviour | Service (file:line) | Ours (file:line) | Verdict |
|---|---|---|---|
| ids and timestamps removed | `data_processors_export.json:168-173` | `packForm.ts:97` | SAME |
| images (`media_gallery_entries`) | removed (`data_processors_export.json:173`) | removed (`packForm.ts:97`) | ALREADY FILED (DI-7) |
| custom option `option_id`, `option_type_id` | removed (`data_processors_export.json:175-176`) | kept (`packForm.ts:97` keeps `options`) | GAP, WORTH INHERITING (gap 6) |
| bundle option and link ids | removed (`data_processors_export.json:179-181`) | kept (`packForm.ts:79-93` leaves `bundle_product_options` alone) | GAP, WORTH INHERITING (gap 6) |
| gift card amount `value_id`, `row_id` | removed (`data_processors_export.json:177-178`) | each amount alone, ids dropped (`packForm.ts:91`, `giftCardAmounts.ts`) | SAME |
| configurable option `id`, `product_id`; attribute id to code; value index to label | `data_processors_export.json:174, 189`; `lookups.js:2526` | `packForm.ts:67-77` | SAME |
| configurable child ids to SKUs | `lookups.js:2725-2741` | `packForm.ts:87-89` | SAME |
| `attribute_set_id` to name | `data_processors_export.json:185` | `packForm.ts:98-102` | SAME |
| `category_ids`, `category_links` to url keys | `data_processors_export.json:186-187`; `lookups.js:1698` | `packForm.ts:50-52, 81-85` | SAME |
| select and multiselect option ids to labels | `data_processors_export.json:188`; `lookups.js:1147` | user-defined select and multiselect only (`packForm.ts:48-63`) | SAME (both split multiselect on commas, so a label with a comma breaks either, INFERRED) |
| tier price group id to code | `data_processors_export.json:191` | `packForm.ts:105-111` | SAME |
| `stock_item` | kept, `is_in_stock` added when missing (`data_processors_export.json:190`) | dropped; quantities go as source items (`packForm.ts:80`, `capture.ts:170-183`) | GAP, NOT WORTH IT (quantities travel by source item, which ACCS uses) |
| `website_ids` | kept from the source store, replaced on import | dropped (`packForm.ts:80`) | SAME |
| SKUs | lowercased, `/` to `-`, all but `[a-z0-9-]` dropped (`data_processors_export.json:194`; `lookups.js:3098-3154`) | kept exactly (`packForm.ts:8-9`) | OURS BETTER (a round trip no longer renames products; PDP addresses use the ADR-007 escape instead) |
| type order | simple, virtual, configurable, bundle, grouped (`data_processors_export.json:193`) | the same with downloadable after virtual (`capture.ts:53`) | SAME |
| downloadable products | excluded (`export_exclusions.json:37-47`) | kept (`capture.ts:53`) | COULD NOT DETERMINE (whether our install takes one) |
| `product_export` (bulk form) | not exportable; made from Admin CSV by `docs/convert_csv_to_json.py` | none | ALREADY FILED (DI-8) |

## 3. Export as a whole

| Behaviour | Service (file:line) | Ours (file:line) | Verdict |
|---|---|---|---|
| Export a store no pack was installed into | yes, whole store per kind (`processDataPack.js:337`) | no: needs an install record (`storeChanges.ts:293-294`); service export refused with our engine (`exportHandlers.ts:97-99`, `CatalogHeaderActions.tsx:59`) | GAP, WORTH INHERITING (gap 1; story in DI-1) |
| Hand-made additions to a pack's store | in a whole-store export | left out (`capture.ts:246-251`) | GAP, WORTH INHERITING (gap 2) |
| Pick some items (selection filters) | `selections.<type>.filters`, equals, in, numeric (`selectionFilter.js:96`; `ProductsExportProcessor.js:133-135`) | handler takes `selections` (`exportHandlers.ts:157, 209`) but the screen (`ExportDatapackModal.tsx:130-137`) and `start_datapack_export` (`dataInstallerDescriptors.ts:351-366`) send none; capture has none | GAP, WORTH INHERITING (part of gap 1) |
| What a choice needs comes along | no: `depends_on` only orders the list; the answer names the values used (`dependencyValueTracker.js:102-131`, `ProductsExportProcessor.js:375-390`) | yes: categories and parents, set, attributes and options, assignments, sources (`capture.ts:256-276`) | OURS BETTER |
| Root category | matched by name from a selection, else the store root exported as an ordinary category (`CategoryExportProcessor.js:278-336`) | read from each category's path, named, never guessed (`capture.ts:75-111`) | OURS BETTER |
| Where the result goes | upserted into the named pack and version (`addDataItem.js`); a re-export writes over it | always a new version; the installed one is never written over (`storeChanges.ts:300-311`) | OURS BETTER |
| Saving what was read | fails on the deployment (no `MONGO_*` in the processor context; the fix is only on the owner's local branch, `contextBuilder.js:60`) | the library through `writePackToStore` (`storeChanges.ts:304`) | OURS BETTER |
| Time limit | synchronous, 300 s (`app.config.yaml:79`); the async action drops `selections` (`processDataPackAsync.js`, export-spec §4) | runs in the extension, no platform limit | OURS BETTER |
| Paging | 500 a page (`runtimeParams.js:149-152`); a failed later page is dropped silently (`ProductsExportProcessor.js:69-81`, 16 processors) | reads by id or SKU, 20 SKUs a read (`storeCopies.ts:30, 41-52`), 100 a page, 4 at once, a failed page fails the save (`erpFillReaders.ts:38, 57-73`) | OURS BETTER |
| Export item list counts | `total_count` is this page's items after exclusions (`getExportItems.js:525-540`) | asks one page of 1000 (`dataInstallerExportClient.ts:123`) | GAP, NOT WORTH IT (service engine only; our capture does not use the list) |
| Check the shape before storing | schema per kind (`ProductsExportProcessor.js:232-234`) | checked at install and dry run only (`productsKind.ts:73`, `kindContext.ts:186`) | GAP, WORTH INHERITING (gap 7) |
| A partial write | per kind into the pack, the rest left as it is | stops, keeps the record on the old version, asks the SC to delete the partial version (`storeChanges.ts:312-315`) | SAME (both leave a partial pack; ours says which kind) |
| Failure reasons reaching the SC | only with `verbose`; a failed export answers 200 with `success: false` inside | the export door logs each kind's verdict (`exportHandlers.ts:125-146`); capture answers one sentence or a `StoreChangesError` (`storeChanges.ts:68-74`) | OURS BETTER |
| Ids it cannot name | kept, logged only (`lookups.js:1698` onward; `CartRuleExportProcessor.js:175-176`) | kept, not reported (`packForm.ts:40-46`, `ruleConditions.ts:43-49`) | GAP, WORTH INHERITING (gap 9; the service's TODO asks for the same warning) |
| Make an ACO pack from a Commerce store | `process-aco-datapack` export mode (`processAcoDataPack.js:4`, `data_processors_aco_export.json:4-141`) | none | GAP, WORTH INHERITING (gap 4; PL-60 does not name it) |

## 4. Shared machinery

### Every substitution and lookup operation

From `BaseProcessor.js:139-167` (the dispatch), `lookups.js:3164-3194` (exports),
`substitutions.js:595-818` and `conditionLookups.js:753-763`. "Configured nowhere" was counted
across every `config/*.json`.

| Operation | Direction | Service (file:line) | Ours (file:line) | Verdict |
|---|---|---|---|---|
| `replaceWithLookup`, `replaceArrayWithLookup`, `lookupIdByValue` | name to id, generic | `lookups.js:157, 189, 255` | one function per field: set, category, attribute, option, group, product (`productLookups.ts:113-197`) | SAME |
| `replaceWithReverseLookup`, `replaceArrayWithReverseLookup`, `lookupValueById` | id to name: set, group, rule | `lookups.js:353, 591, 695` | `setName` (`productLookups.ts:119`), `groupCode` (`:185`), group codes on rules (`cartRulesKind.ts:138`), rule name on coupons (`couponsKind.ts:122-128`) | SAME |
| `replaceCategoryPathWithNames` | path ids to names | `lookups.js:780` | `categoryPackForm` (`packForm.ts:122-135`) | SAME |
| `getAllProductAttributes`, `replaceAttributeOptionValues` | option ids to labels | `lookups.js:1028, 1147` | `customAttribute` (`packForm.ts:48-63`) | SAME |
| `replaceAttributeOptionLabelsWithIds` | labels to option ids | `lookups.js:1450` | `optionId`, label first then option code (`productLookups.ts:155-162`) | OURS BETTER (layout codes like `1column` resolve) |
| `replaceCategoryIdsWithUrls` | category ids to url keys | `lookups.js:1698` | `packForm.ts:50-52, 81-85` | SAME |
| `replaceCategoryIdsByUrlKeys` | url keys to ids | `lookups.js:2377` | `categoryId`, under the pack's root first (`productLookups.ts:130-136`) | OURS BETTER (url keys are not unique in a store) |
| `replaceCategoryIdsWithCategoryLinks` | ids to links | `lookups.js:1370`; configured nowhere | none | GAP, NOT WORTH IT (unused) |
| `replaceAttributeOptionValueIdsWithLabels` | attribute options value from label | `lookups.js:1867` | `attributePackForm` (`packForm.ts:138-147`) | SAME |
| `replaceAttributeSetIdByName` | set name to id | `lookups.js:1939` | `setId` (`productLookups.ts:113-118`) | SAME |
| `replaceWebsiteIdsWithSession` | to the target's website | `lookups.js:2002` | `productsKind.ts:133`, `cartRulesKind.ts:90` | SAME |
| `replaceSalesChannelCodeWithSession` | stock sales channel | `lookups.js:2046` | `stockKinds.ts:85` | SAME |
| `replaceTierPriceWebsiteIdWithZero` | tier price website | `lookups.js:2329` | `productsKind.ts:161` | SAME |
| `replaceStockIdWithName` | stock id to name | `lookups.js:2105` | `storeCopies.ts:141` | SAME |
| `replaceStockNameWithId` | stock name to id | `lookups.js:2220` | `stockKinds.ts:100-101` | SAME |
| `replaceConfigurableProductOptions` | export | `lookups.js:2526` | `packForm.ts:67-77` | SAME |
| `replaceConfigurableProductLinks` | export, standalone | `lookups.js:2771`; configured nowhere (links handled inside the options call, `lookups.js:2725-2741`) | `packForm.ts:87-89` | SAME |
| `replaceConfigurableProductOptionsForImport` | import | `lookups.js:2836` | `productsKind.ts:115-127, 142-143` | SAME |
| `stripSkuWhitespace` | import, shared catalog products only (`data_processors_import.json:535`) | `lookups.js:3042` | not found (searched `trim` and `sku` in `demoBuilderEngine/`) | GAP, NOT WORTH IT (our SKU lookups match the store's own spelling; a SKU with spaces is the store's) |
| `makeSkuEDSCompatible`, `makeSkuStringEDSCompatible` | export | `lookups.js:3098-3154` | deliberately not done (`packForm.ts:8-9`) | OURS BETTER |
| `replaceFirstInPath` | category path root to the target's root name | `substitutions.js:34`; `data_processors_import.json:115, 257` | `placeCategories`, `rootPlacement` (`packRoot.ts`, used at `storeChanges.ts:224-225`) | SAME |
| `replaceLastInPath`, `replaceWithStaticMap`, `removeFieldWhenValue` | context | `substitutions.js:100, 337, 496`; configured nowhere | none | GAP, NOT WORTH IT (unused) |
| `replaceValue`, `replaceValueArray` | store, website codes and ids | `substitutions.js:212, 260`; `data_processors_import.json:252-256, 344` | the session's ids in each kind (`productsKind.ts:133`, `cartRulesKind.ts:90`, `customerKinds.ts:134`) | SAME |
| `replaceValue(operation_mode)` into `behavior` | writes `"import"` (export-spec §5) | `substitutions.js:212`; `data_processors_import.json:256` | none | ALREADY FILED (DI-8) |
| `addStaticValue` | export: `stock_item`, `sharedCatalog.store_id: 0` | `substitutions.js:376`; `data_processors_export.json:190, 417` | `store_id: 0` (`b2bStoreCopies.ts:49`); no stock block | SAME |
| `replaceFieldInArrayItems` | attribute label store ids | `substitutions.js:297`; `data_processors_import.json:59` | `attributesKind.ts:82` | SAME |
| `setFieldLiteral` | ACO export only | `substitutions.js:784-806`; `data_processors_aco_export.json:15-16` | none | ALREADY FILED (PL-60) |
| placeholder substitution | `{{...}}` in rows | `substitutions.js:557` | none | GAP, NOT WORTH IT (our packs carry no placeholders) |
| `lookupSegmentId` (`lookup_by_name` on `segments_search`) | segment name to id | `conditionLookups.js:42`; configured nowhere (the one `lookup_by_name` rule is for sets, `data_processors_import.json:374-377`) | segment conditions sent as they are and logged (`ruleConditions.ts:19-21, 102-106`) | SAME (neither carries a segment) |
| `lookupCategoryIds`, `lookupCategoryUrlKeysByIds` | rule conditions on categories | `conditionLookups.js:110, 438` | `ruleConditions.ts:51-55` | SAME |
| `lookupAttributeSetId`, `lookupAttributeSetNameById` | rule conditions on sets | `conditionLookups.js:241, 479` | `ruleConditions.ts:57-61` | SAME |
| `lookupProductAttributeOptionId`, `lookupProductAttributeOptionLabel` | rule conditions on options | `conditionLookups.js:148, 549` | select and multiselect only, user-defined on capture (`ruleConditions.ts:64-78`) | OURS BETTER (cart fields like `quote_item_qty` are no longer looked up as options) |

### The rest of the machinery

| Behaviour | Service (file:line) | Ours (file:line) | Verdict |
|---|---|---|---|
| Group aliases (General, Guest) | `lookup_aliases.json:1-7` | both directions (`productLookups.ts:38-42, 173-183`) | SAME |
| Cart-rule condition translation, both trees | `conditionProcessor.js:22-146`, `data_processors_export.json:220-268` | `ruleConditions.ts:88-100` | SAME |
| Pack-to-pack comparison | `compareDatapacks.js`, `datapackComparator.js`, `compare_field_exclusions.json` (for integration tests) | none; `fingerprint.ts` compares a store with itself | GAP, WORTH INHERITING as a test (gap 5); NOT WORTH IT as a feature |
| JSON schema check | on export, on upload (`addDataItem.js:190-201`, modes reject, warn, skip), on import | zod per kind on install and dry run (`productsKind.ts:73`, `categoriesKind.ts:59`, `kindContext.ts:186`); zip load checks kind names only (`datapackZip.ts:66-84`) | GAP, WORTH INHERITING at save (gap 7) |
| Installation tracking | per store, pack, version and type (`installationTracker.js`; `get-installed-datapacks`) | per project, one file per pack (`installRecord.ts`); not read by the "installed" and "activity" handlers (`dataInstallerHandlers.ts:449-474`) | GAP, WORTH INHERITING (gap 3) |
| `shared` | pack metadata (`datapackMetadataFields.js`) | the library's `shared`, Share and Stop sharing (step 07, `ShareLibraryPackButton.tsx`) | SAME |
| `datapack_type` (accs, aco) | identity field; ambiguous name and version asks for it (`datapackMetadataFields.js:47-121`) | never sent (searched `datapack_type` in `src/features/data-installer`) | GAP, NOT WORTH IT (ACO packs are named `aco_*`, so no collision) |
| Configurable exclusions | `export_exclusions.json` | constants (`capture.ts:48-49`, `captureB2b.ts:44`) | GAP, NOT WORTH IT (same lists; nobody edits them) |
| Commerce sign-in | the service's own per site type (`authHelper.js`, `authenticate.js`) | the project's signed client (`buildDatapackEngine.ts:98-104`), org checked first (`storeChangesHandlers.ts:111`) | OURS BETTER (no secrets on the wire, DI-6) |
| Caller check | `require-adobe-auth` (origin/main), `imsValidator.js`, `middleware/imsAuth.js` | the library's own guard plus the gateway check (overview, Security) | SAME |
| Input sanitising | `middleware/sanitizer.js` | a pack is untrusted input; codes checked, values escaped where placed (overview, Security; `stockKinds.ts:38`) | SAME |
| Per-run log | `requestLogger.js`, read by `logs` and `datapack-process-status` | Debug Logs, the job record and its note (`engine.ts`, step 05) | GAP, WORTH INHERITING (folded into gap 3) |
| Lookup caching | per kind; the TODO wants it across kinds (`docs/TODO.md`, Medium) | per install or capture across every kind (`productLookups.ts:90-97`) | OURS BETTER |

## 5. Service-level actions (`app.config.yaml`)

| Action (line) | What it does | Demo Builder | Verdict |
|---|---|---|---|
| `health` (15) | liveness | not called; `health-check` is | GAP, NOT WORTH IT |
| `authenticate` (29) | gets a Commerce token from credentials | not called; the project's client (`buildDatapackEngine.ts:98-104`) | OURS BETTER |
| `process-datapack` (44) | import, validate, delete, export | service engine (`dataInstallerWriteClient.ts:162`, `dataInstallerExportClient.ts:157`); our engine replaces import, validate and delete; export only partly (gaps 1, 2) | SAME for install; GAP for export (counted above) |
| `process-datapack-async` (183), `process-datapack-worker` (204), `async-process-status` (243) | long imports in the background, then poll | service engine (`dataInstallerWriteClient.ts:181-218`, `dataInstallerClient.ts:236`); our engine runs as a job in the extension | SAME |
| `process-aco-datapack` (83), `-async` (120), `-worker` (141) | ACO import, validate, delete and export | not called | ALREADY FILED (PL-60) for install; export is gap 4 |
| `get-aco-site-details` (295) | ACO catalog views, scopes, policies, price books | not called | ALREADY FILED (PL-60) |
| `health-check` (257) | service and database reachable | `dataInstallerClient.ts:86` | SAME |
| `get-websites-and-stores` (272) | the store's websites and views | service engine only (`dataInstallerWriteClient.ts:129`); our engine reads Commerce itself (`importScopeDiscovery.ts`) | OURS BETTER |
| `find-datapacks` (318), `get-datapack-metadata` (400), `get-data-item` (340), `batch-get-data-items` (360) | read the catalog | `dataInstallerTransport.ts:36-39`, both stores | SAME |
| `create-datapack` (422), `add-data-item` (444) | upload a pack | `datapackStoreWriter.ts:71-97` (library and "Copy to the Data Installer") | SAME |
| `update-datapack-metadata` (465) | rename, share | `datapackStoreWriter.ts:152-154` (library) | SAME |
| `update-data-item` (487), `delete-data-item` (529) | edit one kind of a pack in place | not called; a save writes a new version | GAP, NOT WORTH IT (versions replace edits in place, step 07) |
| `delete-datapack` (508) | delete a pack | `datapackStoreWriter.ts:111-122` (library only; the agent surface withholds it for the shared catalog, `readDescriptors.ts:609-617`) | SAME |
| `promote-datapack-version` (550) | copy a version onto another, archiving the old | not called | GAP, NOT WORTH IT (the project records the new version; step 07) |
| `compare-datapacks` (380) | compare two packs | not called | GAP, WORTH INHERITING as a test (gap 5) |
| `get-processor-order` (571), `get-export-data-types` (588) | kind lists | `dataInstallerClient.ts:152-163` | SAME |
| `get-export-items` (601) | items of one kind to pick from | `dataInstallerExportClient.ts:122-146`, `list_datapack_export_items`; picks never sent | GAP (counted in section 3) |
| `logs` (619), `datapack-process-status` (641) | run history | service runs only (`dataInstallerClient.ts:183, 208`) | GAP, WORTH INHERITING (gap 3) |
| `get-installed-datapacks` (661) | what is installed on a store | service installs only (`dataInstallerClient.ts:169`) | GAP, WORTH INHERITING (gap 3) |
