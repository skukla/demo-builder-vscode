# Step 1: Extract ProjectStatusUtils

## Summary

Extract duplicate status helper functions (`getStatusText`, `getStatusVariant`, `getFrontendPort`) from 4 component files to a shared utility file, eliminating ~144 lines of duplicate code.

## Prerequisites

- [ ] None (first step)

## Tests to Write First (RED Phase)

### getStatusText Tests
- [ ] Test: returns "Running on port X" when status is 'running' and port provided
- [ ] Test: returns "Running" when status is 'running' and no port
- [ ] Test: returns "Starting..." for 'starting' status
- [ ] Test: returns "Stopping..." for 'stopping' status
- [ ] Test: returns "Stopped" for 'stopped' status
- [ ] Test: returns "Stopped" for 'ready' status
- [ ] Test: returns "Error" for 'error' status
- [ ] Test: returns "Stopped" for unknown status (default case)

### getStatusVariant Tests
- [ ] Test: returns 'success' for 'running' status
- [ ] Test: returns 'warning' for 'starting' status
- [ ] Test: returns 'warning' for 'stopping' status
- [ ] Test: returns 'error' for 'error' status
- [ ] Test: returns 'neutral' for 'stopped' status
- [ ] Test: returns 'neutral' for 'ready' status
- [ ] Test: returns 'neutral' for unknown status (default case)

### getFrontendPort Tests
- [ ] Test: returns undefined when project status is not 'running'
- [ ] Test: returns undefined when project has no componentInstances
- [ ] Test: returns port from first component instance with a port
- [ ] Test: returns undefined when no component instances have ports

## Files to Create

- [ ] `src/features/projects-dashboard/utils/projectStatusUtils.ts` - Shared helper functions
- [ ] `tests/features/projects-dashboard/utils/projectStatusUtils.test.ts` - Unit tests

## Files to Modify

- [ ] `src/features/projects-dashboard/ui/components/ProjectCard.tsx` - Import from utils, remove local functions (lines 24-72)
- [ ] `src/features/projects-dashboard/ui/components/ProjectRow.tsx` - Import from utils, remove local functions (lines 24-72)
- [ ] `src/features/projects-dashboard/ui/components/ProjectListView.tsx` - Import from utils, remove local functions (lines 23-71)
- [ ] `src/features/projects-dashboard/ui/components/ProjectButton.tsx` - Import from utils, remove local functions (lines 40-88)

## Implementation Details

### RED Phase

Create test file at `tests/features/projects-dashboard/utils/projectStatusUtils.test.ts`:

```typescript
import { getStatusText, getStatusVariant, getFrontendPort } from '@/features/projects-dashboard/utils/projectStatusUtils';
import type { Project, ProjectStatus } from '@/types/base';

describe('projectStatusUtils', () => {
  describe('getStatusText', () => {
    it('returns "Running on port X" when running with port', () => {
      expect(getStatusText('running', 3000)).toBe('Running on port 3000');
    });
    // ... additional tests
  });

  describe('getStatusVariant', () => {
    it('returns success for running status', () => {
      expect(getStatusVariant('running')).toBe('success');
    });
    // ... additional tests
  });

  describe('getFrontendPort', () => {
    it('returns undefined when not running', () => {
      const project = { status: 'stopped' } as Project;
      expect(getFrontendPort(project)).toBeUndefined();
    });
    // ... additional tests
  });
});
```

Run tests - all should fail (RED).

### GREEN Phase

1. Create `src/features/projects-dashboard/utils/` directory
2. Create `projectStatusUtils.ts` with exported functions:

```typescript
import type { Project, ProjectStatus } from '@/types/base';

export type StatusVariant = 'success' | 'neutral' | 'warning' | 'error';

export function getStatusText(status: ProjectStatus, port?: number): string {
  switch (status) {
    case 'running':
      return port ? `Running on port ${port}` : 'Running';
    case 'starting':
      return 'Starting...';
    case 'stopping':
      return 'Stopping...';
    case 'stopped':
    case 'ready':
      return 'Stopped';
    case 'error':
      return 'Error';
    default:
      return 'Stopped';
  }
}

export function getStatusVariant(status: ProjectStatus): StatusVariant {
  switch (status) {
    case 'running':
      return 'success';
    case 'starting':
    case 'stopping':
      return 'warning';
    case 'error':
      return 'error';
    default:
      return 'neutral';
  }
}

export function getFrontendPort(project: Project): number | undefined {
  if (project.status !== 'running' || !project.componentInstances) {
    return undefined;
  }
  const frontend = Object.values(project.componentInstances).find(
    (c) => c.port !== undefined
  );
  return frontend?.port;
}
```

Run tests - all should pass (GREEN).

### REFACTOR Phase

1. Update each component file to import from shared utils:

```typescript
import { getStatusText, getStatusVariant, getFrontendPort } from '../utils/projectStatusUtils';
```

2. Remove local function definitions from each file (delete lines containing the duplicate functions)

3. Run all tests to verify no regressions

**Note**: `ProjectButton.tsx` uses 'Starting' instead of 'Starting...' - standardize to 'Starting...' for consistency.

## Expected Outcome

- 144+ lines of duplicate code eliminated (36 lines x 4 files)
- Single source of truth for status helpers
- All 4 component files import from shared utils
- Type-safe `StatusVariant` type exported for reuse

## Acceptance Criteria

- [ ] `projectStatusUtils.ts` exports 3 functions and `StatusVariant` type
- [ ] All 19 unit tests pass
- [ ] All 4 component files use shared imports
- [ ] No duplicate function definitions remain in component files
- [ ] Existing component tests still pass
- [ ] Build succeeds with no TypeScript errors

## Dependencies

- None

## Estimated Time

- 20-30 minutes
