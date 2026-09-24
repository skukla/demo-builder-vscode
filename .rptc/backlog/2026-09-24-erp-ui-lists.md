---
id: AB-26o
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26k]
value: med
status: built
---

# Screen redesign 2 — lists

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 1.**

## What

UI audit: filter chips and Shipping/Billing badges on Sales Orders; Exposure/Available columns and a blocking badge on Customers; Sold-to on Shipments and Invoices; three-tint stock on Products.

## Verification block (checked by the loop's done gate — §6a of the plan)

Headless checks; the grid search/sort tests in `test/grid-view.test.js` extended for the new columns.

## Shipped so far
- 2026-09-24  Picked up (lane 1, ERP only). Staleness check against the UI audit's list sections: Products list done by AB-26k (Available, three tints, Blocked for sales in the status); the Sales Orders list already has a work filter (the cues) and Sold-to as id · name; the Customers list already shows blocking as a badge. What remains: Shipping and Billing badges on Sales Orders in place of the Lines count, plus an Open · In process · Completed · Cancelled filter; Sold-to on Shipments and Invoices and the ERP's warehouse name on Shipments; Exposure and Available on Customers (one pass over the orders, the same rule the customer document uses). Dependency AB-26k built on the same branch (loop report decision 7)
- 2026-09-24  BUILT — demo-erp ce2c9a5: Sales Orders rows carry shippingStatus, billingStatus and overall (Shipping and Billing badges replace the Lines count; a Stage filter beside the work filter); Shipments and Invoices rows carry the sold-to (partnerName) and a shipment its warehouse by the ERP's name (warehouseName via warehouseOf); Customers rows carry exposure and available from one pass over the orders (lib/partners withCredit, the document's rule; the walk-in account null), the Commerce company id moved to the document so eight columns fit. test/lists.test.js pins the rows through the actions; a headless check reads the four lists' headers and the ship-from name; four fingerprints re-accepted, 16/16 stable; suite 262. Done gate: no src/ in this repo; no new pathway (call-path-audit not triggered); shippingBadge/billingBadge are shared from OrderHeader so the list and the header read one map (component-extraction: nothing new duplicated)
