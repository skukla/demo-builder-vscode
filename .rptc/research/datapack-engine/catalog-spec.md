<!-- Read off the Data Installer service's processors (dsc-data-installer-api, branch
feature/DEMOSYS-1698-add-validator) on 2026-10-27, to specify Demo Builder's own catalog
engine (DI-5). A specification of THEIR behaviour, not ours: where we deliberately differ, the
plan says so. Line citations are to that branch. -->

# Spec: Data Installer catalog install and remove (ACCS)

Source: `dsc-data-installer-api`, branch `origin/feature/DEMOSYS-1698-add-validator`. Paths below are relative to the repo root; `L` means line number. **INFERRED** marks anything not read directly in the code, mostly Adobe Commerce behaviour.

## 0. Cross-cutting behaviour

### Endpoints
- Paths come from `config/endpoints/base.json` (L2-94). The ACCS overlay `config/endpoints/accs.json` is empty (L2-3), so ACCS uses the base paths unchanged.
- The full URL is `{commerce_instance}{path}`, for example `{base}/V1/products` (`actions/utils/httpClient.js` L314-317).
- No `/rest/<store>` prefix is added. **INFERRED**: the caller supplies an ACCS REST base URL that already includes the tenant, and calls run in the default store scope.
- `commerce_instance` is either a full URL or an id expanded with `COMMERCE_INSTANCE_URL_TEMPLATE` (`actions/utils/commerceInstanceResolver.js` L87-149).

### Auth (brief)
- One token is fetched at the start of each run (`actions/processor/processDataPack.js` L194-207; `actions/processor/authHelper.js` L22-102).
- IMS client_credentials against `ims-na1.adobelogin.com/ims/token/v3`, default scope `AdobeID,openid` (`actions/auth/authenticate.js` L110-138).
- On this branch, credentials come only from server env (`DATA_INSTALLER_COMMERCE_CLIENT_ID`/`SECRET`). Request-supplied credentials and admin username/password were removed (diff `0eccb0b..branch`: `commerceAuthParams.js`, `authenticate.js` L27-31).
- Every call sends `Authorization: Bearer <token>` (`httpClient.js` L299-301).
- A pre-flight `GET /V1/store/websites` with a 10 s timeout confirms the store is reachable (`authHelper.js` L280-312).

### Store scoping ("session" values)
- Defaults: website id `1`/`base`, store id `1`/`default`, root category id `2`/`Default Category` (`actions/processor/contextBuilder.js` L68-78).
- If `website_code` and `store_code` are given, both are required. They are checked against the store, and their ids replace the defaults (`processDataPack.js` L209-248).

### HTTP behaviour
- Main request timeout: 300 s (`httpClient.js` L75, L351).
- Lookup GETs: 30 s (`actions/utils/lookups.js` L112; `actions/utils/conditionLookups.js` L276).
- Retries: axios-retry with exponential delay, `MAX_RETRIES` default 3 (`httpClient.js` L86-94).
- Retries fire on network or idempotent-request errors, **and on 429/500/502/503/504 for any method, including POST**. A non-idempotent POST (category, stock, attribute-set group) can be replayed after a 5xx.
- Everything runs one at a time. Data types run sequentially (`actions/processor/processingOrchestration.js` L263), and every processor loops with `await`. No parallel requests.

### Data model
- A pack is one stored item per data type, shaped `{data_type, data}` (`actions/processor/dataRetrieval.js` L56-61).
- Items are sorted by the data type's position in the import or delete config (`processingOrchestration.js` L94-115).
- The import config has no `depends_on`. `actions/processor/dependencyResolver.js` is used only for export. **Order is the only dependency mechanism.**

### Values carried between kinds ("session updates")
- After each kind finishes, three things are merged into the parameters for later kinds (`processingOrchestration.js` L352-379; `actions/processor/itemProcessor.js` L774-792):
  - `attribute_set_mappings` (set name → id)
  - `attribute_group_mappings` (set name → group id)
  - `session_root_category_id` / `session_root_category_name`
- Nothing else carries over. In particular, the category name→id map stays on one processor's context and is not passed on.

