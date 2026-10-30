---
id: DI-8
kind: feature
area: data-installer
needs: []
value: med
status: gated
waiting-on: the owner reading the four `product_export` items from the service's database (tabled 2026-10-27)
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
