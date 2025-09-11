# Race Condition Solutions

## Overview

This document details the comprehensive solution implemented to eliminate race conditions in the Demo Builder extension. The solution consists of four integrated managers that work together to ensure reliable, predictable execution.

## Problems Addressed

### 1. Webview Communication Race Conditions
- **Problem**: Messages sent before webview/React fully initialized
- **Symptoms**: Lost messages, undefined handlers, "Cannot read property of undefined"
- **Root Cause**: No synchronization between extension and webview readiness

### 2. External Command Conflicts
- **Problem**: Multiple commands accessing Adobe CLI simultaneously
- **Symptoms**: Authentication failures, wrong org/project selected, corrupted state
- **Root Cause**: No mutual exclusion for shared resources

### 3. State Inconsistency
- **Problem**: Adobe CLI state out of sync with VS Code state
- **Symptoms**: UI showing wrong organization, authentication status incorrect
- **Root Cause**: No centralized state management

### 4. Timing-Dependent Code
- **Problem**: Brittle setTimeout delays throughout codebase
- **Symptoms**: Works locally but fails in CI, intermittent failures
- **Root Cause**: Arbitrary delays instead of condition-based waiting

## Solution Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Application Layer                       │
│  (Commands, Webviews, Utilities)                         │
└─────────────┬───────────────────────────┬─────────────┘
              │                           │
┌─────────────▼─────────────┐ ┌──────────▼──────────────┐
│ WebviewCommunicationManager│ │  ExternalCommandManager  │
│                           │ │                          │
│ • Handshake Protocol      │ │ • Command Queuing        │
│ • Message Queuing         │ │ • Mutual Exclusion       │
│ • Request-Response        │ │ • Smart Polling          │
│ • Retry Logic             │ │ • Retry Strategies       │
└─────────────┬─────────────┘ └──────────┬──────────────┘
              │                           │
              └─────────────┬─────────────┘
                           │
                ┌──────────▼──────────────┐
                │    StateCoordinator      │
                │                          │
                │ • Adobe CLI State Sync   │
                │ • Project Tracking       │
                │ • Atomic Updates         │
                │ • Change Events          │
                └──────────────────────────┘
```

## Component Details

### WebviewCommunicationManager

**Purpose**: Ensures reliable bidirectional communication between extension and webview.

**Key Features**:
- **Handshake Protocol**: Three-way handshake ensures both sides ready
- **Message Queuing**: Messages queued until handshake complete
- **Request-Response**: Unique IDs for request tracking
- **Automatic Retry**: Exponential backoff for failed messages

**Implementation**:
```typescript
// Extension side
const manager = new WebviewCommunicationManager(panel);
await manager.initialize(); // Waits for handshake

// Register handlers
manager.on('action', async (data) => {
    // Handle action
    return { success: true };
});

// Send message
await manager.sendMessage('update', data);

// Request with response
const result = await manager.request('getData', { id: 123 });
```

**Webview side**:
```typescript
// Wait for handshake
await vscode.ready();

// Send message
vscode.postMessage('action', data);

// Request with response
const result = await vscode.request('getData', { id: 123 });
```

### ExternalCommandManager

**Purpose**: Manages external command execution with race protection.

**Key Features**:
- **Command Queuing**: Sequential execution of queued commands
- **Mutual Exclusion**: Resource locks prevent concurrent access
- **Smart Polling**: Condition-based waiting with exponential backoff
- **Retry Strategies**: Configurable retry for different failure types

**Usage Examples**:

```typescript
const manager = new ExternalCommandManager();

// Exclusive resource access
await manager.executeExclusive('adobe-cli', async () => {
    // Only one operation on adobe-cli at a time
    await manager.executeCommand('aio auth login');
    await manager.executeCommand('aio console org list');
});

// Smart polling instead of setTimeout
await manager.pollUntilCondition(
    async () => {
        const state = await checkAuthStatus();
        return state.authenticated;
    },
    {
        maxAttempts: 60,
        initialDelay: 1000,
        maxDelay: 5000,
        timeout: 120000,
        name: 'Adobe authentication'
    }
);

// Command with retry strategy
await manager.executeCommand(
    'aio console project create',
    { cwd: projectPath },
    manager.getStrategy('adobe-cli') // Retry on token errors
);
```

**Retry Strategies**:

```typescript
// Network operations
{
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 5000,
    backoffFactor: 2,
    shouldRetry: (error) => error.message.includes('network')
}

