# Implementation Plan: Frontend Architecture Cleanup - Eliminate Duplicates and Atomic Design

## Status Tracking

- [x] Planned
- [ ] In Progress (TDD Phase)
- [ ] Efficiency Review
- [ ] Security Review
- [ ] Complete

**Created:** 2025-10-29
**Last Updated:** 2025-10-29

---

## Configuration

**Efficiency Review**: enabled
**Security Review**: disabled

**Rationale:** This is pure refactoring work (no new functionality, no security-sensitive changes). Efficiency review will catch unused imports and complexity issues. Security review not needed for structural cleanup.

---

## Executive Summary

**Feature:** Eliminate duplicate code and atomic design anti-patterns from frontend architecture

**Purpose:** Remove 1,750+ lines of duplicate code, flatten atomic design structure to function-based organization, establish clear architectural boundaries between extension host and webview code

**Approach:** Multi-phase systematic deletion and reorganization - delete `src/core/ui/` duplicates, flatten atomic design directories to function-based structure, update all import paths, move and update tests, verify all functionality preserved

**Estimated Complexity:** Medium

**Estimated Timeline:** 9.5-11.5 hours (includes 1.5 hours for usage analysis to identify dead code)

**Key Risks:**
1. Breaking imports during mass updates (MEDIUM impact)
2. Test file import path misalignment (MEDIUM impact)
3. Missing dead code references (LOW impact)

---

## Research References

**Research Document:** `.rptc/plans/webview-architecture-restructure/` (Steps 1-6 context)

**Key Findings:**

- **Duplicate Code Problem:** `src/core/ui/` contains 2,285 lines across 26 files that are identical or re-exports from `webview-ui/`
- **Atomic Design Violation:** Research shows "Feature-based organization beats atomic design for VS Code extensions"
- **Import Analysis:** 18 files in `src/features/*/ui/` import from `@/core/ui`, 12 test files import from `@/core/ui`
- **Dead Code Identified:** 4 entry point files in `src/features/*/ui/main/` not used by webpack
- **Architectural Boundary:** Clear separation needed between extension host (`src/`) and webview code (`webview-ui/`)

**Prohibited Patterns (from research):**
- Creating new abstraction layers (no atomic design)
- Size-based categorization (atoms/molecules/organisms)
- Abstract base classes without 3+ implementations
- Factory patterns for simple instantiation

**Required Patterns:**
- Clear separation: extension host vs webview
- Function-based organization (ui/, forms/, feedback/, navigation/, layout/)
- Flat structure with minimal indirection

---

## Implementation Constraints

### File Size Constraints
- Webview component files: <500 lines (standard)
- Shared components: <300 lines (reusable limit)
- No size changes expected (pure refactoring)

### Complexity Constraints
- <50 lines per function (no changes expected)
- Cyclomatic complexity <10 (no changes expected)
- No new complexity introduced

### Dependency Constraints
- **PROHIBITED:** Creating any new abstractions or directories
- **PROHIBITED:** Changing component functionality during refactor
- **REQUIRED:** Maintain exact same exports in new locations
- **REQUIRED:** Update all imports atomically (no partial states)

### Platform Constraints
- Node.js 18+
- VS Code 1.75+
- React 18+
- TypeScript 5.0+
- Webpack 5

### Performance Constraints
- No performance regressions (pure refactoring)
- Webpack build times should improve slightly (fewer source files)
- TypeScript compilation should be identical or faster

---

## Test Strategy

### Testing Approach

- **Framework:** Jest + React Testing Library (94 existing tests)
- **Coverage Goal:** 100% test preservation (no tests dropped, all pass)
- **Test Distribution:**
  - Automated tests: Update 12 test files, ensure all 94 tests pass
  - Manual verification: Load all 4 webviews (wizard, welcome, dashboard, configure)
  - Build verification: TypeScript compilation + webpack build

### Test Scenarios

#### Scenario 1: All Automated Tests Pass After Import Updates

- [ ] **Test:** Run full test suite after import path updates
  - **Given:** All imports updated from `@/core/ui/*` to `@/webview-ui/shared/*`
  - **When:** Execute `npm test`
  - **Then:** All 94 tests pass with 0 failures, 0 new warnings
  - **File:** All test files

#### Scenario 2: TypeScript Compilation Clean

- [ ] **Test:** TypeScript compilation after file deletions
  - **Given:** `src/core/ui/` deleted, atomic design flattened, imports updated
  - **When:** Execute `npm run compile:typescript`
  - **Then:** 0 new TypeScript errors (14 pre-existing errors acceptable)
  - **File:** Manual test

