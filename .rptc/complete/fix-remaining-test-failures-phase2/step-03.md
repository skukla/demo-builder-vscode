# Step 3: Fix Prerequisites System Tests (LARGEST CATEGORY - 13 SUITES)

## Summary

Fix cache manager TTL and invalidation tests, parallel execution race condition tests, integration tests for prerequisite flows, and remove dead prerequisite tests. This is the largest test category with 13 failing suites requiring comprehensive fixes.

## Purpose

**Why this step is the LARGEST:**
- **13 failing test suites** - More than any other category (double the size of authentication tests)
- **Critical system**: Prerequisites system blocks project creation if broken
- **Complex subsystems**: Cache management, parallel execution, Node.js version management
- **Timeline risk**: Size may exceed estimate, requires careful tracking (per Risk 5 mitigation)

**Prerequisites System Impact:**
- Prerequisite checks must work for project initialization
- Cache optimization enables fast rechecks (5-minute TTL reduces 3-6s checks to <1s)
- Parallel execution enables multi-Node-version checks (3x faster)
- Integration tests verify end-to-end installation flows

**Why After Security and Auth:**
- Security patterns established (Step 1)
- Authentication patterns established (Step 2)
- Prerequisites system may depend on auth for Adobe CLI checks
- Foundation stable before tackling largest category

## Prerequisites

- [ ] Step 0 complete (research findings available)
- [ ] Step 1 complete (security validation patterns established)
- [ ] Step 2 complete (authentication patterns established)
- [ ] SOPs loaded: `testing-guide.md`, `flexible-testing-guide.md`
- [ ] Baseline prerequisite test run to confirm 13 failing suites

## Tests to Write First (TDD - RED Phase)

### Test Scenario 1: Cache Manager Tests (TTL and Invalidation)

- [ ] **Test:** Cache stores prerequisite result with TTL
  - **Given:** Prerequisite check result (Node.js version)
  - **When:** `setCachedResult('node', result)` is called
  - **Then:** Result cached with expiry > current time (5-minute TTL)
  - **File:** `tests/unit/prerequisites/cacheManager.test.ts`

- [ ] **Test:** Cache returns cached result before expiry
  - **Given:** Cached result with TTL not expired
  - **When:** `getCachedResult('node')` is called
  - **Then:** Returns cached data without new check
  - **File:** `tests/unit/prerequisites/cacheManager.test.ts`

- [ ] **Test:** Cache returns null after TTL expiry
  - **Given:** Cached result with expired TTL (>5 minutes old)
  - **When:** `getCachedResult('node')` is called
  - **Then:** Returns null (forces new check)
  - **File:** `tests/unit/prerequisites/cacheManager.test.ts`

- [ ] **Test:** Cache invalidation clears specific entry
  - **Given:** Multiple cached prerequisite results
  - **When:** `invalidate('node')` is called
  - **Then:** Only Node.js entry cleared, others remain
  - **File:** `tests/unit/prerequisites/cacheManager.test.ts`

- [ ] **Test:** Cache clear removes all entries
  - **Given:** Multiple cached prerequisite results
  - **When:** `clear()` is called
  - **Then:** All cached entries removed
  - **File:** `tests/unit/prerequisites/cacheManager.test.ts`

### Test Scenario 2: Parallel Execution Tests (Race Conditions)

- [ ] **Test:** Parallel prerequisite checks execute concurrently
  - **Given:** Multiple Node.js versions to check (18, 20, 22)
  - **When:** `checkAllVersions()` executes in parallel
  - **Then:** Checks run concurrently (3x faster than sequential)
  - **File:** `tests/unit/prerequisites/parallelExecution.test.ts`

- [ ] **Test:** Cache prevents duplicate concurrent checks
  - **Given:** Two concurrent requests for same prerequisite
  - **When:** Both request `getCachedResult('node')` simultaneously
  - **Then:** Only one check executes, both get same cached result
  - **File:** `tests/unit/prerequisites/parallelExecution.test.ts`

