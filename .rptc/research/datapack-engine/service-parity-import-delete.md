<!-- Read-only comparison, 2026-10-30. Service: dsc-data-installer-api, local clone on branch
fix/export-context-carries-mongo-params (head 3ced647); `git diff origin/feature/DEMOSYS-1698-add-validator
-- actions/processors actions/utils config` is empty, so the line numbers in catalog-spec.md and
customers-b2b-spec.md still hold and are reused here. Ours: the release-candidate worktree. No live
calls of any kind were made. Export and the shared machinery (substitutions, aliases, comparator,
tracking, ACO) are a second agent's; they are named here only where an import depends on them. -->

# Does our datapack engine inherit what the service did? Import and removal, per data type

**Paths.** Service paths are relative to `dsc-data-installer-api/` (`proc/` = `actions/processors/`,
`imp.json` = `config/data_processors_import.json`, `del.json` = `config/data_processors_delete.json`).
Ours are relative to `src/features/data-installer/services/` (`eng/` = `demoBuilderEngine/`).
**INFERRED** marks Commerce behaviour not read in either codebase.

## Summary

Our engine covers 19 of the service's 21 data types. The two it lacks, `product_export` and
`customers_export`, are bulk forms of products and customers. Ours refuses both before writing
anything. For almost everything else ours does what the service did, or does it more safely: it
looks before it writes, it removes only what it made, and it never overwrites or deletes the SC's own
things. The real gaps are few, and most are small.

| Verdict | Rows |
|---|---|
| SAME | 41 |
| OURS BETTER | 79 |
| GAP, WORTH INHERITING | 10 |
| GAP, NOT WORTH IT | 6 |
| NOT IN OURS AT ALL | 2 data types (`product_export`, `customers_export`) |

### The gaps worth inheriting, ranked by what an SC would hit

1. **A pack the service installed cannot be removed.** Ours refuses any pack it has no record of.
   The service's own removal is the only route left, and the overview reports the service's writes
   failing since 2026-10-27. The store wipe (step 10) covers products, categories, customers and cart
   rules only. Every existing project that used the service hits this. Owner decision: matching by
   name was rejected on purpose.
2. **Removing a pack that made a stock may stop at that stock.** The service clears the stock's
   website before deleting it, and its comment says Commerce requires that. Ours deletes directly.
   Not proven either way from here.
3. **The dry run never reads the pack's rows.** A bad row in a later kind is found only once the
   earlier kinds are already written. The service checks every kind's shape before writing anything.
4. **Swatch attributes stop the whole install.** The service makes them in two steps. I could not
   tell from here which kept packs carry swatches.
5. **One refused row stops everything after it.** The service skips that row, reports it and goes
   on. This is already open as step 11 decision 5 (the Amasty cart rule).
6. **A shared catalog whose customer group already has a catalog stops the install.** The service
   treats Commerce's refusal as "already there".
7. **A company that names its region by code is refused.** The service's GraphQL call accepts that.
   Bodea uses `region_id`, so Bodea is unaffected.
8. **Shared-catalog product SKUs are compared exactly.** The service trims spaces. A case or spacing
   difference can also make ours record, and later remove, an assignment the store already had.
9. **`additional_attributes` on a product row is not converted.** Check whether any kept pack carries
   it before building anything.
10. **No retry on 429 or on a failed read.** The service retries every method. Ours rightly never
    retries a write, but it could retry reads and 429s.

Each gap is in its data type's table below, cited on both sides.

### Found along the way (not a parity item; neither engine handles it)

**A create whose answer is lost is stranded off the record.** Example: a product POST times out but
the product is made anyway. The re-run finds the product, calls it "the store already has it", and
never records it. Removal then leaves it in the store for good, which breaks rule 1 (whatever can be
done can be undone). The same shape is in every kind: `eng/productsKind.ts:194-201`,
`eng/customerKinds.ts:129-138`, `eng/cartRulesKind.ts:109-120`, `eng/sharedCatalogKinds.ts:117-131`,
`eng/companiesKind.ts:135-151`, and the others. A fix: write a "pending" entry before each create,
and on the re-run, adopt a match for a pending entry instead of leaving it. Verified by reading. **Fix
now or defer?**

### What I could not determine

- Whether Commerce refuses to delete a stock that still sells to a website (gap 2).
- Which kept packs carry swatch attributes, `additional_attributes` or `customers_export` (gaps 4
  and 9). The library audit counts kinds but does not name these.
- Whether the service's `behavior: "import"` (`customers_export`, `product_export`) is accepted by
  ACCS. The `customers_export` schema allows only `add_update`.
