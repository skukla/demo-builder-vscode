---
id: AB-76
kind: feature
area: app-builder
needs: []
value: low
status: backlog
---

# The ERP setup checklist follows each ERP's ownership mode

Filed 2026-10-09 for the owner's review, from the investigation "what can the builder do to
help the SC prepare data for each ownership mode?". Two of the four ideas were built that day
(AB-74 Assign products with the attribute-set check, AB-75 the preview before Add). This is
one of the two left; the preview was the other, and was built.

## Today

The ERP integration's setup checklist (`setupSteps` on the `erp-integration` catalog entry in
`app-builder-components.json`, checks in `setupChecks.ts`) is the same whatever rule each ERP
uses. A project whose ERPs all own by website still sees "Create the erp_owner and brand
product attributes"; a project that owns by attribute sees no count of how many products are
tagged for each ERP; and nothing checks that a website-rule ERP's websites actually have
products and a stock holding that ERP's warehouse.

## What it would do

- Read each ERP's rule (the integration answers it; `readErpOwnershipOptionsForProject`).
- Attribute mode present: keep the attribute steps (AB-74 extended the check to attribute
  sets), and add a live line per ERP: "Accuform ERP: 96 products tagged".
- Only website and catch-all rules: hide the attribute steps.
- Website mode present: check, per chosen website, that it has products and that a stock
  selling to it includes that ERP's warehouse (the existing `erp-source-in-website-stock`
  check reads stocks and sources already; extend it per ERP rather than adding a second one).

## Why it is low value

Nothing waits on it, and the attribute path, which is the default and the common one, is
covered by AB-74 and AB-75. It mainly stops a website-only setup from showing a step that does
not apply.

## Shipped so far

- 2026-10-09  docs(backlog): file AB-76, the ERP setup checklist follows the ownership mode (`500073df6`)
