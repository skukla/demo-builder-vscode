# Step 09: store settings, as a layer beside a pack

Status: **the `store_config` kind built 2026-10-30, not yet live; the layer beside a pack (finding
it, applying it after the pack, the zip's second section) waits on decision 1 below.** Owner's ask
2026-10-27; shape decided 2026-10-28.

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

An SC makes a layer from a configured store by choosing which settings to keep: capture reads
those paths' current values into `store_config` rows (step 05 owns capture; this adds the kind).

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

**Refused before any write** (a pack is untrusted input): a store-view row; a path under
`web/unsecure/`, `web/secure/`, `web/cookie/` or `admin/`, or whose last part ends in `password`,
`secret`, `token` or `key` (Adobe's "System configuration API" page warns that copying base URLs or
credentials "can break the production store"; decision 3); a path that holds no value at its scope
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

### Not built, and why

- **The layer beside a pack**: finding a pack's settings layer in the library, applying it after the
  pack's data, "the pack wins", and the zip's second section. All need decision 1. Until then a
  settings pack is installed on its own, like any pack, and is removed on its own.
- **Store-view settings** (decision 2).

### Decisions for the owner

1. **How a pack finds its layer.** Recommended: a library pack named `<pack name>-settings`,
   newest version, applied after the pack's data, only when the pack itself holds no
   `store_config` (the precedence rule above), and recorded in the pack's own install record so one
   removal takes both.
2. **Store-view settings.** Recommended: refuse, as built, until a pack needs one; then extend
   `configFix`'s read to the store scope (store, then website, then default), not a second reader.
3. **Which settings a pack may carry.** Built: a short refused list. Recommended: replace it with an
   allowed list of sections (`catalog/`, `sales/`, `checkout/`, `customer/`, `btob/`, `cataloginventory/`)
   before packs from outside the team are loaded, since any path the Admin role can reach is
   writable.
4. **A setting with no value anywhere.** Built: refused, since putting it back would write `"0"`.
   Recommended: keep, unless live step 0 shows the API answers `config.xml` defaults, in which case
   the refusal only meets paths with no default, which is still right.
5. **Putting back leaves a website row explicit.** The fix's undo writes the value the website had
   inherited, so the row now exists at the website scope with the same value (the API has no delete
   route; Adobe's page lists `GET` and `PUT` only). Recommended: accept, and say it in the SC guide;
   "Use Default Value" in the Admin restores inheritance.

### Live test (owner's call; project `scratch-1028`, website `justrite_test_website`, never JustRite's own)

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
