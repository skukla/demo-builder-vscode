---
id: AB-26s
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26b, AB-26r]
value: med
status: active
---

# Order to cash — the payment leg (incoming payment, open items, company balance)

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 2.**

## What

Commerce → ERP: a captured invoice payment becomes an ERP incoming payment that clears the open item; the ERP gains open items per customer, payments, overdue by terms. ERP → Commerce: a payment posted in the ERP for an on-account order reimburses the company's credit balance — ledgered like the credit limit. The exact Commerce calls come from AB-26b; a leg that does not exist on the target backend stops the slice at the leg that does, and says so.

## Verification block (checked by the loop's done gate — §6a of the plan)

Harness journeys both legs; ledger revert of the reimbursement on reset; headless checks on the customer's receivables view.

## Shipped so far
- 2026-09-25  Owner 2026-09-25: first concrete job. When Commerce charged the card at checkout, the order sent to the ERP carries 'paid at checkout' (amount, payment reference), so the ERP's later invoice is matched to that payment instead of opening an unpaid debt. Also: an ERP cancel of an order paid at checkout needs a Commerce credit memo (refund), not a cancel; check the integration handles it. See .rptc/research/erp-order-to-cash-capture.
- 2026-09-26  Frozen (owner, 2026-09-26): ERP feature growth stops after contracts (AB-26z) until several ERPs land; every ERP will run the same baseline code. See .rptc/plans/several-erps/overview.md §4.
- 2026-09-27  2026-09-27  Owner: yes, count unpaid invoices in credit exposure. Measured on Bodea: Kukla Studios owes 180 on invoice 9000000001 and the ERP shows exposure 0, because demo-erp lib/partners.js counts only orders not yet invoiced (created/confirmed/shipped), while its own comment says open receivables plus open orders. With this slice, exposure = open orders + open (unpaid) invoices, and an incoming payment clearing the open item is what brings it down
- 2026-09-28  2026-09-28 freeze lifted (owner: 'yes'; several ERPs landed and proven live on Bodea).
- 2026-10-02  Stale waiting-on removed 2026-10-02: the freeze it named was lifted 2026-09-28 (AB-26r log); several ERPs are live on Justrite
- 2026-10-02  Design written for the owner (2026-10-02): .rptc/plans/several-erps/payment-leg-design.md. Verified: Commerce reimburses company credit with POST companyCredits/:id/increaseBalance operationType 4 (developer.adobe.com credit-manage); the ERP drops an invoiced order from exposure though unpaid (demo-erp lib/partners.js OPEN); the integration sends no payment info; Justrite offers no card method, so the paid-at-checkout half cannot be shown there. Three product questions and two live tests listed before S1
- 2026-10-02  docs(handoff): order the queue (`2b36c7d5f`)
- 2026-10-02  docs(handoff): AB-26s and AB-26w join the owner's queue (`337e11683`)
- 2026-10-02  docs(plans): the payment leg designed for review (AB-26s); AB-26w's notify check is not provable on Justrite (`c0d925289`)
- 2026-10-02  Owner 2026-10-02: question 1 — the next Reset ERPs starts clean (no invoice seeded unpaid); question 2 — build the on-account half first (S1-S3, S5), then add a card method after research into how real ERPs handle card payments (in progress). Question 3 (partial payments) not answered; building with the recommendation (allowed, reimbursed for the amount paid) unless the owner says otherwise
- 2026-10-02  Card half researched (2026-10-02): .rptc/research/erp-card-payments/research.md. SAP connects to Cybersource through the Digital Payments add-on; Business Central has no Cybersource out of the box and records shop-captured payments against the invoice; the ERP holds a payment reference, never the card. Recommendation: the Business Central-style flow (Commerce captures; the ERP applies a payment carrying the gateway reference)
- 2026-10-02  Owner 2026-10-02: the card half follows flow 1 (Business Central style) — Commerce captures the card (Authorize and Capture at checkout, or its own invoice); the order reaches the ERP marked paid with a payment reference (method, gateway transaction id, brand, last four, amount, never the card); the ERP applies that payment to its invoice so no open item remains. Needs a card payment method on the demo store first
- 2026-10-02  On-account half LIVE on Justrite 2026-10-02 (S1-S3): demo-erp a8d5b35 (open items, payments, exposure, screen; contract v14), commerce-erp-integration 4e2f81b (reimburse, once, reverted on reset; app 0.13.0). Order 5000000010: Justrite ERP partial payment 100.00 and Accuform ERP full 42.42 reimbursed Northgate 142.42 to the cent, each on the credit history as Paid in <ERP>; invoices read partly paid (174.86 open) and paid. The live run caught: each part was sent with the whole order total (6ae0b4a), and that fix first read a field the order event lacks so totals came out 0 (210e5ef). Known gaps: shipping belongs to no ERP part, so it has no ERP open item; a paid invoice credited in full keeps no credit balance in the ERP; test orders 5000000008/9 carry wrong ERP invoice totals
- 2026-10-02  docs(backlog): AB-26s on-account payments proved live; the part-total bug and its fix recorded (`57f2edec0`)
- 2026-10-02  docs(backlog): AB-26s — the owner chose flow 1 for card payments (Commerce captures, the ERP records the payment) (`90aa76c8f`)
- 2026-10-02  docs(research): how a real ERP handles a web order paid by card (AB-26s) (`033c5e324`)
- 2026-10-02  docs(plans): payment leg live tests answered — reimburse and its undo work on Justrite; owner decisions (`2102df9a5`)
- 2026-10-02  feat(setup): an optional card payments step (AB-26s) (`07edf17c4`)
