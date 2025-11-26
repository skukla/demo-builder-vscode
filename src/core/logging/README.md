# Logging Infrastructure

## Purpose

The logging module provides a comprehensive logging system using VS Code's native LogOutputChannel API (v1.84+). It enables consistent logging practices across all features with native severity levels, user-configurable log filtering, and specialized logging utilities for different use cases.

This module provides dual-channel logging with "Demo Builder: User Logs" for user-facing messages and "Demo Builder: Debug Logs" for technical diagnostics. Both channels use native severity levels (trace, debug, info, warn, error), with configuration-driven step logging, error tracking with UI integration, and command execution logging with timing metrics.

## Key Changes (v1.84+ Upgrade)

**Previous (v1.74+)**:
- Two separate OutputChannels with custom formatting
- Manual timestamp formatting
- Custom severity prefixes

**Current (v1.84+)**:
- Dual LogOutputChannels: "Demo Builder: User Logs" and "Demo Builder: Debug Logs"
- User Logs: User-facing messages (info, warn, error) - for end users
- Debug Logs: Technical diagnostics (debug, trace, command logs) - for support/debugging
- Native severity methods: `trace()`, `debug()`, `info()`, `warn()`, `error()`
- VS Code handles timestamps and formatting automatically
- Users can configure log level per channel via VS Code's "Set Log Level..." command

## When to Use

Use this module when:
- Logging user-facing messages that help track extension operations
- Debugging issues with detailed technical information
- Tracking step-based operations in wizards or multi-step processes
- Logging errors with status bar indicators and automatic severity handling
- Recording command execution details (stdout, stderr, timing, exit codes)
- Centralizing all logging output for consistency

Do NOT use when:
- Making temporary debug console.log calls during development (remove before commit)
- Logging sensitive information (tokens, passwords, private keys)
- Spamming logs with excessive output (rate-limit or batch messages)

## Key Exports

### DebugLogger

**Purpose**: Main logging system using VS Code's native LogOutputChannel API

**Usage**:
```typescript
import { initializeLogger, getLogger } from '@/core/logging';

// Initialize once in extension.ts
const logger = initializeLogger(context);

// Use anywhere in extension
const logger = getLogger();
logger.info('User-facing message');
logger.debug('Debug details', { data });
logger.error('Operation failed', error);
```

**Key Methods**:
- `info(message)` - Informational messages → BOTH channels
- `warn(message)` - Warnings → BOTH channels
- `error(message, error?)` - Errors → BOTH channels (+ technical details → Debug Logs only)
- `debug(message, data?)` - Debug information → Debug Logs only
- `trace(message, data?)` - Most verbose level → Debug Logs only
- `logCommand(command, result, args?)` - Command execution details → Debug Logs only
- `logEnvironment(label, env)` - Environment variables → Debug Logs only
- `show(preserveFocus?)` - Show the User Logs channel
- `showDebug(preserveFocus?)` - Show the Debug Logs channel
- `hide()` - Hide the User Logs channel
- `hideDebug()` - Hide the Debug Logs channel
- `toggle()` - Toggle User Logs channel visibility (deprecated, use show())
- `clear()` - Clear User Logs channel contents
- `clearDebug()` - Clear Debug Logs channel contents
- `exportDebugLog()` - Export logs to file
- `getLogContent()` - Get buffer content for export

**Properties**:
- Dual channels: "Demo Builder: User Logs" and "Demo Builder: Debug Logs"
- User Logs: Clean, user-friendly view (subset of all messages)
- Debug Logs: Complete technical record (superset - everything for support)
- User-configurable log level per channel via VS Code settings
- Automatic sanitization of errors for security
- VS Code handles timestamps automatically
- Buffer tracking for info/warn/error (export functionality)
- Buffer size cap (10K entries) with LRU-style eviction to prevent unbounded growth
- Production safety (debug/trace logging disabled in production)
- Path validation for log replay (security hardening)

**Channel Architecture**:
```
info()  ────► User Logs [INFO] ◄────┐
warn()  ────► User Logs [WARN] ◄────┼── Users see clean output
error() ────► User Logs [ERROR] ◄───┘
                    │
                    ▼
             Debug Logs [INFO/WARN/ERROR] ◄── Support sees everything
debug() ───► Debug Logs [DEBUG]
trace() ───► Debug Logs [TRACE]
logCommand() ► Debug Logs [DEBUG/TRACE]
```

**Example**:
```typescript
import { getLogger } from '@/core/logging';

const logger = getLogger();

// User-facing progress (always visible)
logger.info('Installing prerequisites...');
logger.info('Node.js v18.20.5 installed successfully');

// Debug details (user sets log level to see)
logger.debug('Prerequisite check details', {
    command: 'node --version',
    stdout: 'v18.20.5',
    duration: 123
});

// Most verbose (trace level)
logger.trace('Full command output', fullOutput);

// Error with context
try {
    await riskyOperation();
} catch (error) {
    logger.error('Operation failed', error);
    // Logs sanitized error message
    // Error details logged at debug level
}
```