// File system operations
{
    maxAttempts: 3,
    initialDelay: 200,
    maxDelay: 1000,
    backoffFactor: 1.5,
    shouldRetry: (error) => error.message.includes('EBUSY')
}

// Adobe CLI operations
{
    maxAttempts: 2,
    initialDelay: 2000,
    maxDelay: 5000,
    backoffFactor: 1.5,
    shouldRetry: (error, attempt) => 
        attempt === 1 && error.message.includes('token')
}
```

### StateCoordinator

**Purpose**: Maintains consistency between Adobe CLI state and VS Code state.

**Key Features**:
- **State Synchronization**: Keeps Adobe CLI and VS Code in sync
- **Atomic Updates**: Prevents partial state changes
- **Cache Management**: TTL-based cache reduces CLI calls
- **Change Events**: Reactive updates via event system

**State Management**:

```typescript
const coordinator = new StateCoordinator(context, commandManager);

// Get current state (with cache)
const state = await coordinator.getAdobeState();
if (state.authenticated) {
    console.log(`Org: ${state.currentOrg?.name}`);
    console.log(`Project: ${state.currentProject?.name}`);
}

// Force refresh
const freshState = await coordinator.getAdobeState(true);

// Set organization (atomic operation)
await coordinator.setAdobeOrganization(orgId, orgName, orgCode);

// Track project creation
const project = await coordinator.createProject(
    'My Project',
    '/path/to/project',
    ['frontend', 'backend'],
    { orgId, projectId }
);

// Listen for changes
coordinator.onStateChange('adobe-auth', (event) => {
    console.log('Auth changed:', event.newState.authenticated);
});

// Validate consistency
const validation = await coordinator.validateStateConsistency();
if (!validation.valid) {
    console.error('Issues:', validation.issues);
}
```

### BaseWebviewCommand

**Purpose**: Standardizes webview command implementation with robust communication.

**Key Features**:
- **Standardized Lifecycle**: Consistent panel creation and disposal
- **Automatic Handshake**: Communication setup handled automatically
- **Loading States**: Built-in loading state management
- **Error Recovery**: Consistent error handling

**Implementation Pattern**:

```typescript
class MyWebviewCommand extends BaseWebviewCommand {
    protected getWebviewId(): string {
        return 'myWebview';
    }
    
    protected getWebviewTitle(): string {
        return 'My Webview';
    }
    
    protected async getWebviewContent(): Promise<string> {
        return generateHtml(this.panel!, this.context);
    }
    
    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        comm.on('action', async (data) => {
            // Handle action
            return { success: true };
        });
    }
    
    protected async getInitialData(): Promise<any> {
        return {
            config: await this.loadConfig(),
            state: await this.stateManager.getState()
        };
    }
    
    async execute(): Promise<void> {
        await this.createOrRevealPanel();
        await this.initializeCommunication();
        // Ready for interaction
    }
}
```

## Migration Guide

### Migrating Webview Commands

**Before**:
```typescript
class OldCommand {
    async execute() {
        const panel = vscode.window.createWebviewPanel(...);
        panel.webview.html = this.getHtml();
        
        // Send initial data immediately (might be lost!)
        panel.webview.postMessage({ type: 'init', data });
        
        panel.webview.onDidReceiveMessage(msg => {
            // Handle messages
        });
    }
}
```

**After**:
```typescript
class NewCommand extends BaseWebviewCommand {
    protected async getWebviewContent(): Promise<string> {
        return this.getHtml();
    }
    
    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        // Handlers registered before any messages sent
    }
    
    protected async getInitialData(): Promise<any> {
        return data; // Sent after handshake complete
    }
}
```

### Migrating External Commands

**Before**:
```typescript
// Race condition prone
exec('aio auth login', (error, stdout) => {
    if (!error) {
        exec('aio console org list', (err2, stdout2) => {
            // Nested callbacks
        });
    }
});

// Brittle timing
await new Promise(resolve => setTimeout(resolve, 3000));
const result = await checkStatus();
```

**After**:
```typescript
// Race-safe execution
await commandManager.executeExclusive('adobe-cli', async () => {
    await commandManager.executeCommand('aio auth login');
    const orgs = await commandManager.executeCommand('aio console org list');
    return JSON.parse(orgs.stdout);
});

