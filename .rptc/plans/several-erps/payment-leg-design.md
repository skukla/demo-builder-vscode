# Order to cash, the payment leg (AB-26s): design for the owner's review

Written 2026-10-02 by the order-to-return loop. Design only, nothing built. It follows the
owner's decisions recorded on AB-26s (2026-09-25 and 2026-09-27) and the research in
`.rptc/research/erp-order-to-cash-capture/research.md`.

## What is true today (read 2026-10-02)

| Fact | Source |
|---|---|
| The mock ERP counts credit exposure as the net of orders not yet invoiced (`OPEN = created, confirmed, shipped`). An invoiced order leaves exposure the moment it is invoiced, paid or not, though the comment above it says "open receivables plus open orders" | demo-erp `lib/partners.js` `exposureOf`, `OPEN` |
| The ERP has no open item, no incoming payment and no "paid" state on an invoice | demo-erp `lib/fulfilment.js` (`invoice.status` is `open`, or `credited` since contract v13) |
| The integration sends the ERP nothing about how an order was paid | commerce-erp-integration `src/lib/order-sync.js` (no payment field) |
| Commerce gives a company's credit back with `POST /V1/companyCredits/:creditId/increaseBalance`, `operationType` 4 (Reimbursed), `value`, `currency`, optional `comment` and `options.purchase_order` / `options.order_increment`; `decreaseBalance` with 4 takes it back; each lands in the credit history | developer.adobe.com/commerce/webapi/rest/b2b/credit-manage/ (read 2026-10-02) |
| An order paid on account already moves the company's balance at placement and back on a credit memo (live: Northgate's balance moved by each test order and by each credit memo) | Justrite, 2026-10-02 |
| Justrite's checkout offers only Payment on Account and Check / Money order: no card method, so "paid by card at checkout" cannot be shown on this store as configured | `carts/73/shipping-information` answer, 2026-10-02 |

## The design

**What entity this is.** Two new ERP documents, both standard in SAP and Business Central:
an **open item** per invoice (what the customer owes on it, due by the payment terms the
customer already has, NET30 for Northgate) and an **incoming payment** that clears one or
more open items. They are the ERP's own records (it is the master of receivables); Commerce
does not hold them. Owned by demo-erp, beside invoices and credit memos.

**Exposure becomes what the owner decided:** open orders plus open items (invoiced, unpaid).
A credit memo reduces the open item it credits; a payment clears it.

**The payment, ERP → Commerce (the on-account case, showable on Justrite).** When the ERP
posts an incoming payment for an invoice of an order paid on account, the integration
reimburses the company in Commerce: `increaseBalance` with `operationType` 4, the paid
amount, the order number in `options.order_increment`, the ERP's payment number in the
comment. Keyed by the ERP's payment number (a redelivered event reimburses nothing twice),
ledgered like the credit limit so the ERP reset can revert it with `decreaseBalance` 4. With
several ERPs each ERP posts payments against its own invoices; each reimburses its own amount.

**Paid at checkout, Commerce → ERP (the card case; owner 2026-09-25).** An order whose payment
Commerce captured at checkout reaches the ERP marked paid (amount, payment reference), so the
ERP opens no open item for its invoice. Not showable on Justrite until a card method exists.
An ERP cancel of such an order needs a Commerce credit memo (refund), not a cancel: the
credit-memo path built for returns (AB-26r) is the writer it reuses.

**Rejected.** Reimbursing at ERP invoice time (the debt has not been paid; the balance would
lie). Keeping receivables in Commerce (Commerce has no open items; the ERP is the master of
what is owed). A Demo Builder button that "marks paid" (a demo control that hides the ERP's
own document; the payment belongs on the ERP's screen).

## Product questions (recommendation first)

1. **Exposure counts unpaid invoices from the day this ships.** Every existing invoice in an
   ERP is then unpaid and counts. Recommended: at the next Reset ERPs the fill seeds nothing
   as unpaid (a fresh ERP has no history), so only new invoices count. Owner already said yes
   to the rule (2026-09-27); this is about the existing test data.
2. **A card method for the demo store** (for the paid-at-checkout half). Recommended: build
   and show the on-account payment first; add a card method only if the client's demo
   needs card payment.
3. **Partial payments** (paying half an invoice). Recommended: allowed in the ERP (standard),
   reimbursed in Commerce for the amount paid.

## Live tests before building

| Test | Question |
|---|---|
| P-T1 | `increaseBalance` with `operationType` 4 on Justrite: accepted, and visible in Customers → Companies → the company's credit history as Reimbursed; then `decreaseBalance` 4 takes it back (the reset's undo) |
| P-T2 | The credit history row's `options.order_increment` and comment: shown in Admin? |

## Slices

| Slice | Repo | Done when |
|---|---|---|
| S1 | demo-erp | Open items per invoice, incoming payments clearing them, exposure = open orders + open items; a payment event (contract v14) |
| S2 | commerce-erp-integration | The payment event reimburses the company in Commerce, once per ERP payment, ledgered and reverted on reset |
| S3 | demo-erp | Screens: the customer's open items, Post incoming payment, the invoice showing paid |
| S4 | both | Paid at checkout (when a card method exists) |
| S5 | both | Live on Justrite and a walk-through row: invoice, pay in the ERP, the company's credit back in Commerce |
