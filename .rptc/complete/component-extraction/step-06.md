# Step 6: Adopt Components in ProjectsDashboard

## Purpose

Replace inline header pattern in ProjectsDashboard.tsx with extracted PageHeader component, and wrap entire view with PageLayout for consistent full-viewport structure.

## Prerequisites

- [x] Step 1: PageHeader component complete
- [x] Step 3: PageLayout component complete

## Tests to Write First

- [x] Test: ProjectsDashboard renders PageHeader with correct title
  - **Given:** ProjectsDashboard with projects
  - **When:** Component renders
  - **Then:** PageHeader displays "Your Projects" title
  - **File:** `tests/features/projects-dashboard/ui/ProjectsDashboard.test.tsx`

- [x] Test: PageHeader includes New Project action button
  - **Given:** ProjectsDashboard with onCreateProject callback
  - **When:** Action button clicked
  - **Then:** onCreateProject callback fires

- [x] Test: Dashboard wrapped in PageLayout
  - **Given:** ProjectsDashboard component
  - **When:** Component renders
  - **Then:** Content wrapped in scrollable PageLayout structure

## Files to Modify

- [x] `src/features/projects-dashboard/ui/ProjectsDashboard.tsx` - Replace inline header, wrap with PageLayout

## Implementation Details

**RED Phase:** Update existing ProjectsDashboard tests to expect PageHeader/PageLayout structure.

**GREEN Phase:**
1. Import `PageHeader` and `PageLayout` from `@/core/ui/components/layout`
2. Replace lines 130-150 (inline header) with:
   ```tsx
   <PageHeader
     title="Your Projects"
     subtitle="Select a project to manage or create a new one"
     action={<Button variant="accent" onPress={onCreateProject}><Add size="S" /><Text>New Project</Text></Button>}
     constrainWidth
   />
   ```
3. Wrap return with `<PageLayout header={...} backgroundColor="gray-50">`
4. Move content area into PageLayout children

**REFACTOR Phase:** Remove unused View/Flex imports from header section.

## Acceptance Criteria

- [x] All tests passing (20 tests for ProjectsDashboard)
- [x] Search, grid, empty state preserved
- [x] Visual appearance unchanged
- [x] No duplicate header styling code

## Completion Notes

**Completed:** 2025-12-02
**Tests:** 6 new tests added (20 total for ProjectsDashboard)
**Note:** Loading and empty states keep original View/Flex structure (no PageLayout) per requirements. Normal state uses PageLayout with PageHeader.
