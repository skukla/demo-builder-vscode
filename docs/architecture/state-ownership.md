# State Ownership Documentation

**Created:** 2025-12-30
**Purpose:** Establish single-source-of-truth principle for project state management
**Trigger:** Mesh endpoint dual-storage bug revealed inconsistent state patterns

---

## Single-Source-of-Truth Principle

**Core Rule**: Every piece of data MUST live in exactly ONE authoritative location.

When data is stored in multiple places:
1. Writes can fail partially, causing inconsistent state
2. Reads may return different values depending on which location is checked
3. Debugging becomes exponentially harder ("which version is correct?")
4. Bug fixes require changes in multiple places

**Enforcement**: Before writing any data to project state, ask:
- "Where is the authoritative source for this data?"
- "Am I writing to the authoritative source?"
- "If this is a derived/cached value, where is it derived from?"

---

## Project State Fields

The `Project` type (`src/types/base.ts`) contains these key state containers:

| Field | Purpose | Authoritative For |
|-------|---------|-------------------|
| `componentInstances` | Runtime state | Component status, PID, port |
| `componentConfigs` | Configuration | Environment variables per component |
| `componentSelections` | User choices | Which components were selected |
| `appBuilderComponents` | App Builder deploy state (keyed) | Mesh endpoint + staleness baseline, per-integration URLs/status |
| `additionalConsoleApis` | User-picked APIs | Extra Adobe Console APIs picked beyond the required sets |
| `meshState` | LEGACY-READ-ONLY | Nothing — migration input for old manifests |
| `appState` | LEGACY-READ-ONLY | Nothing — migration input for old manifests |
| `frontendEnvState` | Config snapshot | Frontend env vars at demo start |
| `componentVersions` | Version tracking | Component versions for updates |

---

## Field Ownership Mapping

### componentInstances

**Purpose**: Track RUNTIME state of installed components

**Authoritative Fields**:
- `status` - Current lifecycle status (ready, running, stopped, error)
- `pid` - Process ID when running locally
- `port` - Port number when running locally
- `lastUpdated` - Timestamp of last status change
- `metadata` - Runtime metadata (NOT configuration)

**NOT Authoritative For**:
- `endpoint` - DEPRECATED: resolve the mesh endpoint via `getMeshEndpointUrl(project)` (keyed `appBuilderComponents` mesh entry)
- Configuration values - Use `componentConfigs`

**Write Authority**:
- `src/features/components/services/componentManager.ts` - Status, lastUpdated, metadata
- `src/features/lifecycle/` - PID, port when starting/stopping

**Read Locations**: Dashboard, lifecycle commands, mesh verification

---

### componentConfigs

**Purpose**: Store CONFIGURATION (environment variables) for each component

**Authoritative Fields**:
- Component-keyed environment variables
- User-provided configuration values
- Default values from component definitions

**Write Authority**:
- `src/features/dashboard/commands/configure.ts` - User configuration changes
- `src/features/project-creation/handlers/executor.ts` - Initial setup from mesh .env

**Read Locations**: Configure UI, env file generation, staleness detection

---

### appBuilderComponents (keyed — the single source of truth)

**Purpose**: Track App Builder DEPLOY state — one keyed entry per deployable
(the mesh is one `kind: 'mesh'` entry; each custom integration is a
`kind: 'integration'` entry). This is the **AUTHORITATIVE** and only persisted
model (ADR-011 D3; the singular `meshState`/`appState` write-side was retired
in Step 07).

**Authoritative Fields** (per entry):
- `status` - deployed / stale / error / not-deployed
- `endpoint` - **AUTHORITATIVE** mesh GraphQL endpoint URL (mesh kind)
- `envVars` - Deployed env-var baseline for staleness detection (mesh kind)
- `sourceHash` - Hash of source files at deployment
- `lastDeployed` - ISO timestamp of last successful deployment
- `userDeclinedUpdate` / `declinedAt` - The "Later" decline flow (mesh kind)
- `url` / `deployedUrls` - Deployed integration URLs (integration kind)
- `source` / `name` - Per-integration provenance + display name

