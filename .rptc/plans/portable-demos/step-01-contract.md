# Step 01 — Define the project file format

Item: [[PL-56a]]. Decisions: D10, D13. Depends on nothing; everything else depends on it.

**Reuse:** section A of `reuse-map.md` lists every existing thing this step is built from and how (use as is / add to it / make it shared / build new). A new file, hook, shape or word not in that section names the row it replaces and why.

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
   style as `projectFileLoader`'s. **The split, decided 2026-09-11 (owner: "everything can
   travel"):**

   | Travels | Stays local |
   |---|---|
   | title and slug; package, stack, addons, block libraries (shipped + custom), the stored storefront row; component selections and config VALUES (never credentials, see 3); the Commerce connection (URL, environment id, store codes); the discovered store structure (a cache); the datapack; Adobe org/project/workspace ids AND names; App Builder integrations by catalog id, custom sources and attributed API picks (never deploy state, endpoints, timestamps); saved AI prompts; provenance (source project, extension version, date) | path, dates, status; component instances (paths, ports, statuses) and versions; installed block-library and inspector snapshots; mesh/app/storefront status summaries and last-publish state; AI context version and file hashes; publish-key date; pinned; the legacy flat API-picks field; the manifest's own format version |

   **Stale context is re-proven, never assumed (owner):** import seeds GitHub and DA.live as
   edit mode does (`buildEditModeEdsConfig`, `useWizardState.ts:77`: not proven, checking;
   the Accounts hooks validate on visit) instead of asserting them valid
   (`buildImportModeEdsConfig`, `:130`, which is deleted); the Adobe context goes through
   the Adobe step's existing mismatch handling and "Switch IMS Org" forced sign-in
   (`AdobeAuthStep.tsx:80`). No new prompt; the existing ones run before anything continues.
3. **Secrets never travel in the file.** Commerce credentials live in VS Code SecretStorage
   (`commerceCredentialStore.ts`, read-first; migration + activation sweep converge old
   projects); App Builder secrets are routed there at the boundary and never reach
   `componentConfigs`. Export today reads only the config map, so on a converged project
   "include secrets" writes NO Commerce secrets and stamps `includesSecrets: true`, the
   mirror of the 2026-08-11 defect. **Decided 2026-09-11 (owner): never in the file.**
   The file carries no credentials and no `includesSecrets` field at all (nothing
   soft-deprecated; the `export_project_settings` flag goes with it); import lists the
   credentials the new project needs and the existing Commerce connection step collects
   them; same-machine Copy moves them SecretStorage → SecretStorage directly, never through
   the file. `SECRET_ENV_KEYS` stays the register of what a credential is.
4. **The schema gap is closed**: `hidden`, `byomOverlayUrl`, `patches` added;
   `additionalProperties: false` where the type is closed.
5. **Names — decided 2026-09-11 (owner).** One family, the kind spelled out before the
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
