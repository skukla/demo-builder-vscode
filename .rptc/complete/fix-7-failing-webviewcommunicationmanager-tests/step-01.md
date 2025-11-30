# Step 1: Fix All Failing WebviewCommunicationManager Tests

**Status:** ✅ Complete

---

## Purpose

Fix all failing tests in `tests/utils/webviewCommunicationManager.test.ts` by applying documented fix patterns from research. All failures are test harness timing/coordination issues with Jest's fake timers—not implementation bugs. This step applies specific patterns to resolve three categories of issues: microtask queue flushing, handshake protocol completion, and mock configuration ordering.

---

## Prerequisites

- [x] Research document analyzed all failures with documented patterns
- [x] Understanding of Jest fake timers and event loop mechanics
- [x] Knowledge of WebviewCommunicationManager's handshake protocol

---

## Important Note: Test Count Discrepancy

**Documented Tests:** The research document comprehensively analyzed the test file and documented **6 failing tests** with clear fix patterns:

1. "should retry failed messages" (line 244)
2. "should throw after max retries exceeded" (line 286)
3. "should not crash if timeout hint fails to send" (line 799)
4. "should create and initialize communication manager" (line 826)
5. "should accept configuration options" (line 846)
6. "should handle postMessage failure during initialization" (line 983)

**Plan Title Reference:** While the plan references "7 failing tests," only 6 unique tests are documented with fix patterns in the research. The category counts in research (2 + 2 + 3 = 7) appear to be a counting error, as the "Mock configuration ordering" category only documents 2 tests, not 3.

**Action:** This step fixes all 6 documented failing tests. If a 7th test exists, it will be identified during test execution.

---

## Tests to Write First (RED Phase)

**Note:** This is a test fix task, not new feature development. The tests already exist but are failing. Our TDD approach here is:

- **RED (Current State):** Verify tests are failing with documented symptoms
- **GREEN (This Step):** Apply fix patterns to make tests pass
- **REFACTOR (This Step):** Add inline documentation for future reference

### Verification Tests (Existing Tests We're Fixing)

All tests already exist. We're fixing harness timing issues, not writing new tests.

- [ ] Test: "should retry failed messages" (line 244)
  - **Given:** Manager configured with retry settings
  - **When:** postMessage fails twice then succeeds
  - **Then:** Should retry and eventually succeed (3 attempts total)
  - **Current Issue:** Times out waiting for retries
  - **File:** `tests/utils/webviewCommunicationManager.test.ts:244-284`

- [ ] Test: "should throw after max retries exceeded" (line 286)
  - **Given:** Manager configured with max 2 retries
  - **When:** postMessage fails continuously
  - **Then:** Should throw after exhausting retries
  - **Current Issue:** Times out waiting for retry logic
  - **File:** `tests/utils/webviewCommunicationManager.test.ts:286-317`

- [ ] Test: "should not crash if timeout hint fails to send" (line 799)
  - **Given:** Timeout hint postMessage fails
  - **When:** Handler executes normally
  - **Then:** Should complete without crashing
  - **Current Issue:** Mock consumed by wrong postMessage call
  - **File:** `tests/utils/webviewCommunicationManager.test.ts:799-822`

- [ ] Test: "should create and initialize communication manager" (line 826)
  - **Given:** Factory function called
  - **When:** Handshake protocol runs
  - **Then:** Should return initialized manager
  - **Current Issue:** Times out waiting for webview_ready
  - **File:** `tests/utils/webviewCommunicationManager.test.ts:826-844`

- [ ] Test: "should accept configuration options" (line 846)
  - **Given:** Factory function called with options
  - **When:** Handshake protocol runs
  - **Then:** Should return initialized manager with options
  - **Current Issue:** Times out waiting for webview_ready
  - **File:** `tests/utils/webviewCommunicationManager.test.ts:846-867`

