# The service's catalog, audited for the library (2026-10-27)

Read-only, on the Data Installer service's Stage deployment. Owner's choices recorded with the
findings. The plan's decisions on where packs live are in
`.rptc/plans/datapack-engine/overview.md`.

## What a pack holds (measured 2026-10-27, read-only, Stage)

42 packs; 25 data kinds. Catalog kinds are the common ones (categories 30 packs, product
attributes 29, attribute assignments 29, products 28, stock links and source items 25,
attribute sets 22). Customers 12, cart rules 11, coupons 9, ACO kinds 8, customer groups 6,
B2B kinds 4, stocks and sources 4, gift cards 2. Bodea `main` (ACCS) holds 14 kinds, about
100 items in all: 56 products, 7 attributes, 4 attribute sets, 6 customers, 3 companies.

## The packs the library starts with (owner, 2026-10-27)

Audited read-only on the service's Stage catalog the same day: 42 packs, 23 shared. Versions
were compared item by item, by content hash.

- **Eleven brands, one version each:** `bodea`, `carvello`, `citisignal_new`, `frescopa`,
  `grocery`, `healthbeauty`, `wecafe` and `wknd` at `main`; `citisignal_original`, `luma` and
  `venia` at `eds-compatible`. Bodea's `tierpricingfix` and the `v1.0` of Grocery and We.Cafe
  are identical to `main`; each `hold` is an older copy.
- **The eight ACO packs** (`aco_<brand>` at `main`), held in the library although our engine
  does not install ACO kinds yet.
- **Left behind:** the `legacySkus-20260522` versions (older product SKUs than `main`), the
  archive copies, the test and personal packs, and `dsc-enablement-sample0`.
- Nothing in Demo Builder names a pack version, and no project on the owner's machine records
  one, so the choice strands nothing here.

## Items too big to read (measured 2026-10-27)

The `product_export` items of `luma` and `venia` (both versions each) cannot be read through
the service: with their rows, `batch-get-data-items` and `get-data-item` answer 400 "Response is
not valid 'message/http'"; without them, they are found. The service stores each data kind as
one document and has no way to return part of one (`actions/database/getDataItem.js`). The
largest item that did read was 357 KB. Most likely the runtime's limit on how big an answer can
be; the documented figure is not yet checked. Venia also ships its products as `products`, which
reads; Luma ships products only as `product_export`.

- **Our library will hit the same limit**, being on the same platform: it stores a large kind in
  several pieces, and the copy reads and writes it piece by piece.
- **The four items: read from the service's database directly** (owner's choice), with the
  connection settings the owner's Stage developer access can read. Read-only. Not yet done: the
  agent was refused access to another service's credentials, so the owner runs or authorises it.
  Tabled 2026-10-27 (owner away from the machine); Luma's products and Venia's `product_export`
  wait on it, and the other packs do not.
