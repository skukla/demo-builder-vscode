---
id: AB-26k
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26j]
value: med
status: built
---

# The product as a master record — available, open orders, sales status

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 1.**

## What

`erp-screen-realism` slice 6 / §3.7: Available = on hand − committed (open quantities on confirmed orders); an Open orders card on the product; a sales status (sellable / blocked for sales) that refuses to ship; three-tint stock status; the product page on the shared `Card`.

## Verification block (checked by the loop's done gate — §6a of the plan)

Unit tests on committed/available; a shipment of a blocked product refused in words; headless checks on Products and Product.

## Shipped so far
- 2026-09-24  Picked up (lane 1, ERP only). Staleness check: open quantities exist on order lines (lib/orders openQty), the shared Card exists (screen Card.js), StockStatus has two tints, ProductDetail carries its own local Card (a verified duplicate of the shared one, in reach; replaced in this slice). Dependency AB-26j is built on the same branch, not merged; taken as satisfied per the programme's order of work, decision 6 in the loop report. Design: committed = open qty on orders not cancelled and not invoiced, available = on hand minus committed, both derived on read in lib/availability.js; salesStatus (sellable | blocked) is an ERP-owned field with no Commerce event, kept across imports, refusing shipment in words; the list shows On hand · Available · Status (Committed is on the document: a ninth column clipped the grid at 1440px, the plan's list layout deviates here)
- 2026-09-24  BUILT — demo-erp 8ebf768. lib/availability.js (committed = open qty on orders not cancelled or invoiced; available = on hand minus committed, may go below zero; openOrdersFor newest first; a parent sums its variants), lib/stock-status.js (three tints, threshold 10, standalone for the screen), salesStatus sellable|blocked on the product (ERP-owned, no event, survives imports; createShipment and postShipment refuse 'Product X is blocked for sales.'; a parent has none), record-shape pin +salesStatus. Screens: list On hand · Available · Status (Blocked for sales / Low / In / Out), product page on the shared Card with Basic data, Open orders (row opens the order) and Inventory's On hand · Committed · Available line. Preview parent gained three variants (its page rendered blank before; no check had opened it). Headless check opens a product and the parent. Fingerprints: products + product page re-accepted; 15/15 stable; full suite 255. Done gate: no src/ touched in this repo; component-extraction: the local Card duplicate in ProductDetail was REMOVED for the shared one; call-path-audit not triggered (no new user action path; the block is a field edit through the existing PATCH). Found and fixed: UPDATE_SCREEN_FINGERPRINTS took a one-off shipments sample; re-accept now needs two fresh loads to agree and never drops a key
- 2026-09-24  docs(rptc): product master built — item, programme table and loop report (`e186963f0`)
