# Step 06 — Kind-aware build (FIX the shipped `buildComponent` bug)

**Purpose:** Fix the two shipped landmines in `buildComponent` for the INTEGRATION kind (proven in the
spike, Q3): (1) it early-returns and skips `npm install` entirely when there's no top-level `build`
script; (2) it uses `--production`, stripping devDependencies a bundler needs. Mesh keeps its exact
current behavior. Integration gets a FULL `npm install` (incl. devDeps), UNCONDITIONAL (not gated on a
`build` script), then lets `aio app deploy` drive the build.

**Prerequisites:** Step 00. Independent of model/catalog; consumed by step 08.

**Reuse / surgical anchors (verified):**
- `src/core/shell/buildComponent.ts` — line 34 `INSTALL_COMMAND = 'npm install --production ...'`;
  lines 36–47 `hasBuildScript`; lines 65–67 early-return-when-no-build-script (the bug).
- Mesh caller `src/features/mesh/services/meshDeployment.ts` (`buildArgs:'-- --force'`) — MUST be
  unchanged in behavior.
- App caller `src/features/app-builder/services/appDeployment.ts` line 96–102 — currently calls
  `buildComponent` with no kind hint; will pass `kind:'integration'`.
- Existing tests: `tests/core/shell/buildComponent.test.ts` (+ `.testUtils.ts`).

## Tests to write FIRST (RED)

Extend `tests/core/shell/buildComponent.test.ts`:

- [ ] **THE RED TEST (spike-mandated):** an integration component (`kind:'integration'`) with **no
      top-level `build` script** still runs `npm install` (assert the executor received an install
      command and was NOT a no-op). Currently fails (early-return skips install).
- [ ] integration install command does NOT contain `--production` (devDeps included).
- [ ] integration install runs even when a `build` script IS present, and `buildComponent` does NOT run
      `npm run build` for integrations (build is `aio app deploy`-driven) — assert no `npm run build`.
- [ ] **Mesh unchanged:** `kind:'mesh'` (or default) with a `build` script issues the BYTE-IDENTICAL
      `npm install --production --no-fund --ignore-scripts` then `npm run build -- --force` (mesh
      regression guard — existing mesh assertions must still pass).
- [ ] mesh with no `package.json` → still a no-op (unchanged).

## Files to create / modify

- MODIFY `src/core/shell/buildComponent.ts`:
  - Add `kind?: 'mesh' | 'integration'` to `BuildComponentOptions` (default `'mesh'` to preserve current
    callers' behavior).
  - For `kind:'integration'`: skip `hasBuildScript` gating; run `npm install --no-fund --ignore-scripts`
    (NO `--production`) unconditionally when a `package.json` exists; do NOT run `npm run build`.
  - For `kind:'mesh'` (default): keep the exact existing path (early-return without build script,
    `--production`, `npm run build${buildArgs}`).
  - Keep `--ignore-scripts` for both (spike: fine for inspected templates; revisit per-repo later).
- MODIFY `src/features/app-builder/services/appDeployment.ts` — pass `kind:'integration'` in its
  `buildComponent` call (line ~99).
- MODIFY `src/features/mesh/services/meshDeployment.ts` — pass `kind:'mesh'` explicitly (no behavior
  change; clarity).

## RED → GREEN → REFACTOR

- RED: integration-no-build-script-still-installs test fails against current early-return.
- GREEN: branch by `kind`; integration install path added.
- REFACTOR: extract `installForIntegration` / keep mesh path verbatim; function <50 lines; constants for
  the two install command strings (no magic flags inline).

## Acceptance criteria

- Integration always gets `node_modules` (incl. devDeps); mesh behavior byte-identical; suite GREEN.

## Risks

- **Regressing mesh build.** Mitigation: mesh path is the untouched default branch; the byte-identical
  mesh assertion is a first-class RED/GREEN guard.
- **`--ignore-scripts` skipping a real postinstall** for arbitrary integration repos. Out of D1 scope
  (seed catalog is meshes only); note for D4/custom-URL hardening.
