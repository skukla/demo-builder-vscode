# Base Classes

## Purpose

The base module provides foundational base classes for all commands in the Adobe Demo Builder extension. These classes establish standardized patterns for command execution, error handling, UI interactions, and webview management.

All feature commands extend these base classes, ensuring consistent behavior, logging, state management, and communication patterns across the entire extension.

## When to Use

Use this module when:
- Creating new VS Code commands
- Building webview-based commands
- Implementing commands that need state management
- Building commands with standardized error handling
- Creating commands with progress indicators
- Implementing commands with user prompts

Do NOT use when:
- Building utility functions (not commands)
- Creating service classes (not VS Code commands)
- Implementing pure business logic (use features/)

## Key Exports

### BaseCommand

**Purpose**: Base class for all standard VS Code commands

**Usage**:
```typescript
import { BaseCommand } from '@/shared/base';

class MyCommand extends BaseCommand {
    async execute(): Promise<void> {
        const project = await this.stateManager.getCurrentProject();

        if (!project) {
            await this.showError('No project loaded');
            return;
        }

        await this.withProgress('Processing...', async (progress) => {
            await this.doWork(project);
            this.showSuccessMessage('Operation completed');
        });
    }
}
```

**Key Properties**:
- `context` - VS Code extension context
- `stateManager` - State persistence and management
- `statusBar` - Status bar manager
- `logger` - Logger instance

**Key Methods**:
- `execute()` - Abstract method to implement command logic
- `withProgress(title, task)` - Execute with progress notification
- `showError(message, error?)` - Show error message and log
- `showWarning(message)` - Show warning message and log
- `showInfo(message)` - Show info message and log
- `showSuccessMessage(message, timeout?)` - Temporary status bar success
- `showStatusMessage(message, timeout?)` - Temporary status bar info
- `showQuickPick(items, options?)` - Show quick pick menu
- `showInputBox(options?)` - Show input box
- `createTerminal(name, cwd?)` - Create terminal instance
- `confirm(message, detail?)` - Show confirmation dialog

**Example**:
```typescript
import { BaseCommand } from '@/shared/base';
import * as vscode from 'vscode';

class InstallComponentCommand extends BaseCommand {
    async execute(): Promise<void> {
        // Get current project
        const project = await this.stateManager.getCurrentProject();

        if (!project) {
            await this.showError('No project loaded');
            return;
        }

        // Confirm with user
        const confirmed = await this.confirm(
            'Install component?',
            'This will download and install the component'
        );

        if (!confirmed) {
            return;
        }

        // Execute with progress
        await this.withProgress('Installing component', async (progress) => {
            progress.report({ message: 'Downloading...' });
            await this.download();

            progress.report({ message: 'Installing...' });
            await this.install();

            progress.report({ message: 'Configuring...' });
            await this.configure();
        });

        // Show success
        this.showSuccessMessage('Component installed successfully');
    }

    private async download() { /* ... */ }
    private async install() { /* ... */ }
    private async configure() { /* ... */ }
}
```

### BaseWebviewCommand

**Purpose**: Base class for commands that use webviews with robust communication

**Usage**:
```typescript
import { BaseWebviewCommand } from '@/shared/base';
import { WebviewCommunicationManager } from '@/shared/communication';

class MyWebviewCommand extends BaseWebviewCommand {
    protected getWebviewId(): string {
        return 'myWebview';
    }

    protected getWebviewTitle(): string {
        return 'My Webview';
    }

    protected async getWebviewContent(): Promise<string> {
        return `<!DOCTYPE html>...`;
    }

    protected getLoadingMessage(): string {
        return 'Loading...';
    }

    protected async getInitialData(): Promise<unknown> {
        return { projects: await this.loadProjects() };
    }

    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        comm.on('get-data', async () => {
            return await this.loadData();
        });

        comm.on('submit', async (payload) => {
            return await this.handleSubmit(payload);
        });
    }

    async execute(): Promise<void> {
        await this.createOrRevealPanel();
        await this.initializeCommunication();
    }
}
```

