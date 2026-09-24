---
id: AB-26c
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26b]
value: high
status: backlog
---

# Pair-in-a-box: the ERP in-process behind the integration, a fake Commerce in front (T-1)

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 1.**

## What

In the integration repo: the ERP's actions run in-process against `test/helpers/memory-db.js`; the integration's handlers call them directly instead of over HTTP; a fake Commerce records every write and answers from AB-26b's fixtures. Every two-way journey becomes a test that runs in seconds. `demo-erp` is a dev dependency by path.

## Verification block (checked by the loop's done gate — §6a of the plan)

The harness runs the eight-entity journey list (AB-26e) end to end; a failed journey names the entity and the direction; the ledger's revert is asserted after every reset.

## Shipped so far
