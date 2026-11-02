# Step 09: store settings, as a layer beside a pack

Status: **the `store_config` kind built 2026-10-30, the layer beside a pack built 2026-11-02
(decisions 1 and 3, owner approved); neither live.** Owner's ask 2026-10-27; shape decided 2026-10-28.

## What it is

The Data Installer service cannot set Commerce configuration: when it was written there was no
API for it. ACCS has had one since 2026-09 (`PUT /V1/system/config`, proven live 2026-10-10;
memory `reference_accs_system_config_api`). We cannot change the service (it is not ours, and
since 2026-10-28 we cannot see its code), so settings are added **beside** it.

**A settings layer** is a small pack in OUR library that carries only settings, named for the
catalog pack it goes with ("Bodea" gets a "Bodea" settings layer). Installing a pack with
Demo Builder's engine installs the pack's data, then applies its layer. The service's catalog
stays the source of the packs; we only add a layer.

## The rows: pack rows, never a format of our own

A new data kind, `store_config`, one row per setting: `{path, value, scope, scope_code}`. It is
stored and moved exactly like every other kind (create-datapack, add-data-item, the zip file),
so moving it later is a copy, not a conversion. That is the first of the two decisions that keep
the move to the service cheap (below).

## Install and remove

- **Install** reads each setting's current value and records it in the install record, then
  writes the new value through the writer the setup guide's config steps already use
  (`configFix`; reuse, do not rebuild). Commerce answers 200 with refused items in `errors`, so
  every write reads `errors`; a refused setting is reported by path, never silently skipped.
- **Remove** writes back the recorded values, newest first, and drops each from the record.
- **Scope codes** in the rows name the pack's own website and store view; they are mapped to the
  install target's, as the service maps website codes for its own kinds.
- Settings Commerce will not take through the API (Admin-only, secret) are refused at install
  with the reason; which settings are worth carrying is an open question (overview).

## Precedence: the pack wins

If a pack ever carries `store_config` itself, its layer is ignored. Fixed now, so a pack that
gains settings on the service's side takes over from our layer with no double-apply and no
conflict, before anyone has cleaned the layers up. Second of the two decisions.

## The day the service supports settings

1. Each layer is copied into its pack in the service's catalog, as one more kind (the same
   upload the zip loader uses), with at most a field rename to whatever the service names them.
2. Switching `demoBuilder.dataInstaller.engine` back to `service` then installs the whole pack,
   settings included.
3. The layers are deleted (nothing is soft-deprecated).

Removal stays safe throughout because whatever installed something removes it: a store set up
under the layer model keeps its record, old values included, and our engine restores them even
after the switch. **Check before switching back:** whether the service's settings removal puts
the old values back. If it does not, its removal is weaker than ours.

## Capture

A pack installed with a layer keeps its settings in a layer when saved: capture reads what the record
lists and the layer names at their values now, and "Save store changes" writes them to a new layer
beside the new version, not into it (below, "What was built (2026-11-02)"). There is no way yet to
start a layer by choosing settings from a configured store with no pack installed.

## Zip files

A pack's zip carries its settings layer as a second section, so a colleague who loads the zip
gets both. Loading puts the data where the SC chooses and the layer in our library.

## Agent surface

No new tool: a pack with a layer installs through `start_datapack_import` and is removed through
`reset_datapack`, which answer which settings they set or put back, by path, never the whole
configuration. A battery prompt installs a pack with a layer and is traced. Then
`ai-coverage-scan`.

## What was built (2026-10-30)

**The kind.** `store_config` (`demoBuilderEngine/storeConfigKind.ts`), installed by Demo Builder's
engine last, after every data kind (`runPack.ts`), and put back first on removal. Rows are
`{path, value, scope, scope_code}`; nothing in the kind writes a setting itself:

