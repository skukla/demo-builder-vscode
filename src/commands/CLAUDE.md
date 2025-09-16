# Commands Module

## Overview

The commands module contains all VS Code command implementations for the Demo Builder extension. Each command represents a user-facing action that can be triggered via the command palette, UI buttons, or programmatically.

## Command Structure

```
commands/
├── createProject.ts         # Original quick-create command
├── createProjectWebview.ts  # Main wizard implementation
├── showCommands.ts          # Command palette helper
├── showLogs.ts             # Log viewer command
├── clearCache.ts           # Cache management
└── index.ts                # Command registration
```

## Command Registration Flow

```typescript
// In extension.ts
export function activate(context: vscode.ExtensionContext) {
    // Register all commands
    context.subscriptions.push(
        vscode.commands.registerCommand('demo-builder.createProject', 
            () => new CreateProjectCommand().execute())
    );
}
```

## Main Commands

### createProjectWebview (Primary Command)

**Purpose**: Launch the full project creation wizard

**Key Components**:
- `CreateProjectWebviewCommand` class
- Manages webview lifecycle
- Handles message passing
- Orchestrates prerequisite checking
- Manages project creation flow

**Important Methods**:
```typescript
class CreateProjectWebviewCommand {
    async execute() {
        // 1. Create webview panel
        // 2. Load React app
        // 3. Handle messages
        // 4. Manage state
    }
    
    async handleMessage(message: any) {
        switch(message.type) {
            case 'checkPrerequisites':
            case 'installPrerequisite':
            case 'createProject':
            // ... handle each message type
        }
    }
}
```

**Message Protocol Evolution**:

Starting with v1.5.0, the message handling was fundamentally improved to fix critical async handler resolution issues.

**Legacy Pattern (Pre v1.5.0)**:
```typescript
// ❌ Problematic - handlers not awaited
panel.webview.onDidReceiveMessage(message => {
    // This returned Promise objects to UI instead of resolved values
    return this.handleMessage(message);
});

// Extension → Webview
panel.webview.postMessage({
    type: 'prerequisiteStatus',
    data: { status: 'checking', progress: 50 }
});

// Webview → Extension
vscode.postMessage({
    type: 'installPrerequisite',
    prereqId: 'node',
    version: '20.11.0'
});
```

**Modern Pattern (v1.5.0+)**:
```typescript
// ✅ Fixed - handlers properly awaited via WebviewCommunicationManager
class CreateProjectWebviewCommand extends BaseWebviewCommand {
    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        // Now properly handles async responses
        comm.on('get-projects', async (payload) => {
            return await this.adobeAuth.getProjects(payload.orgId);
        });

        comm.on('select-project', async (payload) => {
            return await this.adobeAuth.selectProject(payload.projectId);
        });
    }
}
```

**Backend Call on Continue Pattern**:
The major UX change in v1.5.0 implements the "Backend Call on Continue" pattern, where:

1. **Selection UI Updates**: Immediate visual feedback on selection
2. **Backend Calls Deferred**: Actual backend operations happen when user clicks Continue
3. **Loading Overlay**: Simple spinner during backend confirmation
4. **Error Recovery**: Clear error handling at the commitment point

```typescript
// UI-only selection handlers
comm.on('project-selected', (payload) => {
    // Immediate UI update - no backend call
    this.updateUIState({
        selectedProject: payload.project
    });
});

// Backend calls during Continue action
comm.on('continue-step', async (payload) => {
    if (payload.step === 'adobe-project' && payload.selectedProject) {
        // Now make the actual backend call
        const result = await this.adobeAuth.selectProject(payload.selectedProject.id);
        if (!result.success) {
            throw new Error(result.error || 'Failed to select project');
        }
    }
});
```

### createProject (Legacy)

**Purpose**: Quick project creation without wizard
- Simplified flow for experienced users
- Command-line style interaction
- Minimal UI involvement

### diagnostics

**Purpose**: Comprehensive system diagnostics
- Collects system and tool information
- Tests Adobe CLI authentication
- Verifies browser launch capability
- Exports debug logs for sharing

**Implementation**:
```typescript
class DiagnosticsCommand {
    async execute() {
        // Collect system info
        const system = await this.getSystemInfo();
        
        // Check tool versions
        const tools = await this.checkTools();
        
        // Test Adobe CLI
        const adobe = await this.checkAdobeCLI();
        
        // Run diagnostic tests
        const tests = await this.runTests();
        
        // Log full report to debug channel
        logger.debug('DIAGNOSTIC REPORT', report);
        
        // Show summary in main output
        this.showSummary(report);
    }
}
```

**Output**:
- System information (OS, architecture, VS Code version)
- Tool versions (Node.js, npm, fnm, git, Adobe CLI)
- Adobe authentication status and configuration
- Environment variables (PATH, HOME, etc.)
- Test results (browser launch, file system access)

### showLogs

**Purpose**: Display extension logs
- Opens "Demo Builder: Logs" output channel
- Shows user-facing messages
- Quick access to error/warning information

### clearCache

**Purpose**: Clear cached data
- Resets component definitions
- Clears prerequisite status
- Useful for debugging

## Command Patterns

### BaseWebviewCommand Pattern (Recommended)

The new BaseWebviewCommand provides standardized webview handling with robust communication:

```typescript
import { BaseWebviewCommand } from './baseWebviewCommand';
import { WebviewCommunicationManager } from '../utils/webviewCommunicationManager';

class MyWebviewCommand extends BaseWebviewCommand {
    protected getWebviewId(): string {
        return 'myWebview';
    }
    
    protected getWebviewTitle(): string {
        return 'My Webview';
    }
    
    protected async getWebviewContent(): Promise<string> {
        // Return HTML with React app
        return getHtmlContent(this.panel!, this.context);
    }
    
    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        // Register message handlers
        comm.on('action', async (data) => {
            // Handle action
            return { success: true };
        });
        
        comm.on('getData', async () => {
            return await this.fetchData();
        });
    }
    
    protected async getInitialData(): Promise<any> {
        return {
            config: await this.loadConfig(),
            state: await this.stateManager.getState()
        };
    }
    
    async execute(): Promise<void> {
        // Create panel
        await this.createOrRevealPanel();
        
        // Initialize communication with handshake
        await this.initializeCommunication();
        
        // Webview is ready for interaction
    }
}
```

**Key Benefits**:
- Automatic handshake protocol
- Message queuing until ready
- Built-in retry logic
- Standardized error handling
- Consistent logging

### Legacy Webview Pattern

For existing commands not yet migrated:

```typescript
class WebviewCommand {
    private panel: vscode.WebviewPanel | undefined;
    
    async execute() {
        // Create or reveal panel
        this.panel = vscode.window.createWebviewPanel(...);
        
        // Set content
        this.panel.webview.html = this.getWebviewContent();
        
        // Handle messages
        this.panel.webview.onDidReceiveMessage(
            message => this.handleMessage(message)
        );
    }
    
    private getWebviewContent(): string {
        // Return HTML with React app
    }
    
    private async handleMessage(message: any) {
        // Process messages from webview
    }
}
```

### Simple Command Pattern

```typescript
class SimpleCommand {
    async execute(context: vscode.ExtensionContext) {
        try {
            // Perform action
            const result = await this.doWork();
            
            // Show success
            vscode.window.showInformationMessage('Success!');
        } catch (error) {
            // Handle error
            vscode.window.showErrorMessage('Failed: ' + error.message);
        }
    }
}
```

## Key Responsibilities

### Prerequisite Management
- Check for required tools
- Trigger installations
- Track progress
- Report status to UI

### Project Creation
- Gather user inputs
- Validate selections
- Execute creation scripts
- Monitor progress
- Handle errors

### State Management
- Persist wizard state
- Resume interrupted flows
- Cache user preferences

## Integration Points

### With Utils
- Uses PrerequisitesManager for tool checking
- Uses ProgressUnifier for progress tracking
- Uses StateManager for persistence
- Uses ErrorLogger for error handling

### With Webviews
- Provides data to React components
- Receives user actions
- Manages webview lifecycle
- Handles resource loading

### With Templates
- Loads component definitions
- Reads prerequisite configurations
- Applies project templates

## Error Handling Strategy

```typescript
try {
    // Risky operation
    await this.createProject(config);
} catch (error) {
    // Log for debugging
    this.logger.error('Project creation failed', error);
    
    // User-friendly message
    const message = this.getUserFriendlyError(error);
    
    // Show to user with action
    const action = await vscode.window.showErrorMessage(
        message,
        'Retry',
        'View Logs'
    );
    
    if (action === 'Retry') {
        return this.execute();
    } else if (action === 'View Logs') {
        vscode.commands.executeCommand('demo-builder.showLogs');
    }
}
```

## Timeout Handling in Commands

**Critical Issue**: Adobe CLI commands often succeed but timeout due to restrictive timeout values.

**Solution Pattern**:
```typescript
import { TIMEOUT_CONFIG } from '../utils/timeoutConfig';

class CreateProjectWebviewCommand extends BaseWebviewCommand {
    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        comm.on('select-project', async (payload) => {
            try {
                // Use appropriate timeout for operation
                const result = await this.adobeAuth.selectProject(payload.projectId, {
                    timeout: TIMEOUT_CONFIG.CONFIG_WRITE  // 10 seconds
                });
                return { success: true, data: result };
            } catch (error) {
                // Check for success despite timeout
                if (error.stdout && error.stdout.includes('Project selected :')) {
                    return { success: true, message: 'Project selected successfully' };
                }
                throw error;
            }
        });
    }
}
```

**Key Patterns**:
1. **Use TIMEOUT_CONFIG**: Centralized timeout management
2. **Success Detection**: Check stdout for success indicators in catch blocks
3. **Graceful Degradation**: Continue operation even if timeout occurred but command succeeded
4. **User Feedback**: Clear loading states during potentially slow operations

## Testing Commands

### Manual Testing Checklist
- [ ] Command appears in palette
- [ ] Keyboard shortcuts work
- [ ] UI buttons trigger command
- [ ] Error cases handled gracefully
- [ ] Progress shown correctly
- [ ] Cancellation works
- [ ] State persisted properly
- [ ] Timeout scenarios handled (Adobe CLI commands)

### Common Issues

1. **Webview Not Loading**
   - Check webpack build
   - Verify resource paths
   - Check CSP settings

2. **Messages Not Received**
   - Verify message types match
   - Check panel.webview reference
   - Ensure listener registered

3. **State Not Persisting**
   - Verify StateManager usage
   - Check context.globalState
   - Handle migration cases

## Adding New Commands

1. Create command file in `commands/`
2. Implement Command interface
3. Register in extension.ts
4. Add to package.json contributions
5. Document in this file
6. Add tests

## Performance Considerations

- Lazy load heavy dependencies
- Cache webview content
- Debounce rapid messages
- Use progress indicators
- Cancel long-running operations

---

For webview details, see `../webviews/CLAUDE.md`
For utility integration, see `../utils/CLAUDE.md`