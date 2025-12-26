# Step 3: Audit components/layout/ + components/forms/ + components/ui/ + utils/ (9 files)

## Purpose

Audit layout, form, UI primitive, and utility test files to ensure tests accurately reflect current implementations, properly test Spectrum design token integration, and verify utility function behavior.

## Prerequisites

- [ ] Step 1 complete (hooks/ audit)
- [ ] Step 2 complete (navigation/ + feedback/ audit)
- [ ] Tests currently passing: `npm test -- tests/webview-ui/shared/components/layout/ tests/webview-ui/shared/components/forms/ tests/webview-ui/shared/components/ui/ tests/webview-ui/shared/utils/`

---

## Files to Audit

### Layout Component Tests (3 files)

#### File 1: GridLayout.test.tsx

**Test File:** `tests/webview-ui/shared/components/layout/GridLayout.test.tsx`
**Source File:** `src/core/ui/components/layout/GridLayout.tsx`

- [ ] **Audit: Props interface matches implementation**
  - Props: children, columns, gap, maxWidth, padding, className
  - All dimension props accept DimensionValue type
  - Default values: columns=2, gap='size-300'

- [ ] **Audit: Spectrum token translation**
  - size-300 translates to 24px
  - size-6000 translates to 480px
  - size-200 translates to 16px
  - size-400 translates to 32px

- [ ] **Audit: Backward compatibility**
  - Numeric values converted to pixels (16 -> "16px")
  - Pixel strings passed through ("32px" -> "32px")
  - undefined returns default

- [ ] **Audit: Error handling**
  - Invalid tokens passed through unchanged (graceful degradation)
  - Tests use type assertion for invalid token testing

- [ ] **Audit: Grid structure**
  - Grid container has .grid class
  - gridTemplateColumns style matches columns prop
  - Inline styles for dynamic values

- [ ] **Audit: DimensionValue import**
  - Uses `@/core/ui/utils/spectrumTokens` import

#### File 2: SingleColumnLayout.test.tsx

**Test File:** `tests/webview-ui/shared/components/layout/SingleColumnLayout.test.tsx`
**Source File:** `src/core/ui/components/layout/SingleColumnLayout.tsx`

- [ ] **Audit: Props interface**
  - children prop
  - maxWidth, padding props (DimensionValue)
  - className prop

- [ ] **Audit: Layout structure**
  - Single column container
  - Proper max-width application
  - Responsive behavior

- [ ] **Audit: Token support**
  - Same token translation as GridLayout

#### File 3: TwoColumnLayout.test.tsx

**Test File:** `tests/webview-ui/shared/components/layout/TwoColumnLayout.test.tsx`
**Source File:** `src/core/ui/components/layout/TwoColumnLayout.tsx`

- [ ] **Audit: Props interface**
  - left, right children props
  - gap prop (DimensionValue)
  - leftWidth, rightWidth props

- [ ] **Audit: Two-column structure**
  - Both columns rendered
  - Proper width distribution
  - Gap between columns

- [ ] **Audit: Token support**
  - Gap token translation
  - Width token support (if applicable)

---

### Form Component Tests (3 files)

#### File 4: ConfigSection.test.tsx

**Test File:** `tests/webview-ui/shared/components/forms/ConfigSection.test.tsx`
**Source File:** `src/core/ui/components/forms/ConfigSection.tsx`

- [ ] **Audit: Props interface**
  - title prop
  - children prop
  - description prop (if any)
  - collapsible behavior (if any)

- [ ] **Audit: Section rendering**
  - Title/heading display
  - Children content rendered
  - Visual grouping/styling

- [ ] **Audit: Spectrum integration**
  - Heading component usage
  - Divider/separator usage

#### File 5: FieldHelpButton.test.tsx

**Test File:** `tests/webview-ui/shared/components/forms/FieldHelpButton.test.tsx`
**Source File:** `src/core/ui/components/forms/FieldHelpButton.tsx`

- [ ] **Audit: Props interface**
  - helpText/content prop
  - Trigger behavior props

- [ ] **Audit: Help button behavior**
  - Button renders
  - Help content displays on interaction
  - Tooltip/popover behavior

- [ ] **Audit: Accessibility**
  - Proper ARIA attributes
  - Keyboard accessible
  - Screen reader support

#### File 6: FormField.test.tsx

**Test File:** `tests/webview-ui/shared/components/forms/FormField.test.tsx`
**Source File:** `src/core/ui/components/forms/FormField.tsx`

- [ ] **Audit: Props interface**
  - label prop
  - children prop (input element)
  - error/validation props
  - required/optional indicators

- [ ] **Audit: Field rendering**
  - Label display
  - Input wrapper
  - Error message display
  - Help text integration

- [ ] **Audit: Validation states**
  - Error state styling
  - Success state (if any)
  - Required indicator

---

### UI Primitive Tests (2 files)

#### File 7: Spinner.test.tsx

**Test File:** `tests/webview-ui/shared/components/ui/Spinner.test.tsx`
**Source File:** `src/core/ui/components/ui/Spinner.tsx`

- [ ] **Audit: Props interface**
  - size prop (S, M, L variants)
  - className prop
  - label/aria-label prop

- [ ] **Audit: Rendering**
  - Spinner animation element
  - Size-based styling
  - Custom className applied

- [ ] **Audit: Accessibility**
  - role="status" or similar
  - aria-label for screen readers
  - aria-hidden for decorative

