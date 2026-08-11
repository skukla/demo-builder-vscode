# Step 08 — Deploy-contract runner + unify add/deploy/remove by `kind`

**Purpose:** Wire steps 01–07 into ONE add/deploy/remove path that dispatches by `kind`. The runner:
ensure project + `requiredApis` subscribed (step 07) → clone → install per-kind (step 06) → apply the
derived `ow.package` (step 05, integrations) → run the deploy under `withOrgContext` (mesh →
`deployMeshComponent`; integration → `deployAppComponent`) → read back endpoint/URLs → persist
`project.deployables[id]` via accessors (step 01) → if it `providesEnvVars`, regenerate + republish the
storefront config (step 04). Mesh and integration deploy TAILS are reused, never forked.

**Prerequisites:** Steps 01, 03, 04, 05, 06, 07.

**Reuse / surgical anchors (verified):**
- `deployMeshComponent` (`src/features/mesh/services/meshDeployment.ts`) — mesh deploy tail (unchanged).
- `deployAppComponent` (`src/features/app-builder/services/appDeployment.ts`) — integration deploy tail.
- `addAppComponent`/`removeAppComponent` (`appComponentManager.ts`, lines 114/185) — clone+install+
  undeploy patterns to generalize; `componentManager.installComponent`/`removeComponent`.
- `withOrgContext` / `buildOrgTargetFromProjectAdobe` (`src/core/shell/orgContextEnv.ts`).
- accessors `setDeployable`/`getProvidedEnvVars` (step 01); `republishStorefrontConfig` (eds).

## Tests to write FIRST (RED) — mocked CommandExecutor + SDK + fs

New file: `tests/features/app-builder/services/deployableRunner.test.ts`

- [ ] `addDeployable(project, catalogEntry, deps)` for a MESH entry: calls subscriber → clone → build
      (`kind:'mesh'`) → `deployMeshComponent` under `withOrgContext` → persists a `deployables[id]` with
      `kind:'mesh'`, `endpoint`, `providesEnvVars.MESH_ENDPOINT`, `status:'deployed'`.
- [ ] mesh add with `providesEnvVars` triggers storefront config regen + republish (assert the eds
      republish fn was invoked with the resolved endpoint).
- [ ] `addDeployable` for an INTEGRATION entry: build (`kind:'integration'`) → applies derived
      `ow.package` → `deployAppComponent` → persists `kind:'integration'` with `url`/`deployedUrls`.
- [ ] **dispatch by kind:** a mesh entry NEVER calls `deployAppComponent` and vice-versa (routing test).
- [ ] **org targeting:** the deploy runs inside `withOrgContext` with a target built from `project.adobe`
      (assert env-based targeting; assert `aio console select` is NEVER invoked).
- [ ] `deployDeployable(project, id)` (redeploy) re-runs only that deployable's tail; mesh picks
      create-vs-update from existing state; touches only its own entry.
- [ ] `removeDeployable(project, id)` for integration → `aio app undeploy` (best-effort, org-targeted) →
      clears `deployables[id]` → deletes local folder; mesh + other deployables untouched.
- [ ] `removeDeployable` for mesh → `aio api-mesh:delete` → clears entry → regenerates storefront config
      WITHOUT `MESH_ENDPOINT` (falls back to direct backend).
- [ ] **partial-failure state:** clone OK but deploy fails → `deployables[id].status='error'`, local
      folder retained for retry, error surfaced (no half-cleared state).
- [ ] **ordering:** adding a mesh-consuming integration when the provider mesh is absent → the runner
      surfaces a clear "provider not deployed" error (provider-before-consumer guard; D2 enforces in UI).

## Files to create / modify

- CREATE `src/features/app-builder/services/deployableRunner.ts` — `addDeployable`, `deployDeployable`,
  `removeDeployable`; a single `dispatchDeploy(kind, ...)` with explicit if/else (mesh vs integration).
  Each public fn <50 lines; extract `cloneAndInstall`, `persistResult` helpers.
- MODIFY `src/features/app-builder/services/index.ts` — export the runner.
- (Dashboard/wizard wiring of these functions is D2 — D1 ships the service layer + tests only. A thin
  command wrapper may call `deployDeployable` to keep the existing mesh/app dashboard buttons working;
  if so, route them through the runner WITHOUT changing their UX.)

## RED → GREEN → REFACTOR

- RED: dispatch + persist + republish + remove tests fail.
- GREEN: implement runner reusing the two deploy tails + accessors + subscriber.
- REFACTOR: collapse mesh/integration shared pre-steps (subscribe→clone→install) into one helper; keep
  the only divergence at deploy + read-back; no duplicated clone logic with `appComponentManager`.

## Acceptance criteria

- One kind-dispatched path performs add/deploy/remove; mesh tail + edge behavior unchanged; integration
  path deploys with isolated `ow.package`; state persisted via accessors; suite GREEN.

## Risks

- **Partial state on failure** (clone ok / deploy fail). Mitigation: explicit error-status test; retain
  local folder; never clear `deployables[id]` on a failed add.
- **Ordering** (consumer before provider). Mitigation: provider-presence guard test; full ordering UX is
  D2.
- **Reuse creep:** must not fork `deployMeshComponent`/`deployAppComponent`. Mitigation: routing tests
  assert the existing tails are the ones invoked.
