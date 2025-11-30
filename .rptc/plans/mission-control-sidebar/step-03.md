# Step 3: Integration & Cleanup

## Objective

Integrate the new Projects Dashboard and Sidebar with the existing codebase, remove deprecated components (Welcome Screen, TreeView), and update activation flow.

## Test Strategy

### Unit Tests

1. **extension.test.ts (updates)**
   - Registers SidebarProvider
   - Opens Projects Dashboard on activation
   - Removes Welcome Screen registration

2. **wizard step config tests**
   - Wizard starts at Sign In step (not Welcome)
   - Step numbering is correct
   - No Welcome step in configuration

3. **Navigation command tests**
   - `demoBuilder.showDashboard` opens Projects Dashboard
   - `demoBuilder.showProjectDetail` opens Project Detail
   - `demoBuilder.createProject` opens Wizard (no welcome step)

### Integration Tests

1. **Activation flow integration**
   - Extension activates cleanly
   - Sidebar shows Projects context
   - Projects Dashboard opens in main area

2. **Navigation integration**
   - Dashboard → Project Detail → Back to Dashboard
   - Dashboard → Wizard → Complete → Project Detail

## Implementation Tasks

### 3.1 Update extension.ts Activation Flow

```typescript
// src/extension.ts

// REMOVE:
// - Welcome screen command registration
// - welcomeWebview instantiation
// - TreeDataProvider registration

// ADD:
// - SidebarProvider registration
// - Projects Dashboard command
// - Project Detail command (rename from dashboard)

export async function activate(context: vscode.ExtensionContext) {
    // Register SidebarProvider
    const sidebarProvider = new SidebarProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'demoBuilder.sidebar',
            sidebarProvider
        )
    );

    // Register dashboard command
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'demoBuilder.showDashboard',
            () => new ShowProjectsDashboardCommand(context).execute()
        )
    );

    // Auto-open Projects Dashboard on first activation
    if (!hasSeenDashboard) {
        vscode.commands.executeCommand('demoBuilder.showDashboard');
    }
}
```

### 3.2 Remove Welcome Screen

**Files to delete:**
- `webview-ui/src/welcome/` (entire directory)
- `src/commands/welcomeWebview.ts` (if exists)

**Files to update:**
- `webpack.config.js` - Remove welcome entry point
- `extension.ts` - Remove welcome command registration

### 3.3 Remove Welcome Step from Wizard

**Update wizard step configuration:**

```typescript
// src/features/project-creation/ui/wizard/WizardContainer.tsx or config

// BEFORE: Steps include Welcome
const steps = [
    { id: 'welcome', ... },
    { id: 'auth', ... },
    // ...
];

// AFTER: Steps start with Auth
const steps = [
    { id: 'auth', ... },
    { id: 'project', ... },
    { id: 'workspace', ... },
    { id: 'components', ... },
    { id: 'mesh', ... },
    { id: 'review', ... },
];
```

**Files to update:**
- `src/features/project-creation/ui/wizard/WizardContainer.tsx`
- `src/features/project-creation/ui/steps/WelcomeStep.tsx` - DELETE or repurpose

### 3.4 Rename dashboard Feature to project-detail

```bash
# Rename directory
mv src/features/dashboard src/features/project-detail

# Update all imports throughout codebase
# Update webpack entry point name
# Update path aliases if any
```

**Files to update:**
- All files importing from `@/features/dashboard`
- `webpack.config.js` - Rename entry point
- Feature CLAUDE.md

### 3.5 Update Navigation Commands

```typescript
// Create or update commands:

// NEW: Show Projects Dashboard
class ShowProjectsDashboardCommand {
    async execute() {
        // Open Projects Dashboard webview
    }
}

// RENAME: Show Project Detail (was Show Dashboard)
class ShowProjectDetailCommand {
    async execute(project?: Project) {
        // Open Project Detail for current or specified project
    }
}
```

### 3.6 Remove TreeView Provider

**Files to delete:**
- `src/features/components/providers/componentTreeProvider.ts`

**Files to update:**
- `extension.ts` - Remove TreeDataProvider registration
- `package.json` - Remove tree view from views (already done in step 2)

### 3.7 Update Webpack Configuration

```javascript
// webpack.config.js

entry: {
    wizard: './src/features/project-creation/ui/wizard/index.tsx',
    projectsDashboard: './src/features/projects-dashboard/ui/index.tsx',  // NEW
    projectDetail: './src/features/project-detail/ui/index.tsx',          // RENAMED
    configure: './webview-ui/src/configure/index.tsx',
    sidebar: './src/features/sidebar/ui/index.tsx'                        // NEW
    // REMOVED: welcome
}
```

### 3.8 Update Feature Exports

```typescript
// src/features/index.ts (if exists)

export * from './projects-dashboard';  // NEW
export * from './sidebar';              // NEW
export * from './project-detail';       // RENAMED
// REMOVED: dashboard export (now project-detail)
```

### 3.9 Wire Up Sidebar-Dashboard Communication

Ensure sidebar and dashboard can communicate:

```typescript
// When sidebar navigates, update main area
// When main area changes, update sidebar context

// Message types:
interface NavigationMessage {
    type: 'navigate';
    target: 'projects' | 'project-detail' | 'wizard' | 'configure';
    data?: { projectId?: string };
}

interface ContextUpdateMessage {
    type: 'context-update';
    context: SidebarContext;
}
```

## Files to Delete

| File/Directory | Reason |
|----------------|--------|
| `webview-ui/src/welcome/` | Replaced by Projects Dashboard empty state |
| `src/features/project-creation/ui/steps/WelcomeStep.tsx` | No longer needed |
| `src/features/components/providers/componentTreeProvider.ts` | Replaced by WebviewView |

## Files to Rename

| From | To |
|------|-----|
| `src/features/dashboard/` | `src/features/project-detail/` |

## Files to Update

| File | Changes |
|------|---------|
| `extension.ts` | Remove welcome, add sidebar/dashboard commands |
| `package.json` | Views configuration (done in step 2) |
| `webpack.config.js` | Entry points |
| Wizard config | Remove welcome step |
| All dashboard imports | Update to project-detail |

## Acceptance Criteria

- [ ] Extension activates without Welcome Screen
- [ ] SidebarProvider registered correctly
- [ ] Projects Dashboard opens on activation
- [ ] Wizard starts at Sign In (no Welcome step)
- [ ] Dashboard renamed to project-detail
- [ ] TreeView provider removed
- [ ] All navigation commands work
- [ ] Sidebar-dashboard communication works
- [ ] No broken imports
- [ ] All tests pass

## Dependencies

- Step 1 (Projects Dashboard) must be complete
- Step 2 (Sidebar WebviewView) must be complete
