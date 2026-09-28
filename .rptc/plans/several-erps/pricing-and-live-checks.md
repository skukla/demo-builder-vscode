# Several ERPs: what is synced ahead and what is asked live

Agreed with the owner, 2026-09-28 ("I agree with those calls and they should be documented").
The goal is the integration a client would be recommended, so the rule is what real B2B
integrations do. Backlog: [[AB-26z]] (prices), [[AB-20]] (credit), [[AB-19]] (availability).

## The rule

**Synced ahead into Commerce, never asked on each cart change:**

- The catalog, list prices and each company's contract prices. Each ERP publishes its own
  products' prices into the company's one shared catalog, when the fill runs and whenever the
  ERP changes a price ([[AB-26z]]). The cart, the listing and the product page all price from
  Commerce, so the buyer sees the contract price everywhere and checkout never waits on an ERP.
- Stock, pushed from each ERP as it changes (already built).

**Asked live, once per owning ERP, at checkout (as the order is placed):**

- **Credit:** can this company carry this order with this ERP ([[AB-20]]).
- **Availability:** can this ERP promise this quantity ([[AB-19]]).
- **Final price confirmation** only where a client's prices cannot be synced ahead (SAP offers
  an order simulation call for this). Not built for the demo; named so the pattern is complete.

**Every live call has a time limit and a fallback.** An ERP that is slow, down or refusing
accepts the order: its lines keep Commerce's price, the order goes through, the order is
Partially Held naming that ERP, and its part is sent when it is back (Re-send on the
integration's order view). The other ERPs' parts go at once. So one brand's ERP being down never
stops a buyer from checking out (vignette 6 is true as told).

## What changes from today

- The two cart webhooks (contract price, discount ceiling) are removed ([[AB-26z]]): today they
  call the ERPs on every cart change, twice. A discount limit is the ERP's to enforce on the
  order, as a real ERP does, not the cart's.
- The order-time checks replace them: one call per owning ERP, at placement.

## Why, in one line each

- Checkout depends on Commerce only, which is up whenever the store is.
- Contract prices show on the listing and product page, not only in the cart.
- The decisions that must be current (credit, availability) are asked once, when they matter.

## Caveat

This is common practice as understood on 2026-09-28, not checked against a source. Before it
goes on a slide, read Adobe's and SAP's own descriptions (Adobe: B2B shared catalogs and
webhooks; SAP: order simulation, credit management, available-to-promise) and cite them here.
