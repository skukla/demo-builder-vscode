# Implementation Plan: Webview Architecture Restructure

## Status Tracking

- [x] Planned
- [ ] In Progress (TDD Phase)
- [ ] Efficiency Review
- [ ] Security Review
- [ ] Complete

**Created:** 2025-10-29
**Last Updated:** 2025-10-29

---

## Executive Summary

**Feature:** Restructure VS Code extension webview architecture from mixed nested structure to industry-standard feature-based organization

**Purpose:** Eliminate duplication between `src/webviews/` and `src/core/ui/`, establish clear separation between extension host code and webview code, improve build performance with separate bundles, and align with VS Code extension best practices

**Approach:** Multi-phase migration using `git mv` for history preservation, consolidating duplicates, reorganizing by feature (wizard, dashboard, configure), implementing TypeScript project references and webpack multi-entry configuration

**Estimated Complexity:** Complex

**Estimated Timeline:** 16-24 hours

**Key Risks:**
1. Breaking existing webviews during migration (HIGH impact)
2. Import path updates across large codebase (MEDIUM impact)
3. Webpack configuration complexity (MEDIUM impact)

---

## Research References

**Research Document:** N/A (Based on industry best practices research)

**Key Findings:**

- VS Code extensions should have strict separation: extension host code vs webview code
- Webview code should be in top-level `webview-ui/` directory (not nested under `src/`)
- Feature-based organization (wizard, dashboard, configure) beats atomic design for VS Code
- Separate webpack bundles per webview for 40-60% faster load times
- TypeScript project references for 50-70% faster incremental builds
- No "design-system" abstraction justified for single extension
- Current duplication: Modal, FadeTransition, LoadingDisplay, FormField, NumberedInstructions, StatusCard exist in both `src/webviews/components/shared/` and `src/core/ui/components/`

**Current Feature-Based UI Structure:**
- `src/features/*/ui/` already exists for 7 features
- Contains feature-specific UI components and entry points
- Coexists with legacy `src/webviews/` structure

---

## Implementation Constraints

### File Size Constraints
- Webview component files: <500 lines (standard)
- Shared components: <300 lines (must be reusable)
- Feature entry points: <200 lines

### Complexity Constraints
- <50 lines per function
- Cyclomatic complexity <10
- No more than 3 levels of component nesting in feature directories

### Dependency Constraints
- **PROHIBITED:** Creating new abstraction layers (no atomic design resurrection)
- **PROHIBITED:** Creating "design-system" package/directory
- **REQUIRED:** Reuse existing `src/features/*/ui/` components where applicable
- **REQUIRED:** Consolidate duplicates (prefer `src/core/ui/` versions which have size mapping logic)

### Platform Constraints
- Node.js 18+
- VS Code 1.75+
- React 18+
- TypeScript 5.0+
- Webpack 5

### Performance Constraints
- Separate webpack bundles must load <2s each on first load
- Incremental TypeScript builds must complete <5s
- Bundle sizes: wizard <500KB, dashboard <300KB, configure <200KB

---

## Test Strategy

### Testing Approach

- **Framework:** Manual testing (no automated UI tests currently)
- **Coverage Goal:** 100% manual verification of all webview functionality
- **Test Distribution:** Manual verification (100%)

### Happy Path Scenarios

#### Scenario 1: Wizard Webview Loads and Functions

- [ ] **Test:** Open Create Project wizard after restructure
  - **Given:** Extension activated, no existing webviews open
  - **When:** Execute "Demo Builder: Create Project" command
  - **Then:** Wizard opens with Welcome step, all steps navigable, state persists
  - **File:** Manual test

#### Scenario 2: Dashboard Webview Loads and Functions

- [ ] **Test:** Open Project Dashboard after restructure
  - **Given:** Extension activated, project exists in workspace
  - **When:** Execute "Demo Builder: Project Dashboard" command
  - **Then:** Dashboard opens, mesh status checks, start/stop buttons work, logs toggle functions
  - **File:** Manual test

