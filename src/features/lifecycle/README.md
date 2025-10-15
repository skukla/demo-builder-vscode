# Lifecycle Feature

## Purpose

The Lifecycle feature manages the complete lifecycle of demo projects, including starting, stopping, and restarting demo servers. It handles process management, terminal integration, port availability checking, and state synchronization between the extension and running processes.

This feature ensures clean startup/shutdown, graceful port conflict resolution, and proper state tracking for demo status display throughout the extension.

## Responsibilities

- **Demo Server Startup**: Start frontend development servers in VS Code terminals
- **Demo Server Shutdown**: Stop running servers and clean up processes
- **Port Management**: Check port availability and resolve conflicts
- **Process Identification**: Identify what's running on ports (for conflict resolution)
- **Terminal Management**: Create and manage project-specific terminals
- **State Synchronization**: Update project status (ready, starting, running, stopping)
- **Environment Capture**: Capture frontend env vars for change detection
- **File Hash Initialization**: Initialize .env file hashes for change notifications
- **Status Bar Updates**: Update VS Code status bar with demo state
- **Grace Period Management**: Suppress notifications during startup/shutdown transitions

## Key Services

### StartDemoCommand

**Purpose**: Start the demo server with port checking and graceful startup

**Key Operations**:
1. Validate project exists and is not already running
2. Check port availability (default 3000, configurable)
3. Resolve port conflicts (prompt user to stop conflicting process)
4. Create project-specific terminal
5. Navigate to frontend directory and start dev server
6. Update project status (starting → running)
7. Capture frontend env state for change detection
8. Initialize .env file hashes for change notifications
9. Update status bar

**Example Usage**:
```typescript
import { StartDemoCommand } from '@/features/lifecycle';

const startCommand = new StartDemoCommand(
    context,
    stateManager,
    logger,
    statusBar
);

await startCommand.execute();
```

### StopDemoCommand

**Purpose**: Stop the demo server and clean up resources

**Key Operations**:
1. Find project-specific terminal
2. Dispose terminal (triggers process shutdown)
3. Wait for port to be freed (up to 10 seconds)
4. Update project status (stopping → ready)
5. Clear frontend env state
6. Notify extension to reset env change grace period
7. Update status bar

**Example Usage**:
```typescript
import { StopDemoCommand } from '@/features/lifecycle';

const stopCommand = new StopDemoCommand(
    context,
    stateManager,
    logger,
    statusBar
);

await stopCommand.execute();
```

## Architecture

**Directory Structure**:
```
features/lifecycle/
├── index.ts                   # Public API exports
├── commands/
│   ├── startDemo.ts          # Start demo command
│   └── stopDemo.ts           # Stop demo command
├── handlers/
│   ├── index.ts              # Handler exports
│   └── lifecycleHandlers.ts  # Message handlers for UI
└── README.md                 # This file
```

**State Transitions**:
```
┌─────────┐   start    ┌──────────┐   complete   ┌─────────┐
│  ready  │ ─────────→ │ starting │ ──────────→ │ running │
└─────────┘            └──────────┘              └─────────┘
     ↑                                                 │
     │                                                 │
     │                  ┌──────────┐    stop          │
     └────────────────  │ stopping │ ←────────────────┘
            complete    └──────────┘
```

## Integration Points

### Dependencies
- `@/shared/base` - BaseCommand for command infrastructure
- `@/shared/state` - updateFrontendState for env var capture
- `@/shared/command-execution` - CommandExecutor for port checking and process management
- `@/services/serviceLocator` - ServiceLocator for CommandExecutor access
- `vscode` - Terminal, window, commands APIs

### Used By
- `src/extension.ts` - Command registration (demoBuilder.startDemo, demoBuilder.stopDemo)
- `src/features/dashboard` - Start/Stop buttons
- `src/commands/configure.ts` - Restart after configuration changes
- `src/statusBar.ts` - Status bar demo status display

## Usage Examples

### Example 1: Start Demo from Command Palette
```typescript
// Registered in extension.ts
context.subscriptions.push(
    vscode.commands.registerCommand('demoBuilder.startDemo', async () => {
        const startCommand = new StartDemoCommand(
            context,
            stateManager,
            logger,
            statusBar
        );
        await startCommand.execute();
    })
);
```

