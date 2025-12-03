# Step 4: Extract Card Component

## Purpose

Create a reusable Card component with optional dark header section, extracted from the ProjectCard pattern. This enables consistent card styling across the application.

## Prerequisites

- [x] Step 3 complete (PageLayout available)
- [x] Understanding of `.project-card-compact`, `.project-card-header` CSS classes

## Tests to Write First

**File:** `tests/core/ui/components/ui/Card.test.tsx`

- [x] Test: renders children in content area
- [x] Test: renders header when provided
- [x] Test: applies dark header styling when `darkHeader={true}`
- [x] Test: handles onClick with keyboard accessibility (Enter/Space)
- [x] Test: applies custom className
- [x] Test: renders without header when not provided

## Files to Create/Modify

- [x] `src/core/ui/components/ui/Card.tsx` - Generic Card component
- [x] `src/core/ui/components/ui/index.ts` - Export Card
- [x] `tests/core/ui/components/ui/Card.test.tsx` - Tests

## Implementation Details

**Props Interface:**
```typescript
interface CardProps {
    children: React.ReactNode;
    header?: React.ReactNode;
    darkHeader?: boolean;
    onClick?: () => void;
    className?: string;
}
```

**Pattern Reference:**
- Use existing `.project-card-compact` CSS class for base styling
- Use `.project-card-header` for header section
- Use `.project-card-content` for children wrapper
- Add role="button", tabIndex, keyboard handlers when onClick provided

## Acceptance Criteria

- [x] Card renders children in styled content area
- [x] Optional header renders above content
- [x] darkHeader applies dark background to header
- [x] onClick enables clickable card with keyboard support
- [x] All tests passing (27 tests)
- [x] Exported from ui/index.ts

## Completion Notes

**Completed:** 2025-12-02
**Tests:** 27 passing (86.84% statements, 79.59% branches, 100% functions)
**Files:** Card.tsx (86 lines), Card.test.tsx (412 lines)