#### File 8: StatusDot.test.tsx

**Test File:** `tests/webview-ui/shared/components/ui/StatusDot.test.tsx`
**Source File:** `src/core/ui/components/ui/StatusDot.tsx`

- [ ] **Audit: Props interface**
  - color prop (gray, green, yellow, red, blue, orange)
  - size prop (S, M, L)
  - className prop

- [ ] **Audit: Rendering**
  - Dot element with role="presentation"
  - Color-based styling
  - Size-based dimensions

- [ ] **Audit: Color variants**
  - All 6 colors render correctly
  - CSS classes or inline styles for colors

- [ ] **Audit: Integration with StatusCard**
  - Verify StatusCard tests use StatusDot correctly

---

### Utility Tests (1 file)

#### File 9: spectrumTokens.test.ts

**Test File:** `tests/webview-ui/shared/utils/spectrumTokens.test.ts`
**Source File:** `src/core/ui/utils/spectrumTokens.ts`

- [ ] **Audit: translateSpectrumToken function**
  - All 13 tokens tested (size-50 through size-6000)
  - Numeric value conversion
  - Pixel string passthrough
  - Undefined handling

- [ ] **Audit: Token mapping accuracy**
  - size-50 -> 4px
  - size-100 -> 8px
  - size-115 -> 9.2px
  - size-130 -> 10.4px
  - size-150 -> 12px
  - size-160 -> 12.8px
  - size-200 -> 16px
  - size-300 -> 24px
  - size-400 -> 32px
  - size-500 -> 40px
  - size-600 -> 48px
  - size-1000 -> 80px
  - size-6000 -> 480px

- [ ] **Audit: Type exports**
  - DimensionValue type exported
  - SpectrumSizeToken type exported

- [ ] **Audit: Error handling**
  - Invalid tokens passed through
  - Runtime behavior for type-bypassed inputs

- [ ] **Audit: Type safety tests**
  - Valid tokens accepted at compile time
  - Type assertions used for invalid token testing

---

## Audit Checklist Summary

### Cross-Cutting Concerns

- [ ] All 9 test files use renderWithProviders where needed
- [ ] Spectrum token tests verify all 13 tokens
- [ ] Layout tests verify both token and pixel value handling
- [ ] Form tests verify Spectrum component integration
- [ ] UI primitive tests verify accessibility attributes
- [ ] Path aliases resolve correctly

### Common Issues to Watch For

1. **Token mapping outdated:** New tokens added to implementation but not tests
2. **Backward compatibility gaps:** Pixel/number values not tested
3. **Accessibility missing:** Form/UI tests don't check ARIA attributes
4. **Type assertion abuse:** Tests bypass type checking excessively
5. **Snapshot brittleness:** If any tests use snapshots, verify they're stable

### Spectrum Token Quick Reference

```typescript
// All 13 tokens and their pixel values
const SPECTRUM_TOKENS = {
  'size-50': '4px',
  'size-100': '8px',
  'size-115': '9.2px',
  'size-130': '10.4px',
  'size-150': '12px',
  'size-160': '12.8px',
  'size-200': '16px',
  'size-300': '24px',
  'size-400': '32px',
  'size-500': '40px',
  'size-600': '48px',
  'size-1000': '80px',
  'size-6000': '480px'
};
```

---

## Expected Outcome

After completing this step:
- All 9 layout/forms/ui/utils test files verified
- Spectrum token translation tested completely
- Layout components test all dimension props
- Form components test validation states
- UI primitives test accessibility
- Any discrepancies documented and fixed

---

## Commands

```bash
# Run layout tests
npm test -- tests/webview-ui/shared/components/layout/

# Run forms tests
npm test -- tests/webview-ui/shared/components/forms/

# Run ui tests
npm test -- tests/webview-ui/shared/components/ui/

# Run utils tests
npm test -- tests/webview-ui/shared/utils/

# Run all step 3 tests
npm test -- tests/webview-ui/shared/components/layout/ tests/webview-ui/shared/components/forms/ tests/webview-ui/shared/components/ui/ tests/webview-ui/shared/utils/

# Run with coverage
npm test -- tests/webview-ui/shared/components/layout/ tests/webview-ui/shared/components/forms/ tests/webview-ui/shared/components/ui/ tests/webview-ui/shared/utils/ --coverage
```

---

## Final Verification

After completing all 3 steps, run full webview test suite:

```bash
# Run all webview tests
npm test -- tests/webview-ui/

# Run with coverage report
npm test -- tests/webview-ui/ --coverage --coverageReporters=text-summary

# Verify no test failures
npm test -- tests/webview-ui/ --passWithNoTests=false
```

### Phase 5 Complete Checklist

- [ ] All 39 test files audited
- [ ] All tests pass
- [ ] Coverage maintained at 80%+
- [ ] No new ESLint warnings
- [ ] Timer management verified for all timing-related tests
- [ ] VS Code API mocks validated
- [ ] Spectrum component integration verified
- [ ] Accessibility patterns confirmed

---

**Estimated Time:** 1-1.5 hours
**Files:** 9

---

## Phase 5 Summary

| Step | Category | Files | Status |
|------|----------|-------|--------|
| 1 | hooks/ | 17 | [ ] |
| 2 | navigation/ + feedback/ | 13 | [ ] |
| 3 | layout/ + forms/ + ui/ + utils/ | 9 | [ ] |
| **Total** | | **39** | |

**Total Estimated Time:** 4.5-6 hours
