# Implementation Plan: Component Extraction

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [x] Efficiency Review (No issues found)
- [x] Security Review (No vulnerabilities)
- [x] Complete

**Created:** 2025-12-02
**Completed:** 2025-12-02
**Steps:** 13 (across 4 phases)

---

## Executive Summary

**Feature:** Extract shared UI components from duplicated patterns across webviews

**Purpose:** Eliminate 100+ lines of duplicated code, establish consistent UI patterns

**Approach:** Phased extraction following existing `src/core/ui/components/` patterns

**Estimated Complexity:** Medium

**Phases:**
1. Extract core layout components (PageHeader, PageFooter, PageLayout, Card)
2. Adopt components across 4 webviews
3. Extract BackButton navigation component
4. Cleanup (Welcome Screen removal, EmptyState consolidation, ErrorDisplay deprecation, LoadingOverlay extraction)

---

## Test Strategy

### Testing Approach

- **Framework:** Jest + @testing-library/react
- **Coverage Goal:** 85% overall, 100% for extracted components
- **Test Location:** `tests/webview-ui/shared/components/`

### Test Categories

- **Unit:** Component rendering, props handling, accessibility
- **Integration:** Component composition (PageLayout with PageHeader/PageFooter)
- **Visual Regression:** Consistent styling with existing patterns

---

## Implementation Constraints

- **File Size:** <200 lines per component (matches existing layout components)
- **Complexity:** Props-based composition, no internal state management
- **Dependencies:** React, Adobe Spectrum only (no new packages)
- **Patterns:** Follow TwoColumnLayout.tsx API conventions

---

## Acceptance Criteria

- [x] All 4 core components extracted with tests
- [x] 4 webviews migrated to shared components
- [x] Welcome Screen removed, fallbacks updated
- [x] EmptyState consolidated (SKIPPED - not practical), ErrorDisplay deprecated
- [x] No visual regressions in existing UI
- [x] Coverage >= 85% (4182 tests passing)

---

## Risk Assessment

### Risk 1: Visual Regression

- **Likelihood:** Medium | **Impact:** High
- **Mitigation:** Extract exact existing styles, visual comparison testing
- **Contingency:** Revert and iterate on styling

### Risk 2: Props API Incompatibility

- **Likelihood:** Low | **Impact:** Medium
- **Mitigation:** Design flexible leftContent/rightContent ReactNode props
- **Contingency:** Add prop variants as needed

---

## Dependencies

### Files to Create

- `src/core/ui/components/layout/PageHeader.tsx`
- `src/core/ui/components/layout/PageFooter.tsx`
- `src/core/ui/components/layout/PageLayout.tsx`
- `src/core/ui/components/ui/Card.tsx`
- `src/core/ui/components/navigation/BackButton.tsx`
- `src/core/ui/components/feedback/LoadingOverlay.tsx`

### Files to Modify (Adoption)

- `src/features/project-creation/ui/wizard/WizardContainer.tsx`
- `src/features/projects-dashboard/ui/ProjectsDashboard.tsx`
- `src/features/dashboard/ui/configure/ConfigureScreen.tsx`
- `src/features/dashboard/ui/ProjectDashboardScreen.tsx`

### Files to Delete

- `src/features/welcome/` (entire directory)

---

## Coordination Notes

- Steps 1-4 can proceed independently (component extraction)
- Steps 5-8 depend on Steps 1-4 completion (adoption)
- Step 9 independent after Phase 1
- Steps 10-12 are cleanup, can proceed after Phase 2
- Step 13 (LoadingOverlay) is independent, can proceed anytime

---

## Completion Summary

**Date:** 2025-12-02

### Components Created

| Component | Tests | Lines | Location |
|-----------|-------|-------|----------|
| PageHeader | 21 | 110 | `src/core/ui/components/layout/` |
| PageFooter | 16 | 85 | `src/core/ui/components/layout/` |
| PageLayout | 24 | 93 | `src/core/ui/components/layout/` |
| Card | 27 | 86 | `src/core/ui/components/ui/` |
| BackButton | 14 | 32 | `src/core/ui/components/navigation/` |
| LoadingOverlay | 13 | 86 | `src/core/ui/components/feedback/` |

### Adoption Summary

| Webview | Components Used |
|---------|-----------------|
| WizardContainer | PageHeader, PageFooter, LoadingOverlay |
| ProjectsDashboard | PageHeader, PageLayout |
| ConfigureScreen | PageHeader, PageFooter |
| ProjectDashboardScreen | BackButton |

### Cleanup Actions

- **Welcome Screen:** Removed (4 source + 2 test files)
- **EmptyState:** SKIPPED (composition not practical)
- **ErrorDisplay:** Deprecated, delegates to StatusDisplay

### Quality Gates

- **Efficiency Agent:** No issues found
- **Security Agent:** No vulnerabilities
- **Tests:** 4182 passing
