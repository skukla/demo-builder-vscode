# Step 3: Apply Token Translation to TwoColumnLayout

## Purpose

Enhance TwoColumnLayout component to translate Adobe Spectrum design tokens using the `translateSpectrumToken()` utility created in Step 1. This enables type-safe token usage across 4 dimension props (gap, leftPadding, rightPadding, leftMaxWidth) and prepares the component for reuse in Steps 6-10 migration work.

## Prerequisites

- [x] Step 1 completed (spectrumTokens.ts utility exists)
- [ ] `spectrumTokens.ts` exports `translateSpectrumToken()` function and `DimensionValue` type
- [ ] TwoColumnLayout component exists at `webview-ui/src/shared/components/layout/TwoColumnLayout.tsx`
- [ ] Vitest test framework configured (npm test works)

## Tests to Write First (RED Phase)

**Reference**: See testing-guide.md (SOP) for TDD methodology and test-first approach

### Happy Path Tests

- [ ] **Test: Translates gap token correctly**
  - **Given:** TwoColumnLayout with `gap="size-300"`
  - **When:** Component renders
  - **Then:** Container div has `gap: "24px"` in inline styles
  - **File:** `webview-ui/src/shared/components/layout/TwoColumnLayout.test.tsx`

- [ ] **Test: Translates leftPadding token correctly**
  - **Given:** TwoColumnLayout with `leftPadding="size-200"`
  - **When:** Component renders
  - **Then:** Left column div has `padding: "16px"` in inline styles
  - **File:** `webview-ui/src/shared/components/layout/TwoColumnLayout.test.tsx`

- [ ] **Test: Translates rightPadding token correctly**
  - **Given:** TwoColumnLayout with `rightPadding="size-400"`
  - **When:** Component renders
  - **Then:** Right column div has `padding: "32px"` in inline styles
  - **File:** `webview-ui/src/shared/components/layout/TwoColumnLayout.test.tsx`

- [ ] **Test: Translates leftMaxWidth token correctly**
  - **Given:** TwoColumnLayout with `leftMaxWidth="size-6000"`
  - **When:** Component renders
  - **Then:** Left column div has `maxWidth: "480px"` in inline styles
  - **File:** `webview-ui/src/shared/components/layout/TwoColumnLayout.test.tsx`

- [ ] **Test: Passes through numeric padding values (backward compatibility)**
  - **Given:** TwoColumnLayout with `leftPadding={24}` (number)
  - **When:** Component renders
  - **Then:** Left column div has `padding: "24px"` in inline styles
  - **File:** `webview-ui/src/shared/components/layout/TwoColumnLayout.test.tsx`

- [ ] **Test: Passes through pixel string values (backward compatibility)**
  - **Given:** TwoColumnLayout with `gap="16px"` (pixel string)
  - **When:** Component renders
  - **Then:** Container div has `gap: "16px"` unchanged
  - **File:** `webview-ui/src/shared/components/layout/TwoColumnLayout.test.tsx`

### Edge Case Tests

- [ ] **Test: Handles undefined props (uses defaults)**
  - **Given:** TwoColumnLayout without dimension props
  - **When:** Component renders
  - **Then:** Uses default values (leftPadding: '24px', rightPadding: '24px', leftMaxWidth: '800px', gap: '0')
  - **File:** `webview-ui/src/shared/components/layout/TwoColumnLayout.test.tsx`

- [ ] **Test: Handles multiple token props simultaneously**
  - **Given:** TwoColumnLayout with `gap="size-300"`, `leftPadding="size-200"`, `rightPadding="size-400"`, `leftMaxWidth="size-6000"`
  - **When:** Component renders
  - **Then:** All four translate correctly (24px, 16px, 32px, 480px)
  - **File:** `webview-ui/src/shared/components/layout/TwoColumnLayout.test.tsx`

- [ ] **Test: Handles mixed token and pixel values**
  - **Given:** TwoColumnLayout with `gap="size-300"` and `leftPadding="32px"`
  - **When:** Component renders
  - **Then:** Token translates to 24px, pixel string passes through 32px
  - **File:** `webview-ui/src/shared/components/layout/TwoColumnLayout.test.tsx`

### Error Condition Tests

- [ ] **Test: Handles invalid token gracefully (runtime fallback)**
  - **Given:** TwoColumnLayout with `gap="size-999"` (invalid token)
  - **When:** Component renders
  - **Then:** Container div has `gap: "size-999"` unchanged (graceful degradation)
  - **File:** `webview-ui/src/shared/components/layout/TwoColumnLayout.test.tsx`

### Layout Structure Tests

