# Step 1: Use Existing `getProjectFrontendPort()` Helper

## Purpose

Replace deep optional chaining patterns with the existing `getProjectFrontendPort()` helper function to comply with SOP §4.

## Files to Modify

- `src/features/dashboard/handlers/dashboardHandlers.ts:387`
- `src/features/project-creation/handlers/executor.ts:97`
- `src/core/vscode/StatusBarManager.ts:73`

## Tests to Write First

**No new tests needed** - this is a refactoring step. Existing tests must pass.

Verify existing tests cover these files:
- `tests/features/dashboard/handlers/dashboardHandlers-*.test.ts`
- `tests/features/project-creation/handlers/executor.test.ts` (if exists)

## Implementation

Replace:
```typescript
const port = project.componentInstances?.['citisignal-nextjs']?.port;
```

With:
```typescript
import { getProjectFrontendPort } from '@/types/typeGuards';
const port = getProjectFrontendPort(project);
```

## Expected Outcome

- All 3 files import and use `getProjectFrontendPort`
- No direct deep chaining access to `componentInstances?.['citisignal-nextjs']?.port`
- All existing tests pass

## Acceptance Criteria

- [ ] dashboardHandlers.ts uses getProjectFrontendPort
- [ ] executor.ts uses getProjectFrontendPort
- [ ] StatusBarManager.ts uses getProjectFrontendPort
- [ ] All existing tests pass
