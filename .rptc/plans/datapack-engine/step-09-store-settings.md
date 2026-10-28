# Step 09: store settings, as a layer beside a pack

Status: **to do** (owner's ask 2026-10-27; shape decided 2026-10-28). Depends on step 03's first
live install.

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
