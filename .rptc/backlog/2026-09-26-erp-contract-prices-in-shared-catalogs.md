---
id: AB-26z
kind: feature
area: app-builder
needs: []
value: high
status: active
parent: AB-26
---

# ERP contract prices live in each company's shared catalog, not in a cart webhook

Slice of [[AB-26]]. Filed 2026-09-26 from the owner's direction: a B2B buyer sees their
contract price everywhere (listing, product page, cart), and "in order to provide unique
pricing within a company context, you must use a shared catalog". Today the ERP's price
reaches Commerce only at the cart, through the item-prices webhook, so the buyer browses at
the catalog price (55) and is charged the contract price (40). That is the wrong model.

## What Adobe documents

- Shared catalog overview (Experience League, commerce-admin/b2b/shared-catalogs/catalog-shared):
  a CUSTOM shared catalog "contains pricing that is visible only to logged-in associates of the
  assigned company accounts"; the public catalog serves guests and non-company customers.
- SharedCatalog module (developer.adobe.com/commerce/webapi/rest/b2b/shared-catalog): "a company
  can be assigned only one shared catalog"; custom catalogs are assigned to companies only.
- Set shared catalog pricing and structure: a custom price is Fixed or Percentage per product;
  "the minimum value between the Base Price and the entered Fixed value is used".
- Manage prices for multiple products (developer.adobe.com/commerce/webapi/rest/modules/catalog/catalog-pricing):
  `POST /V1/products/tier-prices` sets many prices in one call, keyed by `customer_group`.

## What was measured on the Bodea sandbox (2026-09-26)

- A shared catalog's custom price IS a quantity-1 tier price for the catalog's customer group:
  `products/tier-prices-information` shows ServerSavvy Solutions' catalog pricing accessmesh
  `fixed 49` at `quantity 1`, `customer_group: "ServerSavvy Solutions"`.
- Catalog Service on Cloud Service DOES serve it. `products(skus:["accessmesh"])` with
  `Magento-Customer-Group` = SHA-1 of the group id (`"16"`) returns final 49, regular 55. The
  plain group name, the plain id, an empty header and the General/NOT LOGGED IN hashes all
  return 55. So the header carries the hash of the id, not the code the docs name.
- Not yet checked: that the Bodea EDS storefront sends that header for a signed-in company
  buyer (sign in as the ServerSavvy buyer and read a product page).

## The shape

1. Each priced company has a custom shared catalog (one per company; the demo setup already
   asks for this, AB-26x checks it). Never a bare customer group: on 2026-09-25 a company was
   moved to a group no catalog used and so belonged to no catalog.
2. The integration writes the ERP's contract prices into that catalog's group with
   `POST /V1/products/tier-prices` (fixed, quantity 1, the catalog's website), on an ERP price
   event and at the Demo Builder reset fill. Removal deletes exactly what it wrote
   (`tier-prices-delete`), through the integration's write log, so it round-trips to zero.
3. The item-prices cart webhook is removed in the same change (no soft deprecation). The
   discount-ceiling webhook is a separate question.
4. Side benefit: the webhook `required` problem stops mattering for price. On the sandbox a
   webhook subscribed `required: false` is stored and run as required, so a failing price hook
   breaks the cart outright.

## Open

- Which of the ERP's price rules map to a catalog price (per-company, per-product fixed) and
  which do not (quantity breaks map to tier prices at quantity > 1; percentage rules map to
  Percentage). Read demo-erp's rule model first.
- Relation to [[AB-14]] (where an ERP price goes when the project also has ACO).

## Shipped so far

- 2026-09-26  feat(ai): run_commerce_query can ask Catalog Service as a customer group (`4686a23c2`)
- 2026-09-26  docs(backlog): AB-26z, ERP contract prices live in each company's shared catalog (`3f190fd13`)
