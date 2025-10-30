# Step 2: Apply Token Translation to GridLayout

## Purpose

Enhance GridLayout component to translate Adobe Spectrum design tokens using the `translateSpectrumToken()` utility created in Step 1. This step fixes the WelcomeScreen button spacing bug (gap="size-300" renders as 0px currently) and enables type-safe token usage across all GridLayout consumers.

## Prerequisites

- [x] Step 1 completed (spectrumTokens.ts utility exists)
- [ ] `spectrumTokens.ts` exports `translateSpectrumToken()` function and `DimensionValue` type
- [ ] GridLayout component exists at `webview-ui/src/shared/components/layout/GridLayout.tsx`
- [ ] Jest test framework configured (npm test works)

## Tests to Write First (RED Phase)

**Reference**: See testing-guide.md (SOP) for TDD methodology and test-first approach

### Happy Path Tests

- [ ] **Test: Translates gap token correctly**
  - **Given:** GridLayout with `gap="size-300"`
  - **When:** Component renders
  - **Then:** Rendered div has `gap: "24px"` in inline styles
  - **File:** `webview-ui/src/shared/components/layout/GridLayout.test.tsx`

- [ ] **Test: Translates maxWidth token correctly**
  - **Given:** GridLayout with `maxWidth="size-6000"`
  - **When:** Component renders
  - **Then:** Rendered div has `maxWidth: "480px"` in inline styles
  - **File:** `webview-ui/src/shared/components/layout/GridLayout.test.tsx`

- [ ] **Test: Translates padding token correctly**
  - **Given:** GridLayout with `padding="size-200"`
  - **When:** Component renders
  - **Then:** Rendered div has `padding: "16px"` in inline styles
  - **File:** `webview-ui/src/shared/components/layout/GridLayout.test.tsx`

- [ ] **Test: Passes through numeric gap values (backward compatibility)**
  - **Given:** GridLayout with `gap={16}` (number)
  - **When:** Component renders
  - **Then:** Rendered div has `gap: "16px"` in inline styles
  - **File:** `webview-ui/src/shared/components/layout/GridLayout.test.tsx`

- [ ] **Test: Passes through pixel string values (backward compatibility)**
  - **Given:** GridLayout with `gap="32px"` (pixel string)
  - **When:** Component renders
  - **Then:** Rendered div has `gap: "32px"` unchanged
  - **File:** `webview-ui/src/shared/components/layout/GridLayout.test.tsx`

### Edge Case Tests

- [ ] **Test: Handles undefined gap (uses default)**
  - **Given:** GridLayout without gap prop
  - **When:** Component renders
  - **Then:** Rendered div uses default `gap: "24px"`
  - **File:** `webview-ui/src/shared/components/layout/GridLayout.test.tsx`

- [ ] **Test: Handles multiple props with tokens simultaneously**
  - **Given:** GridLayout with `gap="size-300"`, `maxWidth="size-6000"`, `padding="size-400"`
  - **When:** Component renders
  - **Then:** All three translate correctly (24px, 480px, 32px)
  - **File:** `webview-ui/src/shared/components/layout/GridLayout.test.tsx`

- [ ] **Test: Handles mixed token and pixel values**
  - **Given:** GridLayout with `gap="size-300"` and `padding="16px"`
  - **When:** Component renders
  - **Then:** Token translates to 24px, pixel string passes through 16px
  - **File:** `webview-ui/src/shared/components/layout/GridLayout.test.tsx`

### Error Condition Tests

- [ ] **Test: Handles invalid token gracefully (runtime fallback)**
  - **Given:** GridLayout with `gap="size-999"` (invalid token)
  - **When:** Component renders
  - **Then:** Rendered div has `gap: "size-999"` unchanged (graceful degradation)
  - **File:** `webview-ui/src/shared/components/layout/GridLayout.test.tsx`

### Integration Tests (WelcomeScreen Fix Validation)

- [ ] **Test: WelcomeScreen button spacing visual check**
  - **Given:** WelcomeScreen component using `<GridLayout gap="size-300">`
  - **When:** Rendered in browser (manual check)
  - **Then:** Two action cards have visible 24px gap between them
  - **File:** Manual visual validation (documented in test log)

## Files to Create/Modify

### New Files

- [ ] `webview-ui/src/shared/components/layout/GridLayout.test.tsx` - Comprehensive component tests

### Modified Files

- [ ] `webview-ui/src/shared/components/layout/GridLayout.tsx` - Add token translation logic and update type imports

## Implementation Details (GREEN Phase - After Tests Written)

