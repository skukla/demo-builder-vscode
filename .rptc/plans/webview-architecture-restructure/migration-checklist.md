# Migration Checklist

**Generated:** $(date '+%Y-%m-%d %H:%M:%S')

This checklist tracks the complete webview architecture restructure across all implementation steps.

## Phase 1: Pre-Migration Audit (Step 1) ✅

- [x] Capture baseline compilation errors (5 errors documented)
- [x] Capture baseline test status (94 tests blocked)
- [x] Capture baseline webpack build (1 error documented)
- [x] Capture baseline bundle sizes (no bundles - build failed)
- [x] Create manual test template
- [x] Inventory webview files (80 files)
- [x] Inventory core UI files (25 files)
- [x] Inventory feature UI files (38 files)
- [x] Map @/core/ui imports (89 imports)
- [x] Map @/webviews imports (0 imports - confirms duplicates unused)
- [x] Map feature UI imports (220 imports)
- [x] Create duplicate analysis document
- [x] Create dependency map document
- [x] Create consolidation strategy document
- [x] Create migration checklist (this file)

## Phase 2: Duplicate Analysis (Step 2)

- [ ] Compare FormField.tsx implementations
  - [ ] Read src/core/ui/components/FormField.tsx
  - [ ] Read src/webviews/components/molecules/FormField.tsx
  - [ ] Identify differences
  - [ ] Decide which to keep
  - [ ] Document decision in duplicate-analysis.md

- [ ] Compare NumberedInstructions.tsx implementations
  - [ ] Read src/core/ui/components/NumberedInstructions.tsx
  - [ ] Read src/webviews/components/shared/NumberedInstructions.tsx
  - [ ] Diff files (likely identical - same size)
  - [ ] Decide which to keep
  - [ ] Document decision in duplicate-analysis.md

- [ ] Compare StatusCard.tsx implementations
  - [ ] Read src/core/ui/components/StatusCard.tsx
  - [ ] Read src/webviews/components/molecules/StatusCard.tsx
  - [ ] Identify differences
  - [ ] Decide which to keep
  - [ ] Document decision in duplicate-analysis.md

## Phase 3: Directory Creation and Consolidation (Step 3)

### Create Directory Structure

- [ ] Create webview-ui/ root directory
- [ ] Create webview-ui/src/
- [ ] Create webview-ui/src/shared/
- [ ] Create webview-ui/src/shared/components/
- [ ] Create webview-ui/src/shared/hooks/
- [ ] Create webview-ui/src/shared/contexts/
- [ ] Create webview-ui/src/shared/styles/
- [ ] Create webview-ui/src/shared/utils/
- [ ] Create webview-ui/src/shared/types/
- [ ] Create webview-ui/src/wizard/
- [ ] Create webview-ui/src/wizard/components/
- [ ] Create webview-ui/src/wizard/steps/
- [ ] Create webview-ui/src/dashboard/
- [ ] Create webview-ui/src/dashboard/components/
- [ ] Create webview-ui/src/configure/
- [ ] Create webview-ui/src/configure/components/
- [ ] Create webview-ui/public/

### Delete Confirmed Duplicates

- [ ] Delete src/webviews/components/shared/Modal.tsx
- [ ] Delete src/webviews/components/shared/FadeTransition.tsx
- [ ] Delete src/webviews/components/shared/LoadingDisplay.tsx
- [ ] Delete duplicate of FormField.tsx (after Step 2 comparison)
- [ ] Delete duplicate of NumberedInstructions.tsx (after Step 2 comparison)
- [ ] Delete duplicate of StatusCard.tsx (after Step 2 comparison)

### Move Shared Components

- [ ] Move src/core/ui/components/Modal.tsx → webview-ui/src/shared/components/
- [ ] Move src/core/ui/components/FadeTransition.tsx → webview-ui/src/shared/components/
- [ ] Move src/core/ui/components/LoadingDisplay.tsx → webview-ui/src/shared/components/
- [ ] Move FormField.tsx (chosen version) → webview-ui/src/shared/components/
- [ ] Move NumberedInstructions.tsx (chosen version) → webview-ui/src/shared/components/
- [ ] Move StatusCard.tsx (chosen version) → webview-ui/src/shared/components/
- [ ] Move src/core/ui/components/GridLayout.tsx → webview-ui/src/shared/components/
- [ ] Move src/core/ui/components/TwoColumnLayout.tsx → webview-ui/src/shared/components/
- [ ] Create webview-ui/src/shared/components/index.ts (barrel export)

### Move Shared Hooks

