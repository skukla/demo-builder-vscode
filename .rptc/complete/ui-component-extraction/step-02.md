# Step 2: Create CenteredFeedbackContainer

## Summary

Create a new `CenteredFeedbackContainer` component that wraps children in a centered Flex container. This standardizes the 12 occurrences of the `<Flex direction="column" justifyContent="center" alignItems="center" height="350px">` pattern found across loading states, status displays, and feedback UI.

**Pattern Being Extracted:**
```tsx
// Current pattern (duplicated 12+ times)
<Flex direction="column" justifyContent="center" alignItems="center" height="350px">
    <LoadingDisplay ... />
</Flex>
```

**Replacement:**
```tsx
// New standardized component
<CenteredFeedbackContainer>
    <LoadingDisplay ... />
</CenteredFeedbackContainer>
```

---

## Prerequisites

- [ ] Step 1 completed (ProjectStatusUtils extracted) - **Note: This step is independent and can proceed in parallel**
- [ ] Understanding of Adobe Spectrum Flex component
- [ ] Understanding of DimensionValue type for Spectrum design tokens

---

## Tests to Write First

### Test File: `tests/core/ui/components/layout/CenteredFeedbackContainer.test.tsx`

#### Test Group 1: Basic Rendering

- [ ] **Test: renders children content**
  - **Given:** CenteredFeedbackContainer with text children
  - **When:** Component renders
  - **Then:** Children are visible in the document
  - **File:** `tests/core/ui/components/layout/CenteredFeedbackContainer.test.tsx`

- [ ] **Test: renders complex children content**
  - **Given:** CenteredFeedbackContainer with nested elements (div, span, button)
  - **When:** Component renders
  - **Then:** All nested elements are accessible and visible
  - **File:** `tests/core/ui/components/layout/CenteredFeedbackContainer.test.tsx`

- [ ] **Test: renders multiple children**
  - **Given:** CenteredFeedbackContainer with multiple sibling elements
  - **When:** Component renders
  - **Then:** All children are rendered in order
  - **File:** `tests/core/ui/components/layout/CenteredFeedbackContainer.test.tsx`

#### Test Group 2: Height Prop

- [ ] **Test: applies default height of 350px when not specified**
  - **Given:** CenteredFeedbackContainer without height prop
  - **When:** Component renders
  - **Then:** Container has height style of "350px"
  - **File:** `tests/core/ui/components/layout/CenteredFeedbackContainer.test.tsx`

- [ ] **Test: applies custom height when specified**
  - **Given:** CenteredFeedbackContainer with height="200px"
  - **When:** Component renders
  - **Then:** Container has height style of "200px"
  - **File:** `tests/core/ui/components/layout/CenteredFeedbackContainer.test.tsx`

- [ ] **Test: supports Spectrum design tokens for height**
  - **Given:** CenteredFeedbackContainer with height="size-6000"
  - **When:** Component renders
  - **Then:** Height is translated to appropriate pixel value via translateSpectrumToken
  - **File:** `tests/core/ui/components/layout/CenteredFeedbackContainer.test.tsx`

#### Test Group 3: MaxWidth Prop

- [ ] **Test: does not apply maxWidth when not specified**
  - **Given:** CenteredFeedbackContainer without maxWidth prop
  - **When:** Component renders
  - **Then:** Container has no maxWidth style (undefined)
  - **File:** `tests/core/ui/components/layout/CenteredFeedbackContainer.test.tsx`

- [ ] **Test: applies maxWidth when specified**
  - **Given:** CenteredFeedbackContainer with maxWidth="600px"
  - **When:** Component renders
  - **Then:** Container has maxWidth style of "600px"
  - **File:** `tests/core/ui/components/layout/CenteredFeedbackContainer.test.tsx`

- [ ] **Test: supports Spectrum design tokens for maxWidth**
  - **Given:** CenteredFeedbackContainer with maxWidth="size-6000"
  - **When:** Component renders
  - **Then:** MaxWidth is translated via translateSpectrumToken
  - **File:** `tests/core/ui/components/layout/CenteredFeedbackContainer.test.tsx`

#### Test Group 4: Centering Behavior

- [ ] **Test: centers content horizontally**
  - **Given:** CenteredFeedbackContainer with children
  - **When:** Component renders
  - **Then:** Flex container has alignItems="center" (horizontal centering for column direction)
  - **File:** `tests/core/ui/components/layout/CenteredFeedbackContainer.test.tsx`

- [ ] **Test: centers content vertically**
  - **Given:** CenteredFeedbackContainer with children
  - **When:** Component renders
  - **Then:** Flex container has justifyContent="center" (vertical centering for column direction)
  - **File:** `tests/core/ui/components/layout/CenteredFeedbackContainer.test.tsx`

