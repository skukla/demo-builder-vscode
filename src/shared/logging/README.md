# Logging Infrastructure

## Purpose

The logging module provides a comprehensive, dual-channel logging system used throughout the Adobe Demo Builder extension. It enables consistent logging practices across all features with different log levels, output channels, and specialized logging utilities for different use cases.

This module consolidates logging into two channels (user-facing "Logs" and developer-focused "Debug"), provides configuration-driven step logging, error tracking with UI integration, and command execution logging with timing metrics.

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

**Purpose**: Main logging system with dual output channels

**Usage**:
```typescript
import { initializeLogger, getLogger } from '@/shared/logging';

// Initialize once in extension.ts
const logger = initializeLogger(context);

// Use anywhere in extension
const logger = getLogger();
logger.info('User-facing message');
logger.debug('Debug details', { data });
logger.error('Operation failed', error);
```

**Key Methods**:
- `info(message)` - Log user-facing messages to main "Logs" channel
- `debug(message, data?)` - Log detailed debug info to "Debug" channel
- `warn(message)` - Log warnings to main channel
- `error(message, error?)` - Log errors with sanitized messages
- `logCommand(command, result, args?)` - Log command execution details
- `show(preserveFocus?)` - Show main logs channel
- `showDebug(preserveFocus?)` - Show debug channel
- `toggle()` - Smart toggle logs visibility
- `clear()` / `clearDebug()` - Clear channel contents
- `exportDebugLog()` - Export debug logs to file

**Properties**:
- Dual channels: "Demo Builder: Logs" (user-facing) and "Demo Builder: Debug" (diagnostics)
- Automatic sanitization of errors for security
- Timestamp prefixes on all messages
- Buffer tracking for log persistence
- Production safety (debug logging disabled in production)

**Example**:
```typescript
import { getLogger } from '@/shared/logging';

const logger = getLogger();

// User-facing progress
logger.info('Installing prerequisites...');
logger.info('Node.js v18.20.5 installed successfully');

// Debug details
logger.debug('Prerequisite check details', {
    command: 'node --version',
    stdout: 'v18.20.5',
    duration: 123
});

// Error with context
try {
    await riskyOperation();
} catch (error) {
    logger.error('Operation failed', error);
    // Logs sanitized error to main channel
    // Logs full stack trace to debug channel
}
```

### ErrorLogger

**Purpose**: Error tracking with status bar integration and UI notifications

**Usage**:
```typescript
import { ErrorLogger } from '@/shared/logging';

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

**Example**:
```typescript
const errorLogger = new ErrorLogger(context);

// Regular error
errorLogger.logError('Authentication failed', 'adobe-auth');

// Critical error (shows notification)
errorLogger.logError(
    new Error('Unable to connect to Adobe I/O'),
    'adobe-io',
    true,
    'Network timeout after 30s'
);

// Warning
errorLogger.logWarning('Node.js version may be outdated', 'prerequisites');
```

### StepLogger

**Purpose**: Configuration-driven logging for wizard steps and multi-step operations

**Usage**:
```typescript
import { StepLogger, getStepLogger } from '@/shared/logging';
import { Logger } from '@/shared/logging';

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

**Properties**:
- Step names from `wizard-steps.json` configuration
- Message templates from `logging.json`
- Automatic step name normalization
- Context-bound logger for cleaner APIs

**Example**:
```typescript
const stepLogger = getStepLogger(logger);

// Basic logging
stepLogger.log('prerequisites', 'Checking Node.js version');

// Using templates
stepLogger.logTemplate('prerequisites', 'checking', { item: 'Node.js' });
// Logs: "[Prerequisites] Checking Node.js..."

// Bound context for a step
const prereqLogger = stepLogger.forStep('prerequisites');
prereqLogger.logStart();
prereqLogger.log('Found Node.js v18.20.5');
prereqLogger.logComplete(true);
```

### StepLoggerContext

**Purpose**: Bound logger context for a specific step (cleaner API)

**Usage**:
```typescript
const stepContext = stepLogger.forStep('adobe-auth');
stepContext.log('Authenticating...');
stepContext.logComplete(true);
```

**Key Methods**:
- `log(message, level?)` - Log to bound step
- `logOperation(operation, item?, level?)` - Log operation
- `logStatus(status, count?, itemName?)` - Log status
- `logTemplate(templateKey, params?, level?)` - Use template
- `logStart()` - Log step start
- `logComplete(success?)` - Log step completion

