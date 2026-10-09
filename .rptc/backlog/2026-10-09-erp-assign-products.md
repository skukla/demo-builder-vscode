---
id: AB-74
kind: feature
area: app-builder
needs: []
value: high
status: backlog
---

# Assign products to an ERP, and put erp_owner in every attribute set

Filed 2026-10-09 (owner approved building it the same day).

## Why

An ERP whose rule is `erp_owner=<id>` owns the Commerce products tagged with that value
(`erpOwnership.ts`, `ownersAcross`, AB-72). Tagging was done by hand in the Commerce Admin, or
by an agent through `write_commerce_rest`, one product per call. ACCS saves a product in
13–23 s, so tagging Accuform's 96 products and Justrite's 43 took about 35 minutes (AI-10's
log). The ownership pass then said "<ERP> owns no products yet: tag products with
erp_owner=<id> in Commerce, then Load demo data", which pointed the SC at the Admin.

Two Commerce traps sat under it: a value for an attribute that is not in the product's
attribute set is dropped while the PUT answers 200 (reference note on product create
gotchas), and the `erp-attributes-exist` setup check only looked at whether `erp_owner`
existed and was a Text Field.

## What was built

- **Assign products** on an ERP card's menu (an ERP its integration serves in a list, both
  deployed): a modal that picks products by category, by brand, by the start of the SKU or by
  pasted SKUs, previews the count, a few SKUs, which ERP owns them today (they move, and it
  says so), what is already tagged, and what cannot be written. The value written is the one
  in the ERP's own rule; any other rule is refused in words.
- The write is ONE Commerce async bulk call (`PUT V1/async/bulk/products/bySku`, ACCS route
  order per the reference note on ACCS route shapes), followed with `GET V1/bulk/<uuid>/status`
  every 3 s for up to 10 minutes in the screen's progress modal, then the ownership pass
  (`applyErpOwnership(..., 'assign')`).
- Each product's previous `erp_owner` is recorded on the ERP's component record
  (`erpAssignment`). **Undo last assignment** puts those back on the products that still carry
  the value written, runs the pass, and drops the record.
- "Add another ERP" whose new ERP owns nothing offers Assign products on its success view (a
  run's `offer`, rendered by the progress modal through the screen).
- The `erp-attributes-exist` check now also names the attribute sets the products use that
  lack `erp_owner`. Its fix (setup guide, and the top of the Assign modal) adds it to each, into
  the set's Product Details group; the added sets are recorded on the integration
  (`erpOwnerSets`) and the guide can take it out again, which waits until no product in them
  is tagged.
- Agent tools `assign_erp_products` and `add_erp_owner_to_attribute_sets`, both previewing
  without `confirm`, and their undos `undo_erp_assignment` and
  `remove_erp_owner_from_attribute_sets` (the reversibility ledger requires an add_ tool's
  undo on the agent surface too).

## Not verified live

Everything Commerce-facing is tested against fakes. The first live check: on a scratch ACCS
store, assign three products to an ERP and read them back (value present on a product read
with and without the project's Store header), and confirm the bulk status's operation list.