#### Scenario 3: Configure Webview Loads and Functions

- [ ] **Test:** Open Configure screen after restructure
  - **Given:** Extension activated, project exists with configuration
  - **When:** Execute "Demo Builder: Configure" command
  - **Then:** Configure screen opens, component config editable, save persists changes
  - **File:** Manual test

#### Scenario 4: Welcome Screen Disposal Pattern Works

- [ ] **Test:** Welcome screen disposes before opening wizard
  - **Given:** Welcome screen open
  - **When:** Click "Create Project" button
  - **Then:** Welcome screen closes, wizard opens (no tab proliferation)
  - **File:** Manual test

### Edge Case Scenarios

#### Edge Case 1: Multiple Webviews Open Simultaneously

- [ ] **Test:** Multiple webviews can coexist
  - **Given:** Dashboard open in one tab
  - **When:** Open wizard in second tab
  - **Then:** Both webviews remain functional, no message cross-contamination
  - **File:** Manual test

#### Edge Case 2: Webview Hot Reload During Development

- [ ] **Test:** Webpack watch mode reloads webview on change
  - **Given:** Extension running in development mode (F5)
  - **When:** Modify webview component file and save
  - **Then:** Webview automatically reloads with changes
  - **File:** Manual test

#### Edge Case 3: CSP Nonces Remain Functional

- [ ] **Test:** Content Security Policy with nonces works
  - **Given:** Webview HTML generated with CSP nonce
  - **When:** Load webview with inline scripts
  - **Then:** No CSP violations in console, scripts execute
  - **File:** Manual test

### Error Condition Scenarios

#### Error 1: Missing Webpack Bundle

- [ ] **Test:** Extension gracefully handles missing bundle
  - **Given:** Webpack bundle file deleted or not built
  - **When:** Attempt to open webview
  - **Then:** Error message shown to user, extension doesn't crash
  - **File:** Manual test

#### Error 2: TypeScript Compilation Errors

- [ ] **Test:** TypeScript compilation errors caught before runtime
  - **Given:** Syntax error introduced in webview component
  - **When:** Run `npm run build`
  - **Then:** Build fails with clear error message, no broken bundle generated
  - **File:** Manual test

#### Error 3: Import Path Resolution Failures

- [ ] **Test:** All import paths resolve correctly after migration
  - **Given:** All files migrated to new structure
  - **When:** Run TypeScript compilation and webpack build
  - **Then:** No "module not found" errors, all imports resolve
  - **File:** Manual test

### Coverage Goals

**Overall Target:** 100% manual verification

**Component Breakdown:**
- Wizard functionality: 100% (all steps verified)
- Dashboard functionality: 100% (all controls verified)
- Configure functionality: 100% (all config operations verified)
- Shared components: 100% (verified via feature usage)

**Excluded from Coverage:**
- Automated UI tests (not implemented)

---

## Acceptance Criteria

**Definition of Done for this feature:**

- [ ] **Functionality:** All 3 webviews (wizard, dashboard, configure) work identically to before migration
- [ ] **Structure:** Webview code moved to top-level `webview-ui/` directory
- [ ] **Organization:** Feature-based organization (no atomic design artifacts)
- [ ] **Duplication:** All duplicates consolidated (Modal, FadeTransition, etc.)
- [ ] **Imports:** All import paths updated and resolving correctly
- [ ] **Tests:** All existing tests updated with new import paths
- [ ] **Build:** Webpack produces 3 separate bundles (wizard, dashboard, configure)
- [ ] **TypeScript:** Project references configured for incremental builds
- [ ] **Documentation:** CLAUDE.md files updated with new structure
- [ ] **Cleanup:** Old directories (`src/webviews/`, `src/core/ui/`) removed
- [ ] **Git History:** File moves preserved with `git mv`

**Feature-Specific Criteria:**

- [ ] Webpack bundle sizes meet performance constraints (wizard <500KB, dashboard <300KB, configure <200KB)
- [ ] Incremental TypeScript builds complete in <5s
- [ ] No CSP violations in any webview
- [ ] Welcome screen disposal pattern preserved
- [ ] Adobe Spectrum layout workarounds preserved (avoid Flex for layouts)
- [ ] Backend Call on Continue pattern preserved in wizard steps

