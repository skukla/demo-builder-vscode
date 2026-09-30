---
id: AB-49
kind: fix
area: app-builder
parent: AB-26
needs: []
value: med
status: active
---

# A shipment with no warehouse still fails when a product sits in several warehouses

Filed 2026-09-30 from the review of the other agent's work. The reviewer's finding on
demo-erp `lib/fulfilment.js` (the 2b8c503 hunk): a shipment created without a warehouse
defaults to the products' warehouse only when every shipped product sits in exactly ONE
warehouse. If any product is stocked in two, `codes.size > 1`, the warehouse stays null,
the integration sends Commerce the source "default", and Commerce's ship 400s. The ERP
screen always names a warehouse; shipments created through the API or by an agent do
not. Also one `getProduct` read per line.

## Failure scenario

An agent (or the walkthrough script) posts `POST orders/:n/shipments` with lines and no
warehouse for products stocked at both Northwind warehouses → the shipment is created
with no warehouse → the Commerce shipment fails with "source default does not exist".

## Fix taken

Choose deterministically instead of giving up: the one warehouse that holds EVERY shipped
line, when exactly one does; else the warehouse with the most stock across the shipped
lines; only when nothing holds them is it left unset. Read each product once.

## Verification

Tests: one shared warehouse → chosen; two products in two warehouses with one common →
the common one; no common → the fullest; no stock anywhere → unset as before.

## Shipped so far

- 2026-09-30  2026-09-30 FIXED (demo-erp de7bd8a, loop branch). defaultWarehouse(products, lines): the warehouse holding every shipped line when exactly one does; else the fullest across the shipped lines; null only when nothing holds them; ties broken by code; each product read once. 6 pure tests; 398/398. REMAINING: live proof with the deploy (an agent-created shipment for products in two warehouses now ships).
