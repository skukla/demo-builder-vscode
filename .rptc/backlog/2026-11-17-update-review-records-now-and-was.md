---
id: DI-17
kind: feature
area: data-installer
needs: []
value: low
status: backlog
---

# Update's Review Records: what Commerce holds now, and what each changed record was

Filed 2026-11-17 from the beta.153 release walk (finding F216, U2.3 step 2). Decided: after the
release (owner).

## What happened

The SC renamed a category in Commerce to "ZZ Customer Picks 3", then chose **Update Release Save Test
2**. The window said "Categories, 1 of 1 changed", and its **Review Records** listed the category as
"ZZ Customer Picks 2": it showed the datapack's own records (`get-datapack-records`), not what the save
would write. Review Records was taken out of the Update window for the release, since the counts
already say what the save takes and the list read as wrong.

## What this item would build

Review Records back in the Update window, listing what the save will write:

- Each data type in the rail with "N of M changed".
- Changed rows first, by the name Commerce gives them now. A quiet line under each: "Was ZZ Customer
  Picks 2" when the name changed, "Changed" when something else did. Then the unchanged rows.
- Settings keep the old → new line they already show.

## Why it is feasible, and what it costs

The comparison with Commerce already reads Commerce's copy of every record it made
(`planKind` in `services/demoBuilderEngine/repeatInstall.ts`, `copies.get(object.id)`), and
`keyOf(kind, copy)` gives that copy's name. So the current name is in hand; it is not returned.

The cost:

- The change summary (`KindChanges`, `ChangedKind`) carries the current name of each changed record,
  and the save window asks for every name, not the first few. That is an engine change, so it is done
  only after the live cycle on the test store, with the owner's go (`src/features/data-installer/CLAUDE.md`).
- The records list (`TypeRail`) draws a second line under a row, including inside the category tree.

## What it cannot do

Say which field changed on a product ("Color: Red → Blue"). The comparison knows a record differs, by
its fingerprint, not where. That would be its own, larger item.

## Value

Low: the SC made the changes a minute before, and the counts confirm the save saw them. Worth building
if SCs who change many records at once ask to check which ones before saving.
