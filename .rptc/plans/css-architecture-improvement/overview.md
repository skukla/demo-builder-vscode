# CSS Architecture Improvement

## Status
- [x] Planned
- [x] In Progress
- [x] Efficiency Review
- [x] Security Review
- [x] Complete

**Created:** 2025-12-31
**Completed:** 2026-01-01
**Health Score:** 9.2/10

## Executive Summary

**Feature:** Migrate from global monolithic CSS to feature-scoped CSS Modules

**Purpose:** Eliminate CSS coupling, dead code accumulation, and class name collisions by scoping styles to their owning features. Current state: 4,218 lines across 7 CSS files with 35+ feature-specific classes buried in global stylesheets.

**Approach:** Incremental migration using 7 steps: quick wins (dead CSS removal, keyframe deduplication), infrastructure setup (Webpack CSS Modules, TypeScript declarations), then feature-by-feature migration starting with smallest scope (Prerequisites) to largest (Project Creation).

**Complexity:** Medium (infrastructure changes are low-risk; migrations require careful class mapping)

**Key Risks:**
1. Visual regressions during migration (CSS specificity changes)
2. Build configuration breaking existing styles
3. Incomplete class migration causing runtime styling issues

## Test Strategy

**Framework:** Jest with visual regression verification via component rendering tests

**Coverage Goals:** All CSS changes verified through component tests that assert correct className application

**Test Scenarios Summary:** Detailed test scenarios defined in each step file (step-01.md through step-07.md). Key coverage:
- Step 1: Verify removed classes not referenced in codebase
- Step 2: Confirm keyframe animations render correctly after deduplication
- Steps 3-4: Build produces valid CSS Modules with TypeScript support
- Steps 5-7: Components render with correct scoped class names

## Acceptance Criteria

- [x] Dead CSS removed (63 unused classes removed)
- [x] Keyframe duplication eliminated (single source per animation)
- [x] Webpack configured for CSS Modules (.module.css pattern)
- [x] TypeScript declarations enable IDE autocomplete for CSS Modules
- [x] Prerequisites feature migrated (177 lines)
- [x] Project Creation feature migrated (325 lines)
- [x] Projects Dashboard feature migrated (28 lines)
- [x] EDS feature migrated (157 lines) - Added during re-audit
- [x] All existing tests passing (150+ new tests added)
- [x] No visual regressions in wizard UI
- [x] Bundle size reduced (233 KiB → 230 KiB)

## Risk Assessment

| Risk | Category | Likelihood | Impact | Mitigation |
|------|----------|------------|--------|------------|
| Visual regressions | Technical | Medium | High | Incremental migration with component tests; visual comparison before/after |
| Build configuration breaks | Technical | Low | High | Test Webpack changes in isolation; preserve fallback for non-module CSS |
| Incomplete class migration | Technical | Medium | Medium | Grep codebase for each class before removing from global CSS |
| CSS specificity conflicts | Technical | Low | Medium | Use CSS Modules scoped classes; avoid mixing global and scoped |

## Dependencies

**New Packages:** None (css-loader already supports modules mode)

**Configuration Changes:**
- `webpack.config.js` - Add CSS Modules rule for `.module.css` files

**External Services:** None

## Implementation Constraints

- **File Size:** <500 lines per CSS module (standard)
- **Complexity:** Single responsibility per module; avoid deep selector nesting
- **Dependencies:** Preserve existing global utility classes (typography, spacing) in custom-spectrum.css
- **Platforms:** VS Code webview (Chromium-based)
- **Performance:** No measurable build time increase

## File Reference Map

**Existing Files to Modify:**
- `webpack.config.js` - CSS Modules configuration
- `src/core/ui/styles/custom-spectrum.css` - Remove migrated feature classes
- `src/core/ui/styles/wizard.css` - Remove migrated feature classes

**New Files to Create:**
- `src/types/css.d.ts` - TypeScript declarations for CSS Modules
- `src/features/prerequisites/ui/styles/prerequisites.module.css` - Prerequisites feature styles
- `src/features/project-creation/ui/styles/project-creation.module.css` - Project Creation styles
- `src/features/projects-dashboard/ui/styles/projects-dashboard.module.css` - Projects Dashboard styles

**Files Unchanged:**
- `src/core/ui/styles/reset.css` - Global reset (stays global)
- `src/core/ui/styles/tokens.css` - Design tokens (stays global)
- `src/core/ui/styles/vscode-theme.css` - Theme integration (stays global)
- `src/core/ui/styles/index.css` - Import orchestration (stays global)

## Coordination Notes

**Step Dependencies:**
- Step 1 (Dead CSS Audit) is independent - can start immediately
- Step 2 (Keyframe Deduplication) depends on Step 1 for clean slate
- Steps 3-4 (Infrastructure) must complete before Steps 5-7
- Steps 5-7 (Feature Migrations) can be done in any order after Step 4

**Deferred Work:**
- Global CSS reorganization (original Step 8) deferred per PM simplicity gate
- Future iteration may consolidate remaining global utilities

## Completion Summary

**All steps completed successfully:**
- Step 1: Dead CSS Audit - 63 classes removed
- Step 2: Keyframe Deduplication - Duplicate fadeIn removed
- Step 3: Webpack CSS Modules - Build config updated
- Step 4: TypeScript Declarations - Type safety added
- Step 5: Prerequisites Migration - 177-line CSS Module
- Step 6: Project Creation Migration - 325-line CSS Module
- Step 7: Projects Dashboard Migration - 28-line CSS Module

**Additional improvements from re-audit:**
- Fixed 3 duplicate wizard class definitions
- Migrated EDS connect-services.css to CSS Module (157 lines)
- Removed 163 unnecessary !important declarations

**Quality gates passed:**
- Efficiency Agent: Removed !important anti-patterns
- Security Agent: 0 vulnerabilities
- Documentation Specialist: Updated styling-guide.md

**Follow-up work identified:**
- See `.rptc/plans/css-utility-modularization/` for future improvement to break up custom-spectrum.css into focused files