- [ ] Move src/core/ui/hooks/useVSCodeMessage.ts → webview-ui/src/shared/hooks/
- [ ] Move src/core/ui/hooks/useVSCodeRequest.ts → webview-ui/src/shared/hooks/
- [ ] Move src/core/ui/hooks/useLoadingState.ts → webview-ui/src/shared/hooks/
- [ ] Move src/core/ui/hooks/useSelection.ts → webview-ui/src/shared/hooks/
- [ ] Move src/core/ui/hooks/useAsyncData.ts → webview-ui/src/shared/hooks/
- [ ] Move src/core/ui/hooks/useAutoScroll.ts → webview-ui/src/shared/hooks/
- [ ] Move src/core/ui/hooks/useSearchFilter.ts → webview-ui/src/shared/hooks/
- [ ] Move src/core/ui/hooks/useFocusTrap.ts → webview-ui/src/shared/hooks/
- [ ] Move src/core/ui/hooks/useSelectableDefault.ts → webview-ui/src/shared/hooks/
- [ ] Move src/core/ui/hooks/useDebouncedValue.ts → webview-ui/src/shared/hooks/ (if exists)
- [ ] Create webview-ui/src/shared/hooks/index.ts (barrel export)

### Move Shared Utils

- [ ] Move src/core/ui/vscode-api.ts → webview-ui/src/shared/utils/
- [ ] Move src/core/ui/utils/classNames.ts → webview-ui/src/shared/utils/
- [ ] Create webview-ui/src/shared/utils/index.ts (barrel export)

### Move Shared Types

- [ ] Move src/core/ui/types/index.ts → webview-ui/src/shared/types/
- [ ] Create webview-ui/src/shared/types/index.ts (barrel export)

### Move Shared Contexts

- [ ] Check if src/core/ui/contexts/ exists
- [ ] Move any contexts to webview-ui/src/shared/contexts/
- [ ] Create webview-ui/src/shared/contexts/index.ts (barrel export)

### Move Shared Styles

- [ ] Check if src/core/ui/styles/ exists
- [ ] Move any shared styles to webview-ui/src/shared/styles/

## Phase 4: Feature Webview Migration (Step 4)

### Wizard Files

- [ ] Move src/webviews/index.tsx → webview-ui/src/wizard/App.tsx
- [ ] Move src/webviews/index.html → webview-ui/public/index.html
- [ ] Move wizard components from src/webviews/components/wizard/* → webview-ui/src/wizard/components/
- [ ] Move wizard steps from src/webviews/components/steps/* → webview-ui/src/wizard/steps/

### Dashboard Files

- [ ] Move src/features/dashboard/ui/ProjectDashboardScreen.tsx → webview-ui/src/dashboard/
- [ ] Move src/features/dashboard/ui/main/project-dashboard.tsx → webview-ui/src/dashboard/App.tsx
- [ ] Move dashboard components → webview-ui/src/dashboard/components/

### Configure Files

- [ ] Move src/features/dashboard/ui/ConfigureScreen.tsx → webview-ui/src/configure/
- [ ] Move src/features/dashboard/ui/main/configure.tsx → webview-ui/src/configure/App.tsx
- [ ] Move configure components → webview-ui/src/configure/components/

## Phase 5: Import Path Updates (Step 5)

### Update Extension Host Imports

- [ ] Update src/features/dashboard/commands/showDashboard.ts
  - [ ] Fix onStreaming error (uncomment or restore code)
  - [ ] Update imports if needed

- [ ] Update src/features/welcome/commands/showWelcome.ts
  - [ ] Fix getActivePanel error (uncomment or restore code)
  - [ ] Fix onStreaming errors (uncomment or restore code)
  - [ ] Update imports if needed

### Update Feature UI Imports

- [ ] Update all files in src/features/authentication/ui/
  - [ ] Replace @/core/ui/* with @/webview-ui/shared/*

- [ ] Update all files in src/features/components/ui/
  - [ ] Replace @/core/ui/* with @/webview-ui/shared/*

- [ ] Update all files in src/features/dashboard/ui/
  - [ ] Replace @/core/ui/* with @/webview-ui/shared/*

- [ ] Update all files in src/features/mesh/ui/
  - [ ] Replace @/core/ui/* with @/webview-ui/shared/*

- [ ] Update all files in src/features/prerequisites/ui/
  - [ ] Replace @/core/ui/* with @/webview-ui/shared/*

- [ ] Update all files in src/features/project-creation/ui/
  - [ ] Replace @/core/ui/* with @/webview-ui/shared/*

### Update Webview Internal Imports

- [ ] Update webview-ui/src/wizard/App.tsx imports
- [ ] Update webview-ui/src/wizard/components/* imports
- [ ] Update webview-ui/src/wizard/steps/* imports
- [ ] Update webview-ui/src/dashboard/App.tsx imports
- [ ] Update webview-ui/src/dashboard/components/* imports
- [ ] Update webview-ui/src/configure/App.tsx imports
- [ ] Update webview-ui/src/configure/components/* imports

### Update Test File Imports

- [ ] Update tests/core/ui/components/*.test.tsx (move to tests/webview-ui/shared/components/)
- [ ] Update tests/core/ui/hooks/*.test.ts (move to tests/webview-ui/shared/hooks/)
- [ ] Update other test files importing from @/core/ui

### Restore Commented Code

- [ ] Uncomment src/core/ui/vscode-api.ts export (if commented)
- [ ] Uncomment ResetAllCommand imports and dispose calls
- [ ] Uncomment handler registrations (validate handler - 2 files)
- [ ] Uncomment UI validation exports
- [ ] Verify all restored code compiles

## Phase 6: Configuration Updates (Step 6)

### TypeScript Configuration

- [ ] Update tsconfig.json
  - [ ] Add @/webview-ui/* path alias
  - [ ] Keep @/core/ui/* for extension host (if still used)

- [ ] Create tsconfig.webview.json
  - [ ] Configure for webview code (jsx: react, lib: DOM)
  - [ ] Set include path to webview-ui/src

- [ ] Update tsconfig.build.json
  - [ ] Remove src/webviews/**/* from exclude
  - [ ] Remove src/core/ui/**/* from exclude
  - [ ] Add webview-ui/**/* to exclude (compiled by webpack)

