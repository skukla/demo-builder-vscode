# Datapack zip — save a pack to a file, load a pack from a file (owner, 2026-10-01)

## Goal, in the owner's words

"The result of an export from HIS service when it works, as well as from our current
stand-in should be an optional export to zip. Import should follow the same approach."

## What is true today (checked 2026-10-01)

- The Data Installer service has **no zip support**. Its export writes into its own
  database; its deployed import takes JSON in the request body. Only its local dev server
  accepts files, one JSON/YAML per data type, never a zip.
- Our datapack store (`accs-discovery-service`, package `datapack-store`, live on Stage)
  answers the **same routes with the same answers** (`create-datapack`, `add-data-item`,
  `get-datapack-metadata`, `get-data-item`, …), pinned by
  `tests/features/data-installer/datapack-store-contract.test.ts`.
- So one client reads both, and one writer writes both. The extension already has
  `adm-zip` and two zip flows to copy: the demo bundle export and the storefront zip import.

## Decision

**The zip is built and read in the extension, not in either service.** It is a local
file, it works the same for both stores, and it avoids Runtime's request and response
size limits on the read side.

The file:

```
<name>-<version>.datapack.zip
  datapack.json            what the pack is: name, version, display name, description,
                           data types, which store it came from, when; plus a format marker
  data/<data_type>.json    one per data type: the rows, as the store holds them
```

A zip whose files sit under one root folder (what macOS "Compress" makes) reads the same.

**Source and target are named: `installer` (the Data Installer) or `library` (our store).**
The library's address is a new setting, `demoBuilder.datapackStore.apiBaseUrl`, defaulting
to the Stage deployment (a public action URL, like `demoBuilder.byom.overlayUrl`). Both
stores take the SC's own Adobe sign-in.

**Import writes a pack into a store; installing it into Commerce stays the existing path.**
Importing into the Data Installer writes into the catalog other teams share, so it carries
the same name-echo guard as `start_datapack_export`. An existing pack is refused unless the
caller asks to replace it. Each data type is one `add-data-item` request, so a type larger
than a Runtime request allows is refused per type, by name, and the rest still land.

## Steps

| # | Step | Status |
|---|---|---|
| 01 | `datapackZip.ts` — build and read the file (pure, over bytes) | done, 14 tests |
| 02 | `datapackStoreWriter.ts` — `create-datapack` + `add-data-item` against either store | done, 6 tests; `datapackTransfer.ts` moves a whole pack, 8 tests |
| 03 | The library setting and its resolver, beside the Data Installer's | done; default host pinned to one the repo already publishes |
| 04 | Handlers `save-datapack-zip` / `open-datapack-zip` / `load-datapack-zip` | done, 17 tests; update refused into the Data Installer, name echo required there |
| 05 | Agent tools `save_datapack_zip` / `open_datapack_zip` / `load_datapack_zip` | done; battery prompt `t2-datapack-zip-roundtrip` |
| 06 | Panel: "Save as file" on a pack and after an export, "Load from file" on the catalog | done, 11 tests; needs a look in the Extension Dev Host |
| 07 | Docs: `docs/systems/data-installer.md`; the tool catalog regenerated | done |

## Not in scope

- Showing library packs in the panel's catalog (datapack-store plan step 06). Until then the
  human surface saves Data Installer packs and imports into either store; the agent surface
  reaches both for both.
- Non-standard pack types (ACO). The extension treats every pack as the standard type today;
  so does the file.

## Found while building

- **Reversibility gap.** Nothing in the extension deletes a library pack, so a load into
  the library cannot be undone from here. The library has `delete-datapack`; exposing it
  for the caller's own packs is the follow-up.
- **The library is not in the panel's catalog yet** (datapack-store step 06), so the panel
  saves Data Installer packs only; an agent can save from either store.
