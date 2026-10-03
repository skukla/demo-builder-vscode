---
id: PL-56c
kind: feature
area: platform
parent: PL-56
needs: [PL-56a]
value: high
status: active
---

# Export carries the whole project, and never a credential

Filed 2026-09-11. Depends on the contract [[PL-56a]] (the v2 file and the travels/local
split are decided there).

## What changes

- `extractSettingsFromProject` (`settingsSerializer.ts:127`) emits the v2 file: every field
  in the contract's "travels" column, `version: 2`, provenance, and the stored storefront
  row for added demos. Adobe org and workspace NAMES are written (today read on import,
  never written: always empty).
- No credential in the file, ever, and no `includesSecrets` field: credentials live in
  SecretStorage (`commerceCredentialStore.ts`), and today's export never read them from
  there anyway, so a converged project's "with secrets" file already had none while
  claiming to. The `includeSecrets` flag on `export_project_settings` and on
  `createExportSettings` is deleted, not defaulted.
- The suggested filename becomes `<name>.project.demo-builder.json`
  (`settingsSerializer.ts:239`); the headless tool writes the same name.
- Both dashboard doors and the MCP tool go through one function; the "Demo Builder
  Settings" save-dialog filter label says "Demo Builder project".

## Reachability checks (D32)

Export runs the same checks Share runs: a named datapack must be in the datapack service
(offer to publish it through the item-API export route [[DI-3]] proves, if not); a custom-app link must be readable by others
(offer to make the repository public, confirmed). Warnings, never blocks.

## Tests first

The serializer suite gains a field-set test pinned to the contract's list (a manifest
field added later without a decision goes red); a real converged project's manifest is the
fixture; the secret-strip battery becomes "no `SECRET_ENV_KEYS` key is ever present".

## Shipped so far

- 2026-10-03  Credential half done, uncommitted on loop/2026-10-03-overnight: every export door writes through createExportSettings with no credential, the includeSecrets option and includesSecrets stamp are deleted (tool, handler, service, type, tests, docs), the file is named <name>.project.demo-builder.json and the dialog says Demo Builder project. NOT done: the version-2 file shape (import still reads version 1, so the writer and PL-56d have to move together) and the D32 reachability checks.
- 2026-10-03  chore(platform): the export never carries a credential; a leftovers check; the agent-surface gap triaged (PL-35, PL-56c, PL-39, AI-1r) (`b7bc129d2`)
- 2026-10-03  Version-2 half done 2026-10-03, uncommitted on loop/2026-10-03-night2-a: export writes the version-2 project file through createExportSettings (title, Adobe org and workspace names, Commerce connection, store structure, datapack, saved prompts, storefront as provenance only). Proven by projectFileRoundTrip.test.tsx (export, read, wizard, creation wire, field by field). NOT done: the D32 reachability checks (datapack published, custom-app link readable).
