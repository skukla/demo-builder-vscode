---
id: AB-26m
kind: feature
area: app-builder
parent: AB-26
needs: [AB-26j, AB-26g]
value: high
status: backlog
---

# The entity map — the Commerce Admin page where the settings are the mapping

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 2 — the App Management form rendering needs a person to look; everything else is testable.**

## What

One card per composite entity (plan §5a), two systems side by side, the pieces of each as rows, the join drawn as a connector with its setting editable on it, ownership as arrow direction, sync state per row (from AB-26g's per-direction records), a link into the ERP's document. The existing switches move onto their cards. A small read on the pair answers 'what do you hold for company / SKU / order X'.

## Verification block (checked by the loop's done gate — §6a of the plan)

Component tests on the mapping view with fixtures for each card; the Admin page's own preview (`npm run preview` in the integration) checked headlessly; a person confirms the App Management form once, recorded in the report.

## Shipped so far
