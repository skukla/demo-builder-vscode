# Step 1: Extract PageHeader Component

## Purpose

Extract the duplicated page header pattern (title + subtitle + optional action/back buttons) into a reusable `PageHeader` component. This pattern appears in WizardContainer, ProjectsDashboard, and ConfigureScreen.

## Prerequisites

- [x] None (first step)

## Tests to Write First

- [x] Test: Renders title correctly
  - **Given:** PageHeader with title="Test Title"
  - **When:** Component renders
  - **Then:** H1 heading displays "Test Title"
  - **File:** `tests/core/ui/components/layout/PageHeader.test.tsx`

- [x] Test: Renders subtitle when provided
  - **Given:** PageHeader with subtitle="Subtitle text"
  - **When:** Component renders
  - **Then:** H3 heading displays subtitle with gray styling

- [x] Test: Renders action button when provided
  - **Given:** PageHeader with action={<Button>Action</Button>}
  - **When:** Component renders
  - **Then:** Action button appears right-aligned

- [x] Test: Renders back button when provided
  - **Given:** PageHeader with backButton={{ label: "Back", onPress: mockFn }}
  - **When:** Back button clicked
  - **Then:** onPress callback fires

- [x] Test: Constrains width when constrainWidth=true
  - **Given:** PageHeader with constrainWidth={true}
  - **When:** Component renders
  - **Then:** Content wrapped in max-w-800 mx-auto div

## Files to Create/Modify

- [x] `src/core/ui/components/layout/PageHeader.tsx` - New component
- [x] `src/core/ui/components/layout/index.ts` - Export PageHeader
- [x] `tests/core/ui/components/layout/PageHeader.test.tsx` - Tests

## Implementation Details

**RED Phase:**
```typescript
// PageHeader.test.tsx
describe('PageHeader', () => {
  it('renders title correctly', () => {
    render(<PageHeader title="My Title" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My Title');
  });
});
```

**GREEN Phase:**
1. Create `PageHeader.tsx` following TwoColumnLayout patterns
2. Use Spectrum `View` with `padding="size-400"`, `UNSAFE_className={cn('border-b', 'bg-gray-75')}`
3. Use `Heading level={1}` for title, `Heading level={3}` for subtitle
4. Wrap content in conditional `max-w-800 mx-auto` div when `constrainWidth` is true

**REFACTOR Phase:**
1. Ensure consistent Spectrum token usage
2. Add JSDoc documentation matching TwoColumnLayout style

## Expected Outcome

- PageHeader component created with full props API
- 5 passing unit tests
- Exported from layout index

## Acceptance Criteria

- [x] All 5 tests passing (21 tests implemented)
- [x] Matches existing header visual style exactly
- [x] Supports all props from interface
- [x] JSDoc documentation complete
- [x] Exported from `@/core/ui/components/layout`

## Completion Notes

**Completed:** 2025-12-02
**Tests:** 21 passing (100% statements, 92.3% branches)
**Files:** PageHeader.tsx (110 lines), PageHeader.test.tsx (230 lines)

**Estimated Time:** 2 hours
