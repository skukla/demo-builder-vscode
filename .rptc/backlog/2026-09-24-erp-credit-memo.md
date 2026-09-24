---
id: AB-26r
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26g]
value: med
status: gated
waiting-on: owner question O5 (credit memo yes/no)
---

# Credit memo and Repeat order — the way back from invoiced and cancelled

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 2 — cross-repo; new Commerce handler.**

## What

`erp-screen-realism` slice 5 / §6.4: a full credit memo against the invoice (9500000001+), invoice status Credited, billing status; new event `be-observer.sales_order_credit_memo_create`, a new handler and Commerce credit-memo call; Repeat order beside the cancelled dead end.

## Verification block (checked by the loop's done gate — §6a of the plan)

Harness journey credit → Commerce credit memo recorded → statuses; refusal texts tested; live in the scratch workspace.

## Shipped so far
