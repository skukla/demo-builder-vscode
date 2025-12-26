# Step 1: Audit hooks/ (17 files)

## Purpose

Audit all custom React hook test files to ensure tests accurately reflect current hook implementations, properly test async/timer behavior, and correctly mock VS Code webview APIs.

## Prerequisites

- [ ] Node modules installed
- [ ] Tests currently passing: `npm test -- tests/webview-ui/shared/hooks/`

---

## Files to Audit

### useAutoScroll Tests (3 files)

#### File 1: useAutoScroll-initialization-refs.test.ts

**Test File:** `tests/webview-ui/shared/hooks/useAutoScroll-initialization-refs.test.ts`
**Source File:** `src/core/ui/hooks/useAutoScroll.ts`

- [ ] **Audit: Hook return values match implementation**
  - Check: containerRef, createItemRef, scrollToItem, scrollToTop, scrollToBottom
  - Implementation returns: `UseAutoScrollReturn<C, I>` interface
  - Verify options interface matches: enabled, behavior, delay, padding

- [ ] **Audit: Timer setup/cleanup is correct**
  - Verify: `jest.useFakeTimers()` in beforeEach
  - Verify: `jest.runOnlyPendingTimers()` and `jest.useRealTimers()` in afterEach
  - Implementation uses `setTimeout` with configurable delay (default 100ms)

- [ ] **Audit: ref setter behavior**
  - Check: createItemRef returns function that stores elements
  - Check: null element handling for cleanup

#### File 2: useAutoScroll-options-edge-cases.test.ts

**Test File:** `tests/webview-ui/shared/hooks/useAutoScroll-options-edge-cases.test.ts`
**Source File:** `src/core/ui/hooks/useAutoScroll.ts`

- [ ] **Audit: Default options match implementation**
  - Defaults: enabled=true, behavior='smooth', delay=100, padding=10
  - Verify tests check these defaults

- [ ] **Audit: Edge cases for options**
  - enabled=false should prevent scrolling
  - Custom behavior ('auto' vs 'smooth')
  - Custom delay values
  - Custom padding values

#### File 3: useAutoScroll-scrolling.test.ts

**Test File:** `tests/webview-ui/shared/hooks/useAutoScroll-scrolling.test.ts`
**Source File:** `src/core/ui/hooks/useAutoScroll.ts`

- [ ] **Audit: Scroll behavior tests**
  - scrollToItem with visibility detection
  - scrollToTop behavior
  - scrollToBottom behavior
  - Timer advancement with `jest.advanceTimersByTime()`

- [ ] **Audit: DOM mocking for scroll calculations**
  - offsetTop, offsetHeight, clientHeight, scrollTop properties
  - scrollTo method mocking

---

### useFocusTrap Tests (4 files)

#### File 4: useFocusTrap-focus-management.test.ts

**Test File:** `tests/webview-ui/shared/hooks/useFocusTrap-focus-management.test.ts`
**Source File:** `src/core/ui/hooks/useFocusTrap.ts`

- [ ] **Audit: Hook signature matches implementation**
  - Options: enabled, autoFocus, focusableSelector, containFocus
  - Returns: RefObject<T>
  - Check exported constant: FOCUSABLE_SELECTOR

- [ ] **Audit: Test utilities usage**
  - Uses useFocusTrap.testUtils.ts for DOM setup
  - createTestContainer, cleanupTestContainer, waitForEffectExecution, cleanupTests

- [ ] **Audit: Auto-focus behavior**
  - autoFocus=true focuses first element
  - autoFocus=false does not focus
  - Disabled hook does not focus

- [ ] **Audit: Cleanup on unmount**
  - Event listeners removed
  - MutationObserver disconnected

#### File 5: useFocusTrap-keyboard.test.ts

**Test File:** `tests/webview-ui/shared/hooks/useFocusTrap-keyboard.test.ts`
**Source File:** `src/core/ui/hooks/useFocusTrap.ts`