- The service's write scope. It sends no `Store` header (`actions/utils/httpClient.js` has none), so
  its scope is whatever the caller's base URL carries. Ours always writes store-wide (`all`,
  `buildDatapackEngine.ts:87`).

---

## 0. Across every kind

| Behaviour | Service | Ours | Verdict |
|---|---|---|---|
| Install order | config position, `imp.json` L3-552; `actions/processor/processingOrchestration.js` L94-115 | `eng/runPack.ts:66-90`, the same order (cart rules and coupons before catalogs and companies, as the service has them) | SAME |
| Check every kind's shape before any write | `actions/processor/processDataPack.js` L394-398, `processingOrchestration.js` L156-214 | each kind is parsed only when its turn comes (`eng/runPack.ts:144-148`). The dry run checks the target and the kind names, not the rows (`eng/engine.ts:160-172`) | GAP, WORTH INHERITING |
| One row Commerce refuses | that row counts as failed, the rest go on (e.g. `proc/AttributeSetImportProcessor.js` L85-126); a failed kind does not stop later kinds (`processingOrchestration.js` L263-341) | the install stops, the remaining kinds are marked error (`eng/engine.ts:66-71, 131-135`), the record keeps what was made, and a re-run carries on | GAP, WORTH INHERITING (as a skip-and-report option for leaf rows; owner call, step 11 decision 5) |
| Retries | 429/500/502/503/504 on any method, POST included, up to 3 times (`actions/utils/httpClient.js` L86-94) | none, on purpose for writes (`src/features/ai/server/commerceRestClient.ts:392-398`) | GAP, WORTH INHERITING (for reads and 429 only) |
| Request timeout | 300 s (`httpClient.js` L75) | `TIMEOUTS.LONG` (`commerceRestClient.ts:398`) | SAME |
| Which website and store view | website 1 and store 1 unless codes are sent (`actions/processor/contextBuilder.js` L68-78; `processDataPack.js` L209-248) | always the project's chosen pair, read from the store, refused if absent (`eng/installTarget.ts:42-58`); one record spans one website (`eng/engine.ts:84-93`) | OURS BETTER |
| What is recorded | one document per pack, no ids, never read on removal (`actions/utils/installationTracker.js` L135-154, L203) | every object, written as it is made (`eng/installRecord.ts:272`) | OURS BETTER |
| "Already exists" | mostly decided from Commerce's English error after a POST (customers-b2b-spec §0) | a search first, then a create only when nothing matches (every `install*` below) | OURS BETTER |
| A name a lookup cannot find | the name is left in the body and the row is sent anyway (`actions/utils/lookups.js` L207, L262-271) | the install stops and names the missing thing (`eng/productLookups.ts:116, 134, 149, 160, 183, 194`) | OURS BETTER |
| Delete answers "already gone" | 404/410, or a 400 saying "no such entity" (`actions/utils/commerceRestDeleteOutcome.js` L36-88) | the same rule (`eng/kindContext.ts:143-164`) | SAME |
| Removal hits a refusal | that row fails, the rest go on | it stops and names the object; what was removed is off the record, so a re-run carries on (`eng/removers.ts:79-87`; `eng/runPack.ts:202-205`) | GAP, NOT WORTH IT (carrying on would hide a half-removed pack) |
| Removing a pack with no record | deletes by natural key from the pack's own rows (`del.json`) | refuses: "Demo Builder did not install this pack in this project" (`eng/engine.ts:176-177`). Removal goes to the engine that installed (`buildDatapackEngine.ts:117-123`). The wipe covers part of the store (`demoDataWipe/wipePlan.ts:10-25`) | GAP, WORTH INHERITING (owner decision; see ranked gap 1) |
| Codes from a pack are checked and escaped | no | yes (`eng/kindContext.ts:115-131`) | OURS BETTER |

Ours also does three things the service never does: the store-settings kind
(`eng/runPack.ts:89`), a repeat install that keeps Admin edits (`eng/repeatInstall.ts`), and the
container rule that keeps anything holding the SC's things (`eng/removers.ts:206-231`).

---

## 1. attribute_sets

