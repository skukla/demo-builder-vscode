# Step 1: Pre-Migration Audit and Inventory

**Purpose:** Create comprehensive inventory of all webview files, identify exact duplicates, map all dependencies, and establish baseline for migration. This step prevents data loss and provides rollback reference.

**Prerequisites:**

- [ ] Git working directory clean (no uncommitted changes)
- [ ] All tests passing in current state
- [ ] Branch created: `refactor/webview-architecture-restructure`

**Tests to Write First:**

- [ ] Test: Verify current webview functionality baseline
  - **Given:** Extension running with current structure
  - **When:** Open wizard, dashboard, and configure webviews
  - **Then:** All webviews load successfully, no console errors
  - **File:** Manual test (document results in `.rptc/plans/webview-architecture-restructure/baseline-test-results.md`)

- [ ] Test: Verify TypeScript compilation baseline
  - **Given:** Current codebase with all files
  - **When:** Run `npm run compile`
  - **Then:** TypeScript compiles with 0 errors
  - **File:** Manual test (save output to `.rptc/plans/webview-architecture-restructure/baseline-compile-output.txt`)

- [ ] Test: Verify webpack build baseline
  - **Given:** Current webpack configuration
  - **When:** Run `npm run build:webview`
  - **Then:** Webpack builds successfully, all bundles generated
  - **File:** Manual test (save bundle sizes to `.rptc/plans/webview-architecture-restructure/baseline-bundle-sizes.txt`)

**Files to Create/Modify:**

- [ ] `.rptc/plans/webview-architecture-restructure/file-inventory.md` - Complete file listing
- [ ] `.rptc/plans/webview-architecture-restructure/duplicate-analysis.md` - Duplicate file comparison
- [ ] `.rptc/plans/webview-architecture-restructure/dependency-map.md` - Import/export relationships
- [ ] `.rptc/plans/webview-architecture-restructure/baseline-test-results.md` - Manual test results
- [ ] `.rptc/plans/webview-architecture-restructure/baseline-compile-output.txt` - TypeScript compilation output
- [ ] `.rptc/plans/webview-architecture-restructure/baseline-bundle-sizes.txt` - Webpack bundle sizes

**Implementation Details:**

**RED Phase** (Write failing tests)

No automated tests for this step - manual verification only. Document baseline state:

```bash
# 1. Test all webviews manually
# - Open Demo Builder: Create Project
# - Open Demo Builder: Project Dashboard
# - Open Demo Builder: Configure
# - Verify no console errors
# - Document results in baseline-test-results.md

# 2. Capture TypeScript compilation baseline
npm run compile 2>&1 | tee .rptc/plans/webview-architecture-restructure/baseline-compile-output.txt

# 3. Capture webpack build baseline
npm run build:webview 2>&1 | tee .rptc/plans/webview-architecture-restructure/baseline-build-output.txt

# 4. Capture bundle sizes
ls -lh dist/webview/*.js > .rptc/plans/webview-architecture-restructure/baseline-bundle-sizes.txt
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
- [ ] Baseline test results documented (all webviews working)
- [ ] Migration checklist created for subsequent phases
- [ ] No changes to actual codebase (inventory only)

**Estimated Time:** 2-3 hours
