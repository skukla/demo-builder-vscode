---
id: DI-8
kind: feature
area: data-installer
needs: []
value: med
status: active
---

# `product_export`: the bulk product form Luma and Venia carry

Filed 2026-10-30 from datapack-engine step 11 (owner, 2026-10-29: `product_export` becomes its own
item). What was known before is in step 05's "Left out, and later"
(`.rptc/plans/datapack-engine/step-05-capture-and-repeat-installs.md`).

## What is known

- **Who has it.** Luma `eds-compatible` holds its products ONLY as `product_export`; Venia
  `eds-compatible` holds both forms, but its `products` item is declared and missing
  (`get_datapack`, 2026-10-30: `missing: ["products"]`). So neither installs with Demo Builder's
  engine today: it refuses `product_export` before anything is written (`runPack.ts`,
  `UnsupportedKindsError`), and with it Luma's gift cards, cart rules and coupons, which step 11
  now installs.
- **It cannot be read through the service.** Both packs' `product_export` items are too big for
  the service's answer: `get-data-item` answers 400 "Response is not valid 'message/http'"
  (library-audit.md; again on 2026-10-30, when `save_datapack_zip` on Luma stopped there). Reading
  them from the service's database was tabled on 2026-10-27, waiting on the owner.
- **How the service installs it** (`.rptc/research/datapack-engine/export-spec.md` §5): one
  unchunked `POST /V1/import/json` of the whole item, with `_store`, `store_view_code`,
  `_website`, `product_websites` and the first category path segment rewritten to the target's,
  and `behavior` set to the literal `"import"`, which is not one of Commerce's four
  (`append`, `add_update`, `replace`, `delete`); how ACCS treats it is unverified. Removal sends the
  SKUs with `behavior: "delete"`. Judged from the answer's words, no polling.
- **It cannot be exported**: the service has no export for it, so no captured pack is ever in this
  form.

## The way through (recommended)

Convert, do not install as is: read the rows once (from the database, the owner's step), turn
each into a `products` row (the form every seam of the engine already handles: record, both
hashes, repeat install, capture, removal, wipe), and keep the converted pack in the library. A
`POST /V1/import/json` would give the engine no per-object answer to record and no read-back of
its own, so its undo could only be the bulk delete by SKU, which would take products the store
already had.

Waits on: reading the four items at all.

## 2026-11-05: a route that needs no database

The owner has no access to the service's database, and its documentation does not help: the
internal wiki's Data Installer API Reference and Data Packs pages (searched through FluffyJaws)
never mention `product_export` or `customers_export`. They do document `batch-get-data-items`, but
it returns the same payloads `get-data-item` does, so it should meet the same size limit (not
tried). The service's own type list, read live the same day, has 21 import types; Demo Builder's
engine installs every one except these two.

The rows exist where the packs came from. The internal wiki's Sample Data Packs page names each
brand's source repository, Luma's included, and the owner's GitHub account can read them (the
names stay in a private note, never in this public repo). A rebuild tool outside this repo already
turns those sources into `products`-form packs, and a rebuilt Frescopa installed and removed
cleanly from the library on 2026-11-03. So the way through is to rebuild Luma and Venia from their
sources, as `products`, and keep the results in the library, rather than read the service's copy.
Their sources are in the older format only, so the rebuild needs that path proven first.

This is what deleting the service engine waits on ([[DI-12]]).

## 2026-11-05: the format is Commerce's own, and documented

As the owner pointed out, these are Commerce's formats, not the service's. Commerce's Import API
(https://developer.adobe.com/commerce/webapi/rest/modules/import/, read 2026-11-05) documents both:
`POST /V1/import/json` takes `entity` (`catalog_product` for products; `customer`,
`customer_address` or `customer_composite` for customers), `behavior` (`append`, `replace` or
`delete` for products; `add_update`, `delete` or `custom` for customers), a validation strategy,
and `items`: one JSON object per row, with the same columns as the Admin's import CSV (`sku`,
`store_view_code`, `attribute_set_code`, `product_type`, `categories` as paths, `product_websites`,
prices, stock fields, `additional_attributes`, image paths, `configurable_variations` and
`configurable_variation_labels`, `bundle_values`, and the rest). The page also says ACCS takes only
the JSON endpoint, and that the Admin's Import page offers a sample file per entity.

So the conversion to `products` rows can be written from that documentation. It is the same
column set as the brand sources' older CSV format, so one converter serves both. What the
documentation cannot supply is Luma's and Venia's actual rows: the service still cannot hand its
copy over (the size limit above), which is why the rebuild reads them from the sources.

## 2026-11-05: the sources read, and what they hold

Both brands' sources were read through the owner's GitHub account the same day (into a scratch
folder outside this repo; nothing copied in). Both are Commerce's export format, the same columns
the Import API documents:

| Brand | Rows | Products | Types |
|---|---|---|---|
| Luma | 2,060 (12 are a store view's) | 2,048 | 1,891 simple, 159 configurable, 6 downloadable, 2 gift cards, 1 bundle, 1 grouped |
| Venia | 1,162 | 1,162 | 1,092 simple, 70 configurable |

Not yet checked: that these are the rows the service's Luma and Venia packs hold (the service cannot
return its copy to compare), and whether the engine's products step handles the downloadable,
bundle and grouped types (it handles simple, configurable and gift cards).

So the item no longer waits on anyone: convert these rows to `products`, rebuild the two packs, and
prove one with a live install and removal.

## Shipped so far

- 2026-11-05  feat(datapacks): bulk installs, waiting on jobs, big packs in parts, and packs from a product export (`95af3d5de`)
- 2026-11-06  fix(datapacks): fast product removal, resumable installs, and the live-test fixes (`c59faba63`)
- 2026-11-06  perf(datapacks): faster installs, and packs from an export install every product (`27c723d7a`)
- 2026-11-06  perf(datapacks): read back a configurable's children from the products already read (`818e59d13`)
- 2026-11-06  perf(datapacks): batch removal, parallel bulk batches, and install the service's product_export (`26f6cdb78`)
- 2026-11-06  perf(datapacks): import-form packs install in under five minutes, with sizes right (`abbdb81a9`)
- 2026-11-06  fix(datapacks): customers through the Import API, and faster attribute steps (`ad99a2362`)
- 2026-11-06  feat(datapacks): product records install through the Import API, and agents can check an install (`9dd98255e`)
- 2026-11-06  feat(datapacks): every install checks its products against the pack (`fff4264b2`)
- 2026-11-06  fix(datapacks): a reinstall no longer takes attributes out of their sets (`e19ef34a2`)
- 2026-11-06  fix(datapacks): a removal Commerce refuses no longer stops the rest (`c3275bfae`)
