---
id: AB-63
kind: fix
area: app-builder
needs: []
value: med
status: shipped
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

## Shipped so far

- 2026-10-03  Built 2026-10-03 (overnight loop): posting a shipment takes the shipped quantity out of its warehouse, refused when short; no ProductStock.Changed for a goods issue (Commerce deducts on its own shipment); an external shipment deducts once per reference (demo-erp 86f3430; contract note vendored, integration ff7eb00; branch loop/2026-10-03-overnight). Live check owed: ship on Justrite and watch the ERP's on hand fall.
- 2026-10-06  Shipped 2026-10-05: every commit is on its repository's main, and Justrite deployed demo-erp 5f912cd and the integration c099eb9 (cloned from GitHub main, status deployed at 21:32Z/21:35Z). Any live check this item names is a check, not a reason to hold it open.