- [ ] Test: "should handle postMessage failure during initialization" (line 983)
  - **Given:** postMessage mock configured to fail
  - **When:** initialize() called
  - **Then:** Should reject with handshake timeout error
  - **Current Issue:** Times out because fake timers not advanced
  - **File:** `tests/utils/webviewCommunicationManager.test.ts:983-996`

---

## Files to Create/Modify

- [ ] `tests/utils/webviewCommunicationManager.test.ts` - Apply fix patterns to 6 failing tests

**Total Changes:** 1 file modified, ~30 lines changed across 6 tests

---

## Implementation Details

### RED Phase (Verify Current Failure State)

Before applying fixes, verify each test exhibits documented symptoms:

**Run failing tests only:**
```bash
npm test -- tests/utils/webviewCommunicationManager.test.ts --testNamePattern="should retry failed messages|should throw after max retries|should not crash if timeout hint fails|should create and initialize|should accept configuration options|should handle postMessage failure during initialization"
```

**Expected Failures:**
- Retry tests: Timeout after 10 seconds waiting for timer advancement
- Factory tests: Timeout after 10 seconds waiting for handshake
- Error tests: Assertion failures or unexpected behavior

**If tests are passing:** Skip this step—the issue may already be resolved.

---

### GREEN Phase (Apply Fix Patterns)

Apply documented fix patterns from research for each test category:

---

#### Category 1: Microtask Flushing Fixes (2 tests)

**Issue:** Missing `await Promise.resolve()` after `jest.advanceTimersByTime()`

**Technical Context:**
Jest's fake timers advance clock but don't flush promise microtask queue. `setTimeout` callbacks are scheduled as macrotasks. Without explicit microtask flush, retry logic (setTimeout → Promise chain) never executes.

**Pattern:** Add microtask flush after timer advancement

---

##### Fix 1.1: "should retry failed messages" (line 244)

**Location:** `tests/utils/webviewCommunicationManager.test.ts:274-278`

**Current Code (lines 274-278):**
```typescript
// Manually advance through each retry
for (let i = 0; i < 2; i++) {
    jest.runOnlyPendingTimers();
    await Promise.resolve();
    await Promise.resolve(); // Extra flush for async chain
}
```

**Issue:** `jest.runOnlyPendingTimers()` doesn't guarantee microtask queue flush

**Fix Pattern:**
```typescript
// Manually advance through each retry with microtask flushing
for (let i = 0; i < 2; i++) {
    jest.advanceTimersByTime(100); // Match retryDelay from line 247
    await Promise.resolve();       // Flush microtask queue
}
```

**Change Summary:**
- Replace `jest.runOnlyPendingTimers()` with `jest.advanceTimersByTime(100)`
- Remove extra `await Promise.resolve()` (single flush sufficient)
- Add inline comment explaining pattern

**Reference:** Research document lines 57-85

---

##### Fix 1.2: "should throw after max retries exceeded" (line 286)

**Location:** `tests/utils/webviewCommunicationManager.test.ts:309-314`

**Current Code (lines 309-314):**
```typescript
// Manually advance through each retry (maxRetries=2, so 2 retries after initial)
for (let i = 0; i < 2; i++) {
    jest.runOnlyPendingTimers();
    await Promise.resolve();
    await Promise.resolve(); // Extra flush for async chain
}
```

**Issue:** Same as Fix 1.1—inconsistent timer advancement

**Fix Pattern:**
```typescript
// Manually advance through each retry with microtask flushing (maxRetries=2)
for (let i = 0; i < 2; i++) {
    jest.advanceTimersByTime(100); // Match retryDelay from line 289
    await Promise.resolve();       // Flush microtask queue
}
```

**Change Summary:**
- Replace `jest.runOnlyPendingTimers()` with `jest.advanceTimersByTime(100)`
- Remove extra `await Promise.resolve()`
- Update inline comment for clarity

**Reference:** Research document lines 57-85

---

#### Category 2: Handshake Protocol Fixes (2 tests)

**Issue:** Factory tests don't trigger webview_ready message that initialize() waits for