- [ ] **Test: uses column direction layout**
  - **Given:** CenteredFeedbackContainer with children
  - **When:** Component renders
  - **Then:** Flex container has direction="column"
  - **File:** `tests/core/ui/components/layout/CenteredFeedbackContainer.test.tsx`

#### Test Group 5: Accessibility

- [ ] **Test: preserves semantic structure of children**
  - **Given:** CenteredFeedbackContainer with semantic elements (header, main)
  - **When:** Component renders
  - **Then:** Semantic roles are accessible via screen.getByRole
  - **File:** `tests/core/ui/components/layout/CenteredFeedbackContainer.test.tsx`

- [ ] **Test: allows keyboard-focusable content**
  - **Given:** CenteredFeedbackContainer with Button children
  - **When:** Component renders
  - **Then:** Buttons are accessible and not aria-hidden
  - **File:** `tests/core/ui/components/layout/CenteredFeedbackContainer.test.tsx`

---

## Files to Create

### 1. Component File

- [ ] `src/core/ui/components/layout/CenteredFeedbackContainer.tsx`
  - CenteredFeedbackContainer functional component
  - Props interface with JSDoc comments
  - Integration with Adobe Spectrum Flex
  - Support for DimensionValue via translateSpectrumToken

### 2. Test File

- [ ] `tests/core/ui/components/layout/CenteredFeedbackContainer.test.tsx`
  - All tests from "Tests to Write First" section
  - Uses @testing-library/react and @adobe/react-spectrum Provider
  - Follows Given-When-Then format

### 3. Export Update

- [ ] Update `src/core/ui/components/layout/index.ts` (if exists) or component barrel file
  - Export CenteredFeedbackContainer

---

## Implementation Details

### RED Phase (Write Failing Tests First)

Create the test file with all tests. Tests should fail because the component does not exist.

```typescript
/**
 * CenteredFeedbackContainer Component Tests
 *
 * Tests the CenteredFeedbackContainer layout component that provides
 * consistent vertical/horizontal centering for feedback states.
 *
 * Used in: Loading states, status displays, empty states, error displays
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider, defaultTheme, Button } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';

// Helper to render with Spectrum Provider
const renderWithProvider = (ui: React.ReactElement) => {
    return render(
        <Provider theme={defaultTheme} colorScheme="light">
            {ui}
        </Provider>
    );
};

describe('CenteredFeedbackContainer', () => {
    describe('children rendering', () => {
        it('should render children content', () => {
            // Given: CenteredFeedbackContainer with text children
            // When: Component renders
            renderWithProvider(
                <CenteredFeedbackContainer>
                    <p>Loading content...</p>
                </CenteredFeedbackContainer>
            );

            // Then: Children are visible
            expect(screen.getByText('Loading content...')).toBeInTheDocument();
        });

        // ... additional tests per test plan
    });

    describe('height prop', () => {
        it('should apply default height of 350px when not specified', () => {
            // Given: CenteredFeedbackContainer without height prop
            const { container } = renderWithProvider(
                <CenteredFeedbackContainer>
                    <span>Content</span>
                </CenteredFeedbackContainer>
            );

            // Then: Container has 350px height
            const flexContainer = container.querySelector('[class*="spectrum-Flex"]');
            // Check inline style or computed style
            expect(flexContainer).toHaveStyle({ height: '350px' });
        });

        // ... additional tests per test plan
    });

    // ... additional test groups
});
```

### GREEN Phase (Minimal Implementation)

Create the component with minimal code to pass all tests:

```typescript
import React from 'react';
import { Flex } from '@adobe/react-spectrum';
import { translateSpectrumToken, DimensionValue } from '@/core/ui/utils/spectrumTokens';

export interface CenteredFeedbackContainerProps {
    /** Content to center within the container */
    children: React.ReactNode;
    /** Container height (default: "350px") - supports Spectrum tokens */
    height?: DimensionValue;
    /** Maximum width constraint - supports Spectrum tokens */
    maxWidth?: DimensionValue;
}

/**
 * CenteredFeedbackContainer Component
 *
 * Provides a centered container for feedback UI states like loading spinners,
 * status messages, empty states, and error displays.
 *
 * Standardizes the common pattern of vertically and horizontally centered
 * content within a fixed-height container.
 *
 * @example
 * ```tsx
 * // Basic usage with default height
 * <CenteredFeedbackContainer>
 *     <LoadingDisplay message="Loading..." />
 * </CenteredFeedbackContainer>
 *
 * // Custom height with Spectrum token
 * <CenteredFeedbackContainer height="size-6000">
 *     <StatusDisplay variant="success" message="Complete!" />
 * </CenteredFeedbackContainer>
 *
 * // With max-width constraint
 * <CenteredFeedbackContainer maxWidth="600px">
 *     <EmptyState title="No items" description="Create your first item" />
 * </CenteredFeedbackContainer>
 * ```
 */
export const CenteredFeedbackContainer: React.FC<CenteredFeedbackContainerProps> = ({
    children,
    height = '350px',
    maxWidth,
}) => {
    return (
        <Flex
            direction="column"
            justifyContent="center"
            alignItems="center"
            height={translateSpectrumToken(height)}
            maxWidth={translateSpectrumToken(maxWidth)}
        >
            {children}
        </Flex>
    );
};
```