| Behaviour | Service | Ours | Verdict |
|---|---|---|---|
| Reads the store's sets | one page of 100 (`proc/AttributeSetImportProcessor.js` L175-231, L188) | every page (`eng/attributeSetsKind.ts:71-78`) | OURS BETTER |
| A set of that name exists: reuse it | L321-332 | `eng/attributeSetsKind.ts:112-117` | SAME |
| Creates with entity type 4 and skeleton 4 by default | L335-342 | `eng/attributeSetsKind.ts:118-121` | SAME |
| Adds a group named like the set (code lowercased with underscores, sort 100) | L394-410, L465-480 | `eng/attributeSetsKind.ts:66-68, 90-100` | SAME |
| The group fails | the set still counts as made (L429-432) | the install stops (`eng/attributeSetsKind.ts:98`); a re-run adds the group to the set it made (L115) | GAP, NOT WORTH IT |
| Finds the group of an existing set | by name across all sets, else the first group returned (L239-306) | only that set's groups, by name, else the house pick (`eng/attributeSetsKind.ts:81-88`) | OURS BETTER |
| Hands set and group ids to later kinds | session values (L100-112; `processingOrchestration.js` L352-379) | `eng/kindContext.ts:24-29` | SAME |
| **Remove:** which sets | a row's id, else the first search hit by name (`proc/AttributeSetDeleteProcessor.js` L100-108, L274-311) | only sets it made (`eng/removers.ts:51`) | OURS BETTER |
| **Remove:** protected sets | Default, Bag, Bottom, Downloadable, Sprite Stitch Pattern (L16) | no list needed: it never touches a set it did not make | OURS BETTER |
| **Remove:** a set the SC's products use | deleted | kept, with a line (`eng/removers.ts:174-179`) | OURS BETTER |

## 2. product_attributes

| Behaviour | Service | Ours | Verdict |
|---|---|---|---|
| The attribute already exists | deleted and re-created (`proc/ProductAttributeImportProcessor.js` L5, L295-322), which drops it from every set and wipes product values (INFERRED) | reused; only the options it lacks are added, matched by label (`eng/attributesKind.ts:70-74, 103-114`) | OURS BETTER |
| Label store ids set to the install's store view | `imp.json` L58-60 | `eng/attributesKind.ts:82` | SAME |
| Source `attribute_id` stripped | L330-336 | `eng/attributesKind.ts:81` | SAME |
| Swatch attributes (`swatch_visual`, `swatch_text`) | made without options, then each option added through the options route (L338-352, L475-525) | refused, which stops the whole install (`eng/attributesKind.ts:26-27, 65-67`) | GAP, WORTH INHERITING |
| "Same code" refusal | counted as skipped (L19-49, L390-403) | never met: it reads first (`eng/attributesKind.ts:70`) | OURS BETTER |
| Options added to an existing attribute are recorded | no | yes, as `attribute_options` (`eng/attributesKind.ts:111`) | OURS BETTER |
| **Remove:** which attributes | every code in the pack except `sku, name, price, status, visibility, category_ids` (`proc/ProductAttributeDeleteProcessor.js` L17, L111-119, L190-206) | only attributes it made, and only options it added (`eng/removers.ts:52-53`; `eng/attributesKind.ts:117-125`) | OURS BETTER |
| **Remove:** values the SC set on an attribute being removed | lost | lost too: attributes have no container check (`eng/removers.ts:158-181`) | SAME |

## 3. attribute_assign_to_set

| Behaviour | Service | Ours | Verdict |
|---|---|---|---|
| Set named in `attributeSetId` (a NAME) | "Default" is hard-wired to 4 and group 7 (`imp.json` L83-89; `proc/AttributeAssignmentProcessor.js` L265-274, L302-311), else session, else one page of 100 (L426-475) | every set read by name, Default included (`eng/attributeSetsKind.ts:132, 136`) | OURS BETTER |
| Which group | session, else a group named like the set (any set), else `0` (L169-176, L360-420) | that set's group named like it, else the house pick; none stops (`eng/attributeSetsKind.ts:143-144`) | OURS BETTER |
| Pack's `attributeGroupId` | ignored | ignored (the schema drops it, `eng/attributeSetsKind.ts:45-49`) | SAME |
| Already in the set | not checked | read first, then skipped (`eng/attributeSetsKind.ts:138-142`) | OURS BETTER |
| **Remove** | nothing: "Deleted when attribute sets are deleted" (`del.json` L150-156), so an attribute stays in a set the store already had | each assignment it added is taken out, even from the store's own set (`eng/attributeSetsKind.ts:162-166`; `eng/removers.ts:54`) | OURS BETTER |

## 4. categories (done before; cited, not repeated)

Prior work: catalog-spec §4 and step 12. Summary with citations:

