# Step 6: Comprehensive Verification and Manual Testing

**Purpose:** Verify all functionality preserved, test all webviews manually, document final state

**Prerequisites:**

- [x] Step 1: Pre-Flight Verification complete
- [x] Step 2: Directory structure created
- [x] Step 3: Components moved
- [x] Step 4: Old directories deleted
- [x] Step 5: Imports updated
- [x] Git working tree clean (Step 5 committed)

## Tests to Write First

**NO NEW TESTS** - Final verification uses existing tests + manual testing

- [ ] **Test:** Full test suite passes
  - **Given:** All refactoring complete
  - **When:** Run `npm test`
  - **Then:** All 94 tests pass (or matches Step 1 baseline)
  - **File:** Jest test suite

- [ ] **Test:** Build artifacts generated correctly
  - **Given:** All imports updated
  - **When:** Run `npm run build`
  - **Then:** 4 bundles created, sizes reasonable
  - **File:** Webpack build

- [ ] **Test:** Wizard webview loads and functions
  - **Given:** Extension running in development mode
  - **When:** Execute "Demo Builder: Create Project" command
  - **Then:** Wizard opens, all steps work, components render
  - **File:** Manual test

- [ ] **Test:** Dashboard webview loads and functions
  - **Given:** Extension running with demo project
  - **When:** Execute "Demo Builder: Project Dashboard" command
  - **Then:** Dashboard opens, mesh status checks, buttons work
  - **File:** Manual test

- [ ] **Test:** Configure webview loads and functions
  - **Given:** Extension running with demo project
  - **When:** Execute "Demo Builder: Configure" command
  - **Then:** Configure screen opens, components editable
  - **File:** Manual test

- [ ] **Test:** Welcome webview loads and functions
  - **Given:** Extension activated in fresh workspace
  - **When:** Welcome screen auto-opens
  - **Then:** Welcome screen renders, buttons work
  - **File:** Manual test

## Files to Create/Modify

- [ ] `.rptc/plans/frontend-architecture-cleanup/final-verification-report.md` - Verification results
- [ ] `.rptc/plans/frontend-architecture-cleanup/manual-test-results.md` - Manual test outcomes
- [ ] `.rptc/plans/frontend-architecture-cleanup/bundle-size-comparison.txt` - Before/after bundle sizes

## Implementation Details

### Phase 1: Automated Test Verification

#### 1.1 Run Full Test Suite

```bash
# Run all tests
npm test 2>&1 | tee .rptc/plans/frontend-architecture-cleanup/final-test-output.txt

# Extract summary
tail -20 .rptc/plans/frontend-architecture-cleanup/final-test-output.txt

# Compare to baseline
echo "=== Test Comparison ==="
echo "Baseline (Step 1):"
tail -5 .rptc/plans/frontend-architecture-cleanup/baseline-test-output.txt
echo ""
echo "Final (Step 6):"
tail -5 .rptc/plans/frontend-architecture-cleanup/final-test-output.txt
```

**Expected:** Same pass/fail count as baseline, or all passing if baseline had failures.

#### 1.2 Test Coverage Report

```bash
# Generate coverage report
npm run test:coverage 2>&1 | tee .rptc/plans/frontend-architecture-cleanup/final-coverage-report.txt

# Review coverage
echo "=== Coverage Summary ==="
grep -A 10 "Coverage summary" .rptc/plans/frontend-architecture-cleanup/final-coverage-report.txt
```

**Expected:** Coverage >= 80% overall, critical paths 100%.

### Phase 2: Build Verification

#### 2.1 Clean Build

```bash
# Clean dist directory
rm -rf dist/

# Full build
npm run build 2>&1 | tee .rptc/plans/frontend-architecture-cleanup/final-build-output.txt

# Verify bundles created
ls -lh dist/webview/
```

**Expected:** 4 bundles (wizard, welcome, dashboard, configure), no errors.

#### 2.2 Bundle Size Analysis

