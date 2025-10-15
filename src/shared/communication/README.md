# Communication Infrastructure

## Purpose

The communication module provides robust, bidirectional messaging between VS Code extension (backend) and webview (frontend). It implements a reliable message protocol with handshake verification, request-response patterns, timeout management, automatic retry, and message queuing.

This module solves critical race conditions that occur during webview initialization and provides a type-safe, async-friendly communication layer that all webview-based commands depend on.

## When to Use

Use this module when:
- Creating webview-based commands or UI panels
- Sending messages from extension to webview
- Handling requests from webview with responses
- Implementing request-response patterns between extension and UI
- Ensuring messages don't get lost during webview initialization
- Managing message timeouts for long-running operations

Do NOT use when:
- Communicating between different extension components (use direct imports)
- Sending messages between features (use dependency injection)
- Building non-webview commands (use VS Code API directly)

## Key Exports

### WebviewCommunicationManager

**Purpose**: Manages all communication between extension and webview with robust handshake protocol

**Usage**:
```typescript
import { createWebviewCommunication } from '@/shared/communication';

const comm = await createWebviewCommunication(panel, {
    enableLogging: true,
    handshakeTimeout: 15000,
    messageTimeout: 30000,
});

// Register message handler
comm.on('get-projects', async (payload) => {
    const projects = await authService.getProjects(payload.orgId);
    return projects;
});

// Send message
await comm.sendMessage('update-status', { status: 'ready' });

// Request-response
const result = await comm.request('check-auth');
```

**Key Methods**:
- `initialize()` - Initialize with two-way handshake
- `sendMessage(type, payload?)` - Fire-and-forget message
- `request<T>(type, payload?)` - Send request, wait for response
- `on(type, handler)` - Register message handler
- `once(type, handler)` - Register one-time handler
- `incrementStateVersion()` - Bump state version
- `getStateVersion()` - Get current state version
- `dispose()` - Clean up resources

**Properties**:
- Two-way handshake protocol (waits for both sides ready)
- Message queuing until handshake complete
- Request-response with timeout
- Automatic retry for failed messages
- State version tracking
- Comprehensive debug logging

**Example**:
```typescript
import { createWebviewCommunication } from '@/shared/communication';

// Create communication manager
const comm = await createWebviewCommunication(panel, {
    enableLogging: true,
    handshakeTimeout: 15000,
    messageTimeout: 30000,
    maxRetries: 3,
    retryDelay: 1000,
});

// Register handlers for webview requests
comm.on('get-projects', async (payload: { orgId: string }) => {
    // CRITICAL: Handler is automatically awaited (v1.5.0 fix)
    const projects = await authService.getProjects(payload.orgId);
    return projects; // Resolved value sent to webview, not Promise
});

comm.on('select-project', async (payload: { projectId: string }) => {
    await configService.selectProject(payload.projectId);
    return { success: true };
});

// Send messages to webview
await comm.sendMessage('status-update', { status: 'loading' });

// Request-response from webview
const result = await comm.request('validate-form', { field: 'name', value: 'test' });
```

### createWebviewCommunication (Factory)

**Purpose**: Factory function to create and initialize communication manager

**Usage**:
```typescript
import { createWebviewCommunication } from '@/shared/communication';

const comm = await createWebviewCommunication(panel, config);
```

**Parameters**:
- `panel` - VS Code WebviewPanel instance
- `config?` - Optional configuration object

**Configuration Options**:
```typescript
interface CommunicationConfig {
    handshakeTimeout?: number;    // Default: 10000ms
    messageTimeout?: number;       // Default: 30000ms
    maxRetries?: number;           // Default: 3
    retryDelay?: number;           // Default: 1000ms
    enableLogging?: boolean;       // Default: true
}
```

**Returns**: Promise<WebviewCommunicationManager>

**Example**:
```typescript
const comm = await createWebviewCommunication(panel, {
    handshakeTimeout: 15000,  // 15s for slow webview loads
    messageTimeout: 60000,    // 60s for long operations
    maxRetries: 5,            // More retries for flaky connections
    enableLogging: true,      // Enable debug logging
});
```

## Types

### Message

Core message structure:

```typescript
interface Message {
    id: string;              // Unique message ID
    type: MessageType;       // Message type
    payload?: MessagePayload; // Optional payload
    timestamp: number;       // Timestamp
    isResponse?: boolean;    // Is this a response?
    responseToId?: string;   // ID of request being responded to
    error?: string;          // Error message if failed
    expectsResponse?: boolean; // Does sender expect a response?
}
```

