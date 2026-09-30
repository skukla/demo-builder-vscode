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

## How the call happens

A Commerce webhook at order placement, `required: true`, answered by a Runtime action that
asks the ERP. The mechanism is cart pricing's, and the setting is the difference: pricing is
`required: false` because a missing discount is survivable; a credit check that nobody
answers must not let the order through (plan decision 26).

Accept deliberately: an ERP that does not answer then stops orders. There is no longer an
offline switch to rehearse that with (decision 24), so it is tested by pointing the
integration at an ERP that is not deployed.

Do not confuse this with `orders_hold_offline`, which decides what Commerce does with an
order the ERP could not TAKE, after it was placed. This one decides whether it is placed.

## First step: three cheap checks

1. Which event at order placement can refuse with a message a shopper reads, on Cloud
   Service (`GET /V1/webhooks/supportedList`, or the Admin's Webhooks list).
2. Whether its payload carries the company, or only the customer — credit belongs to the
   company.
3. Whether the synced limit stays as a fast path (Commerce refuses the obvious cases with no
   round trip) or becomes display only.

## Not established

(The three checks above are the unknowns worth spending an hour on. These are the ones that
need a decision rather than a lookup.)
- What happens to an order already placed when the ERP later rejects it; a real integration
  has an order-hold state, and this one does not.

## Shipped so far

- 2026-09-28  Owner decision: the live credit check is one call per owning ERP at checkout (as the order is placed), never on each cart change; each has a time limit, and an ERP that cannot answer accepts the order and its part waits (the order is Partially Held). See .rptc/plans/several-erps/pricing-and-live-checks.md.
- 2026-09-28  Owner decision (2026-09-28): when an ERP refuses credit, checkout stops before the order is placed, with a message naming the brand ('This order exceeds your credit with Brand B'); the buyer removes that brand's lines or pays another way. Availability (AB-19) deliberately differs: it never blocks. An ERP that cannot answer at all still accepts the order and its part waits.
- 2026-09-30  2026-09-30 (loop) ERP SIDE BUILT (demo-erp 1ee83e1). POST partners/:id/credit-check {net,currency?} reads live exposure and answers approved/held with reason + numbers (limit/exposure/available). Read-only — creates nothing, so checkout can refuse BEFORE committing (createOrder still creates-and-holds, §6.1). Pure assessCredit reuses decide(); currency defaults USD at the boundary like createOrder. demo-erp 389/389. Mirrors AB-19's ATP endpoint. REMAINING (edge, deploy-gated): the Commerce placement flow calling this (the blocking-vs-soft-fail decision when the ERP is unavailable is the open product call in this item), exact wiring + a deploy to prove.
- 2026-09-30  Owner decision (2026-09-30): hard-stop checkout only on a DEFINITIVE 'no' from the ERP (over-limit / blocked) — the punchy demo scene (refuse, raise the limit on the ERP screen, place again). On NO ANSWER (timeout/ERP down), do NOT hard-stop and do NOT silently accept: capture the order and HOLD it for manual credit review — matches how the ERP holds an over-limit order rather than dropping it (sales protected, risk protected). Differs from AB-19 availability only in the fallback: availability accepts-and-promises, credit accepts-and-holds. Wire this into the Commerce placement flow when built.
- 2026-09-30  2026-09-30 COMMERCE-SIDE CORE BUILT (integration feature/live-checks-at-checkout 206fbde). src/lib/placement-checks.js: assessPlacement asks each owning ERP once for credit (partners/:id/credit-check with the part's net) + availability; creditVerdict blocks only on a definitive 'held', fail-open on unreachable; any owning ERP's denial blocks the whole placement. 8/8 tests; 948 suite. Design: .rptc/plans/live-checks-at-checkout/design.md (owner rule = A, refuse at the door). REMAINING: the delivery — a web:'yes' placement webhook action wiring the real per-ERP erpRequest calls, the webhooks entry in app.commerce.config.ts (the placement webhook_method must be confirmed against Adobe's Commerce-webhooks method list — could not be verified without a deploy), version bump + manifest, action tests; then live proof (over-limit refused, raise limit, goes through).
