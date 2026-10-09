---
id: EDS-36
kind: fix
area: eds
needs: []
value: med
status: built
---

# A block library install put back block entries the SC had deleted

Filed 2026-10-09.

Installing or updating a block library merges its entries into the storefront's
`component-definition.json`, `component-filters.json` and `component-models.json`
(the DA.live block list). The merge could not tell "never added" from "added, then
deleted by hand", so a deleted entry came back. It also rewrote each file with two
spaces whatever indentation it had.

**Owner's decision (2026-10-09, "Agree"):** record which entries the extension added,
per library, per storefront; on install or update, add a missing entry only if it was
never added before, and leave out (and name) one that was; keep each file's
indentation. Same idea as ADR-013's authorship proof, for files that live in GitHub.

## What changed

- The record is `installedBlockLibraries[].addedEntries` on the project (type in
  `src/types/blockLibraries.ts`, schema regenerated). Four lists: component-definition
  ids, ids added to the `section` filter, whole filter entries, model ids. It is
  written only when something was added.
- `installBlockCollections` takes each library's record and returns what it left out
  (`removedByHand`) and the updated record. The rules live in
  `src/features/eds/services/addedEntriesRecord.ts`.
- Creation and install-on-an-existing-project both write the record through
  `toInstalledBlockLibrary`; an update merges into it.
- An update says what it left out: a Check for Updates notice, and
  `categories.addon.leftOut` from `apply_updates`.
- Each of the three files is written in its own indentation and keeps a final newline
  (`src/core/utils/jsonFormatting.ts`). `promote_block_to_library` and
  `remove_block_from_library` follow the same rule for `component-definition.json`.
- An entry anywhere in `component-definition.json` (any group) now counts as present;
  before, one the SC moved to another group was added a second time.

## Existing projects

No record means "added nothing", so the first run behaves as before and starts
recording. Guessing authorship from today's file could claim template entries as ours,
and a future removal that trusted the record would then delete them. Consequence: an
entry installed before 2026-10-09 and deleted later can still come back once.

## What I found that the brief assumed otherwise

- The merge only considers blocks whose folder is not already in the storefront. An
  entry deleted while its block folder stays was never put back. The bug needs the
  folder deleted too; the block FILES still come back in that case (not changed here).
- "Refresh Block Library" (`refresh_block_library`) and `promote_block_to_library` do
  not run this merge. Refresh rebuilds the DA.live library from the repo's own file;
  promote edits the local checkout. The merge runs at creation, reset, library install
  and library update (Check for Updates, `apply_updates`).
- Reset passes no record, so every entry comes back: it starts from the template.
  Reset also does not refresh `installedBlockLibraries` at all (older than this).

## Not done here

- Block folders the SC deleted are still re-added by an update. `blockIds` already
  records what was added, so the same rule could apply. Owner's call.
- The unsafeHTML enrichment pass still adds `plugins.da.unsafeHTML` back to an entry the
  SC stripped it from.
- Live check: on a scratch storefront, delete a library block's folder and its entry,
  then run Check for Updates on a library with a newer commit.

## Shipped so far
