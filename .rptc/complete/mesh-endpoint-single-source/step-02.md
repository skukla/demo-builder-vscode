# Step 2: Remove Duplicate Writes from deployMesh.ts

## Purpose

Remove the redundant write block (lines 264-282) that persists `MESH_ENDPOINT` to `componentConfigs`. After Step 1, readers use `componentInstances['commerce-mesh'].endpoint`, making this duplicate write unnecessary.

**Status:** ✅ COMPLETE

## Prerequisites

- [x] Step 1 complete (readers updated to use single source)

## Tests to Write First

- [ ] **Test:** Mesh deployment does not write to componentConfigs
  - **Given:** Successful mesh deployment with endpoint
  - **When:** Deployment completes and project is saved
  - **Then:** `project.componentConfigs[frontendId]['MESH_ENDPOINT']` is NOT set
  - **File:** `tests/features/mesh/commands/deployMesh-storage.test.ts`

- [ ] **Test:** Mesh endpoint stored only in componentInstances
  - **Given:** Successful mesh deployment
  - **When:** Project state saved after deployment
  - **Then:** `componentInstances['commerce-mesh'].endpoint` contains deployed URL
  - **File:** `tests/features/mesh/commands/deployMesh-storage.test.ts`

## Files to Modify

- [ ] `src/features/mesh/commands/deployMesh.ts` - Remove lines 264-282 (duplicate write block)

## Implementation Details

**RED Phase:** Write tests verifying no write to componentConfigs

**GREEN Phase:** Remove lines 264-282:
```typescript
// DELETE THIS BLOCK (lines 264-282):
// Persist MESH_ENDPOINT to componentConfigs for frontend
// Dashboard checks componentConfigs for MESH_ENDPOINT (not meshComponent.endpoint)
if (deployedEndpoint) {
    const frontendEntry = getComponentInstanceEntries(project)
        .find(([, instance]) => instance.type?.startsWith('frontend'));
    if (frontendEntry) {
        // ... all the componentConfigs write logic
    }
}
```

Keep line 250 which already writes: `meshComponent.endpoint = deployedEndpoint;`

**REFACTOR Phase:** Remove unused import `getComponentInstanceEntries` if no longer needed

## Expected Outcome

- Mesh deployment writes endpoint to single location only
- No writes to `componentConfigs` for MESH_ENDPOINT
- Existing deployment tests pass

## Acceptance Criteria

- [ ] Lines 264-282 removed from deployMesh.ts
- [ ] Mesh deployment still stores endpoint in componentInstances
- [ ] No regression in deployment flow
- [ ] All existing tests pass
