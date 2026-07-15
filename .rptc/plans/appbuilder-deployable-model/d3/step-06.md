# Step 06 — Mesh onto the unified model (the load-bearing edge)

**Purpose:** Move mesh status / staleness / `providesEnvVars` fully onto the keyed
`appBuilderComponents` mesh entry, so mesh is one kind of deployable rather than a special case. THE
constraint: the `MESH_ENDPOINT` → `config.json` → CDN edge must stay **byte-identical**. This is the
highest-risk step — do it behind accessors with a golden test, never big-bang.

**Prerequisites:** Steps 01–02 (keyed persist + one writer).

**Reuse / surgical anchors (verified 2026-07-15):**
- `src/features/eds/services/configGenerator.ts` — generates storefront `config.json`; consumes the
  mesh endpoint. *(confirm the exact endpoint read at execution — it must move to `getProvidedEnvVars`.)*
- `src/features/app-builder/services/appBuilderComponentState.ts` — `getProvidedEnvVars(project)`
  (already collects `providesEnvVars` across deployables); the mesh entry provides `MESH_ENDPOINT`.
- `src/features/mesh/services/stalenessDetector.ts` — mesh staleness (reads `meshState.envVars`/
  `sourceHash`); repoint at the keyed mesh entry behind an accessor.
- `src/types/typeGuards.ts:502-508` — `meshState.endpoint` accessor (the authoritative endpoint today).

## Tests to write FIRST (RED)

- [ ] **Golden `config.json`:** for a project with a deployed mesh, the generated `config.json` is
      byte-identical whether the endpoint is read from `meshState` or the keyed mesh entry
      (`getProvidedEnvVars`). Snapshot before, assert equal after.
- [ ] Mesh staleness reads the keyed mesh entry (`envVars`/`sourceHash`) via the accessor.
- [ ] `meshState.endpoint` accessor returns the keyed mesh entry's endpoint (read-through preserved).

## Files to create / modify

- MODIFY `configGenerator.ts` — read the mesh endpoint from `getProvidedEnvVars(project)` (any deployable
  that provides `MESH_ENDPOINT`), not `meshState.endpoint` directly. Output unchanged.
- MODIFY `stalenessDetector.ts` — read the keyed mesh entry behind an accessor.
- Add the golden-`config.json` test.

## Acceptance criteria

- `config.json` output is provably byte-identical (golden test).
- Mesh status/staleness/endpoint all flow through the keyed entry; `meshState` is still readable (retired
  write-side in Step 07).

## Risks

- **This is the mesh→storefront edge every storefront depends on.** A regression here silently breaks
  live demos. The golden test is the gate; do not proceed to Step 07 until it is green and a live
  storefront renders unchanged.
