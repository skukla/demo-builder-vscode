---
id: AB-19
kind: feature
area: app-builder
parent: AB-9
needs: []
value: med
status: backlog
---

# Ask the ERP live whether it can ship this, and when

Filed 2026-09-17 from the owner's question about where a B2B integration really calls its
ERP live. "Can I have 500 by Friday" is the most ERP-flavoured question in B2B, and the
integration answers it today from stock the ERP synced into Commerce earlier — a number
that can be hours old, and that says nothing about a promise date.

## What exists to build on

Cart-time pricing ALREADY calls the ERP live, and the shape is proven:
`app.commerce.config.ts` declares two `out_of_process_totals_collector` webhooks
(`erp_contract_price`, `erp_discount_ceiling`), both `required: false`, Commerce warning
at `soft_timeout: 1000` and giving up at `timeout: 5000`, with the integration's own call
to the ERP capped at 3s (`webhook/item-prices/index.js`) so a cold action has room and a
slow one falls back to Commerce's own prices. An availability check is that mechanism
pointed at a different question.

## What it would do

- A webhook Commerce calls at cart or checkout, answered by a Runtime action that asks the
  ERP whether each line can be promised, and by when.
- The ERP already holds per-product stock; the promise date is the new part. A real SAP
  answers from available-to-promise; this ERP can answer from stock plus a lead time per
  product or per business partner.
- Soft failure like the pricing webhooks: no answer means Commerce's own stock message,
  never an error in front of a shopper.
- On the storefront it is whatever Commerce renders for it. A date needs its own label,
  which is a storefront component in a block library, not a custom drop-in (2026-09-17:
  drop-ins ship as one coordinated set and bolting one on blank-pages the site).

## Not established

- Which Commerce extension point carries an availability answer at cart time, and whether
  it can change a line's message rather than only block checkout. The totals collector
  modifies prices; its equivalent for availability was not checked.
- Whether a promise date can reach the storefront's order review without a mesh change.
- The demo scene. The owner's framing is data flowing both ways with the ERP appearing to
  be the master; a promise date is that story's strongest moment, but the script for it has
  not been written.
