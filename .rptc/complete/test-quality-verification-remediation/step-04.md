# Step 4: Add Missing Unit Tests & Remove Dead Tests

## Status Tracking

- [x] Planned
- [ ] In Progress (TDD Phase)
- [ ] Complete

**Estimated Time:** 24-32 hours

---

## Purpose

Expand unit test coverage from 4 files to 20+ files for core utilities while identifying and removing dead/orphaned test files that test non-existent code. This step corrects the inverted test pyramid (currently too many integration tests, too few unit tests) and ensures all critical utilities have proper test coverage.

**Why this step matters**: Unit tests are the foundation of the test pyramid (70% target). With only 4 unit test files currently, the codebase lacks fast, focused tests for core utilities. Additionally, dead tests create maintenance burden and false confidence in coverage metrics.

**Current State**:
- Only 4 unit test files exist: cacheManager, parallelExecution, progressUnifier, progressUnifierHelpers
- Test pyramid inverted: Heavy integration tests, minimal unit tests
- Unknown number of dead tests (testing deleted/refactored code)
- Core utilities in `src/core/utils/`, `src/core/shell/`, `src/features/*/utils/` untested

**Target State**:
- 20+ unit test files covering critical utilities
- Test pyramid distribution: 70% unit / 25% integration / 5% E2E
- Zero dead tests (all tests map to existing implementation code)
- Fast feedback loop for utility changes

---

## Prerequisites

- [ ] Steps 1-3 complete (React 19 fixes, mock reduction, file splits, type safety)
- [ ] Jest configured with ts-jest (already set up)
- [ ] Full test suite passing (baseline established)
- [ ] Git branch created for this step (isolation for rollback)

---

## Tests to Write First

**Note**: This step is DUAL-PURPOSE - we're writing NEW tests for untested utilities AND verifying/removing DEAD tests. The test strategy covers both activities.

### Part A: New Unit Tests (Write Tests First)

**For each utility identified in audit (Implementation Details), write unit tests following this pattern:**

- [ ] Test: [Utility Name] - Happy path scenarios
  - **Given:** Valid inputs to utility function/class
  - **When:** Function/method called
  - **Then:** Expected output returned, no side effects
  - **File:** `tests/unit/core/utils/[utility-name].test.ts` (or appropriate path)

- [ ] Test: [Utility Name] - Edge case scenarios
  - **Given:** Boundary inputs (empty, null, max values, etc.)
  - **When:** Function/method called with edge cases
  - **Then:** Handled gracefully (returns defaults, throws expected errors)
  - **File:** Same as above

- [ ] Test: [Utility Name] - Error conditions
  - **Given:** Invalid inputs or error states
  - **When:** Function/method called
  - **Then:** Throws specific error or returns error indicator
  - **File:** Same as above

**Example Unit Test Structure** (from existing patterns):

```typescript
// tests/unit/core/utils/promiseUtils.test.ts
import { withTimeout, retryOperation } from '@/core/utils/promiseUtils';

describe('promiseUtils', () => {
  describe('withTimeout', () => {
    it('resolves when promise completes within timeout', async () => {
      // Arrange
      const fastPromise = Promise.resolve('success');

      // Act
      const result = await withTimeout(fastPromise, 1000);

      // Assert
      expect(result).toBe('success');
    });

    it('rejects when promise exceeds timeout', async () => {
      // Arrange
      const slowPromise = new Promise(resolve => setTimeout(resolve, 2000));

      // Act & Assert
      await expect(withTimeout(slowPromise, 100)).rejects.toThrow('Timeout');
    });
  });
});
```

### Part B: Dead Test Detection (Verification, Not New Tests)

- [ ] Test: Verify all test file imports resolve to existing source files
  - **Given:** List of all test files (grep for `*.test.ts`)
  - **When:** Extract import paths from each test file
  - **Then:** All imported paths exist in `src/` directory
  - **File:** Manual verification using grep/find (not an automated test)

- [ ] Test: Verify no test files for deleted implementation code
  - **Given:** Git history of deleted files in `src/`
  - **When:** Cross-reference deleted files with test files
  - **Then:** No orphaned tests remain for deleted code
  - **File:** Manual verification using git log and grep

- [ ] Test: Verify full test suite passes after dead test removal
  - **Given:** Dead tests removed from codebase
  - **When:** Run `npm test`
  - **Then:** All remaining tests pass, coverage maintained or improved
  - **File:** All test files

