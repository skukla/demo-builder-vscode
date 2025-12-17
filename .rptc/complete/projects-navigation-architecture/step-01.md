# Step 1: Projects List as Home Screen

**Status**: ✅ Complete
**Tests**: 11 passing
**Files Created**:
- `src/features/projects-dashboard/commands/showProjectsList.ts`
- `src/features/projects-dashboard/handlers/ProjectsListHandlerRegistry.ts`
- `src/features/projects-dashboard/handlers/index.ts`
- `tests/features/projects-dashboard/commands/showProjectsList.test.ts`

**Files Modified**:
- `webpack.config.js` (added projectsList entry)
- `src/commands/commandManager.ts` (registered command)
- `src/features/projects-dashboard/index.ts` (exports)

---

## Purpose

Create a new webview command that shows the Projects List as the main panel, and wire up extension activation to show it as the home screen.

## Dependencies from Other Steps

None - this is the first step.

## Tests to Write First

### 1.1 showProjectsList Command Tests

**File**: `tests/features/projects-dashboard/commands/showProjectsList.test.ts`

```gherkin
Given the showProjectsList command is registered
When executeCommand('demoBuilder.showProjectsList') is called
Then a webview panel with ID 'demoBuilder.projectsList' should be created
And the panel title should be 'Demo Builder'

Given the Projects List panel already exists
When executeCommand('demoBuilder.showProjectsList') is called
Then the existing panel should be revealed (not duplicated)

Given the showProjectsList command handlers
When 'getProjects' message is received
Then handler should return all projects from StateManager

Given the showProjectsList command handlers
When 'createProject' message is received
Then handler should execute 'demoBuilder.createProject' command
```

### 1.2 Extension Activation Tests

**File**: `tests/extension-activation.test.ts` (update existing or create)

```gherkin
Given extension activation with projects in state
When activate() is called
Then 'demoBuilder.showProjectsList' command should be executed

Given extension activation with no projects in state
When activate() is called
Then 'demoBuilder.showProjectsList' command should be executed
And Projects List should show empty state
```

## Files to Create

### `src/features/projects-dashboard/commands/showProjectsList.ts`

New webview command following BaseWebviewCommand pattern:
- Extends BaseWebviewCommand
- Uses 'demoBuilder.projectsList' as webview ID
- Renders ProjectsDashboard component
- Handles messages: getProjects, createProject, selectProject

## Files to Modify

### `src/extension.ts`

- Import and instantiate ShowProjectsListCommand
- Register command in activate()
- Call showProjectsList on activation (if appropriate)

### `src/commands/commandManager.ts`

- Register 'demoBuilder.showProjectsList' command

### `src/features/projects-dashboard/ui/index.tsx`

- Ensure it can be used as entry point for webview
- Add message handling for communication with extension

## Implementation Guidance

1. Follow the pattern from `src/features/dashboard/commands/showDashboard.ts`
2. Reuse existing `ProjectsDashboard` component
3. Handler should use StateManager.getAllProjects()
4. Use WebviewCommunicationManager for message handling

## Expected Outcome

- New command `demoBuilder.showProjectsList` shows Projects List panel
- Projects List displays all projects as cards
- Clicking "+ New" triggers wizard
- Extension activates to Projects List as home screen