**User-Configurable Log Levels**:

Users can change the log level for each channel via VS Code:
1. Command Palette: "Developer: Set Log Level..."
2. Select "Demo Builder: User Logs" or "Demo Builder: Debug Logs" from the list
3. Choose level: Trace, Debug, Info, Warning, Error, Off

**Support Workflow**:
When helping users debug issues:
1. Ask user to open "Demo Builder: Debug Logs" from the Output panel dropdown
2. Technical details (command execution, timing, stdout/stderr) are all there
3. User-facing messages remain in "Demo Builder: User Logs" for clean UX

### ErrorLogger

**Purpose**: Error tracking with status bar integration and UI notifications

**Usage**:
```typescript
import { ErrorLogger } from '@/core/logging';

const errorLogger = new ErrorLogger(context);

errorLogger.logError('Failed to deploy mesh', 'mesh-deployment', true, {
    meshId: 'my-mesh',
    workspaceId: '12345'
});
```

**Key Methods**:
- `logInfo(message, context?)` - Log informational message
- `logWarning(message, context?)` - Log warning with counter increment
- `logError(error, context?, critical?, details?)` - Log error with optional UI notification
- `show()` - Show logs output channel
- `clear()` - Clear logs and reset counters
- `addDiagnostic(uri, message, severity, range?)` - Add to Problems panel

**Properties**:
- Status bar indicator with error/warning counts
- Click status bar to show logs
- Critical errors show modal notifications
- Integrates with VS Code Problems panel
- Automatic counter tracking

### StepLogger

**Purpose**: Configuration-driven logging for wizard steps and multi-step operations

**Usage**:
```typescript
import { StepLogger, getStepLogger } from '@/core/logging';
import { Logger } from '@/core/logging';

const logger = new Logger();
const stepLogger = new StepLogger(logger);

stepLogger.log('adobe-auth', 'Checking authentication');
stepLogger.logStepStart('prerequisites');
stepLogger.logStepComplete('prerequisites', true);
```

**Key Methods**:
- `log(stepId, message, level?)` - Log with step context prefix
- `logOperation(stepId, operation, item?, level?)` - Log operation within step
- `logStatus(stepId, status, count?, itemName?)` - Log status/result
- `logTemplate(stepId, templateKey, params?, level?)` - Use message template
- `logStepStart(stepId)` - Log step start
- `logStepComplete(stepId, success?)` - Log step completion
- `forStep(stepId)` - Create bound context for step
- `getStepName(stepId)` - Get display name for step

### Logger (Legacy)

**Purpose**: Backward-compatible wrapper around DebugLogger

**Usage**:
```typescript
import { Logger } from '@/core/logging';

const logger = new Logger();
logger.info('Message');
logger.debug('Debug info');
```

**Note**: New code should use `getLogger()` instead of creating new `Logger()` instances.

## Types

### CommandResultWithContext

Extended command result with logging context:

```typescript
interface CommandResultWithContext extends CommandResult {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
}
```

Used by `logCommand()` to provide full execution context.

### LogLevel

```typescript
type LogLevel = 'info' | 'debug' | 'error' | 'warn';
```

## Architecture

**Directory Structure**:
```
core/logging/
├── index.ts              # Public API exports
├── debugLogger.ts        # Main LogOutputChannel-based logger
├── errorLogger.ts        # Error tracking with UI
├── stepLogger.ts         # Configuration-driven step logging
├── logger.ts            # Legacy backward-compatible wrapper
└── README.md            # This file
```

## Usage Patterns

### Pattern 1: Feature Logging

```typescript
import { getLogger } from '@/core/logging';

export class MyFeature {
    private logger = getLogger();

    async execute() {
        this.logger.info('Starting operation');

        try {
            await this.doWork();
            this.logger.info('Operation completed successfully');
        } catch (error) {
            this.logger.error('Operation failed', error);
            throw error;
        }
    }
}
```

### Pattern 2: Command Execution Logging

```typescript
import { getLogger } from '@/core/logging';

const logger = getLogger();

const result = await commandExecutor.execute('aio --version');
logger.logCommand('aio', result, ['--version']);
// Logs command summary at debug level
// Logs stdout/stderr at trace level
```

### Pattern 3: Step-Based Wizard Logging