- [ ] **Audit: Tab key trapping**
  - Tab on last element wraps to first
  - Shift+Tab on first element wraps to last
  - Tab from outside container enters it

- [ ] **Audit: KeyboardEvent simulation**
  - Correct event properties: key='Tab', bubbles=true, cancelable=true
  - preventDefault spy setup
  - Event dispatch on container

#### File 6: useFocusTrap-accessibility.test.ts

**Test File:** `tests/webview-ui/shared/hooks/useFocusTrap-accessibility.test.ts`
**Source File:** `src/core/ui/hooks/useFocusTrap.ts`

- [ ] **Audit: FOCUSABLE_SELECTOR constant**
  - Includes buttons, inputs, selects, textareas
  - Includes ARIA roles: role="button", role="combobox", role="textbox"
  - Excludes disabled elements
  - Excludes tabindex="-1"

- [ ] **Audit: Custom selector support**
  - focusableSelector option overrides default

#### File 7: useFocusTrap-edge-cases.test.ts

**Test File:** `tests/webview-ui/shared/hooks/useFocusTrap-edge-cases.test.ts`
**Source File:** `src/core/ui/hooks/useFocusTrap.ts`

- [ ] **Audit: Edge case handling**
  - Empty container (no focusable elements)
  - Container with single focusable element
  - Dynamic element addition/removal
  - containFocus option behavior

- [ ] **Audit: MutationObserver integration**
  - Cache updates when DOM changes
  - Handles disabled attribute changes
  - Handles tabindex attribute changes

---

### State Management Hooks (4 files)

#### File 8: useAsyncData.test.ts

**Test File:** `tests/webview-ui/shared/hooks/useAsyncData.test.ts`
**Source File:** `src/core/ui/hooks/useAsyncData.ts`

- [ ] **Audit: Hook options match implementation**
  - messageType, errorMessageType options
  - autoLoad, autoSelectSingle options
  - onAutoSelect callback

- [ ] **Audit: Return values**
  - data, loading, error, load, hasLoadedOnce
  - Verify all are tested

- [ ] **Audit: VS Code message integration**
  - useVSCodeMessage mock setup
  - Message handler registration

#### File 9: useLoadingState.test.ts

**Test File:** `tests/webview-ui/shared/hooks/useLoadingState.test.ts`
**Source File:** `src/core/ui/hooks/useLoadingState.ts`

- [ ] **Audit: Return value structure**
  - data, loading, error, hasLoadedOnce, isRefreshing
  - setData, setLoading, setError, setRefreshing
  - reset function

- [ ] **Audit: State transitions**
  - Initial state
  - Loading state transitions
  - Error state transitions
  - Refresh state (isRefreshing)

#### File 10: useSelection.test.ts

**Test File:** `tests/webview-ui/shared/hooks/useSelection.test.ts`
**Source File:** `src/core/ui/hooks/useSelection.ts`

- [ ] **Audit: Options interface**
  - getKey function requirement
  - onChange callback option

- [ ] **Audit: Return values**
  - selectedItem, select, isSelected, clearSelection

- [ ] **Audit: Selection behavior**
  - Single item selection
  - Selection clearing
  - isSelected helper function
  - onChange callback invocation

#### File 11: useSelectableDefault.test.ts

**Test File:** `tests/webview-ui/shared/hooks/useSelectableDefault.test.ts`
**Source File:** `src/core/ui/hooks/useSelectableDefault.ts`

- [ ] **Audit: Default selection logic**
  - Auto-select single item behavior
  - No auto-select for multiple items
  - Callback invocation

---

### Debounce/Timing Hooks (3 files)

#### File 12: useDebouncedValue.test.ts

**Test File:** `tests/webview-ui/shared/hooks/useDebouncedValue.test.ts`
**Source File:** `src/core/ui/hooks/useDebouncedValue.ts`

- [ ] **Audit: Debounce behavior**
  - Value updates after delay
  - Rapid changes only emit final value
  - Configurable delay

