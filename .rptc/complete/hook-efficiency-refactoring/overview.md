# Hook Efficiency Refactoring Plan

## Status Tracking
- [x] Planned
- [x] In Progress
- [x] Complete

**Created:** 2025-11-27
**Last Updated:** 2025-11-27
**Completed:** 2025-11-27
**Branch:** `refactor/hook-efficiency`

---

## Executive Summary

**Purpose:** Consolidate duplicate hooks, extract reusable utilities, and improve code quality across 23 React hooks.

**Expected Impact:**
- **Lines Removed:** ~400 (14% reduction)
- **Files Removed:** 2
- **New Utilities Created:** 2
- **Bugs Fixed:** 3 (timeout cleanup issues)
- **Pattern Consistency:** Improved from 15% to 35% code reuse

---

## Phase 1: Delete Duplicates (1-2 hours)

### Step 1.1: Delete `useDebounce.ts`

**Current State:**
- `src/core/ui/hooks/useDebounce.ts` (24 lines) - NOT exported from index.ts
- `src/core/ui/hooks/useDebouncedValue.ts` (44 lines) - Exported, has default delay

**They are functionally identical** - same useState + useEffect + setTimeout pattern.

**Actions:**
1. Update `src/features/components/ui/hooks/useComponentSelection.ts`:
   ```typescript
   // Change from:
   import { useDebounce } from '@/core/ui/hooks/useDebounce';
   // To:
   import { useDebouncedValue } from '@/core/ui/hooks';
   ```
2. Delete `src/core/ui/hooks/useDebounce.ts`
3. Run tests to verify

**Files Changed:**
- `src/features/components/ui/hooks/useComponentSelection.ts` (1 import change)
- `src/core/ui/hooks/useDebounce.ts` (DELETE)

**Lines Saved:** 24

---

### Step 1.2: Delete Orphaned `useMeshOperations.tsx`

**Current State:**
- `src/features/mesh/ui/hooks/useMeshOperations.ts` (350 lines) - **USED** by `ApiMeshStep.tsx`
- `src/features/mesh/ui/steps/hooks/useMeshOperations.tsx` (298 lines) - **ORPHANED** (only has test file)

**Actions:**
1. Verify no production imports of `steps/hooks/useMeshOperations.tsx`
2. Delete `src/features/mesh/ui/steps/hooks/useMeshOperations.tsx`
3. Delete `tests/features/mesh/ui/steps/hooks/useMeshOperations.test.tsx`
4. Delete empty `src/features/mesh/ui/steps/hooks/` directory if empty

**Files Changed:**
- `src/features/mesh/ui/steps/hooks/useMeshOperations.tsx` (DELETE)
- `tests/features/mesh/ui/steps/hooks/useMeshOperations.test.tsx` (DELETE)

**Lines Saved:** 298 + test file (~400 total)

---

## Phase 2: Fix Bugs (1 hour)

### Step 2.1: Fix Timeout Cleanup in `useMeshOperations.ts`

**Current Issue:** Progress timeouts not cleared on unmount (memory leak risk)

**Location:** `src/features/mesh/ui/hooks/useMeshOperations.ts`

**Pattern to fix:**
```typescript
// Current - timeout not tracked for cleanup
setTimeout(() => setProgress('...'), 500);

// Fixed - track and cleanup
const timeoutRef = useRef<NodeJS.Timeout | null>(null);
useEffect(() => {
  return () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };
}, []);
timeoutRef.current = setTimeout(() => setProgress('...'), 500);
```

---

### Step 2.2: Fix Timeout Cleanup in `useConfigNavigation.ts`

**Current Issue:** `setTimeout` in `scrollToSection` without cleanup

**Location:** `src/features/components/ui/hooks/useConfigNavigation.ts`

**Same pattern as 2.1**

---

## Phase 3: Create Utility Hooks (2-3 hours)

### Step 3.1: Create `useIsMounted` Hook

**Purpose:** Prevent state updates after unmount (DRY principle)

**Location:** `src/core/ui/hooks/useIsMounted.ts`

