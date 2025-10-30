# Step 1: Create Spectrum Token Translation Utility

## Purpose

Create the foundational token translation utility that converts Adobe Spectrum design tokens (e.g., `"size-300"`) into pixel values for use in custom layout components. This utility enables type-safe token usage while maintaining backward compatibility with existing numeric and pixel string values.

## Prerequisites

- [ ] Project dependencies installed (`npm install`)
- [ ] TypeScript compiler configured (tsconfig.json)
- [ ] Jest test framework available (package.json scripts)

## Tests to Write First (RED Phase)

**Reference**: See testing-guide.md (SOP) for TDD methodology and test-first approach

### Happy Path Tests

- [ ] **Test: Translates common Spectrum size tokens correctly**
  - **Given:** Input `"size-100"`, `"size-200"`, `"size-300"`
  - **When:** `translateSpectrumToken()` is called
  - **Then:** Returns `"8px"`, `"16px"`, `"24px"` respectively
  - **File:** `webview-ui/src/shared/utils/spectrumTokens.test.ts`

- [ ] **Test: Passes through numeric values unchanged**
  - **Given:** Input `24` (number)
  - **When:** `translateSpectrumToken()` is called
  - **Then:** Returns `"24px"` (converted to px string)
  - **File:** `webview-ui/src/shared/utils/spectrumTokens.test.ts`

- [ ] **Test: Passes through pixel strings unchanged**
  - **Given:** Input `"24px"`, `"100px"`
  - **When:** `translateSpectrumToken()` is called
  - **Then:** Returns `"24px"`, `"100px"` unchanged
  - **File:** `webview-ui/src/shared/utils/spectrumTokens.test.ts`

### Edge Case Tests

- [ ] **Test: Handles smallest token (size-50)**
  - **Given:** Input `"size-50"`
  - **When:** `translateSpectrumToken()` is called
  - **Then:** Returns `"4px"`
  - **File:** `webview-ui/src/shared/utils/spectrumTokens.test.ts`

- [ ] **Test: Handles largest token (size-6000)**
  - **Given:** Input `"size-6000"`
  - **When:** `translateSpectrumToken()` is called
  - **Then:** Returns `"480px"`
  - **File:** `webview-ui/src/shared/utils/spectrumTokens.test.ts`

- [ ] **Test: Handles zero values**
  - **Given:** Input `0` (number)
  - **When:** `translateSpectrumToken()` is called
  - **Then:** Returns `"0px"`
  - **File:** `webview-ui/src/shared/utils/spectrumTokens.test.ts`

- [ ] **Test: Handles decimal pixel values**
  - **Given:** Input `16.5` (number)
  - **When:** `translateSpectrumToken()` is called
  - **Then:** Returns `"16.5px"`
  - **File:** `webview-ui/src/shared/utils/spectrumTokens.test.ts`

### Error Condition Tests

- [ ] **Test: Returns fallback for invalid Spectrum token strings**
  - **Given:** Input `"size-999"` (token not in mapping)
  - **When:** `translateSpectrumToken()` is called
  - **Then:** Returns input unchanged `"size-999"` (graceful degradation)
  - **File:** `webview-ui/src/shared/utils/spectrumTokens.test.ts`

- [ ] **Test: Handles undefined/null values**
  - **Given:** Input `undefined` or `null`
  - **When:** `translateSpectrumToken()` is called
  - **Then:** Returns `undefined` (preserves optional prop behavior)
  - **File:** `webview-ui/src/shared/utils/spectrumTokens.test.ts`

### TypeScript Compilation Tests

- [ ] **Test: DimensionValue type accepts valid tokens**
  - **Given:** Type annotation `const gap: DimensionValue = "size-300"`
  - **When:** TypeScript compiles
  - **Then:** No compilation errors
  - **File:** `webview-ui/src/shared/utils/spectrumTokens.test.ts`

- [ ] **Test: DimensionValue type rejects invalid tokens**
  - **Given:** Type annotation `const gap: DimensionValue = "size-999"`
  - **When:** TypeScript compiles
  - **Then:** Compilation error (expected - validates in PR review)
  - **File:** `webview-ui/src/shared/utils/spectrumTokens.test.ts` (commented example)