- [ ] **Test: Renders two-column structure correctly**
  - **Given:** TwoColumnLayout with leftContent and rightContent
  - **When:** Component renders
  - **Then:** Container has display: flex, left column constrained, right column flexible
  - **File:** `webview-ui/src/shared/components/layout/TwoColumnLayout.test.tsx`

- [ ] **Test: Left column max-width constrains correctly**
  - **Given:** TwoColumnLayout with default leftMaxWidth
  - **When:** Component renders
  - **Then:** Left column div has maxWidth: '800px' (default value)
  - **File:** `webview-ui/src/shared/components/layout/TwoColumnLayout.test.tsx`

## Files to Create/Modify

### New Files

- [ ] `webview-ui/src/shared/components/layout/TwoColumnLayout.test.tsx` - Comprehensive component tests

### Modified Files

- [ ] `webview-ui/src/shared/components/layout/TwoColumnLayout.tsx` - Add token translation logic and update type imports

## Implementation Details (GREEN Phase - After Tests Written)

### Sub-step 3.1: Create Test File with Failing Tests (RED Phase)

Create comprehensive test suite following TDD Red phase:

```typescript
// webview-ui/src/shared/components/layout/TwoColumnLayout.test.tsx
import React from 'react';
import { render } from '@testing-library/react';
import { TwoColumnLayout } from './TwoColumnLayout';

describe('TwoColumnLayout', () => {
    describe('Token Translation', () => {
        it('translates gap token size-300 to 24px', () => {
            const { container } = render(
                <TwoColumnLayout
                    gap="size-300"
                    leftContent={<div>Left</div>}
                    rightContent={<div>Right</div>}
                />
            );
            const flexContainer = container.firstChild as HTMLDivElement;
            expect(flexContainer.style.gap).toBe('24px');
        });

        it('translates leftPadding token size-200 to 16px', () => {
            const { container } = render(
                <TwoColumnLayout
                    leftPadding="size-200"
                    leftContent={<div>Left</div>}
                    rightContent={<div>Right</div>}
                />
            );
            const leftColumn = container.firstChild?.childNodes[0] as HTMLDivElement;
            expect(leftColumn.style.padding).toBe('16px');
        });

        it('translates rightPadding token size-400 to 32px', () => {
            const { container } = render(
                <TwoColumnLayout
                    rightPadding="size-400"
                    leftContent={<div>Left</div>}
                    rightContent={<div>Right</div>}
                />
            );
            const rightColumn = container.firstChild?.childNodes[1] as HTMLDivElement;
            expect(rightColumn.style.padding).toBe('32px');
        });

        it('translates leftMaxWidth token size-6000 to 480px', () => {
            const { container } = render(
                <TwoColumnLayout
                    leftMaxWidth="size-6000"
                    leftContent={<div>Left</div>}
                    rightContent={<div>Right</div>}
                />
            );
            const leftColumn = container.firstChild?.childNodes[0] as HTMLDivElement;
            expect(leftColumn.style.maxWidth).toBe('480px');
        });

        it('translates multiple token props simultaneously', () => {
            const { container } = render(
                <TwoColumnLayout
                    gap="size-300"
                    leftPadding="size-200"
                    rightPadding="size-400"
                    leftMaxWidth="size-6000"
                    leftContent={<div>Left</div>}
                    rightContent={<div>Right</div>}
                />
            );
            const flexContainer = container.firstChild as HTMLDivElement;
            const leftColumn = flexContainer.childNodes[0] as HTMLDivElement;
            const rightColumn = flexContainer.childNodes[1] as HTMLDivElement;

            expect(flexContainer.style.gap).toBe('24px');
            expect(leftColumn.style.padding).toBe('16px');
            expect(rightColumn.style.padding).toBe('32px');
            expect(leftColumn.style.maxWidth).toBe('480px');
        });

        it('handles mixed token and pixel values', () => {
            const { container } = render(
                <TwoColumnLayout
                    gap="size-300"
                    leftPadding="32px"
                    leftContent={<div>Left</div>}
                    rightContent={<div>Right</div>}
                />
            );
            const flexContainer = container.firstChild as HTMLDivElement;
            const leftColumn = flexContainer.childNodes[0] as HTMLDivElement;

            expect(flexContainer.style.gap).toBe('24px');
            expect(leftColumn.style.padding).toBe('32px');
        });
    });

    describe('Backward Compatibility', () => {
        it('passes through numeric padding values as pixels', () => {
            const { container } = render(
                <TwoColumnLayout
                    leftPadding={24}
                    leftContent={<div>Left</div>}
                    rightContent={<div>Right</div>}
                />
            );
            const leftColumn = container.firstChild?.childNodes[0] as HTMLDivElement;
            expect(leftColumn.style.padding).toBe('24px');
        });

        it('passes through pixel string values unchanged', () => {
            const { container } = render(
                <TwoColumnLayout
                    gap="16px"
                    leftContent={<div>Left</div>}
                    rightContent={<div>Right</div>}
                />
            );
            const flexContainer = container.firstChild as HTMLDivElement;
            expect(flexContainer.style.gap).toBe('16px');
        });

        it('uses default values when props undefined', () => {
            const { container } = render(
                <TwoColumnLayout
                    leftContent={<div>Left</div>}
                    rightContent={<div>Right</div>}
                />
            );
            const flexContainer = container.firstChild as HTMLDivElement;
            const leftColumn = flexContainer.childNodes[0] as HTMLDivElement;
            const rightColumn = flexContainer.childNodes[1] as HTMLDivElement;

            expect(flexContainer.style.gap).toBe('0');
            expect(leftColumn.style.padding).toBe('24px');
            expect(rightColumn.style.padding).toBe('24px');
            expect(leftColumn.style.maxWidth).toBe('800px');
        });
    });

    describe('Error Handling', () => {
        it('handles invalid token gracefully', () => {
            const { container } = render(
                <TwoColumnLayout
                    gap="size-999"
                    leftContent={<div>Left</div>}
                    rightContent={<div>Right</div>}
                />
            );
            const flexContainer = container.firstChild as HTMLDivElement;
            expect(flexContainer.style.gap).toBe('size-999'); // Fallback behavior
        });
    });

    describe('Layout Structure', () => {
        it('renders two-column flex layout with correct structure', () => {
            const { container } = render(
                <TwoColumnLayout
                    leftContent={<div data-testid="left">Left</div>}
                    rightContent={<div data-testid="right">Right</div>}
                />
            );
            const flexContainer = container.firstChild as HTMLDivElement;
            const leftColumn = flexContainer.childNodes[0] as HTMLDivElement;
            const rightColumn = flexContainer.childNodes[1] as HTMLDivElement;

            expect(flexContainer.style.display).toBe('flex');
            expect(leftColumn.style.display).toBe('flex');
            expect(leftColumn.style.flexDirection).toBe('column');
            expect(rightColumn.style.flex).toBe('1');
        });

        it('constrains left column with maxWidth', () => {
            const { container } = render(
                <TwoColumnLayout
                    leftMaxWidth="800px"
                    leftContent={<div>Left</div>}
                    rightContent={<div>Right</div>}
                />
            );
            const leftColumn = container.firstChild?.childNodes[0] as HTMLDivElement;
            expect(leftColumn.style.maxWidth).toBe('800px');
        });
    });
});
```

