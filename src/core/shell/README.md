# Command Execution Infrastructure

## Purpose

The command-execution module provides a comprehensive system for executing shell commands with advanced features like race condition protection, retry strategies, Node.js version management, exclusive resource locking, smart polling, file system watching, and command sequencing.

This module solves critical race conditions in Adobe CLI operations, ensures proper Node version isolation with fnm, provides automatic retry for transient failures, and centralizes all external command execution logic.

## When to Use

Use this module when:
- Executing shell commands (npm, aio, node, etc.)
- Running Adobe CLI commands with proper Node version
- Executing commands that require exclusive access (Adobe CLI config writes)
- Implementing retry logic for flaky operations (network calls, Adobe API)
- Polling for condition completion (file creation, process startup)
- Watching file system for changes
- Sequencing multiple dependent commands
- Running commands in parallel with dependency management

Do NOT use when:
- Executing VS Code extension API methods (not shell commands)
- Running JavaScript/TypeScript code directly (use imports)
- Simple Node.js built-in operations (fs, path, etc.)

## Key Exports

### CommandExecutor

**Purpose**: Main orchestrator for all command execution operations

**Usage**:
```typescript
import { CommandExecutor } from '@/shared/command-execution';

const executor = new CommandExecutor();

// Simple execution
const result = await executor.execute('node --version');

// With options
const result = await executor.execute('aio console:org:list', {
    useNodeVersion: 'auto',
    configureTelemetry: true,
    timeout: 30000,
});

// Exclusive execution (prevents race conditions)
const result = await executor.execute('aio console:org:select 12345', {
    exclusive: 'adobe-cli',
});
```

**Key Methods**:
- `execute(command, options?)` - Execute command with full feature set
- `executeAdobeCLI(command, options?)` - Execute Adobe CLI with correct Node version
- `executeExclusive(resource, operation)` - Execute with exclusive lock
- `executeSequence(commands, stopOnError?)` - Execute commands sequentially
- `executeParallel(commands)` - Execute commands in parallel
- `queueCommand(command, options?, resourceLock?)` - Queue for execution
- `pollUntilCondition(checkFn, options?)` - Poll until condition met
- `waitForFileSystem(path, condition?, timeout?)` - Wait for file change
- `commandExists(command)` - Check if command is available
- `isPortAvailable(port)` - Check if port is free
- `dispose()` - Clean up resources

**Example**:
```typescript
import { CommandExecutor } from '@/shared/command-execution';

const executor = new CommandExecutor();

// Adobe CLI with automatic Node version
const result = await executor.executeAdobeCLI('aio console:org:list');

// Exclusive execution (prevents concurrent Adobe CLI operations)
await executor.executeExclusive('adobe-cli', async () => {
    await executor.executeAdobeCLI('aio console:org:select 12345');
    await executor.executeAdobeCLI('aio console:project:select 67890');
});

// Retry strategy for network operations
const result = await executor.execute('npm install', {
    retryStrategy: {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 5000,
        backoffFactor: 2,
    },
});

// Streaming output
await executor.execute('npm run dev', {
    streaming: true,
    onOutput: (data) => console.log(data),
});

// Poll for condition
await executor.pollUntilCondition(
    async () => {
        const result = await executor.execute('ps aux | grep node');
        return result.stdout.includes('my-process');
    },
    { maxAttempts: 10, initialDelay: 500 }
);
```

### EnvironmentSetup

**Purpose**: Manages environment configuration for commands (Node versions, PATH, telemetry)

**Key Methods**:
- `findAdobeCLINodeVersion()` - Detect Node version for Adobe CLI
- `ensureAdobeCLINodeVersion(executor)` - Set Node version once per session
- `ensureAdobeCLIConfigured(executor)` - Configure telemetry
- `findFnmPath()` - Locate fnm binary
- `findNpmGlobalPaths()` - Find npm global bin directories

**Usage**:
```typescript
// Used internally by CommandExecutor
// Most code doesn't need to use this directly
```

### RetryStrategyManager

**Purpose**: Manages retry strategies for different operation types

**Key Methods**:
- `getStrategy(name)` - Get predefined strategy
- `getDefaultStrategy()` - Get default strategy
- `executeWithRetry(operation, strategy, label?)` - Execute with retry

**Predefined Strategies**:
- `network` - Network operations (3 attempts, exponential backoff)
- `file-system` - File system operations (5 attempts, fast retry)
- `adobe-cli` - Adobe CLI operations (3 attempts, moderate backoff)

**Example**:
```typescript
const executor = new CommandExecutor();

// Use predefined strategy
const result = await executor.execute('curl https://api.example.com', {
    retryStrategy: executor['retryManager'].getStrategy('network'),
});
```

### ResourceLocker

**Purpose**: Provides mutual exclusion for resource access (prevents race conditions)

**Key Methods**:
- `executeExclusive(resource, operation)` - Execute with exclusive lock
- `clearAllLocks()` - Clear all locks (cleanup)

**Example**:
```typescript
// Prevent concurrent Adobe CLI operations
await resourceLocker.executeExclusive('adobe-cli', async () => {
    await configureOrganization();
    await configureProject();
    await configureWorkspace();
});
```

