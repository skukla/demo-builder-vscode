---
id: AB-26i
kind: feature
area: app-builder
parent: AB-26
needs: []
value: high
status: built
---

# Pricing conditions with validity, minimum quantity, value help and "why not"

Slice of [[AB-26]] — `.rptc/plans/erp-programme/overview.md` §6. **Lane: 1.**

## What

`erp-screen-realism` slice 2 / §3.10: `validFrom`, `validTo`, `minQty` on the record; date and quantity filters in `mostSpecific`; `notApplied[]` in the quote; ComboBox value help for customer and product in the Add dialog and the price test; Active / Scheduled / Expired status column; the price test says why a record did not apply; rail label Pricing.

## Verification block (checked by the loop's done gate — §6a of the plan)

Unit tests on the engine (dates, quantity, specificity); headless screen checks on Pricing; demo steps 4–5 walkable in the preview; the contract test if the condition shape reaches the contract.

## Shipped so far
- 2026-09-24  BUILT — demo-erp 66c215e (validFrom/validTo/minQty on conditions, date on quote, notApplied per line with reasons; Pricing screen: Min. qty / Valid / Status columns, Active-only switch, ComboBox value help, did-not-apply list; 199 tests green, screen fingerprints re-accepted and stable across 3 full runs); integration d14ea22 vendors the contract (301 tests, biome clean). Not done: live proof that the cart webhook still prices correctly (needs the scratch deploy, slice V)