### MessageType

```typescript
type MessageType =
    | 'init'
    | 'get-projects'
    | 'select-project'
    | 'update-status'
    // ... many more
    | '__extension_ready__'
    | '__webview_ready__'
    | '__handshake_complete__'
    | '__response__'
    | '__acknowledge__'
    | '__timeout_hint__';
```

### PendingRequest

Tracks pending request-response:

```typescript
interface PendingRequest {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
    retryCount: number;
    message: Message;
}
```

## Architecture

**Directory Structure**:
```
shared/communication/
├── index.ts                         # Public API exports
├── webviewCommunicationManager.ts   # Main communication manager
└── README.md                        # This file
```

**Handshake Protocol**:
```
Extension                          Webview
    |                                 |
    |-- __extension_ready__ --------> |
    |                                 |
    | <--------- __webview_ready__ --|
    |                                 |
    |-- __handshake_complete__ -----> |
    |                                 |
    |====== Communication Ready ======|
    |                                 |
    |-- Flush queued messages ------> |
```

## Usage Patterns

### Pattern 1: Webview Command Setup

```typescript
import { BaseWebviewCommand } from '@/shared/base';
import { WebviewCommunicationManager } from '@/shared/communication';

class MyWebviewCommand extends BaseWebviewCommand {
    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        // Data loading
        comm.on('get-data', async () => {
            return await this.loadData();
        });

        // User actions
        comm.on('submit-form', async (payload: FormData) => {
            return await this.handleSubmit(payload);
        });

        // State updates
        comm.on('update-settings', async (payload: Settings) => {
            await this.saveSettings(payload);
            return { success: true };
        });
    }

    async execute() {
        const panel = await this.createOrRevealPanel();
        await this.initializeCommunication();
        // Communication ready, handlers registered
    }
}
```

### Pattern 2: Request-Response Pattern

```typescript
// Extension → Webview request
const result = await comm.request<ProjectData>('get-project-details', {
    projectId: '12345'
});

// Webview handler (auto-awaited)
comm.on('get-project-details', async (payload: { projectId: string }) => {
    const details = await fetchProjectDetails(payload.projectId);
    return details; // Returned value sent as response
});
```

### Pattern 3: Fire-and-Forget Messages

```typescript
// Extension → Webview (no response expected)
await comm.sendMessage('status-update', {
    status: 'loading',
    message: 'Fetching data...'
});

// Webview handler
comm.on('status-update', (payload: { status: string; message: string }) => {
    updateUI(payload.status, payload.message);
    // No return value needed
});
```

### Pattern 4: Extended Timeout Operations

```typescript
// Backend specifies timeout for long operations
const REQUEST_TIMEOUTS: Record<string, number> = {
    'authenticate': 60000,        // Browser auth flow
    'get-projects': 30000,        // API call
    'deploy-mesh': 120000,        // Deployment
};

// Frontend automatically receives timeout hint
comm.on('authenticate', async () => {
    // Frontend gets __timeout_hint__ message automatically
    // Adjusts timeout for this specific request
    return await performAuthentication();
});
```

### Pattern 5: Message Queuing

```typescript
const comm = new WebviewCommunicationManager(panel);

// Send before handshake - message is queued
await comm.sendMessage('init-data', data);

// Initialize (performs handshake)
await comm.initialize();

// Queued messages automatically flushed after handshake
```

## Integration

### Used By
- **Commands**:
  - `createProjectWebview` - Wizard communication
  - `projectDashboardWebview` - Dashboard UI
  - `configureProjectWebview` - Configuration UI
- **Shared**:
  - `BaseWebviewCommand` - Base class for all webview commands

### Dependencies
- VS Code API (`vscode`) - WebviewPanel, Disposable
- `uuid` - Message ID generation
- `@/types/messages` - Message types and payloads
- `@/shared/logging` - Debug logging
- `@/utils/timeoutConfig` - Timeout configuration

## Best Practices

1. **Always Use Factory**: Use `createWebviewCommunication()` instead of direct constructor
2. **Await Handlers**: Async handlers are automatically awaited (v1.5.0 fix)
3. **Type Payloads**: Use TypeScript types for message payloads
4. **Handle Errors**: Wrap handler logic in try-catch for graceful error handling
5. **Set Timeouts**: Use appropriate timeouts for different operation types
6. **Register Before Init**: Register all handlers before calling `initialize()`
7. **Dispose Properly**: Always call `dispose()` when webview closes

