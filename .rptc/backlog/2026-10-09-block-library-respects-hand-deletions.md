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

### Extended 2026-10-09 (owner: "Yes, add it")

- **Deleted block folders.** `installedBlockLibraries[].blockIds` already listed the
  folders a library copied. A block in it whose folder is gone was removed by hand: an
  update copies none of its files, puts back none of its entries, and names it on the
  same "Left out" line ("hero-cta (block folder blocks/hero-cta)"). An update now adds
  the blocks it copies to `blockIds`, so a block that arrives by update is covered too.
- **Stripped HTML examples.** New record list `addedEntries.htmlExamples` (type, schema,
  docs): entries whose `plugins.da.unsafeHTML` the extension filled, plus entries it
  added whole with one. An id in it whose entry has no example now is left out and
  named ("hero (HTML example in component-definition.json)"). Each id is decided once
  per run, so a second library cannot refill what the first left out.
- The rules are `claimMissingBlockFolder` and the `htmlExamples` kind in
  `addedEntriesRecord.ts`; `apply_updates`' description names all three.

## Existing projects

No record means "added nothing", so the first run behaves as before and starts
recording. That holds for entries and for HTML examples. Block folders are different:
every installed project already has `blockIds`, so a deleted folder stays deleted from
its next update. Guessing authorship from today's file could claim template entries as ours,
and a future removal that trusted the record would then delete them. Consequence: an
entry installed before 2026-10-09 and deleted later can still come back once.

## What I found that the brief assumed otherwise

- The merge only considers blocks whose folder is not already in the storefront. An
  entry deleted while its block folder stays was never put back. The bug needs the
  folder deleted too; the block FILES came back in that case too (fixed by the extension above).
- "Refresh Block Library" (`refresh_block_library`) and `promote_block_to_library` do
  not run this merge. Refresh rebuilds the DA.live library from the repo's own file;
  promote edits the local checkout. The merge runs at creation, reset, library install
  and library update (Check for Updates, `apply_updates`).
- Reset passes no record, so every entry comes back: it starts from the template.
  Reset also does not refresh `installedBlockLibraries` at all (older than this).

## Not done here

- Live check: on a scratch storefront, delete a library block's folder (and, for the
  second rule, strip one entry's HTML example), then run Check for Updates on a library
  with a newer commit. Expect neither to come back and both on the "Left out" line.
- `blockIds` written before 2026-10-09 is trusted as-is. If an old record lists a block
  the extension never actually copied, that block will not be copied by an update.

## Shipped so far
- 2026-10-09  fix(eds): a block library install no longer puts back entries the SC deleted (`692443854`)
- 2026-10-09  fix(eds): a block library update keeps deleted block folders and stripped examples out (`36edd839e`)
- 2026-10-09  docs(backlog): EDS-36 logs the folder and example commit (`f3dd6227e`)
- 2026-10-09  docs(backlog): EDS-36 logs its commit (`1b61ee00d`)