- [ ] **Test:** Parallel checks handle failures independently
  - **Given:** 3 parallel checks, one fails
  - **When:** All checks complete
  - **Then:** Failed check doesn't block other checks, results isolated
  - **File:** `tests/unit/prerequisites/parallelExecution.test.ts`

- [ ] **Test:** Race condition between cache set and get
  - **Given:** Concurrent `setCachedResult()` and `getCachedResult()` calls
  - **When:** Both execute simultaneously
  - **Then:** No race condition, get returns valid or null (never corrupted data)
  - **File:** `tests/unit/prerequisites/parallelExecution.test.ts`

### Test Scenario 3: Integration Tests (Prerequisite Flows)

- [ ] **Test:** End-to-end prerequisite check flow
  - **Given:** Fresh system with no cache
  - **When:** Full prerequisite check executed
  - **Then:** All prerequisites checked, results cached, status accurate
  - **File:** `tests/integration/prerequisites/endToEnd.test.ts`

- [ ] **Test:** Installation flow with progress tracking
  - **Given:** Missing prerequisite (Adobe AIO CLI)
  - **When:** Auto-installation triggered
  - **Then:** Progress updates emitted, installation succeeds, cache updated
  - **File:** `tests/integration/prerequisites/progressFlow.test.ts`

- [ ] **Test:** Parallel execution with cache integration
  - **Given:** Multiple Node.js versions, some cached, some not
  - **When:** Parallel check executed
  - **Then:** Cached results used, only uncached versions checked
  - **File:** `tests/integration/prerequisites/parallelWithCache.test.ts`

- [ ] **Test:** Installation performance with optimized flags
  - **Given:** Adobe AIO CLI installation needed
  - **When:** Installation with optimized npm flags (`--no-fund --prefer-offline`)
  - **Then:** Installation completes 40-60% faster than default
  - **File:** `tests/integration/prerequisites/installationPerformance.test.ts`

- [ ] **Test:** Installation fallback on optimized flags failure
  - **Given:** Optimized npm flags fail (network issue)
  - **When:** Fallback to standard flags
  - **Then:** Installation succeeds with standard flags, user notified
  - **File:** `tests/integration/prerequisites/installationFallback.test.ts`

### Test Scenario 4: Dead Test Identification and Removal

- [ ] **Test:** Identify tests for removed features
  - **Given:** Test files in prerequisites directory
  - **When:** Compare against current implementation
  - **Then:** Tests for removed features identified (documented for deletion)
  - **File:** Manual code review (document findings)

- [ ] **Test:** Verify test coverage matches implementation
  - **Given:** Coverage report for prerequisites system
  - **When:** Compare test scenarios to actual code paths
  - **Then:** No dead tests (all tests exercise real code), no untested code (>90% coverage)
  - **File:** Coverage analysis (manual verification)

## Files to Create/Modify

### Unit Test Files (Cache and Parallel Execution)

- [ ] `tests/unit/prerequisites/cacheManager.test.ts` - Fix cache TTL, invalidation, and clear tests
  - **Current Issues:** TTL expiry tests may use incorrect time mocking
  - **Fix:** Update time mocking to match 5-minute TTL (CACHE_TTL constant)
  - **Lines:** Cache expiry assertions, invalidation logic

- [ ] `tests/unit/prerequisites/parallelExecution.test.ts` - Fix race condition tests
  - **Current Issues:** Race condition tests may not properly simulate concurrency
  - **Fix:** Use `Promise.all()` to simulate true parallel execution
  - **Lines:** Concurrent check scenarios, cache race conditions

### Feature Test Files (Handlers and Services)

- [ ] `tests/features/prerequisites/handlers/checkHandler.test.ts` - Fix prerequisite check handler
  - **Current Issues:** Handler may not properly integrate with cache
  - **Fix:** Update mocks to include cache layer
  - **Lines:** Handler tests, cache integration

- [ ] `tests/features/prerequisites/handlers/installHandler.test.ts` - Fix installation handler
  - **Current Issues:** Progress tracking mocks may be outdated
  - **Fix:** Update progress tracking expectations to match refactored system
  - **Lines:** Installation flow, progress emissions