## Files to Create/Modify

### New Files

- [ ] `webview-ui/src/shared/utils/spectrumTokens.ts` - Token translation utility with DimensionValue type
- [ ] `webview-ui/src/shared/utils/spectrumTokens.test.ts` - Comprehensive unit tests

### Modified Files

**None** - This step is self-contained (foundation for Steps 2-4)

## Implementation Details (GREEN Phase - After Tests Written)

### Sub-step 1.1: Create Test File with Failing Tests

Create comprehensive test suite following TDD Red phase:

```typescript
// webview-ui/src/shared/utils/spectrumTokens.test.ts
import { translateSpectrumToken, DimensionValue } from './spectrumTokens';

describe('translateSpectrumToken', () => {
    describe('Happy Path - Spectrum Tokens', () => {
        it('translates size-100 to 8px', () => {
            expect(translateSpectrumToken('size-100')).toBe('8px');
        });

        it('translates size-200 to 16px', () => {
            expect(translateSpectrumToken('size-200')).toBe('16px');
        });

        it('translates size-300 to 24px', () => {
            expect(translateSpectrumToken('size-300')).toBe('24px');
        });

        // Add tests for all 13 tokens (size-50 through size-6000)
    });

    describe('Happy Path - Numeric Values', () => {
        it('converts number 24 to "24px"', () => {
            expect(translateSpectrumToken(24)).toBe('24px');
        });

        it('converts number 0 to "0px"', () => {
            expect(translateSpectrumToken(0)).toBe('0px');
        });

        it('converts decimal 16.5 to "16.5px"', () => {
            expect(translateSpectrumToken(16.5)).toBe('16.5px');
        });
    });

    describe('Happy Path - Pixel Strings', () => {
        it('passes through "24px" unchanged', () => {
            expect(translateSpectrumToken('24px')).toBe('24px');
        });

        it('passes through "100px" unchanged', () => {
            expect(translateSpectrumToken('100px')).toBe('100px');
        });
    });

    describe('Edge Cases', () => {
        it('handles smallest token size-50', () => {
            expect(translateSpectrumToken('size-50')).toBe('4px');
        });

        it('handles largest token size-6000', () => {
            expect(translateSpectrumToken('size-6000')).toBe('480px');
        });

        it('handles undefined', () => {
            expect(translateSpectrumToken(undefined)).toBeUndefined();
        });
    });

    describe('Error Conditions', () => {
        it('returns input unchanged for invalid token', () => {
            expect(translateSpectrumToken('size-999')).toBe('size-999');
        });

        it('returns input unchanged for non-token strings', () => {
            expect(translateSpectrumToken('invalid')).toBe('invalid');
        });
    });
});

describe('DimensionValue Type', () => {
    it('accepts valid Spectrum tokens', () => {
        const gap: DimensionValue = 'size-300';
        expect(gap).toBe('size-300');
    });

    it('accepts number values', () => {
        const gap: DimensionValue = 24;
        expect(gap).toBe(24);
    });

    it('accepts pixel strings', () => {
        const gap: DimensionValue = '24px';
        expect(gap).toBe('24px');
    });

    // Commented example showing compile-time safety:
    // const invalid: DimensionValue = 'size-999'; // TypeScript error expected
});
```

