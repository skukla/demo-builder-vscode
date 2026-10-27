---
id: AB-83
kind: fix
area: app-builder
needs: []
value: med
status: backlog
---

# Undo leaves what changed since

Filed 2026-10-27, from DI-5's design talk (owner: "the demo setup guide's fixes, and undoing any
changes the ERP makes as well. What about all that?").

An undo that puts back what it recorded, without first asking whether the thing is still as it
left it, overwrites whatever someone changed in the Admin since. Rule 2 (a user's own edits are
never overwritten) is kept for files (ADR-013, `generatedFileWriter.ts`) and DA.live pages
(`ownedPages.ts`), and for one Commerce undo; not for the rest.

## What each undo does today (read 2026-10-27)

| Undo | Checks for changes since? | What it can lose |
|---|---|---|
| Assign products (`erpAssignProducts.ts`) | Yes: reverts only products that still carry the value it wrote, and reports the rest | Nothing. The model to copy |
| ERP attributes fix (`erpAttributesFix.ts`) | Partly: refuses while products carry an `erp_owner`; deletes only attributes it created | Fine in practice |
| Settings fix (`configFix.ts`, `undo`) | No: restores the recorded value unless the setting already holds it | A value set in the Admin after the fix |
| Shared catalogs fix (`sharedCatalogsFix.ts`, `undo`) | No: unassigns the company and deletes the catalog it made | Anything added to that catalog since |
| Warehouse fix (`warehouseFix.ts`, `undo`) | No: unlinks, deletes the stock it made, switches sources off | Stock changes made since |
| ERP detach (`erp/detach`) and records wipe (`admin/wipe`) | Not read: they run in the ERP repo's own actions | Unknown |

It also matters where packs and the setup guide touch the same things (store settings: the
config fix and DI-5's planned `store_config` kind; sources and stocks: the warehouse fix and DI-5's
stock kinds). A pack sets a setting, the guide changes it, the pack is removed: today the removal
would put back the value from before the pack, over the guide's. With the rule, removal sees it
changed since, leaves it, and says so.

## The fix

Use the shared "is this still as we left it?" rule DI-5 builds first
(`.rptc/plans/datapack-engine/overview.md`, "Repeat installs and capture", item 0) in each undo
above that lacks it. Start after that rule exists; nothing here should write a fourth copy.

## Decisions it needs from the owner

- **Shared catalogs and warehouses:** what counts as "changed since". A product or category added
  to the catalog, a source added to the stock? And then: refuse the undo, undo the rest and leave
  the changed thing, or ask.
- **The ERP's detach and wipe:** read them first (`commerce-erp-integration`), then decide.
