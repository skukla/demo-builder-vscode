# Step 3: Update mesh feature files

## Purpose
Replace hardcoded 'commerce-mesh' string literals in mesh feature files with COMPONENT_IDS.COMMERCE_MESH constant.

## Prerequisites
- [ ] Step 1: COMPONENT_IDS constant created
- [ ] Step 2: typeGuards.ts updated

## Files to Modify

### src/features/mesh/services/stalenessDetector.ts
- Line 393: `project.componentInstances?.['commerce-mesh']`
- Line 451: `newComponentConfigs['commerce-mesh']`
- Line 514: `project.componentInstances?.['commerce-mesh']`

### src/features/mesh/services/meshVerifier.ts
- Line 165: `project.componentInstances?.['commerce-mesh']`
- Line 279: `project.componentInstances?.['commerce-mesh']`

### src/features/mesh/services/meshConfig.ts
- Line 17-19: Interface property definition (keep as string literal - defines type)
- Line 34: `data?.components?.['commerce-mesh']`
- Line ~85, ~95: Additional runtime lookups (3 total replaceable occurrences)

### src/features/mesh/commands/deployMesh.ts
- Line 293: `project?.componentInstances?.['commerce-mesh']`
- Line 331: `project.componentInstances['commerce-mesh']`

## Tests to Write First

- [ ] Test: stalenessDetector uses COMPONENT_IDS.COMMERCE_MESH for mesh instance lookup
  - **Given:** Project with commerce-mesh component
  - **When:** detectMeshChanges is called
  - **Then:** Uses COMPONENT_IDS constant (verify via mock)
  - **File:** `tests/features/mesh/services/stalenessDetector-constants.test.ts`

## Implementation

1. **Add import** to each file:
   ```typescript
   import { COMPONENT_IDS } from '@/core/constants';
   ```

2. **Replace string literals**:
   ```typescript
   // Before
   project.componentInstances?.['commerce-mesh']

   // After
   project.componentInstances?.[COMPONENT_IDS.COMMERCE_MESH]
   ```

3. **Note for meshConfig.ts**: Interface property `'commerce-mesh'?` should remain as string literal since it defines the type shape, not runtime lookup.

## Acceptance Criteria
- [ ] All runtime 'commerce-mesh' lookups use COMPONENT_IDS.COMMERCE_MESH
- [ ] Existing tests pass
- [ ] No duplicate imports

## Estimated Time
30 minutes
