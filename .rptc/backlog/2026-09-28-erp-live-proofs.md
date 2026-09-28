---
id: AB-16d
kind: feature
area: app-builder
parent: AB-16
needs: [AB-16a]
value: high
status: backlog
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
