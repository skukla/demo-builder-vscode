---
id: AB-26w
kind: feature
area: app-builder
needs: []
value: high
status: backlog
parent: AB-26
---

# Business-user settings for the ERP pair — which behaviours a merchant chooses, and where

Slice of [[AB-26]]. Filed 2026-09-25 from the owner's direction after the live order runs:
"settings like this should be configuration settings within the integration that are exposed
to the business user. We need to design those." **Lane 3 first (this design), then lane 1.**

## What exists

The mechanism is built. The integration declares settings in `app.commerce.config.ts`
(`businessConfig.schema`), App Management's business configuration stores them per website
or store view, `src/lib/settings.js` reads and validates them, and the Commerce Admin page's
Mapping tab shows each one on the card of the entity it joins. Eleven settings today:
`orders_send`, `orders_hold_offline`, `orders_confirm_status` (new 2026-09-25, replacing the
impossible "mark Processing on confirm"), `pricing_contract_prices`, `pricing_discount_ceiling`,
and the six `structure_*` settings (sales organisation, order prefix, ownership).

## What is hard-coded today that a business user would expect to choose

Read from the `order/external/*` handlers on 2026-09-25:

| Behaviour | Today | Where |
|---|---|---|
| Notes the ERP leaves on an order are visible on the storefront | always (`is_visible_on_front: 1`) | updated, shipment-created, invoice-created, cancelled, hold |
| The customer is emailed about ERP notes, shipments, invoices | never (`is_customer_notified: 0`, `notify: false`) | the same handlers |
| An ERP credit rejection | cancels the Commerce order (off hold first) | cancelled/index.js |
| An ERP credit hold | puts the Commerce order On Hold | hold/index.js |
| An ERP invoice | creates a Commerce invoice with `capture: true` (payment received) | invoice-created |
| Which ERP changes write back to Commerce | all of them: price and name, stock per source, credit limit, block | product-, stock-, company-backoffice |
| The cancel reason text on a rejected order | fixed English | cancelled |

## Design (recommendation — the owner decides which rows ship)

**Principle.** A setting is something Commerce lets a merchant choose and that changes what a
shopper or an Admin user sees. Technical behaviour (timeouts, retries, priority events,
idempotency) stays in code. Each setting declares its default so an instance with nothing set
behaves as today, and each one sits on the Mapping card of the entity it affects.

Recommended additions, in the schema's existing shape (boolean / list / text, per website):

1. `orders_notes_visible` (boolean, default on) — ERP notes show on the storefront order page.
2. `orders_notify_customer` (boolean, default off) — Commerce emails the customer for ERP
   shipments, invoices and notes (`notify`, `is_customer_notified`).
3. `orders_on_credit_reject` (list: `cancel` | `hold`, default `cancel`) — a rejected credit
   hold cancels the order, or leaves it On Hold with the reason as a note.
4. `orders_hold_in_commerce` (boolean, default on) — an ERP credit hold puts the Commerce
   order On Hold; off means a note only.
5. `orders_invoice_capture` (boolean, default on) — the ERP's invoice captures payment in
   Commerce; off creates the invoice without capture (for a payment method that captures
   elsewhere).
6. `writeback_products`, `writeback_stock`, `writeback_credit` (booleans, default on) — which
   ERP changes are written onto Commerce. Off means the ERP's change is recorded and shown,
   Commerce is not touched (the ledger then has nothing to revert for that entity).

Not recommended as settings: the cancel reason text (a label, not a behaviour); the partner
refresh interval and Commerce timeout (technical); anything the ERP decides (credit rules,
numbering) — those are the ERP's own settings and already live on its Settings screen.

**Where each is configured.** Same three places as today, or it does not exist: the schema
in `app.commerce.config.ts`, `TEXT_RULES`/defaults in `src/lib/settings.js`, and the Mapping
card's `settings` list in `mapping-view.js`; the preview stub mirrors the schema. Each new
setting ships with the handler change, a sender test, a box journey where a Commerce write
changes, and a row in `docs/demo-setup.md` if the SC must prepare anything for it.

**Product questions for the owner:** which of rows 1–6 the demo wants; whether the
write-back switches are per entity (three settings) or one; whether `orders_on_credit_reject`
should also offer "cancel and notify the customer".

## Verification block

Every shipped setting: declared in the three places, defaulted to today's behaviour, tested at
the sender with the argument asserted, shown on its Mapping card, and (if it needs Admin
preparation) in the setup guide.
