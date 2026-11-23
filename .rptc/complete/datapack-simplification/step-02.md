# Phase 2 build plan: versions the SC never manages

Written 2026-11-12 from a read-only map of the code (overview.md "### Phase 2", decisions.md Phase 2
and 7b). The library is the Data Installer service's remote `library` store; every save is a new
remote version named `YYYYMMDD-HHMMSS`. Nothing trims old saves today, and there is no Undo Last
Save and no "Restore My Luma".

## Order (each slice ends on a green gate; safety fixes land before anything deletes)

1. **A save of a shared datapack stays shared.** Done, `c4a7a6ca7`. `createDatapack` hard-codes `shared: false`
   (`services/datapackStoreWriter.ts:83`); `saveToPack` passes the held version's `shared` instead,
   to the pack and its store configuration. Without this, trimming deletes the only shared versions.
2. **A project naming a save that is gone uses the same datapack's newest save.** Done, `0294c163e`.
   `recordedPack.ts` tries the same pack's newest save before the origin pack. Reset and the replace
   path remove by the install record and were left as they are; installs go through this check.
   Existing projects keep working (CLAUDE.md property 3).
3. **Deleting the save in use no longer strands the project.** Done, `a2b0a0076`.
   `delete-library-datapack` (one version or every version) refuses a save or datapack that a project
   on this machine uses, naming the project. Built as a refusal rather than a repoint (2026-11-12):
   the install record describes the deleted save's data, so moving the project onto another save
   would misdescribe Commerce.
4. **Keep two saves.** Done, `4e8bb0678`. After each successful save: keep the newest save and the one before it;
   delete older dated saves with their store configuration. Never a named version (`main`), never a
   `name@version` another local project names or a project file shared (`sharedInFiles`). A failed
   trim never fails the save.
5. **Undo Last Save.** Done, `da0fe7f4c` (engine and agent tool), `2872053b8` (screen). More menu row, shown only with a save to go back to. "Undo Last Save?"
   (Cancel / Undo, blue). One job: uninstall the newest save, install the one before it
   (`changes: 'drop'`, so no save question), and only after both succeed delete the newest save.
   Same steps window ("Restoring My Luma"; ends "Last Save Undone"). A new MCP tool with descriptor,
   narration and consent copy.
6. **Restore My Luma.** Done, `3aeac5650`. The flyout's main button on the datapack the demo uses. A forced
   same-version replace (today a same-version import updates in place and keeps Admin edits). Asks
   "Restore My Luma?" (Cancel / Restore) only with unsaved edits; a newer save alone runs straight
   after the check; nothing to change ends "My Luma Is Up to Date"; done "My Luma Restored".
7. **Version History and dates go.** Done, `2872053b8`. Delete `VersionHistoryDialog.tsx`, `versionHistory.ts` and their
   wiring; "Install the Version from …" becomes "Install My Luma"; `SAVED_LINE` and "Saved a new
   version" become the result title "Saved to My Luma"; "it and its version history" goes from
   Delete.
8. **Agents.** Done, `eb13bdd2e`, `3aeac5650`. `save_store_changes_to_pack`, `start_datapack_import`, `delete_library_datapack`
   text, the generated `import-datapack` skill and `docs/systems/mcp-server.md` say: saves replace,
   one undo is kept, Undo Last Save is its own tool. `AI_CONTEXT_VERSION` is bumped once after the
   last phase, not here.

Then the live cycle on the test store with the owner's go (DI/CLAUDE.md): save, save again (the
oldest is trimmed), Undo Last Save, Restore, reinstall with nothing sent, uninstall.

## Risks carried

- Undo deletes the newest save only after the uninstall and install succeed; a failed install
  leaves the project on the newest save.
- Saves on other machines can't be seen; a colleague's project file naming a trimmed save falls
  back to that datapack's newest save (slice 2), not to the origin.

## Status (2026-11-12, unattended loop)

All eight slices are built and gated (full gate after slice 6: 2,397 suites, 38,523 tests; dead-code,
circular-dependency and duplication scans clean). Still owed: the live cycle above, with the owner's
go; the run window's own titles for Undo ("Restoring My Luma", "Last Save Undone") and Restore ("My
Luma Restored"), which belong to the run window's rebuild in Phases 3 to 5.
