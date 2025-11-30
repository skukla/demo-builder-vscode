# Step 1: Fix all test imports comprehensively with category-by-category verification

## Purpose

Update all test file imports to reflect the authentication and webview refactoring that moved files from `src/utils/auth/*` to `@/features/authentication/services/*` and from `src/webviews/*` to `webview-ui/src/shared/*`. Use a hybrid automated/manual approach to fix 71 failing test suites, with category-by-category verification to catch cascading issues early.

## Prerequisites

- [ ] TypeScript compiler accessible (`tsc --noEmit`)
- [ ] Jest test runner configured and working
- [ ] Git working tree clean (for safe rollback)
- [ ] Path aliases configured in `tsconfig.json` and `jest.config.js`

## Tests to Write First (TDD RED Phase)

**Note**: This is a test migration step - we're fixing existing tests, not writing new ones. The "RED phase" is the current state (71 failing tests). Our goal is GREEN (all 95 passing).

### Current State Verification

- [x] Verify current test status: Run `npm test` and confirm 24/95 passing
- [x] Document baseline: Capture list of currently passing tests (don't break these)
- [x] Identify categories: Group failures by import pattern

### Post-Fix Verification Tests (Run After Each Category)

**Category 1: Webview Hook Tests (~10 files)**
- [x] Run: `npm test -- tests/webviews/hooks/` after hook import fixes
- [x] Verify: Hook import paths updated successfully (12 files fixed)
- [x] Check: No regression in other categories

**Category 2: Webview Component Tests (~12 files)**
- [x] Run: `npm test -- tests/webviews/components/` after component import fixes
- [x] Verify: Component import paths updated successfully (14 files fixed)
- [x] Check: Component mocks working correctly

**Category 3: Authentication Handler Tests (~5 files)**
- [x] Run: `npm test -- tests/features/authentication/` after auth import fixes
- [x] Verify: Auth import paths updated successfully (3 files fixed)
- [x] Check: Type imports from `@/features/authentication/services/types` resolved

**Category 4: Utility Tests with Auth Imports (~15 files)**
- [x] Run: `npm test -- tests/unit/` and `tests/integration/` after utility fixes
- [x] Verify: Webview-UI imports updated successfully (3 files fixed)
- [x] Check: No circular dependency errors introduced

**Category 5: Feature UI Tests (~10 files)**
- [x] Run: Comprehensive import fixes across all remaining test directories
- [x] Verify: 30 additional files with path alias updates
- [x] Check: Cross-module dependencies resolved

**Final Verification**
- [x] Run: `npm test` (full suite) after all categories fixed
- [x] Verify: 36/95 test suites passing (improved from 24/95) - **Import fixes complete**
- [x] Check: No TypeScript compilation errors (`tsc --noEmit`) - **Clean compilation**
- [x] Confirm: 62 test files migrated to new import paths successfully

**Remaining Failures (59 suites)**: Not import-related - API incompatibilities, missing classes, jest-dom setup issues. Requires separate plan to address.

## Files to Create/Modify

### Files to Modify

**Category 1: Webview Hook Tests (~10 files)**
- `tests/webviews/hooks/useVSCodeMessage.test.ts` - Update import from `src/webviews/hooks/*` → `@/webview-ui/shared/hooks/*`
- `tests/webviews/hooks/useVSCodeRequest.test.ts` - Same pattern
- `tests/webviews/hooks/useSelection.test.ts` - Same pattern
- `tests/webviews/hooks/useSearchFilter.test.ts` - Same pattern
- `tests/webviews/hooks/useDebouncedLoading.test.ts` - Same pattern
- `tests/webviews/hooks/useMinimumLoadingTime.test.ts` - Same pattern
- `tests/webviews/hooks/useAutoScroll.test.ts` - Same pattern
- `tests/webviews/hooks/useDebouncedValue.test.ts` - Same pattern
- `tests/webviews/hooks/useFocusTrap.test.ts` - Same pattern
- `tests/webview-ui/shared/hooks/*.test.ts` - Verify using correct paths already

**Category 2: Webview Component Tests (~12 files)**
- `tests/webviews/components/atoms/*.test.tsx` - Update imports from `src/webviews/components/atoms/*` → `@/webview-ui/shared/components/ui/*`
- `tests/webviews/components/molecules/*.test.tsx` - Update imports → `@/webview-ui/shared/components/feedback/*` or `@/webview-ui/shared/components/ui/*`
- `tests/webviews/components/organisms/*.test.tsx` - Update imports → `@/webview-ui/shared/components/ui/*`
- `tests/webview-ui/shared/components/**/*.test.tsx` - Verify using correct paths already

**Category 3: Authentication Handler Tests (~5 files)**
- `tests/features/authentication/handlers/*.test.ts` - Verify imports use `@/features/authentication/handlers/*` and `@/features/authentication/services/*`
- Files importing types from old `src/utils/auth/types` → `@/features/authentication/services/types`

**Category 4: Utility Tests with Auth Imports (~15 files)**
- `tests/unit/utils/*.test.ts` - Update any auth imports to `@/features/authentication/services/*`
- `tests/integration/**/*.test.ts` - Update cross-module imports to new paths
- `tests/core/**/*.test.ts` - Update if using auth or webview imports

**Category 5: Feature UI Tests (~10 files)**
- `tests/features/*/ui/**/*.test.tsx` - Update webview component imports to `@/webview-ui/shared/components/*`
- `tests/features/components/ui/**/*.test.tsx` - Verify path aliases correct

### Files to Create

**None** - pure test file migration work

## Implementation Details

### Phase 1: Webview Hook Test Fixes

**RED Phase** (Current State: Hook tests failing with module resolution errors)

```bash
# Verify failures
npm test -- tests/webviews/hooks/
# Expected: Module not found errors for src/webviews/hooks/*
```

**GREEN Phase** (Fix imports to pass tests)

1. **Automated Fix Script** (for obvious import path changes):

```bash
# Create temporary script: fix-hook-imports.sh
cat > /tmp/fix-hook-imports.sh << 'EOF'
#!/bin/bash
# Replace old hook imports with new path alias
find tests/webviews/hooks -name "*.test.ts" -o -name "*.test.tsx" | while read file; do
  # Pattern: from '../../../src/webviews/hooks/HOOKNAME' → from '@/webview-ui/shared/hooks/HOOKNAME'
  sed -i '' "s|from ['\"]../../../src/webviews/hooks/\([^'\"]*\)['\"]|from '@/webview-ui/shared/hooks/\1'|g" "$file"

  # Pattern: from '../../../../src/webviews/hooks/HOOKNAME' (deeper nesting)
  sed -i '' "s|from ['\"]../../../../src/webviews/hooks/\([^'\"]*\)['\"]|from '@/webview-ui/shared/hooks/\1'|g" "$file"
done
EOF

chmod +x /tmp/fix-hook-imports.sh
/tmp/fix-hook-imports.sh
```

2. **Verify Automated Changes**:
   - Review git diff to ensure changes correct
   - Check for any missed patterns

3. **Run Hook Tests**:
```bash
npm test -- tests/webviews/hooks/
```

4. **Manual Fixes** (if any tests still fail):
   - Examine TypeScript errors
   - Fix type imports if needed (e.g., `@/webview-ui/shared/types/*`)
   - Update mock paths in test setup files

**REFACTOR Phase** (Improve while keeping tests green)

1. Check for duplicate imports or unused imports
2. Ensure consistent import style across hook tests
3. Re-run tests to ensure still passing

**Expected Outcome:**
- All hook tests passing: `npm test -- tests/webviews/hooks/` shows 100% success
- No TypeScript errors: `tsc --noEmit` on test files passes
- Git diff shows clean import path changes only

**Acceptance Criteria:**
- [ ] All tests in `tests/webviews/hooks/` passing
- [ ] No TypeScript compilation errors
- [ ] Git diff reviewed and approved
- [ ] Commit: `git commit -m "fix(tests): update webview hook imports to new paths"`

---

### Phase 2: Webview Component Test Fixes

**RED Phase** (Current State: Component tests failing with module resolution errors)

```bash
# Verify failures
npm test -- tests/webviews/components/
# Expected: Module not found errors for src/webviews/components/*
```

**GREEN Phase** (Fix imports to pass tests)

1. **Map Component Categories** (components reorganized by type):
   - `atoms/*` → `@/webview-ui/shared/components/ui/*` (Spinner, Icon, Badge, StatusDot, Tag, Transition)
   - `molecules/*` → `@/webview-ui/shared/components/feedback/*` or `ui/*` (ErrorDisplay, LoadingOverlay, StatusCard, ConfigSection, FormField, EmptyState)
   - `organisms/*` → `@/webview-ui/shared/components/ui/*` (SearchableList, NavigationPanel)

2. **Automated Fix Script** (with component category mapping):

```bash
# Create script: fix-component-imports.sh
cat > /tmp/fix-component-imports.sh << 'EOF'
#!/bin/bash

# UI components (atoms, organisms)
UI_COMPONENTS=(
  "Spinner" "Icon" "Badge" "StatusDot" "Tag" "Transition"
  "SearchableList" "NavigationPanel"
)

# Feedback components (molecules)
FEEDBACK_COMPONENTS=(
  "ErrorDisplay" "LoadingOverlay" "StatusCard"
)

# Other UI components (molecules that are UI, not feedback)
UI_MOLECULES=(
  "ConfigSection" "FormField" "EmptyState"
)

# Fix UI component imports
for component in "${UI_COMPONENTS[@]}" "${UI_MOLECULES[@]}"; do
  find tests/webviews/components -name "*.test.tsx" | while read file; do
    # Match any depth of ../../../ or ../../../../
    sed -i '' "s|from ['\"][.\/]*src/webviews/components/[^'\"]*/${component}['\"]|from '@/webview-ui/shared/components/ui/${component}'|g" "$file"
  done
done

# Fix feedback component imports
for component in "${FEEDBACK_COMPONENTS[@]}"; do
  find tests/webviews/components -name "*.test.tsx" | while read file; do
    sed -i '' "s|from ['\"][.\/]*src/webviews/components/[^'\"]*/${component}['\"]|from '@/webview-ui/shared/components/feedback/${component}'|g" "$file"
  done
done
EOF

chmod +x /tmp/fix-component-imports.sh
/tmp/fix-component-imports.sh
```

3. **Manual Review Required**:
   - Check component category mapping is correct (UI vs Feedback)
   - Verify named exports still work (e.g., `SearchableList, SearchableListItem`)
   - Update test utility imports if they reference old paths

4. **Run Component Tests**:
```bash
npm test -- tests/webviews/components/
```

5. **Manual Fixes** (if any tests still fail):
   - Check `tests/utils/react-test-utils.tsx` for import paths
   - Update mock component paths
   - Fix type imports from component files

**REFACTOR Phase**

1. Consolidate duplicate test utilities
2. Ensure consistent import ordering
3. Re-run tests to ensure still passing

**Expected Outcome:**
- All component tests passing: `npm test -- tests/webviews/components/` shows 100% success
- React Testing Library rendering works correctly
- Component mocks and fixtures still functional

**Acceptance Criteria:**
- [ ] All tests in `tests/webviews/components/` passing
- [ ] No React rendering errors
- [ ] Git diff reviewed and approved
- [ ] Commit: `git commit -m "fix(tests): update webview component imports to new paths"`

---

### Phase 3: Authentication Handler Test Fixes

**RED Phase** (Current State: Auth tests may have old import paths)

```bash
# Verify current state
npm test -- tests/features/authentication/
# Check for any import errors
```

**GREEN Phase** (Fix any remaining auth import issues)

1. **Check Existing Imports**:
   - Most auth tests already use `@/features/authentication/*` (from file read earlier)
   - Focus on type imports and utility imports

2. **Automated Pattern Check**:

```bash
# Find any remaining old auth imports
grep -r "from.*src/utils/auth" tests/features/authentication --include="*.test.ts" --include="*.test.tsx"

# Find any remaining old type imports
grep -r "from.*src/utils/auth/types" tests --include="*.test.ts" --include="*.test.tsx"
```

3. **Manual Fixes** (likely minimal):
   - Update any `src/utils/auth/*` → `@/features/authentication/services/*`
   - Update any `src/utils/auth/types` → `@/features/authentication/services/types`

4. **Run Auth Tests**:
```bash
npm test -- tests/features/authentication/
```

**REFACTOR Phase**

1. Ensure consistent import style (use path aliases everywhere)
2. Remove any unused imports
3. Re-run tests

**Expected Outcome:**
- All auth handler tests passing
- Type imports resolved correctly
- Mock factories use correct types

**Acceptance Criteria:**
- [ ] All tests in `tests/features/authentication/` passing
- [ ] Type imports resolve without errors
- [ ] Git diff reviewed and approved
- [ ] Commit: `git commit -m "fix(tests): update authentication test imports"`

---

### Phase 4: Utility and Integration Test Fixes

**RED Phase** (Current State: Utility tests importing auth modules may fail)

```bash
# Verify failures
npm test -- tests/unit/
npm test -- tests/integration/
npm test -- tests/core/
# Check for auth or webview import errors
```

**GREEN Phase** (Fix cross-module imports)

1. **Find Cross-Module Import Patterns**:

```bash
# Find tests importing auth from old paths
grep -r "from.*src/utils/auth" tests/unit tests/integration tests/core --include="*.test.ts"

# Find tests importing webview modules
grep -r "from.*src/webviews" tests/unit tests/integration tests/core --include="*.test.ts"
```

2. **Automated Fix Script**:

```bash
cat > /tmp/fix-cross-module-imports.sh << 'EOF'
#!/bin/bash

# Fix auth imports in utility tests
find tests/unit tests/integration tests/core -name "*.test.ts" | while read file; do
  # Auth service imports
  sed -i '' "s|from ['\"][.\/]*src/utils/auth/\([^'\"]*\)['\"]|from '@/features/authentication/services/\1'|g" "$file"

  # Webview imports (if any utility tests use them)
  sed -i '' "s|from ['\"][.\/]*src/webviews/hooks/\([^'\"]*\)['\"]|from '@/webview-ui/shared/hooks/\1'|g" "$file"
done
EOF

chmod +x /tmp/fix-cross-module-imports.sh
/tmp/fix-cross-module-imports.sh
```

3. **Manual Review**:
   - Check for circular dependencies (utility importing from feature)
   - Verify mock paths updated
   - Update test fixtures if they reference old paths

4. **Run Utility Tests**:
```bash
npm test -- tests/unit/
npm test -- tests/integration/
npm test -- tests/core/
```

5. **TypeScript Compilation Check**:
```bash
tsc --noEmit
```

**REFACTOR Phase**

1. Identify any test code duplication introduced by imports
2. Consider extracting shared test utilities
3. Re-run tests

**Expected Outcome:**
- All utility and integration tests passing
- No circular dependency errors
- TypeScript compilation clean

**Acceptance Criteria:**
- [ ] All tests in `tests/unit/`, `tests/integration/`, `tests/core/` passing
- [ ] TypeScript compiler reports no errors
- [ ] Git diff reviewed and approved
- [ ] Commit: `git commit -m "fix(tests): update cross-module test imports"`

---

### Phase 5: Feature UI Test Fixes

**RED Phase** (Current State: Feature UI tests may import webview components)

```bash
# Verify failures
npm test -- tests/features/*/ui/
npm test -- tests/features/components/
# Check for component import errors
```

**GREEN Phase** (Fix feature-specific UI test imports)

1. **Find Feature UI Tests**:

```bash
find tests/features -path "*/ui/*.test.tsx" -o -path "*/components/*.test.tsx"
```

2. **Check Import Patterns**:

```bash
# Look for old webview imports in feature tests
grep -r "from.*src/webviews" tests/features --include="*.test.tsx"
```

3. **Manual Fixes** (feature tests may have unique patterns):
   - Update component imports to `@/webview-ui/shared/components/*`
   - Update hook imports to `@/webview-ui/shared/hooks/*`
   - Verify feature-specific component imports still work

4. **Run Feature UI Tests**:
```bash
npm test -- tests/features/components/
npm test -- "tests/features/.*ui.*"
```

**REFACTOR Phase**

1. Ensure consistent import style across features
2. Remove duplicate test utilities
3. Re-run tests

**Expected Outcome:**
- All feature UI tests passing
- Feature-specific components coexist with shared webview components
- No import conflicts

**Acceptance Criteria:**
- [ ] All feature UI tests passing
- [ ] No component import conflicts
- [ ] Git diff reviewed and approved
- [ ] Commit: `git commit -m "fix(tests): update feature UI test imports"`

---

### Phase 6: Final Verification

**RED Phase** (N/A - all categories should be green now)

**GREEN Phase** (Full test suite verification)

1. **Run Complete Test Suite**:
```bash
npm test
```

2. **Verify Metrics**:
   - Expected: 95/95 test suites passing
   - Expected: Coverage metrics unchanged
   - Expected: 0 TypeScript errors

3. **TypeScript Full Compilation**:
```bash
tsc --noEmit
```

4. **Verify No Regressions**:
   - Check that previously passing 24 tests still pass
   - Confirm no new warnings or deprecations

5. **Review All Changes**:
```bash
git diff --stat
git diff tests/
```

**REFACTOR Phase**

1. **Cleanup**:
   - Remove temporary fix scripts
   - Update any test documentation
   - Ensure git history clean

2. **Final Commit**:
```bash
git add tests/
git commit -m "fix(tests): update all test imports after refactoring

- Update webview hook imports: src/webviews/hooks/* → @/webview-ui/shared/hooks/*
- Update webview component imports: src/webviews/components/* → @/webview-ui/shared/components/*
- Update authentication imports: src/utils/auth/* → @/features/authentication/services/*
- Fix cross-module imports in utility and integration tests
- Fix feature UI test imports

All 95 test suites now passing (was 24/95)

Fixes #<issue-number>"
```

**Expected Outcome:**
- 95/95 test suites passing
- 0 TypeScript compilation errors
- Clean git history with category-by-category commits
- No functionality changes (pure import path updates)

**Acceptance Criteria:**
- [ ] Full test suite passing: `npm test` shows 95/95
- [ ] TypeScript compilation clean: `tsc --noEmit` succeeds
- [ ] Coverage metrics unchanged: Same tests, different paths
- [ ] Git commits organized by category for easy rollback if needed
- [ ] No debug code or temporary files committed

**Estimated Time:** 1-2 hours

---

## Expected Outcome

After completing all phases:

- **Test Status**: 95/95 test suites passing (up from 24/95)
- **TypeScript**: 0 compilation errors
- **Coverage**: No change to coverage metrics (same tests, different paths)
- **Import Patterns**:
  - Webview hooks: All using `@/webview-ui/shared/hooks/*`
  - Webview components: All using `@/webview-ui/shared/components/{ui,feedback}/*`
  - Authentication: All using `@/features/authentication/services/*`
  - Cross-module: Consistent path alias usage
- **Git History**: Clean category-by-category commits for easy troubleshooting

## Acceptance Criteria

- [ ] All 95 test suites passing (`npm test` shows 100% success)
- [ ] No regression in previously working 24 test suites
- [ ] TypeScript compiler reports no errors (`tsc --noEmit`)
- [ ] Coverage metrics unchanged (verify with `npm run coverage`)
- [ ] All imports use path aliases (no relative paths to refactored files)
- [ ] Git history clean with descriptive commit messages per category
- [ ] No temporary files or debug code committed
- [ ] Jest runs without module resolution errors
- [ ] No skipped or disabled tests (all 95 must run)

## Dependencies from Other Steps

**None** - single consolidated step with internal phase checkpoints

## Estimated Time

**1-2 hours** (breakdown):
- Phase 1 (Hooks): 15 minutes
- Phase 2 (Components): 20 minutes
- Phase 3 (Auth): 10 minutes
- Phase 4 (Utils): 20 minutes
- Phase 5 (Feature UI): 15 minutes
- Phase 6 (Final verification): 10 minutes
- Buffer for manual fixes: 10-30 minutes

---

_Step 1 created by Step Generator Sub-Agent_
_Part of plan: fix-test-failures-from-refactoring_
