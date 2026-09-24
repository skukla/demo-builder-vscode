---
id: AB-26b
kind: feature
area: app-builder
parent: AB-26
needs: []
value: high
status: active
---

# Commerce API inventory and validation — every call the programme needs, proven to exist, captured as fixtures

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 1 — the loop makes the live read-only calls itself (CLI signed in; reads are inside the rails).**

## What

One document (`commerce-erp-integration/docs/commerce-api-inventory.md`): every REST endpoint, Commerce event, webhook, Admin UI SDK extension point and App Management business-config feature the programme needs, one row per API with the slice that needs it. Each validated to exist on the backend the demo runs on (Adobe Commerce as a Cloud Service and PaaS are not guaranteed identical) by a read-only call against the live instance, the real request and response captured to `test/fixtures/commerce/` (ADR-016 contract tier). On the ERP side, `contract/erp-contract.json` grows from key lists to full request/response shapes at version 2, SAP's terms in the descriptions (sold-to, sales organisation, delivering plant) without renaming fields that work.

## Verification block (checked by the loop's done gate — §6a of the plan)

A test in the integration that every fixture matches what the code sends and reads; `contract.test.js` in both repos green at version 2; the inventory names, for every API a later slice uses, the fixture that holds its contract. An API that does not exist on the target backend is a finding on the slice that needs it, not a silent gap.

## Shipped so far
- 2026-09-24  Inventory drafted from the code (commerce-erp-integration docs/commerce-api-inventory.md, loop branch): 18 calls used today, 12 to validate, 9 events, 4 webhooks, 3 Admin features; live validation blocked on aio app use -g → Adobe Console API 503, retrying