## Common Patterns

### Async Handler Resolution (v1.5.0 Fix)

```typescript
// BEFORE (v1.4.0 - BROKEN)
comm.on('get-projects', async (payload) => {
    return fetchProjects(payload.orgId); // Promise sent to UI!
});

// AFTER (v1.5.0 - FIXED)
comm.on('get-projects', async (payload) => {
    return await fetchProjects(payload.orgId); // Resolved value sent
});
// Handler is automatically awaited by WebviewCommunicationManager
```

### Timeout Hint System

```typescript
// Backend defines timeouts (single source of truth)
const REQUEST_TIMEOUTS: Record<string, number> = {
    'authenticate': 60000,
};

// WebviewCommunicationManager automatically sends timeout hint
comm.on('authenticate', async () => {
    // Frontend receives __timeout_hint__ message automatically
    // Sets timeout to 60000ms for this specific request
    return await authenticate();
});
```

### State Version Tracking

```typescript
// Extension tracks state version
comm.incrementStateVersion();

// Send version to webview
await comm.sendMessage('state-updated', {
    version: comm.getStateVersion(),
    data: newState
});

// Webview can check version for consistency
```

## Error Handling

Communication manager handles errors gracefully:

```typescript
// Handler throws error
comm.on('risky-operation', async () => {
    throw new Error('Operation failed');
    // Error automatically caught and sent to webview as response
});

// Request timeout
try {
    await comm.request('slow-operation');
} catch (error) {
    // Error: Request timeout: slow-operation
}

// Message send failure
try {
    await comm.sendMessage('update', data);
} catch (error) {
    // Automatic retry (up to maxRetries)
}
```

## Performance Considerations

- **Message Queuing**: Messages queued until handshake (no lost messages)
- **Timeout Management**: Configurable timeouts prevent hung requests
- **Retry Logic**: Exponential backoff for failed messages
- **Logging Overhead**: Debug logging can be disabled in production
- **State Version**: Minimal overhead (simple counter increment)
- **Handler Execution**: Handlers run async (non-blocking)

## Security Considerations

- **Message Validation**: All messages should validate payloads
- **Timeout Protection**: Prevents indefinite waiting for responses
- **Error Sanitization**: Don't expose internal errors to webview
- **Type Safety**: Use TypeScript types to prevent payload issues

## Debugging

Enable logging for communication issues:

```typescript
const comm = await createWebviewCommunication(panel, {
    enableLogging: true // Logs all messages to Debug channel
});

// Logs show:
// - [WebviewComm] Starting initialization
// - [WebviewComm] Handshake complete
// - [WebviewComm] Received: get-projects
// - [WebviewComm] Queuing message: update-status
```

## Guidelines

**Adding to This Module**:
- New features must serve all webview commands
- Must maintain backward compatibility
- Must handle async operations correctly
- Must include comprehensive error handling

**Moving from Feature to Shared**:
When you find communication patterns duplicated:
1. Extract to this module
2. Add handler type safety
3. Document timeout requirements
4. Update all usage sites

## Known Issues and Fixes

### v1.5.0 - Async Handler Resolution

**Issue**: Promise objects sent to UI instead of resolved values

**Fix**: WebviewCommunicationManager now awaits async handlers:

```typescript
// Line 332 in webviewCommunicationManager.ts
const result = await handler(message.payload ?? {} as MessagePayload);
```

### Timeout Configuration

Backend specifies timeouts (single source of truth):

```typescript
const REQUEST_TIMEOUTS: Record<string, number> = {
    'authenticate': TIMEOUTS.BROWSER_AUTH,
    'get-projects': TIMEOUTS.PROJECT_LIST,
    'select-project': TIMEOUTS.CONFIG_WRITE,
};
```

## See Also

- **Related Shared Modules**:
  - `@/shared/base` - BaseWebviewCommand uses this module
  - `@/shared/logging` - Used for debug logging
  - `@/utils/timeoutConfig` - Timeout configuration

- **Related Documentation**:
  - Main architecture: `../../CLAUDE.md`
  - Shared overview: `../CLAUDE.md`
  - Race conditions: `../../docs/systems/race-conditions.md`
  - Backend Call on Continue: `../../docs/patterns/selection-pattern.md`

- **Related Types**:
  - `@/types/messages` - Message types and payloads

---

*This is shared infrastructure - maintain high quality standards*