**Technical Context:**
`createWebviewCommunication` factory calls `initialize()` internally, which waits for `__webview_ready__` message. Tests must manually send this message to complete handshake. Factory returns promise that only resolves after handshake completes.

**Pattern:** Tests already have correct pattern (lines 827-843, 847-867)—verify no changes needed

---

##### Fix 2.1: "should create and initialize communication manager" (line 826)

**Location:** `tests/utils/webviewCommunicationManager.test.ts:826-844`

**Current Code (lines 827-843):**
```typescript
it('should create and initialize communication manager', async () => {
    // Start factory (returns promise)
    const managerPromise = createWebviewCommunication(mockPanel);

    // Allow extension_ready to be sent
    await Promise.resolve();

    // Simulate webview responding
    messageListener({
        id: 'webview-1',
        type: '__webview_ready__',
        timestamp: Date.now()
    });

    // Now await the factory result
    const manager = await managerPromise;

    expect(manager).toBeInstanceOf(WebviewCommunicationManager);
});
```

**Analysis:** Code already follows correct pattern from research (lines 186-204)

**Potential Issue:** If still failing, may need additional microtask flush

**Fix Pattern (if needed):**
```typescript
it('should create and initialize communication manager', async () => {
    // Start factory (returns promise)
    const managerPromise = createWebviewCommunication(mockPanel);

    // Allow extension_ready to be sent
    await Promise.resolve();

    // Simulate webview responding
    messageListener({
        id: 'webview-1',
        type: '__webview_ready__',
        timestamp: Date.now()
    });

    // Flush microtask queue to process handshake
    await Promise.resolve();

    // Now await the factory result
    const manager = await managerPromise;

    expect(manager).toBeInstanceOf(WebviewCommunicationManager);
});
```

**Change Summary (conditional):**
- Add `await Promise.resolve()` after messageListener call IF test still fails
- Only apply if test exhibits handshake timing issues

**Reference:** Research document lines 143-204

---

##### Fix 2.2: "should accept configuration options" (line 846)

**Location:** `tests/utils/webviewCommunicationManager.test.ts:846-867`

**Current Code (lines 847-866):**
```typescript
it('should accept configuration options', async () => {
    // Start factory with options
    const managerPromise = createWebviewCommunication(mockPanel, {
        messageTimeout: 5000,
        maxRetries: 5
    });

    // Allow extension_ready to be sent
    await Promise.resolve();

    // Simulate webview responding
    messageListener({
        id: 'webview-1',
        type: '__webview_ready__',
        timestamp: Date.now()
    });

    // Now await the factory result
    const manager = await managerPromise;

    expect(manager).toBeInstanceOf(WebviewCommunicationManager);
});
```

**Analysis:** Code already follows correct pattern

**Fix Pattern (if needed):**
```typescript
it('should accept configuration options', async () => {
    // Start factory with options
    const managerPromise = createWebviewCommunication(mockPanel, {
        messageTimeout: 5000,
        maxRetries: 5
    });

    // Allow extension_ready to be sent
    await Promise.resolve();

    // Simulate webview responding
    messageListener({
        id: 'webview-1',
        type: '__webview_ready__',
        timestamp: Date.now()
    });

    // Flush microtask queue to process handshake
    await Promise.resolve();

    // Now await the factory result
    const manager = await managerPromise;

    expect(manager).toBeInstanceOf(WebviewCommunicationManager);
});
```

**Change Summary (conditional):**
- Add `await Promise.resolve()` after messageListener call IF test still fails
- Identical pattern to Fix 2.1

**Reference:** Research document lines 143-204

---

#### Category 3: Mock Configuration Fixes (2 tests)

**Issue:** Mock configuration timing/ordering issues

---

##### Fix 3.1: "should not crash if timeout hint fails to send" (line 799)

**Location:** `tests/utils/webviewCommunicationManager.test.ts:799-822`

**Current Code (lines 804-806):**
```typescript
// Make postMessage fail for timeout hint, but succeed for response
(mockWebview.postMessage as jest.Mock)
    .mockRejectedValueOnce(new Error('Failed'))  // timeout hint fails
    .mockResolvedValueOnce(true);                // response succeeds
```

