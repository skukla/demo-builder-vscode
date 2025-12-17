# Step 5: Custom Hook Extraction

**Purpose**: Extract reusable React hooks from components to reduce duplication and simplify component logic.

**Prerequisites**:
- [ ] Step 4 completed (utility consolidation)
- [ ] React Testing Library available

---

## Tests to Write First

### 5.1 useMessageListener Hook

**File**: `tests/core/ui/hooks/useMessageListener.test.ts`

- [ ] Test: registers message handler on mount
  - **Given**: Component using useMessageListener
  - **When**: Component mounts
  - **Then**: Handler registered with webviewClient

- [ ] Test: unsubscribes on unmount
  - **Given**: Component using useMessageListener mounted
  - **When**: Component unmounts
  - **Then**: Cleanup function called, handler removed

- [ ] Test: handles multiple message types
  - **Given**: Hook configured with type array
  - **When**: Messages of different types received
  - **Then**: Correct handler called for each type

### 5.2 useFieldFocus Hook

**File**: `tests/core/ui/hooks/useFieldFocus.test.ts`

- [ ] Test: focuses field by key
  - **Given**: Hook with registered refs
  - **When**: focusField('fieldName') called
  - **Then**: Field ref receives focus

- [ ] Test: scrolls to field when specified
  - **Given**: Hook with scroll option enabled
  - **When**: focusField called
  - **Then**: scrollIntoView called on element

### 5.3 Component-Specific Hooks

**File**: `tests/core/ui/hooks/useConfigForm.test.ts`

- [ ] Test: manages form state
  - **Given**: useConfigForm initialized
  - **When**: updateField called
  - **Then**: State updated correctly

- [ ] Test: validates on change
  - **Given**: Form with validation rules
  - **When**: Invalid value set
  - **Then**: Error state updated

**File**: `tests/core/ui/hooks/useAuthState.test.ts`

- [ ] Test: tracks auth status
  - **Given**: useAuthState initialized
  - **When**: Auth status changes
  - **Then**: State reflects new status

**File**: `tests/core/ui/hooks/useSelections.test.ts`

- [ ] Test: toggles selection
  - **Given**: useSelections with items
  - **When**: toggle called
  - **Then**: Selection state updated

**File**: `tests/core/ui/hooks/useMeshState.test.ts`

- [ ] Test: manages deployment state
  - **Given**: useMeshState initialized
  - **When**: Deployment starts
  - **Then**: Loading state set

---

## Files to Create/Modify

### Create

- [ ] `src/core/ui/hooks/useMessageListener.ts`
- [ ] `src/core/ui/hooks/useFieldFocus.ts`
- [ ] `src/core/ui/hooks/useConfigForm.ts`
- [ ] `src/core/ui/hooks/useAuthState.ts`
- [ ] `src/core/ui/hooks/useSelections.ts`
- [ ] `src/core/ui/hooks/useMeshState.ts`
- [ ] `src/core/ui/hooks/index.ts`

### Modify

- [ ] `src/features/components/ui/steps/ComponentConfigStep.tsx` - Use useConfigForm
- [ ] `src/features/authentication/ui/steps/AdobeAuthStep.tsx` - Use useAuthState
- [ ] `src/features/components/ui/steps/ComponentSelectionStep.tsx` - Use useSelections
- [ ] `src/features/mesh/ui/steps/ApiMeshStep.tsx` - Use useMeshState

---

## Implementation Details

### RED Phase

```typescript
// tests/core/ui/hooks/useMessageListener.test.ts
import { renderHook } from '@testing-library/react-hooks';
import { useMessageListener } from '@/core/ui/hooks/useMessageListener';

describe('useMessageListener', () => {
  it('should unsubscribe on unmount', () => {
    const cleanup = jest.fn();
    const { unmount } = renderHook(() => useMessageListener('test', jest.fn()));
    unmount();
    expect(cleanup).toHaveBeenCalled();
  });
});
```

### GREEN Phase

```typescript
// src/core/ui/hooks/useMessageListener.ts
import { useEffect } from 'react';
import { webviewClient } from '@/webviews/shared/services/webviewClient';

export function useMessageListener<T>(
  type: string | string[],
  handler: (data: T) => void
): void {
  useEffect(() => {
    const types = Array.isArray(type) ? type : [type];
    const unsubscribes = types.map(t => webviewClient.onMessage(t, handler));
    return () => unsubscribes.forEach(unsub => unsub());
  }, [type, handler]);
}
```

### REFACTOR Phase

- Ensure consistent naming across hooks
- Add JSDoc documentation
- Export all hooks from index.ts

---

## Expected Outcome

- 6 reusable hooks extracted
- Components reduced by ~200 LOC
- Cleaner component files focused on rendering

## Acceptance Criteria

- [ ] All hook tests passing
- [ ] Components successfully using new hooks
- [ ] No regression in component behavior
- [ ] Coverage maintained at 80%+

**Estimated Time**: 4-5 hours
