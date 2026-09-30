---
id: AB-19
kind: feature
area: app-builder
parent: AB-9
needs: []
value: med
status: active
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

## How the call happens

A Commerce webhook, the same mechanism cart pricing already uses, with one setting
different: `required: true`. Adobe's own documentation uses this exact example — check
stock with an external system when a shopper adds to the cart, `required="true"`, a short
timeout and a `fallbackErrorMessage` the shopper reads; if the external system says no,
Commerce interrupts the action (developer.adobe.com/commerce/extensibility/webhooks, read
2026-09-17). Our side is a Runtime action that asks the ERP and answers.

Decided with it (plan decision 26): the ERP is never called from the browser or the mesh,
and the answer reaches the shopper as Commerce data.

## First step: three cheap checks

1. The exact event name on Cloud Service. The Admin lists them under System > Webhooks, and
   `GET /V1/webhooks/supportedList` answers the same; PaaS and SaaS differ, so read the list
   rather than copying a name from a doc.
2. Whether the payload carries what the ERP needs to answer — SKU, quantity, and the buyer's
   company.
3. What a shopper sees when a required webhook refuses during checkout: the wording, and
   where it appears.

## Not established

(The three checks above are the lookups. These need a decision.)

- Where a promise date lands in Commerce so the storefront can read it — an order attribute,
  a quote field, something else. The ERP's order number already has a home; this does not.
- Whether the check runs on add-to-cart, as Adobe's example does, or once at checkout. The
  first is chattier and reads better on stage; the second is one call per order.
- The demo scene. The owner's framing is data flowing both ways with the ERP appearing to
  be the master; a promise date is that story's strongest moment, but the script for it has
  not been written.

## Shipped so far

- 2026-09-17  docs(backlog): AB-19 and AB-20 — the two live ERP calls a real B2B integration makes (`43164d8db`)
- 2026-09-17  docs: how the ERP reaches a shopper, and where its live calls go (`64fc77a37`)
- 2026-09-28  Owner decision: the live availability check follows the same rule as the credit check (AB-20): one call per owning ERP at checkout, time-limited, with the fallback of accepting the order. See .rptc/plans/several-erps/pricing-and-live-checks.md.
- 2026-09-28  Owner decision (2026-09-28): when an ERP cannot supply the quantity now, checkout does not block. It shows that ERP's promised delivery date for its lines, the order goes through, and that part ships later. This rests on the ERP offering a delivery date (available-to-promise); a real ERP does, so the mock ERP must too, and that may need a new feature in it (check what SAP and Business Central answer). Credit refused (AB-20) is a separate decision, still open.
- 2026-09-30  2026-09-30 (loop) ERP SIDE BUILT (demo-erp a5d5abd). POST products/availability answers ATP per cart line — available now (on hand less committed) ships today, a shortfall after the product's lead time; promiseLine pure core + default/per-product lead time. demo-erp 382/382. REMAINING (edge, deploy-gated): the Commerce required:true webhook + Runtime action calling this, the three cheap checks (exact event name via supportedList, payload contents, shopper wording), and where the promise date lands in Commerce (an owner decision).
- 2026-09-30  2026-09-30 COMMERCE-SIDE CORE BUILT alongside AB-20 (same assessPlacement, 206fbde): availability asked per owning ERP (products/availability) and reported as promises; never blocks — a throw leaves a null promise. REMAINING: record each ERP's promise date on its part during routing (the parts record / order view), with the placement action.
