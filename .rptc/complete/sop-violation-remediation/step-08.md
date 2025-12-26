# Step 8: Add Service Layers to 3 Features

## Purpose

Add `services/` directories to features missing dedicated service layers per consistency-patterns.md Section 11. Three features have business logic in handlers (>50 lines): dashboard, lifecycle, and project-creation. Project-creation also has services nested incorrectly under `handlers/services/` instead of at feature level.

## Prerequisites

- [ ] Steps 1-7 completed (quick wins, extractions, edsHandlers split)

## Tests to Write First

### 8.1 Dashboard Service Tests

- [ ] Test: `DashboardStatusService.buildStatusPayload` returns correct structure
  - **Given:** Project with mesh component and running status
  - **When:** `buildStatusPayload()` called
  - **Then:** Returns payload with name, path, status, port, mesh info
  - **File:** `tests/features/dashboard/services/dashboardStatusService.test.ts`

- [ ] Test: `DashboardStatusService.getMeshEndpointFromConfigs` extracts endpoint
  - **Given:** Project with MESH_ENDPOINT in componentConfigs
  - **When:** `getMeshEndpointFromConfigs()` called
  - **Then:** Returns the endpoint string
  - **File:** `tests/features/dashboard/services/dashboardStatusService.test.ts`

### 8.2 Lifecycle Service Tests

- [ ] Test: `LifecycleService.toggleLogsPanel` toggles state correctly
  - **Given:** Logs panel is hidden
  - **When:** `toggleLogsPanel()` called
  - **Then:** Returns true (now shown), calls showLogs command
  - **File:** `tests/features/lifecycle/services/lifecycleService.test.ts`

- [ ] Test: `LifecycleService.openExternalUrl` handles data URLs
  - **Given:** Data URL with HTML content
  - **When:** `openExternalUrl()` called
  - **Then:** Writes temp file and opens it
  - **File:** `tests/features/lifecycle/services/lifecycleService.test.ts`

### 8.3 Project-creation Service Location Tests

- [ ] Test: Services import from feature-level `services/` directory
  - **Given:** Import statement using `@/features/project-creation/services/`
  - **When:** Module resolved
  - **Then:** Correctly imports from `src/features/project-creation/services/`
  - **File:** `tests/features/project-creation/services/index.test.ts`

## Files to Create/Modify

### Create (New Files)

- [ ] `src/features/dashboard/services/index.ts` - Service exports
- [ ] `src/features/dashboard/services/dashboardStatusService.ts` - Status logic from meshStatusHelpers
- [ ] `src/features/lifecycle/services/index.ts` - Service exports
- [ ] `src/features/lifecycle/services/lifecycleService.ts` - Logs toggle, URL opening
- [ ] `src/features/project-creation/services/index.ts` - Re-export moved services

### Move (Relocate Files)

- [ ] Move `src/features/project-creation/handlers/services/*` to `src/features/project-creation/services/`

### Modify (Update Imports)

- [ ] `src/features/dashboard/handlers/dashboardHandlers.ts` - Import from services
- [ ] `src/features/dashboard/handlers/meshStatusHelpers.ts` - Move logic to service
- [ ] `src/features/lifecycle/handlers/lifecycleHandlers.ts` - Import from services
- [ ] `src/features/project-creation/handlers/createHandler.ts` - Update import paths

## Implementation Details

### RED Phase

Write tests that verify:
1. Dashboard status service correctly builds payloads
2. Lifecycle service correctly toggles panel state
3. Project-creation services import from correct location

### GREEN Phase

1. **Dashboard**: Create `services/dashboardStatusService.ts`:
   - Move `buildStatusPayload`, `getMeshEndpointFromConfigs`, `hasMeshDeploymentRecord` from meshStatusHelpers
   - Keep type guards (`hasAdobeWorkspaceContext`, etc.) in meshStatusHelpers (they're predicates, not services)

2. **Lifecycle**: Create `services/lifecycleService.ts`:
   - Extract `toggleLogsPanel` logic
   - Extract `openExternalUrl` logic (data URL handling)

3. **Project-creation**: Move services to feature level:
   - Move `handlers/services/componentInstallationOrchestrator.ts` to `services/`
   - Move `handlers/services/meshSetupService.ts` to `services/`
   - Move `handlers/services/projectFinalizationService.ts` to `services/`
   - Update all import paths in handlers

### REFACTOR Phase

- Ensure consistent export patterns across all three `services/index.ts` files
- Verify no circular dependencies introduced

## Expected Outcome

- Dashboard, lifecycle, and project-creation features all have `services/` directories at feature level
- Business logic (>50 lines) is in services, not handlers
- Handlers are thin coordination layers delegating to services
- Consistent with authentication, components, eds, mesh feature structures

## Acceptance Criteria

- [ ] All 3 features have `services/` directory at feature level
- [ ] Business logic extracted from handlers to services
- [ ] Project-creation services moved from `handlers/services/` to `services/`
- [ ] All imports updated and tests passing
- [ ] No circular dependencies

## Estimated Time

2-3 hours
