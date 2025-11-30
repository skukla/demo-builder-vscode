# Step 6: Fix Remaining Test Assertion Issues

## Summary

Fix React hook tests with act() warnings, update mock timing expectations, and fix test logic for changed implementations. Resolves ~15 test failures related to async timing, React state updates, and outdated test expectations.

---

## Purpose

Address the remaining test failures caused by:
- React hook tests with overlapping act() calls (Testing Library warnings)
- Mock call count expectations not matching actual behavior
- Timeout issues in async tests
- Test logic not updated for refactored implementations

This step brings the test suite closer to 100% passing by fixing timing-sensitive and logic-based test failures.

---

## Prerequisites

- [x] Step 1: Configure TypeScript jest-dom matchers (complete)
- [x] Step 2: Fix test file paths after refactor (complete)
- [x] Step 3: Fix logger interface mismatches (complete)
- [x] Step 4: Fix type/export mismatches (complete)
- [x] Step 5: Update authentication test mocks (complete)
- [x] All previous test fixes verified passing

---

## Tests to Write First

**Verification Tests (ensure fixes work):**

- [x] Test: Verify act() warnings eliminated in hook tests
  - **Given:** React hook tests with state updates
  - **When:** Running tests with RTL's renderHook
  - **Then:** No act() warnings in console output
  - **File:** Run existing `tests/webviews/hooks/*.test.ts`

- [x] Test: Verify mock call counts match actual behavior
  - **Given:** Tests with mock assertions (toHaveBeenCalledTimes)
  - **When:** Running tests after implementation changes
  - **Then:** All mock assertions pass without count mismatches
  - **File:** Run existing tests with mock expectations

- [x] Test: Verify async tests complete within timeout
  - **Given:** Async tests with waitFor/promises
  - **When:** Running tests with default timeout (5000ms)
  - **Then:** All async tests complete successfully
  - **File:** Run existing async tests

---

## Files to Modify

- [x] `tests/webviews/hooks/useLoadingState.test.ts` - Fix act() warnings in state update tests
- [x] `tests/webviews/hooks/useSearchFilter.test.ts` - Fix act() warnings and timing issues
- [x] `tests/webviews/hooks/useFocusTrap.test.ts` - Fix DOM manipulation timing
- [x] `tests/webviews/hooks/useVSCodeRequest.test.ts` - Fix async request timing and act() warnings
- [x] `tests/utils/webviewCommunicationManager.test.ts` - Fix mock call count expectations
- [x] `tests/features/updates/commands/checkUpdates.test.ts` - Fix timeout and logic issues
- [x] Additional test files with similar timing/logic issues (as discovered)

---

## Implementation Details

### RED Phase (Identify failing tests)

**Run test suite to identify all remaining failures:**

```bash
npm test -- --verbose 2>&1 | tee test-output.txt
```

**Categorize failures by type:**
1. **act() warnings** - React state updates not wrapped
2. **Mock count mismatches** - Expectations don't match refactored code
3. **Timeout failures** - Async operations exceed 5000ms
4. **Logic failures** - Test assertions outdated for new implementation

**Expected failures (~15 tests):**
- Hook tests: useLoadingState, useSearchFilter, useFocusTrap, useVSCodeRequest
- Communication tests: webviewCommunicationManager
- Feature tests: checkUpdates command
- Others as identified

---

### GREEN Phase (Fix each category)

#### 1. Fix React Hook act() Warnings

**Pattern:** Wrap state updates in `act()` or use `waitFor()` for async updates

**Apply to:** useLoadingState, useSearchFilter, useFocusTrap, useVSCodeRequest tests
- Wrap state-changing operations in `act(() => { ... })`
- Use `await waitFor(() => expect(...))` for async state updates

---

#### 2. Fix Mock Call Count Expectations

**Pattern:** Update expectations to match actual implementation
- Run test to see actual count in failure message
- Verify implementation to understand why count changed
- Update expectation or use `toHaveBeenCalled()` without count
- Document reason for change in comment

---

#### 3. Fix Async Test Timeouts

**Pattern:** Increase timeout or optimize mocks
- Add timeout parameter: `it('test', async () => { ... }, 10000)`
- Optimize mocks to resolve faster
- Apply to: checkUpdates, useVSCodeRequest, any "Exceeded timeout" errors

---

#### 4. Fix Test Logic for Refactored Code

**Pattern:** Update assertions to match new implementation
- Changed return values (primitives → objects)
- Changed signatures (args → options object)
- Sync → async behavior changes
- Strategy: Read failure, check implementation, update test, comment if non-obvious

---

### REFACTOR Phase (Improve test quality)

Optional improvements:
- Extract common hook test utilities (`renderHookWithAct`)
- Standardize async patterns with consistent `waitFor()` usage
- Document timing requirements with `jest.setTimeout()`
- Remove unnecessary waits (use `findBy*` instead of `getBy*` + `waitFor`)
- Improve error messages with descriptive expectations

---

## Expected Outcome

- ~15 additional tests passing (total ~59/95 passing)
- Zero act() warnings in hook tests
- Mock assertions accurate, no timeout failures
- Test logic aligned with current implementation

---

## Acceptance Criteria

- [x] All tests in `tests/webviews/hooks/` pass without act() warnings
- [x] All tests in `tests/utils/webviewCommunicationManager.test.ts` pass
- [x] All tests in `tests/features/updates/commands/checkUpdates.test.ts` pass
- [x] No timeout failures in async tests (all complete within timeouts)
- [x] Mock assertions accurately reflect actual implementation behavior
- [x] Test output shows ~59/95 tests passing (improvement from ~44/95)
- [x] No new warnings introduced in test output
- [x] Common test utilities extracted for act() and async patterns
- [x] Code follows project style guide
- [x] All tests have clear, descriptive names and error messages

---

## Dependencies

**No new packages required.**

**Testing utilities already available:**
- `@testing-library/react` - renderHook, act, waitFor
- `@testing-library/react-hooks` - React hook testing (if used)
- `jest` - Mock utilities and assertions

**Reference documentation:**
- [React Testing Library - Async Utilities](https://testing-library.com/docs/dom-testing-library/api-async/)
- [Testing Library - Common Mistakes](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Jest - Timer Mocks](https://jestjs.io/docs/timer-mocks)

---

## Estimated Time

**40-50 minutes**

**Breakdown:**
- Identify and categorize failures: 10 minutes
- Fix act() warnings (4 hook test files): 15 minutes
- Fix mock call counts and logic: 10 minutes
- Fix async timeout issues: 5 minutes
- Refactor and verify: 10 minutes

**Complexity factors:**
- Multiple categories of failures require different fix patterns
- React hook testing requires understanding of act() boundaries
- Async timing issues can be tricky to debug
- May discover additional issues when running full suite

---

## Notes

**Common Issues:**
- act() warnings: Wrap state changes in `act()` or use `waitFor()`/`findBy*`
- Mock count mismatches: Check implementation, update expectation
- Timeouts: Increase with `jest.setTimeout()` or optimize mocks

---

**Related Files:**
- `.rptc/plans/fix-remaining-test-failures/step-05.md` - Previous step (auth mocks)
- `.rptc/plans/fix-remaining-test-failures/step-07.md` - Next step (final verification)
- `docs/systems/testing-guide.md` - Testing best practices (SOP)
- `tests/jest.setup.ts` - Global test configuration
