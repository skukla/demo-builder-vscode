# Step 4: Verify Frontend .env Generation Uses Single Source

## Purpose

Verify that frontend component .env files receive MESH_ENDPOINT from `componentInstances['commerce-mesh'].endpoint` (the single source of truth) rather than from `componentConfigs`.

**Status:** ✅ COMPLETE

## Prerequisites

- [x] Step 1 complete (readers updated)

## Context

The `projectFinalizationService.ts` already reads from the correct source (line 45):
```typescript
const deployedMeshEndpoint = project.componentInstances?.['commerce-mesh']?.endpoint;
```

This step adds explicit test coverage for this integration path.

## Tests to Write First

- [x] Test: projectFinalizationService passes mesh endpoint to envFileGenerator
  - **Given:** Project with `componentInstances['commerce-mesh'].endpoint` set
  - **When:** `generateEnvironmentFiles()` is called
  - **Then:** Frontend .env receives MESH_ENDPOINT from componentInstances, not componentConfigs
  - **File:** `tests/features/project-creation/services/projectFinalizationService-meshEndpoint.test.ts`

- [x] Test: Frontend .env gets correct endpoint even when componentConfigs differs
  - **Given:** componentInstances has endpoint "https://correct.io", componentConfigs has "https://stale.io"
  - **When:** Environment files generated
  - **Then:** .env contains "https://correct.io" (single source wins)
  - **File:** Same test file

## Files to Verify

- [x] `src/features/project-creation/services/projectFinalizationService.ts` - Confirm lines 44-55 read from componentInstances

## Implementation Details

**RED Phase:**
```typescript
describe('projectFinalizationService - mesh endpoint source', () => {
  it('should use componentInstances endpoint over componentConfigs', async () => {
    const project = {
      componentInstances: {
        'commerce-mesh': { endpoint: 'https://correct.io/graphql' },
        'frontend': { path: '/path/to/frontend' }
      }
    };
    const config = { componentConfigs: { frontend: { MESH_ENDPOINT: 'https://stale.io' } } };

    await generateEnvironmentFiles(context);

    expect(envConfig.apiMesh.endpoint).toBe('https://correct.io/graphql');
  });
});
```

**GREEN Phase:** Verify existing implementation passes (no code changes expected)

**REFACTOR Phase:** Consider adding JSDoc comment clarifying the source of truth

## Expected Outcome

- Test suite explicitly validates single source of truth for frontend .env
- No changes to production code (already correct)
- Documentation improved via test as specification

## Acceptance Criteria

- [x] New test file covers mesh endpoint propagation
- [x] Test explicitly asserts componentInstances is used, not componentConfigs
- [x] All existing tests pass (6163 tests)
