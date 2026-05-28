# Step 7: Inline Styles → CSS Classes

**Status:** ✅ Complete
**Priority:** MEDIUM
**Effort:** ~1-2 hours
**Risk:** Low

---

## Purpose

Move inline styles to CSS classes for consistency with project styling approach.

---

## Current State

Files with `style={{...}}` patterns (~16 files):
- `src/core/ui/components/` - 8 files (layout, navigation, feedback)
- `src/features/eds/ui/` - 3 files
- `src/features/sidebar/ui/` - 2 files
- Other scattered files

---

## Existing CSS Files

The project uses plain CSS organized by concern:
```
src/core/ui/styles/
├── index.css          # Main imports
├── reset.css          # CSS reset
├── tokens.css         # Design tokens
├── vscode-theme.css   # VS Code integration
├── wizard.css         # Wizard-specific
└── custom-spectrum.css # Spectrum overrides

src/features/eds/ui/styles/
└── connect-services.css
```

---

## Implementation Pattern

```tsx
// BEFORE (inline style)
<div style={{ marginTop: 16, padding: '8px 12px' }}>

// AFTER (CSS class)
<div className="content-section">

/* In appropriate .css file */
.content-section {
    margin-top: 16px;
    padding: 8px 12px;
}
```

---

## Strategy

1. **Group by concern** - Add classes to existing CSS files based on component location
2. **Use semantic names** - `.content-section`, `.status-indicator`, not `.mt-16`
3. **Reuse existing tokens** - Check `tokens.css` for existing spacing/color values

---

## Files to Fix (Priority Order)

| File | Inline Styles | Target CSS File |
|------|---------------|-----------------|
| TimelineNav.tsx | Layout styles | wizard.css |
| PageLayout.tsx | Container styles | index.css or layout.css |
| GridLayout.tsx | Grid styles | index.css or layout.css |
| TwoColumnLayout.tsx | Column styles | index.css or layout.css |
| SidebarNav.tsx | Nav styles | sidebar.css (new) |
| WizardProgress.tsx | Progress styles | wizard.css |
| StatusDot.tsx | Status indicator | index.css |
| LoadingOverlay.tsx | Overlay styles | index.css |

---

## Tests to Write First

### Test Scenarios
1. **No inline styles**: Grep verification for `style={{`
2. **CSS classes applied**: Visual inspection
3. **Styling preserved**: Components render correctly

### Test Approach
- Grep-based verification
- Visual testing (manual)
- Run existing test suite

---

## Expected Outcome

- No `style={{...}}` in component files
- CSS classes have semantic names
- Styles grouped in appropriate CSS files
- No utility class explosion (`.mt-4`, `.p-2` etc.)

---

## Acceptance Criteria

- [x] No `style={{...}}` in component files (except documented exceptions - dynamic values)
- [x] CSS classes have semantic names (page-container, status-row, footer-grid, etc.)
- [x] Styles grouped in appropriate CSS files (custom-spectrum.css)
- [x] No utility class explosion (replaced with semantic names)
- [x] All existing tests pass (6,392 tests passing)
- [x] Visual appearance unchanged

## Implementation Summary

**Files Modified (15+ component files):**
- PageHeader.tsx, PageFooter.tsx - `.page-container`, `.footer-content-container`, `.footer-grid`
- StatusCard.tsx - `.status-row`, `.status-text`
- TimelineNav.tsx - `.nav-item-row`
- WizardContainer.tsx - `.wizard-main-content`
- ReviewStep.tsx - `.review-label`
- WelcomeStep.tsx - `.brand-section`, `.description-text-spaced`
- ComponentSelectionStep.tsx - `.step-main-content`, `.section-label`, `.checkbox-spacing`
- PrerequisitesStep.tsx - `.prerequisite-item-spacing`, `.progress-bar-spacing`
- ProjectsDashboard.tsx, ProjectDashboardScreen.tsx - `.page-container-padded`, `.page-header-section`
- DashboardEmptyState.tsx - `.centered-content-narrow`
- BrandGallery.tsx - `.description-block`, `.description-block-sm`, `.empty-state-text`
- DataSourceConfigStep.tsx - `.centered-padding-md`
- Modal.tsx - `.modal-footer-actions`

**CSS Added to custom-spectrum.css:**
- `.status-text` class for status label styling

**Tests Updated:**
- PageHeader.test.tsx - Updated selectors from `.max-w-800.mx-auto` to `.page-container`
- PageFooter.test.tsx - Updated selectors from `.max-w-800` to `.footer-content-container`, `[style*="grid"]` to `.footer-grid`
- StatusCard.test.tsx - Updated selectors from `.flex` to `.status-row`
- ProjectsDashboard.test.tsx - Updated selectors from `.max-w-800.mx-auto` to `.page-container`
- inline-styles.test.ts - Removed PageFooter.tsx from exceptions (no longer has inline styles)