### Validate mode
- Uses the import config (`actions/processor/processorConfigLoader.js` L28-41).
- Authenticates and runs the pre-flight with endpoint checks skipped (`processDataPack.js` L197-203).
- Loads and sorts the pack, then checks each data type against `config/schemas/<type>.json` (`processingOrchestration.js` L156-214).
- Returns per-type valid/invalid. It makes no Commerce writes and no installation record (`processDataPack.js` L402-435).
- It does not check references, such as whether an attribute set or category exists.
- Import and delete also run the schema check, and stop on the first invalid type (L392-398).

### Installation record
- Saved to the MongoDB collection `MONGO_COLLECTION_INSTALLATIONS`, keyed by (commerce_instance as supplied, datapack_name, version, datapack_type) (`actions/utils/installationTracker.js` L62-69).
- Import inserts or updates `{commerce_instance, datapack_name, version, datapack_type, data_types[], installed_at, overall_processing_time}` (L135-154).
- Delete removes the document (L203).
- Both writes are fire-and-forget, and only happen when the run "succeeds" (`processDataPack.js` L688-708).
- "Succeeds" means at least one data type succeeded, or all were skipped (L605). A partial failure still writes or removes the record.
- **The record holds no entity ids. Removal never reads it.**

### "Already gone" handling on delete
- 2xx counts as deleted.
- 404/410, or a 400 whose message contains "no such entity", "does not exist" or "doesn't exist", counts as skipped, not failed (`actions/utils/commerceRestDeleteOutcome.js` L36-88).

---

## 1. product_attributes

**Pack row:** `{ attribute: {attribute_code, frontend_input, options[], frontend_labels[], …} }`. The schema forbids `attribute_id` (`config/schemas/product_attributes.json` L35).

### Install (`actions/processors/ProductAttributeImportProcessor.js`)
1. Search: `GET /V1/products/attributes?searchCriteria…attribute_code eq <code>` (L196-263).
2. **If it exists, delete it first:** `DELETE /V1/products/attributes/{code}`. If the delete fails, it logs and carries on (L292-322). Header comment: "If an attribute already exists, it is deleted and recreated" (L5).
3. Change `frontend_labels[].store_id` to the session store id. The config line is `replaceFieldInArrayItems(store_id, session_store_id)` (`config/data_processors_import.json` L58-60; `actions/utils/substitutions.js` L754-770). Every label ends up on one store id.
4. Strip `attribute_id` (L330-336).
5. `POST /V1/products/attributes` with the whole row (L361-373):

   ```json
   {"attribute": {"attribute_code": "color_x", "frontend_input": "select",
     "options": [{"label": "Red"}], "frontend_labels": [{"store_id": 1, "label": "Color"}]}}
   ```

6. Swatch types (`swatch_visual`, `swatch_text`) are created without `options` and `default_value`. Each option is then added with `POST /V1/products/attributes/{code}/options` and body `{option:{label, value:String(value), sort_order, is_default, store_labels?}}` (L338-352, L475-525). The reason given: the API "does not properly populate eav_attribute_option_swatch when options are included in the initial attribute creation" (L7-10).
7. If create fails with "attribute with the same code", the row is reported as success/skipped (L19-49, L390-403).

### Existing items
Found by `attribute_code`, then deleted and recreated. **INFERRED** (Commerce): this drops the attribute from every attribute set and wipes stored product values. Option ids change.

### Id mapping
The new `attribute_id` is kept only in `this.attributeMap` (L165-170). Nothing reads it later, and it is not a session value. Later kinds look it up again.

### Remove (`actions/processors/ProductAttributeDeleteProcessor.js`)
- `DELETE /V1/products/attributes/{code}` for every code in the pack (L190-206).
- Skips `sku, name, price, status, visibility, category_ids` (L17).
- No check that this run created the attribute.

### Dead code
`ProductAttributeSwatchProcessor.js` is not registered in `ProcessorFactory.js` and no config references it (checked with git grep; the control search found the import processor).

---

## 2. attribute_sets

**Pack row:** `{ attributeSet: {attribute_set_name, sort_order, entity_type_id}, skeletonId? }` (`config/schemas/attribute_sets.json`).

