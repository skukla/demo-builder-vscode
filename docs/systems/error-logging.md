# Unified Logging System

## Overview

The Demo Builder extension uses a unified logging system that provides clean separation between user-facing messages and detailed debugging information. This system replaced the previous multi-channel approach with a streamlined dual-channel architecture.

## Architecture

### Dual Output Channel Design

The logging system uses two VS Code output channels:

1. **Demo Builder: Logs** - User-facing messages
   - Info, warning, and error messages
   - High-level operation status  
   - User-friendly feedback
   - What end users need for getting help

2. **Demo Builder: Debug** - Detailed diagnostic information
   - Command execution logs with stdout/stderr
   - Environment variables and PATH
   - Token parsing details
   - Timing information
   - Raw API responses
   - Stack traces and error details

### Core Components

```typescript
// Central debug logging system
class DebugLogger {
    private outputChannel: vscode.OutputChannel;  // "Demo Builder: Logs"
    private debugChannel: vscode.OutputChannel;   // "Demo Builder: Debug"
    
    // User-facing logging
    info(message: string): void
    warn(message: string): void
    error(message: string, error?: Error): void
    
    // Debug logging
    debug(message: string, data?: any): void
    logCommand(command: string, result: CommandResult): void
}

// Backward-compatible wrapper
class Logger {
    private debugLogger: DebugLogger;
    // Delegates all calls to DebugLogger
}

// Error tracking with UI integration
class ErrorLogger {
    private debugLogger: DebugLogger;
    private statusBarItem: vscode.StatusBarItem;
    private diagnostics: vscode.DiagnosticCollection;
    // Uses DebugLogger for output, adds UI features
}
```

## Logging Levels and Channels

### Info Level
- **Channel**: Demo Builder: Logs
- **Purpose**: General information for users
- **Format**: `[HH:MM:SS] Message`
- **Example**: `[14:30:45] Checking prerequisites...`

### Warning Level
- **Channel**: Demo Builder: Logs
- **Purpose**: Non-critical issues users should know about
- **Format**: `[HH:MM:SS] ⚠️ Message`
- **Example**: `[14:30:45] ⚠️ Optional tool Docker not installed`
- **UI Integration**: Warning count in status bar

### Error Level
- **Channel**: Demo Builder: Logs (message) + Debug (details)
- **Purpose**: Problems that need attention
- **Format**: `[HH:MM:SS] ❌ Message`
- **Example**: `[14:30:45] ❌ Failed to install Node.js`
- **UI Integration**: 
  - Error count in status bar
  - Problems panel entry
  - Optional notification for critical errors

### Debug Level
- **Channel**: Demo Builder: Debug
- **Purpose**: Detailed information for troubleshooting
- **Format**: `[ISO-8601] DEBUG: Message + JSON data`
- **Example**: 
  ```
  [2025-01-10T14:30:45.123Z] DEBUG: Parsing auth token
  {
    "hasToken": true,
    "expiresIn": "3600000",
    "expiryTime": 1704896445000
  }
  ```

## Command Execution Logging

All shell command executions are logged to the Debug channel:

```
================================================================================
[2025-01-10T14:30:45.123Z] COMMAND EXECUTION
================================================================================
Command: npm install
Working Directory: /Users/username/project
Duration: 5234ms
Exit Code: 0

--- STDOUT ---
added 150 packages in 5s

--- STDERR ---
(empty)
================================================================================
```

## Error Tracking Features

### Status Bar Integration
- Shows error/warning counts
- Click to open logs
- Auto-hides when no issues
- Format: `$(error) 2 $(warning) 1`

### Problems Panel Integration
- Creates diagnostic entries for errors
- Links to relevant files
- Shows error severity
- Allows quick navigation

### Critical Error Notifications
- Modal dialog for blocking errors
- "Show Logs" action button
- Only for errors requiring immediate attention

## Usage Patterns

### For Extension Code

```typescript
import { getLogger } from './utils/debugLogger';

const logger = getLogger();

// Simple logging
logger.info('Starting prerequisite check');
logger.warn('Node.js 18 is deprecated');
logger.error('Installation failed', error);

// Debug with data
logger.debug('Checking tool version', {
    tool: 'node',
    expectedVersion: '20.x',
    foundVersion: '18.12.0'
});

// Command logging
const result = await exec('npm install');
logger.logCommand('npm install', {
    stdout: result.stdout,
    stderr: result.stderr,
    code: result.code,
    duration: Date.now() - startTime
});
```

### For Error Tracking

```typescript
const errorLogger = new ErrorLogger(context);

// Log with context
errorLogger.logInfo('Installing Node.js', 'Prerequisites');
errorLogger.logWarning('Retry attempt 2/3', 'Network');
errorLogger.logError(error, 'Installation', true); // true = critical

// Add to Problems panel
errorLogger.addDiagnostic(
    uri,
    'Missing required dependency',
    vscode.DiagnosticSeverity.Error
);
```

## Migration from Previous System

### Before (4 channels)
- "Demo Builder" (extension.ts)
- "Demo Builder" (debugLogger duplicate)
- "Demo Builder Logs" (errorLogger)
- "Demo Builder - Debug" (debugLogger)

### After (2 channels)
- "Demo Builder: Logs" - All user-facing messages
- "Demo Builder: Debug" - All debug information

### Code Changes
- `Logger` class now wraps `DebugLogger`
- `ErrorLogger` uses `DebugLogger` for output
- No more manual output channel creation
- Centralized in `debugLogger.ts`

## Best Practices

### DO
- ✅ Use appropriate log level for the message importance
- ✅ Include context in error messages
- ✅ Log command execution with full details
- ✅ Add structured data to debug messages
- ✅ Use error tracking for user-facing errors

### DON'T
- ❌ Log sensitive information (tokens, passwords)
- ❌ Create new output channels
- ❌ Use console.log in production code
- ❌ Show technical details to users
- ❌ Spam logs with repetitive messages

## Configuration

Future settings will allow users to control logging:

```json
{
  "demoBuilder.enableDebugLogging": true,
  "demoBuilder.logLevel": "info" // error | warn | info | debug
}
```

## Troubleshooting

### Missing Output Channels
- Check extension activated: `initializeLogger(context)` called
- Restart VS Code if channels don't appear
- Verify no errors in Developer Console

### No Debug Output
- Ensure using `getLogger()` not creating new instance
- Check debug logging enabled (future setting)
- Verify logger initialized before use

### Status Bar Not Updating
- ErrorLogger must be instantiated with context
- Check status bar item registered in subscriptions
- Verify error/warning counts incrementing

## See Also

- [Debugging System](./debugging.md) - Comprehensive debugging features
- [Prerequisites System](./prerequisites-system.md) - Logging during installation
- [Troubleshooting Guide](../troubleshooting.md) - Common issues and solutions