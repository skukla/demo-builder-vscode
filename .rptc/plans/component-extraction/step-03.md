# Step 3: Extract PageLayout Component

## Purpose

Create composite layout component combining header, scrollable content, and footer slots into a full-viewport structure.

## Prerequisites

- [x] Step 1: PageHeader component complete
- [x] Step 2: PageFooter component complete

## Tests to Write First

- [x] Test: Renders children in scrollable content area
  - **Given:** PageLayout with children content
  - **When:** Component renders
  - **Then:** Children visible in scrollable middle section
  - **File:** `tests/core/ui/components/layout/PageLayout.test.tsx`

- [x] Test: Renders header slot at top
  - **Given:** PageLayout with header prop
  - **When:** Component renders
  - **Then:** Header fixed at viewport top

- [x] Test: Renders footer slot at bottom
  - **Given:** PageLayout with footer prop
  - **When:** Component renders
  - **Then:** Footer fixed at viewport bottom

- [x] Test: Applies custom backgroundColor
  - **Given:** PageLayout with backgroundColor="gray-100"
  - **When:** Component renders
  - **Then:** Background style applied to container

## Files to Create/Modify

- [x] `src/core/ui/components/layout/PageLayout.tsx` - Main layout component
- [x] `src/core/ui/components/layout/index.ts` - Export PageLayout
- [x] `tests/core/ui/components/layout/PageLayout.test.tsx` - Tests

## Implementation Details

**Props Interface:**

```typescript
interface PageLayoutProps {
    header?: React.ReactNode;
    footer?: React.ReactNode;
    children: React.ReactNode;
    backgroundColor?: string;
}
```

**Structure:**

- Container: `height: 100vh`, `display: flex`, `flexDirection: column`
- Header slot: Fixed height, no shrink
- Content: `flex: 1`, `overflow-y: auto`
- Footer slot: Fixed height, no shrink

## Acceptance Criteria

- [x] All 4 tests passing (24 tests implemented)
- [x] Full viewport height layout
- [x] Content area scrolls independently
- [x] Header/footer remain fixed during scroll
- [x] Follows existing Spectrum patterns

## Completion Notes

**Completed:** 2025-12-02
**Tests:** 24 passing (100% statements, 75% branches, 100% functions)
**Files:** PageLayout.tsx (93 lines), PageLayout.test.tsx (435 lines)