### PollingService

**Purpose**: Smart polling with exponential backoff

**Key Methods**:
- `pollUntilCondition(checkFn, options?)` - Poll until condition true

**Example**:
```typescript
await pollingService.pollUntilCondition(
    async () => {
        const exists = await fileExists('/path/to/file');
        return exists;
    },
    {
        maxAttempts: 20,
        initialDelay: 100,
        maxDelay: 2000,
        backoffFactor: 1.5,
        timeout: 30000,
        name: 'File creation',
    }
);
```

### FileWatcher

**Purpose**: Watch file system for changes

**Key Methods**:
- `waitForFileSystem(path, condition?, timeout?)` - Wait for file change
- `disposeAll()` - Clean up all watchers

**Example**:
```typescript
await fileWatcher.waitForFileSystem(
    '/path/to/file',
    async () => {
        const content = await fs.readFile('/path/to/file', 'utf-8');
        return content.includes('expected-value');
    },
    10000
);
```

### CommandSequencer

**Purpose**: Execute commands in sequence or parallel

**Key Methods**:
- `executeSequence(commands, executor, stopOnError?)` - Sequential execution
- `executeParallel(commands, executor)` - Parallel execution

**Example**:
```typescript
const commands: CommandConfig[] = [
    { command: 'npm install', resource: 'npm' },
    { command: 'npm run build', resource: 'npm' },
    { command: 'npm test', resource: 'npm' },
];

const results = await executor.executeSequence(commands, true);
```

## Types

### CommandResult

```typescript
interface CommandResult {
    stdout: string;
    stderr: string;
    code: number | null;
    duration: number;
}
```

### ExecuteOptions

```typescript
interface ExecuteOptions extends ExecOptions {
    // Environment setup
    useNodeVersion?: string | 'auto' | null;
    enhancePath?: boolean;
    configureTelemetry?: boolean;

    // Execution mode
    streaming?: boolean;
    exclusive?: string;

    // Retry & timeout
    retryStrategy?: RetryStrategy;
    timeout?: number;

    // Output handling
    onOutput?: (data: string) => void;
}
```

### RetryStrategy

```typescript
interface RetryStrategy {
    maxAttempts: number;
    initialDelay: number;
    maxDelay: number;
    backoffFactor: number;
    shouldRetry?: (error: Error, attempt: number) => boolean;
}
```

### PollOptions

```typescript
interface PollOptions {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
    timeout?: number;
    name?: string;
}
```

## Architecture

**Directory Structure**:
```
shared/command-execution/
├── index.ts                  # Public API exports
├── commandExecutor.ts        # Main orchestrator
├── environmentSetup.ts       # Environment configuration
├── retryStrategyManager.ts   # Retry logic
├── resourceLocker.ts         # Mutual exclusion
├── pollingService.ts         # Smart polling
├── fileWatcher.ts           # File system watching
├── commandSequencer.ts      # Command sequencing
├── types.ts                 # Type definitions
└── README.md                # This file
```

## Usage Patterns

### Pattern 1: Adobe CLI Operations

```typescript
const executor = new CommandExecutor();

// Automatic Node version + telemetry + retry
const orgs = await executor.executeAdobeCLI('aio console:org:list');

// With exclusive lock (prevents race conditions)
await executor.executeExclusive('adobe-cli', async () => {
    await executor.executeAdobeCLI('aio console:org:select 12345');
    await executor.executeAdobeCLI('aio console:project:select 67890');
});
```

### Pattern 2: Network Operations with Retry

```typescript
const result = await executor.execute('curl https://api.example.com/data', {
    retryStrategy: {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 5000,
        backoffFactor: 2,
    },
    timeout: 30000,
});
```

### Pattern 3: Node Version Management

```typescript
// Use specific Node version
await executor.execute('npm install', {
    useNodeVersion: '18.20.5',
});

// Auto-detect Adobe CLI Node version
await executor.execute('aio --version', {
    useNodeVersion: 'auto',
});

// Use current fnm version
await executor.execute('node script.js', {
    useNodeVersion: 'current',
});
```

### Pattern 4: Exclusive Resource Access

```typescript
// Prevent concurrent Adobe CLI config writes
await executor.executeExclusive('adobe-cli', async () => {
    const config = await loadConfig();
    config.orgId = newOrgId;
    await saveConfig(config);
});
```

### Pattern 5: Polling for Completion

```typescript
// Wait for server to start
await executor.pollUntilCondition(
    async () => {
        const available = await executor.isPortAvailable(3000);
        return !available; // Port in use = server started
    },
    {
        maxAttempts: 30,
        initialDelay: 500,
        timeout: 15000,
        name: 'Server startup',
    }
);
```

### Pattern 6: Command Sequencing

```typescript
// Sequential (stop on error)
const commands: CommandConfig[] = [
    { command: 'npm ci', resource: 'npm' },
    { command: 'npm run build', resource: 'npm' },
    { command: 'npm test', resource: 'npm' },
];

const results = await executor.executeSequence(commands, true);

// Parallel
const parallelCommands: CommandConfig[] = [
    { command: 'npm run lint' },
    { command: 'npm run test:unit' },
    { command: 'npm run test:integration' },
];

const parallelResults = await executor.executeParallel(parallelCommands);
```

