---
id: AB-26g
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26b]
value: high
status: built
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
- 2026-09-30  Owner decision (2026-09-30): Option A — make hold possible from Commerce (build the Commerce->ERP hold, don't drop it). Recommendation logged: the flow is ALREADY coded (commerce-changes changeOnErpOrder detects state=holded -> erp.fromCommerce.hold, handles off-hold release, skips if already held); the blocker is the ACCS REST hold no-op, so the trigger must be the Admin UI hold action (different backend path, fires sales_order_save_commit_after). Remaining: confirm Admin UI hold sets state=holded + fires the event on ACCS, then deploy + live-verify.
- 2026-09-30  2026-09-30 RESOLVED IN CODE — nothing to build. Verified the whole Commerce->ERP hold chain is already coded + tested (8/8 commerce-changes): event sub carries state/ext_order_id -> changed handler -> changeOnErpOrder detects state=holded -> erp.fromCommerce.hold (+ off-hold release, skip-if-already-held); ERP POST orders/:n/credit/hold {origin} -> holdFromCommerce. The blocker was never code, it is the TRIGGER: legacy orders/{id}/hold no-ops on ACCS; the CORRECT ACCS endpoint is orderChain/{id}/hold (+/unhold), but it answers 400 'SalesOrderChainApi not enabled.' on Bodea (tested live, order 27, no side effect). So the one remaining step is OWNER/CSM: enable SalesOrderChainApi on the Bodea instance (feature toggle / support request; not merchant config, not extension-controlled). Once enabled, orderChain hold fires the event and the built flow holds the ERP order; unhold reverses. See memory reference_commerce_rest_hold_noop.
- 2026-09-28  2026-09-28 status tidy (owner: yes): built. Commerce Admin shipment, invoice, hold and cancellation reached the ERP live 09-25 and 09-27 (orders 3000000011-13); a cancel reached both ERPs live 09-28 (AB-16h). Left: captured event payloads.