**Implementation:**
```typescript
import { useRef, useEffect } from 'react';

/**
 * Returns a ref that tracks whether the component is mounted.
 * Use to prevent state updates after unmount.
 *
 * @example
 * const isMounted = useIsMounted();
 *
 * const loadData = async () => {
 *   const result = await fetchData();
 *   if (isMounted.current) {
 *     setData(result); // Safe - won't update unmounted component
 *   }
 * };
 */
export function useIsMounted(): React.RefObject<boolean> {
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return isMountedRef;
}
```

**Hooks to Update:**
- `useAsyncOperation.ts` - Replace inline implementation
- `useVSCodeRequest.ts` - Add for unmount safety
- `useAuthStatus.ts` - Add for unmount safety
- `useMeshOperations.ts` - Add for unmount safety

---

### Step 3.2: Create `useSetToggle` Hook

**Purpose:** Generic Set toggle handler factory (DRY principle)

**Location:** `src/core/ui/hooks/useSetToggle.ts`

**Implementation:**
```typescript
import { useState, useCallback } from 'react';

/**
 * Manages a Set with toggle functionality.
 *
 * @example
 * const [selected, toggle, setSelected] = useSetToggle<string>();
 *
 * // Toggle an item
 * toggle('item-1', true);  // Add
 * toggle('item-1', false); // Remove
 */
export function useSetToggle<T>(
  initial: Set<T> | T[] = []
): [Set<T>, (id: T, selected: boolean) => void, React.Dispatch<React.SetStateAction<Set<T>>>] {
  const [set, setSet] = useState<Set<T>>(
    initial instanceof Set ? initial : new Set(initial)
  );

  const toggle = useCallback((id: T, selected: boolean) => {
    setSet(prev => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(id);
      } else {
        newSet.delete(id);
      }
      return newSet;
    });
  }, []);

  return [set, toggle, setSet];
}
```

**Files to Update:**
- `src/features/components/ui/hooks/useComponentSelection.ts` - Replace 4 toggle handlers

---

### Step 3.3: Update `index.ts` Exports

**Add to `src/core/ui/hooks/index.ts`:**
```typescript
// Utility Hooks
export { useIsMounted } from './useIsMounted';
export { useSetToggle } from './useSetToggle';
```

---

## Phase 4: Refactor Feature Hooks (4-6 hours)

### Step 4.1: Refactor `useComponentSelection.ts`

**Current:** 4 nearly identical toggle handlers (40 lines)

**Actions:**
1. Import `useSetToggle` from core hooks
2. Replace 4 toggle handlers with `useSetToggle` instances
3. Update component to use new API

**Before:**
```typescript
const [selectedDependencies, setSelectedDependencies] = useState<Set<string>>(new Set());
const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
// ... 4 more useState + 4 toggle handlers
```

**After:**
```typescript
const [selectedDependencies, toggleDependency] = useSetToggle<string>(initialDeps);
const [selectedServices, toggleService] = useSetToggle<string>(initialServices);
// ... much cleaner
```

**Lines Saved:** ~40

---

### Step 4.2: Consolidate Validation Logic

**Current:**
- `useComponentConfig.ts` (lines 271-308): inline validation
- `useConfigValidation.tsx` (73 lines): same validation logic

**Actions:**
1. Remove validation logic from `useComponentConfig.ts`
2. Import and use `useConfigValidation` hook
3. Compose the hooks properly

**Lines Saved:** ~40

---

### Step 4.3: Add `useIsMounted` to Feature Hooks

**Files to update:**
1. `src/features/authentication/ui/hooks/useAuthStatus.ts`
2. `src/features/mesh/ui/hooks/useMeshOperations.ts`

**Pattern:**
```typescript
import { useIsMounted } from '@/core/ui/hooks';

export function useXxx() {
  const isMounted = useIsMounted();

  const asyncOperation = async () => {
    const result = await fetchData();
    if (isMounted.current) {
      setState(result); // Safe
    }
  };
}
```

---

## Phase 5: Update Core Hooks (2 hours)

### Step 5.1: Refactor `useAsyncOperation.ts`

**Current:** Has inline `isMountedRef` implementation (8 lines)

