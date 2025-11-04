# Step 3: Fix Logger Interface Mismatches in Tests

## Summary

Update mock logger setups in test files to match the current Logger interface. The mock loggers are missing the `debug` method, causing `TypeError: this.logger.error is not a function` and similar failures. This step adds the missing method to all affected test mocks.

---

## Purpose

Fix test failures caused by incomplete logger mocks that don't match the actual `Logger` interface from `@/core/logging`. The current Logger interface has four methods (`info`, `warn`, `error`, `debug`), but test mocks only include three, leading to runtime errors when tests execute code paths that call logger methods.

**Why this step is critical:**
- Fixes ~3 test failures in ResetAllCommand test suite
- Prevents future logger-related test failures
- Ensures test mocks match production interfaces

---

## Prerequisites

- [x] Step 1 complete (TypeScript jest-dom matchers configured)
- [x] Step 2 complete (Test file paths fixed after refactor)

---

## Tests to Write First

### Verification Tests

- [x] **Test: Mock logger interface completeness**
  - **Given:** A mock logger created in test setup
  - **When:** Verifying interface against Logger class
  - **Then:** Mock has all four methods (info, warn, error, debug)
  - **File:** `tests/core/commands/ResetAllCommand.test.ts` (within existing beforeEach)

- [x] **Test: Logger methods callable without errors**
  - **Given:** ResetAllCommand with mock logger
  - **When:** Command executes and calls logger methods
  - **Then:** No "function is not defined" TypeErrors thrown
  - **File:** Implicit (existing tests will pass after fix)

- [x] **Test: Debug method available**
  - **Given:** Mock logger with debug method
  - **When:** Test code calls mockLogger.debug()
  - **Then:** Call succeeds without error
  - **File:** `tests/core/commands/ResetAllCommand.test.ts` (add quick verification test)

---

## Files to Modify

- [x] `tests/core/commands/ResetAllCommand.test.ts` - Add `debug` to mockLogger
- [x] `tests/core/commands/ResetAllCommand.integration.test.ts` - Add `debug` to mockLogger
- [x] `tests/core/commands/ResetAllCommand.security.test.ts` - Add `debug` to mockLogger
- [x] Other test files with incomplete logger mocks (if failures persist)

---

## Implementation Details

### RED Phase (Write failing tests)

**Pattern to verify:**
```typescript
describe('Logger Mock Verification', () => {
  it('should have all required Logger methods', () => {
    // Verify mock logger interface is complete
    expect(mockLogger.info).toBeDefined();
    expect(mockLogger.warn).toBeDefined();
    expect(mockLogger.error).toBeDefined();
    expect(mockLogger.debug).toBeDefined();
  });
});
```

Run tests - should fail because `mockLogger.debug` is undefined.

---

### GREEN Phase (Minimal implementation)

**Current (incomplete) mock:**
```typescript
mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};
```

**Updated (complete) mock:**
```typescript
mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
} as any;
```

**Apply to all three files:**

1. **ResetAllCommand.test.ts** (line 45-49)
   - Add `debug: jest.fn()` after `error: jest.fn(),`

2. **ResetAllCommand.integration.test.ts** (line 53-57)
   - Add `debug: jest.fn()` after `error: jest.fn(),`

3. **ResetAllCommand.security.test.ts** (line 58-62)
   - Add `debug: jest.fn()` after `error: jest.fn(),`

**Reference implementation:** See `tests/features/prerequisites/services/PrerequisitesManager.test.ts` (lines 70-75) for correct pattern.

Run tests - should now pass.

---

### REFACTOR Phase (Improve quality)

**Optional improvements** (only if time permits):

1. **Type-safe mock factory:**
   ```typescript
   // tests/utils/mocks/loggerMock.ts
   import type { Logger } from '@/core/logging';

   export function createMockLogger(): jest.Mocked<Logger> {
       return {
           info: jest.fn(),
           warn: jest.fn(),
           error: jest.fn(),
           debug: jest.fn(),
       } as any;
   }
   ```

2. **Use in tests:**
   ```typescript
   import { createMockLogger } from '@/tests/utils/mocks/loggerMock';

   mockLogger = createMockLogger();
   ```

**IMPORTANT:** Only create factory if it will be reused across multiple test files. Don't over-engineer for 3 files with simple mocks.

---

## Expected Outcome

After this step:
- ✅ All ResetAllCommand tests pass without logger-related errors
- ✅ Mock logger interface matches actual Logger class
- ✅ ~3 test failures resolved (ResetAllCommand suite)
- ✅ Tests can safely call any logger method without TypeErrors
- ✅ Test suite count: 95 total, ~90 passing (up from ~87)

---

## Acceptance Criteria

- [x] All three ResetAllCommand test files have `debug` method in mockLogger
- [x] All ResetAllCommand tests passing
- [x] No "TypeError: this.logger.X is not a function" errors
- [x] Mock logger matches Logger interface (info, warn, error, debug)
- [x] No console warnings about missing methods
- [x] Test runs complete without TypeErrors in logger calls

---

## Dependencies

**Depends on:**
- Step 1 (TypeScript matchers) - Ensures type safety in tests
- Step 2 (File path fixes) - Tests can import correct modules

**Required by:**
- Step 4 (ComponentSelectionStep fixes) - May encounter similar mock issues
- Step 5 (WebviewCommunicationManager fixes) - Clean test environment needed

---

## Estimated Time

**20-25 minutes**

- Investigation: 5 minutes (verify logger interface, find all instances)
- Implementation: 10 minutes (update 3 test files)
- Verification: 5-10 minutes (run tests, confirm fixes)
- Documentation: 0 minutes (inline comments sufficient)

**Complexity:** Low (simple mock interface update, no logic changes)

---

## Notes

### Why debug method was missing

The Logger class was refactored to wrap DebugLogger (v1.4.0), adding the `debug` method for dual-channel logging. Test mocks created before this refactor only had the original three methods (info, warn, error).

### Type casting workaround

The `as any` cast in mock definitions bypasses TypeScript's strict type checking for test mocks. This is a common Jest pattern because jest.fn() doesn't exactly match method signatures with overloads.

### Future prevention

If this pattern repeats frequently (>5 test files), consider:
1. Creating shared mock factory in `tests/utils/mocks/`
2. Using jest-mock-extended for automatic mock generation
3. Adding ESLint rule to catch incomplete logger mocks

For now, manual fixes are sufficient given low instance count (3 files).