**Run tests:** `npm test spectrumTokens.test.ts` → All should FAIL (file doesn't exist)

### Sub-step 1.2: Create Implementation File (Minimal GREEN Phase)

Implement minimal code to pass all tests:

```typescript
// webview-ui/src/shared/utils/spectrumTokens.ts

/**
 * Adobe Spectrum Design Token Mapping
 *
 * Maps Spectrum size tokens to pixel values based on Adobe Spectrum Design System.
 * Only includes tokens actually used in this codebase (YAGNI principle).
 *
 * Token scale: 1 unit = 8px (Spectrum's base unit)
 *
 * @see https://spectrum.adobe.com/page/design-tokens/
 */

/** Valid Spectrum size token strings */
export type SpectrumSizeToken =
    | 'size-50'    // 4px
    | 'size-100'   // 8px
    | 'size-115'   // 9.2px (rare, but used in codebase)
    | 'size-130'   // 10.4px (rare, but used in codebase)
    | 'size-150'   // 12px
    | 'size-160'   // 12.8px (rare, but used in codebase)
    | 'size-200'   // 16px
    | 'size-300'   // 24px
    | 'size-400'   // 32px
    | 'size-500'   // 40px
    | 'size-600'   // 48px
    | 'size-1000'  // 80px
    | 'size-6000'; // 480px

/** Dimension value accepting tokens, pixel strings, or numbers */
export type DimensionValue = SpectrumSizeToken | `${number}px` | number;

/**
 * Token-to-pixel mapping
 * Based on actual codebase usage (13 tokens found via grep)
 */
const SPECTRUM_TOKEN_MAP: Record<SpectrumSizeToken, string> = {
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

/**
 * Translates Spectrum design tokens to CSS pixel values
 *
 * @param value - Spectrum token, pixel string, or number
 * @returns CSS pixel value string or undefined
 *
 * @example
 * translateSpectrumToken('size-300')  // '24px'
 * translateSpectrumToken(24)           // '24px'
 * translateSpectrumToken('24px')       // '24px'
 * translateSpectrumToken(undefined)    // undefined
 */
export function translateSpectrumToken(
    value: DimensionValue | undefined
): string | undefined {
    // Handle undefined (preserves optional prop behavior)
    if (value === undefined || value === null) {
        return undefined;
    }

    // Handle numbers (convert to px string)
    if (typeof value === 'number') {
        return `${value}px`;
    }

    // Handle strings (tokens or px strings)
    if (typeof value === 'string') {
        // If it's a Spectrum token, translate it
        if (value in SPECTRUM_TOKEN_MAP) {
            return SPECTRUM_TOKEN_MAP[value as SpectrumSizeToken];
        }

        // Otherwise, pass through unchanged (px strings, invalid tokens)
        return value;
    }

    return undefined;
}
```

**Run tests:** `npm test spectrumTokens.test.ts` → All should PASS

### Sub-step 1.3: Verify Test Coverage

```bash
npm test spectrumTokens.test.ts -- --coverage
```

**Expected Coverage:**
- **Statements:** 100%
- **Branches:** 100%
- **Functions:** 100%
- **Lines:** 100%

### Sub-step 1.4: Verify TypeScript Compilation

```bash
npm run compile:typescript
```

**Expected:** No compilation errors, DimensionValue type enforces token safety

## Expected Outcome

After completing this step:

- [ ] `spectrumTokens.ts` utility exists with 13-token mapping
- [ ] `DimensionValue` type provides compile-time safety for token usage
- [ ] `translateSpectrumToken()` function converts tokens to pixel values
- [ ] All 11 unit tests pass (happy path, edge cases, error conditions)
- [ ] Test coverage: 100% for token translation logic
- [ ] TypeScript compilation passes without errors
- [ ] Foundation ready for Steps 2-4 (GridLayout, TwoColumnLayout enhancements)

## Acceptance Criteria

- [ ] All tests passing (11 test cases covering 13 tokens)
- [ ] Code follows TypeScript strict mode (no `any` types)
- [ ] No console.log or debugger statements
- [ ] Coverage ≥ 100% for new utility file
- [ ] JSDoc comments explain token scale (1 unit = 8px)
- [ ] Type safety verified (invalid tokens cause compile errors)
- [ ] Backward compatibility maintained (numbers and px strings work)

## Dependencies from Other Steps

**Prerequisites:** None (foundation step)

**Enables:**
- **Step 2:** GridLayout token support (imports translateSpectrumToken)
- **Step 3:** TwoColumnLayout token support (imports translateSpectrumToken)
- **Step 4:** Component tests (uses spectrumTokens utility)

## Estimated Time

**2 hours**
- Test file creation: 45 minutes
- Implementation: 30 minutes
- Coverage verification: 15 minutes
- Documentation: 30 minutes
