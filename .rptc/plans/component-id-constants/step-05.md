# Step 5: Update dashboard/lifecycle/other files

## Summary
Replace remaining 'commerce-mesh' string literals in dashboard, updates, components, and vscode modules.

## Purpose
Complete centralization of component IDs across remaining features outside project-creation and mesh.

## Prerequisites
- [ ] Step 1 complete (COMPONENT_IDS exists in src/core/constants.ts)
- [ ] Step 2 complete (typeGuards.ts updated)
- [ ] Step 3 complete (mesh feature files updated)
- [ ] Step 4 complete (project-creation files updated)

## Tests to Write First (TDD)
No new test file needed - existing test suites validate behavior. Run existing tests after changes to verify no regressions.

## Files to Modify

| File | Occurrences | Description |
|------|-------------|-------------|
| `src/features/dashboard/handlers/dashboardHandlers.ts` | 1 | componentInstances access |
| `src/features/dashboard/handlers/meshStatusHelpers.ts` | 3 | componentInstances access |
| `src/features/dashboard/services/dashboardStatusService.ts` | 3 | Endpoint fallback comments/access |
| `src/features/dashboard/ui/configure/ConfigureScreen.tsx` | 1 | Mesh component check |
| `src/features/dashboard/ui/configure/hooks/useConfigureFields.ts` | 1 | Mesh field check |
| `src/features/updates/services/componentUpdater.ts` | 1 | Skip mesh check |
| `src/features/updates/services/componentRepositoryResolver.ts` | 1 | Component repository resolution |
| `src/features/components/ui/steps/ComponentSelectionStep.tsx` | 1 | Mesh dependency check |
| `src/features/components/services/DependencyResolver.ts` | 1 | Mesh dependency logic |
| `src/features/prerequisites/handlers/shared.ts` | 6 | Mesh prerequisite checks |
| `src/core/vscode/StatusBarManager.ts` | 1 | Mesh status check |
| `src/features/projects-dashboard/utils/componentSummaryUtils.ts` | 1 | Component summary |

## Implementation Details

### GREEN Phase

Add import to each file:
```typescript
import { COMPONENT_IDS } from '@/core/constants';
```

Replace patterns:
```typescript
// Before: project.componentInstances?.['commerce-mesh']
// After:  project.componentInstances?.[COMPONENT_IDS.COMMERCE_MESH]

// Before: compId === 'commerce-mesh'
// After:  compId === COMPONENT_IDS.COMMERCE_MESH
```

### REFACTOR Phase
- Verify all imports use `@/core/constants` path alias
- Run existing test suites to ensure no regressions

## Expected Outcome
- All 21 occurrences of 'commerce-mesh' in these files replaced with constant
- Existing tests continue to pass

## Acceptance Criteria
- [ ] All 12 files updated with COMPONENT_IDS import
- [ ] All 21 string literals replaced
- [ ] TypeScript compiles without errors
- [ ] Existing tests pass
