# Step 13: publish our packs to the Data Installer, settings split off

Status: **to do** (owner, 2026-10-28). After step 09.

## Why

Some demos are not built with Demo Builder. Their SCs use the Data Installer directly (its own
web page), so a pack we make has to be installable there too.

## What is already built

"Copy to the Data Installer" (`copy_library_datapack_to_installer`) and loading a zip into the
service's catalog both use the service's own upload routes (`create-datapack`, then
`add-data-item` per kind). After that, anyone using the Data Installer sees the pack like any
other and installs it with the service. **Never run live:** it writes to a catalog other teams
share, so the first run needs the owner's go, with a throwaway pack deleted straight after.

## The rule that makes it work: our packs are in the service's format

Our engine reads the service's row format, and everything we make (by hand, from a zip, by
capture in step 05) is written in that same format, so the service can install it. Capture keeps
SKUs exactly; the service's own export lowercases them, so ours is the stricter of the two.

## The limit: settings

The service installs only the kinds it knows and checks each on upload and on install, so a pack
carrying `store_config` would most likely be refused whole. Publishing therefore splits it:

- the **data kinds** go to the service's catalog, and its service installs them;
- the **settings** stay in our library as the pack's settings layer (step 09); Demo Builder
  applies them, a demo built without Demo Builder gets the data only;
- the publish **says so**, in one sentence naming the count ("Published to the Data Installer
  without its 4 store settings; those apply only when installed with Demo Builder"), and the
  pack's description lists the settings by path so someone setting up by hand knows what to
  change in the Admin.

When the service supports settings, publishing stops splitting and includes them (step 09, "The
day the service supports settings").

## Unknown, and how it gets known

- Whether the service's own web page still installs, now that the service ignores a caller's
  Commerce credentials (2026-10-27) and uses its own. We cannot see its code since 2026-10-28;
  someone who uses that page can say.
- Whether the upload routes accept a pack made by us, before the first live publish (the owner's
  go above).

## Agent surface

`copy_library_datapack_to_installer` exists; it gains the split and the sentence. A battery
prompt publishes a throwaway pack with a layer and is traced.
