---
id: AB-20
kind: feature
area: app-builder
parent: AB-9
needs: []
value: med
status: backlog
---

# Ask the ERP live whether the account has the credit, as the order is placed

Filed 2026-09-17, from the same conversation as [[AB-19]]. The ERP owns the credit limit
and the integration writes it onto the Commerce company, so Commerce decides against a
number it was told earlier. In a real B2B integration the credit decision is the ERP's,
taken at the moment of the order, because the ERP knows what else that account has
committed since.

## What exists to build on

The integration already writes company credit limits and blocks into Commerce, and its
`erp/detach` undoes exactly those writes on removal — so the ledger of what it changed
exists. Cart-time pricing already calls the ERP live through the totals-collector webhooks
(see [[AB-19]] for the timeouts and the soft-failure contract), which is the same shape a
credit check would take at order placement.

## What it would do

- At order placement, ask the ERP whether this business partner can carry this order.
- A refusal has to be a refusal the shopper can act on ("this order exceeds your credit
  limit"), which means it cannot be a soft-failing webhook the way pricing is: an
  unanswered credit check must not silently let the order through. That is the one place in
  this integration where the ERP being unavailable should probably STOP something — worth
  deciding deliberately rather than by default.
- The demo scene writes itself: place an order over the limit and watch it refused, raise
  the limit on the ERP's own screen, place it again and watch it go through. Nothing else
  in the demo shows the ERP overruling Commerce in front of the audience.

## Not established

- Which Commerce extension point runs at order placement and can refuse with a message —
  the observer/webhook that fits, and whether it reaches the storefront's checkout as
  something a shopper reads.
- Whether the synced limit stays as the fast path (Commerce refuses obvious cases without
  a round trip) with the live check as the authority, or whether the sync becomes display
  only.
- What happens to an order already placed when the ERP later rejects it; a real integration
  has an order-hold state, and this one does not.
