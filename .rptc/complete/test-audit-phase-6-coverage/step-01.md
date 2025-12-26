# Step 1: Generate and Analyze Coverage Report

## Purpose

Generate a comprehensive test coverage report and categorize gaps by risk priority. This step establishes the baseline and identifies which files need coverage improvements.

## Prerequisites

- [ ] All existing tests pass (`npm test`)
- [ ] Jest coverage configuration verified
- [ ] Previous audit phases complete (1-5)

---

## Tasks

### 1.1 Generate Full Coverage Report

- [ ] Run coverage command and capture output:
  ```bash
  npm run test:coverage 2>&1 | tee coverage-report.txt
  ```

- [ ] Open HTML report for detailed analysis:
  ```bash
  open coverage/lcov-report/index.html
  ```

- [ ] Document overall coverage metrics:
  - Statements: ___%
  - Branches: ___%
  - Functions: ___%
  - Lines: ___%

### 1.2 Identify Files Below 80% Threshold

- [ ] Extract files with <80% coverage from report
- [ ] Sort by coverage percentage (lowest first)
- [ ] Create prioritized list by module:

**Expected Categories:**

| Module | File | Statements | Branches | Functions | Lines |
|--------|------|------------|----------|-----------|-------|
| core/validation | | | | | |
| core/state | | | | | |
| core/shell | | | | | |
| features/auth | | | | | |
| features/mesh | | | | | |
| features/prereq | | | | | |

### 1.3 Categorize Gaps by Risk Priority

**Critical (Security):**
- [ ] List all validation-related files with <100% coverage
- [ ] List all authentication-related files with <100% coverage
- [ ] List files handling user input or external data

**High (Data Integrity):**
- [ ] List all state management files with <90% coverage
- [ ] List all file operation files with <90% coverage
- [ ] List all API/command handler files with <90% coverage

**Medium (User-Facing):**
- [ ] List UI step handlers with <80% coverage
- [ ] List error formatters with <80% coverage
- [ ] List progress/feedback utilities with <80% coverage

**Low (Internal):**
- [ ] List helper functions with <80% coverage
- [ ] List logging utilities with <80% coverage
- [ ] List internal transformers with <80% coverage

### 1.4 Analyze Uncovered Code Paths

For each critical/high-priority file, identify:

- [ ] Uncovered branches (if/else paths not tested)
- [ ] Uncovered error handling (catch blocks, error conditions)
- [ ] Uncovered edge cases (null checks, boundary conditions)
- [ ] Uncovered async paths (promise rejections, timeouts)

### 1.5 Create Coverage Gap Documentation

- [ ] Create `.rptc/research/coverage-gaps-analysis.md` with:
  - Overall coverage summary
  - Categorized list of gaps
  - Specific uncovered code paths
  - Recommended test cases for each gap

---

## Analysis Template

### Coverage Summary

```markdown
## Overall Coverage

| Metric | Current | Target | Gap |
|--------|---------|--------|-----|
| Statements | __% | 80% | __% |
| Branches | __% | 80% | __% |
| Functions | __% | 80% | __% |
| Lines | __% | 80% | __% |

## Files Below Threshold

### Critical Priority (Security)
1. `src/core/validation/Validator.ts` - __%
   - Uncovered: [specific lines/branches]
   - Risk: Input validation bypass

### High Priority (Data Integrity)
1. `src/core/state/stateManager.ts` - __%
   - Uncovered: [specific lines/branches]
   - Risk: State corruption

### Medium Priority (User-Facing)
1. `src/features/mesh/utils/errorFormatter.ts` - __%
   - Uncovered: [specific lines/branches]
   - Risk: Poor error feedback

### Low Priority (Internal)
1. `src/core/utils/timeFormatting.ts` - __%
   - Uncovered: [specific lines/branches]
   - Risk: Minor display issues
```

---

## Expected Outcome

After completing this step:
- Comprehensive coverage report available in `coverage/lcov-report/`
- All files below 80% threshold identified and categorized
- Specific uncovered code paths documented
- Priority order established for Steps 2-4

---

## Acceptance Criteria

- [ ] Full coverage report generated successfully
- [ ] HTML report accessible and reviewed
- [ ] Files below threshold extracted and categorized
- [ ] Coverage gaps documented with specific line numbers
- [ ] Priority order established for subsequent steps
- [ ] Analysis saved to `.rptc/research/coverage-gaps-analysis.md`

---

## Time Estimate

**Estimated:** 1-2 hours

- Coverage generation: 10-15 minutes
- Report analysis: 30-45 minutes
- Gap categorization: 30-45 minutes
- Documentation: 15-30 minutes

---

## Notes

- Coverage report may vary based on test execution order
- Some files may show 0% if they have no corresponding tests
- Focus on branch coverage - line coverage can be misleading
- Document any files that are intentionally excluded from coverage
