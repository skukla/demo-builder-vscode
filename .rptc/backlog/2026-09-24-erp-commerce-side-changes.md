---
id: AB-26g
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26b]
value: high
status: active
---

# Changes made in Commerce Admin flow back to the ERP (shipment, invoice, cancel, hold)

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 2 — needs an event-subscription change (uninstall + install), done in the scratch workspace.**

## What

Subscribe to Commerce's shipment, invoice and non-new order saves; tell the ERP (`POST orders/:n/shipments` + post, `/invoice`, `/cancel`, hold) with an `origin` marker so the ERP journals it and does NOT emit the outbound event back; every handler asks its own ERP 'is this mine?' first (rule M2). Closes entity-matrix item 1 and G4.

## Verification block (checked by the loop's done gate — §6a of the plan)

Harness: ship in the fake Commerce → ERP shipment exists → NO second Commerce shipment recorded; same for invoice, cancel, hold; a second pair's handler ignores an order it does not hold; live in the scratch workspace.

## Shipped so far
- 2026-09-24  BUILT TO THE EDGE — demo-erp ce52126 (origin-aware moves: commerce-shipment, commerce-invoice, credit/hold, cancel and credit/release with origin; recorded and journaled, no outbound event; idempotent; contract order.fromCommerce) + integration f42e6f2 (handlers order-commerce/shipped, /invoiced, /changed on the shipment save, invoice save and non-new order save events; is-this-mine via ext_order_id → ERP GET (M2); 503 waits / 400 ends; Admin history rows; manifest regenerated; 332 tests). NOT done: live proof — the two new subscriptions (their payload fields are assumed from the REST shapes) and the unhold rule need the scratch deploy; the harness journeys in the verification block need AB-26c
- 2026-09-24  docs(backlog): AB-26g Commerce-side changes built to the edge on both sides (`728ad6ad6`)
- 2026-09-30  2026-09-29 Live on Bodea: Commerce Admin ship (§6.3) and cancel (§7.1) flow back to the ERP (PASS). REMAINING: the hold leg is gap G4 — a Commerce hold does not reach the ERP AND the Commerce REST hold action is a no-op on this ACCS instance (returns true, order stays pending). Ship/invoice/cancel done; hold not built.
- 2026-09-30  G4 hold leg — direction is a product call under the locked SAP-central model (credit/holds ERP-mastered). A Commerce-Admin hold TO the ERP is defensible as a channel-side op, but is blocked mechanically: the ACCS REST hold action is a no-op (returns true, order stays pending). Options: drive hold via the Admin UI action (different backend path, may fire the order-save event already subscribed) or drop the hold demo. Needs a scratch deploy to test. See 2026-09-30 loop report.
