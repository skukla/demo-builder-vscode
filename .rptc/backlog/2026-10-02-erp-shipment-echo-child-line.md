---
id: AB-57
kind: fix
area: app-builder
parent: AB-26
needs: []
value: high
status: built
---

# An ERP's own shipment, echoed back from Commerce, was refused and re-delivered for hours

Found 2026-10-02 by the order-to-return loop, reading the integration's failed activations
after a deploy: `order-commerce/shipped` had failed about a hundred times, from the first
split-order shipment of the day (05:24Z) to 07:25Z, each answering 503 "Commerce shipment
<n>: <ERP> did not take it; delivered again later."

## Cause (verified by replay)

An ERP's shipment is made in Commerce by the integration, and Commerce's shipment event then
tells the ERPs about it; each ERP recognises its own shipment by its lines and takes the
Commerce id (demo-erp `receiveShipment`). Commerce's shipment event lists a configurable's
CHILD line beside the parent, and the router's part holds both ids, so the integration sent
the child too. The ERP's sales order holds only the parent: replaying shipment 24 with both
lines answered 400 "Commerce order item 55 is not on this order"; with the parent alone it
was taken. The integration then answered every refusal as "delivered again later".

## Fix (commerce-erp-integration c84a116, deployed 07:34Z)

A configurable's child line is left out of what an ERP hears (the parent carries it), and
when every ERP that failed refused the request itself (4xx other than 429) the delivery ends
with the ERP's reason on the Admin page's Activity; a down ERP is still asked again.

## Shipped so far
- 2026-10-02  commerce-erp-integration c84a116, deployed to Justrite 07:34Z
- 2026-10-02  docs(handoff): the loop report gains AB-38, AB-57 and the deploy at c84a116 (`38f16e9b8`)
- 2026-10-02  docs(backlog): AB-38 built with two checks open; AB-57 filed and fixed (shipment echoes refused for hours) (`624ee3379`)
