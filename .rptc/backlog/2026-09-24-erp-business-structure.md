---
id: AB-26j
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26g, AB-26h]
value: high
status: planned
---

# Business structure — sales organisation per website, prefix and ownership per pair, legal identity, warehouse names, the Organisation card

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 1 for steps 01, 03, 04, 05; step 02 stops at the live store-config fixture unless AB-26b already captured it.**

## What

The five steps of `.rptc/plans/erp-business-structure/`: the record-shape pin and contract v2; the integration's Structure settings, order `salesOrg`, prefix on `ext_order_id`, ownership filter, legal fields and `structure` block in the mirror; the ERP's records; the screens; the record and the SC-facing demo setup guide (`docs/demo-setup.md`).

## Verification block (checked by the loop's done gate — §6a of the plan)

Step 01's record-shape test fails on any unpinned field; harness journeys for the sales org on an order and a partner; headless checks on Settings, Order, Customer, Shipment, Pricing; no `1000` that is not a real sales organisation.

## Shipped so far
