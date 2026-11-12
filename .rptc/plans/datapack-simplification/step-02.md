# Phase 2 build plan: versions the SC never manages

Written 2026-11-12 from a read-only map of the code (overview.md "### Phase 2", decisions.md Phase 2
and 7b). The library is the Data Installer service's remote `library` store; every save is a new
remote version named `YYYYMMDD-HHMMSS`. Nothing trims old saves today, and there is no Undo Last
Save and no "Restore My Luma".

## Order (each slice ends on a green gate; safety fixes land before anything deletes)

1. **A save of a shared datapack stays shared.** `createDatapack` hard-codes `shared: false`
   (`services/datapackStoreWriter.ts:83`); `saveToPack` passes the held version's `shared` instead,
   to the pack and its store configuration. Without this, trimming deletes the only shared versions.
2. **A project naming a save that is gone uses the same datapack's newest save.**
   `recordedPack.ts` `fallbackFor` tries the same pack's newest save before the origin pack;
   `sampleDataInstall.ts` (reset and build), the EDS reset and the replace path get the same fallback.
   Existing projects keep working (CLAUDE.md property 3).
3. **Deleting the save in use no longer strands the project.** `delete-library-datapack` (one
   version or every version) repoints `project.datapack` and the install record to the newest
   remaining save, or refuses when none remains.
4. **Keep two saves.** After each successful save: keep the newest save and the one before it;
   delete older dated saves with their store configuration. Never a named version (`main`), never a
   `name@version` another local project names or a project file shared (`sharedInFiles`). A failed
   trim never fails the save.
5. **Undo Last Save.** More menu row, shown only with a save to go back to. "Undo Last Save?"
   (Cancel / Undo, blue). One job: uninstall the newest save, install the one before it
   (`changes: 'drop'`, so no save question), and only after both succeed delete the newest save.
   Same steps window ("Restoring My Luma"; ends "Last Save Undone"). A new MCP tool with descriptor,
   narration and consent copy.
6. **Restore My Luma.** The flyout's main button on the datapack the demo uses. A forced
   same-version replace (today a same-version import updates in place and keeps Admin edits). Asks
   "Restore My Luma?" (Cancel / Restore) only with unsaved edits; a newer save alone runs straight
   after the check; nothing to change ends "My Luma Is Up to Date"; done "My Luma Restored".
7. **Version History and dates go.** Delete `VersionHistoryDialog.tsx`, `versionHistory.ts` and their
   wiring; "Install the Version from …" becomes "Install My Luma"; `SAVED_LINE` and "Saved a new
   version" become the result title "Saved to My Luma"; "it and its version history" goes from
   Delete.
8. **Agents.** `save_store_changes_to_pack`, `start_datapack_import`, `delete_library_datapack`
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
