# Step 1: Pre-Flight Verification and Baseline Capture

**Purpose:** Establish verified baseline, capture current state for rollback, verify all assumptions before destructive operations

**Prerequisites:**

- [ ] Git working tree clean (no uncommitted changes)
- [ ] All tests currently passing (or baseline failures documented)
- [ ] Branch created for this work

## Tests to Write First

**NO NEW TESTS** - This step is verification only

- [x] **Verification:** Run existing test suite to establish baseline
  - **Given:** Current codebase with atomic design structure
  - **When:** Execute `npm test`
  - **Then:** Document pass/fail status (baseline for comparison)
  - **File:** Manual test, save output to `.rptc/plans/frontend-architecture-cleanup/baseline-test-output.txt`

- [ ] **Verification:** TypeScript compilation baseline
  - **Given:** Current codebase structure
  - **When:** Execute `npm run compile:typescript`
  - **Then:** Document error count (14 pre-existing errors expected)
  - **File:** Manual test, save output to `.rptc/plans/frontend-architecture-cleanup/baseline-typescript-errors.txt`

- [ ] **Verification:** Webpack build baseline
  - **Given:** Current webpack configuration
  - **When:** Execute `npm run build`
  - **Then:** Confirm 4 bundles generated successfully
  - **File:** Manual test, save output to `.rptc/plans/frontend-architecture-cleanup/baseline-webpack-build.txt`

## Files to Create/Modify

- [ ] `.rptc/plans/frontend-architecture-cleanup/baseline-test-output.txt` - Test baseline
- [ ] `.rptc/plans/frontend-architecture-cleanup/baseline-typescript-errors.txt` - TypeScript baseline
- [ ] `.rptc/plans/frontend-architecture-cleanup/baseline-webpack-build.txt` - Webpack baseline
- [ ] `.rptc/plans/frontend-architecture-cleanup/verification-checklist.md` - Assumption verification

## Implementation Details

### 1. Git Branch Creation

```bash
# Create feature branch
git checkout -b refactor/eliminate-frontend-duplicates

# Verify clean working tree
git status
```

### 2. Capture Test Baseline

```bash
# Run test suite, save output
npm test 2>&1 | tee .rptc/plans/frontend-architecture-cleanup/baseline-test-output.txt

# Count passing/failing tests
grep -E "(PASS|FAIL)" .rptc/plans/frontend-architecture-cleanup/baseline-test-output.txt | wc -l
```

### 3. Capture TypeScript Baseline

```bash
# Run TypeScript compilation, save output
npm run compile:typescript 2>&1 | tee .rptc/plans/frontend-architecture-cleanup/baseline-typescript-errors.txt

# Count errors
grep "error TS" .rptc/plans/frontend-architecture-cleanup/baseline-typescript-errors.txt | wc -l
```

### 4. Capture Webpack Baseline

```bash
# Run webpack build, save output
npm run build 2>&1 | tee .rptc/plans/frontend-architecture-cleanup/baseline-webpack-build.txt

# Verify bundles created
ls -lh dist/webview/*.js
```

### 5. Verify Assumptions

Create verification checklist document:

```markdown
# Assumption Verification Checklist

## Assumption 1: src/core/ui/ Contains Only Duplicates

**Verification Method:**
- Compare file hashes between src/core/ui/components/ and webview-ui/src/shared/components/
- Check for unique logic in src/core/ui/ files

**Commands:**
```bash
# Compare FormField.tsx
diff src/core/ui/components/FormField.tsx webview-ui/src/shared/components/FormField.tsx

# Compare LoadingDisplay.tsx
diff src/core/ui/components/LoadingDisplay.tsx webview-ui/src/shared/components/LoadingDisplay.tsx

# Check all files in src/core/ui/
find src/core/ui -type f -name "*.ts" -o -name "*.tsx"
```

**Result:** [ ] VERIFIED / [ ] ISSUES FOUND

## Assumption 2: No Production Code Imports from ui/main/ Entry Points

**Verification Method:**
- Grep for imports referencing ui/main/ files
- Check webpack.config.js for entry point references

**Commands:**
```bash
# Search for imports from ui/main/
grep -r "from.*ui/main" src/ --include="*.ts" --include="*.tsx"

