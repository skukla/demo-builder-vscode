# Step 8: Adopt Components in ProjectDashboardScreen (THE REDESIGN)

## Purpose

Redesign ProjectDashboardScreen to use extracted layout components, establishing consistent page structure with header (project name/path), scrollable content (status cards + action grid), and contextual footer (back navigation + auth actions).

## Prerequisites

- [x] Step 1: PageHeader component complete
- [x] Step 2: PageFooter component complete
- [x] Step 3: PageLayout component complete
- [x] Step 9: BackButton component complete

## Tests to Write First

**File:** `tests/features/dashboard/ui/ProjectDashboardScreen-navigation.test.tsx`

- [x] Test: Uses BackButton component for back navigation
  - **Given:** ProjectDashboardScreen rendered
  - **When:** Component mounts
  - **Then:** BackButton component is rendered

- [x] Test: BackButton has "All Projects" label
  - **Given:** ProjectDashboardScreen rendered
  - **When:** BackButton renders
  - **Then:** label prop is "All Projects"

- [N/A] Test: PageHeader (not applicable - compact panel view)
- [N/A] Test: PageFooter (not applicable - compact panel view)

## Files to Modify

- [x] `src/features/dashboard/ui/ProjectDashboardScreen.tsx` - Adopt BackButton (PageLayout not suitable for compact panel)
- [x] `tests/features/dashboard/ui/ProjectDashboardScreen-navigation.test.tsx` - Add BackButton tests

## Implementation Details

**Imports to Add:**
```typescript
import { PageLayout, PageHeader, PageFooter } from '@/core/ui/components/layout';
import { BackButton } from '@/core/ui/components/navigation';
```

**Changes:**

1. **REMOVE** lines 247-252 (inline back button):
   ```tsx
   // DELETE THIS:
   <Flex alignItems="center" marginBottom="size-100">
       <ActionButton isQuiet onPress={handleNavigateBack}>
           <ChevronLeft size="S" />
           <Text>All Projects</Text>
       </ActionButton>
   </Flex>
   ```

2. **WRAP** with PageLayout:
   ```tsx
   <PageLayout
       header={<PageHeader title={displayName} subtitle={project?.path} />}
       footer={
           <PageFooter
               leftContent={<BackButton label="All Projects" onPress={handleNavigateBack} />}
               rightContent={meshStatus === 'needs-auth' ? (
                   <ActionButton isQuiet onPress={handleReAuthenticate}>
                       <Login size="S" /><Text>Sign In</Text>
                   </ActionButton>
               ) : undefined}
           />
       }
   >
       {/* Status cards + action grid (existing content lines 254-407) */}
   </PageLayout>
   ```

3. **MOVE** Sign In button from inline (lines 278-287) to footer rightContent

4. **KEEP** status cards, divider, and action grid in scrollable content

## Acceptance Criteria

- [x] All tests passing (118 tests)
- [N/A] PageHeader/PageLayout - not suitable for compact panel view
- [x] BackButton replaces inline back navigation
- [x] Status cards and action grid unchanged
- [x] Focus trap still functional on container

## Completion Notes

**Completed:** 2025-12-02
**Tests:** 2 new tests added (118 total for ProjectDashboardScreen suite)
**Decision:** PageLayout/PageHeader/PageFooter NOT adopted - ProjectDashboardScreen is a compact sidebar panel, not a full-page wizard. Only BackButton was adopted as it directly replaces inline navigation without structural changes.
