# Step 02: the install record and the catalog kinds

Status: **done** 2026-10-27 (`5cbb59f26` record; `d2575438b` attributes and sets; `1fcf1bdfe`
categories; `8aeecbea6` stock; `f4e2f2356` products and quantities). Not yet run against a live
store.

Specification: [catalog-spec.md](../../research/datapack-engine/catalog-spec.md), the service's
install and removal read off its processors, including where ours deliberately differs.

Built in `src/features/data-installer/services/demoBuilderEngine/`, each kind's install and its
removal:

| File | Kinds |
|---|---|
| `installRecord.ts` | the record: one file per installed pack beside the project, written as each object is made |
| `kindContext.ts` | what every kind is handed; "no such thing" and "already gone" read one way |
| `attributesKind.ts` | `product_attributes` (and the options added to an existing attribute) |
| `attributeSetsKind.ts` | `attribute_sets`, `attribute_assign_to_set` |
| `categoriesKind.ts` | `categories` |
| `stockKinds.ts` | `sources`, `stocks`, `stock_source_links` |
| `productLookups.ts`, `productsKind.ts` | `products` |
| `sourceItemsKind.ts` | `source_items` |

Reused, not rewritten: the Commerce access the ERP work takes (`CommerceGet`, `CommerceSend`, now
in `src/types/commerceWire.ts`), its error type and paged reads (`erpFillReaders.ts`), its rule for
the group a new attribute goes in (`pickAttributeGroup`), and its inventory reads and source
switch (`readInventory`, `setSourceEnabled`). Each of those moved with its own tests unchanged.

**Proved by** unit tests built on real rows read from the service (Bodea, Carvello). **Still to
prove:** a live install and removal on a throwaway ACCS store, on the owner's go (step 03).

**Known gaps:** swatch attributes are refused; bundle, grouped and gift card products have no test
of their own; images are not carried (see step 11); a store's root category is not set to a pack's
new root.
