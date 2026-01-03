# Full React Aria Migration Plan

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase) - Steps 1-10 complete
- [ ] Efficiency Review
- [ ] Security Review
- [ ] Complete

**Created:** 2026-01-02
**Last Updated:** 2026-01-02

---

## Executive Summary

**Feature:** Full React Aria Migration - Replace React Spectrum with React Aria Components + CSS Modules

**Purpose:** Eliminate 525 !important declarations by migrating from React Spectrum (inline styles) to React Aria Components (unstyled) with CSS Modules, achieving clean @layer architecture

**Approach:** Incremental component-by-component replacement with TDD - primitives first, then interactive, forms, overlays, followed by feature migration

**Complexity:** High (68 files, 25 Spectrum components, 292 UNSAFE_className occurrences)

**Estimated Timeline:** 50-70 hours across 10 implementation steps

**Step-by-Step Breakdown:**

| Step | Name | Hours | Cumulative |
|------|------|-------|------------|
| 1 | Install React Aria & Infrastructure | 1-2h | 1-2h |
| 2 | Create Primitive Replacements | 4-6h | 5-8h |
| 3 | Create Interactive Components | 4-6h | 9-14h |
| 4 | Create Form Components (+Checkbox, Select, ProgressBar) | 8-12h | 17-26h |
| 5 | Create Overlay Components | 6-8h | 23-34h |
| 6 | Migrate Core/Shared UIs | 8-10h | 31-44h |
| 7 | Migrate Feature UIs | 10-14h | 41-58h |
| 8 | Complete Wizard Migration | 6-8h | 47-66h |
| 9 | Remove Spectrum & Cleanup | 2-3h | 49-69h |
| 10 | Validate & Document | 2-3h | 51-72h |

**Component-to-Step Mapping (25 Spectrum Components):**

| # | Spectrum Component | React Aria Replacement | Step | Category |
|---|-------------------|------------------------|------|----------|
| 1 | Text | AriaText | 2 | Primitives |
| 2 | Heading | AriaHeading | 2 | Primitives |
| 3 | Flex | AriaFlex | 2 | Primitives |
| 4 | View | AriaView | 2 | Primitives |
| 5 | Divider | AriaDivider | 2 | Primitives |
| 6 | Button | AriaButton | 3 | Interactive |
| 7 | ActionButton | AriaActionButton | 3 | Interactive |
| 8 | ProgressCircle | AriaProgressCircle | 3 | Interactive |
| 9 | TextField | AriaTextField | 4 | Forms |
| 10 | SearchField | AriaSearchField | 4 | Forms |
| 11 | Checkbox | AriaCheckbox | 4 | Forms |
| 12 | Picker/Select | AriaSelect | 4 | Forms |
| 13 | ProgressBar | AriaProgressBar | 4 | Forms |
| 14 | Dialog | AriaDialog | 5 | Overlays |
| 15 | DialogTrigger | AriaDialogTrigger | 5 | Overlays |
| 16 | AlertDialog | AriaAlertDialog | 5 | Overlays |
| 17 | Menu | AriaMenu | 5 | Overlays |
| 18 | MenuTrigger | AriaMenuTrigger | 5 | Overlays |
| 19 | Provider | CSS Variables | 6 | Migration |
| 20 | defaultTheme | CSS Variables | 6 | Migration |
| 21 | Well | CSS class | 6 | Migration |
| 22 | Content | CSS class | 6 | Migration |
| 23 | Header | CSS class | 6 | Migration |
| 24 | Footer | CSS class | 6 | Migration |
| 25 | Item (Menu/Picker) | React Aria Item | 5/6 | Migration |

**Note:** Components 19-24 are layout/theming containers that become pure CSS classes (no React component needed).

**Key Risks:**
- Breaking existing UI functionality during migration
- Accessibility regression (Spectrum provides ARIA out-of-box)
- Styling inconsistency during transition period

---

## Research References

**Research Document:** `.rptc/research/css-architecture-audit/research.md`

**Key Findings:**
- 525 !important declarations stem from React Spectrum's inline style injection
- CSS @layer cannot override inline styles (CSS specification limitation)
- 4 existing CSS Modules have zero !important (proven pattern)
- React Aria provides same accessibility as Spectrum but unstyled

**Relevant Patterns:**
- Existing CSS Modules: `prerequisites.module.css`, `project-creation.module.css`, `projects-dashboard.module.css`, `connect-services.module.css`
- @layer cascade transition:
  - **Before (5 layers):** `reset, vscode-theme, spectrum, components, utilities`
  - **After (4 layers):** `reset, vscode-theme, components, utilities`
  - **Change:** Remove `spectrum` layer after @adobe/react-spectrum removed (Step 9)

---

## Test Strategy

**Framework:** Jest + @testing-library/react
**Coverage Goals:** 80%+ for new components, 100% for accessibility
**Test Distribution:** Unit (70%), Integration (25%), Accessibility (5%)

**Test Scenarios Summary:**
- Component rendering and props
- ARIA attribute verification (accessibility parity)
- Keyboard navigation (Tab, Enter, Escape)
- Visual state changes (hover, focus, active, disabled)
- Integration with existing wizard flow

**Note:** Detailed test scenarios in step files (step-01.md through step-10.md)

---

## Acceptance Criteria

**Definition of Done for this feature:**

