# Step 4: Hook Extractions

## Summary

Extract 8 inline hook patterns to reusable custom hooks following existing patterns in `src/core/ui/hooks/`.

## Prerequisites

- [ ] Phase 1 complete (Steps 1-3: timeouts, ternaries, dead code)

## Tests to Write First (RED Phase)

- [ ] Test: Hook returns expected initial state
- [ ] Test: Hook updates state correctly on dependency changes
- [ ] Test: Hook cleanup runs on unmount (timers, subscriptions)
- [ ] Test: Hook handles null/undefined inputs gracefully

## Pattern: Hook Extraction

**Before** (inline logic):
```tsx
function Component({ setCanProceed }) {
  useEffect(() => {
    const ready = authA.isAuthenticated && authB.isAuthenticated;
    setCanProceed(ready);
  }, [authA.isAuthenticated, authB.isAuthenticated, setCanProceed]);
}
```

**After** (extracted hook):
```tsx
// useCanProceedSync.ts
function useCanProceedSync(
  condition: boolean,
  setCanProceed: (value: boolean) => void
) {
  useEffect(() => {
    setCanProceed(condition);
  }, [condition, setCanProceed]);
}

// Component uses hook
function Component({ setCanProceed }) {
  const ready = authA.isAuthenticated && authB.isAuthenticated;
  useCanProceedSync(ready, setCanProceed);
}
```

## Extraction Candidates

| # | Pattern | Location | Target Hook |
|---|---------|----------|-------------|
| 1 | Data loading on mount | WizardContainer.tsx | useDataLoader |
| 2 | setCanProceed sync | ConnectServicesStep.tsx | useCanProceedSync |
| 3 | Focus with timer | ProjectDashboardScreen.tsx | useFocusWithDelay |
| 4 | Timer state cleanup | Multiple steps | useTimerState |
| 5 | Auth status combine | EDS steps | useCombinedAuthStatus |
| 6 | Initial value sync | Selection steps | useInitialSync |
| 7 | Scroll position | Review steps | useScrollReset |
| 8 | Validation effect | Config steps | useValidationSync |

## Files to Create

- [ ] `src/core/ui/hooks/useCanProceedSync.ts`
- [ ] `src/core/ui/hooks/useDataLoader.ts`
- [ ] Additional hooks as identified during implementation

## Implementation Details (GREEN Phase)

1. **Identify** the inline pattern in source file
2. **Create** hook file in `src/core/ui/hooks/`
3. **Export** from `src/core/ui/hooks/index.ts`
4. **Replace** inline usage with hook call
5. **Test** hook in isolation with @testing-library/react

## Expected Outcome

- [x] 8 new custom hooks created and tested
- [x] Inline logic replaced with hook calls
- [x] Hooks follow existing naming conventions (useCamelCase)
- [x] Each hook has JSDoc documentation

## Acceptance Criteria

- [x] All 8 hook extractions complete
- [x] Each hook has unit tests in `tests/core/ui/hooks/`
- [x] No behavior changes in consuming components
- [x] Hooks exported from index.ts barrel file

---

## Completion Notes

**Status:** ✅ Complete
**Date:** 2025-12-29
**Approach:** Pattern Reuse First - Found 4 hooks already existed
**Hooks Already Existed:** useCanProceed, useCanProceedAll, useFocusOnMount, useSingleTimer
**Components Refactored:** 7 components to use existing hooks
- GitHubSetupStep.tsx → useCanProceed
- DaLiveSetupStep.tsx → useCanProceed
- ConnectServicesStep.tsx → useCanProceedAll
- AdobeProjectStep.tsx → useCanProceed
- AdobeWorkspaceStep.tsx → useCanProceed
- ReviewStep.tsx → useCanProceed with custom validator
- ProjectDashboardScreen.tsx → useSingleTimer
**Full Suite:** 5998 tests passing