**Run tests:** `npm test TwoColumnLayout.test.tsx` → All should FAIL (implementation not updated yet)

### Sub-step 3.2: Update TwoColumnLayout Implementation (GREEN Phase)

Modify TwoColumnLayout to translate tokens using spectrumTokens utility:

```typescript
// webview-ui/src/shared/components/layout/TwoColumnLayout.tsx
import React from 'react';
import { translateSpectrumToken, DimensionValue } from '@/webview-ui/shared/utils/spectrumTokens';

export interface TwoColumnLayoutProps {
    /** Content for the left column (main content area) */
    leftContent: React.ReactNode;
    /** Content for the right column (sidebar/summary) */
    rightContent: React.ReactNode;
    /** Maximum width of left column (default: '800px') - supports Spectrum tokens */
    leftMaxWidth?: DimensionValue;
    /** Left column padding (default: '24px') - supports Spectrum tokens */
    leftPadding?: DimensionValue;
    /** Right column padding (default: '24px') - supports Spectrum tokens */
    rightPadding?: DimensionValue;
    /** Right column background color (default: spectrum gray-75) */
    rightBackgroundColor?: string;
    /** Whether to show border between columns (default: true) */
    showBorder?: boolean;
    /** Gap between columns (default: '0') - supports Spectrum tokens */
    gap?: DimensionValue;
    /** Additional className for container */
    className?: string;
}

/**
 * Template Component: TwoColumnLayout
 *
 * Provides a consistent two-column layout pattern with Spectrum design token support.
 * Left column is constrained to configurable max width for readability,
 * right column is flexible.
 *
 * Used in:
 * - AdobeProjectStep (selection + summary)
 * - AdobeWorkspaceStep (selection + summary)
 * - ConfigureScreen (form + summary)
 *
 * @example
 * ```tsx
 * // Using Spectrum tokens (recommended)
 * <TwoColumnLayout
 *   gap="size-300"
 *   leftPadding="size-400"
 *   leftMaxWidth="size-6000"
 *   leftContent={<ProjectList />}
 *   rightContent={<ConfigurationSummary />}
 * />
 *
 * // Backward compatible with pixel values
 * <TwoColumnLayout
 *   gap="24px"
 *   leftContent={<ProjectList />}
 *   rightContent={<ConfigurationSummary />}
 * />
 * ```
 */
export const TwoColumnLayout: React.FC<TwoColumnLayoutProps> = ({
    leftContent,
    rightContent,
    leftMaxWidth = '800px',
    leftPadding = '24px',
    rightPadding = '24px',
    rightBackgroundColor = 'var(--spectrum-global-color-gray-75)',
    showBorder = true,
    gap = '0',
    className
}) => {
    return (
        <div
            style={{
                display: 'flex',
                height: '100%',
                width: '100%',
                gap: translateSpectrumToken(gap) || gap
            }}
            className={className}
        >
            {/* Left Column: Main Content (constrained width) */}
            <div
                style={{
                    maxWidth: translateSpectrumToken(leftMaxWidth) || leftMaxWidth,
                    width: '100%',
                    padding: translateSpectrumToken(leftPadding) || leftPadding,
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 0 // Prevent flex shrinking issues
                }}
            >
                {leftContent}
            </div>

            {/* Right Column: Sidebar/Summary (flexible width) */}
            <div
                style={{
                    flex: '1',
                    padding: translateSpectrumToken(rightPadding) || rightPadding,
                    backgroundColor: rightBackgroundColor,
                    borderLeft: showBorder
                        ? '1px solid var(--spectrum-global-color-gray-200)'
                        : undefined
                }}
            >
                {rightContent}
            </div>
        </div>
    );
};
```

