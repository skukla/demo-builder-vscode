---
id: AB-66
kind: fix
area: app-builder
needs: []
value: med
status: backlog
parent: AB-26
---

# A checkout invoice's event arriving late could tell an ERP to invoice an order it has not confirmed

Found 2026-10-03 while fixing card-paid invoicing (integration 8207926), not tested. With
Authorize and Capture, Commerce invoices the order at checkout and raises Invoice Saved. Today
that event is skipped because the order has no ERP number yet. If it is delivered AFTER the
order reaches the ERP (Commerce eventing can deliver late), the integration would pass the
invoice to the ERP for an order the ERP has not confirmed; the ERP refuses ("Confirm the order
before invoicing it"), and the event fails.

## Recommendation

The integration should recognise a checkout invoice (the order's payment was captured at
checkout and this invoice covers it) and never pass it to an ERP: the ERP records the payment
from the order's payment reference already (AB-26s card half). Pin it with a box journey that
delivers the checkout invoice event after the order is sent.
