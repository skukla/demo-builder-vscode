# Step 03: wire the engine together

Status: **in progress**. Run order and removal built (`runPack.ts`); the rest to do, in order.

1. **Run a pack in order, remove it from its record.** Built: `runPack.ts`. The service's order
   (catalog spec §0); a kind this engine cannot install refuses the pack before any write; removal
   walks the record newest first and drops each object as it goes.
2. **The install target.** This project's signed Commerce access (`commerceClientForProject`, as
   the ERP work uses), its website id and code, and store view, into the engine's session. The
   service took credentials in the request; ours never sees them.
3. **A local job runner** behind `DatapackEngine`, so the screens' start-then-ask works unchanged:
   start answers an id, the work runs in the extension, and the job reads come from memory.
4. **The dry run.** Writes nothing: parses every kind and checks every name a row needs can be
   found, saying what would be made and what is already there.
5. **The engine setting** `demoBuilder.dataInstaller.engine` (`demo-builder` or `service`), and
   the manifest's `datapack` gains `engine`, so removal goes back through the engine that
   installed. A setting lives in three places: `package.json`, its schema and its type.
6. **Read packs from wherever the screen lists them:** the service's catalog, the library, a zip
   file (owner, 2026-10-27). One reader serves all three (`readPackFromStore`).
7. **First live run**, on a throwaway ACCS store (never Justrite or a colleague's), on the owner's
   go: dry run, install, remove, back to zero.

## Reuse

| Need | Reuse | Where it is |
|---|---|---|
| Install and removal progress on screen | The import window and its watch, unchanged: the job runner answers the same reads the service's job did | `ImportDatapackModal`, `useImportProgress`, `watchImportJob` |
| Commerce access for the target project | The ERP work's signed client | `commerceClientForProject` (`erpFillForProject.ts`) |
| The dry run's answer | The import window's existing validation view, with a list of what would be made and what is already there | `ImportDatapackModalBody` (`ModalView`); `FactList` for the counts |
| "Demo Builder does not install customers yet" | A notice above the form, not a full-pane error | `InlineNotice` |
| Reading a pack from the library or a file | One reader for every store | `readPackFromStore` (`datapackTransfer.ts`), `readDatapackZip` |
| The engine setting | The Data Installer's settings section in `package.json`, read where its others are read | `dataInstallerConfig.ts` |

Then step 03b: our engine becomes the default, with a release test-plan row for each of dry run,
install and remove.
