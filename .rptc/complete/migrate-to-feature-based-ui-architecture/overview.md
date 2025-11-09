# Implementation Plan: Migrate to Feature-Based UI Architecture

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase) - Step 6 of 7 Complete ✅
- [ ] Efficiency Review
- [ ] Security Review
- [ ] Complete

**Created:** 2025-11-08
**Last Updated:** 2025-11-08
**Step 6 Status:** 48/48 tests passing (100%), Components/Prerequisites/Mesh steps migrated
**Steps:** 7 implementation steps (step-01.md through step-07.md)

---

## Configuration

### Quality Gates

**Efficiency Review**: enabled
**Security Review**: disabled

**Note**: Security review disabled as this is architectural refactoring without security implications.

---

## Executive Summary

**Feature:** Migrate VS Code extension UI from centralized webview-ui/ directory to feature-based architecture in src/features/*/ui/

**Purpose:** Eliminate architectural inconsistency between backend (feature-based) and frontend (centralized), remove 7,045 lines of dead code duplication, align with industry best practices (GitLens pattern)

**Approach:** Incremental migration following dependency order: welcome → dashboard → configure → authentication → components/prerequisites/mesh → project-creation. Reconfigure webpack entry points per feature, update import paths, maintain test coverage throughout.

**Estimated Complexity:** Complex

**Estimated Timeline:** 1-2 weeks (7 features × 1-2 days each)

**Key Risks:** Webpack bundle breakage during reconfiguration (HIGH), import path update errors (MEDIUM), test compatibility issues (MEDIUM)

---

## Test Strategy

### Testing Approach

- **Framework:** Jest with @testing-library/react (existing)
- **Coverage Goal:** Maintain 80%+ coverage throughout migration (no regression)
- **Test Distribution:** Unit (70%), Integration (25%), E2E (5%)
- **Test Organization:** Tests in `tests/features/*/ui/` mirror `src/features/*/ui/` (per project standard)

### Test Scenarios Summary

**Happy Path:** All existing webviews (wizard, welcome, dashboard, configure) render correctly from new locations, user workflows complete successfully

**Edge Cases:** Webpack bundle splitting with shared dependencies (React, Spectrum), cross-feature imports maintain correct boundaries, test files mirror source structure in tests/features/*/ui/

**Error Conditions:** Webpack build failures caught early, missing import resolution errors detected, test file path mismatches identified

**Detailed test scenarios are in each step file** (step-01.md through step-07.md)

### Coverage Goals

**Overall Target:** 80%+ (maintain existing coverage)

**Component Breakdown:**

- Authentication UI: 85% (critical auth flows)
- Project Creation UI: 90% (wizard orchestration)
- Dashboard/Configure UI: 80% (standard coverage)
- Welcome UI: 75% (simple presentation)

---

## Acceptance Criteria

**Definition of Done for this feature:**

- [ ] **Functionality:** All 4 webviews (wizard, welcome, dashboard, configure) functional from new locations
- [ ] **Testing:** All tests passing (maintain 80%+ coverage)
- [ ] **Architecture:** Backend and frontend both use feature-based organization
- [ ] **Code Quality:** No dead code (webview-ui/ removed), imports use @/features paths
- [ ] **Documentation:** CLAUDE.md files updated to reflect new structure
- [ ] **Webpack:** All bundles build successfully with code splitting configured
- [ ] **Build Performance:** Build time not significantly regressed (<10% slower acceptable)
- [ ] **Error Handling:** All error conditions handled gracefully

**Feature-Specific Criteria:**

- [ ] Zero duplication between src/features/*/ui/ and old webview-ui/ (delete old directory)
- [ ] Webpack code splitting configured (shared React/vendors bundle)
- [ ] tsconfig.webview.json removed (use main tsconfig with feature paths)
- [ ] Import paths migrated from @/webview-ui/* to @/features/* and @/shared/*
- [ ] Test files in tests/features/*/ui/ directories (mirrors source structure per project standard)
- [ ] Documentation matches actual implementation (screaming architecture)

---

## Risk Assessment

### Risk 1: Webpack Bundle Breakage

- **Category:** Technical
- **Likelihood:** High
- **Impact:** High
- **Priority:** Critical
- **Description:** Reconfiguring webpack entry points from webview-ui/ to src/features/*/ui/ may break bundle generation. Current 4 entry points (wizard, welcome, dashboard, configure) depend on centralized structure.
- **Mitigation:**
  1. Migrate features incrementally (one at a time, verify bundle builds)
  2. Create dual webpack configs during transition (old + new side-by-side)
  3. Implement webpack code splitting simultaneously (vendors bundle)
  4. Run `npm run build` after each feature migration
- **Contingency Plan:** Keep webview-ui/ alongside src/features/*/ui/ until all bundles verified working, rollback feature-by-feature if needed

