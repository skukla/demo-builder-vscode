# Project import, export and copy: how stale, measured

**Date:** 2026-09-11
**Type:** Codebase trace (read-only), prompted by the owner's statement that the feature
"has grown horridly stale" while expanding [[EDS-13]] into a program.
**Status:** MEASURED. Design not started; program track filed as [[PL-56]].

## What the feature was designed for, and when

`.rptc/research/wizard-settings-import-export/research.md` (2025-12-12): "users find it
tedious to re-enter the same settings", so save a settings file from one creation and
reuse it in the next. That predates demo packages as they are now, App Builder
integrations, datapacks, block libraries and the EDS storefront's current shape. Large
parts of that design never shipped: the export options dialog (shareable vs complete), the
`.env.example` companion, the import banner, field-level indicators, presets.

## The doors

| Door | Where | Path |
|---|---|---|
| Export | projects-grid kebab (`ProjectActionsMenu.tsx:250`), single-project action tile (`ActionGrid.tsx:528`), MCP `export_project_settings` (`actionDescriptors.ts:418`) | all → `settingsTransferService.ts` → `extractSettingsFromProject` (`settingsSerializer.ts:127`) |
| Import / Copy | "New ▾" → Import from File… / Copy from Existing… (`projectsDashboardHelpers.ts:34`), empty-state Import (`DashboardEmptyState.tsx:44`) | → `demoBuilder.createProject` with `importedSettings` → wizard mode `'import'` (`useWizardState.ts:311`) |
| Edit | dashboard Edit | the SAME serializer feeds `editProject.settings` (`projectManagementHandlers.ts:26`) |

No `contributes.commands` entry for any of them. No MCP import or copy tool
(`.rptc/backlog/2026-08-16-mcp-surface-for-sc-design-work.md:32` lists it as open).
"Copy from Existing" is export with secrets piped straight into import; there is no other
duplicate path.

## What export writes vs what a project holds

Export (`settingsSerializer.ts:127-204`) emits: version (constant `1`), exportedAt, the
project SLUG, extension version, `includesSecrets`, `selections`, `configs` (optionally
stripped of the five `SECRET_ENV_KEYS`), three Adobe ids and two titles, `selectedPackage`,
`selectedStack`, `selectedAddons`, `selectedBlockLibraries`, `customBlockLibraries`,
`installedBlockLibraries`, an `edsConfig` mined from the EDS instance metadata,
`appBuilderComponentSources` derived from the deploy-state map, `componentApiPicks`.

**Persisted in the manifest (`projectConfigWriter.ts`) and NOT exported:**
`title` (only the slug goes), `commerce` (URL, environment id, store codes),
`commerceStoreStructure`, `datapack`, `componentInstances`, `componentVersions`,
`appBuilderComponents` deploy state, `edsStorefrontState` and its summary, `aiPrompts`,
`aiContextVersion`, `aiFileHashes`, `publishKeyRegisteredAt`, `pinned`,
`adobe.organizationName` and `adobe.workspaceName` (READ on import, never written: always
empty), `formatVersion`.

**Exported and NOT persisted or read:** `installedBlockLibraries` (in-memory only, so a
project loaded from disk exports it as undefined; two tests pin the behaviour anyway).
`additionalConsoleApis` is typed and read but never written by any producer, and its
manifest write was retired 2026-08-23.

## What import produces

`computeInitialState` import branch (`useWizardState.ts:311-356`) seeds configs, the five
selections, Adobe context, a uniquified project name, package/stack/addons/libraries, and an
`edsConfig` that ASSERTS GitHub and DA.live auth are already valid
(`buildImportModeEdsConfig`, `:145`, `:150`). It never calls
`buildEditModeIntegrationState` (`:216`), so `appBuilderComponentSources`,
`componentApiPicks` and `additionalConsoleApis` are ignored in import mode.

Then `buildProjectConfig` (`wizardHelpers.ts:605-668`) does not read `components` from
state at all: it re-derives them from the stack and hardcodes `integrations: []` and
`appBuilder: []`. **An imported project is created with no integrations and no mesh unless
the stack supplies them**, whatever the file said. `datapack` is not on `SettingsFile`, so
it cannot travel. `sourceDescription` is plumbed through four files to reach one debug log
(`createProject.ts:496`); no banner, no "imported from" anywhere.

## Version and secrets

`SETTINGS_FILE_VERSION = 1`, never bumped; `isNewerVersion` only logs
(`settingsTransferService.ts:77`); older files are accepted unchecked; no migration exists
and the manifest migration sweep deliberately excludes settings files
(`2026-08-24-manifest-write-back-migration.md:106`). The format's only tolerance is that
every field is optional.

Both webview export doors pass `includeSecrets: true` unconditionally
(`settingsTransferService.ts:219`); a secret-free export is reachable only from the MCP
tool. `.rptc/complete/2026-08-11-export-settings-ignores-include-secrets.md` records the
day `includesSecrets: false` shipped a file full of secrets. Import never re-prompts or
counts missing secrets; empty fields are simply empty.

## Tests and docs

About 1,100 lines of serializer tests, five import-mode wizard cases, and delegation tests.
Nothing covers `importSettingsFromFile` or `copySettingsFromProject` end to end, and
nothing asserts what an import PRODUCES at creation, which is where the drop is. No feature
doc in `docs/`; one table row in `docs/systems/mcp-tools.md:26`.

## Dead

`ImportResult` (`settingsFile.ts:141`, zero references), `SettingsFile.additionalConsoleApis`,
the exported-never-read `installedBlockLibraries`, `sourceDescription`'s plumbing, and the
whole designed-but-unbuilt export/import UX.

## Edit mode overlap

Edit and import share the serializer, the `ImportedSettings` type and the review-mode
navigation; they differ in the title, the finish button, the EDS auth assumption, and the
integration seeding import skips. `.rptc/research/edit-mode-removal-audit/` proposed
pointing architecture-scale changes at Copy from Existing. Every field export drops is
therefore also a field Edit's Finish can DELETE, because the same serializer seeds both.

## Summary in five lines

1. Works: package, stack, addons, block libraries, configs, Adobe ids, EDS identity, the
   mesh-endpoint reuse heuristic, the secret strip.
2. Silently dropped on the round trip: title, Commerce instance, store structure, datapack,
   component instances and versions, App Builder deploy state, EDS state, AI fields, pinned,
   publish-key date, org and workspace display names.
3. Dropped by import specifically: integrations and mesh (hardcoded empty at creation),
   custom integration sources, API picks.
4. Dead: `ImportResult`, `additionalConsoleApis`, `installedBlockLibraries` export,
   `sourceDescription`, the unbuilt UX.
5. Versioning is inert: one value, a warning, no migration.

## Decisions (2026-09-11, owner)

- **One contract.** The versioned project file is defined first; the storefront description
  a colleague adds to their repo is the slice of it that travels with a repo. One schema,
  one migration rule, one set of tests. Filed as [[PL-56a]]; [[EDS-13a]] and [[EDS-13c]]
  build against it.
- **Copy and Edit both stay, on one complete file.** Edit changes a project in place; Copy
  derives a new one; both read the full, versioned file so neither can drop what the other
  keeps. Folding Edit into Copy (the `edit-mode-removal-audit` proposal) stays open for
  later, with the drop list in hand.
