# Step 2: Card Click → Project Detail

**Status**: ✅ Complete
**Tests**: 20 passing
**Files Created**:
- `tests/features/projects-dashboard/handlers/selectProject-navigation.test.ts`
- `tests/features/dashboard/handlers/navigateBack.test.ts`
- `tests/features/dashboard/ui/ProjectDashboardScreen-navigation.test.tsx`

**Files Modified**:
- `src/features/projects-dashboard/handlers/dashboardHandlers.ts` (enhanced handleSelectProject)
- `src/features/dashboard/handlers/dashboardHandlers.ts` (added handleNavigateBack)
- `src/features/dashboard/handlers/HandlerRegistry.ts` (registered navigateBack handler)
- `src/features/dashboard/ui/ProjectDashboardScreen.tsx` (added back navigation)

---

## Purpose

When user clicks a project card in the Projects List, navigate to the Project Detail view and update sidebar context.

## Dependencies from Other Steps

- Step 1: Projects List must be functional

## Tests to Write First

### 2.1 Card Click Handler Tests

**File**: `tests/features/projects-dashboard/handlers/projectsListHandlers.test.ts`

```gherkin
Given a project card in Projects List
When user clicks the card
Then 'selectProject' message should be sent with project path

Given selectProject handler receives a project path
When the handler executes
Then StateManager.setCurrentProject should be called with the path
And 'demoBuilder.showDashboard' command should be executed
And sidebar context should be updated to 'project' type
```

### 2.2 Back Navigation Tests

**File**: `tests/features/dashboard/ui/ProjectDashboardScreen.test.tsx`

```gherkin
Given Project Dashboard screen is rendered
When component mounts
Then "← All Projects" link should be visible at the top

Given "← All Projects" link is clicked
When click event fires
Then 'navigateBack' message should be sent to extension
```

**File**: `tests/features/dashboard/handlers/dashboardHandlers.test.ts`

```gherkin
Given navigateBack handler
When it receives the message
Then 'demoBuilder.showProjectsList' command should be executed
And StateManager.clearCurrentProject should be called
And sidebar context should be updated to 'projects' type
```

## Files to Modify

### `src/features/projects-dashboard/handlers/` (create or update)

Add handler for selectProject message:
- Load project into state
- Execute showDashboard command
- Update sidebar context

### `src/features/dashboard/ui/ProjectDashboardScreen.tsx`

Add back navigation link:
- "← All Projects" link at top of screen
- Sends 'navigateBack' message on click

### `src/features/dashboard/handlers/dashboardHandlers.ts`

Add handler for navigateBack message:
- Clear current project from state
- Execute showProjectsList command
- Update sidebar context

## Implementation Guidance

1. Follow existing message handler patterns
2. Use postMessage for webview → extension communication
3. Update sidebar via SidebarProvider.updateContext()
4. Ensure proper state cleanup when navigating back

## Expected Outcome

- Clicking project card loads project and shows Project Detail
- "← All Projects" link visible in Project Detail
- Clicking back returns to Projects List
- Sidebar context updates appropriately