**Issue:** `mockRejectedValueOnce` may be consumed by earlier postMessage call (handshake_complete or other)

**Technical Context:**
Test's `beforeEach` (lines 711-733) completes handshake which may call postMessage. The `mockClear()` at line 733 clears call history but NOT mock implementation queue. If any code calls postMessage before timeout hint, it consumes our `mockRejectedValueOnce`.

**Fix Pattern Option A (Clear and reconfigure):**
```typescript
it('should not crash if timeout hint fails to send', async () => {
    const handler = jest.fn().mockResolvedValue({ result: 'test' });
    manager.on('authenticate', handler);

    // Clear all previous mock configurations, then set new behavior
    (mockWebview.postMessage as jest.Mock).mockClear();
    (mockWebview.postMessage as jest.Mock)
        .mockRejectedValueOnce(new Error('Failed'))  // timeout hint fails
        .mockResolvedValueOnce(true);                // response succeeds

    // Should not throw
    messageListener({
        id: 'msg-1',
        type: 'authenticate',
        payload: {},
        timestamp: Date.now(),
        expectsResponse: true
    });

    await Promise.resolve();
    await Promise.resolve();  // Extra flush for response send

    // Handler should still execute
    expect(handler).toHaveBeenCalled();
});
```

**Fix Pattern Option B (Multiple mockRejectedValueOnce):**
```typescript
// Account for any intermediate postMessage calls
(mockWebview.postMessage as jest.Mock)
    .mockResolvedValueOnce(true)                 // acknowledgment
    .mockRejectedValueOnce(new Error('Failed'))  // timeout hint fails
    .mockResolvedValueOnce(true);                // response succeeds
```

**Recommended:** Option A (explicit clear before reconfigure)

**Change Summary:**
- Add `(mockWebview.postMessage as jest.Mock).mockClear();` at line 803 (before mock configuration)
- Verify no other code calls postMessage between mock setup and messageListener

**Reference:** Research document lines 88-139

---

##### Fix 3.2: "should handle postMessage failure during initialization" (line 983)

**Location:** `tests/utils/webviewCommunicationManager.test.ts:983-996`

**Current Code (lines 984-995):**
```typescript
it('should handle postMessage failure during initialization', async () => {
    (mockWebview.postMessage as jest.Mock).mockRejectedValue(new Error('Failed'));

    manager = new WebviewCommunicationManager(mockPanel);
    const initPromise = manager.initialize();

    // Allow postMessage to fail
    await Promise.resolve();

    // Fast-forward past handshake timeout (10 seconds)
    jest.advanceTimersByTime(10000);

    await expect(initPromise).rejects.toThrow('Webview handshake timeout');
});
```

**Analysis:** Test looks correct per research pattern (lines 244-257)

**Potential Issue:** Missing microtask flush after timer advance

**Fix Pattern:**
```typescript
it('should handle postMessage failure during initialization', async () => {
    (mockWebview.postMessage as jest.Mock).mockRejectedValue(new Error('Failed'));

    manager = new WebviewCommunicationManager(mockPanel);
    const initPromise = manager.initialize();

    // Allow postMessage to fail
    await Promise.resolve();

    // Fast-forward past handshake timeout (10 seconds)
    jest.advanceTimersByTime(10000);
    await Promise.resolve(); // Flush microtask queue to process timeout

    await expect(initPromise).rejects.toThrow('Webview handshake timeout');
});
```

**Change Summary:**
- Add `await Promise.resolve()` after `jest.advanceTimersByTime(10000)` at line 993
- Ensures timeout callback executes before assertion

**Reference:** Research document lines 209-273

---

### REFACTOR Phase (Add Documentation)

After all tests pass, add inline documentation for future maintainers:

