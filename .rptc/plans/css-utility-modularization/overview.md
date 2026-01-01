# CSS Utility Modularization

## Status
- [x] Planned
- [ ] In Progress
- [ ] Complete

**Created:** 2026-01-01
**Priority:** Medium
**Estimated Effort:** 2-3 hours

## Executive Summary

**Feature:** Break up the monolithic `custom-spectrum.css` (2,444 lines) into categorized, focused files.

**Purpose:** Improve maintainability and navigability of the global CSS by organizing utilities and components into logical modules, following the same modular pattern established for feature CSS.

**Context:** This plan was identified during the CSS Architecture Improvement project. The current architecture scores 9.2/10, and this improvement would address the remaining organizational debt in the largest CSS file.

## Current State

```
src/core/ui/styles/
├── index.css              174 lines  ✓ Clean
├── reset.css               76 lines  ✓ Clean
├── tokens.css             166 lines  ✓ Clean
├── vscode-theme.css       177 lines  ✓ Clean
├── wizard.css             282 lines  ✓ Clean
└── custom-spectrum.css  2,444 lines  ⚠️ Monolithic
```

**Problem:** `custom-spectrum.css` contains 74% of all global CSS in a single file, making it difficult to:
- Find specific styles quickly
- Understand the scope of changes
- Maintain separation of concerns

## Proposed Structure

```
src/core/ui/styles/
├── index.css                 (entry point - imports all)
├── reset.css                 (unchanged)
├── tokens.css                (unchanged)
├── vscode-theme.css          (unchanged)
├── wizard.css                (unchanged)
│
├── utilities/                (NEW - extracted from custom-spectrum)
│   ├── index.css             (barrel import)
│   ├── typography.css        ~150 lines - text sizes, weights, alignment
│   ├── colors.css            ~100 lines - text/background colors
│   ├── layout.css            ~200 lines - flexbox, grid, display, dimensions
│   ├── spacing.css           ~150 lines - padding, margin utilities
│   └── borders.css           ~80 lines  - borders, radius, shadows
│
├── spectrum/                 (NEW - Spectrum component overrides)
│   ├── index.css             (barrel import)
│   ├── buttons.css           ~200 lines - button variants, CTA styling
│   └── components.css        ~300 lines - TextField, Picker, Badge, etc.
│
└── components/               (NEW - semantic component styles)
    ├── index.css             (barrel import)
    ├── cards.css             ~300 lines - card variants, project cards
    ├── timeline.css          ~150 lines - timeline navigation, steps
    ├── dashboard.css         ~200 lines - dashboard grid, actions
    └── common.css            ~400 lines - containers, empty states, misc
```

## Implementation Steps

### Step 1: Create Directory Structure
- Create `utilities/`, `spectrum/`, `components/` directories
- Create barrel `index.css` files for each directory

### Step 2: Extract Typography Utilities
- Move text-xs through text-5xl classes
- Move font-weight utilities
- Move text-alignment utilities
- Update imports

### Step 3: Extract Color Utilities
- Move text-* color classes
- Move bg-* background classes
- Verify Spectrum variable usage

### Step 4: Extract Layout Utilities
- Move flexbox utilities (flex, flex-column, items-center, etc.)
- Move grid utilities
- Move display utilities
- Move dimension utilities (w-*, h-*, min-*, max-*)

### Step 5: Extract Spacing Utilities
- Move padding utilities (p-*, px-*, py-*, pt-*, etc.)
- Move margin utilities (m-*, mx-*, my-*, mt-*, etc.)
- Move gap utilities

### Step 6: Extract Border Utilities
- Move border utilities
- Move border-radius utilities
- Move shadow utilities

### Step 7: Extract Spectrum Button Overrides
- Move button size variants
- Move CTA button styling
- Move button state overrides

### Step 8: Extract Spectrum Component Overrides
- Move TextField overrides
- Move Picker overrides
- Move Badge overrides
- Move other Spectrum component overrides

### Step 9: Extract Card Styles
- Move card container classes
- Move project card variants
- Move template card styles

### Step 10: Extract Timeline Styles
- Move timeline navigation
- Move step indicator styles
- Move timeline animations

### Step 11: Extract Dashboard Styles
- Move dashboard grid
- Move action button styles
- Move status header styles

### Step 12: Consolidate Remaining Styles
- Move remaining component styles to common.css
- Verify nothing is orphaned
- Remove empty custom-spectrum.css

### Step 13: Update Entry Point
- Update index.css to import new structure
- Verify correct import order
- Test build

### Step 14: Verification & Cleanup
- Run full test suite
- Visual verification of all screens
- Remove any dead code discovered during migration

## Test Strategy

**Approach:** This is a refactoring with no behavior changes. Tests verify structure and build integrity.

1. **Build Verification:** `npm run compile:webview` must pass
2. **Existing CSS Tests:** All 200+ CSS tests must pass
3. **Visual Verification:** Manual check of wizard, dashboard, projects list
4. **Import Verification:** New test to verify all CSS files are imported

## Acceptance Criteria

- [ ] custom-spectrum.css eliminated or reduced to <100 lines
- [ ] All utilities organized into focused files (<300 lines each)
- [ ] All Spectrum overrides in dedicated spectrum/ directory
- [ ] All component styles in dedicated components/ directory
- [ ] Barrel imports provide clean entry points
- [ ] Build passes with no warnings
- [ ] All existing tests pass
- [ ] No visual regressions

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CSS specificity changes | Low | Medium | Maintain same selector specificity |
| Import order issues | Medium | Low | Test @layer cascade behavior |
| Missed class during extraction | Low | Low | Grep verification for each class |
| Build configuration issues | Low | Medium | Test incrementally |

## Dependencies

- Requires CSS Architecture Improvement to be complete (DONE)
- No external dependencies
- No new packages needed

## Notes

- This is a purely organizational refactoring
- No new CSS classes or functionality
- Follows established patterns from feature CSS Modules
- Can be done incrementally if needed (one category at a time)

## When to Execute

**Recommended timing:**
- During a maintenance sprint
- When next touching global CSS significantly
- Before adding substantial new global styles

**Not urgent because:**
- Current architecture works correctly
- 9.2/10 health score already achieved
- This is optimization, not bug fixing
