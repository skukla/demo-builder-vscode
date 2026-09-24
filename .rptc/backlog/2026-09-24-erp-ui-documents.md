---
id: AB-26p
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26j, AB-26k]
value: med
status: built
---

# Screen redesign 3 — documents

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 1.**

## What

UI audit: order timeline card from `history`; product link from an order line; credit meter and open-items/history split on the customer; due date and seller block on the invoice; ERP warehouse names on the shipment; `Card` reuse on the product page.

## Verification block (checked by the loop's done gate — §6a of the plan)

Headless checks per document; unit tests where a value is derived (due date, meter fraction).

## Shipped so far
- 2026-09-24  Picked up (lane 1, ERP only). Staleness check against the UI audit's document sections: the sticky title line (AB-26n), the credit status field (the credit hold slice), the shipment's ship-from by the ERP's name and the invoice's seller block (AB-26j), the product page on the shared Card with its Open orders card (AB-26k) have all shipped. What remains: the order's timeline card from history; a product opened from an order line; the customer's credit meter and the open items / history split; the invoice's due date from billing date plus payment terms; the Pricing card's wording when no rule names the product. The audit's pricing column on order lines needs a contract addition the integration does not send yet (the applied condition at cart time); filed, not built here. Dependencies AB-26j and AB-26k built on the same branch (loop report decision 7)
- 2026-09-24  BUILT — demo-erp 64e0148: the order's Timeline card (history merged by time with shipments and the invoice, documents linked); a line's SKU opens the product on the same trail (the product joins the document trail, Documents.js adapts its SKU prop); the invoice's Due date from billing date plus payment terms (lib/terms; terms naming no days leave a dash; pinned); the customer's credit Meter and the Open items / History split (open items add up to the exposure); the product's Pricing card wording when no rule names it. Found and fixed in the screen check: a document's retry reopened the LIST (a row click writes nothing into the address bar), so every document retry had fingerprinted the list; the retry now reopens by the row's key and waits for the document's title. Four document fingerprints re-accepted; 17/17 stable; suite 264. Filed: the pricing column on order lines needs the applied condition recorded at order creation, a contract addition the integration does not send. Done gate: no src/ in this repo; Timeline is a new component with no prior implementation (component-extraction not triggered); no new pathway