**Write Authority**:
- `src/features/mesh/services/stalenessDetector.ts` (`updateMeshState`) - THE
  mesh writer chokepoint (creation, EDS reset, project reset, headless deploy)
- `src/features/app-builder/services/appBuilderDeployOutcome.ts`
  (`recordDeployOutcome`) - the shared keyed-write seam
- `src/features/app-builder/services/appBuilderComponentRunner.ts` - keyed runner
- `src/features/mesh/services/meshVerifier.ts` - when the mesh is gone remotely,
  mark the keyed mesh entry `not-deployed` (volatile deploy record cleared,
  identity fields kept so a redeploy re-lands on the same entry)
- `src/features/app-builder/services/appComponentManager.ts` - remove an entry

**Read Locations**: Everything reads through the accessors —
`getMeshEndpointUrl` (typeGuards), `getMeshAppBuilderComponent` /
`getIntegrationAppBuilderComponents` / `listAppBuilderComponents`
(appBuilderComponentState) — never the legacy singletons directly (enforced by
`tests/core/state/singularStateAccessGuard.test.ts`).

---

### additionalConsoleApis

**Purpose**: The extra Adobe Console APIs the user picked beyond each
integration's required set. Unioned with the always-on set when the workspace
credential's subscriptions are reconciled.

**Write Authority**:
- `src/features/project-creation/` wizard creation union (`unionConsoleApiPicks`
  → `buildInitialProject`)
- The `add_console_apis` MCP handler
- The dashboard Manage-APIs reconcile

**Persistence**: Manifest-persisted since the §E fix (2026-07-16); absent on
legacy manifests (loads as empty). Unlike integration sources — which are
DERIVED from the keyed `appBuilderComponents` map — the picked APIs are NOT
derivable from anything else. Before the fix they lived only in memory, so a
reload lost them and the next redeploy silently unsubscribed them.

---

### meshState / appState (LEGACY-READ-ONLY)

**Purpose**: Load legacy manifests only. Old `.demo-builder.json` files (of
arbitrary age) carry the singular `meshState`/`appState`; the loader reads them
and `migrateLegacyToAppBuilderComponents` folds them into the keyed map. On the
project's first save the manifest is forward-migrated: the keyed map is written
and the legacy singulars are dropped.

**Write Authority**: NONE. No production code writes these fields anymore
(ADR-011 D3 Step 07). The only remaining assignments are *clearing* writes
(`meshVerifier`, `stalenessDetector`, `appComponentManager`) that prevent the
accessors' legacy-synthesis fallback from resurrecting stale in-memory state.

**CRITICAL**: The legacy `meshState` is never authoritative — the mesh endpoint
lives on the keyed mesh `appBuilderComponents` entry. Any endpoint stored in
`componentInstances['commerce-mesh'].endpoint` is DEPRECATED as well.

---

### frontendEnvState

**Purpose**: Snapshot frontend configuration at demo start (for restart detection)

**Authoritative Fields**:
- `envVars` - Frontend env vars captured when demo started
- `capturedAt` - ISO timestamp of capture

**Write Authority**:
- `src/core/state/projectStateSync.ts` - On demo start
- `src/features/lifecycle/commands/stopDemo.ts` - Clear on stop

**Read Locations**: Restart detection, config change detection

---

---

## WizardState Caches

The wizard-side `WizardState` (React, not persisted to disk) contains caches that survive backward navigation but are cleared on stack or architecture change.

| Field | Purpose | Write Authority | Cleared When |
|-------|---------|-----------------|--------------|
| `storeDiscoveryData` | Commerce store hierarchy (websites / store groups / store views) fetched from the REST API during the Connect Commerce step | `WizardContainer` via `onStoreDiscoveryDataChange` callback | Architecture change |

`storeDiscoveryData` is **not** part of the extension-side `Project` type and is **not** persisted to disk. It is a transient wizard cache that drives the progressive store-code pickers.

