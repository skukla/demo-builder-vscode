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
| `meshState` | Mesh deployment | Mesh endpoint, deployed config hash |
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
- `endpoint` - DEPRECATED: Use `meshState` for mesh endpoint
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

### meshState

**Purpose**: Track API Mesh DEPLOYMENT state

**Authoritative Fields**:
- `envVars` - Environment variables at time of deployment
- `sourceHash` - Hash of mesh source files at deployment
- `lastDeployed` - ISO timestamp of last successful deployment
- `endpoint` - **AUTHORITATIVE** mesh GraphQL endpoint URL
- `userDeclinedUpdate` - User declined redeploy prompt
- `declinedAt` - When user declined

**Write Authority**:
- `src/features/mesh/services/stalenessDetector.ts` - After successful deployment
- `src/features/mesh/services/meshVerifier.ts` - Clear on verification failure

**Read Locations**: Dashboard status, staleness detection, env file generation

**CRITICAL**: The mesh endpoint is ONLY authoritative in `meshState`. Any endpoint
stored in `componentInstances['commerce-mesh'].endpoint` is DEPRECATED and will
be removed in a future version.

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

## Audit Findings

### Resolved: Mesh Endpoint Single Source of Truth (Fixed)

**Issue**: Mesh endpoint was previously written in multiple locations:
1. `componentInstances['commerce-mesh'].endpoint` (primary, via deployMesh.ts)
2. `componentInstances['commerce-mesh'].endpoint` (secondary, via meshVerifier.ts)
3. `componentConfigs['commerce-mesh'].MESH_ENDPOINT` (configuration storage)

**Resolution** (Phase 1 - 2025-12-30):
- Removed redundant writes in `meshVerifier.ts`
- Consolidated to single write location in `deployMesh.ts`

**Resolution** (Phase 2 - 2025-12-31 - CURRENT):
- `meshState.endpoint` is now the AUTHORITATIVE location for mesh endpoint
- Added `endpoint` field to `meshState` type definition
- All writes go to `meshState.endpoint` via `updateMeshState()`
- All reads use `getMeshEndpoint()` or check `meshState.endpoint` first
- `componentInstances['commerce-mesh'].endpoint` marked as `@deprecated`
- Backward compatibility: reads fall back to legacy location for old projects

**Status**: COMPLETED. Single source of truth is `meshState.endpoint`.
Files updated:
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
- `meshState.envVars` - Snapshot at deployment time
- `frontendEnvState.envVars` - Snapshot at demo start

**Analysis**: These are NOT overlaps but intentional snapshots:
- `componentConfigs` = Current user configuration (AUTHORITATIVE)
- `meshState.envVars` = Config at last deployment (HISTORICAL for staleness)
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
   - Add TSDoc comments on `componentInstances`, `componentConfigs`, `meshState`
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

### meshState Write Locations

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