---

## Files to Create/Modify

### Part A: New Unit Test Files (To Create)

**Core Utilities** (`src/core/utils/`):

- [ ] `tests/unit/core/utils/promiseUtils.test.ts` - Test withTimeout, retryOperation, debounce helpers
- [ ] `tests/unit/core/utils/envVarExtraction.test.ts` - Test .env parsing, variable extraction
- [ ] `tests/unit/core/utils/timeoutConfig.test.ts` - Test timeout configuration logic
- [ ] `tests/unit/core/utils/webviewHTMLBuilder.test.ts` - Test HTML generation for webviews
- [ ] `tests/unit/core/utils/loadingHTML.test.ts` - Test loading screen HTML generation

**Core Shell Utilities** (`src/core/shell/`):

- [ ] `tests/unit/core/shell/rateLimiter.test.ts` - Test rate limiting logic
- [ ] `tests/unit/core/shell/retryStrategyManager.test.ts` - Test retry strategies (exponential backoff, etc.)
- [ ] `tests/unit/core/shell/pollingService.test.ts` - Test polling logic and intervals
- [ ] `tests/unit/core/shell/resourceLocker.test.ts` - Test mutual exclusion locks

**Core Validation Utilities** (`src/core/validation/`):

- [ ] `tests/unit/core/validation/securityValidation.test.ts` - Test input sanitization, path validation
- [ ] `tests/unit/core/validation/fieldValidation.test.ts` - Test form field validation rules

**Feature Utilities** (examples, audit will identify more):

- [ ] `tests/unit/features/mesh/utils/errorFormatter.test.ts` - Test error message formatting
- [ ] `tests/unit/features/project-creation/helpers/[helper].test.ts` - Test project setup helpers

**Legacy Utilities** (`src/utils/` - if still used):

- [ ] Audit first to determine if utilities are dead code or still in use
- [ ] Only create tests for utilities actively used (others marked for deletion)

**Total New Test Files**: 15-25 files (exact count depends on audit findings)

### Part B: Test Files to Potentially Remove (After Verification)

**Dead Test Detection Process**:
1. Use grep to find all imports in test files
2. Verify imported paths exist in `src/`
3. Identify orphaned tests (no corresponding implementation)
4. Remove dead tests after manual review

**No files pre-identified** - dead test removal is discovery-based during implementation

---

## Implementation Details (RED-GREEN-REFACTOR)

### Phase 1: Audit Core Utilities (Discovery)

**Purpose**: Identify untested utilities and prioritize for unit test creation

**Process**:

```bash
# 1. List all utilities in core/utils
find src/core/utils -name "*.ts" ! -name "*.test.ts" ! -name "*.d.ts" ! -name "index.ts"

# 2. Check which have tests
for util in $(find src/core/utils -name "*.ts" ! -name "*.test.ts" ! -name "*.d.ts" ! -name "index.ts"); do
  basename=$(basename "$util" .ts)
  test_file="tests/unit/core/utils/${basename}.test.ts"
  if [ ! -f "$test_file" ]; then
    echo "UNTESTED: $util"
  fi
done

# 3. Repeat for core/shell, core/validation, features/*/utils
```

**Prioritization Criteria** (user guidance: "All core utilities"):
1. **Critical utilities** (used in 5+ places): HIGH priority
2. **Complex logic** (>50 lines, multiple branches): HIGH priority
3. **Error-prone** (parsing, async, external dependencies): HIGH priority
4. **Simple helpers** (<20 lines, single purpose): MEDIUM priority
5. **Configuration/constants** (no logic): LOW priority (skip)

**Expected Findings**:
- Core utilities: 10-15 untested files
- Core shell: 5-8 untested files
- Core validation: 2-4 untested files
- Feature utilities: 5-10 untested files (varies by feature)

**Deliverable**: Prioritized list of 20+ utilities needing unit tests

---

### Phase 2: Write Unit Tests (TDD Pattern)

**For each utility identified in audit, follow RED-GREEN-REFACTOR:**

#### RED Phase: Write Failing Tests