### Sub-step 2.1: Create Test File with Failing Tests (RED Phase)

Create comprehensive test suite following TDD Red phase:

```typescript
// webview-ui/src/shared/components/layout/GridLayout.test.tsx
import React from 'react';
import { render } from '@testing-library/react';
import { GridLayout } from './GridLayout';

describe('GridLayout', () => {
    describe('Token Translation', () => {
        it('translates gap token size-300 to 24px', () => {
            const { container } = render(
                <GridLayout gap="size-300">
                    <div>Item 1</div>
                </GridLayout>
            );
            const gridDiv = container.firstChild as HTMLDivElement;
            expect(gridDiv.style.gap).toBe('24px');
        });

        it('translates maxWidth token size-6000 to 480px', () => {
            const { container } = render(
                <GridLayout maxWidth="size-6000">
                    <div>Item 1</div>
                </GridLayout>
            );
            const gridDiv = container.firstChild as HTMLDivElement;
            expect(gridDiv.style.maxWidth).toBe('480px');
        });

        it('translates padding token size-200 to 16px', () => {
            const { container } = render(
                <GridLayout padding="size-200">
                    <div>Item 1</div>
                </GridLayout>
            );
            const gridDiv = container.firstChild as HTMLDivElement;
            expect(gridDiv.style.padding).toBe('16px');
        });

        it('translates multiple token props simultaneously', () => {
            const { container } = render(
                <GridLayout gap="size-300" maxWidth="size-6000" padding="size-400">
                    <div>Item 1</div>
                </GridLayout>
            );
            const gridDiv = container.firstChild as HTMLDivElement;
            expect(gridDiv.style.gap).toBe('24px');
            expect(gridDiv.style.maxWidth).toBe('480px');
            expect(gridDiv.style.padding).toBe('32px');
        });

        it('handles mixed token and pixel values', () => {
            const { container } = render(
                <GridLayout gap="size-300" padding="16px">
                    <div>Item 1</div>
                </GridLayout>
            );
            const gridDiv = container.firstChild as HTMLDivElement;
            expect(gridDiv.style.gap).toBe('24px');
            expect(gridDiv.style.padding).toBe('16px');
        });
    });

    describe('Backward Compatibility', () => {
        it('passes through numeric gap values as pixels', () => {
            const { container } = render(
                <GridLayout gap={16}>
                    <div>Item 1</div>
                </GridLayout>
            );
            const gridDiv = container.firstChild as HTMLDivElement;
            expect(gridDiv.style.gap).toBe('16px');
        });

        it('passes through pixel string values unchanged', () => {
            const { container } = render(
                <GridLayout gap="32px">
                    <div>Item 1</div>
                </GridLayout>
            );
            const gridDiv = container.firstChild as HTMLDivElement;
            expect(gridDiv.style.gap).toBe('32px');
        });

        it('uses default gap when undefined', () => {
            const { container } = render(
                <GridLayout>
                    <div>Item 1</div>
                </GridLayout>
            );
            const gridDiv = container.firstChild as HTMLDivElement;
            expect(gridDiv.style.gap).toBe('24px');
        });
    });

    describe('Error Handling', () => {
        it('handles invalid token gracefully', () => {
            const { container } = render(
                <GridLayout gap="size-999">
                    <div>Item 1</div>
                </GridLayout>
            );
            const gridDiv = container.firstChild as HTMLDivElement;
            expect(gridDiv.style.gap).toBe('size-999'); // Fallback behavior
        });
    });

    describe('Grid Layout Structure', () => {
        it('renders grid container with correct structure', () => {
            const { container } = render(
                <GridLayout columns={3}>
                    <div>Item 1</div>
                    <div>Item 2</div>
                </GridLayout>
            );
            const gridDiv = container.firstChild as HTMLDivElement;
            expect(gridDiv.style.display).toBe('grid');
            expect(gridDiv.style.gridTemplateColumns).toBe('repeat(3, 1fr)');
        });
    });
});
```

**Run tests:** `npm test GridLayout.test.tsx` → All should FAIL (implementation not updated yet)

### Sub-step 2.2: Update GridLayout Implementation (GREEN Phase)

Modify GridLayout to translate tokens using spectrumTokens utility:

