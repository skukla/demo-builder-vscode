# Step 09 — Migration + reset completeness

**Purpose:** Guarantee old projects migrate cleanly and that project reset reconstructs ALL keyed
deployables (not just the singular mesh/app). Closes the durability story so no project is left on a
half-migrated or unreconstructable state.

**Prerequisites:** Steps 01–07.

**Reuse / surgical anchors (verified 2026-07-15):**
- `src/core/state/appBuilderComponentMigration.ts:54-73` — the legacy→keyed migration (now the
  load-fallback; ensure it covers mesh + app + partial/malformed state).
- `src/features/lifecycle/services/projectResetService.ts` — reset/reconstruction; must rebuild every
  keyed deployable from `components/<id>/` + catalog, not just the singular pair. *(confirm the exact
  reconstruction function at execution — it was not matched by a keyed grep, so reset likely still
  reconstructs the singular model.)*

## Tests to write FIRST (RED)

- [ ] A legacy project (`meshState` + `appState`, no keyed map) → load → keyed map with a mesh entry +
      an integration entry (migration completeness).
- [ ] Malformed/partial legacy state degrades safely (no throw; the good entries survive).
- [ ] Reset reconstructs ALL keyed deployables present in `components/` (N integrations), not only one.
- [ ] Round-trip: migrate → write → reload → identical keyed map.

## Files to create / modify

- MODIFY `appBuilderComponentMigration.ts` — harden partial-state handling; ensure both kinds covered.
- MODIFY `projectResetService.ts` — reconstruct the keyed set from disk + catalog.
- Tests alongside.

## Acceptance criteria

- Every legacy project migrates on first write; reset rebuilds all keyed deployables.
- No silent data loss on malformed legacy state.

## Risks

- **Silent data loss** on malformed/partial legacy state — the migration must be defensive (collect,
  don't throw). This is the last guard before the singular write-side is fully gone.