- [ ] `tests/features/prerequisites/handlers/continueHandler.test.ts` - Fix continue handler
  - **Current Issues:** State transitions may not match current flow
  - **Fix:** Update state expectations to match current wizard flow
  - **Lines:** State transition assertions

- [ ] `tests/features/prerequisites/handlers/shared.test.ts` - Fix shared handler utilities
  - **Current Issues:** Shared utilities may have changed interfaces
  - **Fix:** Update function signatures and return types
  - **Lines:** Utility function tests

- [ ] `tests/features/prerequisites/services/PrerequisitesManager.test.ts` - Fix prerequisite manager
  - **Current Issues:** Manager orchestration tests may be outdated
  - **Fix:** Update to match current manager responsibilities
  - **Lines:** Manager orchestration, cache integration

- [ ] `tests/features/prerequisites/npmFlags.test.ts` - Fix npm flags optimization tests
  - **Current Issues:** Flag validation may not match current implementation
  - **Fix:** Verify flags match actual npm command construction
  - **Lines:** Flag validation, optimization logic

- [ ] `tests/features/prerequisites/npmFallback.test.ts` - Fix npm fallback tests
  - **Current Issues:** Fallback logic may have changed
  - **Fix:** Update fallback scenario expectations
  - **Lines:** Fallback triggers, error handling

### Integration Test Files (End-to-End Flows)

- [ ] `tests/integration/prerequisites/endToEnd.test.ts` - Fix end-to-end flow
  - **Current Issues:** Full flow may include outdated steps
  - **Fix:** Update flow to match current prerequisite check sequence
  - **Lines:** Complete flow assertions

- [ ] `tests/integration/prerequisites/progressFlow.test.ts` - Fix progress tracking
  - **Current Issues:** Progress events may not match current emitter
  - **Fix:** Update progress event expectations
  - **Lines:** Progress event assertions

- [ ] `tests/integration/prerequisites/parallelWithCache.test.ts` - Fix parallel + cache integration
  - **Current Issues:** Integration between parallel execution and cache may be broken
  - **Fix:** Update to match current cache-aware parallel execution
  - **Lines:** Cache hit/miss scenarios, parallel execution

- [ ] `tests/integration/prerequisites/installationPerformance.test.ts` - Fix performance tests
  - **Current Issues:** Performance expectations may be outdated
  - **Fix:** Update timing expectations to match current optimization (40-60% faster)
  - **Lines:** Performance assertions, timing comparisons

- [ ] `tests/integration/prerequisites/installationFallback.test.ts` - Fix fallback integration
  - **Current Issues:** Fallback integration may not match current error handling
  - **Fix:** Update fallback scenario integration
  - **Lines:** Fallback triggers, recovery flow

### Files to Potentially Delete (Dead Tests)

- [ ] **Analyze all 15 test files** for dead code
  - Verify each test exercises actual code (not removed features)
  - Check coverage report for untested files (may indicate dead tests)
  - Document any tests targeting removed functionality

## Implementation Details

### RED Phase: Run All Prerequisite Tests and Categorize Failures

**Run All Prerequisite Tests:**
```bash
# Run all prerequisite tests
npm test -- tests/unit/prerequisites/
npm test -- tests/features/prerequisites/
npm test -- tests/integration/prerequisites/

# Or run all at once with pattern
npm test -- --testPathPattern=prerequisites
```

**Categorize Failures by Root Cause:**

1. **Cache-related failures** (expected: TTL, invalidation, expiry)
   - Document exact TTL expectations vs actual
   - Note any time mocking issues

2. **Parallel execution failures** (expected: race conditions, concurrency)
   - Document which scenarios fail
   - Note if true parallelism not simulated

3. **Integration failures** (expected: flow mismatches, outdated expectations)
   - Document which flow steps fail
   - Note differences between expected and actual

4. **Dead test candidates** (expected: tests for removed features)
   - List tests that fail with "module not found" or similar
   - Document tests that reference removed code

**Timeline Checkpoint (Risk 5 Mitigation):**
- After categorizing failures, estimate time per category
- If total estimate >6 hours, **PAUSE and request substep breakdown**
- Document checkpoint findings before proceeding to GREEN phase

