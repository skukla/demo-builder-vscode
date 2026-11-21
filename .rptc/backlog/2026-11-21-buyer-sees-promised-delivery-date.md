---
id: AB-91
kind: feature
area: app-builder
parent: AB-19
needs: []
value: med
status: backlog
---

# A buyer sees each brand's promised delivery date for lines that ship later

Filed 2026-11-21 from the backlog reconciliation. The owner decided on 2026-09-28 (recorded in
AB-19) that checkout "shows that ERP's promised delivery date for its lines", and that a date needs
its own label, which is a storefront component.

Not built: the placement action only logs promises
(commerce-erp-integration `webhook/placement/index.js`, lines 86-89), the parts page is Admin-only,
and no block-library or storefront code reads a promise date.

Done when a buyer whose order has a line the ERP cannot ship now sees that line's promised date at
checkout or on the order, labelled, proved live on one store.
