---
id: AB-26r
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26g]
value: med
status: gated
waiting-on: the several-ERPs build (owner froze ERP feature growth after contracts, 2026-09-26)
---

# Credit memo and Repeat order — the way back from invoiced and cancelled

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 2 — cross-repo; new Commerce handler.**

## What

`erp-screen-realism` slice 5 / §6.4: a full credit memo against the invoice (9500000001+), invoice status Credited, billing status; new event `be-observer.sales_order_credit_memo_create`, a new handler and Commerce credit-memo call; Repeat order beside the cancelled dead end.

## Verification block (checked by the loop's done gate — §6a of the plan)

Harness journey credit → Commerce credit memo recorded → statuses; refusal texts tested; live in the scratch workspace.

## Shipped so far
- 2026-09-24  Ungated 2026-09-24: the owner answered O5 yes (full credit only) and O4 terminal (Repeat order, no un-cancel). Still needs AB-26g's live proof before the Commerce credit-memo call is built on it
- 2026-09-26  Frozen (owner, 2026-09-26): ERP feature growth stops after contracts (AB-26z) until several ERPs land; every ERP will run the same baseline code. See .rptc/plans/several-erps/overview.md §4.