## SharedState Runtime Fields

`SharedState` (the `context.sharedState` bag on `HandlerContext`) holds transient runtime fields that are never persisted to disk.

`SharedState` holds **no credential-bearing fields**. Store discovery carries PaaS admin credentials in the `discover-store-structure` payload itself (a self-contained request), so no server-side credential cache exists. An earlier `currentComponentConfigs` field plus a `sync-component-configs` message were removed because the separate sync raced the discovery dispatch — see `src/features/eds/handlers/edsHandlers.ts` (`handleDiscoverStoreStructure`).

---

## Audit Findings

### Resolved: Mesh Endpoint Single Source of Truth (Fixed)

**Issue**: Mesh endpoint was previously written in multiple locations:
1. `componentInstances['commerce-mesh'].endpoint` (primary, via deployMesh.ts)
2. `componentInstances['commerce-mesh'].endpoint` (secondary, via meshVerifier.ts)
3. `componentConfigs['commerce-mesh'].MESH_ENDPOINT` (configuration storage)

**Resolution** (Phase 1 - 2025-12-30):
- Removed redundant writes in `meshVerifier.ts`
- Consolidated to single write location in `deployMesh.ts`

**Resolution** (Phase 2 - 2025-12-31):
- `meshState.endpoint` is now the AUTHORITATIVE location for mesh endpoint
- Added `endpoint` field to `meshState` type definition
- All writes go to `meshState.endpoint` via `updateMeshState()`
- All reads use `getMeshEndpoint()` or check `meshState.endpoint` first
- `componentInstances['commerce-mesh'].endpoint` marked as `@deprecated`
- Backward compatibility: reads fall back to legacy location for old projects

**Resolution** (Phase 3 - 2026-07-15 - ADR-011 D3 Step 07 - CURRENT):
- The keyed `appBuilderComponents` map is now the single persisted authority
  for ALL App Builder deploy state (mesh endpoint + staleness baseline,
  per-integration URLs/status)
- `writeManifest` no longer serializes `meshState`/`appState`; legacy manifests
  keep loading via the read-migration and forward-migrate on first save
- `updateMeshState()` writes the keyed mesh entry (the writer chokepoint) and
  clears the in-memory legacy singleton
- All reads go through the keyed-first accessors (`getMeshEndpointUrl`,
  `getMeshAppBuilderComponent`, …) — enforced by
  `tests/core/state/singularStateAccessGuard.test.ts`

**Status**: COMPLETED. Single source of truth is the keyed mesh
`appBuilderComponents` entry (`meshState.endpoint` was the Phase-2 authority,
now legacy-read-only).
Files updated (Phase 2, historical):
- `src/types/base.ts` - Added `endpoint` to `meshState`, deprecated on `ComponentInstance`
- `src/features/mesh/services/stalenessDetector.ts` - `updateMeshState()` sets endpoint
- `src/features/mesh/commands/deployMesh.ts` - Writes to `meshState.endpoint`
- `src/features/project-creation/services/meshSetupService.ts` - Writes to `meshState.endpoint`
- `src/features/project-creation/handlers/executor.ts` - Writes to `meshState.endpoint`
- `src/features/dashboard/services/dashboardStatusService.ts` - `getMeshEndpoint()` updated
- All read locations updated with fallback for backward compatibility

---

### Potential Overlap: Environment Variable Storage

**Observation**: Environment variables can appear in multiple locations:
- `componentConfigs[componentId]` - Configuration UI values
- the keyed `appBuilderComponents` mesh entry's `envVars` - Snapshot at deployment time
- `frontendEnvState.envVars` - Snapshot at demo start

**Analysis**: These are NOT overlaps but intentional snapshots:
- `componentConfigs` = Current user configuration (AUTHORITATIVE)
- keyed mesh entry `envVars` = Config at last deployment (HISTORICAL for staleness)
- `frontendEnvState.envVars` = Config at demo start (HISTORICAL for restart)

