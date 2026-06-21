# Step 01 — `deployables` state shape + accessors (mesh/app still authoritative)

**Purpose:** Introduce the keyed `project.deployables: Record<id, DeployableState>` type and a small,
tested accessor module — WITHOUT yet moving any reads/writes off `meshState`/`appState`. Accessors
**read through** to the legacy singletons so nothing changes behaviorally. This is the foundation every
later step builds on, and it keeps the mesh edge green by construction.

**Prerequisites:** Step 00.

**Reuse / surgical anchors (verified):**
- `src/types/base.ts` lines 84–107 — existing `meshState` / `appState` shapes (do not delete in D1).
- Add `DeployableState` + `deployables?` to the `Project` interface there.

## Tests to write FIRST (RED)

New file: `tests/features/app-builder/services/deployableState.test.ts`

- [ ] `getDeployable(project, id)` returns `undefined` when `deployables` is absent.
- [ ] `getDeployable` returns the entry when present in `project.deployables`.
- [ ] **Read-through:** when `deployables` is absent but `project.meshState.endpoint` exists,
      `getMeshDeployable(project)` returns a synthesized `{ kind:'mesh', status, endpoint, source, ... }`
      derived from `meshState` (proves no behavior change for legacy projects).
- [ ] **Read-through:** same for `appState` → `getIntegrationDeployables(project)`.
- [ ] `listDeployables(project)` merges `deployables` map + read-through singletons with no duplicate ids.
- [ ] `setDeployable(project, id, state)` returns a new project object with `deployables[id]` set
      (pure; does not mutate input).
- [ ] `getProvidedEnvVars(project)` collects `providesEnvVars` values across all deployables (empty when
      none) — used by step 04. RED here defines the contract.
- [ ] `DeployableState` type guard `isDeployableState(x)` rejects malformed objects (missing `kind`).

## Files to create / modify

- CREATE `src/features/app-builder/services/deployableState.ts` — pure accessors (no I/O, no `vscode`):
  `getDeployable`, `listDeployables`, `setDeployable`, `getMeshDeployable`, `getIntegrationDeployables`,
  `getProvidedEnvVars`, `isDeployableState`.
- MODIFY `src/types/base.ts` — add:
  ```ts
  export type DeployableKind = 'mesh' | 'integration';
  export interface DeployableState {
      kind: DeployableKind;
      status: 'deployed' | 'stale' | 'error' | 'not-deployed';
      source: { owner: string; repo: string; branch?: string };
      endpoint?: string;        // mesh
      url?: string;             // integration primary URL
      deployedUrls?: Record<string, string>;
      sourceHash?: string | null;
      lastDeployed?: string;    // ISO
      providesEnvVars?: Record<string, string>; // resolved provided values (e.g. { MESH_ENDPOINT })
  }
  // on Project:
  deployables?: Record<string, DeployableState>;
  ```
- MODIFY `src/features/app-builder/services/index.ts` — export the new accessors.

## RED → GREEN → REFACTOR

- RED: accessor tests fail (module absent).
- GREEN: implement pure functions; read-through synthesizes legacy state.
- REFACTOR: keep each function <20 lines; no nested ternaries; share a `synthesizeFromLegacy` helper.

## Acceptance criteria

- Accessors compile and pass; existing suite still GREEN (additive type, no reads moved).
- No production read of `meshState`/`appState` is changed yet.

## Risks

- **Accessor drift:** future steps must use accessors, not raw `meshState`. Mitigation: steps 04/08
  consume only accessors; a lint-style grep in REFACTOR confirms new code paths use them.