- [ ] Zero !important declarations in new CSS Modules
- [ ] All 25 Spectrum components replaced with React Aria equivalents
- [ ] All existing tests passing (no regressions)
- [ ] Accessibility parity with Spectrum (ARIA attributes, keyboard nav)
- [ ] CLAUDE.md updated with new CSS architecture
- [ ] @adobe/react-spectrum removed from package.json
- [ ] 292 UNSAFE_className occurrences eliminated
- [ ] @layer architecture maintained (no cascade conflicts)

---

## Risk Assessment

| Risk | Category | Likelihood | Impact | Mitigation | Contingency |
|------|----------|------------|--------|------------|-------------|
| UI breaks during migration | Technical | Medium | High | Incremental TDD, one component at a time | Rollback individual components |
| Accessibility regression | Compliance | Low | High | ARIA tests per component, React Aria has built-in a11y | Consult Spectrum source for ARIA patterns |
| Styling inconsistency | UX | Medium | Medium | CSS Module conventions, design tokens from Spectrum | Visual review per step |
| Extended timeline | Schedule | Medium | Medium | 10-step breakdown, clear scope per step | Prioritize critical paths (Button, TextField) |
| Wizard flow disruption | Technical | Low | High | Integration tests after each step | Feature flag to switch components |

---

## Dependencies

**New Packages:**
- [ ] `react-aria-components` - Adobe's unstyled accessible component library

**Packages to Remove (Step 9):**
- [ ] `@adobe/react-spectrum` - Current component library

**Configuration Changes:**
- webpack.config.js - CSS Modules already configured (no changes expected)
- tsconfig.json - No changes expected

**External Services:** None

---

## File Reference Map

**Existing Files to Modify:**
- 68 source files with Spectrum imports (gradual migration)
- `src/core/ui/styles/` - Update @layer imports
- `package.json` - Add react-aria, remove spectrum (Step 9)
- `CLAUDE.md` - Update CSS architecture docs (Step 10)

**New Files to Create:**
- `src/core/ui/components/aria/` - React Aria wrapper components (root)
- `src/core/ui/components/aria/primitives/` - Text, Heading, Flex, View, Divider
- `src/core/ui/components/aria/primitives/*.module.css`
- `src/core/ui/components/aria/interactive/` - Button, ActionButton, ProgressCircle
- `src/core/ui/components/aria/interactive/*.module.css`
- `src/core/ui/components/aria/forms/` - TextField, SearchField, Checkbox, Select, ProgressBar
- `src/core/ui/components/aria/forms/*.module.css`
- `src/core/ui/components/aria/overlays/` - Dialog, Menu
- `src/core/ui/components/aria/overlays/*.module.css`

---

## Branch Strategy

**Implementation Branch:** `refactor/react-aria-implementation`

**Merge Path (sequential):**
```
refactor/react-aria-implementation  (current - TDD implementation here)
         │
         ▼
    refactor/css                    (CSS architecture consolidation)
         │
         ▼
    wip-architecture                (main architecture refactor branch)
```

**Merge Instructions:**

1. **After Step 10 complete** (all tests passing, reviews done):
   ```bash
   git checkout refactor/css
   git merge refactor/react-aria-implementation
   # Resolve any conflicts (expect CSS @layer changes)
   npm run test:fast  # Verify merge
   ```

2. **After CSS branch verified**:
   ```bash
   git checkout wip-architecture
   git merge refactor/css
   # Resolve any conflicts
   npm run test:fast  # Verify merge
   ```

**Conflict Expectations:**
- `src/core/ui/styles/` - @layer declarations may conflict
- `package.json` - dependency changes need manual merge
- `CLAUDE.md` - CSS architecture docs need consolidation

---

## Coordination Notes

**Step Dependencies:**
- Step 1 must complete first (infrastructure setup)
- Steps 3-4 can be parallelized AFTER Step 2 (both use spectrumTokens.ts from Step 2)
- Step 5 depends on Steps 2 AND 3 (uses Divider from 2, Button from 3)
- Steps 6-8 depend on Steps 1-5 (all components must exist)
- Step 9 depends on Steps 6-8 (all migrations complete)
- Step 10 depends on Step 9 (cleanup complete)

**Integration Points:**
- Core UI components used across all features
- Wizard steps must maintain state/navigation
- Provider components (defaultTheme) replaced with CSS variables

**Migration Order (by usage frequency):**
1. Button, ActionButton (most common)
2. Text, Heading, Flex, View (layout primitives)
3. TextField, SearchField (forms)
4. Dialog, Menu (overlays)
5. ProgressCircle, Divider (feedback/structure)

---

## Implementation Constraints

- **File Size:** All implementation files <500 lines
- **Complexity:** <50 lines/function, <10 cyclomatic complexity
- **Simplicity:** No abstractions until pattern appears 3+ times (Rule of Three)
- **Testing:** Minimum 80% coverage for new components
- **Accessibility:** All components must maintain ARIA parity with Spectrum
- **CSS:** Zero !important in new CSS Modules (use @layer cascade)

---

## Configuration

**Efficiency Review:** enabled
**Security Review:** enabled

---

## Next Actions

1. Begin with Step 1: Install React Aria and Infrastructure
2. Run: `/rptc:tdd "@full-react-aria-migration/"`
3. After Step 10 complete: Merge `refactor/react-aria-implementation` → `refactor/css`
4. After CSS verified: Merge `refactor/css` → `wip-architecture`

---

*Plan created by Master Feature Planner*
*Status: Ready for TDD Implementation*
