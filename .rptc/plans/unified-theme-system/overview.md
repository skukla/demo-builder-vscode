# Implementation Plan: Unified Theme System

## Status Tracking

- [x] Planned
- [ ] In Progress (TDD Phase)
- [ ] Efficiency Review
- [ ] Security Review
- [ ] Complete

**Created:** 2025-12-05
**Research:** `.rptc/research/unified-theme-system/research.md`

---

## Executive Summary

**Feature:** CSS-based unified theme system layered on Adobe Spectrum

**Purpose:** Override VS Code user themes to ensure consistent extension appearance across all VS Code theme settings (light, dark, high-contrast)

**Approach:** Three-tier CSS token architecture (Primitives, Semantic, Component) using @layer cascade with full theme isolation via CSS reset

**Complexity:** Medium (7 steps, ~2500 lines CSS affected, 5 components)

**Key Risks:** Spectrum token conflicts, CSS cascade ordering, incomplete hard-coded value migration

---

## Test Strategy

**Framework:** Manual visual testing + Unit tests (token validation)
**Coverage Goal:** 100% visual consistency across VS Code themes

**Test Scenarios Summary:**
- Happy Path: Extension renders correctly in VS Code dark theme
- Edge Cases: Light theme, high-contrast themes, custom themes
- Error Conditions: Missing token fallbacks, Spectrum provider misconfiguration

**See individual step files for detailed test specifications.**

---

## Implementation Constraints

- File Size: <500 lines per CSS file
- Complexity: Semantic tokens reference primitives only (no deep nesting)
- Dependencies: Layer on existing Spectrum tokens, no new npm packages
- Platforms: VS Code webview (Chromium-based)
- Performance: No runtime theme calculation overhead

---

## Acceptance Criteria

- [ ] Extension appearance identical in light, dark, and high-contrast VS Code themes
- [ ] All 50+ hard-coded color values replaced with semantic CSS variables
- [ ] CTA buttons use tangerine brand color consistently
- [ ] No `!important` declarations except in reset layer
- [ ] Spectrum Provider locked to dark colorScheme
- [ ] Zero visual regressions from current dark theme appearance

---

## Risk Assessment

### Risk 1: Spectrum Token Conflicts
- **Likelihood:** Medium | **Impact:** High
- **Mitigation:** Use `--db-` namespace prefix for all custom tokens
- **Contingency:** Increase specificity or use @layer ordering

### Risk 2: CSS Cascade Order Breaks
- **Likelihood:** Medium | **Impact:** Medium
- **Mitigation:** Explicit @layer declaration at top of entry CSS
- **Contingency:** Consolidate to single CSS file if needed

### Risk 3: Incomplete Hard-Coded Migration
- **Likelihood:** High | **Impact:** Low
- **Mitigation:** Grep audit before completion, visual regression testing
- **Contingency:** Address in follow-up PR

---

## Dependencies

**New Packages:** None required
**Configuration Changes:** None (CSS-only changes)

---

## File Reference Map

### New Files to Create
- `src/core/ui/styles/tokens.css` - Three-tier design token definitions
- `src/core/ui/styles/reset.css` - VS Code default style neutralization

### Existing Files to Modify
- `src/core/ui/styles/index.css` - Add @layer declarations
- `src/core/ui/styles/custom-spectrum.css` - Wrap CTA overrides in @layer, replace hard-coded colors
- `src/core/ui/styles/wizard.css` - Replace hard-coded badge colors
- `src/core/ui/components/ui/StatusDot.tsx` - Use semantic CSS variables
- `src/core/ui/components/ui/Badge.tsx` - Use semantic CSS variables
- `src/core/ui/components/ui/NumberedInstructions.tsx` - Use semantic CSS variables
- `src/core/ui/components/ui/Tip.tsx` - Use semantic CSS variables
- `src/core/ui/components/feedback/LoadingOverlay.tsx` - Use semantic CSS variables
- WebviewApp.tsx - Lock Spectrum Provider to dark colorScheme

---

## Coordination Notes

**Step Dependencies:**
- Steps 1 and 2 can run in parallel (tokens.css, reset.css are independent)
- Step 3 (@layer declarations) requires Steps 1-2 complete
- Steps 4-5 require Step 3 complete
- Step 6 (Spectrum Provider) independent of CSS steps
- Step 7 (verification) requires all other steps complete

**Integration Points:**
- tokens.css and reset.css imported in index.css
- @layer declaration in index.css controls cascade order (not import order)
- Spectrum Provider change in WebviewApp.tsx

---

## Next Actions

1. Execute `/rptc:tdd "@unified-theme-system/"` to begin TDD implementation
2. Start with Step 1: Create tokens.css with three-tier architecture
3. Quality gates: Efficiency Agent, Security Agent after implementation

---

_Plan created by Overview Generator Sub-Agent_
_Status: Ready for Step Generation_
