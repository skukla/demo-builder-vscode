# Step 07 — Retire the singular write-side

**Purpose:** With the keyed map persisted (Step 01), one writer (Step 02), and mesh on the unified model
with a proven byte-identical edge (Step 06), retire the singular `meshState`/`appState` **write-side**.
The keyed `appBuilderComponents` map becomes the single source of truth. Legacy projects stay
**readable** via the load-migration (Step 01's fallback) — only the write-side is removed.

**Prerequisites:** Steps 01, 02, 06 (parity proven). Do NOT start before Step 06's golden test is green.

**Reuse / surgical anchors (verified 2026-07-15):**
- `src/core/state/projectConfigWriter.ts:97,103` — stop writing `meshState`/`appState` as authority
  (the 2026-07-15 `appState` add `f91669cb` is superseded here).
- `src/types/base.ts:95-114` — mark `meshState`/`appState` legacy-read-only (doc + comment); keep the
  types for migration.
- `docs/architecture/state-ownership.md` — update the single-source-of-truth section (mesh endpoint now
  lives on the keyed mesh entry, not `meshState`).
- Grep every remaining production read of `project.meshState`/`project.appState` — each must go through
  an accessor (`getMeshAppBuilderComponent`/`getIntegrationAppBuilderComponents`) before this step.

## Tests to write FIRST (RED)

- [x] `writeManifest` no longer emits `meshState`/`appState` for a keyed-model project.
      (`projectConfigWriter-atomicWrite.test.ts`)
- [x] A legacy on-disk project (only `meshState`/`appState`) still loads (migration fallback) AND, on its
      first save, is rewritten with the keyed map (one-time forward migration + reload round-trip).
      (`projectFileLoader.test.ts`)
- [x] No production code reads `project.meshState`/`project.appState` directly (accessor-only) — enforced
      permanently by `tests/core/state/singularStateAccessGuard.test.ts` (comment-stripping grep with a
      documented 8-file allowlist: loader, migration, accessor synthesis, typeGuards fallback,
      stalenessDetector per-field fallback + clearing write, meshUpdateDecline read fallback,
      meshVerifier + appComponentManager clearing writes).

## Files to create / modify

- MODIFY `projectConfigWriter.ts` — drop `meshState`/`appState` from the write allowlist.
- MODIFY `base.ts` docs + `state-ownership.md`.
- MODIFY any lingering direct readers to use accessors.

## Acceptance criteria

- Keyed map is the single persisted authority; legacy projects migrate cleanly on first write.
- `state-ownership.md` reflects the new single source.

## Risks

- **A reader still on `meshState`/`appState`** would silently read stale/empty after this. The
  accessor-only guard + a full grep before removing the write are the mitigation.