| Behaviour | Service | Ours | Verdict |
|---|---|---|---|
| Root reused by name | `proc/CategoryImportProcessor.js` L81-145 | `eng/categoriesKind.ts:118-126` | SAME |
| Category reused by parent and name | both in one OR group (L502-549) | one AND group each (`eng/categoriesKind.ts:72-86`) | OURS BETTER |
| Which root | the session root, default id 2 (L361) | the store view's real root (`eng/installTarget.ts:49, 57`); step 12 placement (`eng/runPack.ts:134-135`) | OURS BETTER |
| Parent not found | filed under the root (L352-398) | refused (`eng/categoriesKind.ts:140-143`) | OURS BETTER |
| Derived fields stripped, shallowest first | L393-396, L557-577 | `eng/categoriesKind.ts:67-70, 127` | SAME |
| **Remove** | by url key, the first match anywhere; ids 1 and 2 protected only when the row carries an id (`proc/CategoryDeleteProcessor.js` L19, L41-68, L372-438) | only recorded ids (`eng/removers.ts:55`); kept while it holds the SC's categories or products, or is a root a store shows (`eng/removers.ts:160-171`) | OURS BETTER |

Still open: Bodea's two categories share the url key `racks`. Products, shared-catalog categories
and cart-rule conditions all find categories by url key (`eng/productLookups.ts:130-136`).

## 5. customer_groups

| Behaviour | Service | Ours | Verdict |
|---|---|---|---|
| Already exists | POST, then "customer group already exists" counts as skipped (`proc/CustomerGroupImportProcessor.js` L8-31, L82-108, L126-139) | searched by code first; made and recorded only when missing (`eng/customerKinds.ts:70-80`) | OURS BETTER |
| Search field | `customer_group_code` (`actions/utils/lookups.js` L26-32) | the same (`eng/b2bReads.ts:66-69`) | SAME |
| Tax class missing from the row | sent without one | Retail Customer, 3 (`eng/customerKinds.ts:42, 74`) | SAME |
| **Remove:** which groups | a row's id directly, else the first hit by code; protected `General`, `NOT LOGGED IN`, `Wholesale`, `Retailer` (`proc/CustomerGroupDeleteProcessor.js` L19, L55-57, L73-93, L244) | only groups it made (`eng/removers.ts:62`) | OURS BETTER |
| **Remove:** a group others still use | deleted (INFERRED: its customers go to the default group) | kept while the SC's customers, companies or catalogs use it; a catalog and its group go or stay together (`eng/b2bContainers.ts:107, 146, 206`) | OURS BETTER |

## 6. stocks

| Behaviour | Service | Ours | Verdict |
|---|---|---|---|
| Sales channels set to the install's website | `imp.json` L148-150; `lookups.js` L2046-2092 | `eng/stockKinds.ts:84-86` | SAME |
| A stock of that name exists: skip | `proc/StocksImportProcessor.js` L70-117, L167-184 | `eng/stockKinds.ts:82` | SAME |
| Reads the new id | expects an object (L24-31); Commerce answers a bare number, so it is probably never read | reads the bare number (`eng/stockKinds.ts:87-88`) | OURS BETTER |
| Remembers the stock the website sold from | no | yes (`eng/stockKinds.ts:83, 89`) | OURS BETTER |
| **Remove:** which stocks | first search hit by name, the store's own included; no Default Stock guard (`proc/StocksDeleteProcessor.js` L235-299) | only stocks it made (`eng/removers.ts:56`) | OURS BETTER |
| **Remove:** website taken off the stock before the delete | PUT empty `sales_channels`, "required before delete when channels are assigned" (L1-8, L106-118, L181-227) | DELETE directly (`eng/stockKinds.ts:118-119`); the setup guide's warehouse undo does the same (`src/features/app-builder/services/storePreparation/warehouseFix.ts:222-240`) | GAP, WORTH INHERITING (unproven: no live delete of a selling stock recorded) |
| **Remove:** the website's stock afterwards | none; the website is left with no stock | put back on its previous stock (`eng/stockKinds.ts:120-127`) | OURS BETTER |

## 7. sources

| Behaviour | Service | Ours | Verdict |
|---|---|---|---|
| Existing source | POSTed again with the pack's row; an upsert that overwrites the store's source (INFERRED) (`proc/SourcesImportProcessor.js` L72-91) | left alone; only missing sources are made (`eng/stockKinds.ts:57-66`) | OURS BETTER |
| Existing source switched off | overwritten with the pack's `enabled` | switched on and recorded, so removal switches it off again (`eng/stockKinds.ts:67-71`) | OURS BETTER |
| **Remove:** cannot delete, so switch off | yes (`del.json` L85-96) | yes (`eng/stockKinds.ts:112-115`) | SAME |
| **Remove:** body of the switch-off | the whole pack row plus `enabled: false`, overwriting store edits (`proc/SourcesDisableProcessor.js` L62-122, L167-205) | the store's own copy with `enabled` changed (`warehouseFix.ts:311-321`), and only for sources it made or switched on | OURS BETTER |

