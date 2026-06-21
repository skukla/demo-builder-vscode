# Step 04 — Generalize `providesEnvVars` into storefront config (MESH EDGE — DO NOT BREAK)

**Purpose:** Make the storefront config generator read "endpoints from any deployable that provides
them" instead of the hardcoded `project.meshState?.endpoint`. Mesh is the first (and, in D1, only)
provider. This MUST produce **byte-identical `config.json`** for existing mesh projects — it is the
load-bearing edge for every EDS demo (`MESH_ENDPOINT`→`config.json`→CDN republish).

**Prerequisites:** Steps 01 (accessor `getProvidedEnvVars`) + 02 (migration populates `deployables`).

**Reuse / surgical anchors (verified):**
- `src/features/eds/services/configGenerator.ts` line 290 — `extractConfigParams` reads
  `project.meshState?.endpoint` directly. This is the ONLY hardcoded read to generalize in D1.
- Accessor `getProvidedEnvVars(project)` / `getMeshDeployable(project)` from step 01.

## Tests to write FIRST (RED)

Extend `tests/features/eds/services/configGenerator.test.ts` (existing):

- [ ] **Golden regression (the guard):** a fixture project with legacy `meshState.endpoint = X` produces
      a `config.json` whose `MESH_ENDPOINT` and commerce endpoint equal the PRE-change output (snapshot
      the current bytes first, then refactor — output must not change).
- [ ] a project whose endpoint lives ONLY in `deployables` (forward-state, no `meshState`) produces the
      SAME `MESH_ENDPOINT` wiring (proves the generalized read path works).
- [ ] a project with NO provider (no mesh) falls back to the direct backend endpoint exactly as today.
- [ ] when both a deployable AND legacy `meshState` are present (mid-migration), the resolved endpoint is
      consistent (read-through from step 01 means they agree; assert single value, no double-write).

## Files to create / modify

- MODIFY `src/features/eds/services/configGenerator.ts`:
  - In `extractConfigParams`, replace `project.meshState?.endpoint` with a call that resolves the mesh
    endpoint via `getProvidedEnvVars(project)['MESH_ENDPOINT']` (falling back to `getMeshDeployable`),
    NOT the raw singleton. Keep the downstream `meshEndpoint` parameter contract identical so
    `generateHeaders` / endpoint-merge logic is untouched.
- No change to `republishStorefrontConfig` / CDN path — only the SOURCE of the endpoint moves behind an
  accessor.

## RED → GREEN → REFACTOR

- RED: write the golden snapshot of current output FIRST (capture bytes), then the deployables-only test
  (fails until the read is generalized).
- GREEN: route the endpoint read through the accessor; golden snapshot stays identical.
- REFACTOR: keep `extractConfigParams` <50 lines; one helper `resolveProvidedEndpoint(project)`.

## Acceptance criteria

- `config.json` output is byte-identical for legacy mesh projects (golden test passes).
- Endpoint resolves equally from `deployables` or legacy `meshState`.
- Full EDS config + mesh suites GREEN.

## Risks

- **HIGHEST-RISK STEP** — breaking the mesh→storefront edge breaks every EDS demo. Mitigation: golden
  byte-identical snapshot is written BEFORE the change; the change only moves the read behind an accessor
  that read-throughs to the same value. No write-side change to `meshState` in D1.