### GREEN Phase: Fix Tests by Category

#### Fix 1: Cache Manager Tests (TTL and Invalidation)

**Location:** `tests/unit/prerequisites/cacheManager.test.ts`

**Current Implementation Review:**
```typescript
// Verify CACHE_TTL constant usage
import { CACHE_TTL } from '@/core/utils/timeoutConfig';

// Expected TTL: 5 minutes (300000ms)
```

**Fixes to Apply:**

1. **TTL Expiry Tests:**
   ```typescript
   // Update time mocking to advance by CACHE_TTL
   jest.useFakeTimers();
   cacheManager.setCachedResult('node', mockResult);

   // Advance time by TTL + 1ms
   jest.advanceTimersByTime(CACHE_TTL + 1);

   const cached = cacheManager.getCachedResult('node');
   expect(cached).toBeNull(); // Expired

   jest.useRealTimers();
   ```

2. **Cache Invalidation Tests:**
   - Verify `invalidate()` removes specific entry
   - Verify `clear()` removes all entries
   - Ensure no side effects on other cached items

3. **Cache Security (LRU Eviction, Size Limits):**
   - Verify cache respects 100-entry limit
   - Verify LRU eviction when limit exceeded
   - Verify TTL jitter (±10%) prevents thundering herd

**Expected Outcome:**
- All cache manager tests passing
- TTL tests correctly simulate expiry
- Invalidation tests verify isolation

#### Fix 2: Parallel Execution Tests (Race Conditions)

**Location:** `tests/unit/prerequisites/parallelExecution.test.ts`

**Parallel Execution Patterns:**
```typescript
// Simulate true concurrent execution
const checks = [
  checkPrerequisite('node-18'),
  checkPrerequisite('node-20'),
  checkPrerequisite('node-22')
];

const results = await Promise.all(checks);

// Verify all completed
expect(results).toHaveLength(3);
```

**Fixes to Apply:**

1. **Concurrent Cache Access:**
   ```typescript
   // Simulate race condition
   const [result1, result2] = await Promise.all([
     cacheManager.getCachedResult('node'),
     cacheManager.getCachedResult('node')
   ]);

   // Both should get same result (or both null)
   expect(result1).toEqual(result2);
   ```

2. **Independent Failure Handling:**
   ```typescript
   // One check fails, others succeed
   const results = await Promise.allSettled([
     checkPrerequisite('valid'),
     checkPrerequisite('invalid'), // Will fail
     checkPrerequisite('valid')
   ]);

   expect(results[0].status).toBe('fulfilled');
   expect(results[1].status).toBe('rejected');
   expect(results[2].status).toBe('fulfilled');
   ```

3. **Performance Verification:**
   - Verify parallel execution is actually faster (3x for 3 checks)
   - Use timing assertions to confirm concurrency

**Expected Outcome:**
- All parallel execution tests passing
- Race conditions properly tested
- Performance improvements verified

#### Fix 3: Integration Tests (End-to-End Flows)

**Locations:** `tests/integration/prerequisites/*.test.ts` (5 files)

**Integration Test Patterns:**
```typescript
// End-to-end flow test structure
describe('Full prerequisite check flow', () => {
  it('should check, cache, and return status', async () => {
    // Arrange: Clean state
    // Act: Execute full flow
    // Assert: Verify complete flow
  });
});
```

**Fixes to Apply:**

1. **End-to-End Flow (`endToEnd.test.ts`):**
   - Update flow to match current check sequence
   - Verify cache integration
   - Ensure status reporting accurate

2. **Progress Flow (`progressFlow.test.ts`):**
   - Update progress event expectations
   - Verify installation triggers progress updates
   - Ensure progress percentages accurate

3. **Parallel + Cache Integration (`parallelWithCache.test.ts`):**
   - Verify cached results used during parallel execution
   - Ensure only uncached items trigger new checks
   - Validate performance improvements

4. **Installation Performance (`installationPerformance.test.ts`):**
   - Update timing expectations (40-60% faster with optimized flags)
   - Verify npm flags actually applied
   - Ensure performance measurements accurate