### Install (`actions/processors/AttributeSetImportProcessor.js`)
1. Reads existing sets once: `GET /V1/products/attribute-sets/sets/list?searchCriteria[pageSize]=100`. **Single page; sets beyond 100 are missed** (L175-231).
2. For each existing set, looks up a group named like the set: `GET /V1/products/attribute-sets/groups/list?…attribute_group_name eq <set name>`. The filter does not restrict to that set's id. If no exact match, the first group returned is used (L239-306).
3. If the name is already in the map, the set is skipped and its existing ids are returned (L322-332).
4. Otherwise `POST /V1/products/attribute-sets` with:

   ```json
   {"attributeSet": {"attribute_set_name": "Bikes", "sort_order": 0, "entity_type_id": 4}, "skeletonId": 4}
   ```

   `entity_type_id` and `skeletonId` default to 4 (L335-342).
5. Then creates a group with the same name as the set: `POST /V1/products/attribute-sets/groups` (L394-410):

   ```json
   {"group": {"attribute_group_name": "Bikes", "attribute_set_id": 12,
     "extension_attributes": {"attribute_group_code": "bikes", "sort_order": "100"}}}
   ```

   The code is the lowercased name with non-alphanumerics replaced by `_` (L465-480). If the group fails, the set still counts as success (L429-432).

### Existing items
Skipped when the name matches.

### Id mapping
Set name → `attribute_set_id`, and set name → group id, are written to `context.attribute_set_mappings` and `attribute_group_mappings` (L100-112). These carry over as session values.

### Remove (`actions/processors/AttributeSetDeleteProcessor.js`)
- If a row has `attribute_set_id`, it deletes by that id directly (L100-108). **Risk:** that would be an id from the source store.
- Otherwise it searches `attribute_set_name eq`, takes the first item (L274-311), then calls `DELETE /V1/products/attribute-sets/{id}` (L334-350).
- Skips `Default, Bag, Bottom, Downloadable, Sprite Stitch Pattern` (L16).

---

## 3. attribute_assign_to_set

**Pack row:** `{attributeSetId: "<SET NAME>", attributeCode, sortOrder, attributeGroupId?}`. The `attributeSetId` field holds the set **name** (`config/schemas/attribute_assign_to_set.json`; `actions/processors/AttributeAssignmentProcessor.js` L6, L150).

### Install
1. **Set id:**
   - The name `Default` maps straight to id 4 and group 7, from config `default_attribute_set` (`data_processors_import.json` L83-89; processor L265-274, L302-311).
   - Otherwise the session `attribute_set_mappings` (L277-281).
   - Otherwise a one-time `GET …sets/list?searchCriteria[pageSize]=100` (L426-475).
2. **Group id:**
   - Session `attribute_group_mappings` first.
   - Otherwise `GET …groups/list` filtered by group name equal to the set name, exact match or else the first result (L360-420).
   - Otherwise `0` (L169-176).
   - The pack's `attributeGroupId` is ignored.
3. `POST /V1/products/attribute-sets/attributes` with (L556-569, L195-208):

   ```json
   {"attributeSetId": 12, "attributeGroupId": 55, "attributeCode": "color_x", "sortOrder": 10}
   ```

### Existing items
No check is made. It relies on Commerce's response; **INFERRED** that re-assigning is harmless.

### Remove
Nothing. `NoOpDeleteProcessor`, reasoning "Deleted when attribute sets are deleted" (`data_processors_delete.json` L150-156).

---

## 4. categories

**Pack shape:** `{ root_category?: {name, parent_id, is_active, include_in_menu, custom_attributes[]}, categories: [{category: {name, path, is_active, position, include_in_menu, custom_attributes[]}}] }` (`config/schemas/categories.json`).

`path` is the **chain of parent names, without the category itself**, e.g. `"Luma Catalog/Men/Tops"`. Export builds it from the id path, dropping id 1 and the category's own name (`lookups.js` L836-870).

### Install (`actions/processors/CategoryImportProcessor.js`)

**Root category:**
- Searched only if `parent_id` is set and not 0 (L81-104).
- The search is `GET /V1/categories/list` with `parent_id eq P` and `name eq N`, **both in filterGroups[0]**, with pageSize 10. Code then picks the first item whose name matches and checks its parent (L502-549).
- **INFERRED** (Magento): filters inside one group are joined with OR. So the query returns the parent's children OR same-named categories anywhere, capped at 10 rows. A real match can be missed, which causes a duplicate POST.
- If found, the root is skipped. If not, `POST /V1/categories` with `{category: <root_category>}` (L139-145).
- Either way the root id and name become `session_root_category_*` and are carried forward (L335-343).