### Example 2: Stop Demo Programmatically
```typescript
// From dashboard or other features
await vscode.commands.executeCommand('demoBuilder.stopDemo');

// Wait for stop to complete
await new Promise(resolve => setTimeout(resolve, 1000));

// Verify stopped
const project = await stateManager.getCurrentProject();
if (project.status === 'ready') {
    console.log('Demo stopped successfully');
}
```

### Example 3: Restart Demo After Configuration Change
```typescript
import { updateFrontendState } from '@/shared/state';

// User changed configuration in Configure UI
const project = await stateManager.getCurrentProject();

if (project.status === 'running') {
    // Check if configuration actually changed
    const currentConfig = project.componentConfigs?.['citisignal-nextjs'];
    const currentEnvVars = getFrontendEnvVars(currentConfig);
    const deployedEnvVars = project.frontendEnvState?.envVars || {};

    let hasChanges = false;
    for (const key of Object.keys(currentEnvVars)) {
        if (currentEnvVars[key] !== deployedEnvVars[key]) {
            hasChanges = true;
            break;
        }
    }

    if (hasChanges) {
        const restart = await vscode.window.showInformationMessage(
            'Configuration changed. Restart demo?',
            'Restart',
            'Later'
        );

        if (restart === 'Restart') {
            await vscode.commands.executeCommand('demoBuilder.stopDemo');
            await new Promise(resolve => setTimeout(resolve, 1000));
            await vscode.commands.executeCommand('demoBuilder.startDemo');
        }
    }
}
```

### Example 4: Handle Port Conflicts
```typescript
// Handled automatically in StartDemoCommand
const port = 3000;
const portAvailable = await commandManager.isPortAvailable(port);

if (!portAvailable) {
    // Identify process on port
    const result = await commandManager.execute(`lsof -i:${port}`);
    const lines = result.stdout.trim().split('\n');
    const processLine = lines[1].trim();
    const parts = processLine.split(/\s+/);
    const processName = parts[0];
    const pid = parts[1];

    // Ask user
    const action = await vscode.window.showWarningMessage(
        `Port ${port} in use by ${processName} (PID: ${pid}). Stop it and start demo?`,
        'Stop & Start',
        'Cancel'
    );

    if (action === 'Stop & Start') {
        // Kill process
        await commandManager.execute(`lsof -ti:${port} | xargs kill`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Continue with start
    }
}
```

### Example 5: Monitor Demo Status
```typescript
// From dashboard or status bar
const project = await stateManager.getCurrentProject();

switch (project.status) {
    case 'ready':
        // Show "Start Demo" button
        break;
    case 'starting':
        // Show spinner "Starting..."
        break;
    case 'running':
        // Show "Stop Demo" and "Open Browser" buttons
        // Display port: http://localhost:3000
        break;
    case 'stopping':
        // Show spinner "Stopping..."
        break;
}
```

## Configuration

### Extension Settings
```json
{
    "demoBuilder.defaultPort": {
        "type": "number",
        "default": 3000,
        "description": "Default port for demo frontend server"
    }
}
```

### Component Configuration
```typescript
// Component instance stores port
project.componentInstances!['citisignal-nextjs'].port = 3000;

// Component metadata stores Node version
project.componentInstances!['citisignal-nextjs'].metadata = {
    nodeVersion: '20'
};
```

### Frontend Env State
```typescript
// Captured during start, used for change detection
project.frontendEnvState = {
    envVars: {
        'NEXT_PUBLIC_API_ENDPOINT': 'https://...',
        'NEXT_PUBLIC_MESH_ENDPOINT': 'https://...',
        // ... other frontend env vars
    }
};
```

## Error Handling

### Port Conflicts
```typescript
try {
    await startCommand.execute();
} catch (error) {
    if (error.message.includes('port') && error.message.includes('in use')) {
        // Port conflict - user cancelled or stop failed
        vscode.window.showErrorMessage(
            'Failed to start demo: Port already in use. Try stopping it manually.'
        );
    }
}
```