**Key Properties** (Inherits from BaseCommand):
- `panel` - WebviewPanel instance
- `communicationManager` - WebviewCommunicationManager instance
- `disposables` - Disposable resources

**Abstract Methods** (Must Implement):
- `getWebviewId()` - Return unique webview identifier
- `getWebviewTitle()` - Return webview title
- `getWebviewContent()` - Return HTML content
- `getLoadingMessage()` - Return loading message
- `getInitialData()` - Return initial data for webview
- `initializeMessageHandlers(comm)` - Register message handlers

**Key Methods**:
- `createOrRevealPanel()` - Create or reveal singleton panel
- `initializeCommunication()` - Initialize communication manager (idempotent)
- `sendMessage(type, payload?)` - Send message to webview
- `request<T>(type, payload?)` - Request-response with webview
- `getNonce()` - Generate cryptographically secure nonce for CSP
- `isVisible()` - Check if webview is visible
- `dispose()` - Clean up resources
- `shouldReopenWelcomeOnDispose()` - Override to control Welcome reopen

**Static Methods**:
- `disposeAllActivePanels()` - Dispose all active webviews
- `getActivePanelCount()` - Get count of active panels
- `setDisposalCallback(callback)` - Set disposal callback

**Disposal Pattern** (Resource Lifecycle Management):
- Uses inherited `this.disposables` from BaseCommand (DisposableStore)
- Resources disposed in LIFO order (Last In, First Out)
- Add custom disposables: `this.disposables.add(resource)`
- Clean separation: `handlePanelDisposal()` → webview cleanup, `super.dispose()` → resources

**Example - Custom Resource Disposal**:
```typescript
class MyWebviewCommand extends BaseWebviewCommand {
    protected async initializeCommunication() {
        await super.initializeCommunication();

        // Add custom disposable - automatically cleaned up in LIFO order
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.ts');
        this.disposables.add(watcher);
    }
}
```

**Example**:
```typescript
import { BaseWebviewCommand } from '@/shared/base';
import { WebviewCommunicationManager } from '@/shared/communication';

class ProjectDashboardCommand extends BaseWebviewCommand {
    protected getWebviewId(): string {
        return 'demoBuilder.dashboard';
    }

    protected getWebviewTitle(): string {
        return 'Project Dashboard';
    }

    protected async getWebviewContent(): Promise<string> {
        const scriptUri = this.panel!.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'dist', 'webview', 'dashboard.js'))
        );
        return `<!DOCTYPE html>
            <html>
                <head>
                    <script src="${scriptUri}"></script>
                </head>
                <body>
                    <div id="root"></div>
                </body>
            </html>`;
    }

    protected getLoadingMessage(): string {
        return 'Loading dashboard...';
    }

    protected async getInitialData(): Promise<unknown> {
        const project = await this.stateManager.getCurrentProject();
        return {
            project,
            meshStatus: await this.getMeshStatus(),
        };
    }

    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        comm.on('start-demo', async () => {
            return await this.startDemo();
        });

        comm.on('stop-demo', async () => {
            return await this.stopDemo();
        });

        comm.on('get-mesh-status', async () => {
            return await this.getMeshStatus();
        });
    }

    async execute(): Promise<void> {
        const panel = await this.createOrRevealPanel();
        await this.initializeCommunication();
    }

    private async startDemo() { /* ... */ }
    private async stopDemo() { /* ... */ }
    private async getMeshStatus() { /* ... */ }
}
```

## Types

Both base classes use standard VS Code types:

- `vscode.ExtensionContext`
- `vscode.WebviewPanel`
- `vscode.Progress<T>`
- `vscode.QuickPickItem`
- `vscode.InputBoxOptions`
- `vscode.Terminal`

## Architecture

**Directory Structure**:
```
shared/base/
├── index.ts           # Public API exports
├── baseCommand.ts     # Base command class
├── baseWebviewCommand.ts # Base webview command class
└── README.md         # This file
```

**Class Hierarchy**:
```
BaseCommand
├── All standard commands
└── BaseWebviewCommand
    ├── CreateProjectWebview
    ├── ProjectDashboardWebview
    ├── ConfigureProjectWebview
    └── WelcomeWebview
```