**Add comment block at top of retry tests describe block (around line 243):**
```typescript
describe('retry mechanism', () => {
    // NOTE: These tests use Jest fake timers. When advancing timers with
    // jest.advanceTimersByTime(), always follow with await Promise.resolve()
    // to flush the microtask queue. Otherwise, setTimeout callbacks scheduled
    // by retry logic won't execute.
    // Reference: .rptc/research/webviewcommunicationmanager-test-failures/research.md

    it('should retry failed messages', async () => {
        // ... test code ...
    });
    // ... more tests ...
});
```

**Add comment block at top of factory tests describe block (around line 825):**
```typescript
describe('createWebviewCommunication factory', () => {
    // NOTE: Factory tests must manually trigger handshake completion by sending
    // __webview_ready__ message via messageListener(). The factory's initialize()
    // call waits for this message before resolving.
    // Reference: .rptc/research/webviewcommunicationmanager-test-failures/research.md

    it('should create and initialize communication manager', async () => {
        // ... test code ...
    });
    // ... more tests ...
});
```

**Add comment block at top of error handling describe block (around line 870):**
```typescript
describe('edge cases and error handling', () => {
    beforeEach(async () => {
        // ... existing setup ...
    });

    // NOTE: Error tests that involve timeouts must advance fake timers with
    // jest.advanceTimersByTime() AND flush microtask queue with await Promise.resolve().
    // Mock configurations should be cleared before reconfiguring to avoid consuming
    // mocks from previous operations.
    // Reference: .rptc/research/webviewcommunicationmanager-test-failures/research.md

    it('should handle missing payload gracefully', async () => {
        // ... test code ...
    });
    // ... more tests ...
});
```

---

## Expected Outcome

After applying all fixes:

- **All 6 failing tests pass** without timeouts or assertion failures
- **No regression** in other 30+ passing tests
- **Test execution completes** in <10 seconds for full file
- **Coverage maintained** at current 75%+ level
- **Clean test output** with no warnings or skipped tests

**Success Metrics:**
- `npm test -- tests/utils/webviewCommunicationManager.test.ts` exits with code 0
- Total test count: 37 tests, 37 passing, 0 failing, 0 skipped
- No timeout errors in test output

---

## Acceptance Criteria

- [ ] All 6 documented failing tests now pass:
  - [ ] "should retry failed messages" (line 244)
  - [ ] "should throw after max retries exceeded" (line 286)
  - [ ] "should not crash if timeout hint fails to send" (line 799)
  - [ ] "should create and initialize communication manager" (line 826)
  - [ ] "should accept configuration options" (line 846)
  - [ ] "should handle postMessage failure during initialization" (line 983)
- [ ] No regression in other tests (30+ passing tests remain passing)
- [ ] No tests are skipped with `.skip()`
- [ ] Test execution completes in reasonable time (<30s for file)
- [ ] Coverage maintained at ≥75% (no decrease from current level)
- [ ] Inline documentation added explaining timing patterns
- [ ] Full test suite passes: `npm test` exits with code 0

---

## Implementation Constraints

**CRITICAL RULES:**

1. **NO implementation changes** - Only modify test file, never `src/core/communication/webviewCommunicationManager.ts`
2. **Preserve test intent** - Don't change what tests verify, only how they coordinate timing
3. **Minimal changes** - Apply smallest fix that makes test pass
4. **No skipping tests** - Never use `.skip()` as a "fix"
5. **Verify no regression** - Run full suite after each fix

**File Restrictions:**
- ✅ Modify: `tests/utils/webviewCommunicationManager.test.ts`
- ❌ Modify: `src/core/communication/webviewCommunicationManager.ts`
- ❌ Modify: Other test files
- ❌ Modify: Configuration files (jest.config.js, etc.)

---

## Detailed Fix Checklist

Use this checklist during implementation to ensure all fixes applied correctly:

### Preparation
- [ ] Read research document sections for each test
- [ ] Understand fake timer + microtask queue interaction
- [ ] Review current test failures with `npm test -- tests/utils/webviewCommunicationManager.test.ts`

