# Step 1: Pre-Migration Audit and Inventory

**Purpose:** Create comprehensive inventory of all webview files, identify exact duplicates, map all dependencies, and establish baseline for migration. This step prevents data loss and provides rollback reference.

**Prerequisites:**

- [ ] Git working directory clean (no uncommitted changes)
- [ ] All tests passing in current state
- [ ] Branch created: `refactor/webview-architecture-restructure`

**Tests to Write First:**

**Note:** This step captures baseline state, not traditional RED-GREEN tests. We document the CURRENT state before making changes.

- [ ] Test: Document current compilation errors (expected: 5 errors)
  - **Given:** Current codebase with commented code
  - **When:** Run `npm run compile:typescript`
  - **Then:** 5 TypeScript errors documented (WebviewCommunicationManager.onStreaming, BaseWebviewCommand.getActivePanel)
  - **File:** Save to `.rptc/plans/webview-architecture-restructure/baseline-compile-output.txt`
  - **Purpose:** Baseline for tracking error resolution

- [ ] Test: Verify webpack build baseline (should succeed despite TS errors in excluded files)
  - **Given:** Current webpack configuration with build exclusions
  - **When:** Run `npm run build:webview`
  - **Then:** Webpack builds successfully, all bundles generated
  - **File:** Save bundle sizes to `.rptc/plans/webview-architecture-restructure/baseline-bundle-sizes.txt`

- [ ] Test: Document test status (expected: tests blocked by compilation errors)
  - **Given:** 94 existing test files
  - **When:** Attempt `npm test`
  - **Then:** Tests blocked by 5 compilation errors (expected state)
  - **File:** Document in `.rptc/plans/webview-architecture-restructure/baseline-test-status.md`
  - **Purpose:** Track when tests become runnable during restructure

- [ ] Test: Verify manual webview functionality baseline
  - **Given:** Extension running with current structure
  - **When:** Open wizard, dashboard, and configure webviews manually
  - **Then:** All webviews load successfully, no runtime errors (despite compilation errors)
  - **File:** Manual test (document results in `.rptc/plans/webview-architecture-restructure/baseline-manual-test-results.md`)
  - **Purpose:** Confirm functionality preserved despite TypeScript errors

**Files to Create/Modify:**

- [ ] `.rptc/plans/webview-architecture-restructure/file-inventory.md` - Complete file listing
- [ ] `.rptc/plans/webview-architecture-restructure/duplicate-analysis.md` - Duplicate file comparison
- [ ] `.rptc/plans/webview-architecture-restructure/dependency-map.md` - Import/export relationships
- [ ] `.rptc/plans/webview-architecture-restructure/baseline-test-results.md` - Manual test results
- [ ] `.rptc/plans/webview-architecture-restructure/baseline-compile-output.txt` - TypeScript compilation output
- [ ] `.rptc/plans/webview-architecture-restructure/baseline-bundle-sizes.txt` - Webpack bundle sizes

**Implementation Details:**

**RED Phase** (Document baseline state)

**IMPORTANT:** This is a pre-migration audit step. We're not writing new failing tests, but documenting the CURRENT state (including known failures) as baseline for comparison.