```bash
# Compare bundle sizes
echo "=== Bundle Size Comparison ===" > .rptc/plans/frontend-architecture-cleanup/bundle-size-comparison.txt
echo "" >> .rptc/plans/frontend-architecture-cleanup/bundle-size-comparison.txt

echo "Baseline (Step 1):" >> .rptc/plans/frontend-architecture-cleanup/bundle-size-comparison.txt
grep -A 5 "wizard-bundle.js" .rptc/plans/frontend-architecture-cleanup/baseline-webpack-build.txt >> .rptc/plans/frontend-architecture-cleanup/bundle-size-comparison.txt
echo "" >> .rptc/plans/frontend-architecture-cleanup/bundle-size-comparison.txt

echo "Final (Step 6):" >> .rptc/plans/frontend-architecture-cleanup/bundle-size-comparison.txt
ls -lh dist/webview/*.js >> .rptc/plans/frontend-architecture-cleanup/bundle-size-comparison.txt

# Display comparison
cat .rptc/plans/frontend-architecture-cleanup/bundle-size-comparison.txt
```

**Expected:** Bundle sizes similar or slightly smaller (fewer source files).

#### 2.3 TypeScript Compilation Final Check

```bash
# Run TypeScript compiler
npm run compile:typescript 2>&1 | tee .rptc/plans/frontend-architecture-cleanup/final-typescript-output.txt

# Count errors
errors=$(grep "error TS" .rptc/plans/frontend-architecture-cleanup/final-typescript-output.txt | wc -l | tr -d ' ')

echo "=== TypeScript Error Comparison ==="
echo "Baseline: 14 errors (expected)"
echo "Final: $errors errors"

if [ "$errors" -eq 14 ]; then
  echo "✓ TypeScript errors match baseline"
elif [ "$errors" -lt 14 ]; then
  echo "✓ TypeScript errors reduced (improvement!)"
else
  echo "⚠️  TypeScript errors increased - review needed"
fi
```

**Expected:** 14 errors (baseline) or fewer.

### Phase 3: Manual Webview Testing

#### 3.1 Start Extension in Development Mode

```bash
# Open VS Code
# Press F5 to start extension in debug mode
# Extension Development Host window should open
```

#### 3.2 Test Wizard Webview

**Manual Test Checklist:**

```markdown
### Wizard Webview Test

- [ ] **Open Wizard**
  - Command: "Demo Builder: Create Project"
  - Expected: Wizard opens in new tab
  - Result: [ ] PASS / [ ] FAIL
  - Notes: _______________

- [ ] **Welcome Step**
  - Verify: Numbered instructions render
  - Verify: Continue button works
  - Result: [ ] PASS / [ ] FAIL
  - Notes: _______________

- [ ] **Prerequisites Step**
  - Verify: LoadingDisplay shows during checks
  - Verify: StatusCard components render
  - Verify: Prerequisites list displays
  - Result: [ ] PASS / [ ] FAIL
  - Notes: _______________

- [ ] **Adobe Setup Step**
  - Verify: TwoColumnLayout renders
  - Verify: FormField components work
  - Verify: Modal opens for authentication
  - Result: [ ] PASS / [ ] FAIL
  - Notes: _______________

- [ ] **Component Selection Step**
  - Verify: ComponentCard components render
  - Verify: Selection state works
  - Verify: FormField for component config
  - Result: [ ] PASS / [ ] FAIL
  - Notes: _______________

- [ ] **Mesh Step**
  - Verify: StatusCard renders
  - Verify: LoadingDisplay during deployment
  - Verify: FadeTransition animations work
  - Result: [ ] PASS / [ ] FAIL
  - Notes: _______________

- [ ] **Overall UX**
  - Verify: No console errors
  - Verify: Smooth transitions between steps
  - Verify: All styles applied correctly
  - Result: [ ] PASS / [ ] FAIL
  - Notes: _______________
```

#### 3.3 Test Dashboard Webview

**Manual Test Checklist:**

