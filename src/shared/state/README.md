# State Management

## Purpose

The state module provides persistent project state management for the Adobe Demo Builder extension. It handles project data persistence, recent project tracking, state synchronization between extension restarts, and event-driven state change notifications.

State is stored both in VS Code's `globalState` API and in JSON files at `~/.demo-builder/`, ensuring state survives extension reloads and provides a single source of truth for project configuration.

## When to Use

Use this module when:
- Saving or loading the current project data
- Tracking recent projects for quick access
- Managing running process information (terminals, servers)
- Listening for project state changes
- Loading projects from the file system
- Persisting project configuration across extension reloads

Do NOT use when:
- Storing temporary UI state (use React state or webview local storage)
- Storing credentials or sensitive data (use VS Code SecretStorage)
- Managing state that doesn't need persistence (use in-memory variables)

## Key Exports

### StateManager

**Purpose**: Main state persistence and management service

**Usage**:
```typescript
import { StateManager } from '@/shared/state';

const stateManager = new StateManager(context);
await stateManager.initialize();

// Save project
await stateManager.saveProject(project);

// Get current project
const project = await stateManager.getCurrentProject();
```

**Key Methods**:
- `initialize()` - Initialize state from disk
- `getCurrentProject()` - Get current project or undefined
- `saveProject(project)` - Save project and persist to disk
- `clearProject()` - Clear current project
- `hasProject()` - Check if a project is loaded
- `addProcess(name, info)` - Track running process
- `removeProcess(name)` - Remove process tracking
- `getProcess(name)` - Get process info
- `reload()` - Reload state from disk
- `clearAll()` - Clear all state (reset extension)
- `loadProjectFromPath(path)` - Load project from file system
- `getAllProjects()` - Get all projects in projects directory
- `getRecentProjects()` - Get recent projects list
- `addToRecentProjects(project)` - Add to recent list
- `removeFromRecentProjects(path)` - Remove from recent list
- `onProjectChanged` - Event fired when project changes

**Properties**:
- `context` - VS Code extension context
- `state` - In-memory state data
- `stateFile` - Path to state.json file
- `recentProjectsFile` - Path to recent-projects.json file

**Example**:
```typescript
import { StateManager } from '@/shared/state';

const stateManager = new StateManager(context);
await stateManager.initialize();

// Create and save a new project
const project: Project = {
    name: 'my-demo',
    path: '/Users/demo/.demo-builder/projects/my-demo',
    status: 'creating',
    created: new Date(),
    lastModified: new Date(),
    componentInstances: {},
};

await stateManager.saveProject(project);

// Listen for state changes
stateManager.onProjectChanged((project) => {
    if (project) {
        console.log(`Project changed: ${project.name}`);
    } else {
        console.log('Project cleared');
    }
});

// Track a running process
await stateManager.addProcess('frontend', {
    pid: 12345,
    terminal: terminalInstance,
    startTime: new Date(),
});

// Later: remove process
await stateManager.removeProcess('frontend');
```

### updateFrontendState

**Purpose**: Update frontend component environment variables from project state

**Usage**:
```typescript
import { updateFrontendState } from '@/shared/state';

await updateFrontendState(project, logger);
```

**Parameters**:
- `project` - Current project with component instances
- `logger` - Logger instance for operation tracking

**Example**:
```typescript
// After mesh deployment, update frontend .env
const project = await stateManager.getCurrentProject();
if (project && project.meshState?.meshId) {
    await updateFrontendState(project, logger);
    // Frontend .env now has MESH_ID and MESH_ENDPOINT
}
```

### getFrontendEnvVars

**Purpose**: Extract environment variables for frontend from project state

**Usage**:
```typescript
import { getFrontendEnvVars } from '@/shared/state';

const envVars = getFrontendEnvVars(project);
// Returns: { MESH_ID: '...', MESH_ENDPOINT: '...' }
```

**Returns**: Record<string, string> with frontend environment variables

**Example**:
```typescript
const project = await stateManager.getCurrentProject();
const frontendEnv = getFrontendEnvVars(project);

console.log(frontendEnv.MESH_ID);
console.log(frontendEnv.MESH_ENDPOINT);
```

## Types

### StateData

Internal state structure:

```typescript
interface StateData {
    version: number;
    currentProject?: Project;
    processes: Map<string, ProcessInfo>;
    lastUpdated: Date;
}
```

### RecentProject

Recent project entry:

```typescript
interface RecentProject {
    path: string;
    name: string;
    organization?: string;
    lastOpened: string;
}
```

See `@/types` for `Project` and `ProcessInfo` type definitions.

## Architecture

**Directory Structure**:
```
shared/state/
├── index.ts              # Public API exports
├── stateManager.ts       # Main state persistence
├── projectStateSync.ts   # Frontend state synchronization
└── README.md            # This file
```

**Storage Locations**:
```
~/.demo-builder/
├── state.json           # Current project and process state
├── recent-projects.json # Recent projects list
└── projects/            # Project directories
    └── my-demo/
        ├── .demo-builder.json  # Project manifest
        ├── .env                # Project environment variables
        └── components/         # Component instances
```

## Usage Patterns

### Pattern 1: Project Lifecycle

```typescript
const stateManager = new StateManager(context);
await stateManager.initialize();

// Create project
const project = createNewProject();
await stateManager.saveProject(project);

// Update project status
project.status = 'running';
await stateManager.saveProject(project);

// Clear when done
await stateManager.clearProject();
```

### Pattern 2: Process Tracking

