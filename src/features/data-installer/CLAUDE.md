# Data installer: working on Demo Builder's engine

Demo Builder's own engine (`services/demoBuilderEngine/`) installs a datapack, installs it again,
and removes it, in a live Commerce store an SC is about to demo from. These rules exist because
of one reinstall on 2026-11-06 (backlog DI-8).

## What happened

Reinstalling an unchanged Luma took 40 attributes out of their attribute sets, saying "the pack
no longer has it", and Commerce blanked 271 product values with them. Each attribute had been
recorded under the set's id ("155/size") while the pack names it by the set's name ("Top/size"),
so the reinstall matched no row. Stock links had the same mismatch. Both shipped on 2026-10-30
and stayed hidden for a week, because:

- the unit tests asserted what the code recorded, so they agreed with the bug;
- "installing the same pack again sends nothing" was tested for 3 of 22 data types;
- every live run since then was a first install.

## The rules

**A record's key is the pack's name for the row: `keyOf(kind, row)` in `packForm.ts`.** The id is
what removal sends; the key is what a reinstall looks the row up by. A new data type records
`keyOf` of its row, never an id the store gave it.

**Every data type proves "install again, nothing sent".** A new data type joins the full cycle in
`fullCycle.test.ts` (install, install again with nothing sent, remove back to an empty store), or
names in that file the test that proves it instead. The file fails for a data type in neither.

**An engine change is done only after the live cycle**, on the test store and with the owner's
go (it writes to a real store), through the MCP tools, not scripts:

1. `start_datapack_import` on a store without the pack: the note's check says all match.
2. `preview_datapack_changes`, then `start_datapack_import` again with the same pack: the preview
   shows nothing to update, add or remove; the note has no "Took out" line and the check no
   `leftOut`.
3. `reset_datapack`: nothing is left in the store unless the note says why.

A first install alone proves only the first install. The reinstall is the step that found both
bugs.

**Read the note, not the outcome.** `success` means Commerce took the rows. What was skipped, taken
out, refused, kept and checked is in the note and the status's `check`.