```bash
# 1. Document current compilation errors (expected: 5 errors)
npm run compile:typescript 2>&1 | tee .rptc/plans/webview-architecture-restructure/baseline-compile-output.txt
echo "Expected: 5 errors related to WebviewCommunicationManager.onStreaming and BaseWebviewCommand.getActivePanel"

# 2. Capture webpack build baseline (should succeed)
npm run build:webview 2>&1 | tee .rptc/plans/webview-architecture-restructure/baseline-build-output.txt

# 3. Capture bundle sizes
ls -lh dist/webview/*.js > .rptc/plans/webview-architecture-restructure/baseline-bundle-sizes.txt

# 4. Document test status (expected: blocked by compilation errors)
cat > .rptc/plans/webview-architecture-restructure/baseline-test-status.md <<'EOF'
# Baseline Test Status

**Date:** $(date)
**Total Test Files:** 94

## Current Status
Tests CANNOT run due to 5 TypeScript compilation errors:
- src/features/dashboard/commands/showDashboard.ts(91,18): Property 'onStreaming' does not exist
- src/features/welcome/commands/showWelcome.ts(15,42): Property 'getActivePanel' does not exist
- src/features/welcome/commands/showWelcome.ts(49,14): Property 'onStreaming' does not exist
- src/features/welcome/commands/showWelcome.ts(56,14): Property 'onStreaming' does not exist
- src/features/welcome/commands/showWelcome.ts(61,14): Property 'onStreaming' does not exist

## Test Inventory
- Webview component tests: tests/core/ui/components/*.test.tsx
- Hook tests: tests/core/ui/hooks/*.test.ts (9 files)
- Integration tests: tests/integration/
- Unit tests: tests/unit/

## Expected Outcome After Restructure
All 94 tests should pass with 0 failures once compilation errors are fixed.
EOF

# 5. Manual webview verification (document results)
cat > .rptc/plans/webview-architecture-restructure/baseline-manual-test-results.md <<'EOF'
# Manual Webview Baseline Test Results

**Date:** $(date)

## Test 1: Wizard Webview
- Command: Demo Builder: Create Project
- Result: [TO BE TESTED - Press F5 and verify]
- Console Errors: [TO BE DOCUMENTED]

## Test 2: Dashboard Webview
- Command: Demo Builder: Project Dashboard
- Result: [TO BE TESTED]
- Console Errors: [TO BE DOCUMENTED]

## Test 3: Configure Webview
- Command: Demo Builder: Configure
- Result: [TO BE TESTED]
- Console Errors: [TO BE DOCUMENTED]

**Note:** Webviews may work at runtime despite TypeScript compilation errors because problematic code is excluded from webview bundles.
EOF
```

**GREEN Phase** (Minimal implementation)

1. **Create File Inventory**

```bash
# Inventory all webview files
find src/webviews -type f \( -name "*.tsx" -o -name "*.ts" -o -name "*.css" \) > .rptc/plans/webview-architecture-restructure/webviews-files.txt

# Inventory all core UI files
find src/core/ui -type f \( -name "*.tsx" -o -name "*.ts" -o -name "*.css" \) > .rptc/plans/webview-architecture-restructure/core-ui-files.txt

# Inventory all feature UI files
find src/features -type d -name "ui" -exec find {} -type f \( -name "*.tsx" -o -name "*.ts" \) \; > .rptc/plans/webview-architecture-restructure/feature-ui-files.txt

# Count files
wc -l .rptc/plans/webview-architecture-restructure/*.txt
```

2. **Identify Duplicates**

Create `.rptc/plans/webview-architecture-restructure/duplicate-analysis.md`:

```markdown
# Duplicate File Analysis

## Confirmed Duplicates (Based on Grep Analysis)

### Modal.tsx
- **Location 1:** `src/core/ui/components/Modal.tsx` (1467 bytes)
- **Location 2:** `src/webviews/components/shared/Modal.tsx` (1295 bytes)
- **Difference:** core/ui version has size mapping logic (fullscreen → L)
- **Decision:** Keep `src/core/ui/components/Modal.tsx` (more robust)

### FadeTransition.tsx
- **Location 1:** `src/core/ui/components/FadeTransition.tsx` (1321 bytes)
- **Location 2:** `src/webviews/components/shared/FadeTransition.tsx` (1329 bytes)
- **Difference:** Different unmounting logic (if/else vs early return)
- **Decision:** Keep `src/core/ui/components/FadeTransition.tsx` (cleaner logic)

### LoadingDisplay.tsx
- **Location 1:** `src/core/ui/components/LoadingDisplay.tsx` (4641 bytes)
- **Location 2:** `src/webviews/components/shared/LoadingDisplay.tsx` (4422 bytes)
- **Difference:** Minor styling differences
- **Decision:** Keep `src/core/ui/components/LoadingDisplay.tsx` (more features)

### FormField.tsx
- **Location 1:** `src/core/ui/components/FormField.tsx` (4904 bytes)
- **Location 2:** `src/webviews/components/molecules/FormField.tsx` (unknown size)
- **Decision:** Compare files, keep more complete version

### NumberedInstructions.tsx
- **Location 1:** `src/core/ui/components/NumberedInstructions.tsx` (3180 bytes)
- **Location 2:** `src/webviews/components/shared/NumberedInstructions.tsx` (3180 bytes)
- **Difference:** Identical file size (need diff)
- **Decision:** Diff files, keep one

### StatusCard.tsx
- **Location 1:** `src/core/ui/components/StatusCard.tsx` (2699 bytes)
- **Location 2:** `src/webviews/components/molecules/StatusCard.tsx` (unknown size)
- **Decision:** Compare files, keep more complete version

## Unique Files (No Duplicates)

### src/core/ui/components/ Only
- TwoColumnLayout.tsx
- GridLayout.tsx

### src/webviews/components/ Only
- atoms/ (Badge, Icon, Spinner, StatusDot, Tag, Transition)
- molecules/ (ConfigSection, ErrorDisplay, EmptyState, LoadingOverlay)
- organisms/ (NavigationPanel, SearchableList)
- shared/ (ComponentCard, ConfigurationSummary, DependencyItem, SelectionSummary, Tip, CompactOption)
- feedback/ (TerminalOutput)
- steps/ (All wizard steps)
- wizard/ (WizardContainer, TimelineNav)
```