**Pattern**:
```typescript
// tests/unit/core/utils/[utility].test.ts
import { functionUnderTest } from '@/core/utils/[utility]';

describe('[utility name]', () => {
  describe('[function name]', () => {
    // Happy path test
    it('returns expected output for valid input', () => {
      // Arrange
      const input = 'valid-input';

      // Act
      const result = functionUnderTest(input);

      // Assert
      expect(result).toBe('expected-output');
    });

    // Edge case test
    it('handles empty input gracefully', () => {
      const result = functionUnderTest('');
      expect(result).toBe('default-value');
    });

    // Error condition test
    it('throws error for invalid input', () => {
      expect(() => functionUnderTest(null)).toThrow('Invalid input');
    });
  });
});
```

**Run tests** - they should FAIL (utility not imported correctly, or implementation has different signature)

#### GREEN Phase: Verify Tests Pass

Since utilities already exist (we're adding tests AFTER implementation - tech debt remediation), tests should pass if written correctly:

1. **Run test**: `npm test tests/unit/core/utils/[utility].test.ts`
2. **If tests fail**: Adjust test expectations to match ACTUAL utility behavior (not desired behavior)
3. **Document discrepancies**: If utility behavior seems wrong, note for future refactoring (out of scope for this step)

**Important**: This step is ADDING COVERAGE, not fixing bugs. Tests should match current implementation behavior.

#### REFACTOR Phase: Improve Test Quality

After tests pass:
1. **Remove duplication**: Extract common test setup to helper functions
2. **Improve assertions**: Use specific matchers (`toBeCloseTo`, `toHaveLength`, etc.)
3. **Add descriptive names**: Ensure test names clearly describe scenario
4. **Group related tests**: Use nested `describe()` blocks for clarity

**Example Refactor**:

```typescript
// BEFORE (duplication, vague names)
describe('promiseUtils', () => {
  it('works with timeout', async () => {
    const p = Promise.resolve('ok');
    const r = await withTimeout(p, 100);
    expect(r).toBe('ok');
  });

  it('works when slow', async () => {
    const p = new Promise(res => setTimeout(() => res('ok'), 200));
    await expect(withTimeout(p, 100)).rejects.toThrow();
  });
});

// AFTER (clear structure, no duplication)
describe('promiseUtils', () => {
  describe('withTimeout', () => {
    const createPromise = (delay: number, value: string) =>
      new Promise(resolve => setTimeout(() => resolve(value), delay));

    describe('when promise completes within timeout', () => {
      it('resolves with promise value', async () => {
        const fastPromise = createPromise(10, 'success');
        const result = await withTimeout(fastPromise, 100);
        expect(result).toBe('success');
      });
    });

    describe('when promise exceeds timeout', () => {
      it('rejects with timeout error', async () => {
        const slowPromise = createPromise(200, 'too-late');
        await expect(withTimeout(slowPromise, 100))
          .rejects.toThrow('Operation timed out after 100ms');
      });
    });
  });
});
```

---

### Phase 3: Identify Dead Tests (Discovery + Cleanup)

**Purpose**: Find and remove test files that test non-existent code

**Strategy 1: Import Path Verification**

```bash
# Extract all imports from test files
grep -r "from '@/" tests/ --include="*.test.ts" | \
  sed "s/.*from '@\(.*\)'.*/\1/" | \
  sort -u > /tmp/test-imports.txt

# Check each import exists in src/
while read import_path; do
  # Convert @/core/utils/foo to src/core/utils/foo.ts
  source_file="src/${import_path}.ts"

  if [ ! -f "$source_file" ]; then
    echo "DEAD IMPORT: $import_path (no source file)"

    # Find which test files import this dead path
    grep -l "from '@/$import_path'" tests/**/*.test.ts
  fi
done < /tmp/test-imports.txt
```

**Strategy 2: Git History Cross-Reference**

```bash
# Find recently deleted source files (last 6 months)
git log --since="6 months ago" --diff-filter=D --summary | \
  grep "delete mode" | \
  grep "src/" | \
  awk '{print $4}' > /tmp/deleted-files.txt

# Check if test files still exist for deleted source files
while read deleted_file; do
  # Convert src/core/utils/foo.ts to tests/unit/core/utils/foo.test.ts
  test_file=$(echo "$deleted_file" | \
    sed 's|^src/|tests/unit/|' | \
    sed 's|\.ts$|.test.ts|')

  if [ -f "$test_file" ]; then
    echo "ORPHANED TEST: $test_file (tests deleted code)"
  fi
done < /tmp/deleted-files.txt
```

**Strategy 3: Manual Code Review**

For each suspicious test file:
1. Open test file
2. Identify what implementation it's testing (from imports)
3. Verify implementation exists in `src/`
4. Check if implementation is actually used (grep for usage across codebase)
5. If dead: Mark for deletion

**Dead Test Criteria**:
- ❌ Imports non-existent path
- ❌ Tests code deleted in refactoring
- ❌ Tests internal helper moved to different location
- ❌ Tests deprecated API no longer in use

**Keep Test Criteria**:
- ✅ Implementation exists and is used
- ✅ Tests legacy code still in use (even if marked for migration)
- ✅ Tests private functions (co-located test file pattern)

---

### Phase 4: Remove Dead Tests (Cleanup)

**Process**:

1. **Review findings** from Phase 3 discovery
2. **Create list** of dead test files with rationale
3. **Manual verification**: Double-check each file before deletion
4. **Delete dead tests**:
   ```bash
   # Example: Remove dead test file
   git rm tests/unit/core/utils/obsolete-helper.test.ts
   ```
5. **Run full test suite**: `npm test` - ensure no regressions
6. **Verify coverage maintained**: Coverage should not drop (dead tests don't count toward useful coverage)

**Document deletions**:
```markdown
## Dead Tests Removed

- tests/unit/core/utils/obsolete-helper.test.ts
  - Reason: Tests `src/core/utils/obsoleteHelper.ts` which was deleted in commit abc1234
  - Verification: grep shows no imports of obsoleteHelper in codebase

- tests/unit/features/old-feature/service.test.ts
  - Reason: Old feature removed during refactoring (commit def5678)
  - Verification: src/features/old-feature/ directory no longer exists
```

---

### Phase 5: Verify Test Pyramid Distribution

**Goal**: Achieve 70% unit / 25% integration / 5% E2E distribution

**Metrics**:

```bash
# Count test files by type
unit_count=$(find tests/unit -name "*.test.ts" | wc -l)
integration_count=$(find tests/integration -name "*.test.ts" | wc -l)
e2e_count=$(find tests/e2e -name "*.test.ts" 2>/dev/null | wc -l)

total=$((unit_count + integration_count + e2e_count))

unit_pct=$((unit_count * 100 / total))
integration_pct=$((integration_count * 100 / total))
e2e_pct=$((e2e_count * 100 / total))

echo "Test Pyramid Distribution:"
echo "  Unit:        $unit_count files ($unit_pct%)"
echo "  Integration: $integration_count files ($integration_pct%)"
echo "  E2E:         $e2e_count files ($e2e_pct%)"

# Target: 70/25/5 - acceptable range: 65-75 / 20-30 / 0-10
```

**If distribution off-target**: Document variance in completion report, no action in this step

---

## Expected Outcome

**After Step 4 completion:**

- ✅ 20+ unit test files created for core utilities
- ✅ All dead/orphaned tests identified and removed
- ✅ Full test suite passes (no regressions introduced)
- ✅ Coverage maintained at ≥85% overall
- ✅ Test pyramid improved (closer to 70/25/5 distribution)
- ✅ Fast feedback loop for utility changes (unit tests run quickly)

**Metrics to track**:
- Unit test files: 4 → 20+ (5x increase)
- Dead tests removed: TBD (discovery-based)
- Test pyramid distribution: Current → Target (70/25/5)
- Test execution time: Should not increase significantly (unit tests are fast)

---

## Acceptance Criteria

- [ ] **Functionality:** 20+ new unit test files created covering critical utilities
- [ ] **Testing:** All new unit tests passing, full suite passes
- [ ] **Coverage:** Overall coverage maintained at ≥85%, no regression
- [ ] **Code Quality:** Tests follow flexible-testing-guide.md patterns (minimal mocking, clear assertions)
- [ ] **Documentation:** Dead tests documented with removal rationale
- [ ] **Security:** No security-sensitive utilities left untested
- [ ] **Performance:** Test execution time not increased >10%
- [ ] **Cleanup:** Zero dead tests remain (all tests map to existing code)

**Step-Specific Criteria:**

- [ ] All core utilities in `src/core/utils/` have unit tests (excluding index.ts, constants)
- [ ] All core shell utilities in `src/core/shell/` have unit tests (excluding types.ts)
- [ ] All core validation utilities in `src/core/validation/` have unit tests
- [ ] Key feature utilities have unit tests (prioritized by usage frequency)
- [ ] Dead test detection process documented (grep commands, findings)
- [ ] Test pyramid distribution calculated and documented
- [ ] No test files import non-existent source paths (verified via grep)

---

## Risk Assessment

### Risk 1: Writing Tests After Implementation (Anti-TDD)

- **Category:** Technical
- **Likelihood:** High (inherent in tech debt remediation)
- **Impact:** Medium
- **Priority:** Medium
- **Description:** Writing tests after implementation risks tests matching bugs rather than requirements. Tests may pass but provide false confidence if implementation is wrong.
- **Mitigation:**
  1. Focus on observable behavior (inputs/outputs) not implementation details
  2. Use existing integration tests as behavioral contracts
  3. Flag suspicious behavior for future investigation (out of scope for this step)
  4. Review test coverage with manual testing of critical paths
- **Contingency:** If bugs discovered during test writing, create separate issues for bug fixes (don't conflate coverage + fixes)

### Risk 2: Deleting "Dead" Tests That Are Actually Useful

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** High
- **Priority:** High
- **Description:** Dead test detection may incorrectly identify useful tests as dead (e.g., tests for refactored code, tests for dynamic imports)
- **Mitigation:**
  1. Manual verification required for ALL dead test candidates
  2. Check git history before deletion (was implementation recently refactored?)
  3. Grep for dynamic imports or runtime loading patterns
  4. When in doubt, KEEP the test (mark as "investigate" instead of deleting)
- **Contingency:** Git history allows recovery of deleted tests if mistake discovered

### Risk 3: Time Overrun (20+ Files to Create)

- **Category:** Schedule
- **Likelihood:** Medium
- **Impact:** Medium
- **Priority:** Medium
- **Description:** Creating 20+ unit test files is time-intensive. Estimate may underestimate complexity of utilities.
- **Mitigation:**
  1. Prioritize critical utilities first (80/20 rule - most important 20% first)
  2. Use simple test patterns (avoid over-engineering tests)
  3. Timebox Phase 2: If exceeding 24 hours, stop at 15 files and document remainder
  4. Parallel work possible if multiple developers available
- **Contingency:** Accept 15 files minimum if time constraint hit (document remaining utilities for future work)

---

## Integration Notes

**Dependencies on Previous Steps:**

- Step 1 (React 19 fixes) provides stable baseline - MUST be complete
- Step 2 (mock reduction) patterns inform unit test mocking strategy
- Step 3 (type safety) ensures proper TypeScript usage in new tests

**Tools Used:**

- **grep**: Find imports, search for usage patterns, detect dead code
- **find**: List utility files, locate test files
- **git log**: Identify deleted source files, review refactoring history
- **Jest**: Run unit tests, collect coverage metrics
- **madge**: Optional - detect circular dependencies in utilities (if issues found)

**SOPs Referenced:**

- `flexible-testing-guide.md`: Assertion patterns for utility tests
- `testing-guide.md`: TDD methodology (adapted for tech debt remediation)
- `architecture-patterns.md`: Understanding utility organization and dependencies

**Communication with Next Steps:**

- Step 5 (documentation): Needs metrics from this step (unit test count, dead tests removed)
- Step 6 (cleanup verification): Needs baseline of "known good" tests after dead test removal

---

## Progress Tracking

**Current Step:** Step 4 of 6

**Previous Step:** Step 3 - Eliminate Type Safety Bypasses & Strengthen Assertions (complete before starting this step)

**Next Step:** Step 5 - Document Improvements & Generate Completion Report

**Overall Plan Status:** 50% complete after this step (Steps 1-4 of 6)

---

## Implementation Checklist

### Phase 1: Audit (Discovery)

- [ ] List all utilities in `src/core/utils/` without tests
- [ ] List all utilities in `src/core/shell/` without tests
- [ ] List all utilities in `src/core/validation/` without tests
- [ ] List all utilities in `src/features/*/utils/` without tests
- [ ] Prioritize 20+ utilities for unit test creation (critical first)
- [ ] Document prioritization rationale

### Phase 2: Write Unit Tests (TDD Pattern)

**Core Utils (5 tests minimum)**:
- [ ] `tests/unit/core/utils/promiseUtils.test.ts` - RED-GREEN-REFACTOR complete
- [ ] `tests/unit/core/utils/envVarExtraction.test.ts` - RED-GREEN-REFACTOR complete
- [ ] `tests/unit/core/utils/timeoutConfig.test.ts` - RED-GREEN-REFACTOR complete
- [ ] `tests/unit/core/utils/webviewHTMLBuilder.test.ts` - RED-GREEN-REFACTOR complete
- [ ] `tests/unit/core/utils/loadingHTML.test.ts` - RED-GREEN-REFACTOR complete

**Core Shell (4 tests minimum)**:
- [ ] `tests/unit/core/shell/rateLimiter.test.ts` - RED-GREEN-REFACTOR complete
- [ ] `tests/unit/core/shell/retryStrategyManager.test.ts` - RED-GREEN-REFACTOR complete
- [ ] `tests/unit/core/shell/pollingService.test.ts` - RED-GREEN-REFACTOR complete
- [ ] `tests/unit/core/shell/resourceLocker.test.ts` - RED-GREEN-REFACTOR complete

**Core Validation (2 tests minimum)**:
- [ ] `tests/unit/core/validation/securityValidation.test.ts` - RED-GREEN-REFACTOR complete
- [ ] `tests/unit/core/validation/fieldValidation.test.ts` - RED-GREEN-REFACTOR complete

**Feature Utils (4+ tests, varies by audit)**:
- [ ] Feature utility 1 - RED-GREEN-REFACTOR complete
- [ ] Feature utility 2 - RED-GREEN-REFACTOR complete
- [ ] Feature utility 3 - RED-GREEN-REFACTOR complete
- [ ] Feature utility 4 - RED-GREEN-REFACTOR complete

**Remaining Prioritized Utils (5+ tests to reach 20 total)**:
- [ ] Additional utility 1 - RED-GREEN-REFACTOR complete
- [ ] Additional utility 2 - RED-GREEN-REFACTOR complete
- [ ] Additional utility 3 - RED-GREEN-REFACTOR complete
- [ ] Additional utility 4 - RED-GREEN-REFACTOR complete
- [ ] Additional utility 5 - RED-GREEN-REFACTOR complete

### Phase 3: Identify Dead Tests

- [ ] Run Strategy 1: Import path verification (grep all test imports)
- [ ] Run Strategy 2: Git history cross-reference (deleted files vs existing tests)
- [ ] Manual review: Verify each dead test candidate
- [ ] Document findings: List of dead tests with removal rationale

### Phase 4: Remove Dead Tests

- [ ] Review dead test list (manual verification complete)
- [ ] Delete dead test files (`git rm` commands)
- [ ] Run full test suite (`npm test`) - verify no regressions
- [ ] Verify coverage maintained (≥85% overall)
- [ ] Commit dead test removal with detailed commit message

### Phase 5: Verify Test Pyramid

- [ ] Count unit test files (before and after)
- [ ] Count integration test files
- [ ] Count E2E test files (if any)
- [ ] Calculate distribution percentages
- [ ] Document distribution vs target (70/25/5)

### Final Verification

- [ ] All 20+ unit test files passing
- [ ] Full test suite passing (zero failures)
- [ ] Coverage ≥85% maintained
- [ ] Test execution time not increased >10%
- [ ] No dead tests remain (verified via grep)
- [ ] Git commit with clear message documenting changes

---

## Notes for TDD Phase Execution

**For TDD Command (`/rptc:tdd`):**

This step follows a HYBRID pattern:
1. **Phases 1 & 3**: Discovery activities (not TDD) - use grep, find, git log
2. **Phase 2**: Writing unit tests - FOLLOW TDD (RED-GREEN-REFACTOR) even though implementation exists
3. **Phase 4**: Cleanup activity (delete dead tests) - verify, then delete
4. **Phase 5**: Metrics calculation - run Jest coverage reports

**Iteration Strategy**:
- Phase 2 can iterate per utility (write 5 tests, verify, repeat)
- If test fails in GREEN phase: Adjust test to match actual implementation behavior
- Do NOT fix bugs in utilities during this step (document for future work)

**Success Criteria for Each Iteration**:
- Tests written (RED if implementation didn't exist, or verify pass if it does)
- Tests passing (GREEN)
- Tests refactored for clarity (REFACTOR)
- Coverage increased by ~4-5% per 5 tests added

---

_Step file created by Master Feature Planner_
_Part of: test-quality-verification-remediation plan_
_Next: step-05.md (Document Improvements & Generate Completion Report)_
