---
id: AB-16d
kind: feature
area: app-builder
parent: AB-16
needs: [AB-16a]
value: high
status: shipped
---

# Live proofs still owed on Bodea for several ERPs

Filed 2026-09-28. Built and tested, not yet seen working live, because the second ERP refuses
the integration until AB-16a.

- **A refused or down ERP's part** stays open, the order is Partially Held naming it, and
  Re-send sends it (integration `a926063`).
- **A company's order is remembered** at placement, so a block and its lift find it (the order
  event carries no order id; the router now looks it up, `a926063`).
- **Each ERP is filled with only its own products** (integration `18b6881`). Contoso still
  holds the whole catalog from its first fill: load its demo data again.
- **B7 checks:** the order view's button, Re-send against a down ERP, and `erp_owner` on the
  product-deleted event (needs an app reinstall).
- **The journeys** in `.rptc/plans/several-erps/journeys.md`, walked with test orders.

## Done when

Each line above has been seen working on Bodea, with the order numbers recorded here.

## Shipped so far

- 2026-09-28  2026-09-28: proven live: a mixed order sends each ERP only its lines (3000000021: Northwind 0000001011, Contoso 0000001000); Contoso's prices reach the shared catalog through the publish (AB-16a). Still owed: Partially Held for a refused/down part and Re-send; company-order remembered; Contoso filled with only its products (it still holds 182 from its first fill: needs a per-ERP reset, AB-16c); B7 checks; the journeys. Contoso's events are not delivered (AB-16i).
- 2026-09-28  2026-09-28: Load demo data for Contoso (demo-erp-2) paired 4 companies and loaded only its 3 products (erp_owner = demo-erp-2; 179 skipped); prices: none in force. Contoso still also holds products from its first, whole-catalog fill (loads add, they do not delete): a per-ERP reset (AB-16c) would clear them.
- 2026-09-28  2026-09-28: a Commerce-side cancel of a split order reaches every ERP's part (3000000021: Northwind 0000001011 and Contoso 0000001000 both cancelled).
- 2026-09-28  2026-09-28: Contoso's own events reach the integration (AB-16i): a price list change reached the shared catalog in 12 seconds, both ways.
- 2026-09-28  2026-09-28 QUESTION for the owner (does not block): the demo ERP never refuses an order and no longer has an outage switch (removed 2026-09-17), so the Partially Held proof needs a connection broken on purpose. Two ways: (a) put a wrong address for Contoso in the integration's ERP list, place a mixed order, restore the address, press Re-send; (b) skip the live proof and rely on the tests. Recommended: (a), on Bodea, undone in the same sitting. Not done tonight: breaking a live connection was not in the loop's authorisation.
- 2026-09-28  docs(backlog): AB-16d logs Contoso's filtered fill (`b6432fb77`)
- 2026-09-30  2026-09-29 Live several-ERPs proofs RUN on Bodea (AB-26e §Several-ERPs): split fan-out to owning ERP, per-ERP part isolation, Contoso price write reaching Commerce with Northwind untouched, reset to zero — all PASS. The 'not yet seen working live' premise no longer holds.
- 2026-09-28  2026-09-28 the Partially Held proof is blocked on tooling: the ERP address lives in the integration's list, which changes only by a whole-list PUT to erp/erps, and no agent tool sends one (invoke_runtime_action POSTs; write_erp_rest targets the ERP). Unit tests cover Partially Held (route-order-real-event, combined-status); the pair journeys do not cover a down ERP or Re-send.
- 2026-09-28  2026-09-28 Partially Held and Re-send proven in the pair-in-a-box tests (integration main 36fc7ac, owner chose this over a live break): two in-process ERPs; one unreachable -> its part held, the order Partially Held naming it, the event retried without re-sending the other part; back -> Re-send sends it once, status back to pending, a second press skips. The refused (401) variant too. Each break of the product (double send, no Partially Held, Re-send double send) fails the test. Live proof on Bodea waits for AB-16q (maintenance mode).
- 2026-09-28  2026-09-28 proven live on Bodea (integration d8d5aae, both ERPs fafaddb): Contoso put in maintenance (15:25 UTC, until 15:55) through write_erp_rest; get_erp_status: Contoso not reachable, 'Contoso ERP is in maintenance until 15:55 UTC.'. Guest order 3000000022 (accesspoint + proliantdl380): Northwind sales order 0000001012 at once; Contoso's part held, retried 4 times with the maintenance reason; Commerce status partially_held. Maintenance ended 15:30:57; Re-send (erp/resend-part) 15:31: Contoso sales order 0000001001; Commerce status back to pending; a second Re-send answered skipped; each ERP holds exactly one sales order for it.
- 2026-09-28  2026-09-28 one-ERP reset proven live on Bodea (Demo Builder 37712be33, integration 4de1d30): reset_erp_records erp=demo-erp-2 undid only Contoso's writes (erp: demo-erp-2 in the answer; 0 reverted, 2 orders' ERP numbers cleared), wiped Contoso (182 products, 5 partners, 1 price list, 2 sales orders, 7 events) and refilled it with only its own 3 products and 4 paired companies (179 skipped as not its own). Northwind untouched. Contoso's 182 leftover products: cleared.
- 2026-10-03  Shipped 2026-10-03 by the owner's finish line for work that lives only in the ERP and integration repositories: on their main branch and deployed (they carry no release tags). Any live proof this item still names is a check, not a reason to hold it open.
