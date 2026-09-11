# Step 01 — The contract: one versioned project file, and the storefront slice of it

Item: [[PL-56a]]. Decisions: D10, D13. Depends on nothing; everything else depends on it.

## Goal

One typed shape, one schema, one migration rule, three places it can live (our catalog, a
colleague's repo, an exported project). After this step nobody can define a storefront
description a second way without a test going red.

## What exists

- `src/types/demoPackages.ts:122` `Storefront` and `:220` `DemoPackage`; schema
  `src/features/components/config/demo-packages.schema.json` (no `additionalProperties:
  false`; `hidden`, `byomOverlayUrl`, `patches` missing from it).
- `src/types/settingsFile.ts` `SettingsFile`, `SETTINGS_FILE_VERSION = 1` (`:136`), never
  bumped; `isNewerVersion` only logs (`settingsTransferService.ts:77`).
- The manifest's migration gate: `MANIFEST_FORMAT_VERSION` (`projectConfigWriter.ts:110`)
  and the read-side migrations in `projectFileLoader.ts:205`.
- Pins: `tests/templates/config-contracts.test.ts` (every `*.schema.json` under `src/`
  validates its sibling JSON), `config-interface-contracts.test.ts` (type vs JSON),
  `demo-packages-data.test.ts`, `demo-packages-schema.test.ts`.

## Design

1. **The storefront slice** is a named type: the brand fields a shipped package carries
   (`name`, `description`, `icon`, `configDefaults`, `configFlags`, `requiresMesh`, default
   block libraries) plus the storefront row fields a repo can meaningfully state. It is
   derived from, not duplicated beside, `DemoPackage`/`Storefront` (a `Pick`/composition in
   the type; a `$ref` in the schema), so the catalog and the slice cannot drift.
2. **The project file v2** is `SettingsFile` grown to carry what the manifest persists and
   is not machine-local, with `version: 2`, and a read-side migration from v1 in the same
   style as `projectFileLoader`'s. Which manifest fields are "not machine-local" is the
   design question of this step; the import/export research lists the candidates. Secrets:
   `SECRET_ENV_KEYS` (`envVarKeys.ts:129`) is the register; a file an SC may send to
   someone else is secret-free by default.
3. **The schema gap is closed**: `hidden`, `byomOverlayUrl`, `patches` added;
   `additionalProperties: false` where the type is closed.
4. **Names — decided 2026-09-11 (owner).** One family, the kind spelled out before the
   shared suffix:
   - project manifest: `.demo-builder.json` (unchanged; hidden; machine-local);
   - exported project: `<name>.project.demo-builder.json` (today `<name>.demo-builder.json`,
     `settingsSerializer.ts:239`; old exports still import because the file's `version`
     decides, not its name);
   - storefront description in a repo: `demo.demo-builder.json`, visible at the repo root.
   Each file also carries a `kind` field so a door can tell which it was handed regardless
   of name.

## Tests first

- `config-interface-contracts.test.ts`: the slice type and the schema `$ref` agree.
- A v1 → v2 migration test on a REAL v1 export captured from a project on disk (never a
  hand-written fixture; the shape rule).
- `demo-packages-schema.test.ts`: the three missing fields validate; an unknown field fails
  where the type is closed.
- The description-file schema validates a sample committed under `tests/helpers/`, typed to
  the real interface (a literal in a `.json` has opted out of the only check that works).

## Done when

The type, the schema, the migration and the filenames are in the repo and pinned; `docs/`
states the contract for a reader who is not us (the page step 09 links to).

## Open

Icon format (a path in the repo vs an inline data URL); the exact list of manifest fields
that travel.
