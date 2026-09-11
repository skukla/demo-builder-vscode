---
id: PL-56c
kind: feature
area: platform
parent: PL-56
needs: [PL-56a]
value: high
status: backlog
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
