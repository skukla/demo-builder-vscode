# Step 3: Remove Duplicate Writes from executor.ts

## Purpose

Remove the redundant `componentConfigs[frontendId]['MESH_ENDPOINT']` write block in executor.ts. The mesh endpoint is already correctly stored at `componentInstances['commerce-mesh'].endpoint` (line 418).

**Status:** ✅ COMPLETE

## Prerequisites

- [x] Step 1 complete (readers use single source)

## Tests to Write First

- [ ] Test: Project creation works without componentConfigs mesh endpoint
  - **Given:** Project with mesh deployed via wizard step
  - **When:** Project creation completes
  - **Then:** `componentInstances['commerce-mesh'].endpoint` is set, `componentConfigs` does NOT contain `MESH_ENDPOINT`
  - **File:** `tests/features/project-creation/handlers/executor-meshEndpointStorage.test.ts`

## Files to Modify

- [ ] `src/features/project-creation/handlers/executor.ts` - Remove lines 427-439 (componentConfigs write block)

## Implementation Details

**RED Phase:** Write test verifying componentConfigs does not contain MESH_ENDPOINT after project creation.

**GREEN Phase:** Delete the block at lines 427-439:
```typescript
// DELETE THIS ENTIRE BLOCK:
// Persist MESH_ENDPOINT to componentConfigs so exports include it
const meshEndpoint = project.componentInstances?.['commerce-mesh']?.endpoint;
if (meshEndpoint && typedConfig.components?.frontend) {
    // ... lines 430-439
}
```

**REFACTOR Phase:** None needed - pure deletion.

## Expected Outcome

- Project creation stores mesh endpoint only in `componentInstances['commerce-mesh'].endpoint`
- No duplicate writes to `componentConfigs`
- All existing tests pass

## Acceptance Criteria

- [ ] Lines 427-439 deleted from executor.ts
- [ ] New test passes
- [ ] All existing executor tests pass
- [ ] No `MESH_ENDPOINT` in componentConfigs after project creation