### Process Cleanup
```typescript
// In StopDemoCommand
const portFreed = await this.waitForPortToFree(port, 10000);

if (!portFreed) {
    this.logger.warn(`Port ${port} still in use after 10 seconds`);
    vscode.window.showWarningMessage(
        `Port ${port} may still be in use. Wait a moment before restarting.`
    );
}
```

### Missing Project
```typescript
const project = await stateManager.getCurrentProject();

if (!project) {
    const create = await vscode.window.showInformationMessage(
        'No Demo Builder project found.',
        'Create Project',
        'Cancel'
    );

    if (create === 'Create Project') {
        await vscode.commands.executeCommand('demoBuilder.createProject');
    }
    return;
}
```

## Performance Considerations

### Port Checking
- **Port availability check**: Instant (Node net.createServer)
- **Process identification**: ~100ms (lsof command)
- **Port free wait**: Up to 10 seconds with 500ms polling

### Terminal Management
- Terminals created on-demand (not persistent)
- Project-specific terminal names for easy identification
- Terminal disposal triggers automatic process cleanup (SIGHUP)

### State Updates
- Immediate status updates (starting, running, stopping, ready)
- Status bar updates after state changes
- Frontend env state captured synchronously during start

### Best Practices
1. **Check port availability BEFORE starting**: Prevents failed starts
2. **Wait for port to free after stop**: Ensures clean shutdown
3. **Use project-specific terminal names**: Easy to find and manage
4. **Update status immediately**: Prevents double-clicks
5. **Capture env state after start**: Enables change detection

## State Management

### Project Status Field
```typescript
interface Project {
    status: 'ready' | 'starting' | 'running' | 'stopping';
    frontendEnvState?: {
        envVars: Record<string, string>;
    };
    componentInstances?: {
        'citisignal-nextjs': {
            status: 'stopped' | 'starting' | 'running' | 'stopping';
            port?: number;
        };
    };
}
```

### Internal Commands
The feature uses internal commands for coordination:
- `demoBuilder._internal.demoStarted` - Notifies extension that demo started (suppresses notifications)
- `demoBuilder._internal.demoStopped` - Notifies extension that demo stopped (resets grace period)
- `demoBuilder._internal.initializeFileHashes` - Initializes .env file hashes for change detection
- `demoBuilder._internal.restartActionTaken` - Resets restart notification flag

## Terminal Integration

### Terminal Creation
```typescript
const terminalName = `${project.name} - Frontend`;
const terminal = vscode.window.createTerminal({
    name: terminalName,
    cwd: frontendPath
});

terminal.show();
```

### Command Execution in Terminal
```typescript
// Navigate to frontend directory
terminal.sendText(`cd "${frontendPath}"`);

// Use fnm to switch Node version and run dev server
terminal.sendText(`fnm use ${nodeVersion} && npm run dev`);
```

### Terminal Cleanup
```typescript
// Find and dispose project terminal
vscode.window.terminals.forEach(terminal => {
    if (terminal.name === terminalName) {
        terminal.dispose(); // Triggers SIGHUP to process
    }
});
```

## Testing

### Manual Testing Checklist
- [ ] Start demo from command palette
- [ ] Start demo from dashboard
- [ ] Stop demo from command palette
- [ ] Stop demo from dashboard
- [ ] Port conflict detection and resolution
- [ ] Terminal created with correct name
- [ ] Dev server starts successfully
- [ ] Status bar updates correctly
- [ ] Port freed after stop
- [ ] Frontend env state captured
- [ ] .env file hashes initialized
- [ ] Restart after configuration change
- [ ] Grace period notifications suppressed

### Integration Testing
- Test start → stop → start cycle
- Test port conflict resolution flow
- Test status bar state transitions
- Test with different Node versions
- Test with different ports
- Test error scenarios (no project, port unavailable, process kill failed)

## See Also

- **[Dashboard Feature](../dashboard/README.md)** - Start/Stop UI buttons
- **[Mesh Feature](../mesh/README.md)** - Mesh deployment after start
- **[State Management](../shared/state/CLAUDE.md)** - Project state persistence
- **[Status Bar](../../providers/statusBar.ts)** - Status bar integration
- **[Command Execution](../shared/command-execution/CLAUDE.md)** - Port checking and process management

---

For overall architecture, see `../../CLAUDE.md`
For shared infrastructure, see `../shared/CLAUDE.md`