### Risk 2: Import Path Update Errors

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Medium
- **Priority:** High
- **Description:** Migrating from @/webview-ui/* to @/features/* requires updating hundreds of import statements. Missing updates cause runtime errors in webviews.
- **Mitigation:**
  1. Use TypeScript compiler to catch missing imports before runtime
  2. Automated search-replace for common patterns (validate manually)
  3. Test each webview in Extension Development Host after changes
  4. Maintain import path aliases during transition (backward compatibility)
- **Contingency Plan:** Use git to revert specific feature migration, fix import errors, re-attempt migration

### Risk 3: Test Compatibility Issues

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Medium
- **Priority:** High
- **Description:** Tests currently in tests/ directory reference webview-ui/ paths. Colocation in src/features/*/ui/ requires Jest config updates and import path changes in tests.
- **Mitigation:**
  1. Update Jest config moduleNameMapper for @/features paths
  2. Move tests incrementally with feature migration
  3. Run test suite after each feature (catch breaks immediately)
  4. Use coverage reports to verify no test loss
- **Contingency Plan:** Keep tests in tests/ directory temporarily if colocation causes issues, migrate tests as separate follow-up step

### Risk 4: Webpack Code Splitting Complexity

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Low
- **Priority:** Medium
- **Description:** Implementing code splitting (shared vendors bundle) adds complexity to webpack config. Misconfiguration can increase bundle size or cause runtime errors.
- **Mitigation:**
  1. Use webpack-bundle-analyzer to validate bundle sizes
  2. Test all webviews load correctly with split bundles
  3. Reference research document (Option 2 implementation) for proven config
  4. Incremental approach: implement splitting after basic migration working
- **Contingency Plan:** Skip code splitting initially, complete migration first, add splitting as optimization later

### Risk 5: Build Performance Regression

- **Category:** Performance
- **Likelihood:** Low
- **Impact:** Low
- **Priority:** Low
- **Description:** Feature-based structure may increase webpack build time due to more complex module resolution across feature directories.
- **Mitigation:**
  1. Measure build time before and after migration (baseline vs final)
  2. Use webpack persistent caching (cache: { type: 'filesystem' })
  3. Optimize tsconfig include/exclude patterns for features
  4. Monitor watch mode rebuild times during development
- **Contingency Plan:** Acceptable if <10% slower, optimize if >10% regression (parallel builds, caching strategies)

---

## Dependencies

### New Packages to Install

- [ ] **Package:** `webpack-bundle-analyzer@^4.10.1`
  - **Purpose:** Visualize bundle sizes, validate code splitting effectiveness
  - **Risk:** Low

### Configuration Changes

- [ ] **Config:** `webpack.config.js`
  - **Changes:** Reconfigure 4 entry points from webview-ui/ to src/features/*/ui/, add code splitting optimization
  - **Environment:** All environments

- [ ] **Config:** `tsconfig.json` (main)
  - **Changes:** Add @/features path alias, include src/features/*/ui/ in compilation
  - **Environment:** All environments

- [ ] **Config:** Remove `tsconfig.webview.json`
  - **Changes:** Delete file (consolidate to main tsconfig)
  - **Environment:** All environments

- [ ] **Config:** `jest.config.js`
  - **Changes:** Update moduleNameMapper for @/features paths, adjust testMatch patterns for tests/features/*/ui/ mirrored tests
  - **Environment:** Test only

- [ ] **Config:** `.vscode/settings.json`
  - **Changes:** Update TypeScript project references if applicable
  - **Environment:** Development only

### External Service Integrations

None - This is internal architectural refactoring with no external dependencies.

---

## File Reference Map

### Existing Files (To Modify)

**Webpack Configuration:**
- `webpack.config.js` - Change entry points from webview-ui/src/ to src/features/*/ui/, add splitChunks optimization

**TypeScript Configuration:**
- `tsconfig.json` - Add @/features path alias, include feature UI directories
- Delete `tsconfig.webview.json` - Consolidate to main config