#### Scenario 3: Webpack Builds Successfully

- [ ] **Test:** Webpack bundles build after structure changes
  - **Given:** All import paths updated, files reorganized
  - **When:** Execute `npm run build`
  - **Then:** 4 bundles generated (wizard, welcome, dashboard, configure), no webpack errors
  - **File:** Manual test

### Edge Case Scenarios

#### Edge Case 1: Barrel File Exports Preserved

- [ ] **Test:** All component exports still accessible via barrel files
  - **Given:** Components moved to function-based directories
  - **When:** Import from `@/webview-ui/shared/components`
  - **Then:** All 27 component exports resolve correctly
  - **File:** Manual test (verify imports in feature files)

#### Edge Case 2: Type Exports Preserved

- [ ] **Test:** TypeScript types remain accessible after moves
  - **Given:** Types moved with components to new directories
  - **When:** Import component types (BadgeVariant, FormFieldProps, etc.)
  - **Then:** All type imports resolve, no "Cannot find type" errors
  - **File:** TypeScript compilation

#### Edge Case 3: CSS and Style Imports Still Work

- [ ] **Test:** Style imports resolve after component moves
  - **Given:** Components moved but relative style imports updated
  - **When:** Webpack builds and webviews render
  - **Then:** All styles applied correctly, no missing CSS
  - **File:** Manual test (visual inspection)

### Error Condition Scenarios

#### Error 1: Missing Import Path Update

- [ ] **Test:** Catch any missed import path updates
  - **Given:** Automated find-replace completes
  - **When:** Run `grep -r "from '@/core/ui" src/ tests/`
  - **Then:** 0 results (all imports updated)
  - **File:** Verification script

#### Error 2: Broken Re-Export Chain

- [ ] **Test:** Verify barrel file re-export chains intact
  - **Given:** Barrel files updated with new component locations
  - **When:** Import components via barrel files in test file
  - **Then:** All imports resolve, no "export not found" errors
  - **File:** Test file compilation

#### Error 3: Dead Code References Remain

- [ ] **Test:** Verify no references to deleted files
  - **Given:** `src/core/ui/` and `src/features/*/ui/main/` deleted
  - **When:** Run `grep -r "core/ui" src/` and `grep -r "ui/main" src/`
  - **Then:** 0 results (no orphaned references)
  - **File:** Verification script

### Coverage Goals

**Overall Target:** 100% test preservation

**Component Breakdown:**
- Existing tests: 100% updated and passing (94 tests)
- Manual verification: 100% (all 4 webviews tested)
- Build verification: 100% (TypeScript + webpack)

**Excluded from Coverage:**
- Performance testing (not applicable to refactoring)
- E2E tests (none exist in project)

---

## Acceptance Criteria

**Definition of Done for this feature:**

- [ ] **Usage Analysis Complete:** All components/hooks analyzed, dead code identified before migration
- [ ] **Dead Code Deleted:** All unused components/hooks/tests deleted (not migrated)
- [ ] **Duplication Eliminated:** `src/core/ui/` directory completely deleted
- [ ] **Atomic Design Removed:** No atoms/, molecules/, organisms/, templates/ directories
- [ ] **Function-Based Structure:** Components organized in ui/, forms/, feedback/, navigation/, layout/
- [ ] **Tests Passing:** All automated tests pass (reduced count if tests deleted)
- [ ] **Imports Updated:** 0 references to `@/core/ui` in codebase
- [ ] **Dead Code Removed:** `src/features/*/ui/main/` entry points deleted
- [ ] **TypeScript Clean:** 0 new compilation errors
- [ ] **Webpack Success:** All 4 bundles build successfully
- [ ] **Manual Verification:** All 4 webviews load and function identically
- [ ] **Barrel Files Updated:** All component exports accessible via barrel files
- [ ] **Type Exports Preserved:** All TypeScript types accessible after moves

**Feature-Specific Criteria:**

- [ ] Clear architectural boundary: no extension host code in `webview-ui/`, no webview code in `src/`
- [ ] Function-based directory structure matches research recommendations
- [ ] All component re-exports work through `@/webview-ui/shared/components`
- [ ] Git history preserved for moved files (use `git mv`)
- [ ] No functionality changes (pure refactoring)

---

## Risk Assessment

