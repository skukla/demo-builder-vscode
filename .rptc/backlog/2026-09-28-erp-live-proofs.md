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