**Example**:
```typescript
async function checkPrerequisites() {
    const logger = stepLogger.forStep('prerequisites');

    logger.logStart();
    logger.log('Checking Node.js...');
    logger.logStatus('Found', 1, 'Node.js installation');
    logger.logComplete(true);
}
```

### Logger (Legacy)

**Purpose**: Backward-compatible wrapper around DebugLogger

**Usage**:
```typescript
import { Logger } from '@/shared/logging';

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
shared/logging/
├── index.ts              # Public API exports
├── debugLogger.ts        # Main dual-channel logger
├── errorLogger.ts        # Error tracking with UI
├── stepLogger.ts         # Configuration-driven step logging
├── logger.ts            # Legacy backward-compatible wrapper
└── README.md            # This file
```

## Usage Patterns

### Pattern 1: Feature Logging

```typescript
import { getLogger } from '@/shared/logging';

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
import { getLogger } from '@/shared/logging';

const logger = getLogger();

const result = await commandExecutor.execute('aio --version');
logger.logCommand('aio', result, ['--version']);
// Logs full command details to debug channel
```

### Pattern 3: Step-Based Wizard Logging

```typescript
import { getStepLogger } from '@/shared/logging';

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
import { ErrorLogger } from '@/shared/logging';

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
- VS Code API (`vscode`) - Output channels, status bar
- `@/shared/validation` - Error sanitization
- `@/types/logger` - LogLevel type
- Node.js `fs/promises` - Log file export

## Best Practices

1. **Use Appropriate Channels**: User-facing messages go to `info()`, technical details to `debug()`
2. **Include Context**: Always provide context in error messages (what operation failed)
3. **Sanitize Errors**: ErrorLogger automatically sanitizes, but be aware of what's logged
4. **Don't Over-Log**: Avoid logging inside tight loops or very frequent operations
5. **Use Step Logger**: For wizard steps, use StepLogger for consistent formatting
6. **Log Command Results**: Always log command execution for debugging
7. **Security First**: Never log tokens, passwords, or sensitive data

## Common Patterns

### Singleton Pattern

The logging system uses a singleton pattern to ensure one logger instance:

```typescript
// Initialize once in extension.ts
const logger = initializeLogger(context);

// Get anywhere else
const logger = getLogger();
```

### Two-Channel Pattern

Separate channels for different audiences:

```typescript
// User-facing: "Demo Builder: Logs"
logger.info('Installing Node.js...');

// Developer debugging: "Demo Builder: Debug"
logger.debug('Installation details', {
    version: '18.20.5',
    path: '/usr/local/bin/node',
    duration: 1234
});
```

### Error Hierarchy Pattern

Different levels of error severity:

```typescript
// Warning (logged, status bar shows count)
errorLogger.logWarning('Minor issue');

// Error (logged, status bar shows count)
errorLogger.logError('Operation failed', 'context');

// Critical (logged, status bar, modal notification)
errorLogger.logError(error, 'context', true);
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

- **Buffer Management**: Logs are buffered in memory for replay after Extension Host restart
- **Production Safety**: Debug logging is automatically disabled in production builds
- **Channel Visibility**: Smart toggle logic prevents unnecessary channel switches
- **Async Operations**: File I/O operations (export, replay) are async and non-blocking
- **Sanitization Overhead**: Error sanitization has minimal overhead (regex-based)

## Guidelines

**Adding to This Module**:
- New logging utilities must serve 2+ features
- Must not contain feature-specific logic
- Must maintain backward compatibility
- Security: Always sanitize before logging user input or errors

**Moving from Feature to Shared**:
When you find feature-specific logging utilities used in multiple places:
1. Extract to this module
2. Generalize the API
3. Add comprehensive documentation
4. Update all usage sites

## See Also

- **Related Shared Modules**:
  - `@/shared/validation` - Error sanitization
  - `@/shared/base` - BaseCommand (uses logger)

- **Related Documentation**:
  - Main architecture: `../../CLAUDE.md`
  - Shared overview: `../CLAUDE.md`
  - Debugging guide: `../../docs/systems/debugging.md`

---

*This is shared infrastructure - maintain high quality standards*