### Webpack Configuration

- [ ] Update webpack.config.js
  - [ ] Change entry points to webview-ui/src/*/App.tsx
  - [ ] Update output path
  - [ ] Add @/webview-ui path alias
  - [ ] Update html-webpack-plugin template path

### Package.json Scripts

- [ ] Update compile:webview script if needed
- [ ] Update watch:webview script if needed
- [ ] Verify all scripts still work

## Phase 7: Verification (All Steps)

### TypeScript Compilation

- [ ] Run: npm run compile:typescript
- [ ] Verify: 0 errors (down from 5)
- [ ] Document: Save output to verification-compile-output.txt

### Webpack Build

- [ ] Run: npm run compile:webview
- [ ] Verify: Build succeeds (no errors)
- [ ] Verify: Bundles created in dist/webview/
- [ ] Document: Save output to verification-build-output.txt

### Automated Tests

- [ ] Run: npm test (or test command)
- [ ] Verify: All 94 tests pass
- [ ] Document: Save output to verification-test-output.txt

### Manual Webview Tests

- [ ] Test: Wizard webview (Demo Builder: Create Project)
  - [ ] Press F5 to launch extension
  - [ ] Run command
  - [ ] Verify no console errors
  - [ ] Verify UI loads correctly
  - [ ] Document: Update baseline-manual-test-results.md

- [ ] Test: Dashboard webview (Demo Builder: Project Dashboard)
  - [ ] Run command
  - [ ] Verify no console errors
  - [ ] Verify UI loads correctly
  - [ ] Document: Update baseline-manual-test-results.md

- [ ] Test: Configure webview (Demo Builder: Configure)
  - [ ] Run command
  - [ ] Verify no console errors
  - [ ] Verify UI loads correctly
  - [ ] Document: Update baseline-manual-test-results.md

### Bundle Size Comparison

- [ ] Capture new bundle sizes
- [ ] Compare with baseline-bundle-sizes.txt
- [ ] Verify bundles not significantly larger (±10%)

## Phase 8: Cleanup (Final Step)

### Delete Old Directories

- [ ] Delete src/webviews/ directory (after verification passes)
- [ ] Delete src/core/ui/ directory (after verification passes)

### Update Documentation

- [ ] Update CLAUDE.md (root)
  - [ ] Update architecture diagram
  - [ ] Update directory structure
  - [ ] Add webview-ui/ section

- [ ] Update src/CLAUDE.md
  - [ ] Remove src/webviews reference
  - [ ] Remove src/core/ui reference
  - [ ] Add webview-ui reference

- [ ] Create webview-ui/CLAUDE.md
  - [ ] Document new structure
  - [ ] Document import patterns
  - [ ] Document component organization

- [ ] Update src/features/CLAUDE.md
  - [ ] Update import patterns
  - [ ] Update path aliases

- [ ] Update docs/architecture/*.md files
  - [ ] Update any references to old structure

### Git Commit

- [ ] Stage all changes: git add .
- [ ] Create commit with descriptive message
- [ ] Push to branch

## Success Criteria ✅

All must pass:

- [ ] ✅ TypeScript compilation: 0 errors (down from 5)
- [ ] ✅ Automated tests: 94/94 passing (currently blocked)
- [ ] ✅ Webpack build: Success with bundles created
- [ ] ✅ Wizard webview: Loads without errors
- [ ] ✅ Dashboard webview: Loads without errors
- [ ] ✅ Configure webview: Loads without errors
- [ ] ✅ No console errors in any webview
- [ ] ✅ Bundle sizes within ±10% of baseline
- [ ] ✅ All imports resolve correctly

## Rollback Plan

If any verification fails:

1. [ ] Document the failure
2. [ ] Git checkout to revert changes: `git checkout .`
3. [ ] Analyze the issue
4. [ ] Adjust strategy
5. [ ] Re-attempt migration

---

**Total Phases:** 8
**Total Tasks:** ~150
**Current Phase:** Phase 1 Complete ✅
**Next Phase:** Phase 2 - Duplicate Analysis
