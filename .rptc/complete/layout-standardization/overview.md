# Implementation Plan: Layout Component Standardization

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [x] Efficiency Review
- [x] Security Review (N/A - disabled for UI refactoring)
- [x] Complete

**Created:** 2025-10-30
**Last Updated:** 2025-10-30
**Completed:** 2025-10-30
**Steps:** 10 total steps (8 implementation + 1 validation + 1 documentation)

---

## Configuration

### Quality Gates

**Efficiency Review**: enabled
**Security Review**: disabled

**Note**: Security review disabled as this is a UI refactoring with no security implications.

---

## Executive Summary

**Feature:** Add Spectrum design token translation to custom layout components and eliminate duplicate two-column implementations across 5 views

**Purpose:** Fix broken button spacing (gap="size-300" → 0px) and reduce ~200 lines of duplicate code through reusable TwoColumnLayout component

**Approach:** Create type-safe token translation utility, enhance 2 existing layout components (GridLayout, TwoColumnLayout), migrate 5 views incrementally with visual validation checkpoints

**Estimated Complexity:** Medium

**Estimated Timeline:** 6-8 hours

**Key Risks:** Visual regression during migrations (mitigated by incremental steps with manual checks), type safety enforcement without breaking existing code

---

## Test Strategy

### Testing Approach

- **Framework:** Vitest (component tests), TypeScript compiler (type safety)
- **Coverage Goal:** 85% overall, 100% token translation logic
- **Test Distribution:** Unit (60%), Component (35%), Visual Checks (5%)

### Test Scenarios Summary

**Happy Path:** Valid Spectrum tokens (size-100, size-300) correctly translated to pixel values, components render with correct spacing

**Edge Cases:** Edge tokens (size-50, size-6000), mixed token types (px + size-*), undefined/null values, responsive layout breakpoints

**Error Conditions:** Invalid token strings compile-time caught by TypeScript, runtime fallbacks for legacy code paths

**Detailed test scenarios are in each step file** (step-01.md through step-10.md)

### Coverage Goals

**Overall Target:** 85%

**Component Breakdown:**

- `spectrumTokens.ts`: 100% (critical translation logic)
- `GridLayout.tsx`: 90% (enhanced with token support)
- `TwoColumnLayout.tsx`: 90% (enhanced with token support)
- Migration files: 80% (standard coverage)

---

## Acceptance Criteria

**Definition of Done for this feature:**

- [ ] **Functionality:** WelcomeScreen button spacing fixed (gap="size-300" renders correctly)
- [ ] **Testing:** All tests passing (unit + component)
- [ ] **Coverage:** Overall coverage ≥ 85%, token logic 100%
- [ ] **Code Quality:** TypeScript strict mode passes, no runtime warnings
- [ ] **Type Safety:** DimensionValue type enforces token usage (compile-time errors for invalid strings)
- [ ] **Code Reduction:** ~200 lines duplicate code eliminated via TwoColumnLayout reuse
- [ ] **Visual Validation:** All 5 migrated views manually verified (no visual regressions)

**Feature-Specific Criteria:**

- [ ] Only size-* tokens actually used in codebase supported (YAGNI principle)
- [ ] Token translation utility located at webview-ui/src/shared/utils/spectrumTokens.ts
- [ ] All 7 layout props support Spectrum tokens: gap, padding, leftPadding, rightPadding, maxWidth, leftMaxWidth, columns
- [ ] Backward compatibility maintained (existing px/number values still work)
- [ ] Zero runtime warnings in browser console

---

## Risk Assessment

### Risk 1: Visual Regression in Migrated Views

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Medium
- **Priority:** High
- **Description:** Replacing manual two-column implementations with TwoColumnLayout component may introduce subtle spacing/alignment differences
- **Mitigation:**
  1. Incremental migration (one view per step, not batch)
  2. Manual visual checks after each migration step
  3. Side-by-side comparison screenshots
  4. Component tests verify layout structure
- **Contingency Plan:** Rollback individual migration if visual regression detected, adjust TwoColumnLayout props to match original implementation

### Risk 2: Type Safety Breaking Existing Code

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Medium
- **Priority:** Medium
- **Description:** Enforcing DimensionValue type may break existing code passing arbitrary string values
- **Mitigation:**
  1. Union type includes backward-compatible options: `SpectrumSizeToken | '${number}px' | number`
  2. TypeScript catches issues at compile-time (not runtime failures)
  3. Comprehensive grep for existing usage patterns before implementation