**Test Configuration:**
- `jest.config.js` - Update moduleNameMapper, adjust testMatch for mirrored tests in tests/features/*/ui/

**Documentation:**
- `CLAUDE.md` - Update references from webview-ui/ to feature-based structure
- `src/CLAUDE.md` - Update feature UI documentation
- `src/features/CLAUDE.md` - Update feature structure examples
- `src/webviews/CLAUDE.md` - Delete (obsolete)

**Extension Commands (HTML references):**
- `src/commands/createProjectWebview.ts` - Update bundle path references
- `src/commands/welcomeWebview.ts` - Update bundle path references
- `src/commands/projectDashboardWebview.ts` - Update bundle path references
- `src/commands/configureProjectWebview.ts` - Update bundle path references

### New Files (To Create)

**Feature UI Files (migrated from webview-ui/):**

**Welcome Feature:**
- `src/features/welcome/ui/index.tsx` - Entry point (from webview-ui/src/welcome/index.tsx)
- `src/features/welcome/ui/WelcomeScreen.tsx` - Main component
- `src/features/welcome/ui/ProjectCard.tsx` - Subcomponent
- `src/features/welcome/ui/EmptyState.tsx` - Subcomponent
- Tests in `tests/features/welcome/ui/` (mirrors source structure)

**Dashboard Feature:**
- `src/features/dashboard/ui/index.tsx` - Entry point
- `src/features/dashboard/ui/ProjectDashboardScreen.tsx` - Main component
- Tests in `tests/features/dashboard/ui/` (mirrors source structure)

**Configure Feature:**
- `src/features/dashboard/ui/configure/index.tsx` - Entry point
- `src/features/dashboard/ui/configure/ConfigureScreen.tsx` - Main component
- Tests in `tests/features/dashboard/ui/configure/` (mirrors source structure)

**Authentication Feature:**
- `src/features/authentication/ui/steps/AdobeAuthStep.tsx` - Auth step component
- `src/features/authentication/ui/steps/AdobeProjectStep.tsx` - Project selection
- `src/features/authentication/ui/steps/AdobeWorkspaceStep.tsx` - Workspace selection
- `src/features/authentication/ui/hooks/useSelectionStep.ts` - Shared hook
- Tests in `tests/features/authentication/ui/` (mirrors source structure)

**Components Feature:**
- `src/features/components/ui/steps/ComponentSelectionStep.tsx`
- `src/features/components/ui/steps/ComponentConfigStep.tsx`
- Tests in `tests/features/components/ui/` (mirrors source structure)

**Prerequisites Feature:**
- `src/features/prerequisites/ui/steps/PrerequisitesStep.tsx`
- Tests in `tests/features/prerequisites/ui/` (mirrors source structure)

**Mesh Feature:**
- `src/features/mesh/ui/steps/ApiMeshStep.tsx`
- Tests in `tests/features/mesh/ui/` (mirrors source structure)

**Project Creation Feature:**
- `src/features/project-creation/ui/wizard/index.tsx` - Wizard entry point
- `src/features/project-creation/ui/wizard/WizardContainer.tsx` - Orchestrator
- `src/features/project-creation/ui/wizard/TimelineNav.tsx` - Navigation
- `src/features/project-creation/ui/steps/WelcomeStep.tsx`
- `src/features/project-creation/ui/steps/ProjectCreationStep.tsx`
- `src/features/project-creation/ui/steps/ReviewStep.tsx`
- Tests in `tests/features/project-creation/ui/wizard/` (mirrors source structure)

**Shared UI (moved from webview-ui/src/shared/):**
- `src/core/ui/components/**/*` - Reusable UI components
- `src/core/ui/hooks/**/*` - Shared React hooks
- `src/core/ui/contexts/**/*` - React contexts
- `src/core/ui/utils/**/*` - UI utilities
- `src/core/ui/types/**/*` - Type definitions
- Tests in `tests/core/ui/` (mirrors source structure)

**Total Files:** ~35 modified, ~55 created, ~60 deleted (net: ~30 new)

---

## Coordination Notes

**Step Dependencies:**

- Step 1 (Webpack + Config Setup) must complete before all feature migrations
- Step 2 (Welcome) is independent, can proceed first
- Step 3 (Dashboard) is independent, can proceed in parallel
- Step 4 (Configure) depends on Dashboard (uses shared utilities)
- Step 5 (Authentication) depends on Step 1 (webpack config), independent otherwise
- Step 6 (Components/Prerequisites/Mesh) depends on Authentication (shared patterns)
- Step 7 (Project Creation Wizard) depends on Steps 5+6 (imports all feature steps)

**Integration Points:**

- WizardContainer (project-creation) imports steps from authentication, components, prerequisites, mesh features
- All features import from src/core/ui/ (common dependency)
- Webpack bundles reference dist/webview/*.js (output paths unchanged)
- Extension commands load bundles via getWebviewContent() helpers

**Migration Order Rationale:**

1. **Welcome first** - Simplest (3 files, no dependencies)
2. **Dashboard second** - Simple (1 main component, minimal dependencies)
3. **Configure third** - Builds on Dashboard patterns
4. **Authentication fourth** - Used by wizard, complex step pattern
5. **Components/Prerequisites/Mesh fifth** - Parallel wizard steps, similar patterns
6. **Project Creation last** - Orchestrator importing all above features

**Critical Path:**

Step 1 (Config) → Step 5 (Authentication) → Step 6 (Feature Steps) → Step 7 (Wizard) = Core wizard functionality

**Parallel Opportunities:**

Steps 2, 3, 4 (Welcome/Dashboard/Configure) can proceed in parallel (no interdependencies)

---

## Next Actions

**After Plan Approval:**

1. **For PM:** Review and approve plan, approve Step Generator sub-agents to create detailed step files
2. **For Developer:** Execute with `/rptc:tdd "@migrate-to-feature-based-ui-architecture/"`
3. **Quality Gates:** Efficiency Agent review after all steps complete
4. **Completion:** Verify all acceptance criteria met, all 4 webviews functional

**First Step:** Await Step Generator sub-agents to create step-01.md through step-07.md, then run `/rptc:tdd "@migrate-to-feature-based-ui-architecture/"` to begin TDD implementation

---

_Plan overview created by Master Feature Planner_
_Detailed steps in: step-01.md through step-07.md (generated by Step Generator sub-agents)_
