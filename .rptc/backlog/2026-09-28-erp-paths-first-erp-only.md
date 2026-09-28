---
id: AB-16h
kind: fix
area: app-builder
parent: AB-16
needs: [AB-16a]
value: high
status: backlog
---

# Integration paths that still reach only the first ERP

Filed 2026-09-28 by the AB-16a integration build (commerce-erp-integration branch
feature/ab-16a-per-erp-credentials). These paths call the ERP with the integration's raw params,
so a second ERP's address and credential never apply: they reach the first ERP whatever the
product, order or event belongs to.

- Inbound ERP events that read back from the ERP: product and stock updated (`lib/erp-current.js`)
  and order hold.
- Changes made in Commerce sent to the ERP: cancel, hold, release (`lib/commerce-changes.js`).
- `erp/history` (order trace), `erp/detach`, `erp/move-stock`.
- The product created/updated and stock senders (Commerce to ERP).

## Done when

Each path resolves the ERP that owns the record (the event's `erpId`, the order part's ERP, the
product's owner) and calls it through `paramsForErp`; tests assert the call's address and
credential for a second ERP (argument assertions). Proven live with Contoso on Bodea as part of
AB-16d.
