# Step 4: Context Variables & View Switching

**Status**: ✅ Complete
**Tests**: 8 passing
**Files Created**:
- `tests/core/state/stateManager-context.test.ts`
- `tests/features/project-creation/commands/createProject-context.test.ts`
- `tests/extension-context.test.ts`

**Files Modified**:
- `src/core/state/stateManager.ts` (setContext in saveProject, clearProject, clearAll)
- `src/features/project-creation/commands/createProject.ts` (setContext in execute, dispose)
- `src/extension.ts` (context initialization on activation)

---

## Purpose

Update VS Code context variables when state changes to enable automatic view switching via `when` clauses.

## Dependencies from Other Steps

- Step 3: TreeView must be registered with `when` clauses

## Tests to Write First

### 4.1 Context Variable Tests

**File**: `tests/core/state/stateManager-context.test.ts`

```gherkin
Given StateManager setCurrentProject is called
When project is successfully set
Then vscode.commands.executeCommand('setContext', 'demoBuilder.projectLoaded', true) should be called

Given StateManager clearCurrentProject is called
When project is cleared
Then vscode.commands.executeCommand('setContext', 'demoBuilder.projectLoaded', false) should be called

Given wizard is opened (createProject command)
When wizard panel is created
Then vscode.commands.executeCommand('setContext', 'demoBuilder.wizardActive', true) should be called

Given wizard is closed (disposed or completed)
When wizard panel is disposed
Then vscode.commands.executeCommand('setContext', 'demoBuilder.wizardActive', false) should be called
```

### 4.2 View Switching Integration Tests

**File**: `tests/integration/view-switching.test.ts`

```gherkin
Given demoBuilder.projectLoaded = false and demoBuilder.wizardActive = false
Then WebviewView sidebar should be visible
And TreeView sidebar should be hidden

Given demoBuilder.projectLoaded = true and demoBuilder.wizardActive = false
Then WebviewView sidebar should be hidden
And TreeView sidebar should be visible

Given demoBuilder.wizardActive = true (regardless of projectLoaded)
Then WebviewView sidebar should be visible (timeline)
And TreeView sidebar should be hidden
```

## Files to Modify

### `src/core/state/stateManager.ts`

Add context updates to state change methods:
- setCurrentProject: set 'demoBuilder.projectLoaded' = true
- clearCurrentProject: set 'demoBuilder.projectLoaded' = false
- Add helper method: updateProjectLoadedContext()

### `src/features/project-creation/commands/createProject.ts`

Add context updates for wizard state:
- On panel create: set 'demoBuilder.wizardActive' = true
- On panel dispose: set 'demoBuilder.wizardActive' = false

### `src/extension.ts`

Initialize context variables on activation:
- Set initial values based on current state
- 'demoBuilder.projectLoaded' = !!currentProject
- 'demoBuilder.wizardActive' = false

## Implementation Guidance

1. Use vscode.commands.executeCommand('setContext', key, value)
2. Context updates should be synchronous with state changes
3. Initialize context in activate() based on persisted state
4. Ensure context is always in sync with actual state

## Expected Outcome

- Context variables update automatically with state
- Sidebar views switch based on context (via `when` clauses)
- WebviewView shows for projects list and wizard
- TreeView shows only when project loaded and not in wizard