## Usage Patterns

### Pattern 1: Standard Command

```typescript
import { BaseCommand } from '@/shared/base';

class ResetProjectCommand extends BaseCommand {
    async execute(): Promise<void> {
        const confirmed = await this.confirm(
            'Reset project?',
            'This will clear all project data'
        );

        if (!confirmed) {
            return;
        }

        await this.withProgress('Resetting project', async () => {
            await this.stateManager.clearProject();
        });

        this.showSuccessMessage('Project reset successfully');
    }
}
```

### Pattern 2: Command with User Input

```typescript
import { BaseCommand } from '@/shared/base';

class RenameProjectCommand extends BaseCommand {
    async execute(): Promise<void> {
        const project = await this.stateManager.getCurrentProject();

        if (!project) {
            await this.showError('No project loaded');
            return;
        }

        const newName = await this.showInputBox({
            prompt: 'Enter new project name',
            value: project.name,
            validateInput: (value) => {
                if (!value) return 'Name is required';
                if (!/^[a-z0-9-_]+$/.test(value)) return 'Invalid characters';
                return undefined;
            },
        });

        if (!newName) {
            return;
        }

        project.name = newName;
        await this.stateManager.saveProject(project);

        this.showSuccessMessage('Project renamed');
    }
}
```

### Pattern 3: Webview Command with Communication

```typescript
import { BaseWebviewCommand } from '@/shared/base';
import { WebviewCommunicationManager } from '@/shared/communication';

class SettingsWebviewCommand extends BaseWebviewCommand {
    protected getWebviewId(): string {
        return 'demoBuilder.settings';
    }

    protected getWebviewTitle(): string {
        return 'Settings';
    }

    protected async getWebviewContent(): Promise<string> {
        return this.loadHTML('settings.html');
    }

    protected getLoadingMessage(): string {
        return 'Loading settings...';
    }

    protected async getInitialData(): Promise<unknown> {
        return {
            settings: await this.loadSettings(),
        };
    }

    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        comm.on('save-settings', async (payload: Settings) => {
            await this.saveSettings(payload);
            return { success: true };
        });

        comm.on('reset-settings', async () => {
            await this.resetSettings();
            return { success: true };
        });
    }

    async execute(): Promise<void> {
        await this.createOrRevealPanel();
        await this.initializeCommunication();
    }
}
```

### Pattern 4: Singleton Webview Pattern

```typescript
// BaseWebviewCommand automatically implements singleton pattern
// Multiple calls to execute() will reveal existing panel

async execute(): Promise<void> {
    // First call: creates new panel
    const panel = await this.createOrRevealPanel();

    // Second call: reveals existing panel (no duplicate)
    const samePanel = await this.createOrRevealPanel();
    // panel === samePanel
}
```

## Integration

### Used By
- **Commands**: All command implementations
  - `createProjectWebview`
  - `projectDashboardWebview`
  - `configureProjectWebview`
  - `welcomeWebview`
  - `startDemo`
  - `stopDemo`
  - `deployMesh`
  - All other commands

### Dependencies
- VS Code API (`vscode`) - Command infrastructure
- `@/shared/state` - StateManager
- `@/shared/logging` - Logger
- `@/shared/communication` - WebviewCommunicationManager
- `@/utils/loadingHTML` - Webview loading states

## Best Practices

1. **Always Extend Base**: Never create commands without extending base classes
2. **Use Helper Methods**: Use `showError`, `showSuccessMessage` for consistency
3. **Progress Indicators**: Always show progress for long operations
4. **Error Handling**: Wrap risky operations in try-catch
5. **State Management**: Use `stateManager` for all persistence
6. **Singleton Webviews**: Let BaseWebviewCommand handle singleton logic
7. **Dispose Resources**: Clean up in `dispose()` method
8. **Logging**: Use `this.logger` for all logging

## Common Patterns

### Error Handling Pattern

```typescript
async execute(): Promise<void> {
    try {
        await this.withProgress('Operation', async () => {
            await this.doRiskyWork();
        });

        this.showSuccessMessage('Success!');
    } catch (error) {
        await this.showError('Operation failed', error as Error);
    }
}
```

