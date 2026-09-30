---
id: AB-16p
kind: feature
area: app-builder
needs: []
value: high
status: built
parent: AB-16
---

# The ERP sends the price it would charge, whatever set it

Filed 2026-09-28. **Owner, 2026-09-28: yes** ("the whole point is to demonstrate a bidirectional
integration"; a price set only in the ERP defeats it).

## The gap

Only the ERP's price lists (customer and price group) reach Commerce, as tier prices in the
company's shared catalog. The ERP's Pricing screen rules (a customer's own price or discount on
a product or on all products, and the store-wide maximum discount) price only the ERP's own
quotes and orders: an SC can set a 10% customer discount there and the storefront never shows it.

## Recommended

The ERP runs its own precedence (own price list, then price group list, then pricing rule,
then list price, capped by the maximum discount; demo-erp `lib/pricing.js`) per customer and
product, and its "prices in force" answer and `contract.changed` event carry that RESULT.
A pricing-rule change raises the same event a price list change does. The integration needs
no change: it writes whatever set it is sent and removes what drops out. Rejected: labelling
the rules ERP-only (admits the gap); removing them (real ERPs have them).

## Commerce's layer on top (see AB-16l)

Commerce's final price is the lowest of the product price, the tier price (the ERP's customer
price), a special price and a catalog price rule (Experience League, "Tier pricing"); cart
price rules apply after that, in the cart.

## Shipped so far

- 2026-09-28  2026-09-28 built and merged: demo-erp main 0bbe169 (33044bf decide() shared by quote and in-force; dcf62e4 lib/net-prices.js; bb753e7 in-force and contract.changed carry what the ERP would charge; contract v9), integration main 4de1d30 (contract vendored; box journey: a 10% Pricing-screen discount lands as a 10% tier price, a 5% ceiling cuts it to 5%, deleting it leaves catalog and ledger as they began). 356 ERP tests, 774 integration tests, lint clean; an agreement test checks 140 customer/product/quantity cases where Commerce's price equals the ERP's quote. Integration logic unchanged.
- 2026-09-28  2026-09-28 left open (builder's report): (1) a pricing condition scoped to one sales organisation applies on every website (per-website lines would be a contract and integration change); (2) Commerce takes the lowest price, the ERP the highest quantity break reached: they disagree when a higher break costs more or a fixed price sits above list (existed for price lists; a ceiling with a minimum quantity can now cause it); a surcharge is not sent; (3) no event, the hourly publish catches up: a fill/import changing list prices, a new product under an all-products discount, a product deleted in the ERP; (4) a list line for a product the ERP no longer holds is now dropped; (5) load unmeasured: a store-wide condition recomputes every customer across every product (Bodea: up to ~182 lines per customer).
- 2026-09-28  2026-09-28 proven live on Bodea (ERPs 0bbe169, integration 4de1d30): a Pricing-screen discount in Northwind (contractDiscount, C21 Kukla Studios, accesspoint, 10%) created 16:25:17 UTC reached Commerce by 16:25:49 as a 10% tier price for Kukla Studios' group 19 (179.10 against list 199); deleted 16:25:57, gone by 16:26:26. ServerSavvy's row (group 16) untouched throughout.
- 2026-09-30  Renumbered AB-16k → AB-16p on 2026-09-30 while merging feature/erp-integration into the loop branch: both branches had allocated AB-16k (the loop to the Admin-page design question, this branch to this item). Commit trailers on this branch's earlier commits still say AB-16k.