# Check webpack config
grep -A 10 "entry:" webpack.config.js
```

**Result:** [ ] VERIFIED / [ ] ISSUES FOUND

## Assumption 3: Atomic Design Directories Safe to Flatten

**Verification Method:**
- List all files in atomic design directories
- Verify no external imports expect atomic structure

**Commands:**
```bash
# List atomic design files
find webview-ui/src/shared/components/atoms -type f
find webview-ui/src/shared/components/molecules -type f
find webview-ui/src/shared/components/organisms -type f
find webview-ui/src/shared/components/templates -type f

# Check for imports expecting atomic paths
grep -r "from.*atoms\|molecules\|organisms\|templates" src/ tests/
```

**Result:** [ ] VERIFIED / [ ] ISSUES FOUND

## Assumption 4: @/core/ui Path Alias Can Be Removed

**Verification Method:**
- Count all imports using @/core/ui
- Verify no dynamic imports or require() statements

**Commands:**
```bash
# Count imports from @/core/ui
grep -r "from ['\"]@/core/ui" src/ tests/ | wc -l

# Check for dynamic imports
grep -r "import(.*@/core/ui" src/ tests/
grep -r "require(.*@/core/ui" src/ tests/
```

**Result:** [ ] VERIFIED / [ ] ISSUES FOUND

## Assumption 5: Barrel Files Can Preserve Public API

**Verification Method:**
- Review current barrel file exports
- Verify all exports have destination in new structure

**Commands:**
```bash
# Review barrel exports
cat webview-ui/src/shared/components/index.ts
cat webview-ui/src/shared/components/atoms/index.ts
cat webview-ui/src/shared/components/molecules/index.ts
```

**Result:** [ ] VERIFIED / [ ] ISSUES FOUND
```

### 6. Document Current Import Patterns

```bash
# Count import patterns
grep -r "from '@/core/ui" src/ tests/ | cut -d: -f2 | sort | uniq > .rptc/plans/frontend-architecture-cleanup/import-patterns-baseline.txt

# Count files with @/core/ui imports
grep -r "from '@/core/ui" src/ tests/ --include="*.ts" --include="*.tsx" | cut -d: -f1 | sort | uniq | wc -l
```

## Expected Outcome

- [x] Baseline test output captured (pass/fail status documented)
- [x] Baseline TypeScript errors captured (14 errors expected)
- [x] Baseline webpack build captured (4 bundles confirmed)
- [x] All 5 assumptions verified or issues documented
- [x] Import pattern baseline captured
- [x] Git branch created
- [x] No files modified (verification only)

## Acceptance Criteria

- [x] All baseline files created in `.rptc/plans/frontend-architecture-cleanup/`
- [x] Assumption verification checklist complete (all VERIFIED or issues documented)
- [x] Git status shows clean working tree
- [x] Test, TypeScript, and webpack baselines match expected state
- [x] If any assumptions FAILED verification, STOP and reassess plan

## Step 1 Completion Summary

**Status:** ✅ COMPLETE

**Git Branch:** refactor/eliminate-frontend-duplicates (created from clean working tree)

**Verification Results:**
- All 5 assumptions VERIFIED (5/5 passed)
- 22 duplicate files identified in src/core/ui/
- 121 import statements need updating (88 atomic + 33 @/core/ui)
- 14 pre-existing TypeScript errors documented (out of scope)

**Files Created:**
- assumption-verification.md (8.3K) - Comprehensive assumption verification
- baseline-test-output.txt (4.4K) - Test suite baseline
- baseline-typescript-errors.txt (4.1K) - TypeScript error baseline
- baseline-webpack-build.txt (4.5K) - Webpack build baseline
- import-patterns-baseline.txt (4.9K) - Import pattern analysis
- step-01-completion-summary.md (3.7K) - Completion summary

**Ready for:** Step 1.5 - Usage Analysis and Dead Code Identification

**Estimated Time:** 1 hour

---

## Rollback Strategy

**If issues found during verification:**

1. Document specific assumption failures in verification checklist
2. Do NOT proceed to Step 2
3. Request plan update via `/rptc:helper-update-plan`
4. Reassess approach based on actual codebase state

**No rollback needed** - This step is read-only verification.
