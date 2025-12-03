# Step 7: Adopt Components in ConfigureScreen

## Purpose

Replace inline header/footer implementations in ConfigureScreen.tsx with extracted PageHeader, PageFooter, and PageLayout components, demonstrating consistent layout patterns across the application.

## Prerequisites

- [x] Step 1: PageHeader component complete
- [x] Step 2: PageFooter component complete
- [x] Step 3: PageLayout component complete

## Tests to Write First

- [x] Test: ConfigureScreen renders PageHeader with project name
  - **Given:** ConfigureScreen with project prop
  - **When:** Component renders
  - **Then:** PageHeader displays "Configure Project" title and project.name subtitle
  - **File:** `tests/features/dashboard/ui/configure/ConfigureScreen-rendering.test.tsx`

- [x] Test: ConfigureScreen footer has Close left, Save right
  - **Given:** ConfigureScreen rendered
  - **When:** Footer visible
  - **Then:** Close button left-aligned, Save Changes button right-aligned

- [x] Test: TwoColumnLayout preserved inside content area
  - **Given:** ConfigureScreen with serviceGroups
  - **When:** Rendered
  - **Then:** TwoColumnLayout contains form (left) and NavigationPanel (right)

## Files to Modify

- [x] `src/features/dashboard/ui/configure/ConfigureScreen.tsx`
  - Add imports: PageHeader, PageFooter, PageLayout from `@/core/ui/components/layout`
  - Lines 681-691: Replace View/Heading with `<PageHeader title="Configure Project" subtitle={project.name} />`
  - Lines 747-770: Replace View/Flex with `<PageFooter leftContent={closeButton} rightContent={saveButton} />`
  - Wrap entire content-area div with PageLayout using header/footer slots

## Implementation Details

**Before (Lines 681-691):**
```tsx
<View padding="size-400" UNSAFE_className={cn('border-b', 'bg-gray-75')}>
    <Heading level={1}>Configure Project</Heading>
    <Heading level={3}>{project.name}</Heading>
</View>
```

**After:**
```tsx
<PageHeader title="Configure Project" subtitle={project.name} />
```

**Footer Transformation:**
- leftContent: Close button (secondary, quiet, disabled when saving)
- rightContent: Save Changes button (accent, disabled when !canSave || isSaving)

## Acceptance Criteria

- [x] All existing ConfigureScreen tests pass (22 tests)
- [x] PageHeader displays title and project name
- [x] PageFooter positions buttons correctly (Close left, Save right)
- [x] TwoColumnLayout with form and NavigationPanel unchanged
- [x] Form validation behavior preserved
- [x] No visual regression from current implementation

## Completion Notes

**Completed:** 2025-12-02
**Tests:** 4 new tests added (22 total for ConfigureScreen)
**Note:** PageLayout not adopted - ConfigureScreen has focus trap and complex TwoColumnLayout structure. Only PageHeader and PageFooter adopted. File size reduced from 775 to ~763 lines.