**Actions:**
1. Import `useIsMounted` from same directory
2. Replace inline implementation with hook

**Lines Saved:** ~6

---

### Step 5.2: Add Unmount Safety to `useVSCodeRequest.ts`

**Current:** No protection against state updates after unmount

**Actions:**
1. Import `useIsMounted`
2. Guard state updates with `isMounted.current` check

---

## Phase 6: Documentation & Cleanup (1 hour)

### Step 6.1: Update CLAUDE.md

Update `src/core/ui/hooks/CLAUDE.md`:
- Add `useIsMounted` documentation
- Add `useSetToggle` documentation
- Document hook composition patterns
- Update "Future Enhancements" section

---

### Step 6.2: Clean Up Unused Hooks (Optional)

**Hooks not used in production code:**
- `useAsyncData` (only used by tests)
- `useLoadingState` (only used by useAsyncData)
- `useSearchFilter` (only examples)
- `useSelection` (only examples)
- `useAutoScroll` (not imported)
- `useMinimumLoadingTime` (not used)

**Decision:** Keep for now - they may be useful for future features. Document as "available but unused" in CLAUDE.md.

---

## Summary

### Files to Delete
| File | Lines | Reason |
|------|-------|--------|
| `src/core/ui/hooks/useDebounce.ts` | 24 | Duplicate of useDebouncedValue |
| `src/features/mesh/ui/steps/hooks/useMeshOperations.tsx` | 298 | Orphaned duplicate |
| `tests/features/mesh/ui/steps/hooks/useMeshOperations.test.tsx` | ~400 | Test for deleted file |

### Files to Create
| File | Lines | Purpose |
|------|-------|---------|
| `src/core/ui/hooks/useIsMounted.ts` | ~20 | Unmount safety utility |
| `src/core/ui/hooks/useSetToggle.ts` | ~25 | Set toggle utility |

### Files to Modify
| File | Change |
|------|--------|
| `src/core/ui/hooks/index.ts` | Add new exports |
| `src/core/ui/hooks/useAsyncOperation.ts` | Use useIsMounted |
| `src/core/ui/hooks/useVSCodeRequest.ts` | Add unmount safety |
| `src/features/components/ui/hooks/useComponentSelection.ts` | Use useSetToggle, useDebouncedValue |
| `src/features/components/ui/hooks/useComponentConfig.ts` | Remove inline validation |
| `src/features/authentication/ui/hooks/useAuthStatus.ts` | Add useIsMounted |
| `src/features/mesh/ui/hooks/useMeshOperations.ts` | Fix cleanup, add useIsMounted |
| `src/features/components/ui/hooks/useConfigNavigation.ts` | Fix timeout cleanup |

### Metrics

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Total Hook Files | 23 | 21 | -2 |
| Total Hook LOC | ~2,800 | ~2,400 | -400 (-14%) |
| Duplicate Patterns | 5 | 1 | -4 |
| Memory Leak Risks | 3 | 0 | -3 |
| Code Reuse | ~15% | ~35% | +20% |

### Effort Estimate

| Phase | Description | Time |
|-------|-------------|------|
| Phase 1 | Delete Duplicates | 1-2 hours |
| Phase 2 | Fix Bugs | 1 hour |
| Phase 3 | Create Utilities | 2-3 hours |
| Phase 4 | Refactor Feature Hooks | 4-6 hours |
| Phase 5 | Update Core Hooks | 2 hours |
| Phase 6 | Documentation | 1 hour |
| **Total** | | **11-15 hours** |

---

## Dependencies

- Phase 2 can run in parallel with Phase 1
- Phase 3 must complete before Phase 4 and 5
- Phase 6 should be last

## Risks

| Risk | Mitigation |
|------|------------|
| Breaking existing tests | Run full test suite after each phase |
| Subtle behavior changes | Manual testing of wizard flow |
| Import path changes | Search codebase for all imports |

## Next Steps After This Plan

1. **Inline Logic Abstraction Analysis** - Analyze all frontend/backend code for abstraction opportunities
2. **Coverage Push to 85%** - Write tests for cleaner, consolidated code
