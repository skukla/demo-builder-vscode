---
id: AB-16h
kind: fix
area: app-builder
parent: AB-16
needs: [AB-16a]
value: high
status: built
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

## Shipped so far

- 2026-09-28  Built (integration feature/ab-16h-route-every-erp, 8 commits 11b5290..e308e7f, 746 tests): inbound product (event erpId) and stock (per-SKU owner) read-backs, Commerce-side cancel/hold/release to every ERP holding an open part, product/stock senders by owner, move-stock per owner, detach over every ERP, the order trace per part. Item corrected: inbound order hold already worked (pinned by a test). Follow-ups, not blocking: (1) a stored list with ONE ERP that is not the deployed one still uses raw params; (2) old orders with an ERP number but no parts go through the one-ERP path and the trace assumes the first ERP; (3) the Admin trace headline shows one ERP for a split order (the answer now has an erps list); (4) found: demo-erp named() turns a list-valued stock event into an object when ERP_ID is set (live on main since e1425f3), being fixed with AB-16i; (5) move-stock's GET names the deployed ERP. Not yet deployed.
- 2026-09-28  Live on Bodea (2026-09-28): integration main e308e7f deployed. Cancelling mixed order 3000000021 in Commerce (13:50:10) cancelled BOTH ERPs' sales orders within 10 seconds: Northwind 0000001011 and Contoso 0000001000 (before, only the first ERP was told). The other paths are proven by tests (746), not yet live.
- 2026-09-28  Follow-up (4) fixed and deployed: demo-erp 7671773 keeps a list-valued stock event a list when the ERP names itself (was broken on every deployed ERP since e1425f3).
