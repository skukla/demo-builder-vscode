---
id: DI-9
kind: fix
area: data-installer
needs: []
value: med
status: active
---

# A pack links products to categories by url key, which two categories can share

Filed 2026-10-30, from comparing the Data Installer service's category handling with Demo
Builder's engine (owner: "fix now", for the part in reach; this is the part that is not).

## What is wrong

A pack names a product's categories by url key alone. The service's export turns each category id
into its url key (`dsc-data-installer-api` `config/data_processors_export.json`, products:
`category_ids` / `category_id` → `replaceCategoryIdsWithUrls()`), and our own capture does the
same (`productLookups.ts` `categoryUrlKey`, used by `capture.ts`). But a url key is unique only
among one parent's children: Commerce lets a child reuse its parent's key, because the storefront
url is the whole path (`servers-and-racks/racks`).

Measured 2026-10-30 on the shared library's packs (saved as zips through `save_datapack_zip`, read
locally, then deleted): of the 8 that could be read, two have a key used twice.

- **Bodea**: "Bodea/Products/Servers and Racks" and its child ".../Servers and Racks/Racks" are
  both `racks`. **22 products** link `racks`.
- **We.Cafe**: "we-cafe/Food" and its child ".../Food/Hot Dog" are both `food`. 1 product links
  `food`.

On install, both the service and our engine resolve the key to one category: the service takes the
first match anywhere in the store (`actions/utils/lookups.js` `performLookupForValue`,
`response.data.items[0]`); ours prefers a match under the target's root, then takes the first
(`productLookups.ts` `categoryLookups`). Either way all 22 Bodea products land in one of the two,
most likely the one made first, "Servers and Racks", and the Racks page would be empty. **Not seen
on a live store**; inferred from the pack's data and both lookups.

The pack cannot say which category each product was really in: the information was dropped at
export. So no installer can fix Bodea as it is.

## The way through (recommended)

1. **Our saves write a key that is unique**: the category's url path (`custom_attributes`
   `url_path`, which the export strips as derived, `packForm.ts` `DERIVED_CATEGORY_FIELDS` and the
   service's `field_mappings`), or the pack's category path. The install resolves that first, and
   falls back to the url key for packs made before. Packs keep working either way (rule 3).
2. **Bodea is re-exported** with it, once 1 ships, or its product links are fixed by hand in the
   pack. The owner's call which; Bodea is CoreTech's pack in the shared library.
3. Until then, an install could say when a key is ambiguous under the pack's root ("22 products
   link `racks`, which two of the pack's categories use; they went into Servers and Racks"), so it
   is not silent.

Check before building: read the real Bodea store (if one exists) for where those 22 products sit,
to confirm which category was meant.

## Shipped so far

- 2026-10-31  fix(data-installer): an install says when a category key names two categories (`515532cdb`)