**Verdict**: Not a violation. Each serves a distinct purpose.

---

## Remediation Items

### Completed

1. **[DONE] Remove legacy endpoint writes in meshVerifier.ts**
   - File: `src/features/mesh/services/meshVerifier.ts`
   - Lines: 153, 295, 299
   - Action: Removed writes to `meshComponent.endpoint` in verifier
   - Result: Single source of truth for endpoint writes is now `deployMesh.ts`
   - Completed: 2025-12-30

2. **[DONE] Migrate endpoint to meshState (single source of truth)**
   - Added `endpoint` field to `meshState` type in `src/types/base.ts`
   - Updated all write locations to use `meshState.endpoint`
   - Updated all read locations to check `meshState.endpoint` first
   - Added `@deprecated` annotation to `ComponentInstance.endpoint`
   - Backward compatibility maintained via fallback reads
   - Completed: 2025-12-31

### Low Priority (Future)

3. **Remove deprecated endpoint from ComponentInstance type**
   - File: `src/types/base.ts`
   - Action: After sufficient migration period, remove `endpoint` field entirely
   - Note: Currently kept for backward compatibility with old project files
   - Prerequisite: All users have opened their projects at least once (auto-migrates)
   - Target: Consider for next major version

### Medium Priority

4. **Document write authority in code comments**
   - Add TSDoc comments on `componentInstances`, `componentConfigs`, `appBuilderComponents`
   - Link to this documentation

5. **Add runtime validation**
   - Consider adding development-mode warnings when writing to deprecated fields

---

## Appendix: Full Audit Results

### componentInstances Write Locations

| File | Line | Field | Operation |
|------|------|-------|-----------|
| `componentManager.ts` | 241 | (init) | Initialize empty object |
| `componentManager.ts` | 248 | status | Update status |
| `componentManager.ts` | 249 | lastUpdated | Update timestamp |
| `componentManager.ts` | 252-253 | metadata | Merge metadata |
| `componentManager.ts` | 307 | (delete) | Remove component |
| `deployMesh.ts` | 250 | endpoint | **AUTHORITATIVE** Set on successful deployment |
| ~~`meshVerifier.ts`~~ | ~~153~~ | ~~endpoint~~ | ~~REMOVED - was redundant~~ |
| ~~`meshVerifier.ts`~~ | ~~295~~ | ~~endpoint~~ | ~~REMOVED - was redundant~~ |
| ~~`meshVerifier.ts`~~ | ~~299~~ | ~~endpoint~~ | ~~REMOVED - was redundant~~ |

### componentConfigs Write Locations

| File | Line | Field | Operation |
|------|------|-------|-----------|
| `configure.ts` | 154 | (full) | Replace all configs |
| `executor.ts` | 454-456 | commerce-mesh | Initial mesh config |

### meshState Write Locations (HISTORICAL — retired by ADR-011 D3)

The singular `meshState` write-side is retired; the table below is the
pre-D3 record. Current write authority is the keyed-writer table above
("Write Authority" under the keyed `appBuilderComponents` section).

| File | Line | Field | Operation |
|------|------|-------|-----------|
| `stalenessDetector.ts` | 514 | (full) | Set after deployment |
| `meshVerifier.ts` | 293 | (clear) | Clear on error |
| `meshStatusHelpers.ts` | 249 | (full) | Import scenario |
| `dashboardHandlers.ts` | 131 | (full) | Unknown context |

### frontendEnvState Write Locations

| File | Line | Field | Operation |
|------|------|-------|-----------|
| `projectStateSync.ts` | 56 | (full) | Capture on demo start |
| `stopDemo.ts` | 179 | (clear) | Clear on demo stop |

---

## References

- Over-Engineering Analysis: `.rptc/research/over-engineering-analysis.md`
- Project Type Definition: `src/types/base.ts`
- Component Manager: `src/features/components/services/componentManager.ts`
- Mesh Staleness Detection: `src/features/mesh/services/stalenessDetector.ts`