---

## Risk Assessment

### Risk 1: Breaking Webview Functionality During Migration

- **Category:** Technical
- **Likelihood:** High
- **Impact:** High
- **Priority:** Critical
- **Description:** Incorrect import path updates or missing file moves could break webviews at runtime, blocking all extension UI functionality
- **Mitigation:**
  1. Use `git mv` for all file moves to preserve history and allow rollback
  2. Test each webview after every migration phase (not at end)
  3. Keep extension host and webview changes separate (minimize blast radius)
  4. Create feature branch checkpoint commits after each phase
  5. Use TypeScript compiler to catch import errors before runtime
- **Contingency:** If webview breaks, use `git revert` to rollback phase, fix in isolation, retest

### Risk 2: Import Path Updates Across Large Codebase

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** High
- **Priority:** High
- **Description:** Missing import path updates could cause silent runtime failures or TypeScript errors across 50+ files
- **Mitigation:**
  1. Use automated find-replace for bulk import path updates (verified by TypeScript)
  2. Update tsconfig.json path aliases first, then update imports
  3. Run TypeScript compilation after each batch of import updates
  4. Use grep to verify no old import paths remain
  5. Test one webview completely before moving to next
- **Contingency:** If TypeScript errors persist, use `git log --follow` to trace file moves and fix imports manually

### Risk 3: Webpack Configuration Complexity

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Medium
- **Priority:** Medium
- **Description:** Multi-entry webpack configuration with separate bundles could cause build failures or incorrect bundle generation
- **Mitigation:**
  1. Test webpack configuration incrementally (add one entry at a time)
  2. Verify bundle output after each entry point added
  3. Use webpack-bundle-analyzer to verify bundle contents
  4. Keep existing single-bundle config as backup until multi-entry verified
- **Contingency:** If multi-entry config fails, fall back to single-bundle config, debug in isolation, then switch back

### Risk 4: TypeScript Project References Misconfiguration

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Low
- **Priority:** Medium
- **Description:** Incorrect TypeScript project references could cause compilation failures or slow builds
- **Mitigation:**
  1. Create separate tsconfig files before updating references
  2. Test compilation of each tsconfig individually
  3. Verify incremental build works before committing
  4. Keep existing tsconfig.json as backup
- **Contingency:** If project references cause issues, remove references temporarily, use single tsconfig until resolved

### Risk 5: Loss of Git History for Moved Files

- **Category:** Schedule
- **Likelihood:** Low
- **Impact:** Medium
- **Priority:** Low
- **Description:** Incorrect file moves (not using `git mv`) could lose git history for webview components
- **Mitigation:**
  1. Use `git mv` exclusively for all file moves
  2. Verify git history preserved with `git log --follow` after moves
  3. Create checkpoint commits after each phase
- **Contingency:** If history lost, use `git filter-repo` to reconstruct history (advanced recovery)

---

## File Reference Map

### Existing Files (To Modify)

**Extension Host Files:**
- `src/commands/createProjectWebview.ts` - Update HTML generation for new bundle paths
- `src/commands/welcomeWebview.ts` - Update HTML generation for new bundle paths
- `src/commands/projectDashboard.ts` - Update HTML generation for new bundle paths
- `src/commands/configure.ts` - Update HTML generation for new bundle paths

**Build Configuration Files:**
- `webpack.config.js` - Replace with multi-entry configuration
- `tsconfig.json` - Add project references
- `tsconfig.webview.json` - Migrate to `webview-ui/tsconfig.json`

**Test Files (29 files importing from webviews/core UI):**
- `tests/webviews/components/atoms/*.test.tsx` - Update imports to `@/webview-ui/shared/components/atoms/*`
- `tests/webviews/components/molecules/*.test.tsx` - Update imports to `@/webview-ui/shared/components/molecules/*`