**Regular categories:**
1. Sorted by path depth, shallowest first (L557-577).
2. Parent id resolution (L352-398, L436-474):
   - Take the last path segment.
   - Look up the full path, then the name alone, in the run's own map (`categoryMap` and `context._session_created_categories`).
   - If not found, use the session root id (default 2) and mark `parent_resolution_issue`.
3. `path` is deleted from the payload (L393-396).
4. The configured `replaceFirstInPath(session_root_category_name)` therefore has nothing to act on. It runs after `path` is removed (L201-209; `substitutions.js` L34-91). **INFERRED: a no-op for categories.**
5. Duplicate check: the same OR-group list search, by resolved parent and name. **It is skipped when the parent was unresolved** (L218-239).
6. **INFERRED:** first-level categories whose path is the store root's name (e.g. `Default Category`) only resolve if a `root_category` was in the pack. Otherwise they fall back to id 2 with no duplicate check, so a reinstall POSTs again.
7. `POST /V1/categories` with (L262-269):

   ```json
   {"category": {"name": "Tops", "parent_id": 41, "is_active": true,
     "custom_attributes": [{"attribute_code": "url_key", "value": "men-tops"}]}}
   ```

8. On success the new id is registered under both the name and the full path (L483-493).

### Existing items
Skipped when matched by (parent, name).

### Id mapping
The name/path → id map lives only inside the category run. Products later find categories by **url_key**, through a live search (§8).

### Remove (`actions/processors/CategoryDeleteProcessor.js`)
- Walks the pack rows **in reverse array order** (L41-48). That is not the depth order import used.
- If a row has `id`, it deletes by that id directly (L52, L97-103). **Risk:** a source-store id.
- Otherwise it finds the url_key (direct field or in `custom_attributes`), searches `GET /V1/categories/list?url_key eq`, and takes the **first item anywhere in the store** (L372-438).
- Then `DELETE /V1/categories/{id}` (L448-470).
- The root is deleted last. Its url_key falls back to the name lowercased with spaces as hyphens (L221-296).
- Ids `[1, 2]` are protected, but only if the row carries an id (L19, L56-68).
- **INFERRED:** Commerce deletes a category's children with it, so later rows come back not-found and are counted as skipped.

---

## 5. stocks

**Pack shape:** `{stocks: [{stock: {name, extension_attributes: {sales_channels: [{type, code}]}}}]}`.

### Install (`actions/processors/StocksImportProcessor.js`)
1. Every `sales_channels[].code` is replaced with the session website code (`data_processors_import.json` L148-150; `lookups.js` L2046-2092).
2. Duplicate check, first against this run, then `GET /V1/inventory/stocks?…name eq` (pageSize 10, exact name) (L70-117, L167-184). If found, skipped.
3. Otherwise `POST /V1/inventory/stocks` with `{stock: {name, extension_attributes}}` (L209-221):

   ```json
   {"stock": {"name": "EU Stock", "extension_attributes": {"sales_channels": [{"type": "website", "code": "base"}]}}}
   ```

4. The new id is read from `data.stock_id` or `data.stock.stock_id` (L24-31). **INFERRED:** Commerce returns a bare integer here, so the id is probably never captured. Nothing depends on it.
5. **INFERRED:** assigning the session website to a new stock moves that website off its current stock.

### Remove (`actions/processors/StocksDeleteProcessor.js`)
1. Searches by name and takes the first item (L235-299).
2. `PUT /V1/inventory/stocks/{id}` with `{stock: {name, extension_attributes: {sales_channels: []}}}` to free the website (L181-227).
3. `DELETE /V1/inventory/stocks/{id}` (L308-350).
4. Nothing reassigns the website back to its previous stock. **INFERRED:** the website is left with no stock.
5. No protection for the Default Stock if its name is in the pack.

---

## 6. sources

**Pack shape:** `{sources: [{source: {source_code, name, enabled, country_id, postcode, …}}]}`.

### Install (`actions/processors/SourcesImportProcessor.js`)
- `POST /V1/inventory/sources` with `{source: <row>}`, one source per call (L72-91). No transforms are configured.
- No existence check. **INFERRED:** Commerce's source save updates by `source_code`, which makes this an insert-or-update.

