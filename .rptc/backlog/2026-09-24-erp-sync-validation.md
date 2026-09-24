---
id: AB-26e
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26c]
value: high
status: backlog
---

# Sync validation — every entity, both directions, proved (V)

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 1 for the harness journeys; the live baseline is authorised (owner, 2026-09-24) and runs on the demo instance.**

## What

For each row of the entity coverage matrix (`.rptc/research/erp-bidirectional-review/`): a harness journey (change in Commerce → see in ERP; change in ERP → see in Commerce; reset → undone) and the same journey written as a live script (`docs/sync-validation.md`) with the expected result beside each step. Runs first as a baseline against today's code, again after AB-26f–h and AB-26j, and before every release. Products first.

## Verification block (checked by the loop's done gate — §6a of the plan)

Every matrix row has a journey; the baseline's failures match the matrix's gaps (G1–G5) and nothing else; the live run's results are recorded per row with the date.

## Shipped so far
