---
id: AB-26h
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26b]
value: med
status: backlog
---

# Per-source stock changes reach the ERP, plus the small gaps (product delete, credit truth, currency)

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 1.**

## What

G2: a non-default source's quantity edited in Commerce reaches the ERP (an MSI source-item event if one exists on the target backend, else the minute refresh re-reads changed SKUs). G1: a product deleted in Commerce leaves the ERP. G3: the ERP's exposure is the demo's truth, stated on the customer card (owner's decision assumed as recommended; confirm). G5: an ERP currency, read from the mapped website's Store Information (with AB-26j) or a setting until then.

## Verification block (checked by the loop's done gate — §6a of the plan)

Harness journeys for each gap; fixture-backed tests for the new reads; the customer card states the truth rule.

## Shipped so far