// Condition-based waiting
await commandManager.pollUntilCondition(
    () => checkStatus(),
    { timeout: 30000, name: 'status check' }
);
```

### Migrating Adobe CLI Operations

**Before** (AdobeAuthManager):
```typescript
async login(): Promise<boolean> {
    exec('aio auth login -f', (error) => {
        // Fire and forget
    });
    
    // Poll with setTimeout
    setTimeout(async () => {
        const authenticated = await this.checkAuth();
        // ...
    }, 3000);
}
```

**After** (AdobeAuthManagerV2):
```typescript
async login(): Promise<boolean> {
    return this.commandManager.executeExclusive('adobe-auth', async () => {
        // Start login
        const loginPromise = this.commandManager.executeCommand('aio auth login -f');
        
        // Poll for completion
        await this.commandManager.pollUntilCondition(
            async () => {
                const state = await this.stateCoordinator.getAdobeState(true);
                return state.authenticated;
            },
            { timeout: 120000, name: 'Adobe authentication' }
        );
        
        return true;
    });
}
```

## Testing Race Conditions

### Manual Testing

1. **Rapid Navigation**: Click through wizard steps quickly
2. **Concurrent Operations**: Start multiple operations simultaneously
3. **Network Interruption**: Disconnect/reconnect during operations
4. **Process Termination**: Kill external processes during execution
5. **State Corruption**: Manually edit state files during operation

### Automated Testing

```typescript
describe('Race Condition Tests', () => {
    it('should handle concurrent Adobe CLI access', async () => {
        const manager = new ExternalCommandManager();
        
        // Start multiple operations
        const results = await Promise.all([
            manager.executeExclusive('adobe-cli', () => operation1()),
            manager.executeExclusive('adobe-cli', () => operation2()),
            manager.executeExclusive('adobe-cli', () => operation3())
        ]);
        
        // All should complete without errors
        expect(results).toHaveLength(3);
    });
    
    it('should handle webview not ready', async () => {
        const panel = createWebviewPanel();
        const manager = new WebviewCommunicationManager(panel);
        
        // Send message before handshake
        const promise = manager.sendMessage('test', data);
        
        // Initialize later
        await manager.initialize();
        
        // Message should still be delivered
        await expect(promise).resolves.not.toThrow();
    });
});
```

## Performance Considerations

### Message Queuing
- Queue size limited to prevent memory issues
- Old messages pruned after timeout
- Batch processing for efficiency

### Polling Optimization
- Exponential backoff reduces CPU usage
- Max delay prevents excessive waiting
- Condition functions should be lightweight

### State Caching
- 5-minute TTL balances freshness and performance
- Force refresh available when needed
- Background refresh for authenticated sessions

## Troubleshooting

### Common Issues

**Issue**: "Handshake timeout"
- **Cause**: Webview not responding
- **Solution**: Check React initialization, ensure vscode.ready() called

**Issue**: "Resource locked"
- **Cause**: Previous operation didn't release lock
- **Solution**: Implement proper error handling with finally blocks

**Issue**: "Polling timeout"
- **Cause**: Condition never met
- **Solution**: Verify condition logic, increase timeout if needed

**Issue**: "State mismatch"
- **Cause**: Manual CLI operations outside extension
- **Solution**: Force refresh state, use validation

### Debug Logging

Enable verbose logging:
```typescript
const manager = new WebviewCommunicationManager(panel, {
    enableLogging: true
});

const commandManager = new ExternalCommandManager();
// Logs all command execution details

const coordinator = new StateCoordinator(context, commandManager);
// Logs all state changes
```

## Future Improvements

1. **Circuit Breaker Pattern**: Prevent cascading failures
2. **Rate Limiting**: Prevent overwhelming external services
3. **Distributed Locking**: Support multiple VS Code instances
4. **Event Sourcing**: Full audit trail of state changes
5. **Saga Pattern**: Complex multi-step transactions

## References

- [VS Code Extension API](https://code.visualstudio.com/api)
- [Node.js Child Process](https://nodejs.org/api/child_process.html)
- [Exponential Backoff](https://en.wikipedia.org/wiki/Exponential_backoff)
- [Mutual Exclusion](https://en.wikipedia.org/wiki/Mutual_exclusion)