- **Contingency Plan:** Widen DimensionValue type temporarily if needed, add TODO for proper migration

### Risk 3: Incomplete Token Coverage

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Low
- **Priority:** Low
- **Description:** Future code may use Spectrum tokens not in initial mapping (13 tokens supported currently)
- **Mitigation:**
  1. Token mapping based on actual codebase usage (grep research phase)
  2. Type system makes adding new tokens trivial (single source of truth)
  3. Documentation explains how to extend token mapping
- **Contingency Plan:** Add new tokens on-demand, update type union and translation map

---

## Dependencies

### New Packages to Install

**None** - Feature uses existing project dependencies (TypeScript, React, Adobe Spectrum)

### Configuration Changes

**None** - No configuration changes required

### External Service Integrations

**None** - Self-contained UI refactoring

---

## File Reference Map

### Existing Files (To Modify)

**Layout Components (Enhanced with Token Support):**
- `webview-ui/src/shared/components/layout/GridLayout.tsx` - Add token translation for gap, padding props
- `webview-ui/src/shared/components/layout/TwoColumnLayout.tsx` - Add token translation for 6 props (gap, leftPadding, rightPadding, leftMaxWidth, etc.)

**Views with Duplicate Two-Column Code (Migrate to TwoColumnLayout):**
- `webview-ui/src/wizard/steps/ComponentSelectionStep.tsx` - Replace manual two-column div structure
- `webview-ui/src/configure/ConfigureScreen.tsx` - Replace manual two-column div structure
- `webview-ui/src/dashboard/ProjectDashboardScreen.tsx` - Replace manual two-column div structure
- `webview-ui/src/wizard/steps/AdobeProjectStep.tsx` - Replace manual two-column div structure
- `webview-ui/src/wizard/steps/AdobeWorkspaceStep.tsx` - Replace manual two-column div structure

**Bug Fix Target:**
- `webview-ui/src/welcome/WelcomeScreen.tsx` - Change gap="size-300" usage to use token-aware GridLayout

### New Files (To Create)

**Token Translation Utility:**
- `webview-ui/src/shared/utils/spectrumTokens.ts` - Token mapping and DimensionValue type
- `webview-ui/src/shared/utils/spectrumTokens.test.ts` - Unit tests for token translation

**Component Tests:**
- `webview-ui/src/shared/components/layout/GridLayout.test.tsx` - Component tests for enhanced GridLayout
- `webview-ui/src/shared/components/layout/TwoColumnLayout.test.tsx` - Component tests for enhanced TwoColumnLayout

**Total Files:** 10 modified, 4 created

---

## Coordination Notes

**Step Dependencies:**

- Steps 2-3 depend on Step 1 (spectrumTokens.ts utility must exist first)
- Steps 4-8 depend on Step 3 (TwoColumnLayout must support tokens before migrations)
- Step 9 depends on Step 2 (GridLayout must support tokens before WelcomeScreen fix validation)
- Step 10 depends on Steps 1-9 (documentation after all implementation complete)

**Integration Points:**

- spectrumTokens.ts exports `translateSpectrumToken()` and `DimensionValue` type used by all layout components
- TwoColumnLayout component reused across 5 views (replaces ~40 lines duplicate code per view)
- GridLayout and TwoColumnLayout maintain backward compatibility (existing px/number values unchanged)

**Critical Path:**

Step 1 (utility) → Step 2 (GridLayout) & Step 3 (TwoColumnLayout) → Steps 4-8 (migrations can run in parallel, but sequential for validation) & Step 9 (WelcomeScreen validation) → Step 10 (documentation)

---

## Next Actions

**After Plan Approval:**

1. **For PM:** Review and approve plan
2. **For Developer:** Execute with `/rptc:tdd "@layout-standardization"`
3. **Quality Gates:** Efficiency Agent review (after all steps complete)
4. **Completion:** Verify all acceptance criteria met

**First Step:** Run `/rptc:tdd "@layout-standardization"` to begin TDD implementation

---

_Plan overview created by Master Feature Planner_
_Detailed steps in: step-01.md, step-02.md, ..., step-10.md_
