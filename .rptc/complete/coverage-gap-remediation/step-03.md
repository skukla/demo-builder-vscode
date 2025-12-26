# Step 3: processCleanup.ts Coverage Tests

**Purpose:** Add tests for uncovered paths in processCleanup.ts to increase coverage from 51% to 80%+

**Priority:** Data Integrity (process cleanup affects running demos)

---

## Prerequisites

- [x] Step 1 completed (securityValidation-githubUrl tests)
- [x] Step 2 completed (securityValidation-pathSafety-async tests)

---

## Tests to Write First

### Test Group 1: killWithTimeout Fallback Path

When tree-kill is unavailable, the code uses `killWithTimeout` directly.

- [ ] **Test:** should use killWithTimeout when tree-kill unavailable
  - **Given:** tree-kill require.resolve throws
  - **When:** killProcessTree called
  - **Then:** process.kill called directly with signal

- [ ] **Test:** should resolve immediately when process exits after initial signal
  - **Given:** Process exists, exits immediately after SIGTERM
  - **When:** killWithTimeout executes
  - **Then:** Resolves without polling or timeout

- [ ] **Test:** should handle ESRCH during force-kill timeout
  - **Given:** Process exits between timeout trigger and SIGKILL send
  - **When:** Force-kill timeout fires
  - **Then:** Resolves without error (line 284-288)

- [ ] **Test:** should skip force-kill timeout when signal is SIGKILL
  - **Given:** Initial signal is SIGKILL
  - **When:** killWithTimeout executes
  - **Then:** No forceKillTimeout set (line 271 condition)

- [ ] **Test:** should handle EPERM error during initial signal
  - **Given:** Process exists but permission denied
  - **When:** process.kill throws EPERM
  - **Then:** Rejects with descriptive error (lines 247-249)

### Test Group 2: processExists Edge Cases

- [ ] **Test:** should return true when EPERM thrown (process exists, no permission)
  - **Given:** process.kill(pid, 0) throws EPERM
  - **When:** processExists called
  - **Then:** Returns true (line 114)

### Test Group 3: killWithTreeKill Force-Kill Polling

- [ ] **Test:** should poll after force-kill in tree-kill path
  - **Given:** Tree-kill SIGTERM ignored, timeout fires, SIGKILL sent
  - **When:** Process still alive briefly after SIGKILL
  - **Then:** Final poll interval detects exit (lines 194-199)

- [ ] **Test:** should handle ESRCH during tree-kill force-kill
  - **Given:** Process exits between tree-kill timeout and SIGKILL
  - **When:** Force-kill attempted
  - **Then:** Continues without throwing (line 188)

---

## Files to Create/Modify

- [ ] `tests/core/shell/processCleanup-coverage.test.ts` - New file for coverage gap tests

---

## Implementation Details

### RED Phase

```typescript
/**
 * Coverage Gap Tests for ProcessCleanup
 *
 * Targets uncovered paths in killWithTimeout and edge cases.
 * Complements existing processCleanup.mocked.test.ts
 */

// Mock tree-kill as unavailable for fallback tests
jest.mock('tree-kill', () => {
    throw new Error('Cannot find module tree-kill');
}, { virtual: true });

describe('ProcessCleanup - Coverage Gaps', () => {
    describe('killWithTimeout fallback (tree-kill unavailable)', () => {
        it('should use process.kill directly when tree-kill unavailable', async () => {
            // Arrange: Mock require.resolve to throw
            // Act: Call killProcessTree
            // Assert: process.kill called with signal
        });

        it('should resolve immediately when process exits after initial signal', async () => {
            // Arrange: Process deletes from set immediately
            // Act: killProcessTree
            // Assert: Resolves < 100ms
        });

        it('should skip force-kill timeout when signal is SIGKILL', async () => {
            // Arrange: Process takes 50ms to die
            // Act: killProcessTree with SIGKILL
            // Assert: No SIGKILL sent twice
        });
    });

    describe('Error handling edge cases', () => {
        it('should handle ESRCH during force-kill timeout', async () => {
            // Arrange: Process exits after timeout starts but before SIGKILL
            // Act: Wait for timeout
            // Assert: Resolves without error
        });

        it('should reject with EPERM during initial signal', async () => {
            // Arrange: process.kill throws EPERM on signal
            // Act: killProcessTree
            // Assert: Rejects with error containing pid
        });
    });

    describe('processExists EPERM handling', () => {
        it('should return true when EPERM thrown', async () => {
            // Arrange: process.kill(pid, 0) throws EPERM
            // Act: Check via killProcessTree behavior
            // Assert: Attempts to kill (process deemed to exist)
        });
    });
});
```

### GREEN Phase

1. Create test file at `tests/core/shell/processCleanup-coverage.test.ts`
2. Mock `require.resolve('tree-kill')` to throw for fallback tests
3. Mock `process.kill` with precise timing control
4. Use `jest.useFakeTimers()` for timeout testing
5. Verify each coverage gap path executes

### REFACTOR Phase

1. Extract common mock setup into helper functions
2. Ensure no test timer leaks (use `afterEach` cleanup)
3. Group related assertions logically
4. Add descriptive comments for coverage intent

---

## Expected Outcome

- 8 new test cases covering killWithTimeout fallback path
- processCleanup.ts coverage increased from 51% to 80%+
- All uncovered error handling paths tested
- No hanging timers or open handles

---

## Acceptance Criteria

- [x] All 8 tests passing (8/8 passing)
- [x] Coverage for processCleanup.ts >= 80% (84.46% statements, 81.81% branches)
- [x] Tests run in < 5 seconds (fake timers) - <1s actual
- [x] No console warnings about open handles
- [x] Tests are independent (can run in isolation)

---

## Estimated Time

2-3 hours (mocking complexity for tree-kill unavailability)

---

## Technical Notes

**Mocking tree-kill unavailability:**
```typescript
// Option 1: Mock require.resolve
const originalResolve = require.resolve;
jest.spyOn(require, 'resolve').mockImplementation((id) => {
    if (id === 'tree-kill') throw new Error('Cannot find module');
    return originalResolve(id);
});

// Option 2: Separate test file with different mock
// This file uses { virtual: true } to simulate missing module
```

**Fake timers for timeout testing:**
```typescript
beforeEach(() => {
    jest.useFakeTimers();
});

afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
});
```

**Process.kill mock with timing:**
```typescript
process.kill = jest.fn().mockImplementation((pid, signal) => {
    if (signal === 'SIGTERM') {
        // Simulate delayed exit
        setTimeout(() => processExists.delete(pid), 100);
    } else if (signal === 'SIGKILL') {
        processExists.delete(pid);
    }
    return true;
});
```
