---
id: AB-16k
kind: feature
area: app-builder
needs: []
value: high
status: backlog
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