### Confirmation Pattern

```typescript
async execute(): Promise<void> {
    const confirmed = await this.confirm(
        'Dangerous operation?',
        'This cannot be undone'
    );

    if (!confirmed) {
        return; // User cancelled
    }

    // Proceed with operation
}
```

### Quick Pick Pattern

```typescript
async execute(): Promise<void> {
    const items = await this.loadItems();

    const selected = await this.showQuickPick(
        items.map(item => ({
            label: item.name,
            description: item.description,
            detail: item.details,
        })),
        { placeHolder: 'Select an item' }
    );

    if (!selected) {
        return; // User cancelled
    }

    await this.processItem(selected);
}
```

### Webview Handshake Pattern

```typescript
async execute(): Promise<void> {
    // Step 1: Create or reveal panel
    const panel = await this.createOrRevealPanel();
    // Shows loading state automatically

    // Step 2: Initialize communication (webview-initiated handshake)
    await this.initializeCommunication();
    // Webview sends __webview_ready__, extension responds with __handshake_complete__
    // Handshake complete, webview ready

    // Step 3: Communication ready, initial data sent
    // Webview receives 'init' message with initial data
}
```

## Error Handling

Base classes provide consistent error handling:

```typescript
// BaseCommand error handling
try {
    await this.execute();
} catch (error) {
    this.logger.error('Command failed', error as Error);
    // Error already logged, command can handle or rethrow
}

// BaseWebviewCommand disposal handling
// Disposal flow (automatic, LIFO order):
// 1. User closes panel → panel.onDidDispose fires → dispose() called
// 2. handlePanelDisposal() - webview-specific cleanup
//    - Dispose communication manager
//    - Clear singleton maps (activePanels, activeCommunicationManagers)
//    - Clear panel reference
// 3. super.dispose() - inherited resource disposal (via DisposableStore, LIFO)
//    - Panel disposal listener
//    - Theme change listener
//    - Custom disposables (if added via this.disposables.add)
```

## Performance Considerations

- **Singleton Panels**: Prevents duplicate webviews (memory efficient)
- **Resource Cleanup**: Automatic disposal prevents leaks
- **Progress UI**: Non-blocking progress indicators
- **State Caching**: StateManager caches in memory
- **Lazy Loading**: Webview content loaded on demand

## Guidelines

**Adding to This Module**:
- Changes must benefit all commands
- Must maintain backward compatibility
- Must not break existing commands
- Add comprehensive documentation

**Extending Base Classes**:
When creating new commands:
1. Choose appropriate base class (BaseCommand vs BaseWebviewCommand)
2. Implement all abstract methods
3. Use helper methods for consistency
4. Follow established patterns
5. Add proper error handling
6. Document command purpose

## Migration Notes

### From Old Command Pattern

Before (legacy):
```typescript
class MyCommand {
    constructor(private context: vscode.ExtensionContext) {}

    async execute() {
        // Manual state management
        // Manual logging
        // Manual error handling
    }
}
```

After (base class):
```typescript
class MyCommand extends BaseCommand {
    async execute() {
        // Automatic state management via this.stateManager
        // Automatic logging via this.logger
        // Helper methods for errors: this.showError()
    }
}
```

## See Also

- **Related Shared Modules**:
  - `@/shared/state` - Used by BaseCommand
  - `@/shared/logging` - Used by both base classes
  - `@/shared/communication` - Used by BaseWebviewCommand

- **Related Documentation**:
  - Main architecture: `../../CLAUDE.md`
  - Shared overview: `../CLAUDE.md`
  - Commands guide: `../../src/commands/CLAUDE.md`
  - Webview guide: `../../src/webviews/CLAUDE.md`

- **Usage Examples**:
  - `src/commands/createProjectWebview.ts`
  - `src/commands/projectDashboardWebview.ts`
  - `src/features/lifecycle/commands/startDemo.ts`
  - `src/features/mesh/commands/deployMesh.ts`

---

*This is shared infrastructure - maintain high quality standards*