```typescript
// Start demo - track terminal
const terminal = vscode.window.createTerminal('Demo');
await stateManager.addProcess('frontend', {
    pid: terminal.processId,
    terminal: terminal,
    startTime: new Date(),
});

// Stop demo - clean up
await stateManager.removeProcess('frontend');
```

### Pattern 3: Project State Events

```typescript
// Listen for project changes
const disposable = stateManager.onProjectChanged(async (project) => {
    if (project) {
        // Project loaded or updated
        await updateUI(project);
    } else {
        // Project cleared
        await showWelcomeScreen();
    }
});

// Clean up
context.subscriptions.push(disposable);
```

### Pattern 4: Load Existing Project

```typescript
// Load project from file system
const projectPath = '/Users/demo/.demo-builder/projects/my-demo';
const project = await stateManager.loadProjectFromPath(projectPath);

if (project) {
    // Project loaded successfully
    console.log(`Loaded: ${project.name}`);
} else {
    // Failed to load
    console.error('Project not found or invalid');
}
```

### Pattern 5: Recent Projects

```typescript
// Get recent projects for quick access
const recent = await stateManager.getRecentProjects();
const quickPick = vscode.window.showQuickPick(
    recent.map(p => ({
        label: p.name,
        description: p.path,
        detail: `Last opened: ${new Date(p.lastOpened).toLocaleString()}`,
    })),
    { placeHolder: 'Select a recent project' }
);

if (quickPick) {
    await stateManager.loadProjectFromPath(quickPick.description);
}
```

## Integration

### Used By
- **Commands**: All project commands (create, start, stop, dashboard)
- **Features**:
  - `lifecycle` - Project start/stop state
  - `dashboard` - Current project display
  - `mesh` - Mesh state tracking
  - `components` - Component instance state
- **Providers**:
  - `ProjectTreeProvider` - Project explorer
  - `ComponentTreeProvider` - Component browser

### Dependencies
- VS Code API (`vscode`) - ExtensionContext, EventEmitter
- Node.js `fs/promises` - File operations
- Node.js `path`, `os` - Path resolution
- `@/types` - Project, StateData, ProcessInfo types
- `@/types/typeGuards` - JSON parsing with validation

## Best Practices

1. **Always Initialize**: Call `initialize()` before using StateManager
2. **Use Events**: Listen to `onProjectChanged` rather than polling
3. **Atomic Updates**: Update project object completely, then call `saveProject()`
4. **Validate Paths**: StateManager validates project paths exist before loading
5. **Recent Projects**: Automatically managed, limited to 10 most recent
6. **Process Cleanup**: Always remove processes when operations complete
7. **Error Handling**: StateManager logs errors but doesn't throw (graceful degradation)

## Common Patterns

### Project Auto-Detection

StateManager detects running demos even after extension reload:

```typescript
// Loads project and detects if demo is running
const project = await stateManager.loadProjectFromPath(path);

if (project.status === 'running') {
    // Demo was detected as running (terminal still exists)
    console.log('Demo is running');
}
```

### State Persistence Across Reloads

```typescript
// Before Extension Host restart
await stateManager.saveProject(project);

// After Extension Host restart
const stateManager = new StateManager(context);
await stateManager.initialize();

const project = await stateManager.getCurrentProject();
// Project state restored
```

### Manifest Management

StateManager automatically maintains `.demo-builder.json`:

```typescript
await stateManager.saveProject(project);
// Creates/updates:
// - ~/.demo-builder/state.json (global state)
// - <project-path>/.demo-builder.json (project manifest)
// - <project-path>/.env (environment variables)
```

## Error Handling

StateManager handles errors gracefully:

```typescript
// Invalid path
const project = await stateManager.loadProjectFromPath('/invalid/path');
// Returns: null (logs error, doesn't throw)

// Corrupt state file
await stateManager.initialize();
// Uses default state (logs warning, doesn't throw)

// File system errors
await stateManager.saveProject(project);
// Logs error, continues (state may be partially saved)
```

## Performance Considerations

- **File I/O**: All file operations are async (non-blocking)
- **Event Throttling**: `onProjectChanged` fires only on actual changes
- **Recent Projects**: Limited to 10 entries (prevents unbounded growth)
- **Path Validation**: Validates paths exist before loading (prevents wasted I/O)
- **Component Discovery**: Scans component directories only when loading projects
- **Caching**: In-memory state cache (no redundant disk reads)

## Guidelines

**Adding to This Module**:
- New state features must serve 2+ features
- Must persist to disk for extension reload survival
- Must emit events for reactive updates
- Must handle errors gracefully (no throws)

**Moving from Feature to Shared**:
When you find feature-specific state management used in multiple places:
1. Extract to this module
2. Add to StateData type
3. Update persistence logic
4. Add event support if needed
5. Update all usage sites

## Migration Notes

### From Old Utils

This module was migrated from `src/utils/stateManager.ts` as part of the shared infrastructure refactoring. Key improvements:

- Consistent error handling
- Better event support
- Automatic manifest management
- Recent projects tracking
- Auto-detection of running demos
- Project path validation

## See Also

- **Related Shared Modules**:
  - `@/shared/logging` - Used for logging state operations
  - `@/shared/base` - BaseCommand uses StateManager

- **Related Documentation**:
  - Main architecture: `../../CLAUDE.md`
  - Shared overview: `../CLAUDE.md`
  - Project structure: `../../docs/systems/project-structure.md`

- **Related Types**:
  - `@/types` - Project, StateData, ProcessInfo

---

*This is shared infrastructure - maintain high quality standards*
