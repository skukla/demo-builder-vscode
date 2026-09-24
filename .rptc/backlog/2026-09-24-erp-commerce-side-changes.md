---
id: AB-26g
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26b]
value: high
status: backlog
---

# Changes made in Commerce Admin flow back to the ERP (shipment, invoice, cancel, hold)

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 2 — needs an event-subscription change (uninstall + install), done in the scratch workspace.**

## What

Subscribe to Commerce's shipment, invoice and non-new order saves; tell the ERP (`POST orders/:n/shipments` + post, `/invoice`, `/cancel`, hold) with an `origin` marker so the ERP journals it and does NOT emit the outbound event back; every handler asks its own ERP 'is this mine?' first (rule M2). Closes entity-matrix item 1 and G4.

## Verification block (checked by the loop's done gate — §6a of the plan)

Harness: ship in the fake Commerce → ERP shipment exists → NO second Commerce shipment recorded; same for invoice, cancel, hold; a second pair's handler ignores an order it does not hold; live in the scratch workspace.

## Shipped so far
