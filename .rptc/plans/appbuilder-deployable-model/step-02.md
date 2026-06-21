# Step 02 — One-time read-migration: `meshState`/`appState` → `deployables`

**Purpose:** Migrate existing projects' singular state into the keyed `deployables` map at LOAD time
(read-side), so every existing project surfaces as deployables without rewriting on-disk manifests in
D1. On-disk migration (write-side) is deferred to D3; until then the migration is idempotent and runs
on each load. The legacy `meshState`/`appState` remain on the in-memory `Project` for D1 (mesh edge
still reads them via accessor read-through from step 01).

**Prerequisites:** Step 01.

**Reuse / surgical anchors (verified):**
- `src/core/state/projectFileLoader.ts` — `ProjectManifest` (lines 40–60) + `loadProject` mapping
  (lines 100–119). This is the single seam where manifest → `Project`. `meshState` is mapped at line
  112; `appState` is NOT currently in `ProjectManifest` (add it for migration completeness).

## Tests to write FIRST (RED)

New file: `tests/core/state/deployableMigration.test.ts`

- [ ] `migrateLegacyToDeployables(manifest)` with only `meshState` → `deployables` map containing one
      `kind:'mesh'` entry keyed by a stable mesh id (e.g. `'mesh'` or derived from the mesh component
      id) with `endpoint`, `sourceHash`, `lastDeployed` copied across.
- [ ] with only `appState` → one `kind:'integration'` entry (`url`, `deployedUrls`, `sourceHash`).
- [ ] with BOTH → two entries, distinct ids, no collision.
- [ ] with NEITHER → returns `{}` (no deployables key fabricated).
- [ ] with `deployables` ALREADY present (forward-state project) → returned unchanged (idempotent; does
      not double-migrate).
- [ ] **Malformed legacy state** (e.g. `meshState` with no `endpoint`/`lastDeployed`) → migrates
      defensively to `status:'not-deployed'` rather than throwing or dropping the entry (no silent loss).

Extend `tests/core/state/projectFileLoader.test.ts` (existing):

- [ ] `loadProject` of a manifest fixture with legacy `meshState` yields a `Project` whose
      `getMeshDeployable(project)` returns the migrated entry (round-trip through the real loader).
- [ ] `loadProject` does NOT mutate the on-disk manifest file (read-only migration in D1).

## Files to create / modify

- CREATE `src/core/state/deployableMigration.ts` — pure `migrateLegacyToDeployables(manifest)` →
  `Record<string, DeployableState>`.
- MODIFY `src/core/state/projectFileLoader.ts`:
  - Add `appState?: Project['appState']` to `ProjectManifest`.
  - In `loadProject`, after building `project`, set `project.deployables =
    migrateLegacyToDeployables(manifest)` (merging any manifest-supplied `deployables`).

## RED → GREEN → REFACTOR

- RED: migration fn + loader integration fail.
- GREEN: implement defensive mapping; idempotent guard on existing `deployables`.
- REFACTOR: extract `meshToDeployable` / `appToDeployable` helpers (<20 lines each).

## Acceptance criteria

- Legacy projects load with a populated `deployables` map; new/forward projects unaffected.
- On-disk manifest untouched; full suite GREEN.

## Risks

- **Silent data loss on partial legacy state.** Mitigation: the malformed-state RED test forces a
  defensive default rather than a throw/drop. Log a debug line when defaulting.
- **Key collision** between a migrated mesh and a migrated app. Mitigation: distinct fixed ids
  (`mesh` vs the app's component id); test asserts no overlap.