### Remove (`actions/processors/SourcesDisableProcessor.js`)
- Sources are never deleted (`data_processors_delete.json` L88: "sources cannot be deleted, only disabled").
- `PUT /V1/inventory/sources/{source_code}` with the **full pack row** plus `enabled: false` (L62-122, L167-205). This overwrites any store-side edits to that source with pack values.

---

## 7. stock_source_links

**Pack shape:** `{stockSourceLinks: [{stockSourceLink: {stock_id: "<STOCK NAME>", source_code, priority}}]}`.

### Install (`actions/processors/StockSourceLinkImportProcessor.js`)
1. `stock_id` name → id via `GET /V1/inventory/stocks` with pageSize 1000, matched on exact name (`lookups.js` L2220-2319).
2. One `POST /V1/inventory/stock-source-links` per link, with `{links: [{stock_id, source_code, priority, extension_attributes}]}` (L79-103). The endpoint accepts a batch, but it is not used.
3. No existence check.

### Remove
Nothing. Reasoning: "Deleted when stocks are deleted" (`data_processors_delete.json` L164-169).

---

## 8. products

**Pack shape:** `[{product: {sku, name, type_id, attribute_set_id: "<SET NAME>", custom_attributes[], extension_attributes{category_links[], configurable_product_options[], configurable_product_links[], website_ids}, tier_prices[], …}}]` (`config/schemas/products.json`).

Export orders rows simple → virtual → configurable → bundle → grouped (`actions/processors/ProductsExportProcessor.js` L191-229). Children therefore come before their configurable parent. Import does not re-sort.

### Install (`actions/processors/ProductImportProcessor.js` plus `lookups.js`)

Each product goes through these transforms (config: `data_processors_import.json` L228-237; dispatch: `BaseProcessor.js` L137-534):

| Field | Transform |
|---|---|
| `attribute_set_id` | If it is a non-numeric name, look up `GET …sets/list?attribute_set_name eq`, first item (`lookups.js` L1939-1992; `conditionLookups.js` L28-33, L241-307). Session mappings are not used. |
| `website_ids` (anywhere) | Replaced with `[session_website_id]` (`lookups.js` L2002-2035). |
| `category_ids`, `category_links[].category_id` | url_key → id via `GET /V1/categories/list?url_key eq`, first item, stored as a string (L46-50, L2377-2513). Not scoped to the root category; url_key is not unique store-wide. Missing ones are dropped (for ids) or left as-is (for links). |
| `custom_attributes` option values | Label → option id. Case-insensitive, from one `GET /V1/products/attributes` with pageSize 1000 and **only `is_user_defined=1`**, select/multiselect/yesno (L1028-1131, L1450-1683; filter from `config/export_exclusions.json` L25-35). Numeric values pass through. Multiselect handles arrays and comma lists. |
| `extension_attributes.configurable_product_options` | `attribute_id` code → id, sent as a string (via the `product_attributes` lookup). `value_index` label → option id, from `GET /V1/products/attributes/{code}/options` matched on label then value (`lookups.js` L2836-2977; `conditionLookups.js` L148-232). |
| `configurable_product_links` | SKU → product id via `GET /V1/products?sku eq` (`lookups.js` L2981-3013). The children must already exist. |
| `tier_prices[].customer_group_id` | Code → id via `GET /V1/customerGroups/search?customer_group_code eq`. Aliases: General ↔ Default (General), NOT LOGGED IN ↔ Guest (`config/lookup_aliases.json`; `lookups.js` L26-32, L157-178). |
| `tier_prices[].extension_attributes.website_id` | Forced to `0` (L2329-2365). |
| `additional_attributes` (object) | Converted to a `custom_attributes` array of strings (`ProductImportProcessor.js` L97-114). |

Lookup results are cached for the whole product run (L72-77).

Then `POST /V1/products` with the row as-is, one product per call (L192-209):

```json
{"product": {"sku": "MH01-XS-Red", "name": "…", "type_id": "simple", "attribute_set_id": 12,
  "custom_attributes": [{"attribute_code": "color", "value": "57"}],
  "extension_attributes": {"website_ids": [1],
    "category_links": [{"category_id": "41", "position": 0}]}}}
```

### Existing items
No check is made. **INFERRED:** `POST /V1/products` with an existing SKU updates that product (an upsert). It is always reported as "created".

