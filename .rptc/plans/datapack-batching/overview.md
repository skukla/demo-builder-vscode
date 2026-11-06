---
backlog: DI-8
status: active
---

# Datapack batching: no Commerce call one object at a time where a batch route exists

Owner, 2026-11-06: "make sure that we're batching everything we can possibly batch… build
everything… keep in mind that our data pack shape needs to be aligned with the data installer
service so that data packs are usable anywhere."

## What Commerce offers (verified on the Justrite ACCS sandbox, 2026-11-06)

| Route | Takes | Proven |
|---|---|---|
| `POST import/json` | `catalog_product`, `advanced_pricing`, `customer`, `customer_address`, `customer_composite`, `customer_finance`, `stock_sources`, `requisition_list` (docs: developer.adobe.com/commerce/webapi/rest/modules/import/) | 195 simple products in 9.8 s; 13 configurables with children linked in about 2 s; delete 200 SKUs in about 2 s |
| `POST async/bulk/V1/<route>` | any POST or PUT route | product creates (live since 95af3d5de); customer groups, with each new id read from `bulk/{uuid}/detailed-status` → `result_serialized_data` |
| bulk DELETE | — | fails for products on ACCS ("couldn't be removed", 25 of 25 batches); not used |

Import API behaviour that the design has to carry:

- A configurable is refused when its children are in the same call (validated before they exist):
  children go in one call, parents in the next. Measured: 13 of 13 refused together, 13 of 13 made
  after.
- `validation-skip-errors` answers only "Entities Processed: N" and counts refused rows too (2 for one
  good and one bad row). What landed is read back by SKU; the reasons come from one
  `validation-stop-on-errors` call of the rows that did not land, which names each ("Row 1: Value
  for 'material' attribute contains incorrect value…").
- A category path that does not exist is made by the import, untracked: every product's paths are
  checked against the tree the install made before the call.

## Alignment with the Data Installer service

The service already has two kinds in Import API form (`dsc-data-installer-api`,
`config/data_processors_import.json`): `product_export` and `customers_export`, each a whole
`{ source: { entity, behavior, items } }` body sent by `JsonImportProcessor` to `import/json`, with
substitutions for `_store`, `_website`, `store_view_code`, `product_websites`, `behavior`, and
`group_id` by lookup. Our engine refuses both today (`runPack.ts`). Packs keep the service's shapes;
nothing here invents a new one. The `products` kind (REST shape) is converted at install time, so
every existing pack gets the speed without being rewritten.

## Steps

1. **Small wins with no new route** — remove redundant one-at-a-time work:
   assignments not deleted when their set or attribute is deleted with them; child categories not
   deleted under a deleted parent (engine and Clear Demo Data); array routes sent with their whole
   list (stock links, link deletes, catalog unassignments); unfinished product creates checked by SKU
   pages; read-back of categories, attributes, groups, customers, rules a few at once; Save Store's
   child lookups from the pages it read.
2. **Assignments, categories, attributes, options, sets, groups, rules through the bulk API**, ids from
   `detailed-status`; one bulk call per kind (per level for categories).
3. **Import API for products** — `product_export` installed natively with the service's substitutions;
   `products` rows converted to import rows; children then parents; read-back, reasons by
   stop-on-errors; the bulk queue kept as the fallback when the import refuses the call itself.
   Reinstall updates go the same way.
4. **Customers** — `customers_export` natively (`customer_composite`); `customers` rows through the
   bulk API; removal by customer import delete.
5. **Clear Demo Data** — product website removal and the remaining per-object deletes batched.
6. **Measure** a full Luma install and removal live; the export tool writes `product_export`.

Each step: tests first, gate, owner approval before commit.
