# Step 7: Visual Regression Testing

## Purpose
Verify all 4 webviews render correctly after CSS layer restructuring and !important removal.

## Prerequisites
- [x] Step 1 complete: @layer declaration updated (REQUIRED)
- [x] Step 2 complete: Layer name migrations done (REQUIRED)
- [x] Step 3 complete: utilities/*.css wrapped (REQUIRED)
- [x] Step 4 complete: spectrum/*.css wrapped (REQUIRED)
- [x] Step 5 complete: components/*.css wrapped (REQUIRED)
- [x] Step 6 complete: !important removed from utilities (REQUIRED)

**All CSS changes MUST be complete before visual testing begins.**

## Automated CSS Integrity Tests

**File:** `tests/core/ui/styles/cssIntegrity.test.ts`

The following automated tests validate CSS architecture integrity:

### All CSS Files Are Readable (3 tests)
- [x] Finds CSS files in styles directory
- [x] Reads all CSS files without errors
- [x] All CSS files have non-empty content

### Index.css Import Validation (7 tests)
- [x] All imported files exist
- [x] Imports reset.css, tokens.css, vscode-theme.css
- [x] Imports utilities, spectrum, components barrels
- [x] Imports wizard.css

### Barrel Import Validation (3 tests)
- [x] utilities/index.css imports all 6 utility files
- [x] spectrum/index.css imports all 2 spectrum files
- [x] components/index.css imports all 4 component files

### CSS Syntax Validation (2 tests)
- [x] All CSS files have balanced braces
- [x] All @layer declarations are properly closed

### CSS File Count Validation (4 tests)
- [x] Exactly 6 utility files
- [x] Exactly 2 spectrum files
- [x] Exactly 4 component files
- [x] Expected root-level CSS files present

### 5-Layer Architecture Verification (3 tests)
- [x] 5-layer cascade declaration in index.css
- [x] Layer declaration before all imports
- [x] Zero !important declarations in utility files

**Total: 23 automated tests - ALL PASSING**

## Manual Testing Checklist

### Wizard Webview
- [ ] All wizard steps render correctly
- [ ] Spectrum buttons, forms, progress indicators styled
- [ ] Utility classes (flex, spacing, colors) apply correctly
- [ ] No layout shifts or missing styles

### Welcome Webview
- [ ] Welcome content displays properly
- [ ] Links and buttons styled correctly

### Dashboard Webview
- [ ] Project cards render with correct spacing
- [ ] Status indicators and icons visible
- [ ] Grid layouts intact

### Configure Webview
- [ ] Form elements styled correctly
- [ ] Configuration panels render properly

### Cross-Cutting Concerns
- [ ] VS Code theme integration (light/dark modes)
- [ ] Typography consistent across views
- [ ] No console CSS warnings

## Implementation Details
1. Build extension: `npm run build`
2. Launch in Extension Development Host (F5)
3. Test each webview systematically
4. Document any regressions found

## Expected Outcome
All webviews render identically to pre-refactor state with no visual regressions.

## Acceptance Criteria
- [ ] All 4 webviews tested manually
- [ ] No visual regressions identified
- [ ] Theme switching works correctly
- [ ] Any issues documented for remediation

## Dependencies from Other Steps
- Step 6: !important removal complete
- All layer restructuring (Steps 1-5) finalized