### Risk 1: Breaking Imports During Mass Updates

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** High
- **Priority:** High
- **Description:** Automated find-replace for import paths could miss edge cases (multiline imports, commented imports, dynamic imports), causing runtime failures in webviews
- **Mitigation:**
  1. Use TypeScript compiler as verification (will catch all missing imports)
  2. Use grep verification script after automated updates (check for any remaining old paths)
  3. Test each phase independently (don't update all imports at once)
  4. Create checkpoint commits after each phase (easy rollback)
  5. Manual verification of all 4 webviews after import updates
- **Contingency:** If imports break, use `git log --follow` to trace file moves, fix manually, verify with TypeScript

### Risk 2: Test File Import Path Misalignment

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Medium
- **Priority:** Medium
- **Description:** Test files use different import patterns than source files (relative imports, barrel imports, direct imports), automated updates might not catch all variations
- **Mitigation:**
  1. Analyze test import patterns before automation (grep for all import variations)
  2. Update test imports in separate phase from source imports
  3. Run test suite after each batch of test import updates
  4. Use multiple grep patterns to verify (handle all import quote styles)
- **Contingency:** If tests fail, inspect failed test file, identify import pattern, update all tests with same pattern

### Risk 3: Barrel File Export Chains Break

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** High
- **Priority:** Medium
- **Description:** Complex re-export chains in barrel files (index.ts) could break if not all intermediate exports updated correctly
- **Mitigation:**
  1. Update barrel files immediately after component moves (don't leave partial state)
  2. Use TypeScript compiler to verify exports resolve
  3. Test imports from barrel files in isolation (create test file importing all exports)
  4. Verify barrel file export chains bottom-up (leaf exports first, then parent exports)
- **Contingency:** If exports break, trace export chain with TypeScript errors, fix each layer bottom-up

### Risk 4: CSS/Style Import Resolution Failures

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Low
- **Priority:** Low
- **Description:** Components with relative CSS imports might break if import paths not updated during moves
- **Mitigation:**
  1. Search for `.css` imports before moving files
  2. Update relative CSS paths when moving components
  3. Verify with webpack build (CSS errors will show in build output)
  4. Manual visual inspection of webviews
- **Contingency:** If styles break, inspect webpack build output for CSS errors, fix relative paths

### Risk 5: Dead Code Has Hidden References

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Low
- **Priority:** Low
- **Description:** Files marked as "dead code" (unused entry points) might have hidden references in configuration files, scripts, or documentation
- **Mitigation:**
  1. Grep entire repository for file names before deletion (include docs/, scripts/, config files)
  2. Check webpack.config.js explicitly for entry point references
  3. Create git branch checkpoint before deletions
  4. Verify webpack build succeeds after deletions
- **Contingency:** If references found, assess if reference is critical, update or remove reference, then delete file

---

## File Reference Map

### Existing Files (To Delete)

**Duplicate Code in src/core/ui/ (26 files, 2,285 lines):**
- `src/core/ui/components/` - 8 component files (duplicates of webview-ui)
- `src/core/ui/hooks/` - 9 hook files (re-exports from webview-ui)
- `src/core/ui/styles/` - 3 style files (duplicates)
- `src/core/ui/types/` - 1 type file
- `src/core/ui/utils/` - 1 utility file
- `src/core/ui/vscode-api.ts` - Re-export

**Dead Entry Points (4 files):**
- `src/features/dashboard/ui/main/configure.tsx` (NOT used by webpack)
- `src/features/dashboard/ui/main/project-dashboard.tsx` (NOT used by webpack)
- `src/features/welcome/ui/main/welcome.tsx` (NOT used by webpack)
- `src/features/project-creation/ui/main/index.tsx` (NOT used by webpack)

**Total to Delete:** 30 files

### Existing Files (To Move)

**Atomic Design to Function-Based Reorganization:**

**From atoms/ (8 files) → ui/ directory:**
- `Badge.tsx` → `webview-ui/src/shared/components/ui/Badge.tsx`
- `Icon.tsx` → `webview-ui/src/shared/components/ui/Icon.tsx`
- `Spinner.tsx` → `webview-ui/src/shared/components/ui/Spinner.tsx`
- `StatusDot.tsx` → `webview-ui/src/shared/components/ui/StatusDot.tsx`
- `Tag.tsx` → `webview-ui/src/shared/components/ui/Tag.tsx`
- `Transition.tsx` → `webview-ui/src/shared/components/ui/Transition.tsx`
- `index.ts` → Update exports

**From molecules/ (5 files) → forms/ and feedback/ directories:**
- `FormField.tsx` → `webview-ui/src/shared/components/forms/FormField.tsx`
- `ErrorDisplay.tsx` → `webview-ui/src/shared/components/feedback/ErrorDisplay.tsx`
- `LoadingOverlay.tsx` → `webview-ui/src/shared/components/feedback/LoadingOverlay.tsx`
- `EmptyState.tsx` → `webview-ui/src/shared/components/feedback/EmptyState.tsx`
- `ConfigSection.tsx` → `webview-ui/src/shared/components/forms/ConfigSection.tsx`
- `StatusCard.tsx` (re-export) → Update to point to `feedback/StatusCard.tsx`
- `index.ts` → Delete (replaced by function-based exports)

**From organisms/ (2 files) → navigation/ directory:**
- `SearchableList.tsx` → `webview-ui/src/shared/components/navigation/SearchableList.tsx`
- `NavigationPanel.tsx` → `webview-ui/src/shared/components/navigation/NavigationPanel.tsx`
- `index.ts` → Delete

**From templates/ (2 files) → layout/ directory:**
- `TwoColumnLayout.tsx` → `webview-ui/src/shared/components/layout/TwoColumnLayout.tsx`
- `GridLayout.tsx` → `webview-ui/src/shared/components/layout/GridLayout.tsx`
- `index.ts` → Delete

**Shared components/ (move to appropriate directories):**
- `FadeTransition.tsx` → `webview-ui/src/shared/components/ui/FadeTransition.tsx`
- `LoadingDisplay.tsx` → `webview-ui/src/shared/components/feedback/LoadingDisplay.tsx`
- `Modal.tsx` → `webview-ui/src/shared/components/ui/Modal.tsx`
- `NumberedInstructions.tsx` → `webview-ui/src/shared/components/ui/NumberedInstructions.tsx`
- `StatusCard.tsx` → `webview-ui/src/shared/components/feedback/StatusCard.tsx`

**Keep in shared/components/ (specialized):**
- `ComponentCard.tsx` - Feature-specific
- `CompactOption.tsx` - Feature-specific
- `ConfigurationSummary.tsx` - Feature-specific
- `DependencyItem.tsx` - Feature-specific
- `SelectionSummary.tsx` - Feature-specific
- `Tip.tsx` - Feature-specific
- `spectrum-extended/` - Spectrum extensions
- `debug/` - Debug utilities

**Total to Move:** ~27 files

### Existing Files (To Modify - Import Updates)

**Source Files (18 files):**
- `src/features/authentication/ui/hooks/useSelectionStep.ts`
- `src/features/authentication/ui/steps/AdobeAuthStep.tsx`
- `src/features/project-creation/ui/steps/ProjectCreationStep.tsx`
- `src/features/project-creation/ui/wizard/WizardContainer.tsx`
- `src/features/project-creation/ui/App.tsx`
- `src/features/components/ui/steps/ComponentConfigStep.tsx`
- `src/features/components/ui/steps/ComponentSelectionStep.tsx`
- `src/features/dashboard/ui/main/configure.tsx` (DELETE, but list for completeness)
- `src/features/dashboard/ui/main/project-dashboard.tsx` (DELETE)
- `src/features/dashboard/ui/ProjectDashboardScreen.tsx`
- `src/features/dashboard/ui/ConfigureScreen.tsx`
- `src/features/welcome/ui/main/welcome.tsx` (DELETE)
- `src/features/welcome/ui/WelcomeScreen.tsx`
- `src/features/prerequisites/ui/steps/PrerequisitesStep.tsx`
- `src/features/mesh/ui/steps/ApiMeshStep.tsx`
- `src/core/ui/hooks/index.ts` (DELETE)
- `src/core/ui/hooks/useVSCodeRequest.ts` (DELETE)
- `src/core/ui/hooks/useVSCodeMessage.ts` (DELETE)

**Test Files (12 files):**
- `tests/features/components/ui/steps/ComponentConfigStep.test.tsx`
- `tests/features/components/ui/steps/ComponentSelectionStep.test.tsx`
- `tests/core/ui/hooks/useVSCodeRequest.test.ts` → Move to `tests/webview-ui/shared/hooks/`
- `tests/core/ui/hooks/useLoadingState.test.ts` → Move to `tests/webview-ui/shared/hooks/`
- `tests/core/ui/hooks/useSearchFilter.test.ts` → Move to `tests/webview-ui/shared/hooks/`
- `tests/core/ui/hooks/useSelectableDefault.test.ts` → Move to `tests/webview-ui/shared/hooks/`
- `tests/core/ui/hooks/useSelection.test.ts` → Move to `tests/webview-ui/shared/hooks/`
- `tests/core/ui/hooks/useVSCodeMessage.test.ts` → Move to `tests/webview-ui/shared/hooks/`
- `tests/core/ui/hooks/useAutoScroll.test.ts` → Move to `tests/webview-ui/shared/hooks/`
- `tests/core/ui/hooks/useFocusTrap.test.ts` → Move to `tests/webview-ui/shared/hooks/`
- `tests/core/ui/components/LoadingDisplay.test.tsx` → Move to `tests/webview-ui/shared/components/feedback/`
- `tests/core/ui/hooks/useAsyncData.test.ts` → Move to `tests/webview-ui/shared/hooks/`

**Configuration Files:**
- `tsconfig.json` - Update path aliases
- `webpack.config.js` - Verify aliases

**Total Import Updates:** ~150 import statements across 30 files

### New Files (To Create)

**New Directory Structure:**
- `webview-ui/src/shared/components/ui/` - Basic UI elements
- `webview-ui/src/shared/components/forms/` - Form-related components
- `webview-ui/src/shared/components/feedback/` - Status/loading/error components
- `webview-ui/src/shared/components/navigation/` - Navigation components
- `webview-ui/src/shared/components/layout/` - Layout components
- `tests/webview-ui/shared/hooks/` - Hook tests
- `tests/webview-ui/shared/components/feedback/` - Component tests
- `tests/webview-ui/shared/components/forms/` - Form component tests

**New Barrel Files:**
- `webview-ui/src/shared/components/ui/index.ts` - Export all UI components
- `webview-ui/src/shared/components/forms/index.ts` - Export form components
- `webview-ui/src/shared/components/feedback/index.ts` - Export feedback components
- `webview-ui/src/shared/components/navigation/index.ts` - Export navigation components
- `webview-ui/src/shared/components/layout/index.ts` - Export layout components
- `webview-ui/src/shared/components/index.ts` - Update main barrel file

**Total New Files:** 11 (5 directories + 6 barrel files)

---

## Assumptions

**IMPORTANT:** Verify these assumptions before implementation:

- [ ] **Assumption 1:** All components in `src/core/ui/` are true duplicates or re-exports
  - **Source:** FROM: git history and file comparison in previous webview-architecture-restructure work
  - **Impact if Wrong:** Could delete non-duplicate code, breaking functionality

- [ ] **Assumption 2:** No production code imports from `src/features/*/ui/main/` entry points
  - **Source:** FROM: webpack.config.js analysis showing these files not in entry points
  - **Impact if Wrong:** Would break build if referenced elsewhere

- [ ] **Assumption 3:** All atomic design directories (atoms/molecules/organisms/templates) can be safely flattened
  - **Source:** FROM: Research findings showing atomic design inappropriate for VS Code extensions
  - **Impact if Wrong:** Could break imports if external code expects atomic structure

- [ ] **Assumption 4:** TypeScript path alias `@/core/ui` can be safely removed after import updates
  - **Source:** ASSUMED based on import analysis showing all uses in known files
  - **Impact if Wrong:** Could break imports in unanalyzed files (scripts, tests)

- [ ] **Assumption 5:** Barrel file re-exports can preserve same public API after reorganization
  - **Source:** ASSUMED based on standard barrel file patterns
  - **Impact if Wrong:** Could break external imports expecting specific export structure

---

## Plan Maintenance

**This is a living document.**

### How to Handle Changes During Implementation

1. **Small Adjustments:** Update plan inline, note in "Deviations" section
2. **Major Changes:** Use `/rptc:helper-update-plan` command
3. **Blockers:** Document in "Implementation Notes" section

### Deviations Log

**Format:**

```markdown
- **Date:** [YYYY-MM-DD]
- **Change:** [What changed from original plan]
- **Reason:** [Why the change was needed]
- **Impact:** [How this affects other steps]
```

### When to Request Replanning

Request full replan if:

- Core assumptions proven wrong (e.g., `src/core/ui/` contains non-duplicates)
- Breaking changes discovered in component API surface
- TypeScript compilation shows fundamental path resolution issues
- Estimated effort > 2x original estimate (>20 hours)

---

## Implementation Notes (Updated During TDD Phase)

**This section filled during implementation by TDD phase.**

### Completed Steps

- [ ] Phase 1: [Name] - Pending

### In Progress

- [ ] Phase 1: [Name] - Pending

### Pending

- All steps pending

---

## Next Actions

**After Plan Complete:**

1. **For Developer:** Execute with `/rptc:tdd "@frontend-architecture-cleanup/"`
2. **Quality Gates:** Efficiency Agent (Security skipped for refactoring)
3. **Completion:** Verify all acceptance criteria met

**First Step:** Run `/rptc:tdd "@frontend-architecture-cleanup/"` to begin TDD implementation

---

_Plan created by Master Feature Planner_
_Status: ✅ Ready for TDD Implementation_