- [ ] **Audit: Timer management**
  - Proper fake timer setup
  - jest.advanceTimersByTime usage
  - Cleanup on unmount

#### File 13: useDebouncedLoading.test.ts

**Test File:** `tests/webview-ui/shared/hooks/useDebouncedLoading.test.ts`
**Source File:** `src/core/ui/hooks/useDebouncedLoading.ts`

- [ ] **Audit: Loading state debouncing**
  - Quick operations don't flash loading indicator
  - Long operations show loading
  - Configurable delay

#### File 14: useMinimumLoadingTime.test.ts

**Test File:** `tests/webview-ui/shared/hooks/useMinimumLoadingTime.test.ts`
**Source File:** `src/core/ui/hooks/useMinimumLoadingTime.ts`

- [ ] **Audit: Minimum time enforcement**
  - Loading shows for at least minimum time
  - Quick operations extended to minimum
  - Long operations not affected

---

### Search/Filter Hook (1 file)

#### File 15: useSearchFilter.test.ts

**Test File:** `tests/webview-ui/shared/hooks/useSearchFilter.test.ts`
**Source File:** `src/core/ui/hooks/useSearchFilter.ts`

- [ ] **Audit: Options interface**
  - searchFields array
  - caseSensitive option

- [ ] **Audit: Return values**
  - query, setQuery, filteredItems, isFiltering

- [ ] **Audit: Filtering behavior**
  - Multi-field search
  - Case sensitivity option
  - Empty query returns all items
  - Memoization of results

---

### VS Code Communication Hooks (2 files)

#### File 16: useVSCodeMessage.test.ts

**Test File:** `tests/webview-ui/shared/hooks/useVSCodeMessage.test.ts`
**Source File:** `src/core/ui/hooks/useVSCodeMessage.ts`

- [ ] **Audit: Message subscription**
  - Subscription on mount
  - Unsubscription on unmount
  - Message type filtering

- [ ] **Audit: VS Code API mock**
  - window.addEventListener mock
  - Message event structure
  - Cleanup verification

#### File 17: useVSCodeRequest.test.ts

**Test File:** `tests/webview-ui/shared/hooks/useVSCodeRequest.test.ts`
**Source File:** `src/core/ui/hooks/useVSCodeRequest.ts`

- [ ] **Audit: Request-response pattern**
  - execute function returns promise
  - loading state during request
  - error handling
  - timeout configuration

- [ ] **Audit: State management**
  - loading, error, data states
  - reset function
  - Success/error callbacks

---

## Audit Checklist Summary

### Cross-Cutting Concerns

- [ ] All 17 hook test files use consistent timer setup/cleanup pattern
- [ ] All hooks with timers use `jest.useFakeTimers()` / `jest.useRealTimers()`
- [ ] All async tests use proper `act()` wrapping
- [ ] All hooks test cleanup on unmount
- [ ] Path aliases resolve correctly (`@/core/ui/hooks/*`)

### Common Issues to Watch For

1. **Timer leaks:** Missing `jest.runOnlyPendingTimers()` in afterEach
2. **Async warnings:** Missing `act()` around state updates
3. **Mock drift:** VS Code API mock doesn't match current implementation
4. **Interface changes:** Hook options or return values have changed
5. **Missing cleanup tests:** Unmount behavior not tested

---

## Expected Outcome

After completing this step:
- All 17 hook test files verified against current implementations
- Timer management patterns confirmed correct
- VS Code API mocks validated
- Any discrepancies documented and fixed

---

## Commands

```bash
# Run all hook tests
npm test -- tests/webview-ui/shared/hooks/

# Run specific hook test
npm test -- tests/webview-ui/shared/hooks/useAutoScroll-initialization-refs.test.ts

# Run with coverage
npm test -- tests/webview-ui/shared/hooks/ --coverage
```

---

**Estimated Time:** 2-2.5 hours
**Files:** 17
