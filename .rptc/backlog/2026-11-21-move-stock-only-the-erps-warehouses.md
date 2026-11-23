---
id: AB-88
kind: fix
area: app-builder
parent: AB-16c
needs: []
value: med
status: backlog
---

# Move stock offers only the warehouses the selected products' ERP holds

Filed 2026-11-21 from the backlog reconciliation (AB-16c named it as left; no item carried it).

With two ERPs on one store, the Admin page's Move stock pickers list every warehouse in Commerce,
including the other ERP's. Verified on commerce-erp-integration origin/main: the
`actions/erp/move-stock` GET returns `listSources()`, which is every `inventory/sources` row, and
nothing filters by the owning ERP of the selected products.

Done when the pickers list only the sources the selected products' ERP owns, with a test that has
two ERPs.
