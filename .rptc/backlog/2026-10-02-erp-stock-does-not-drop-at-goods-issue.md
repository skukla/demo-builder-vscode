---
id: AB-63
kind: fix
area: app-builder
needs: []
value: med
status: backlog
parent: AB-26
---

# The ERP's on-hand stock does not drop when it posts a shipment

Found live on Justrite, 2026-10-02: after the Justrite ERP shipped one 51BSCU-BLBK (order
5000000012), the ERP still showed 3 on hand while Commerce showed 2. demo-erp `lib/fulfilment.js`
has no stock movement at goods issue; a return's receipt does add stock back (`lib/returns.js`
restock). The ERP's number only catches up when a later Commerce event imports Commerce's
quantity.

A real ERP reduces stock at goods issue; here the ERP's Available rises back after shipping
(the order stops committing the stock and on hand never fell).

## Recommendation

Posting a shipment reduces the plant's quantity by the shipped quantity (no ProductStock.Changed
for it, or one the integration drops, because Commerce's own shipment already deducted the same
units: check which before building, or Commerce is deducted twice).