| What | How (reused, never rebuilt) |
|---|---|
| read what a setting holds | `configFix.readPrevious`: `GET /V1/system/config?scope=default` (or `scope=website&scopeCode=<install target's website>`), path filter `in`, field `items[].value` |
| write | `configFix(...).apply`: one `PUT /V1/system/config`, each row naming its own `scope` and `scope_code` in the body; `errors` read, each refused setting named by path and the install stops after recording the saved ones |
| "still as we left it?" | `decideOwnedChange` (step 04's rule) on the recorded `wrote`, the value now, and the pack's value; removal goes through `configFix(...).undo`, the same rule |
| the record | one object per setting, id and key `<path>@<scope>`, `previous` = the fix's own record row (`stored`, `effective`, `wrote`, `scopeCode`) |
| Commerce access | `projectCommerce` (Store: `all`), as every kind; the body's scope decides what is written |

**Scope.** `default` is written store-wide. `website`/`websites` is written for the install
target's website, whatever code the row names. `store`/`stores` is refused before anything is
written (decision 2).

**Refused before any write** (a pack is untrusted input): a store-view row; a path outside the allowed
sections, under `web/` or `admin/`, or ending in `password`, `secret`, `token` or `key` (decision 3,
built 2026-11-02; Adobe's "System configuration API" page warns that copying base URLs or
credentials "can break the production store"); a path that holds no value at its scope
or store-wide, because the fix's undo would then write Commerce's `"0"` rather than what it held
(decision 4); a path that is not `section/group/field` (`SETTING_PATH`, now exported by
`configFix.ts` and shared with `set_commerce_config`).

**Install again.** A setting this engine set and the SC has not touched is brought up to the pack,
still remembering what it held before the first install. One the SC changed is kept and counted
in "Kept N things you had changed in the Admin." One the pack no longer has is put back. One
already at the pack's value is neither written nor recorded.

**Remove.** Each recorded setting is put back while it still holds the value written; one changed
since is kept and named ("Kept catalog/frontend/grid_per_page as it is: it was changed after Demo
Builder set it."). Either way it leaves the record. One Commerce refuses stays on the record and the
removal says which.

**What the SC and the agent see.** The job's `note` (the import window's result, the backgrounded
notification, `get_datapack_import_status`) names each setting by path with old and new value:
"Set catalog/frontend/grid_per_page: 12 → 24." on install, "Put back …" on removal.
`preview_datapack_changes` counts `store_config` like any kind (add, already in the store, update,
remove, keep). "Save store changes" captures each setting the record lists or the installed version
names, at its value now (`captureSettings`, called from `capture.ts`); a website row is written with
`scope: website` and the install target's code.

**Agent surface.** No new tool. `start_datapack_import`'s and `reset_datapack`'s descriptions say the
note names settings by path; `docs/systems/mcp-server.md` has a section. Battery prompt
`install-pack-with-store-settings` added, not run. `ai-coverage-scan` and `security-review` not run
this step (no new handler, so no new gap is expected; the refused-path list is the security change).
No response ceiling re-measured: the note grows by one short line per setting.

**Tests.** `storeConfigKind.test.ts` (15), plus `runPack.test.ts`, `engine.test.ts`,
`storeChanges.test.ts` and `capture.test.ts` (one or two each), over a fake of the two routes in
`storeConfig.testUtils.ts`.

### Which reads are confirmed against a captured real response

| Read | Endpoint and field | Captured? |
|---|---|---|
| a setting's value at a scope | `GET /V1/system/config`, `items[].path`, `items[].value` | **no**: Adobe's page gives the shape; the round trip ran live 2026-10-10 (Justrite, `sales/totals_sort/tax`) but no answer is recorded in this repo |
| what a write refused | `PUT /V1/system/config`, `errors[].path`, `errors[].scope`, `errors[].message` | **no**: Adobe's page only |
| whether a path with nothing stored answers its `config.xml` default or `null` | the same `GET` | **no**: the page says "a path that exists in system.xml but has no stored value returns null", and its own example answers `sales/totals_sort/tax` `"40"`, which is that path's default. Live test step 0 settles it |

## What was built (2026-11-02): the layer beside a pack

**Finding it** (`services/settingsLayer.ts`). `find-datapacks` in the library by the name
`<pack>-settings`, exact; rows holding only `store_config` (a demo whose name happens to end that way
holds data, and stays a demo); the newest by `updatedAt`, which `main` does not outrank, passing over
archived versions; then `get-data-item` for its rows. A pack with no layer costs one library read and
changes nothing else: its Commerce requests are asserted identical.

**Applying it** (`demoBuilderEngine/layerStep.ts`). `installPack` runs on the pack's own rows, unchanged,
then the kind's own `installStoreConfig` runs on the layer's rows with the same context and recorder.
No second reader or writer, and one record, so `removePack` takes both. The last data kind stays
`processing` until the layer is done: `watchImportJob` ends when every kind asked for has, and would
otherwise end before the settings and lose the note.

| The layer | What happens |
|---|---|
| a path a pack may not set | nothing at all is written; the dry run and the install name it: "Nothing was installed: bodea-settings@2: The pack's store settings cannot be installed: design/head/title is outside what a pack may set (catalog, sales, checkout, customer, btob and cataloginventory). Nothing of this kind was written." |
| a setting Commerce refuses | the data stays; skipped and named by path in the note; the rest of the layer lands (the kind's own handling) |
| a setting with no value anywhere, or a write with no answer | the data stays; the note says "The store settings in bodea-settings@2 were not all applied. … The pack's data is installed. Removing the pack takes it out, and puts back any setting that was applied." |
| the library cannot be asked | the data installs; the note says "The datapack library could not be asked for bodea-settings, so any store settings it holds were not applied."; a recorded setting is left alone |
| no layer, and the record lists settings | they are put back ("One the pack no longer has is put back", now for a layer that has gone too) |

**Changed 2026-11-02.** This said the kinds a request names do not narrow a layer, because the engine
read a pack's whole rows whichever kinds were ticked. That was the defect: unticking Products still
installed products. An import now installs what is asked for and what it needs (`askedKinds.ts`). A
layer goes in when every kind the pack holds is asked for, or `store_config` by name; for part of a
pack, settings are left as they are, neither set nor put back, and the note says so. The layer has no
box on the form, so "the whole pack" is what its flyout's "Also sets" promises.

**What the SC sees.** Before Import, the pack's flyout has an "Also sets" row of path and value. After
it, the note: "From bodea-settings@2: Set catalog/frontend/grid_per_page: 12 → 24." On removal: "Put
back catalog/frontend/grid_per_page: 24 → 12." `preview_datapack_changes` answers `settings: { layer,
changes, note }`, each change in the fix's own words (`configFix(...).preview`).

**The catalog.** `withoutLayerCards`, on the Data Installer screen and the wizard's Datapacks step: no
card for a layer while its pack is listed. Hiding it would strand one an SC could otherwise not reach,
so it keeps its card when no pack of its name is listed, or when it is installed on its own (a card is
where a pack is removed from the store), and the pack's flyout offers "Remove its store settings" on
a layer that is the SC's own. `find_datapacks` still lists every row.

**Capture.** `captureSettings` reads what the record lists and what the installed version names, and
a layer's rows are named as the installed version's, so a setting already at its value (on no record)
is kept. `saveStore.ts` then splits them off when the pack holds no `store_config`: they go to
`<own pack>-settings` at the new version's own version, after the version itself; never into the version,
which would then hold settings of its own and win over any layer for good; never onto the layer
installed, which may be a colleague's. A pack holding its own settings keeps them there.

**A defect found on the way, fixed.** `rebaseRecord` dropped every `store_config` object from the
record at each save, since settings have no store copy to hash: after a save, removal could never
put a setting back, on any pack. It now keeps them, against the value saved (`rebasedSetting`), still
remembering what they held before the first install.

**Reversal.** A save is undone by deleting the new version, which now takes your layer of the same
version with it. Sharing a pack shares its layer (a colleague would otherwise install it without the
settings). A file's load offers "Remove its store settings from the library" unless removing the pack
takes it.

**Files** (`datapackZip.ts`, `handlers/settingsLayerFile.ts`). A second section,
`settings/store_config.json`, named in the manifest's `settings_layer`, and **the format version stays
1**, so an older extension reads `data_types` and `data/` and loads the data as it always did. The
section must be named `<pack>-settings`. A file whose layer holds a refused path is refused at Open and
Load before any write: in the library it would stop every install of the pack. A version already in
the library is left unless the SC asked to replace it, and the load says so. A file with no section
loads with exactly its old requests.

**Existing projects.** A record is the same format; nothing migrates. A setting recorded before the
allowed list is still put back. A pack whose own rows hold a path now refused cannot be installed
again or saved, and says why by path; removal still works.

**What this does not change.** Putting a value back leaves a website row explicit (decision 5 below).

**Agent surface.** No new tool; descriptions updated on `start_datapack_import`, `reset_datapack`,
`preview_datapack_changes`, `save_store_changes_to_pack`, `save_datapack_zip`, `open_datapack_zip`,
`load_datapack_zip`, `delete_library_datapack`, `share_datapack`, `find_datapacks`, `get_datapack`.

**Tests.** `engine-settingsLayer.test.ts` (order of writes, the pack wins, one removal, a refused path,
no layer, the note), `settingsLayer.test.ts`, `saveStore-settingsLayer.test.ts`,
`storeChanges-settingsLayer.test.ts`, `datapackZipHandlers-layer.test.ts`, `datapackZip.test.ts`,
`datapackCatalog.test.ts`, `DatapackCatalogView-layers.test.tsx`, over the fakes in
`storeConfig.testUtils.ts`; shapes typed in `tests/helpers/settingsLayerFixtures.ts`.

### Live test of the layer (owner's call; project `scratch-1028`, website `justrite_test_website`)

Zero first, zero last. One pack and one layer, both named for this test.

0. Read-only: `run_commerce_rest` `GET system/config?scope=default&` with a path filter `in`
   `catalog/frontend/grid_per_page`, and write the value down; record the answer as a typed fixture.
1. Build two zips under the project: `zz-layer-db09` holding one category, and carrying a second
   section `zz-layer-db09-settings` with `catalog/frontend/grid_per_page` = `24` at `default`.
   `open_datapack_zip` names the layer by path. `load_datapack_zip` into the library: the answer's
   `settingsLayer.outcome` is `created`. `find_datapacks` `store:"library"` lists both; the Data
   Installer screen shows one card, whose flyout says "Also sets".
2. `preview_datapack_changes`: `settings.changes` is `catalog/frontend/grid_per_page: <before> → 24`,
   `settings.layer` the layer.
3. `validate_datapack_import`, then `start_datapack_import`. `get_datapack_import_status`'s note: "From
   zz-layer-db09-settings@…: Set catalog/frontend/grid_per_page: <before> → 24." Debug Logs: the
   category's write before the `PUT system/config`. The record lists the category, then the setting.
4. `reset_datapack` once. The note says "Put back …". The record file is gone. Step 0's read equals
   what it was; the category is gone.
5. Back to zero: `delete_library_datapack` on `zz-layer-db09` (it takes a layer of the same version;
   delete the layer itself if its version differs). `find_datapacks` shows neither.

Worth one more pass, once that holds: install again, "Save store changes", and check the new version
holds no `store_config` and `<own pack>-settings` sits beside it; delete the new version and check both
go.

### Not built, and why

- **Store-view settings** (decision 2).
- **Starting a layer from a configured store with no pack installed.** A layer is made by a save, or
  by hand with a zip. Nothing has asked for more.

### Decisions for the owner

1. **How a pack finds its layer.** Decided and built 2026-11-02: as above.
2. **Store-view settings.** Recommended: refuse, as built, until a pack needs one; then extend
   `configFix`'s read to the store scope (store, then website, then default), not a second reader.
3. **Which settings a pack may carry.** Decided and built 2026-11-02: an allowed list of sections
   (`catalog/`, `sales/`, `checkout/`, `customer/`, `btob/`, `cataloginventory/`), with `web/`,
   `admin/` and any path ending in password, secret, token or key refused whatever the list says.
4. **A setting with no value anywhere.** Built: refused, since putting it back would write `"0"`.
   Recommended: keep, unless live step 0 shows the API answers `config.xml` defaults, in which case
   the refusal only meets paths with no default, which is still right.
5. **Putting back leaves a website row explicit.** The fix's undo writes the value the website had
   inherited, so the row now exists at the website scope with the same value (the API has no delete
   route; Adobe's page lists `GET` and `PUT` only). Recommended: accept, and say it in the SC guide;
   "Use Default Value" in the Admin restores inheritance.

### Fixed after the first live run (2026-10-30, scratch-1028)

scratch-1028's own website is JustRite's (`justrite` / `justrite_us`); the settings pack went to
`justrite_test_website`. Right after the install, `preview_datapack_changes` answered keep 1
(`catalog/frontend/list_per_page@website`): it read the setting at JustRite's website (10), not the
test website's (15). Removal was right, since it reads each setting at its record's `scopeCode`.

- **The install record keeps its target** (`target: {websiteCode, storeCode}`, `installRecord.ts`),
  written by the engine on a new record. The preview and "save store changes" open the store there
  (`storeChanges.ts`), so every kind's reads follow it: a customer looked up by email on its website,
  a category under its root, a setting at its website. A record without `target` (scratch-1028's)
  reads at the project's, as before (rule 3).
- **A recorded setting is read at the website its record names** (`previous.scopeCode`), whatever
  website the caller is pointed at (`planSettings`, `captureSettings`), so scratch-1028's existing
  record is read right too.
- **Installing again into another website is refused**, before anything is written, by the install
  and `validate_datapack_import`: "<pack> is installed on the website justrite_test_website. Remove
  it first, or install it there." A record without `target` says where by its settings' website.
- Tests: `storeConfigKind.test.ts` (4), `storeChanges.test.ts` (3), `engine.test.ts` (3),
  `installRecord.test.ts` (3), each asserting the read addresses. A control that put the old read back
  turned the live-case tests red.

### Live test of the kind (owner's call; project `scratch-1028`, website `justrite_test_website`, never JustRite's own)

One setting is written **store-wide**: `catalog/frontend/grid_per_page` (Products per Page on Grid
Default Value), which changes how many products a category page shows on every website of the
instance, JustRite's included unless it has its own value. Harmless and visible; put back at the end.
The other is for the test website only.

0. Read-only, before anything: `run_commerce_rest` `GET system/config?scope=default&` with a path
   filter `in` `catalog/frontend/grid_per_page,catalog/frontend/list_per_page`, then the same with
   `scope=website&scopeCode=justrite_test_website`. Write down all four values, and record the
   answers as typed fixtures. If `grid_per_page` answers `null` at the default scope, stop: the
   install will refuse it (decision 4).
1. Make a zip pack `zz-test-settings-db09` holding one kind, `store_config`:
   `[{"path":"catalog/frontend/grid_per_page","value":"24","scope":"default"},
   {"path":"catalog/frontend/list_per_page","value":"15","scope":"websites","scope_code":"base"}]`
   (the second names another website on purpose: it must land on `justrite_test_website`).
   `load_datapack_zip` into the library.
2. `preview_datapack_changes` for it: `store_config` add 2.
3. `validate_datapack_import`, then `start_datapack_import` (data type `store_config`, website
   `justrite_test_website`). `get_datapack_import_status`'s note: "Set
   catalog/frontend/grid_per_page: <before> → 24 and catalog/frontend/list_per_page for the website:
   <before> → 15." Read the record under `.demo-builder/datapacks/`: two `store_config` objects,
   each `previous` with `stored`, `effective`, `wrote`, the website one with
   `scopeCode: justrite_test_website`.
4. Repeat step 0's reads: default `grid_per_page` 24; website `list_per_page` 15; JustRite's own
   website's `list_per_page` unchanged.
5. Install again at once: no `PUT` in Debug Logs, no note.
6. In the Admin (scope: the test website), set List Products per Page to 20.
   `preview_datapack_changes`: keep 1.
7. `reset_datapack`: the note says "Put back catalog/frontend/grid_per_page: 24 → <before>." and
   "Kept catalog/frontend/list_per_page for the website as it is: it was changed after Demo Builder
   set it." The record file is gone.
8. Back to zero: in the Admin, on the test website, tick "Use Default Value" for List Products per
   Page (removes the website row the test made). Repeat step 0's reads: all four values as in step
   0. Delete `zz-test-settings-db09` from the library.