3. **Map Dependencies**

```bash
# Find all imports from @/core/ui
grep -r "from ['\"]\@\/core\/ui" src/ --include="*.ts" --include="*.tsx" > .rptc/plans/webview-architecture-restructure/core-ui-imports.txt

# Find all imports from @/webviews
grep -r "from ['\"]\@\/webviews" src/ --include="*.ts" --include="*.tsx" > .rptc/plans/webview-architecture-restructure/webviews-imports.txt

# Find all imports in feature UI directories
grep -r "from ['\"]" src/features/*/ui/ --include="*.ts" --include="*.tsx" > .rptc/plans/webview-architecture-restructure/feature-ui-imports.txt
```

Create `.rptc/plans/webview-architecture-restructure/dependency-map.md`:

```markdown
# Dependency Map

## Files Importing from @/core/ui (29 files)

[List from grep results - already identified]

## Files Importing from @/webviews

[List from grep results]

## Feature UI Import Patterns

[Analyze feature UI imports to understand integration points]

## Circular Dependencies

[Check for any circular import patterns]

## External Dependencies

### React Imports
- All webview files import React
- No changes needed

### Adobe Spectrum Imports
- All webview files import Spectrum components
- No changes needed

### VS Code API Imports
- vscodeApi.ts provides VS Code API wrapper
- Used by all webviews for messaging
```

4. **Identify Consolidation Strategy**

Create `.rptc/plans/webview-architecture-restructure/consolidation-strategy.md`:

```markdown
# Consolidation Strategy

## Duplicates to Merge

1. **Modal.tsx:** Use `src/core/ui/components/Modal.tsx` → Delete `src/webviews/components/shared/Modal.tsx`
2. **FadeTransition.tsx:** Use `src/core/ui/components/FadeTransition.tsx` → Delete `src/webviews/components/shared/FadeTransition.tsx`
3. **LoadingDisplay.tsx:** Use `src/core/ui/components/LoadingDisplay.tsx` → Delete `src/webviews/components/shared/LoadingDisplay.tsx`
4. **FormField.tsx:** Compare both, keep better version
5. **NumberedInstructions.tsx:** Diff both, keep one
6. **StatusCard.tsx:** Compare both, keep better version

## Files to Move to webview-ui/src/shared/

### From src/core/ui/components/
- [x] Modal.tsx
- [x] FadeTransition.tsx
- [x] LoadingDisplay.tsx
- [ ] FormField.tsx (after comparison)
- [ ] NumberedInstructions.tsx (after comparison)
- [ ] StatusCard.tsx (after comparison)
- [x] TwoColumnLayout.tsx
- [x] GridLayout.tsx

### From src/core/ui/hooks/
- All hooks (useAsyncData, useVSCodeMessage, useVSCodeRequest, useSelectableDefault, useAutoScroll, useLoadingState, useFocusTrap, useSelection, useSearchFilter)

### From src/core/ui/utils/
- classNames.ts

### From src/webviews/components/
- atoms/ (all)
- molecules/ (all except duplicates)
- organisms/ (all)
- shared/ (all unique files)
- feedback/ (all)

### From src/webviews/
- contexts/ (all)
- hooks/ (all)
- styles/ (all)
- utils/ (all)
- types/ (all)

## Files to Move to webview-ui/src/wizard/

- components/wizard/ (WizardContainer, TimelineNav)
- components/steps/ (all wizard steps)
- index.tsx (entry point)
- app/App.tsx (wizard app wrapper)

## Files to Move to webview-ui/src/dashboard/

- project-dashboard.tsx
- project-dashboard/ directory

## Files to Move to webview-ui/src/configure/

- configure.tsx
- configure/ directory

## Files to Keep in src/features/*/ui/

- All feature UI directories stay in place
- Update imports to use @/webview-ui/shared/* instead of @/core/ui/*
```

