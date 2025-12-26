# Step 1: Clean core/ and unit/ Test Files

**Purpose:** Remove version references from 6 test files in core/ and unit/ directories. These files have minimal version references and serve as quick wins to establish the cleanup pattern.

**Prerequisites:**
- [ ] Repository is on clean branch
- [ ] All tests currently pass (`npm test`)

---

## Files to Clean (6 files)

1. `tests/core/shell/commandExecutor-adobe-cli.test.ts`
2. `tests/core/shell/commandExecutor.security.test.ts`
3. `tests/core/shell/environmentSetup-nodeVersion.test.ts`
4. `tests/core/validation/normalizers.test.ts`
5. `tests/core/validation/securityValidation-nodeVersion.test.ts`
6. `tests/unit/prerequisites/parallelExecution.test.ts`

---

## Tests to Write First

**Note:** This is a refactoring task. No new tests needed. Validation is:

- [ ] Test: All modified files compile without errors
  - **Given:** Files have been refactored
  - **When:** Running `npm run compile`
  - **Then:** No TypeScript compilation errors

- [ ] Test: All existing tests still pass
  - **Given:** Files have been refactored
  - **When:** Running `npm test`
  - **Then:** All tests pass with same results as before

---

## Implementation Details

### File 1: `tests/core/shell/commandExecutor-adobe-cli.test.ts`

**Analysis:** Based on grep results, this file has NO v2/v3 version references. The Node version references like "Node 20", "Node 24" are runtime versions and should NOT be changed.

**Action:**
- [ ] Verify no version schema references exist
- [ ] Skip if clean (likely already clean)

---

### File 2: `tests/core/shell/commandExecutor.security.test.ts`

**Action:**
- [ ] Search for v2/v3 patterns
- [ ] Clean any found patterns per overview guidelines
- [ ] Skip if clean

---

### File 3: `tests/core/shell/environmentSetup-nodeVersion.test.ts`

**Action:**
- [ ] Search for v2/v3 patterns
- [ ] Clean any found patterns per overview guidelines
- [ ] Skip if clean

---

### File 4: `tests/core/validation/normalizers.test.ts`

**CRITICAL EXCLUSION:** This file contains `test.project.v2` as test data for repository name validation. This is NOT a version reference and must NOT be changed.

**Action:**
- [ ] Search for v2/v3 patterns
- [ ] SKIP `test.project.v2` - it's test data
- [ ] Clean any other found patterns per overview guidelines

---

### File 5: `tests/core/validation/securityValidation-nodeVersion.test.ts`

**Action:**
- [ ] Search for v2/v3 patterns
- [ ] Clean any found patterns per overview guidelines
- [ ] Skip if clean

---

### File 6: `tests/unit/prerequisites/parallelExecution.test.ts`

**Analysis:** Based on review, this file contains Node version references like "Node 18", "Node 20", "Node 24" which are runtime versions, NOT schema versions. These should NOT be changed.

**Action:**
- [ ] Verify no version schema references exist
- [ ] Skip if clean (likely already clean)

---

## Verification Checklist

After completing all files:

- [ ] Run `npm run compile` - no errors
- [ ] Run `npm test -- --testPathPattern="tests/core"` - all tests pass
- [ ] Run `npm test -- --testPathPattern="tests/unit"` - all tests pass
- [ ] Grep verification:
  ```bash
  grep -r "v3\.0\|v2\.0" tests/core/ tests/unit/ --include="*.ts" | grep -v node_modules | grep -v "test.project.v2"
  ```
  Should return empty or only legitimate version strings in JSON data.

---

## Expected Outcome

- [ ] 6 files reviewed
- [ ] Version schema references removed (if any existed)
- [ ] Test data like `test.project.v2` preserved
- [ ] All tests still pass
- [ ] Ready for Step 2

**Estimated Time:** 30 minutes

---

## Acceptance Criteria

- [ ] All 6 files reviewed
- [ ] No TypeScript compilation errors
- [ ] All existing tests pass
- [ ] No accidental changes to test data
- [ ] Git diff shows only comment/naming changes (if any)