```markdown
### Dashboard Webview Test

- [ ] **Open Dashboard**
  - Command: "Demo Builder: Project Dashboard"
  - Expected: Dashboard opens
  - Result: [ ] PASS / [ ] FAIL
  - Notes: _______________

- [ ] **Mesh Status Display**
  - Verify: StatusCard shows mesh status
  - Verify: LoadingDisplay during status check
  - Result: [ ] PASS / [ ] FAIL
  - Notes: _______________

- [ ] **Action Buttons**
  - Verify: Start/Stop buttons render
  - Verify: Logs toggle button works
  - Verify: Configure button navigates
  - Result: [ ] PASS / [ ] FAIL
  - Notes: _______________

- [ ] **Component Browser**
  - Verify: GridLayout renders components
  - Verify: Component cards display
  - Result: [ ] PASS / [ ] FAIL
  - Notes: _______________

- [ ] **Overall UX**
  - Verify: No console errors
  - Verify: All styles applied correctly
  - Result: [ ] PASS / [ ] FAIL
  - Notes: _______________
```

#### 3.4 Test Configure Webview

**Manual Test Checklist:**

```markdown
### Configure Webview Test

- [ ] **Open Configure**
  - Command: "Demo Builder: Configure"
  - Expected: Configure screen opens
  - Result: [ ] PASS / [ ] FAIL
  - Notes: _______________

- [ ] **Component Configuration**
  - Verify: FormField components render
  - Verify: ConfigSection components display
  - Verify: Save button works
  - Result: [ ] PASS / [ ] FAIL
  - Notes: _______________

- [ ] **Validation**
  - Verify: ErrorDisplay shows for invalid input
  - Verify: LoadingOverlay during save
  - Result: [ ] PASS / [ ] FAIL
  - Notes: _______________

- [ ] **Overall UX**
  - Verify: No console errors
  - Verify: All styles applied correctly
  - Result: [ ] PASS / [ ] FAIL
  - Notes: _______________
```

#### 3.5 Test Welcome Webview

**Manual Test Checklist:**

```markdown
### Welcome Webview Test

- [ ] **Auto-Open Welcome**
  - Trigger: Open VS Code in workspace without demo
  - Expected: Welcome screen auto-opens
  - Result: [ ] PASS / [ ] FAIL
  - Notes: _______________

- [ ] **Welcome Content**
  - Verify: Tip component renders
  - Verify: NumberedInstructions display
  - Verify: Buttons render correctly
  - Result: [ ] PASS / [ ] FAIL
  - Notes: _______________

- [ ] **Navigation**
  - Verify: "Create Project" button opens wizard
  - Verify: Welcome screen disposes correctly
  - Result: [ ] PASS / [ ] FAIL
  - Notes: _______________

- [ ] **Overall UX**
  - Verify: No console errors
  - Verify: All styles applied correctly
  - Result: [ ] PASS / [ ] FAIL
  - Notes: _______________
```

#### 3.6 Browser Console Verification

For each webview test:

```markdown
### Console Error Check

**Wizard:**
- Console errors: [ ] 0 / [ ] >0 (describe: _______)
- CSP violations: [ ] 0 / [ ] >0 (describe: _______)

**Dashboard:**
- Console errors: [ ] 0 / [ ] >0 (describe: _______)
- CSP violations: [ ] 0 / [ ] >0 (describe: _______)

**Configure:**
- Console errors: [ ] 0 / [ ] >0 (describe: _______)
- CSP violations: [ ] 0 / [ ] >0 (describe: _______)

**Welcome:**
- Console errors: [ ] 0 / [ ] >0 (describe: _______)
- CSP violations: [ ] 0 / [ ] >0 (describe: _______)
```

### Phase 4: Documentation and Verification Report

#### 4.1 Create Final Verification Report

Create `.rptc/plans/frontend-architecture-cleanup/final-verification-report.md`:

```markdown
# Final Verification Report

## Frontend Architecture Cleanup

**Date:** [YYYY-MM-DD]
**Plan:** .rptc/plans/frontend-architecture-cleanup/

---

## Objectives Achieved

- [x] **Duplication Eliminated:** src/core/ui/ deleted (2,285 lines removed)
- [x] **Atomic Design Removed:** atoms/, molecules/, organisms/, templates/ deleted
- [x] **Function-Based Structure:** ui/, forms/, feedback/, navigation/, layout/ created
- [x] **Imports Updated:** All @/core/ui imports migrated to @/webview-ui/shared
- [x] **Dead Code Removed:** ui/main/ entry points deleted (4 files)
- [x] **Tests Preserved:** All 94 tests migrated and passing

---

## Automated Test Results

**Test Suite:**
- Tests passing: [X] / 94
- Tests failing: [Y] / 94
- Coverage: [Z]%

**Comparison to Baseline:**
- Baseline: [baseline pass/fail]
- Final: [final pass/fail]
- Change: [improved/regressed/same]

---

## Build Verification

**TypeScript Compilation:**
- Baseline errors: 14
- Final errors: [X]
- Change: [improved/same/regressed]

**Webpack Build:**
- wizard-bundle.js: [size] ([+/-]% vs baseline)
- welcome-bundle.js: [size] ([+/-]% vs baseline)
- dashboard-bundle.js: [size] ([+/-]% vs baseline)
- configure-bundle.js: [size] ([+/-]% vs baseline)

---

## Manual Test Results

**Wizard Webview:** [ ] PASS / [ ] FAIL
- Issues found: [none / list issues]

**Dashboard Webview:** [ ] PASS / [ ] FAIL
- Issues found: [none / list issues]

**Configure Webview:** [ ] PASS / [ ] FAIL
- Issues found: [none / list issues]

**Welcome Webview:** [ ] PASS / [ ] FAIL
- Issues found: [none / list issues]

---

## Architecture Review

**Before Refactoring:**
- src/core/ui/: 2,285 lines (duplicates)
- Atomic design: atoms/, molecules/, organisms/, templates/
- Import pattern: @/core/ui/*
- File count: 30 files to delete

**After Refactoring:**
- src/core/ui/: [deleted]
- Function-based: ui/, forms/, feedback/, navigation/, layout/
- Import pattern: @/webview-ui/shared/*
- File count: 30 files deleted, 27 components reorganized

**Benefits:**
- Code duplication: ELIMINATED (2,285 lines)
- Architecture clarity: IMPROVED (clear extension host vs webview boundary)
- Component organization: IMPROVED (function-based vs size-based)
- Import paths: SIMPLIFIED (single source of truth)
- Maintainability: IMPROVED (no duplicate updates needed)

---

## Issues Found

### Critical Issues
[None / List critical issues that block completion]

### Non-Critical Issues
[None / List minor issues that can be addressed later]

---

## Final Checklist

- [ ] All automated tests pass (or match baseline)
- [ ] All 4 webviews load successfully
- [ ] No console errors in any webview
- [ ] TypeScript compilation clean (14 baseline errors only)
- [ ] Webpack build succeeds (4 bundles)
- [ ] No @/core/ui imports remain
- [ ] src/core/ui/ directory deleted
- [ ] Atomic design directories deleted
- [ ] Dead code removed (ui/main/)
- [ ] Git history preserved for moved files
- [ ] All acceptance criteria met

---

## Recommendation

**Ready for Completion:** [ ] YES / [ ] NO

**If NO, required actions:**
[List required fixes before marking complete]

---

## Sign-Off

**Verified by:** [Your name]
**Date:** [YYYY-MM-DD]
**Status:** [COMPLETE / ISSUES FOUND]
```

#### 4.2 Document Manual Test Results

Save manual test checklist results to:
`.rptc/plans/frontend-architecture-cleanup/manual-test-results.md`

### Phase 5: Final Commit and Cleanup

#### 5.1 Stage Verification Documents

```bash
# Add verification documents
git add .rptc/plans/frontend-architecture-cleanup/final-verification-report.md
git add .rptc/plans/frontend-architecture-cleanup/manual-test-results.md
git add .rptc/plans/frontend-architecture-cleanup/bundle-size-comparison.txt
git add .rptc/plans/frontend-architecture-cleanup/final-test-output.txt
git add .rptc/plans/frontend-architecture-cleanup/final-build-output.txt
git add .rptc/plans/frontend-architecture-cleanup/final-typescript-output.txt
```