**Feature UI Files (Existing structure to integrate):**
- `src/features/authentication/ui/*` - Keep in place, update imports to use `@/webview-ui/shared/*`
- `src/features/project-creation/ui/*` - Keep in place, update imports
- `src/features/dashboard/ui/*` - Keep in place, update imports
- (7 feature UI directories total)

### New Files (To Create)

**Top-Level Webview Directory:**
- `webview-ui/package.json` - Webview-specific dependencies
- `webview-ui/tsconfig.json` - Webview TypeScript config
- `webview-ui/.eslintrc.js` - Webview-specific linting

**Shared Infrastructure:**
- `webview-ui/src/shared/components/` - Consolidated shared components
- `webview-ui/src/shared/hooks/` - Consolidated shared hooks
- `webview-ui/src/shared/contexts/` - Consolidated shared contexts
- `webview-ui/src/shared/styles/` - Consolidated shared styles
- `webview-ui/src/shared/utils/` - Consolidated shared utilities
- `webview-ui/src/shared/types/` - Webview-specific types

**Feature Directories:**
- `webview-ui/src/wizard/` - Wizard feature (from src/webviews/components/wizard + steps)
- `webview-ui/src/wizard/index.tsx` - Wizard webpack entry point
- `webview-ui/src/dashboard/` - Dashboard feature (from src/webviews/project-dashboard)
- `webview-ui/src/dashboard/index.tsx` - Dashboard webpack entry point
- `webview-ui/src/configure/` - Configure feature (from src/webviews/configure)
- `webview-ui/src/configure/index.tsx` - Configure webpack entry point

**Shared Types (Bridge):**
- `shared/types/messages.ts` - Message protocol types (shared between extension and webview)
- `shared/types/state.ts` - State shape types
- `shared/types/index.ts` - Type exports
- `shared/tsconfig.json` - Shared types TypeScript config

**Total Files:** ~60 modified, ~30 created, ~80 moved

---

## Assumptions

**IMPORTANT:** Verify these assumptions before implementation:

- [ ] **Assumption 1:** All webview code currently in `src/webviews/` can be moved without breaking extension host
  - **Source:** ASSUMED based on clear separation in codebase
  - **Impact if Wrong:** Extension host imports webview code directly (would need refactoring)

- [ ] **Assumption 2:** Feature UI directories in `src/features/*/ui/` are self-contained and don't import from `src/webviews/`
  - **Source:** FROM: Grep analysis showing imports from `@/core/ui` but not `@/webviews`
  - **Impact if Wrong:** Would need to update feature UI imports during migration

- [ ] **Assumption 3:** Existing tests in `tests/webviews/` are unit tests that don't require running webviews
  - **Source:** ASSUMED based on standard practice
  - **Impact if Wrong:** Tests might break if webview structure changes significantly

- [ ] **Assumption 4:** CSP nonce generation in extension host can adapt to new bundle paths
  - **Source:** FROM: src/commands/createProjectWebview.ts uses dynamic bundle path
  - **Impact if Wrong:** Would need to update HTML generation logic

- [ ] **Assumption 5:** No runtime dependencies between different webviews (wizard, dashboard, configure)
  - **Source:** FROM: Each webview has separate entry point in webpack.config.js
  - **Impact if Wrong:** Would need shared runtime bundle in addition to feature bundles

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

- Core requirements change significantly (e.g., keep atomic design structure)
- Technical blockers require fundamental redesign (e.g., can't use webpack multi-entry)
- Feature UI structure conflicts with migration plan
- Estimated effort > 2x original estimate (>40 hours)

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

1. **For Developer:** Execute with `/rptc:tdd "@webview-architecture-restructure/"`
2. **Quality Gates:** Efficiency Agent → Security Agent (if enabled)
3. **Completion:** Verify all acceptance criteria met

**First Step:** Run `/rptc:tdd "@webview-architecture-restructure/"` to begin TDD implementation

---

_Plan created by Master Feature Planner_
_Status: ✅ Ready for TDD Implementation_
