# Step 3: Component TreeView Sidebar

**Status**: ✅ Complete
**Tests**: 14 passing
**Files Created**:
- `tests/extension-treeview.test.ts`
- `tests/features/components/providers/componentTreeProvider-registration.test.ts`

**Files Modified**:
- `package.json` (added demoBuilder.components TreeView with when clause)
- `src/extension.ts` (registered ComponentTreeProvider, title updates)
- `tests/__mocks__/vscode.ts` (added createTreeView mock)

---

## Purpose

Register the Component TreeView in package.json alongside the existing WebviewView sidebar, and wire up the existing ComponentTreeProvider.

## Dependencies from Other Steps

- Step 2: Project selection must work (TreeView needs current project)

## Tests to Write First

### 3.1 TreeView Registration Tests

**File**: `tests/features/components/providers/componentTreeProvider.test.ts`

```gherkin
Given ComponentTreeProvider is instantiated
When a project is loaded in state
Then getChildren() should return component tree items
And each item should have appropriate icon and label

Given ComponentTreeProvider is instantiated
When no project is loaded
Then getChildren() should return empty array

Given ComponentTreeProvider and project is loaded
When project files change
Then refresh() should update the tree
```

### 3.2 Dynamic Title Tests

**File**: `tests/extension-treeview.test.ts`

```gherkin
Given TreeView is registered
When a project named "Acme Corp" is loaded
Then TreeView title should be "Acme Corp"

Given TreeView with project "Acme Corp" loaded
When a different project "TechStart" is selected
Then TreeView title should update to "TechStart"

Given TreeView with project loaded
When project is cleared (navigate back)
Then TreeView should be hidden (via when clause)
```

## Files to Modify

### `package.json`

Add TreeView to views:
```json
{
  "id": "demoBuilder.components",
  "name": "Components",
  "type": "tree",
  "when": "demoBuilder.projectLoaded && !demoBuilder.wizardActive"
}
```

### `src/extension.ts`

- Register ComponentTreeProvider with vscode.window.createTreeView
- Store TreeView reference for title updates
- Add listener to update title when current project changes

### `src/features/components/providers/componentTreeProvider.ts`

Verify/update:
- getTreeItem() returns proper tree items
- getChildren() reads from current project
- refresh() method works correctly
- onDidChangeTreeData event fires appropriately

## Implementation Guidance

1. Use vscode.window.createTreeView() with viewId 'demoBuilder.components'
2. Set treeView.title dynamically based on project name
3. Listen to StateManager changes to update title
4. ComponentTreeProvider should already exist - wire it up

## Expected Outcome

- TreeView shows in sidebar when project is loaded
- TreeView hidden when no project or wizard active
- TreeView title shows project name
- Tree displays component file structure
