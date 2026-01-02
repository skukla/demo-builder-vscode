# Step 6: Remove !important from Utility Classes

## Purpose

Now that utilities are wrapped in `@layer utilities` (the highest-priority layer), they naturally override all lower layers (spectrum, components, theme, reset) through CSS cascade. The `!important` declarations are no longer needed for utilities to win specificity battles against Spectrum defaults.

Removing `!important` improves:
- **Maintainability**: Developers can override utilities when needed
- **Predictability**: Standard cascade rules apply
- **Code quality**: ~213 fewer `!important` declarations

---

## Prerequisites

- [x] Step 1: @layer declaration updated to 5-layer hierarchy (REQUIRED)
- [x] Step 2: Layer name migrations complete (REQUIRED)
- [x] Step 3: All utilities/*.css files wrapped in `@layer utilities` (CRITICAL - BLOCKING)

**Why Step 3 is critical (BLOCKING):** Without the `@layer utilities` wrapper, removing `!important` would cause utilities to lose to Spectrum's higher-specificity selectors. This step CANNOT proceed without Step 3 complete.

---

## Tests to Write First

- [ ] **Test: Utility classes no longer contain !important**
  - **Given:** All 6 utility CSS files in `src/core/ui/styles/utilities/`
  - **When:** Scanning file contents for ` !important` pattern
  - **Then:** Zero matches found (excluding comments)
  - **File:** `tests/core/ui/styles/utilityImportantRemoval.test.ts`

- [ ] **Test: Utility class property definitions remain intact**
  - **Given:** Utility classes after !important removal
  - **When:** Checking CSS property values
  - **Then:** All property values unchanged (only ` !important` suffix removed)
  - **File:** `tests/core/ui/styles/utilityClasses.test.ts` (existing, verify still passes)

---

## Files to Modify

| File | !important Count | Action |
|------|-----------------|--------|
| `src/core/ui/styles/utilities/animations.css` | 1 | Remove ` !important` |
| `src/core/ui/styles/utilities/borders.css` | 12 | Remove ` !important` |
| `src/core/ui/styles/utilities/colors.css` | 29 | Remove ` !important` |
| `src/core/ui/styles/utilities/layout.css` | ~95 | Remove ` !important` |
| `src/core/ui/styles/utilities/spacing.css` | ~45 | Remove ` !important` |
| `src/core/ui/styles/utilities/typography.css` | ~45 | Remove ` !important` |

**Total: ~227 !important declarations to remove**

---

## Implementation Details

### RED Phase

Create test file `tests/core/ui/styles/utilityImportantRemoval.test.ts`:

```typescript
describe('Utility !important Removal', () => {
  const utilityFiles = [
    'animations.css', 'borders.css', 'colors.css',
    'layout.css', 'spacing.css', 'typography.css'
  ];

  it('should have zero !important declarations in utility files', () => {
    utilityFiles.forEach(file => {
      const content = readFileSync(join(stylesDir, 'utilities', file), 'utf-8');
      const matches = content.match(/!important/g) || [];
      expect(matches.length).toBe(0);
    });
  });
});
```

### GREEN Phase

For each utility file, perform find-and-replace:
- **Find:** ` !important`
- **Replace:** (empty string)

Order: animations.css, borders.css, colors.css, layout.css, spacing.css, typography.css

### REFACTOR Phase

- Verify existing `utilityClasses.test.ts` still passes (property values unchanged)
- Run visual smoke test on wizard webview

---

## Expected Outcome

- Zero `!important` declarations in utility CSS files
- Utility classes still override Spectrum defaults (via layer cascade)
- All existing utility class tests pass
- No visual regressions in webviews

---

## Acceptance Criteria

- [ ] All 6 utility files have zero `!important` declarations
- [ ] New test `utilityImportantRemoval.test.ts` passes
- [ ] Existing `utilityClasses.test.ts` tests pass
- [ ] Wizard webview renders correctly (manual verification)

---

## Dependencies from Other Steps

| Dependency | Step | Status |
|------------|------|--------|
| @layer utilities wrapper | Step 3 | Required (BLOCKING) |
| 5-layer declaration | Step 1 | Required |

---

## Estimated Time

30-45 minutes (bulk find-replace operation + testing)
