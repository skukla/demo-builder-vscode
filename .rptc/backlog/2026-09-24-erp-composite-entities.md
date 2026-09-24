---
id: AB-26a
kind: feature
area: app-builder
parent: AB-26
needs: []
value: high
status: built
---

# Composite-entity research: what a buying organization (and seven others) is made of, record by record

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 3 — research.**

## What

Each concept in the plan's §5a written out on both sides: record, field, type, owner (which system decides it), mirrored today or not, the join. Sources: the Commerce REST and B2B references, the two repos, and SAP's record structure for the counterpart (customer master's three layers, material master views, sales document header and item, credit account). Output `.rptc/research/erp-composite-entities/research.md`. Buying organization first and most carefully.

## Verification block (checked by the loop's done gate — §6a of the plan)

A field table for every §5a row; every field names its owner; every Commerce field is cited from a doc read (not a snippet); the doc lists what could not be established.

## Shipped so far
- 2026-09-24  Two readers out: Commerce native records per composite (REST/B2B refs), SAP counterparts (api.sap.com entities); codebase half to follow
- 2026-09-24  Research written: .rptc/research/erp-composite-entities/research.md — nine concepts on three sides (Commerce REST read by four readers, SAP help.sap.com pages, the two repos), field ownership per row, two SAP name corrections (scales entity A_SlsPrcgCndnRecordScale; credit API API_CRDTMBUSINESSPARTNER_0001), four Commerce events the plan assumed do not exist by those names, seller legal identity readable over REST in neither system
