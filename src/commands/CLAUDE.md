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

**Message Protocol**:
```typescript
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

### createProject (Legacy)

**Purpose**: Quick project creation without wizard
- Simplified flow for experienced users
- Command-line style interaction
- Minimal UI involvement

### showLogs

**Purpose**: Display extension logs
- Opens output channel
- Shows debug information
- Helpful for troubleshooting

### clearCache

**Purpose**: Clear cached data
- Resets component definitions
- Clears prerequisite status
- Useful for debugging

## Command Patterns

### Webview Command Pattern

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

## Testing Commands

### Manual Testing Checklist
- [ ] Command appears in palette
- [ ] Keyboard shortcuts work
- [ ] UI buttons trigger command
- [ ] Error cases handled gracefully
- [ ] Progress shown correctly
- [ ] Cancellation works
- [ ] State persisted properly

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