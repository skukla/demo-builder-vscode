---
id: AB-43
kind: fix
area: app-builder
needs: []
value: high
status: shipped
parent: AB-26
---

# ERP shipment never lands in Commerce for a non-default inventory source

Filed + fixed 2026-09-29, found live on Bodea running AB-26e §6. An ERP shipment of a product
in a non-default source (accesspoint in `northwind`) failed to become a Commerce shipment:
`POST /V1/order/{id}/ship` answered 400, and the order carried an invoice but no shipment.
Only bites non-default sources — prior default-source shipments "passed," which is why it
shipped.

## Two bugs, both fixed + deployed + proven live (order 000000003 / ERP 0000001016)

1. **demo-erp `lib/fulfilment.js` `createShipment`** left `warehouse` null when none was named,
   which the integration turned into Commerce source `"default"` — where the goods are not. Fix:
   when no warehouse is named and the shipped products share one, default to it (an ERP ships
   from where the goods are). Commit `2b8c503` (demo-erp main), test in `fulfilment.test.js`.
2. **integration `.../order/external/shipment-created/transformer.js`** sent the MSI source in a
   TOP-LEVEL `extension_attributes.source_code`, which Commerce's `salesShipOrder` ignores — the
   source must be under `arguments.extension_attributes.source_code` (proven: a manual
   `POST order/24/ship` with `arguments…` created a shipment; the top-level form 400'd). Fix moves
   it under `arguments`. Commit `2062999` (commerce-erp-integration main).

## Why it shipped: the fake matched the invention, not reality

`test/box/fake-commerce.js` read the source from the same top-level `extension_attributes` the
transformer wrote, so the box tests and the code agreed on a shape real Commerce rejects — the
classic invented-fixture trap. The fake now reads `arguments.extension_attributes.source_code`
(faithful to Commerce), and `adminShip` sends it there. 940 vitest + 368 demo-erp tests pass.

## Done when

An ERP shipment of a non-default-source product becomes a Commerce shipment. DONE — re-proven
live 2026-09-29 (shipped with no warehouse → applied to Commerce).