**Key Changes:**
1. Import `translateSpectrumToken` and `DimensionValue` from spectrumTokens utility
2. Update prop types: `gap`, `leftMaxWidth`, `leftPadding`, `rightPadding` now accept `DimensionValue`
3. Apply `translateSpectrumToken()` to all dimension props in style objects with fallback (`|| propValue`)
4. Update JSDoc with token usage examples

**Run tests:** `npm test TwoColumnLayout.test.tsx` → All should PASS

### Sub-step 3.3: Verify Test Coverage

```bash
npm test TwoColumnLayout.test.tsx -- --coverage
```

**Expected Coverage:**
- **Statements:** ≥90%
- **Branches:** ≥85% (conditional token translation paths)
- **Functions:** 100% (single component function)
- **Lines:** ≥90%

### Sub-step 3.4: Verify TypeScript Compilation

```bash
npm run compile:typescript
```

**Expected:** No compilation errors, DimensionValue type enforces token safety at compile-time

## Expected Outcome

After completing this step:

- [ ] TwoColumnLayout component translates Spectrum tokens via `translateSpectrumToken()`
- [ ] Four props support tokens: gap, leftPadding, rightPadding, leftMaxWidth
- [ ] All 12 component tests pass (token translation + backward compatibility + error handling + layout structure)
- [ ] Test coverage: ≥90% for TwoColumnLayout component
- [ ] TypeScript compilation passes (DimensionValue type safety enforced)
- [ ] Backward compatibility maintained (existing px/number values work unchanged)
- [ ] Component ready for reuse in migration steps (6-10)

## Acceptance Criteria

- [ ] All tests passing (12 test cases covering token translation and layout structure)
- [ ] Code follows TypeScript strict mode (no `any` types)
- [ ] No console.log or debugger statements
- [ ] Coverage ≥ 90% for TwoColumnLayout component
- [ ] DimensionValue type used for gap, leftPadding, rightPadding, leftMaxWidth props
- [ ] JSDoc comments updated with token usage examples
- [ ] No breaking changes to existing TwoColumnLayout consumers (AdobeProjectStep, AdobeWorkspaceStep, ConfigureScreen)

## Dependencies from Other Steps

**Prerequisites:**
- **Step 1:** spectrumTokens.ts utility (MUST exist first)

**Enables:**
- **Steps 6-10:** Migration steps can now use TwoColumnLayout with token support
- Token-aware TwoColumnLayout ready for replacing duplicate two-column implementations

## Estimated Time

**2 hours**
- Test file creation: 60 minutes (12 test cases covering 4 props + layout structure)
- Implementation: 30 minutes (modify TwoColumnLayout, update 4 prop types)
- Coverage verification: 15 minutes
- TypeScript compilation check: 15 minutes