5. **Installation Fallback (`installationFallback.test.ts`):**
   - Verify fallback triggers on optimized flag failure
   - Ensure standard flags used in fallback
   - Validate user notification of fallback

**Expected Outcome:**
- All 5 integration tests passing
- End-to-end flows match current implementation
- Performance optimizations verified

#### Fix 4: Feature Tests (Handlers and Services)

**Locations:** `tests/features/prerequisites/*.test.ts` (7 files)

**Handler Test Patterns:**
```typescript
// Handler test structure
describe('CheckHandler', () => {
  it('should check prerequisite and cache result', async () => {
    // Arrange: Mock dependencies
    // Act: Call handler
    // Assert: Verify behavior
  });
});
```

**Fixes to Apply (per file):**

1. **`checkHandler.test.ts`:** Update cache integration mocks
2. **`installHandler.test.ts`:** Fix progress tracking expectations
3. **`continueHandler.test.ts`:** Update state transition expectations
4. **`shared.test.ts`:** Fix shared utility function signatures
5. **`PrerequisitesManager.test.ts`:** Update manager orchestration tests
6. **`npmFlags.test.ts`:** Verify npm flag validation
7. **`npmFallback.test.ts`:** Fix fallback trigger tests

**Expected Outcome:**
- All 7 feature tests passing
- Handler integration verified
- Manager orchestration correct

#### Fix 5: Dead Test Removal

**Process:**

1. **Identify Dead Tests:**
   ```bash
   # Run coverage report
   npm test -- --coverage --testPathPattern=prerequisites

   # Look for:
   # - Tests with 0% coverage contribution
   # - Tests targeting removed files
   # - Tests with "module not found" errors
   ```

2. **Verify Before Deletion:**
   - Confirm test targets non-existent code
   - Check if test is duplicate of another test
   - Document reason for deletion

3. **Delete Dead Tests:**
   - Remove test file or test case
   - Update test counts in documentation
   - Commit with clear deletion rationale

**Expected Outcome:**
- Dead tests removed
- Test suite cleaner
- Documentation updated with final test count

### REFACTOR Phase: Ensure Test Quality and Independence

**Test Independence Verification:**

1. **Run Tests in Isolation:**
   ```bash
   # Run each test file individually to verify independence
   for file in tests/**/*prerequisites*.test.ts; do
     npm test -- "$file"
   done
   ```

2. **Run Tests in Random Order:**
   ```bash
   # Verify no order dependencies
   npm test -- --testPathPattern=prerequisites --runInBand --randomize
   ```

3. **Check for Shared State:**
   - Review `beforeEach` and `afterEach` hooks
   - Ensure mocks cleared between tests
   - Verify no global state pollution

**Test Quality Improvements:**

1. **Consistent Test Naming:**
   - Follow Given-When-Then pattern
   - Clear, descriptive test names
   - Logical grouping with `describe` blocks

2. **Assertion Clarity:**
   - Use specific matchers (`toEqual`, `toBeNull`, not just `toBeTruthy`)
   - Include failure messages for complex assertions
   - Verify all code paths tested

3. **Mock Quality:**
   - Realistic mock data
   - Minimal mocking (prefer integration tests where possible)
   - Clear mock setup and teardown

**Documentation:**

1. **Update Test Documentation:**
   - Document test strategy for prerequisites system
   - Explain cache testing approach
   - Note parallel execution test patterns

2. **Code Comments:**
   - Add comments for non-obvious test scenarios
   - Explain timing-sensitive tests
   - Document any test-specific workarounds

## Expected Outcome

**After completing this step:**

1. **Tests Fixed:**
   - 13 prerequisite test suites passing (all failures resolved)
   - Cache manager tests: 100% passing (TTL, invalidation, clear)
   - Parallel execution tests: 100% passing (race conditions handled)
   - Integration tests: 100% passing (5 flows verified)
   - Feature tests: 100% passing (7 handler/service files)

2. **Dead Tests Removed:**
   - All tests exercise actual code (no tests for removed features)
   - Coverage report shows no dead test files
   - Test suite cleaner and more maintainable

3. **Test Quality:**
   - Test independence verified (no pollution)
   - Tests run successfully in random order
   - Consistent naming and assertion patterns

