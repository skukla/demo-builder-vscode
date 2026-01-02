# Step 5: Update Entry Point & Verification

## Purpose

Update the main CSS entry point to import the new modular structure, verify all styles load correctly, and clean up any remaining code.

## Prerequisites

- Steps 1-4 complete (all extractions done)

## Implementation Details

### Update index.css

Modify `src/core/ui/styles/index.css` to import the new structure:

```css
/* Core styles */
@import './reset.css';
@import './tokens.css';
@import './vscode-theme.css';

/* Utility classes */
@import './utilities/index.css';

/* Spectrum overrides */
@import './spectrum/index.css';

/* Component styles */
@import './components/index.css';

/* Wizard-specific styles */
@import './wizard.css';
```

### Verify Import Order

The import order is critical for CSS cascade:
1. Reset (normalize browser defaults)
2. Tokens (design tokens/variables)
3. VSCode theme (theme variable mappings)
4. Utilities (low specificity, general purpose)
5. Spectrum (medium specificity, component overrides)
6. Components (high specificity, semantic components)
7. Wizard (highest specificity, page-specific)

### Handle custom-spectrum.css

After all extractions:
- If empty or nearly empty (<100 lines): Delete the file
- If residual styles remain: Review and categorize into appropriate files

### Cleanup Tasks

1. Remove any duplicate class definitions
2. Remove any dead code discovered during migration
3. Verify no orphaned styles in custom-spectrum.css
4. Update any documentation referencing old structure

## Tests to Write First

1. **Import order test**: Verify index.css imports in correct order
2. **Complete import test**: Verify all new CSS files are imported
3. **No custom-spectrum test**: Verify custom-spectrum.css eliminated or minimal
4. **Build test**: Verify webpack compiles successfully
5. **Bundle size test**: Verify bundle size unchanged (±5%)
6. **Full test suite**: Run all existing CSS tests

## Expected Outcome

- index.css updated with new import structure
- custom-spectrum.css eliminated or reduced to <100 lines
- All styles loading correctly in proper cascade order
- Build passes with no regressions
- All existing tests pass

## Acceptance Criteria

- [x] index.css imports new directory structure
- [x] Import order follows CSS cascade requirements
- [x] custom-spectrum.css eliminated or <100 lines (22 lines)
- [x] No orphaned or duplicate styles
- [x] `npm run compile:webview` passes
- [x] All 200+ CSS tests pass (232 tests)
- [x] Bundle size within 5% of original
- [ ] Visual verification passes (wizard, dashboard, projects list)

## Verification Checklist

After completion, manually verify:
- [ ] Wizard loads with correct styling
- [ ] Dashboard displays correctly
- [ ] Projects list renders properly
- [ ] All buttons/forms work as expected
- [ ] No console errors related to CSS

## TDD Completion Notes

**Completed**: 2025-01-01

### Changes Made

1. **index.css Updated**
   - Added imports for utilities, spectrum, and components barrel files
   - Proper cascade order: reset → tokens → vscode-theme → utilities → spectrum → components → wizard

2. **custom-spectrum.css Converted to Stub**
   - Reduced from 2,443 lines to 22 lines
   - Now just re-exports from modular files for backwards compatibility
   - Existing imports in webview entry points continue to work

3. **Tests Updated for Modular Structure**
   - `utilityClasses.test.ts` - Updated to read from modular files
   - `keyframe-deduplication.test.ts` - Updated to check modular locations
   - `deadCssAudit.test.ts` - Updated to verify modular structure
   - `layerDeclarations.test.ts` - Updated to check spectrum/buttons.css
   - `entryPointUpdate.test.ts` - New tests for Step 5 (22 tests)

4. **Animation Classes Added**
   - Added `animate-fade-in` and `animate-pulse` to utilities/layout.css
   - These reference keyframes defined in index.css

5. **@layer overrides Added**
   - CTA button styles in spectrum/buttons.css wrapped in @layer overrides

### Test Coverage

- 232 CSS tests passing across 11 test files
- All tests verify modular structure and content integrity
