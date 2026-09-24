---
id: AB-26k
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26j]
value: med
status: backlog
---

# The product as a master record — available, open orders, sales status

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 1.**

## What

`erp-screen-realism` slice 6 / §3.7: Available = on hand − committed (open quantities on confirmed orders); an Open orders card on the product; a sales status (sellable / blocked for sales) that refuses to ship; three-tint stock status; the product page on the shared `Card`.

## Verification block (checked by the loop's done gate — §6a of the plan)

Unit tests on committed/available; a shipment of a blocked product refused in words; headless checks on Products and Product.

## Shipped so far
