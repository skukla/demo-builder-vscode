---
id: AB-26v
kind: feature
area: app-builder
parent: AB-26
needs: []
value: med
status: backlog
---

# Reconciling partial invoices against one Commerce order — a customization opportunity

Filed 2026-09-24 from the owner's answer to O5: the ERP credits an invoice in full only
(AB-26r), and the case that decision leaves open is to be DOCUMENTED as an opportunity for
additional customization, alongside order routing, not built into the pair.

## The case

Commerce can invoice an order in parts (one invoice per shipment, or per line), but once an
order is partly invoiced it has no way to take further payment against the remainder; the
ERP therefore invoices the whole order once, after every line has shipped or been closed
(`lib/fulfilment.js createInvoice`, owner decision 2026-09-23). An ERP that invoices per
shipment (SAP's delivery-related billing does) would produce several ERP invoices against
one Commerce order, and nothing today reconciles them: which Commerce invoice matches
which ERP invoice, what the running invoiced total is, what remains open, and how a credit
against one of them lands.

## What the write-up should cover

- The shapes on each side: Commerce invoices with `capture`, per-item invoicing, the order
  chain endpoints (`POST /V1/orderChain/{orderId}/invoice`, experimental on Adobe Commerce as
  a Cloud Service, per the release notes), and the ERP's one-invoice-per-order rule.
- A reconciliation design: an invoice-level join (ERP invoice number ↔ Commerce invoice id)
  beside the order-level `ext_order_id`, a running open amount per order, and how a partial
  credit memo reconciles.
- Where it would live: a customization on the pair (a new event and handler) or a sibling
  integration, the way routing is a sibling.
- What the demo says today: full invoice, full credit, and this document as the "and if
  your ERP bills per delivery" answer.

Write it as `commerce-erp-integration/docs/partial-invoicing.md`, linked from the walk-through's
order section and from the routing research, once AB-26r has shipped its full-credit flow.
