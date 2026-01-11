# Step 4: Update project-creation files

## Summary
Replace 'commerce-mesh' string literals in project-creation feature files with COMPONENT_IDS.COMMERCE_MESH constant.

## Purpose
Centralize component ID usage in project creation workflow to ensure consistency with mesh and other features.

## Prerequisites
- [ ] Step 1 complete (COMPONENT_IDS exists in src/core/constants.ts)
- [ ] Step 2 complete (typeGuards.ts updated)
- [ ] Step 3 complete (mesh feature files updated)

## Tests to Write First (TDD)

### Test: Verify imports work correctly
No new test file needed - existing test suites validate behavior. Run existing tests after changes to verify no regressions.

## Files to Modify

| File | Occurrences | Description |
|------|-------------|-------------|
| `src/features/project-creation/handlers/executor.ts` | 8 | Mesh component access and definitions |
| `src/features/project-creation/services/meshSetupService.ts` | 8 | Mesh setup and linking |
| `src/features/project-creation/services/projectFinalizationService.ts` | 1 | Skip mesh in env generation |
| `src/features/project-creation/services/ProjectSetupContext.ts` | 1 | getMeshEndpoint accessor |
| `src/features/project-creation/ui/wizard/wizardHelpers.ts` | 2 | hasMeshComponentSelected helper |
| `src/features/project-creation/ui/steps/ProjectCreationStep.tsx` | 1 | needsMeshCheck condition |
| `src/features/project-creation/ui/steps/reviewStepHelpers.tsx` | 3 | Middleware section in review |

## Implementation Details

### GREEN Phase

**1. executor.ts** - Add import and replace 7 occurrences:
```typescript
import { COMPONENT_IDS } from '@/core/constants';
// Replace: project.componentInstances?.['commerce-mesh']
// With:    project.componentInstances?.[COMPONENT_IDS.COMMERCE_MESH]
```

**2. meshSetupService.ts** - Add import and replace 6 occurrences:
```typescript
import { COMPONENT_IDS } from '@/core/constants';
// Replace all 'commerce-mesh' string literals
```

**3. projectFinalizationService.ts** - Add import and replace 1 occurrence:
```typescript
import { COMPONENT_IDS } from '@/core/constants';
// Replace: if (compId === 'commerce-mesh')
// With:    if (compId === COMPONENT_IDS.COMMERCE_MESH)
```

**4. ProjectSetupContext.ts** - Add import and replace 1 occurrence:
```typescript
import { COMPONENT_IDS } from '@/core/constants';
// Replace: this.project.componentInstances?.['commerce-mesh']?.endpoint
// With:    this.project.componentInstances?.[COMPONENT_IDS.COMMERCE_MESH]?.endpoint
```

**5. wizardHelpers.ts** - Add import and replace 1 occurrence:
```typescript
import { COMPONENT_IDS } from '@/core/constants';
// Replace: components?.dependencies?.includes('commerce-mesh')
// With:    components?.dependencies?.includes(COMPONENT_IDS.COMMERCE_MESH)
```

**6. ProjectCreationStep.tsx** - Add import and replace 1 occurrence:
```typescript
import { COMPONENT_IDS } from '@/core/constants';
// Replace: state.components?.dependencies?.includes('commerce-mesh')
// With:    state.components?.dependencies?.includes(COMPONENT_IDS.COMMERCE_MESH)
```

**7. reviewStepHelpers.tsx** - Add import and replace 3 occurrences:
```typescript
import { COMPONENT_IDS } from '@/core/constants';
// Replace all 'commerce-mesh' in dependency checks and filters
```

### REFACTOR Phase
- Verify all imports use `@/core/constants` path alias
- Run existing test suites to ensure no regressions
- Verify TypeScript compilation succeeds

## Expected Outcome
- All 24 occurrences of 'commerce-mesh' in project-creation replaced with constant
- Existing tests continue to pass
- No functional changes to behavior

## Acceptance Criteria
- [ ] All 7 files updated with COMPONENT_IDS import
- [ ] All 24 string literals replaced
- [ ] TypeScript compiles without errors
- [ ] Existing tests pass
