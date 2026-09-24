---
id: AB-26p
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26j, AB-26k]
value: med
status: active
---

# Screen redesign 3 — documents

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 1.**

## What

UI audit: order timeline card from `history`; product link from an order line; credit meter and open-items/history split on the customer; due date and seller block on the invoice; ERP warehouse names on the shipment; `Card` reuse on the product page.

## Verification block (checked by the loop's done gate — §6a of the plan)

Headless checks per document; unit tests where a value is derived (due date, meter fraction).

## Shipped so far
- 2026-09-24  Picked up (lane 1, ERP only). Staleness check against the UI audit's document sections: the sticky title line (AB-26n), the credit status field (the credit hold slice), the shipment's ship-from by the ERP's name and the invoice's seller block (AB-26j), the product page on the shared Card with its Open orders card (AB-26k) have all shipped. What remains: the order's timeline card from history; a product opened from an order line; the customer's credit meter and the open items / history split; the invoice's due date from billing date plus payment terms; the Pricing card's wording when no rule names the product. The audit's pricing column on order lines needs a contract addition the integration does not send yet (the applied condition at cart time); filed, not built here. Dependencies AB-26j and AB-26k built on the same branch (loop report decision 7)
