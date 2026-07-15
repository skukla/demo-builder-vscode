# Step 01 — Persist the keyed map (+ integration `name`)

**Purpose:** Make `project.appBuilderComponents` durable. Today `writeManifest` serializes only the
singular `meshState`/`appState`, and `ProjectFileLoader` **rebuilds** the keyed map from those on load —
so N-integration state evaporates on reload. Serialize the keyed map, make the loader **prefer** it (the
read-migration becomes a fallback for legacy projects only), and add the `name` field that gives the
integration display name (#4) its durable home.

**Prerequisites:** Step 00. This is the foundation for Steps 02–09.

**Reuse / surgical anchors (verified 2026-07-15):**
- `src/core/state/projectConfigWriter.ts:81-124` — `writeManifest` allowlist (`meshState` :97,
  `appState` :103 [added `f91669cb`]). `appBuilderComponents` is absent — add it.
- `src/core/state/projectFileLoader.ts:104-128` — `Project` construction; `:133`
  `migrateLegacyToAppBuilderComponents(manifest)` (read-only, load-time).
- `src/core/state/appBuilderComponentMigration.ts:54-73` — the legacy→keyed migration (keep as fallback).
- `src/types/base.ts:188-199` — `AppBuilderComponentState` (no `name` today) + `:144` `appBuilderComponents?`.
- Test file: `tests/core/state/projectConfigWriter-atomicWrite.test.ts` (writer) +
  `tests/core/state/projectFileLoader.test.ts` (loader).

## Tests to write FIRST (RED)

- [ ] `writeManifest` serializes `project.appBuilderComponents` (round-trip: a project with 2 keyed
      entries → parsed manifest has both).
- [ ] `writeManifest` omits `appBuilderComponents` when empty/undefined (mirrors `aiPrompts`).
- [ ] Loader **prefers** `manifest.appBuilderComponents` when present (does NOT overwrite it with the
      migration).
- [ ] Loader **falls back** to `migrateLegacyToAppBuilderComponents` when `manifest.appBuilderComponents`
      is absent (legacy project with only `meshState`/`appState` still loads its keyed map).
- [ ] `AppBuilderComponentState.name` round-trips (write → load → identical).
- [ ] Full round-trip: keyed project → write → load → deep-equal on `appBuilderComponents`.

## Files to create / modify

- MODIFY `src/core/state/projectConfigWriter.ts` — add `appBuilderComponents: project.appBuilderComponents`
  to the manifest (conditional-omit when empty, like `aiPrompts`).
- MODIFY `src/core/state/projectFileLoader.ts` — set `project.appBuilderComponents =
  manifest.appBuilderComponents ?? migrateLegacyToAppBuilderComponents(manifest)` (prefer persisted).
- MODIFY `src/types/base.ts` — add `name?: string` to `AppBuilderComponentState`; add
  `appBuilderComponents?` to `ManifestShape`/`ProjectManifest` if the manifest type is explicit.
- MODIFY the two test files above.

## RED → GREEN → REFACTOR

- RED: writer/loader tests fail (field absent; loader always migrates).
- GREEN: add the field to the writer; branch the loader to prefer persisted.
- REFACTOR: keep the omit-when-empty helper consistent with the existing optional fields.

## Acceptance criteria

- Keyed map is durable; a 2-integration project survives a write→load cycle.
- Legacy projects (no `appBuilderComponents` on disk) still load via the migration fallback.
- Existing suite GREEN.

## Risks

- **Dropping the fallback** would break every existing project. The loader MUST keep the migration
  path for absent keyed maps (tested above).
- `name` has no writer yet — Steps 04/08 (UI) and the wizard list add/rename it; this step only makes
  the field persist.