#### 5.2 Create Final Commit

```bash
git commit -m "docs: add final verification report for frontend architecture cleanup

- All 94 automated tests passing
- All 4 webviews manually tested and verified
- TypeScript compilation: 14 errors (baseline)
- Webpack build: 4 bundles generated successfully
- Bundle sizes: [summary of changes]

Verification complete:
- src/core/ui/ eliminated (2,285 lines)
- Atomic design removed
- Function-based structure established
- All imports updated
- Dead code removed

Part of frontend-architecture-cleanup plan
Refs: .rptc/plans/frontend-architecture-cleanup/"
```

#### 5.3 Create Summary Statistics

```bash
# Generate git statistics
echo "=== Frontend Architecture Cleanup Summary ===" > .rptc/plans/frontend-architecture-cleanup/summary-stats.txt
echo "" >> .rptc/plans/frontend-architecture-cleanup/summary-stats.txt

echo "Commits created:" >> .rptc/plans/frontend-architecture-cleanup/summary-stats.txt
git log --oneline --grep="frontend-architecture-cleanup" >> .rptc/plans/frontend-architecture-cleanup/summary-stats.txt
echo "" >> .rptc/plans/frontend-architecture-cleanup/summary-stats.txt

echo "Files changed:" >> .rptc/plans/frontend-architecture-cleanup/summary-stats.txt
git diff --stat origin/master..HEAD >> .rptc/plans/frontend-architecture-cleanup/summary-stats.txt
echo "" >> .rptc/plans/frontend-architecture-cleanup/summary-stats.txt

echo "Line changes:" >> .rptc/plans/frontend-architecture-cleanup/summary-stats.txt
git diff --shortstat origin/master..HEAD >> .rptc/plans/frontend-architecture-cleanup/summary-stats.txt

# Display summary
cat .rptc/plans/frontend-architecture-cleanup/summary-stats.txt
```

## Expected Outcome

- [ ] All automated tests pass (94 tests)
- [ ] All 4 webviews manually tested and verified
- [ ] TypeScript compilation clean (14 baseline errors)
- [ ] Webpack build successful (4 bundles)
- [ ] No console errors in any webview
- [ ] Final verification report created
- [ ] Manual test results documented
- [ ] Bundle size comparison documented
- [ ] Summary statistics generated
- [ ] Final commit created

## Acceptance Criteria

- [ ] All automated tests passing
- [ ] All manual tests passing
- [ ] No regressions identified
- [ ] All acceptance criteria from overview.md met
- [ ] Verification report shows "COMPLETE" status
- [ ] Git history clean and documented
- [ ] Ready for efficiency review (next step)

**Estimated Time:** 2 hours

---

## Rollback Strategy

**If critical issues found:**

```bash
# If issues found after Step 5 (imports updated), must rollback entire refactor
git log --oneline | head -10  # Find commit before refactor started
git reset --hard [commit-hash]

# Verify baseline restored
ls src/core/ui
# Expected: components/, hooks/, styles/, etc. (original structure)

find webview-ui/src/shared/components -type d
# Expected: atoms/, molecules/, organisms/, templates/ (original structure)
```

**Cost:** High (all work lost, ~8 hours to redo)

**Alternative:** Document issues, create fix plan, implement fixes, re-verify.

---

## Success Criteria

**This step is COMPLETE when:**

1. All automated tests pass (or match baseline)
2. All 4 webviews load and function correctly
3. No console errors in any webview
4. TypeScript compilation clean (no new errors)
5. Webpack build succeeds
6. Final verification report shows "COMPLETE"
7. All acceptance criteria from overview.md checked off

**After Step 6 completion:**
- Proceed to Efficiency Review (if enabled)
- Then mark plan as COMPLETE
- Consider creating PR with `/rptc:commit pr`
