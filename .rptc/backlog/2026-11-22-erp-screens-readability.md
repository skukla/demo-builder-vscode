---
id: AB-26aa
kind: feature
area: app-builder
parent: AB-26
needs: []
value: med
status: gated
waiting-on: the owner's go to start the readability pass (waiting since 2026-09-28)
plan: several-erps
---

# ERP and integration screens: the readability pass

Filed 2026-11-22, when items were linked to their plans. This is Phase C of the several-ERPs
plan (`.rptc/plans/several-erps/overview.md` §5a), asked for by the owner on 2026-09-26 and
never filed. Phases A and B are built.

C1, the listing of every screen before anything changes, is written:
`.rptc/plans/several-erps/c1-screen-listing.md` (2026-09-28). What remains:

| # | Work | Where |
|---|---|---|
| C2 | ERP screens easier to read: type scale, density, labels, empty states, the second ERP distinct at a glance | `demo-erp`; the headless screen checks re-accept fingerprints on purpose |
| C3 | Integration screens cleaned up: the Mapping tab's layout and scrolling inside the Admin frame, wording, which ERP each row belongs to | `commerce-erp-integration` Admin UI; the Demo Builder card and flyout |
| C4 | The walk-through re-checked against the cleaned screens | [[AB-26u]] |

Start from C1's list. Cosmetic issues found since belong on that list too.
