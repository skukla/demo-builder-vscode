# Step 2: Extract PageFooter Component

## Purpose

Create a reusable PageFooter component with composition pattern (leftContent/rightContent ReactNode props) matching TwoColumnLayout. Eliminates footer duplication across WizardContainer and ConfigureScreen.

## Prerequisites

- [x] Step 1 complete (PageHeader created)
- [x] Familiar with TwoColumnLayout composition pattern

## Tests to Write First

- [x] **Test:** Renders with both left and right content
  - **Given:** leftContent and rightContent provided
  - **When:** Component renders
  - **Then:** Both content sections visible with space-between layout
  - **File:** `tests/core/ui/components/layout/PageFooter.test.tsx`

- [x] **Test:** Applies width constraint when constrainWidth=true
  - **Given:** constrainWidth={true} and content
  - **When:** Component renders
  - **Then:** Inner container has max-w-800 class

- [x] **Test:** Renders without width constraint when constrainWidth=false
  - **Given:** constrainWidth={false}
  - **When:** Component renders
  - **Then:** No max-width constraint applied

- [x] **Test:** Renders with only leftContent
  - **Given:** Only leftContent provided
  - **When:** Component renders
  - **Then:** Left content visible, right section empty

## Files to Create/Modify

- [x] `src/core/ui/components/layout/PageFooter.tsx` - New component
- [x] `src/core/ui/components/layout/index.ts` - Add export
- [x] `tests/core/ui/components/layout/PageFooter.test.tsx` - Tests

## Implementation Details

**Props Interface:**
```typescript
interface PageFooterProps {
    leftContent?: React.ReactNode;
    rightContent?: React.ReactNode;
    constrainWidth?: boolean; // default: true
}
```

**Pattern Reference:** WizardContainer.tsx:571-606
- View with padding="size-400", border-t, bg-gray-75
- Inner div with max-w-800 w-full (when constrained)
- Flex with justifyContent="space-between"

## Acceptance Criteria

- [x] All 4 tests passing (16 tests implemented)
- [x] Matches TwoColumnLayout composition pattern
- [x] Supports Spectrum design tokens via cn() utility
- [x] Exported from layout/index.ts

## Completion Notes

**Completed:** 2025-12-02
**Tests:** 16 passing (100% statements, 85.71% branches)
**Files:** PageFooter.tsx (86 lines), PageFooter.test.tsx (214 lines)