## Integration

### Used By
- **Features**:
  - `authentication` - Adobe CLI operations
  - `prerequisites` - Tool installation and checking
  - `lifecycle` - Starting/stopping demo servers
  - `mesh` - API Mesh deployment
  - `components` - Component installation
- **Commands**: All commands that execute shell operations

### Dependencies
- Node.js `child_process` - spawn for command execution
- `@/shared/logging` - Command logging
- `@/utils/timeoutConfig` - Timeout configuration
- `@/shared/validation` - Command name validation

## Best Practices

1. **Use executeAdobeCLI**: Always use `executeAdobeCLI()` for Adobe CLI commands
2. **Exclusive Locks**: Use exclusive locks for Adobe CLI config operations
3. **Retry Strategies**: Use appropriate retry strategies for operation types
4. **Timeout Values**: Set realistic timeouts (default: 30s)
5. **Shell Safety**: Only use `shell: true` when necessary and with validated inputs
6. **Node Version**: Use `useNodeVersion: 'auto'` for Adobe CLI
7. **Error Handling**: Wrap in try-catch for proper error handling
8. **Dispose Resources**: Call `dispose()` during cleanup

## Common Patterns

### fnm Isolation (Fix #7)

Uses `fnm exec` for bulletproof Node version isolation:

```typescript
// BEFORE (using fnm use - fallback to system Node)
fnm use 18.20.5 && aio --version

// AFTER (using fnm exec - guaranteed isolation)
fnm exec --using=18.20.5 aio --version
```

### Shell Security (Phase 04.1s)

Default `shell: false` prevents command injection:

```typescript
// SAFE: shell: false (default)
await executor.execute('aio console:org:list');

// UNSAFE: shell: true (requires validation)
validateOrgId(orgId); // MUST validate before using
await executor.execute(`aio console:org:select ${orgId}`, {
    shell: true,
});
```

### Timeout Configuration

Centralized timeout configuration:

```typescript
import { TIMEOUTS } from '@/utils/timeoutConfig';

await executor.execute('aio console:org:list', {
    timeout: TIMEOUTS.ORG_LIST, // 30000ms
});

await executor.execute('aio auth:login', {
    timeout: TIMEOUTS.BROWSER_AUTH, // 60000ms
});
```

## Error Handling

Command executor provides detailed error information with typed error detection:

```typescript
import { toAppError, isTimeout, isNetwork } from '@/types/errors';

try {
    const result = await executor.execute('risky-command');
} catch (error) {
    const appError = toAppError(error);

    if (isTimeout(appError)) {
        // Command timed out
    } else if (isNetwork(appError)) {
        // Network error (ENOTFOUND, ECONNREFUSED, etc.)
    } else {
        // Other error - use appError.userMessage for user-friendly message
        console.error(appError.userMessage);
    }
}

// Check exit code
const result = await executor.execute('command');
if (result.code !== 0) {
    console.error('Command failed:', result.stderr);
}
```

## Performance Considerations

- **Command Caching**: Adobe CLI version/plugins cached per session
- **Retry Backoff**: Exponential backoff prevents hammering
- **Exclusive Locks**: Queue prevents concurrent execution overhead
- **Streaming Output**: Real-time output for long-running commands
- **Timeout Management**: Prevents hung processes
- **Session State**: Node version set once per session (not per command)

## Security Considerations

- **Shell Injection**: Default `shell: false` prevents injection attacks
- **Input Validation**: Use `@/shared/validation` before executing with user input
- **Command Whitelist**: `commandExists()` validates command names
- **Timeout Protection**: Prevents DoS via long-running commands
- **Resource Locking**: Prevents race conditions in critical sections

## Debugging

Enable command logging for debugging:

```typescript
import { getLogger } from '@/shared/logging';

const logger = getLogger();

// Command execution is automatically logged to Debug channel
const result = await executor.execute('aio --version');

// Debug channel shows:
// - Command: aio --version
// - Working Directory: /path/to/project
// - Duration: 1234ms
// - Exit Code: 0
// - STDOUT: ...
// - STDERR: ...
```

## Guidelines

**Adding to This Module**:
- New execution features must serve 2+ features
- Must maintain race condition protection
- Must integrate with retry strategies
- Must support timeout configuration
- Must log execution details for debugging

**Moving from Feature to Shared**:
When you find command execution patterns duplicated:
1. Extract to this module
2. Add retry strategy if needed
3. Add exclusive lock support if needed
4. Document timeout requirements
5. Update all usage sites

## See Also

- **Related Shared Modules**:
  - `@/shared/logging` - Command execution logging
  - `@/shared/validation` - Input validation before execution
  - `@/utils/timeoutConfig` - Timeout configuration

- **Related Documentation**:
  - Main architecture: `../../CLAUDE.md`
  - Shared overview: `../CLAUDE.md`
  - Race conditions: `../../docs/systems/race-conditions.md`
  - Security validation: `../validation/README.md`

---

*This is shared infrastructure - maintain high quality standards*