4. **Documentation:**
   - Test strategy documented
   - Cache and parallel execution patterns explained
   - Final test count updated (13 passing prerequisite suites)

**Verification:**
```bash
# Run all prerequisite tests
npm test -- --testPathPattern=prerequisites

# Expected: All tests passing
# Expected: 13 suites passing (or fewer if duplicates removed)
```

## Acceptance Criteria

### Functional Criteria

- [ ] **Cache Manager:** All TTL, invalidation, and clear tests passing
- [ ] **Parallel Execution:** All race condition and concurrency tests passing
- [ ] **Integration Tests:** All 5 integration flow tests passing
- [ ] **Feature Tests:** All 7 handler/service tests passing
- [ ] **Dead Tests Removed:** All tests exercise actual code (verified via coverage)

### Test Coverage Criteria

- [ ] **Overall:** Prerequisite system maintains >90% line coverage
- [ ] **Cache Manager:** 100% coverage (critical for performance)
- [ ] **Parallel Execution:** >85% coverage (core logic tested)
- [ ] **Integration Tests:** E2E flows verified (>80% coverage)

### Test Quality Criteria

- [ ] **Independence:** Tests run successfully in random order
- [ ] **No Pollution:** Each test file passes in isolation
- [ ] **Consistent Naming:** All tests follow Given-When-Then pattern
- [ ] **Clear Assertions:** All assertions use specific matchers with failure messages
- [ ] **Minimal Mocking:** Integration tests prefer real implementations where safe

### Code Quality Criteria

- [ ] **No Debug Code:** No console.log or debugger statements
- [ ] **TypeScript:** Clean compilation, no type errors
- [ ] **Linting:** No ESLint warnings
- [ ] **Documentation:** Test strategy and patterns documented

## Dependencies from Other Steps

### Depends On

- **Step 0 (Research):** Test maintenance tools and strategies
- **Step 1 (Security):** Security validation patterns may be used in prerequisites
- **Step 2 (Authentication):** Authentication patterns may be used for Adobe CLI checks

### Blocks

- **None:** Steps 4-6 can proceed in parallel (prerequisites independent of React components)

### Provides

- **Prerequisite Test Patterns:** For other test categories
- **Cache Testing Approach:** Reusable for auth cache and other cache systems
- **Parallel Execution Patterns:** For other concurrent test scenarios

## Estimated Time

**Total: 4-6 hours** (TIMELINE RISK - largest category)

**Breakdown:**
- **RED Phase (categorize failures):** 60 minutes
  - Run all 15 test files: 20 minutes
  - Categorize by root cause: 40 minutes
  - **CHECKPOINT:** Estimate time per category (Risk 5 mitigation)
- **GREEN Phase (fix tests):** 180-240 minutes (3-4 hours)
  - Cache manager fixes: 45 minutes
  - Parallel execution fixes: 45 minutes
  - Integration test fixes (5 files): 60 minutes
  - Feature test fixes (7 files): 60 minutes
  - Dead test removal: 30 minutes
- **REFACTOR Phase (verify quality):** 60 minutes
  - Test independence verification: 20 minutes
  - Quality improvements: 20 minutes
  - Documentation updates: 20 minutes

**Why This Estimate:**
- **Largest category:** 13 failing suites = double the complexity
- **Subsystem complexity:** Cache, parallel execution, integration tests all non-trivial
- **Timeline risk:** May exceed estimate if issues more complex than anticipated

**Timeline Risk Mitigation (per Risk 5):**
1. **Checkpoint after RED phase:** Estimate actual time needed per category
2. **Break into substeps if needed:** If estimate >6 hours, pause and request substep breakdown
3. **Track actual vs estimated time:** After fixing first 3 categories, reassess total time
4. **Request timeline extension:** If >50% over estimate at halfway point

**Confidence:** Medium (70%) - Largest category increases uncertainty

---

**Next Step After Completion:** Step 4 - Fix React Component Tests (11 suites)
**Command to Execute This Step:** `/rptc:tdd "@fix-remaining-test-failures-phase2/step-03.md"`
