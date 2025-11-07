# Step 1: Fix React 19 Skipped Tests (URGENT)

## Purpose

Fix 16 skipped tests in useVSCodeRequest.test.ts that were disabled due to React 19 state batching behavior changes. React 19 introduced stricter batching rules for async state updates - when errors are thrown in async contexts, state updates (setError, setLoading) are not committed before the error propagates in the test environment. This blocks React 19 compatibility and prevents accurate test coverage of error handling and callback stability.

**Why this step is URGENT**: These tests validate critical error handling and state management functionality. Without them passing, we cannot guarantee the hook works correctly in production error scenarios.

## Prerequisites

- [ ] `tests/webview-ui/shared/hooks/useVSCodeRequest.test.ts` file exists
- [ ] `@testing-library/react` v16+ installed (React 19 compatible)
- [ ] React 19.1.1 confirmed in package.json
- [ ] Jest configured with ts-jest for TypeScript support

## Tests to Write First

**Note**: Since this step FIXES existing skipped tests, the tests themselves are the implementation. We verify the fix by ensuring all previously skipped tests pass after migration.

- [ ] Test: Verify all 16 skipped tests pass after waitFor() migration
  - **Given:** All describe.skip() and it.skip() removed from test file
  - **When:** Run `npm test useVSCodeRequest`
  - **Then:** All tests green, no timeouts, no state assertion failures
  - **File:** `tests/webview-ui/shared/hooks/useVSCodeRequest.test.ts`

- [ ] Test: Verify no test timeout issues with waitFor()
  - **Given:** waitFor() used for all async state checks
  - **When:** Tests run against React 19 async state updates
  - **Then:** Tests complete within Jest default timeout (5000ms)
  - **File:** `tests/webview-ui/shared/hooks/useVSCodeRequest.test.ts`

- [ ] Test: Verify full test suite still passes
  - **Given:** All useVSCodeRequest tests fixed
  - **When:** Run `npm test` (full suite)
  - **Then:** Zero failures, zero skipped tests in useVSCodeRequest.test.ts
  - **File:** All test files

## Files to Create/Modify

**Modify:**

- [ ] `tests/webview-ui/shared/hooks/useVSCodeRequest.test.ts` - Remove all `.skip()`, migrate async state assertions to `waitFor()` pattern

**No new files created in this step**

## Implementation Details (RED-GREEN-REFACTOR)

### RED Phase (Write Failing Tests)

Since we're fixing EXISTING tests, the RED phase is un-skipping them to see current failures:

```typescript
// CURRENT STATE (line 137):
describe.skip('failed request', () => { ... })

// RED PHASE - Un-skip to see failures:
describe('failed request', () => { ... })
```

**Expected failures after un-skip**:
- `handles error and updates state` - error state not committed before assertion
- `converts non-Error objects to Error` - error callback receives null/undefined
- `calls onError callback when request fails` - callback not called
- `clears error on new request` - error state undefined

Repeat for:
- `describe.skip('typed responses')` (1 test)
- `describe.skip('callback stability')` (2 tests)
- `it.skip('resets error state')` (1 individual test)

**Total failing after un-skip**: 16 tests

### GREEN Phase (Implement Fix)

**Strategy**: Migrate all async state assertions to React Testing Library's `waitFor()` pattern. This allows React 19's batching mechanism to complete state updates before assertions run.

**Pattern to apply**:

```typescript
// BEFORE (fails in React 19):
await expect(
  act(async () => {
    await result.current.execute();
  })
).rejects.toThrow('Request failed');

// Assertion runs immediately - state not committed yet
expect(result.current.error).toEqual(mockError); // FAILS

// AFTER (works with React 19):
await expect(
  act(async () => {
    await result.current.execute();
  })
).rejects.toThrow('Request failed');

// Wait for React to commit async state updates
await waitFor(() => {
  expect(result.current.error).toEqual(mockError); // PASSES
});
```

**Files to fix** (4 skipped blocks):

1. **describe.skip('failed request')** - Lines 137-240
   - [ ] Remove `.skip()` from describe block
   - [ ] Migrate 4 tests to use `waitFor()` for all state assertions after async actions
   - Tests: error handling, error conversion, onError callback, error clearing

2. **it.skip('resets error state')** - Lines 296-320
   - [ ] Remove `.skip()` from it block
   - [ ] Wrap `expect(result.current.error).toBeNull()` in `waitFor()`