## 8. stock_source_links

| Behaviour | Service | Ours | Verdict |
|---|---|---|---|
| Stock named by NAME, turned into its id | `lookups.js` L2220-2319 | `eng/stockKinds.ts:97, 100` | SAME |
| Link already there | not checked; one POST per link (`proc/StockSourceLinkImportProcessor.js` L79-103) | checked first (`eng/stockKinds.ts:102`) | OURS BETTER |
| Stock name not found | the name is sent and Commerce answers | stops, naming the stock (`eng/stockKinds.ts:101`) | OURS BETTER |
| **Remove** | nothing: "Deleted when stocks are deleted" (`del.json` L164-169), so a link to a stock the store had stays | each link it made is deleted (`eng/stockKinds.ts:131-136`) | OURS BETTER |

## 9. products

| Behaviour | Service | Ours | Verdict |
|---|---|---|---|
| Attribute set by name | `lookups.js` L1939-1992 | `eng/productsKind.ts:166-167`; `eng/productLookups.ts:113-118` | SAME |
| Website ids set to the install's website | `lookups.js` L2002-2035 | `eng/productsKind.ts:133` | SAME |
| Category url keys turned into ids | first match anywhere; a miss is dropped or left (`lookups.js` L2377-2513) | under the pack's root first; a miss stops (`eng/productLookups.ts:130-136`; `eng/productsKind.ts:93-94, 134-139`) | OURS BETTER |
| Option labels turned into ids | user-defined attributes only, from one list of 1000 (`lookups.js` L1028-1131, L1450-1683) | any select or multiselect, label then option code (`eng/productsKind.ts:87-107`; `eng/productLookups.ts:155-162`) | OURS BETTER |
| Layout value the store lacks (Page Builder's) | sent; Commerce refuses (INFERRED) | left at the store's default, with a line (`eng/productsKind.ts:47, 103-105`) | OURS BETTER |
| Configurable options: code to id, labels to option ids | `lookups.js` L2836-2977 | `eng/productsKind.ts:115-128` | SAME |
| Configurable children: SKU to id | `lookups.js` L2981-3013 | `eng/productsKind.ts:142-143` | SAME |
| Tier price group by code, with the two aliases | `config/lookup_aliases.json`; `lookups.js` L157-178 | `eng/productsKind.ts:157-162`; `eng/productLookups.ts:39-42, 171-186` | SAME |
| Tier price website forced to 0 | `lookups.js` L2329-2365 | `eng/productsKind.ts:161` | SAME |
| `additional_attributes` object turned into `custom_attributes` | `proc/ProductImportProcessor.js` L97-114 | not found (searched `additional_attributes` across `src/features/data-installer`); sent as is | GAP, WORTH INHERITING (low; first check whether any kept pack carries it) |
| Lookups cached for the run | L72-77 | `eng/productLookups.ts:90-97` | SAME |
| SKU the store already has | POSTed again, which updates it, reported as "created" (L192-209) | left alone and not recorded (`eng/productsKind.ts:194-198`) | OURS BETTER (by design; a pack cannot update a product the store had) |
| Images | paths sent, no files | the same (`eng/productsKind.ts:12-13`; DI-7) | SAME |
| **Remove** | DELETE every SKU in the pack, the store's own included (`proc/ProductDeleteProcessor.js` L147-173) | only SKUs it made (`eng/removers.ts:59`; `eng/productsKind.ts:206-208`) | OURS BETTER |
| **Remove:** one call per SKU | yes | yes | SAME |

## 10. product_export: NOT IN OURS AT ALL

**What it is.** Commerce's bulk import: one `POST /V1/import/json` with `{source: {entity:
"catalog_product", behavior, items}}` (`config/schemas/product_export.json`). It substitutes
`_store`, `_website`, `store_view_code`, `product_websites`, `behavior` and the categories path
(`imp.json` L239-259; `proc/JsonImportProcessor.js` L22-130). Removal posts the same route with each
item stripped to its SKU (`proc/ProductExportDeleteProcessor.js` L21-66; `del.json` L49-64).

**Ours.** Refused before any write (`eng/runPack.ts:104-106, 131-132`). Venia's products are also in
`products`, which ours installs. Luma's products exist only as `product_export`, so Luma cannot be
installed. Tracked as DI-8, gated on reading the oversized items.

## 11. giftcards

| Behaviour | Service | Ours | Verdict |
|---|---|---|---|
| How it is made | `POST products` with the row exactly as given. No substitutions are configured (`imp.json` L260-272; `proc/GiftCardImportProcessor.js` L131-219), so the source store's website, set and category ids and its amount attribute ids go unchanged | as a product: set by name, the install's website, categories, and amounts once on website 0 with this store's attribute id (`eng/runPack.ts:77`; `eng/giftCardAmounts.ts:41-46`) | OURS BETTER |
| SKU exists | overwritten | left alone (`eng/productsKind.ts:194-198`) | OURS BETTER |
| **Remove** | nothing: "Deleted when products are deleted" (`del.json` L157-163). But the products removal reads only the `products` rows, so a gift card listed only under `giftcards` is never deleted (read from the two configs) | recorded under `giftcards` and deleted (`eng/removers.ts:60`) | OURS BETTER |

## 12. source_items

| Behaviour | Service | Ours | Verdict |
|---|---|---|---|
| Calls | one POST with the whole list (`proc/SourceItemsImportProcessor.js` L71-79) | batches of 100 (`eng/sourceItemsKind.ts:22-23, 49-51`) | OURS BETTER |
| Which SKUs | every row, so it overwrites the store's own quantities (INFERRED upsert) | only products this install made, and not again on a repeat install (`eng/sourceItemsKind.ts:46-48`) | OURS BETTER |
| **Remove** | nothing: "Deleted when sources are deleted" (`del.json` L199-204), though sources are only switched off | nothing recorded; quantities go with the products it deletes (`eng/sourceItemsKind.ts:5-8`) | SAME |

## 13. customers_export: NOT IN OURS AT ALL

**What it is.** The bulk customer form: one `POST /V1/import/json` with `{source: {entity:
"customer_composite", behavior, items}}`. `_store` and `_website` come from the session, `group_id`
is looked up, and `behavior` comes from the operation mode (`imp.json` L286-304; `del.json` L23-37;
`proc/JsonImportProcessor.js`). Its schema allows only `behavior: "add_update"`
(`config/schemas/customers_export.json`), but the substitution writes `import` or `delete`.

**Ours.** Refused before any write (`eng/runPack.ts:104-106`). The same data installs row by row
through `customers` (`eng/customerKinds.ts:123-141`). Bodea has none (customers-b2b-spec §10). I
could not tell from here whether any other kept pack does. Not worth building unless one does.

## 14. customers

| Behaviour | Service | Ours | Verdict |
|---|---|---|---|
| Group by code, with the aliases | `imp.json` L322-324; `lookups.js` L157-178, L255-291 | `eng/customerKinds.ts:113-116`; `eng/productLookups.ts:171-186` | SAME |
| Which website and store view | none substituted, so Commerce's default (INFERRED) (`proc/CustomerImportProcessor.js` L84-111) | the install's website and store view (`eng/customerKinds.ts:134`) | OURS BETTER |
| Already exists | POST, then "same email address already exists in an associated website" counts as skipped (L8-32, L128-141) | searched by email on the install's website first (`eng/customerKinds.ts:129-133`; `eng/b2bReads.ts:59-63`) | OURS BETTER |
| Password | sent when the row has one (the whole row is the body) | sent at create only; never logged, recorded or saved (`eng/customerKinds.ts:13-17, 135`) | SAME |
| Source ids and credential fields | the row goes as is | stripped, address ids included (`eng/customerKinds.ts:99-110`) | OURS BETTER |
| **Remove** | search by email, first item, any website: deletes whoever has the email (`proc/CustomersDeleteProcessor.js` L185-272, L223) | only customers it made (`eng/removers.ts:63`); a kept company's admin is kept (`eng/b2bContainers.ts:186`) | OURS BETTER |

## 15. cart_rules

| Behaviour | Service | Ours | Verdict |
|---|---|---|---|
| Website set to the install's | `imp.json` L343-344 | `eng/cartRulesKind.ts:90` | SAME |
| Customer groups by code, with the aliases | `imp.json` L345; `lookups.js` L189-250 | `eng/cartRulesKind.ts:91` | SAME |
| Conditions: category url keys, set name, option labels | rules at `imp.json` L347-401; options looked up for every attribute except the excluded three | the same three; options only for select and multiselect attributes the store describes (`eng/ruleConditions.ts:51-86`) | SAME |
| A condition lookup misses | value kept, rule still made, failure reported (`actions/utils/conditionProcessor.js` L47-55; `proc/CartRuleImportProcessor.js` L68-89) | the install stops (`eng/ruleConditions.ts:14-17`) | OURS BETTER (a rule with a dead condition misbehaves in the demo; see §0 on stopping) |
| A rule of that name exists | search, exact name else the FIRST item, then POST with its `rule_id`, which updates the store's rule (L172-239, L254-265) | exact name only; left alone and not recorded (`eng/cartRulesKind.ts:78-81, 110-113`) | OURS BETTER |
| "Unique constraint" refusal | retried as an update (L323-359) | never posts over an existing name | GAP, NOT WORTH IT |
| Body | the whole row, with its source `rule_id`, `times_used` and every store label (L257-269) | those stripped; only the default label (`eng/cartRulesKind.ts:75, 84-96`) | OURS BETTER |
| Customer segment condition | sent silently | sent, with a Debug Logs line (`eng/cartRulesKind.ts:114-116`) | OURS BETTER |
| **Remove:** which rules | search by name, exact else first, so it may delete the store's own (`proc/CartRuleDeleteProcessor.js` L189-250) | only rules it made; kept while they hold coupons it did not make (`eng/removers.ts:70, 144-155`) | OURS BETTER |
| **Remove:** rule not found | skipped (L83-90, L114-122) | "already gone" (`eng/kindContext.ts:151-164`) | SAME |

## 16. coupons

| Behaviour | Service | Ours | Verdict |
|---|---|---|---|
| Rule named by NAME | `cart_rules_search` on `name`, first item (`imp.json` L426-428; `lookups.js` L64-67, L125-127) | the rule this install made for that name, else the store's of exactly that name (`eng/couponsKind.ts:75-85`) | OURS BETTER |
| A numeric `rule_id` in the row | passes unchanged (`lookups.js` L262) | passes unchanged (`eng/couponsKind.ts:77`) | SAME |
| Code already exists | searched first, skipped (`proc/CouponImportProcessor.js` L104-150, L238-267) | `eng/couponsKind.ts:91-94` | SAME |
| Body | the whole row with the rule id (L363-368) | `coupon_id`, `times_used` and `created_at` stripped (`eng/couponsKind.ts:56-58, 100`) | OURS BETTER |
| Its rule was deleted by the SC since | n/a | the code is left out, with a line (`eng/couponsKind.ts:95-98`) | OURS BETTER |
| **Remove** | nothing: "Deleted when cart rules are deleted" (`del.json` L171-177), so a code on a rule the pack did not make stays | each code it made is deleted (`eng/removers.ts:71`; `eng/couponsKind.ts:117`) | OURS BETTER |

## 17. b2b_shared_catalogs

| Behaviour | Service | Ours | Verdict |
|---|---|---|---|
| Group by code | `imp.json` L447-449 | `eng/sharedCatalogKinds.ts:119` | SAME |
| Body | the row as given: its `type` (could be 1, public), `store_id` and tax class (`proc/SharedCatalogImportProcessor.js` L203-205) | always custom (type 0), store 0, tax class 3 unless given (`eng/sharedCatalogKinds.ts:120-126`) | OURS BETTER |
| Already exists, by name | not checked | skipped by exact name (`eng/sharedCatalogKinds.ts:118`) | OURS BETTER |
| The group already has a catalog | Commerce's "a catalog already exists with customer group" counts as skipped (L9-32, L238-252) | not handled: Commerce refuses and the install stops | GAP, WORTH INHERITING (low) |
| What it holds when made | not read | read and recorded (`eng/sharedCatalogKinds.ts:129-131`) | OURS BETTER |
| **Remove:** which catalogs | protected "Default Catalog"; otherwise search by name, exact else first (`proc/SharedCatalogDeleteProcessor.js` L20, L74-85, L283-291) | only catalogs it made; a catalog and its group go or stay together; kept while holding the SC's things (`eng/b2bContainers.ts:146`) | OURS BETTER |
| **Remove:** its assignments | left to Commerce | left to Commerce when the catalog goes; "already gone" is counted as done (`eng/sharedCatalogKinds.ts:186-193`) | SAME |

## 18. b2b_companies

| Behaviour | Service | Ours | Verdict |
|---|---|---|---|
| Route | the pack's own GraphQL `createCompany` (`proc/B2BCompanyImportProcessor.js` L122-150); the admin is made by Commerce, on its default store (INFERRED) | REST `POST company`, with the admin found or made on the install's website and recorded (`eng/companiesKind.ts:117-126, 129-154`) | OURS BETTER |
| Already exists | "company with this email address already exists" counts as skipped (L11-70, L154-176) | searched by name, then email (`eng/companiesKind.ts:136`; `eng/b2bReads.ts:72-76`) | OURS BETTER |
| Extension attributes | a follow-up `POST /V1/company`; its failure is only a warning (L186-197, L295-319) | in the create body, without the source's quote company id (`eng/companiesKind.ts:91-97, 141-147`) | OURS BETTER |
| Status | none sent, so Pending Approval (step 08) | Active unless the row says otherwise (`eng/companiesKind.ts:145`) | OURS BETTER |
| Region named by code or name | passed to GraphQL as given | refused unless `region_id` (`eng/companiesKind.ts:65`) | GAP, WORTH INHERITING (low) |
| Admin extras in `company_admin` (title, phone) | passed to GraphQL | a made admin gets only email and names (`eng/companiesKind.ts:120`) | GAP, NOT WORTH IT |
| Customer group | Commerce's default (INFERRED) | the public catalog's (`eng/companiesKind.ts:132, 146`) | SAME |
| **Remove:** which companies | search by name, exact else first; the admin is left (`proc/B2BCompanyDeleteProcessor.js` L183-280, L230-231) | only companies it made; kept while holding a customer other than its admin; a kept company keeps its admin, catalog and group (`eng/b2bContainers.ts:89, 186`) | OURS BETTER |
| **Remove:** an admin the engine made | never | removed after the company (`eng/companiesKind.ts:123`) | OURS BETTER |

## 19. b2b_shared_catalog_company_assignments

| Behaviour | Service | Ours | Verdict |
|---|---|---|---|
| Catalog by name | exact, else the first item (`proc/SharedCatalogCompanyAssignmentProcessor.js` L330-342) | exact (`eng/sharedCatalogKinds.ts:162-163`) | OURS BETTER |
| Company by name | exact, else the first item (L407-419) | exact (`eng/b2bReads.ts:72-73`) | OURS BETTER |
| A company is missing | skipped with a warning, the rest assigned (L217) | stops (`eng/sharedCatalogKinds.ts:151-152`) | GAP, NOT WORTH IT (see §0) |
| Already assigned | everything listed is sent | only what the catalog does not hold, each pair recorded (`eng/sharedCatalogKinds.ts:164-176`) | OURS BETTER |
| **Remove** | nothing (`del.json` L178-184) | unassigned only when neither side is staying (`eng/removers.ts:225-229`) | OURS BETTER |

## 20. b2b_shared_catalog_categories

| Behaviour | Service | Ours | Verdict |
|---|---|---|---|
| Catalog by name | exact, else first (`proc/SharedCatalogCategoriesProcessor.js` L324-336) | exact | OURS BETTER |
| Category by url key | exact, else first, anywhere (L401-413) | under the pack's root first (`eng/productLookups.ts:130-136`) | OURS BETTER |
| A category is missing | skipped (L205) | stops (`eng/productLookups.ts:134`) | GAP, NOT WORTH IT (see §0) |
| The same pair listed twice (Bodea's `racks`) | sent twice | once (`eng/sharedCatalogKinds.ts:90-98`) | OURS BETTER |
| **Remove** | nothing (`del.json` L185-191), so Bodea's public-catalog assignments stay for good | unassigned, public catalog included (`eng/removers.ts:67`) | OURS BETTER |

## 21. b2b_shared_catalog_products

| Behaviour | Service | Ours | Verdict |
|---|---|---|---|
| Catalog by name | exact, else first (`proc/SharedCatalogProductsProcessor.js` L318-330) | exact | OURS BETTER |
| SKU spaces | trimmed (`imp.json` L535; L198) | sent and compared exactly, case too (`eng/sharedCatalogKinds.ts:149, 164-170`) | GAP, WORTH INHERITING (low) |
| SKU exists in the store | not checked; Commerce answers | not checked; Commerce answers | SAME |
| Already assigned | everything sent | only what is not held, recorded | OURS BETTER |
| **Remove** | nothing (`del.json` L192-198) | unassigned (`eng/removers.ts:68`) | OURS BETTER |

---

## Out of scope, one line each

- **ACO kinds (`aco_*`):** deferred to PL-60. Our engine refuses them before any write.
- **`product_attribute_swatches`:** the service has a schema and a processor for it, but neither
  config lists it and `ProcessorFactory.js` does not register it. Not a parity item.