### REFACTOR Phase (Improve Quality)

1. **Add React.memo for performance:**
   ```typescript
   export const CenteredFeedbackContainer = React.memo<CenteredFeedbackContainerProps>(({
       children,
       height = '350px',
       maxWidth,
   }) => {
       // ... implementation
   });
   ```

2. **Verify no duplication with existing components**
   - Check EmptyState.tsx doesn't already provide this
   - Ensure this is the simplest possible abstraction

3. **Add component display name for debugging:**
   ```typescript
   CenteredFeedbackContainer.displayName = 'CenteredFeedbackContainer';
   ```

---

## Expected Outcome

After completing this step:

- [ ] New `CenteredFeedbackContainer` component exists at `src/core/ui/components/layout/CenteredFeedbackContainer.tsx`
- [ ] All 15 tests passing in `tests/core/ui/components/layout/CenteredFeedbackContainer.test.tsx`
- [ ] Component is exported from layout barrel file
- [ ] Component integrates with Spectrum design tokens via `translateSpectrumToken`
- [ ] Component provides type-safe props with JSDoc documentation

**What This Enables:**
- Step 3-6 can now use this component to replace duplicated Flex patterns
- Consistent centered feedback UI across all loading/status/empty states
- Single point of change for centered container styling

---

## Acceptance Criteria

- [ ] Component file created: `src/core/ui/components/layout/CenteredFeedbackContainer.tsx`
- [ ] Test file created: `tests/core/ui/components/layout/CenteredFeedbackContainer.test.tsx`
- [ ] All 15 tests passing
- [ ] Default height is 350px (matching existing pattern)
- [ ] Height prop accepts DimensionValue (Spectrum tokens or pixel strings)
- [ ] MaxWidth prop accepts DimensionValue (optional)
- [ ] Children are rendered centered both vertically and horizontally
- [ ] Component uses React.memo for performance
- [ ] JSDoc documentation includes usage examples
- [ ] No console.log or debugger statements
- [ ] Code follows project style guide (ESLint passing)
- [ ] Component exported from barrel file

---

## Estimated Time

**2-3 hours**

- Test writing: 1 hour
- Implementation: 30 minutes
- Refactoring and documentation: 30 minutes
- Export configuration and verification: 30 minutes

---

## Notes

### Existing Usage Locations (12 occurrences to replace in future steps)

1. `src/features/authentication/ui/steps/components/AuthLoadingState.tsx:13`
2. `src/features/authentication/ui/components/SelectionStepContent.tsx:128`
3. `src/features/project-creation/ui/steps/ProjectCreationStep.tsx:61`
4. `src/features/project-creation/ui/steps/ProjectCreationStep.tsx:75`
5. `src/features/project-creation/ui/steps/ProjectCreationStep.tsx:82`
6. `src/features/project-creation/ui/steps/ProjectCreationStep.tsx:101`
7. `src/features/project-creation/ui/steps/ProjectCreationStep.tsx:123`
8. `src/features/components/ui/steps/ComponentConfigStep.tsx:49`
9. `src/features/components/ui/steps/ComponentConfigStep.tsx:59`
10. `src/features/mesh/ui/steps/ApiMeshStep.tsx:56`
11. `src/features/mesh/ui/steps/ApiMeshStep.tsx:88`
12. `src/features/mesh/ui/steps/components/MeshStatusDisplay.tsx:24`

### Similar Components to Reference

- `src/core/ui/components/layout/GridLayout.tsx` - Uses DimensionValue and translateSpectrumToken
- `src/core/ui/components/feedback/EmptyState.tsx` - Uses similar centered Flex pattern with `centered` prop
- `tests/core/ui/components/layout/PageLayout.test.tsx` - Testing patterns to follow

### Design Decisions

1. **Default height 350px**: Matches the existing pattern used across all 12 occurrences
2. **DimensionValue support**: Aligns with Spectrum v1.7.0 design token integration (see GridLayout)
3. **Column direction**: Content stacks vertically, which is the pattern for all feedback states
4. **No className prop**: Keep component focused; callers can wrap if custom styling needed
