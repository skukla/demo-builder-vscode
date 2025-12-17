# Step 9: Test Updates

## Purpose
Add and update tests for all new components, hooks, and helpers created in previous steps. Ensure test coverage meets 85%+ target for new code.

## Prerequisites
- [ ] Steps 1-8 completed (all refactored code in place)
- [ ] Existing tests still passing

## Tests to Write First

### Helper Tests (Step 2)

- [ ] Test: meshHelpers utility functions
  - **Given:** Various mesh state scenarios
  - **When:** Helper functions called
  - **Then:** Correct boolean/string results returned
  - **File:** `tests/features/mesh/utils/meshHelpers.test.ts`

### Hook Tests (Step 5)

- [ ] Test: useMessageListener hook
  - **Given:** React component with message listener
  - **When:** Message received from VS Code
  - **Then:** Handler invoked correctly
  - **File:** `tests/core/ui/hooks/useMessageListener.test.ts`

- [ ] Test: useFieldFocus hook
  - **Given:** Form with focusable fields
  - **When:** Focus triggered
  - **Then:** Correct field receives focus
  - **File:** `tests/core/ui/hooks/useFieldFocus.test.ts`

### Component Tests (Step 4)

- [ ] Test: ConfigurationForm component
  - **Given:** Component configuration
  - **When:** Form rendered and submitted
  - **Then:** Values processed correctly
  - **File:** `tests/features/components/ui/steps/ConfigurationForm.test.tsx`

- [ ] Test: FieldRenderer component
  - **Given:** Field definition with type
  - **When:** Component rendered
  - **Then:** Correct input type displayed
  - **File:** `tests/features/components/ui/steps/FieldRenderer.test.tsx`

- [ ] Test: MeshStatusDisplay component
  - **Given:** Mesh status data
  - **When:** Component rendered
  - **Then:** Status displayed correctly
  - **File:** `tests/features/mesh/ui/steps/MeshStatusDisplay.test.tsx`

- [ ] Test: AuthLoadingState component
  - **Given:** Loading state with message
  - **When:** Component rendered
  - **Then:** Loading indicator and message shown
  - **File:** `tests/features/authentication/ui/steps/AuthLoadingState.test.tsx`

## Files to Create/Modify

### New Test Files

- [ ] `tests/features/mesh/utils/meshHelpers.test.ts` - Helper function tests
- [ ] `tests/core/ui/hooks/useMessageListener.test.ts` - Hook tests
- [ ] `tests/core/ui/hooks/useFieldFocus.test.ts` - Hook tests
- [ ] `tests/features/components/ui/steps/ConfigurationForm.test.tsx` - Component tests
- [ ] `tests/features/components/ui/steps/FieldRenderer.test.tsx` - Component tests
- [ ] `tests/features/mesh/ui/steps/MeshStatusDisplay.test.tsx` - Component tests
- [ ] `tests/features/authentication/ui/steps/AuthLoadingState.test.tsx` - Component tests

### Modified Test Files

- [ ] Update imports in affected test files for moved/renamed modules
- [ ] Update mocks for new HandlerContext variants if needed

## Implementation Details

### RED Phase

Write failing tests following project patterns:

```typescript
// tests/features/mesh/utils/meshHelpers.test.ts
import {
  isMeshDeployed,
  getMeshStatusText,
  shouldShowDeployButton
} from '@/features/mesh/utils/meshHelpers';

describe('meshHelpers', () => {
  describe('isMeshDeployed', () => {
    it('should return true when mesh endpoint exists', () => {
      const result = isMeshDeployed({ endpoint: 'https://mesh.example.com' });
      expect(result).toBe(true);
    });

    it('should return false when endpoint is empty', () => {
      const result = isMeshDeployed({ endpoint: '' });
      expect(result).toBe(false);
    });
  });
});
```

```typescript
// tests/core/ui/hooks/useMessageListener.test.ts
import { renderHook } from '@testing-library/react';
import { useMessageListener } from '@/core/ui/hooks/useMessageListener';

describe('useMessageListener', () => {
  it('should register event listener on mount', () => {
    const handler = jest.fn();
    const addEventListenerSpy = jest.spyOn(window, 'addEventListener');

    renderHook(() => useMessageListener('testMessage', handler));

    expect(addEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('should cleanup event listener on unmount', () => {
    const handler = jest.fn();
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useMessageListener('testMessage', handler));
    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalled();
  });
});
```

```tsx
// tests/features/components/ui/steps/FieldRenderer.test.tsx
import { render, screen } from '@testing-library/react';
import { FieldRenderer } from '@/features/components/ui/steps/FieldRenderer';

describe('FieldRenderer', () => {
  it('should render text input for text type', () => {
    render(<FieldRenderer field={{ type: 'text', name: 'test', label: 'Test' }} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('should render select for select type', () => {
    render(<FieldRenderer field={{ type: 'select', name: 'test', label: 'Test', options: [] }} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});
```

### GREEN Phase

1. Implement minimal code to pass each test
2. Run tests incrementally: `npm test -- tests/features/mesh/utils/meshHelpers.test.ts`
3. Verify coverage: `npm test -- --coverage`

### REFACTOR Phase

1. Consolidate common test utilities if patterns emerge
2. Ensure consistent naming conventions
3. Keep test files under 500 lines (split if needed)

## Expected Outcome

- All new helper functions have unit tests
- All new hooks have tests with mount/unmount coverage
- All new UI components have rendering tests
- Test coverage for new code meets 85%+ target
- All tests pass: `npm test`

## Acceptance Criteria

- [ ] All tests passing
- [ ] Coverage >= 85% for new code
- [ ] Test files follow project patterns (AAA, describe/it naming)
- [ ] No test file exceeds 500 lines
- [ ] Tests use path aliases (@/features/...)

## Estimated Time
3-4 hours

## Impact Summary

```
LOC: +500 (new test code)
CC Reduction: 0 (tests don't affect production CC)
Type Safety: maintained via test patterns
Abstractions: 0
Coverage: 75% -> 85%+ target
```