### Category 1: Microtask Flushing
- [ ] Fix 1.1: Replace `jest.runOnlyPendingTimers()` with `jest.advanceTimersByTime(100)` at line 275
- [ ] Fix 1.1: Remove extra `await Promise.resolve()` at line 277
- [ ] Fix 1.2: Replace `jest.runOnlyPendingTimers()` with `jest.advanceTimersByTime(100)` at line 311
- [ ] Fix 1.2: Remove extra `await Promise.resolve()` at line 313
- [ ] Verify: Run retry tests specifically: `npm test -- -t "retry"`

### Category 2: Handshake Protocol
- [ ] Fix 2.1: Add `await Promise.resolve()` after messageListener IF test fails (line ~840)
- [ ] Fix 2.2: Add `await Promise.resolve()` after messageListener IF test fails (line ~863)
- [ ] Verify: Run factory tests: `npm test -- -t "createWebviewCommunication"`

### Category 3: Mock Configuration
- [ ] Fix 3.1: Add `mockClear()` call before mock reconfiguration (line ~803)
- [ ] Fix 3.2: Add `await Promise.resolve()` after `jest.advanceTimersByTime(10000)` (line ~993)
- [ ] Verify: Run error tests: `npm test -- -t "edge cases and error handling"`

### Documentation
- [ ] Add timing pattern comment to retry tests describe block (line ~243)
- [ ] Add handshake pattern comment to factory tests describe block (line ~825)
- [ ] Add error testing comment to error handling describe block (line ~870)

### Verification
- [ ] Run full test file: `npm test -- tests/utils/webviewCommunicationManager.test.ts`
- [ ] Verify 37 tests pass, 0 fail, 0 skipped
- [ ] Run full test suite: `npm test`
- [ ] Verify no regressions in other test files
- [ ] Check test execution time (<30s for full file)
- [ ] Review test output for warnings or anomalies

---

## Troubleshooting Guide

### If tests still fail after applying fixes:

**Issue: Retry tests still timing out**
- **Check:** Did you replace `jest.runOnlyPendingTimers()` with `jest.advanceTimersByTime(100)`?
- **Check:** Does timer advancement match `retryDelay` configuration (100ms)?
- **Check:** Is `await Promise.resolve()` immediately after timer advancement?
- **Debug:** Add console.log in retry loop to verify iterations

**Issue: Factory tests still timing out**
- **Check:** Is `messageListener({type: '__webview_ready__'})` being called?
- **Check:** Is there `await Promise.resolve()` before AND after messageListener?
- **Check:** Is message structure correct (id, type, timestamp)?
- **Debug:** Add console.log before/after messageListener to verify execution order

**Issue: Mock configuration tests failing**
- **Check:** Is `mockClear()` called BEFORE configuring new mock behavior?
- **Check:** Are `mockRejectedValueOnce` calls in correct order?
- **Check:** Count postMessage calls—are there unexpected intermediate calls?
- **Debug:** Add `console.log(mockWebview.postMessage.mock.calls)` to see all calls

**Issue: New test failures (regression)**
- **Check:** Did you accidentally modify tests outside the 6 target tests?
- **Check:** Did you change beforeEach blocks that other tests depend on?
- **Action:** Revert changes, re-apply fixes more carefully, one test at a time

**Issue: Tests pass individually but fail when run together**
- **Check:** Is test isolation working (beforeEach/afterEach)?
- **Check:** Are fake timers being properly reset between tests?
- **Action:** Add `jest.clearAllTimers()` to afterEach if not present

---

## Testing Commands

**Run only failing tests (before fixes):**
```bash
npm test -- tests/utils/webviewCommunicationManager.test.ts --testNamePattern="should retry failed messages|should throw after max retries|should not crash if timeout hint fails|should create and initialize|should accept configuration options|should handle postMessage failure during initialization"
```