### Remove (`actions/processors/ProductDeleteProcessor.js`)
- `DELETE /V1/products/{encodeURIComponent(sku)}` for every SKU in the pack (L147-173). Not-found counts as skipped.
- This includes SKUs that existed before the install.

---

## 9. source_items

**Pack shape:** `{sourceItems: [{sku, source_code, quantity, status}]}`.

### Install (`actions/processors/SourceItemsImportProcessor.js`)
- **One `POST /V1/inventory/source-items` with the whole array** (L71-79). No chunking.
- No transforms.
- **INFERRED:** Commerce saves these as insert-or-update.

### Remove
Nothing. Reasoning: "Deleted when sources are deleted" (`data_processors_delete.json` L199-204). Sources are only disabled, though. **INFERRED:** the source items go away only through product deletion.

---

## 10. Order and limits

### Import order
From config position (`data_processors_import.json` L3-284):
attribute_sets (L4), product_attributes (L32), attribute_assign_to_set (L67), categories (L93), stocks (L132), sources (L153), stock_source_links (L166), products (L187), source_items (L274).

Attribute sets come before attributes. Attribute re-creation (§1) strips existing assignments, which are then re-applied by attribute_assign_to_set.

### Delete order
From `data_processors_delete.json`:
products (L66), stocks (L75), sources disable (L86), categories (L98), product_attributes (L108), attribute_sets (L121), then no-ops: attribute_assign_to_set (L151), stock_source_links (L165), source_items (L200).

Delete reads **the same pack content** as import (`processDataPack.js` L365) and identifies targets by natural key. It does not use ids recorded at install time.

### Limits
- 100 items per request and 50 data types per request (`actions/constants.js` L73, L76). Both apply to direct-upload modes.
- 50 MB content (L91).
- The async worker action has a 3 h timeout (`app.config.yaml` L234); the sync action has 300 s (L74).

## 11. Open questions

1. Can pack rows carry a source-store `id` (categories) or `attribute_set_id` (sets)? If yes, the delete code uses it as a target store id.
2. Swatch options: export turns option `value` into the label (`config/data_processors_export.json` L23-24). Does `value` hold a label or a hex code on import? Unclear.
3. What does `POST /V1/inventory/stocks` return on ACCS? The id-capture code (`StocksImportProcessor.js` L24-31) expects an object.
4. Does a product row's `id` survive into the POST, and what does Commerce do with a non-zero id?
5. Do real catalog packs ship `products` or `product_export` (bulk `/V1/import/json`)? Both exist in config (L187, L239).
6. After a stock is deleted, how does the website get its stock back? Not handled in this code.

## Answered from Bodea `main` (read from Stage, 2026-10-27)

- **Q1, store ids in rows: none.** No `id`, `entity_id` or `attribute_id` keys in attributes, sets
  or categories; products name their set (`"attribute_set_id": "Coolers"`) and link categories by
  url key. The delete-by-source-id risk does not arise for Bodea.
- **Q2, swatches: Bodea has none.** Open until a pack that has them is in scope.
- **Q5, product form: `products`, not `product_export`.** 56 rows: 32 simple, 17 virtual,
  7 configurable.
- Shapes as the spec reads them: `categories` is `{root_category, categories}`;
  `stock_source_links` and `source_items` are single objects holding arrays.

## Where Demo Builder's engine deliberately differs

- **It records what it created, and removal takes away exactly that.** Their removal deletes
  every SKU, attribute code, set name and category url key the pack names, including ones the
  store already had, and their installation record is never read on removal. Ours keeps, per
  installed pack, the Commerce id of everything it created, and removes only those, in reverse
  order. Something that already existed is used, and left alone on removal. (Rule 1: whatever
  can be done can be undone, and nothing else is.)
- **It never deletes and re-creates an existing attribute.** Theirs does, which drops the
  attribute from every set and wipes product values. Ours reuses an attribute with the same code,
  and adds only the options it lacks (recorded, so removal can take those back).
- **It does not retry POSTs on a 5xx blindly.** A create that may have landed is looked up
  before it is tried again (the Commerce client's 10 s and 120 s+ write lessons, memory).
- **Category lookups use one filter group per condition** (AND), not one group (OR), and
  match on parent and name together.