3. **describe.skip('typed responses')** - Lines 355-377
   - [ ] Remove `.skip()` from describe block
   - [ ] Wrap `expect(result.current.data).toEqual(mockData)` in `waitFor()`
   - [ ] Verify TypeScript generics work with `useVSCodeRequest<TestResponse>`

4. **describe.skip('callback stability')** - Lines 380-400
   - [ ] Remove `.skip()` from describe block
   - [ ] Tests check function reference equality - likely no `waitFor()` needed
   - [ ] If failures persist, wrap assertions in `waitFor()` with 100ms timeout

**Implementation checklist**:

- [ ] Import `waitFor` from `@testing-library/react` (already imported line 1)
- [ ] Un-skip all describe.skip() and it.skip() blocks
- [ ] Apply `waitFor()` pattern to all async state assertions
- [ ] Run tests incrementally: fix one describe block, verify passing, move to next
- [ ] Ensure `waitFor()` timeout defaults (1000ms) are sufficient - increase if flaky

### REFACTOR Phase (Improve Quality)

After all tests passing, refactor for consistency:

1. **Consistent waitFor() usage**
   - [ ] Review ALL tests (not just previously skipped) for async state assertions
   - [ ] Ensure consistent pattern: synchronous assertions immediate, async state assertions in `waitFor()`
   - [ ] Example: Line 68 `expect(result.current.data).toEqual(mockData)` after `await act()` - should this use `waitFor()`? Evaluate case-by-case.

2. **Remove redundant comments**
   - [ ] Delete React 19 batching explanation comments (lines 131-136, 295, 351-354, 379) after fix confirmed working
   - [ ] Keep minimal comment if pattern is non-obvious: `// Wait for React 19 async state updates`

3. **Verify test clarity**
   - [ ] Each test has clear Given-When-Then structure (most already do)
   - [ ] Test names accurately describe what's tested
   - [ ] No duplicate assertions (check error state only once per test)

4. **Performance check**
   - [ ] Run `npm test useVSCodeRequest` - total time should be <5 seconds
   - [ ] If slower, reduce `waitFor()` timeouts where safe (e.g., callback stability tests)

## Expected Outcome

After completing this step:

- **Functionality**: All 16 previously skipped tests are passing
- **Code quality**: Zero `.skip()` or `it.skip()` in `useVSCodeRequest.test.ts`
- **React 19 compatibility**: All tests use `waitFor()` for async state assertions, compatible with React 19 batching
- **Coverage**: Error handling, typed responses, and callback stability now included in test coverage

**Demonstrable success**:
```bash
npm test useVSCodeRequest
# PASS tests/webview-ui/shared/hooks/useVSCodeRequest.test.ts
#   ✓ 30+ tests passing (including 16 previously skipped)
#   ✓ 0 skipped
#   ✓ Test Suites: 1 passed, 1 total
```

## Acceptance Criteria

- [ ] Zero skipped tests in `useVSCodeRequest.test.ts` (no `.skip()` anywhere)
- [ ] All 16 previously skipped tests green (passing)
- [ ] `waitFor()` used for all async state checks (error state, data state after async actions)
- [ ] `npm test` passes completely (no failures across entire test suite)
- [ ] No test timeouts (all tests complete within Jest default 5000ms timeout)
- [ ] Comments about React 19 batching issues removed (issue resolved)
- [ ] Test execution time <5 seconds for useVSCodeRequest.test.ts

## Dependencies from Other Steps

**Blocks:** Steps 2-6 (all subsequent steps depend on establishing stable test baseline)

**Rationale**: Cannot proceed with other test improvements (mock reduction, file splits, type safety) until React 19 compatibility is confirmed. These 16 tests validate critical hook functionality - without them passing, we risk introducing regressions in subsequent refactoring.

**Depends on:** None (Step 1 is foundation for all other work)

## Estimated Time

**4-6 hours**

**Breakdown**:
- Understanding React 19 batching behavior: 1 hour
- Un-skipping tests and observing failures: 30 minutes
- Migrating first describe block (failed request): 1.5 hours
- Migrating remaining blocks (reset, typed, callbacks): 1.5 hours
- Refactoring for consistency: 1 hour
- Full test suite verification: 30 minutes

**Risk buffer**: +2 hours if unexpected issues with generic types or callback stability tests

---

**Implementation Note**: Use incremental approach - un-skip and fix one describe block at a time, verifying tests pass before moving to next block. This prevents overwhelming debugging sessions and isolates issues quickly.

**Reference**: See testing-guide.md (SOP) for React Testing Library best practices and waitFor() usage patterns. For React 19 specific issues, see: https://github.com/facebook/react/issues/26769
