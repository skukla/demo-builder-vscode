---
id: AB-83
kind: fix
area: app-builder
needs: []
value: med
status: active
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
| ERP detach (`erp/detach`, `commerce-erp-integration/src/lib/detach.js`) | No: writes back each ledger entry's `before` (`ledger.js` `revertOne`); the ledger keeps `after` too | An Admin edit to a field the ERP wrote, by design (below) |
| ERP records wipe (`demo-erp`, `POST admin/wipe`) | Not applicable: empties the ERP's own database, not Commerce | Nothing in Commerce |

It also matters where packs and the setup guide touch the same things (store settings: the
config fix and DI-5's planned `store_config` kind; sources and stocks: the warehouse fix and DI-5's
stock kinds). A pack sets a setting, the guide changes it, the pack is removed: today the removal
would put back the value from before the pack, over the guide's. With the rule, removal sees it
changed since, leaves it, and says so.

## The fix (decided by the owner, 2026-10-27)

Use the shared "is this still as we left it?" rule DI-5 builds first
(`.rptc/plans/datapack-engine/step-04-still-as-we-left-it.md`, in `src/core/utils/`). Nothing here writes a fourth copy. The rule answers "still as we left it, or
changed?"; each undo decides what to do with a change, by who owns the thing:

- **The ERP's detach puts everything back regardless**, as it does today: the ERP is transient
  by design (owner, 2026-09-23), owns the fields it writes while connected, and its next sync
  would overwrite an Admin edit anyway. It gains one thing: the result names what had been
  edited since. Its ledger already stores the value it wrote (`after`, beside `before`,
  `commerce-erp-integration/src/lib/ledger.js`), so this is one comparison in `revertOne`. Done
  as its own PR in `commerce-erp-integration`.
- **The ERP's records wipe** (`demo-erp`, `POST admin/wipe`) empties the ERP's own database, not
  Commerce. Nothing to check; unchanged.
- **The setup guide's undos keep what changed since** and say so in one line:
  - settings: a setting whose current value is not the one the fix wrote is kept;
  - shared catalogs: a catalog holding anything the fix did not put there is kept, with the
    company still unassigned from it; one holding only the fix's is deleted as today;
  - warehouse: a stock holding a source the fix did not link is kept, with the fix's own links
    taken out; sources are switched off only if still as the fix left them.
- **No "undo anyway" button.** The SC changes the thing themselves if they want it back.

Done on `feature/datapack-engine` (the setup-guide undos, after the shared rule) and in the ERP
repo (detach). Closes when both have landed.

## Shipped so far

- 2026-10-29  feat(app-builder): setup-guide undos keep what the SC changed since (datapack step 06) (`4cadd9184`)
