# Step 1: Update Readers to Use Single Source

**Purpose:** Modify `getMeshEndpointFromConfigs()` to ONLY check `componentInstances['commerce-mesh'].endpoint`, rename to `getMeshEndpoint()` to reflect simplified behavior

**Status:** ✅ COMPLETE

**Prerequisites:**
- [x] Understanding of current dual-source logic (componentConfigs fallback to componentInstances)
- [x] No active mesh deployments during refactor

---

## Tests to Write First

### Test 1: Returns endpoint from componentInstances

- [ ] **Test:** `getMeshEndpoint returns endpoint from commerce-mesh instance`
  - **Given:** Project with `componentInstances['commerce-mesh'].endpoint = 'https://mesh.adobe.io'`
  - **When:** `getMeshEndpoint(project)` called
  - **Then:** Returns `'https://mesh.adobe.io'`
  - **File:** `tests/features/dashboard/services/dashboardStatusService.test.ts`

### Test 2: Returns undefined when no commerce-mesh

- [ ] **Test:** `getMeshEndpoint returns undefined when commerce-mesh missing`
  - **Given:** Project with no `componentInstances['commerce-mesh']`
  - **When:** `getMeshEndpoint(project)` called
  - **Then:** Returns `undefined`
  - **File:** `tests/features/dashboard/services/dashboardStatusService.test.ts`

### Test 3: Returns undefined for empty endpoint

- [ ] **Test:** `getMeshEndpoint returns undefined for empty string endpoint`
  - **Given:** Project with `componentInstances['commerce-mesh'].endpoint = ''`
  - **When:** `getMeshEndpoint(project)` called
  - **Then:** Returns `undefined`
  - **File:** `tests/features/dashboard/services/dashboardStatusService.test.ts`

### Test 4: Ignores componentConfigs (breaking change validation)

- [ ] **Test:** `getMeshEndpoint ignores componentConfigs MESH_ENDPOINT`
  - **Given:** Project with `componentConfigs.frontend.MESH_ENDPOINT = 'old-url'` but no commerce-mesh instance
  - **When:** `getMeshEndpoint(project)` called
  - **Then:** Returns `undefined` (does NOT read from componentConfigs)
  - **File:** `tests/features/dashboard/services/dashboardStatusService.test.ts`

---

## Files to Modify

- [ ] `src/features/dashboard/services/dashboardStatusService.ts`
  - Rename `getMeshEndpointFromConfigs` to `getMeshEndpoint`
  - Simplify: remove componentConfigs loop (lines 82-89)
  - Keep only componentInstances check (lines 91-95)

- [ ] `src/features/dashboard/handlers/meshStatusHelpers.ts`
  - Update import: `getMeshEndpointFromConfigs` -> `getMeshEndpoint`
  - Update re-export
  - Update call in `determineMeshStatus()` (line 189)

- [ ] `src/features/dashboard/services/index.ts`
  - Update export name

- [ ] `tests/features/dashboard/services/dashboardStatusService.test.ts`
  - Rename describe block and tests
  - Update test cases for new single-source behavior
  - Remove tests for componentConfigs fallback logic

---

## Implementation Details

### RED Phase
Write new tests for `getMeshEndpoint()` with single-source behavior. Tests will fail because function doesn't exist yet.

### GREEN Phase
1. Rename function in `dashboardStatusService.ts`
2. Delete lines 82-89 (componentConfigs loop)
3. Update imports/exports in `meshStatusHelpers.ts` and `index.ts`
4. Update call site in `determineMeshStatus()`

### REFACTOR Phase
- Simplify JSDoc comment to reflect single-source behavior
- Remove "checks componentConfigs first" language

---

## Expected Outcome

- [ ] `getMeshEndpoint()` reads ONLY from `componentInstances['commerce-mesh'].endpoint`
- [ ] No code references `componentConfigs` for mesh endpoint
- [ ] All tests pass with new behavior
- [ ] Function name reflects simplified purpose

## Acceptance Criteria

- [ ] Function renamed from `getMeshEndpointFromConfigs` to `getMeshEndpoint`
- [ ] componentConfigs logic completely removed
- [ ] All imports/exports updated
- [ ] Tests updated to verify single-source behavior
- [ ] No breaking changes to callers (same signature, just simpler behavior)

**Estimated Time:** 30 minutes
