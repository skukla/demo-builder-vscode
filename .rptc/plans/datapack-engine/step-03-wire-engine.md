# Step 03: wire the engine together

Status: **in progress**. Items 1 to 6 built (2026-10-27/28); 7, the live run, to do.

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
5. **The engine setting** `demoBuilder.dataInstaller.engine` (`service`, the default, or
   `demo-builder`), read by `selectedDatapackEngine` and declared in `package.json` (pinned by
   its test). One function builds whichever engine it names (`buildDatapackEngine.ts`), for the
   screen's import, dry run and removal and for the wizard's creation install and project
   reset. **Removal goes through the engine that installed**, answered without a manifest
   field: Demo Builder's install record beside the project is the proof it installed a pack
   (`engineThatInstalled`), so existing projects need no migration. Changed from the first
   plan, which added `datapack.engine` to the manifest. The creation install builds one engine
   per job, since Demo Builder's keeps its jobs in memory.
6. **Read packs from wherever the screen lists them** (owner, 2026-10-27). Built: an install
   request names its store (`source`: `installer`, the default, or `library`), and Demo Builder's
   engine reads the pack from there through `readPackFromStore`. A zip file is loaded into the
   library by the existing load, so it installs from there. The service installs only from its
   own catalog, so with it chosen a library pack is refused with what to do instead. The
   catalog's answer carries the chosen `engine`, and a library pack's panel offers Import in
   place of Copy to the Data Installer when it is Demo Builder's. The agent's import, dry run
   and removal take the same optional `source`.
7. **First live run**, on the owner's go, each step separately: dry run, install, a look in the
   Admin and storefront, remove, back to zero.
   - **Where** (owner, 2026-10-27; the only ACCS instance there is): website
     `justrite_test_website`, store view `justrite_test_store_us`, on the sandbox instance every
     local project uses. Not `justrite`, whose live demo shares the instance.
   - **Its store shares Justrite's root category (119).** So the pack must bring its own root, or
     its categories would show in Justrite's tree.
   - **Pack: Frescopa `main`**, 64 rows, every kind installable: 3 attributes, 1 assignment, 9
     categories under its own root "Frescopa", 25 products (simple and bundle) on the test
     website only, one stock link (Default Stock, already there) and 25 quantities.
   - Shared across the instance, and so taken back on removal: the attributes, their options,
     the assignment. Nothing that exists is changed.
   - Before it: a bundle-product test, since Frescopa has bundles and no test covers them (built).
   - With it, on the owner's go: deploy the library's gateway check (`accs-discovery-service`
     `ff2c953`), then load and read a library pack, so the second lock is proven live.

## Agent surface

No new tool: the screen gained no action an agent lacked.

| Tool | Change | Read or write | Chat wording | Dialog |
|---|---|---|---|---|
| `validate_datapack_import` | takes `source` (built) | read | unchanged | none |
| `start_datapack_import` | takes `source` (built) | write | unchanged | unchanged |
| `reset_datapack` | takes `source` (built); goes through the engine that installed | write | unchanged | unchanged |
| `set_setting` | can set `demoBuilder.dataInstaller.engine` (built) | unchanged | unchanged | unchanged |
| `find_datapacks` | with the library, its answer carries `engine` (built) | read | unchanged | none |

**Before the step is done:** a battery prompt, "Install the Frescopa datapack from the library
into this project", expecting `validate_datapack_import` then `start_datapack_import` with
`source: library`; its trace read for detours; `find_datapacks`'s measured size checked against
its ceiling with the new field; `ai-coverage-scan` run.

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