```typescript
import { getStepLogger } from '@/core/logging';

const stepLogger = getStepLogger(logger);

// Method 1: Direct logging
stepLogger.logStepStart('component-selection');
stepLogger.log('component-selection', 'Loaded 12 components');
stepLogger.logStepComplete('component-selection', true);

// Method 2: Bound context (cleaner)
const context = stepLogger.forStep('component-selection');
context.logStart();
context.log('Loaded 12 components');
context.logComplete(true);
```

### Pattern 4: Error Tracking with UI

```typescript
import { ErrorLogger } from '@/core/logging';

const errorLogger = new ErrorLogger(context);

// Regular error
errorLogger.logError('Minor issue', 'context');

// Critical error (shows notification)
errorLogger.logError(
    new Error('Critical failure'),
    'operation-name',
    true,  // critical
    'Additional details for debug'
);
```

## Integration

### Used By
- **Features**: All features use logging for operation tracking
- **Commands**: All commands use logging for user feedback
- **Handlers**: Message handlers use logging for debugging
- **Services**: All services use logging for diagnostics

### Dependencies
- VS Code API (`vscode`) - LogOutputChannel (v1.84+), status bar
- `@/core/validation` - Error sanitization
- `@/types/logger` - LogLevel type
- Node.js `fs/promises` - Log file export

## Best Practices

1. **Use Appropriate Severity**:
   - `trace()` - Very detailed diagnostics (stdout/stderr of commands)
   - `debug()` - Debug info for developers (not shown by default)
   - `info()` - User-facing progress messages (visible by default)
   - `warn()` - Warnings that users should see
   - `error()` - Errors (always visible)

2. **Include Context**: Always provide context in error messages (what operation failed)

3. **Sanitize Errors**: ErrorLogger automatically sanitizes, but be aware of what's logged

4. **Don't Over-Log**: Avoid logging inside tight loops or very frequent operations

5. **Use Step Logger**: For wizard steps, use StepLogger for consistent formatting

6. **Log Command Results**: Always log command execution for debugging

7. **Security First**: Never log tokens, passwords, or sensitive data

## Log Level Configuration

Users can control what they see via VS Code's "Set Log Level..." command:

| Level | What's Shown |
|-------|-------------|
| Trace | Everything (trace, debug, info, warn, error) |
| Debug | debug, info, warn, error |
| Info | info, warn, error (default) |
| Warning | warn, error |
| Error | error only |
| Off | Nothing |

## Common Patterns

### Singleton Pattern

The logging system uses a singleton pattern to ensure one logger instance:

```typescript
// Initialize once in extension.ts
const logger = initializeLogger(context);

// Get anywhere else
const logger = getLogger();
```

### Severity Escalation Pattern

Different levels of message severity:

```typescript
// Very detailed (user must set Trace level)
logger.trace('Full HTTP response body', responseBody);

// Developer debugging (user must set Debug level)
logger.debug('Cache hit', { key, ttl });

// User-facing progress (visible by default)
logger.info('Installing Node.js...');

// Warning (visible by default)
logger.warn('Using deprecated API');

// Error (always visible)
logger.error('Operation failed', error);
```

## Error Handling

The logging module itself handles errors gracefully:

```typescript
// Safe error logging (won't throw)
logger.error('Message', error);

// Safe debug logging (disabled in production)
logger.debug('Debug info', potentiallyBadData);

// Safe command logging
logger.logCommand('cmd', result);
```

All logging methods are designed to never throw errors, ensuring they don't break the extension if logging fails.

## Performance Considerations

- **Native API**: Uses VS Code's native LogOutputChannel for optimal performance
- **Buffer Management**: Only info/warn/error buffered for export (not debug/trace)
- **Buffer Size Cap**: 10K entry limit with batch eviction (removes oldest 10% when exceeded)
- **Production Safety**: Debug/trace logging automatically disabled in production builds
- **Async Operations**: File I/O operations (export, replay) are async and non-blocking
- **Sanitization Overhead**: Error sanitization has minimal overhead (regex-based)
- **Path Validation**: replayLogsFromFile validates paths are within ~/.demo-builder/ for security

## Guidelines

**Adding to This Module**:
- New logging utilities must serve 2+ features
- Must not contain feature-specific logic
- Must maintain backward compatibility
- Security: Always sanitize before logging user input or errors

**Moving from Feature to Core**:
When you find feature-specific logging utilities used in multiple places:
1. Extract to this module
2. Generalize the API
3. Add comprehensive documentation
4. Update all usage sites

## See Also

- **Related Core Modules**:
  - `@/core/validation` - Error sanitization
  - `@/core/base` - BaseCommand (uses logger)

- **Related Documentation**:
  - Main architecture: `../../CLAUDE.md`
  - Core overview: `../CLAUDE.md`
  - Debugging guide: `../../docs/systems/debugging.md`

---

*This is core infrastructure - maintain high quality standards*