**Run by category:**
```bash
# Retry tests only
npm test -- tests/utils/webviewCommunicationManager.test.ts -t "retry"

# Factory tests only
npm test -- tests/utils/webviewCommunicationManager.test.ts -t "createWebviewCommunication"

# Error handling tests only
npm test -- tests/utils/webviewCommunicationManager.test.ts -t "edge cases and error handling"
```

**Run full test file:**
```bash
npm test -- tests/utils/webviewCommunicationManager.test.ts
```

**Run full test suite:**
```bash
npm test
```

**Run with verbose output (for debugging):**
```bash
npm test -- tests/utils/webviewCommunicationManager.test.ts --verbose
```

---

## Success Criteria Validation

After implementation, verify these conditions:

**Test Execution:**
- ✅ All 37 tests in file pass (0 failures, 0 skipped)
- ✅ Test execution completes in <30 seconds
- ✅ No timeout errors in output
- ✅ No warning messages about deprecated patterns

**Code Quality:**
- ✅ Only test file modified (1 file changed)
- ✅ Changes limited to ~30 lines across 6 tests
- ✅ Inline comments added to 3 describe blocks
- ✅ No debug code (console.log) left in file
- ✅ No tests skipped with `.skip()`

**Integration:**
- ✅ Full test suite passes: `npm test` exits 0
- ✅ No regression in other test files
- ✅ Coverage maintained at current level (≥75%)
- ✅ Git status shows only test file modified

**Documentation:**
- ✅ Inline comments reference research document
- ✅ Timing patterns explained for future maintainers
- ✅ Each comment block placed at correct describe block

---

## Estimated Time

**Total:** 45-60 minutes

**Breakdown:**
- Context review (research + test file): 10 min
- Apply fixes (6 tests): 20 min
- Add documentation: 5 min
- Verification (run tests multiple times): 10 min
- Full test suite regression check: 10 min
- Buffer for troubleshooting: 5 min

---

## References

**Primary Research Document:**
- `.rptc/research/webviewcommunicationmanager-test-failures/research.md` - Complete analysis with fix patterns

**Research Document Sections:**
- Lines 57-85: Retry test timing explanation
- Lines 88-139: Mock ordering issues
- Lines 143-204: Factory test handshake patterns
- Lines 209-273: Error test timeout handling
- Lines 276-340: Common pitfalls to avoid
- Lines 481-488: Quick reference table

**Implementation Under Test:**
- `src/core/communication/webviewCommunicationManager.ts:94-147` - initialize() method
- `src/core/communication/webviewCommunicationManager.ts:387-402` - sendWithRetry() method
- `src/core/communication/webviewCommunicationManager.ts:438-445` - Factory function

**Jest Documentation:**
- [Timer Mocks](https://jestjs.io/docs/timer-mocks) - Understanding fake timers
- [Testing Asynchronous Code](https://jestjs.io/docs/asynchronous) - Promise coordination

**JavaScript Event Loop:**
- [Microtasks vs Macrotasks](https://javascript.info/event-loop) - Why `await Promise.resolve()` is needed

---

## Post-Implementation Actions

After all tests pass:

1. **Commit changes:**
   ```bash
   git add tests/utils/webviewCommunicationManager.test.ts
   git commit -m "fix: resolve 6 failing WebviewCommunicationManager tests

   Apply documented timing fix patterns:
   - Add microtask flushing after timer advancement (retry tests)
   - Clear mocks before reconfiguration (mock ordering)
   - Add inline documentation for timing patterns

   All tests now pass without timeouts or assertion failures.

   Reference: .rptc/research/webviewcommunicationmanager-test-failures/"
   ```

2. **Consider future improvements:**
   - Extract common timing patterns into test helper functions
   - Update testing guide with fake timer patterns
   - Review other test files for similar timing issues

3. **Update plan status:**
   - Mark step-01.md as complete
   - Update overview.md status to "Complete"
   - Archive plan to `.rptc/complete/` (optional)

---

**Step Status:** Ready for Implementation
**Next Action:** Run `/rptc:tdd "@fix-7-failing-webviewcommunicationmanager-tests/"` to execute fixes