```typescript
// webview-ui/src/shared/components/layout/GridLayout.tsx
import React from 'react';
import { translateSpectrumToken, DimensionValue } from '@/webview-ui/shared/utils/spectrumTokens';

export interface GridLayoutProps {
    /** Grid items */
    children: React.ReactNode;
    /** Number of columns (default: 2) */
    columns?: number;
    /** Gap between items (default: 'size-300' / 24px) - supports Spectrum tokens */
    gap?: DimensionValue;
    /** Maximum width of container - supports Spectrum tokens */
    maxWidth?: DimensionValue;
    /** Padding around container - supports Spectrum tokens */
    padding?: DimensionValue;
    /** Additional CSS class */
    className?: string;
}

/**
 * GridLayout Component
 *
 * Provides a responsive grid layout with Spectrum design token support.
 * Used in Welcome and Dashboard screens.
 *
 * @example
 * ```tsx
 * // Using Spectrum tokens (recommended)
 * <GridLayout columns={3} gap="size-300" padding="size-400">
 *   <TileCard />
 * </GridLayout>
 *
 * // Backward compatible with pixel values
 * <GridLayout columns={2} gap="16px">
 *   <TileCard />
 * </GridLayout>
 * ```
 */
export const GridLayout: React.FC<GridLayoutProps> = ({
    children,
    columns = 2,
    gap = '24px', // Default: 24px (equivalent to size-300)
    maxWidth,
    padding,
    className
}) => {
    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, 1fr)`,
                gap: translateSpectrumToken(gap) || gap,
                maxWidth: translateSpectrumToken(maxWidth),
                padding: translateSpectrumToken(padding),
                width: '100%'
            }}
            className={className}
        >
            {children}
        </div>
    );
};
```

**Key Changes:**
1. Import `translateSpectrumToken` and `DimensionValue` from spectrumTokens utility
2. Update prop types: `gap`, `maxWidth`, `padding` now accept `DimensionValue` (tokens + px + numbers)
3. Apply `translateSpectrumToken()` to all dimension props in style object
4. Update JSDoc with token usage examples

**Run tests:** `npm test GridLayout.test.tsx` → All should PASS

### Sub-step 2.3: Verify Test Coverage

```bash
npm test GridLayout.test.tsx -- --coverage
```

**Expected Coverage:**
- **Statements:** ≥90%
- **Branches:** ≥85% (conditional token translation paths)
- **Functions:** 100% (single component function)
- **Lines:** ≥90%

### Sub-step 2.4: Manual Visual Validation (WelcomeScreen Fix)

**Validation Steps:**

1. Start extension in debug mode (F5 in VS Code)
2. Open WelcomeScreen view
3. Inspect rendered HTML with DevTools
4. Verify:
   - [ ] GridLayout div has `gap: 24px` (not `gap: size-300`)
   - [ ] Two action cards have visible 24px spacing between them
   - [ ] No console warnings about invalid CSS values
5. Document results in test log

**Expected Visual Result:** Clear 24px gap between "Create New Project" and "Open Existing Project" cards (previously 0px due to unrecognized "size-300" token).

### Sub-step 2.5: Verify TypeScript Compilation

```bash
npm run compile:typescript
```

**Expected:** No compilation errors, DimensionValue type enforces token safety at compile-time

## Expected Outcome

After completing this step:

- [ ] GridLayout component translates Spectrum tokens via `translateSpectrumToken()`
- [ ] Three props support tokens: gap, maxWidth, padding
- [ ] All 10 component tests pass (token translation + backward compatibility + error handling)
- [ ] Test coverage: ≥90% for GridLayout component
- [ ] TypeScript compilation passes (DimensionValue type safety enforced)
- [ ] WelcomeScreen button spacing visually fixed (24px gap visible)
- [ ] Backward compatibility maintained (existing px/number values work unchanged)
- [ ] Zero console warnings in browser DevTools

## Acceptance Criteria

- [ ] All tests passing (10 test cases covering token translation)
- [ ] Code follows TypeScript strict mode (no `any` types)
- [ ] No console.log or debugger statements
- [ ] Coverage ≥ 90% for GridLayout component
- [ ] DimensionValue type used for gap, maxWidth, padding props
- [ ] JSDoc comments updated with token usage examples
- [ ] Manual visual validation completed (WelcomeScreen gap fixed)
- [ ] No breaking changes to existing GridLayout consumers

## Dependencies from Other Steps

**Prerequisites:**
- **Step 1:** spectrumTokens.ts utility (MUST exist first)

**Enables:**
- **Step 5:** WelcomeScreen fix validation (tests GridLayout token translation in real component)
- **Steps 6-10:** Migration pattern established (other components follow similar enhancement approach)

## Estimated Time

**1.5 hours**
- Test file creation: 45 minutes (10 test cases)
- Implementation: 20 minutes (modify GridLayout, update types)
- Coverage verification: 10 minutes
- Manual visual validation: 15 minutes (WelcomeScreen check)
