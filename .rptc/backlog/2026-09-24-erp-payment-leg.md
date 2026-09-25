---
id: AB-26s
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26b, AB-26r]
value: med
status: backlog
---

# Order to cash — the payment leg (incoming payment, open items, company balance)

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 2.**

## What

Commerce → ERP: a captured invoice payment becomes an ERP incoming payment that clears the open item; the ERP gains open items per customer, payments, overdue by terms. ERP → Commerce: a payment posted in the ERP for an on-account order reimburses the company's credit balance — ledgered like the credit limit. The exact Commerce calls come from AB-26b; a leg that does not exist on the target backend stops the slice at the leg that does, and says so.

## Verification block (checked by the loop's done gate — §6a of the plan)

Harness journeys both legs; ledger revert of the reimbursement on reset; headless checks on the customer's receivables view.

## Shipped so far
- 2026-09-25  Owner 2026-09-25: first concrete job. When Commerce charged the card at checkout, the order sent to the ERP carries 'paid at checkout' (amount, payment reference), so the ERP's later invoice is matched to that payment instead of opening an unpaid debt. Also: an ERP cancel of an order paid at checkout needs a Commerce credit memo (refund), not a cancel; check the integration handles it. See .rptc/research/erp-order-to-cash-capture.