**REFACTOR Phase** (Improve quality)

1. **Review and Validate Inventory**

- Cross-check file counts with actual directory structure
- Verify no files missed in inventory
- Document any unexpected findings

2. **Create Migration Checklist**

Create `.rptc/plans/webview-architecture-restructure/migration-checklist.md`:

```markdown
# Migration Checklist

## Phase 2: Directory Creation
- [ ] Create webview-ui/ directory structure
- [ ] Create shared/types/ directory structure

## Phase 3: Duplicate Consolidation
- [ ] Compare and merge Modal.tsx
- [ ] Compare and merge FadeTransition.tsx
- [ ] Compare and merge LoadingDisplay.tsx
- [ ] Compare and merge FormField.tsx
- [ ] Compare and merge NumberedInstructions.tsx
- [ ] Compare and merge StatusCard.tsx

## Phase 4: File Migration (Shared)
- [ ] Move shared components
- [ ] Move shared hooks
- [ ] Move shared contexts
- [ ] Move shared styles
- [ ] Move shared utils
- [ ] Move shared types

## Phase 5: File Migration (Features)
- [ ] Move wizard files
- [ ] Move dashboard files
- [ ] Move configure files

## Phase 6: Import Path Updates
- [ ] Update extension host imports
- [ ] Update feature UI imports
- [ ] Update test imports
- [ ] Update webview-ui internal imports

## Phase 7: Configuration Updates
- [ ] Update webpack.config.js
- [ ] Update tsconfig.json
- [ ] Create tsconfig files for project references
- [ ] Update package.json scripts

## Phase 8: Verification
- [ ] TypeScript compilation passes
- [ ] Webpack build passes
- [ ] All webviews load successfully
- [ ] All tests pass

## Phase 9: Cleanup
- [ ] Remove src/webviews/ directory
- [ ] Remove src/core/ui/ directory
- [ ] Update CLAUDE.md files
- [ ] Update documentation
```

**Expected Outcome:**

- Complete inventory of all webview files (100+ files documented)
- Duplicate analysis completed with merge strategy
- Dependency map created showing import relationships
- Baseline test results documented for rollback reference
- Migration checklist created for subsequent phases

**Acceptance Criteria:**

- [ ] All webview files inventoried in `.rptc/plans/webview-architecture-restructure/file-inventory.md`
- [ ] Duplicate files identified with merge decisions in `duplicate-analysis.md`
- [ ] Dependency map created showing all import relationships
- [ ] **Baseline compilation errors documented:** 5 errors in `baseline-compile-output.txt`
- [ ] **Baseline test status documented:** 94 test files blocked by compilation errors in `baseline-test-status.md`
- [ ] **Baseline webpack build documented:** Bundle sizes in `baseline-bundle-sizes.txt`
- [ ] **Baseline manual tests documented:** Webview functionality verified in `baseline-manual-test-results.md`
- [ ] Migration checklist created for subsequent phases
- [ ] No changes to actual codebase (inventory only)

**Estimated Time:** 2-3 hours
