---
id: AB-26w
kind: feature
area: app-builder
needs: []
value: high
status: gated
parent: AB-26
waiting-on: the several-ERPs build (owner froze ERP feature growth after contracts, 2026-09-26)
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

## Shipped so far

- 2026-09-25  Owner 2026-09-25: row 5 (invoice capture) is in scope as one setting, 'Capture payment in Commerce: when the ERP invoices (default) / when the ERP ships'. Capture at ERP confirmation dropped: no ERP or connector found does it (.rptc/research/erp-order-to-cash-capture). Checkout capture is Commerce's own payment setting; the integration must record an already-invoiced order's ERP invoice as a comment, not fail (untested). Offline/on-account methods always invoice without a real capture.
- 2026-09-25  Owner 2026-09-25, superseding the earlier entry today: invoice capture is NOT a setting. The ERP decides when it bills (consultant configuration; ours bills after shipment); the integration follows: an ERP invoice creates the Commerce invoice with capture (bookkeeping only for on-account). Fixed in code, shown read-only on the Mapping tab's Order card, with Commerce's own charge timing beside it if readable (unverified). 'When the ERP ships' dropped: it would bill in Commerce before the ERP does, and collapses into the same thing once the ERP bills per shipment (AB-26v). Orders already invoiced at checkout: record the ERP invoice as a comment (to build and test).
- 2026-09-25  Owner 2026-09-25, D1 closed: NO new settings. Test applied to each row: a setting only where two merchants would reasonably choose differently. Notes visibility: fixed rule, ERP notes are internal (never visible on the storefront; the buyer sees status, shipments and invoices through Commerce). Customer email: the integration always asks Commerce to notify, as an Admin user ticking 'Email a copy' would, and Commerce's own Sales Emails configuration decides (verify on the sandbox that disabled Sales Emails suppress an API notify before switching; demo setup guide turns them off). Credit rejection: fixed rule, an ERP rejection cancels the Commerce order (the 'wait' case is the hold staying in place). Credit hold: fixed rule. Invoice capture: mapping (earlier entry). Write-back switches: left out. Refused-change notification goes to Commerce Admin's notification inbox if an app may write to it (unverified), never an email service. Every fixed rule is stated on its Mapping card.
- 2026-09-25  D1 applied (commerce-erp-integration 388f116): every ERP note on a Commerce order is staff-only (is_visible_on_front 0). The notify change waits on the sandbox check that disabled Sales Emails suppress an API notify.
- 2026-09-26  Frozen (owner, 2026-09-26): ERP feature growth stops after contracts (AB-26z) until several ERPs land; every ERP will run the same baseline code. See .rptc/plans/several-erps/overview.md §4.
