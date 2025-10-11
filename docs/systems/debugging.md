# Debugging System

## Overview

The Demo Builder extension includes a comprehensive debugging system designed to help diagnose issues, especially those that are platform-specific or difficult to reproduce. The system uses a dual output channel architecture and provides detailed command execution logging.

## Architecture

### Dual Output Channel Design

The debugging system uses two separate output channels to organize information:

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

### Core Components

```
src/utils/
├── debugLogger.ts       # Central debug logging system
├── logger.ts           # Backward-compatible wrapper
└── errorLogger.ts      # Error tracking with status bar
```

## Using the Diagnostics Command

### Running Diagnostics

1. Open Command Palette (Cmd+Shift+P / Ctrl+Shift+P)
2. Run "Demo Builder: Diagnostics"
3. Check both output channels for results

### What Diagnostics Collects

- **System Information**: Platform, OS version, architecture, memory
- **VS Code Information**: Version, language, session ID
- **Tool Versions**: Node.js, npm, fnm, git, Adobe CLI
- **Adobe CLI Status**:
  - Installation status
  - Authentication configuration
  - Token validity
  - Organization access
- **Environment Variables**: PATH, HOME, NODE_PATH, FNM variables
- **Diagnostic Tests**:
  - Browser launch capability
  - Adobe login command availability
  - File system access

### Diagnostic Report Structure

```json
{
  "timestamp": "2025-01-10T15:30:00Z",
  "system": {
    "platform": "darwin",
    "release": "21.6.0",
    "arch": "x64"
  },
  "vscode": {
    "version": "1.85.0"
  },
  "tools": {
    "node": { "installed": true, "output": "v20.11.0" },
    "aio": { "installed": true, "version": "10.0.0" }
  },
  "adobe": {
    "authConfigured": true,
    "hasToken": true,
    "tokenExpired": false
  },
  "tests": {
    "browserLaunch": { "available": true },
    "fileSystem": { "canWrite": true }
  }
}
```

## Debugging Common Issues

### Node.js Version Detection

When Node.js shows as not installed despite being present:

1. Run diagnostics to check PATH
2. Look in Debug channel for exact commands run
3. Check if fnm/nvm is properly configured in shell

Debug output will show:
```
[2025-01-10T15:30:00.123Z] COMMAND EXECUTION
================================================================================
Command: node --version
Working Directory: /Users/username/project
Exit Code: 127
--- STDERR ---
command not found: node
================================================================================
```

### Adobe Authentication Issues

When authentication fails or browser doesn't open:

1. Run diagnostics to check Adobe CLI installation
2. Review Debug channel for `aio config get` commands
3. Check token expiry details

Debug output shows:
```
[2025-01-10T15:30:00.123Z] DEBUG: Starting Adobe authentication check
[2025-01-10T15:30:00.125Z] DEBUG: Executing: aio config get ims.contexts.cli.access_token.token
[2025-01-10T15:30:00.500Z] DEBUG: Token expiry check:
{
  "expiryTime": 1704935445000,
  "currentTime": 1704892245000,
  "expiresAt": "2025-01-10T16:30:45.000Z",
  "isValid": true
}
```

### Browser Launch Failures

When clicking "Sign In with Adobe" doesn't open browser:

1. Check PATH includes Adobe CLI location
2. Verify `aio auth login --help` shows `-f` flag support
3. Review environment variables in Debug channel

## Debug Logging API

### For Extension Developers

#### Adding Debug Logging

```typescript
import { getLogger } from './utils/debugLogger';

const logger = getLogger();

// User-facing message
logger.info('Starting operation...');

// Debug information
logger.debug('Operation details:', {
  config: userConfig,
  environment: process.env.NODE_ENV
});

// Command execution logging
const result = await exec('npm install');
logger.logCommand('npm install', {
  stdout: result.stdout,
  stderr: result.stderr,
  code: result.code,
  duration: elapsed
});
```

#### Log Levels

- `info()` - General information (Logs channel)
- `warn()` - Warnings (Logs channel)
- `error()` - Errors (Logs channel)
- `debug()` - Detailed debugging (Debug channel)
- `logCommand()` - Command execution (Debug channel)

### Best Practices

1. **Use appropriate channels**: User messages to Logs, details to Debug
2. **Log command execution**: Always use `logCommand()` for shell commands
3. **Include context**: Add relevant data to debug messages
4. **Protect sensitive data**: Never log tokens, passwords, or keys
5. **Add timing**: Include duration for performance debugging

## Exporting Debug Logs

The diagnostics command offers to export logs for sharing:

1. Run diagnostics
2. Choose "Export Log" when prompted
3. Save the file
4. Share with support or attach to issues

The exported file includes all Debug channel content for the session.

## Configuration

### Debug Settings

Future enhancement will add settings to control debug verbosity:

```json
{
  "demoBuilder.enableDebugLogging": true,
  "demoBuilder.debugLogLevel": "verbose"
}
```

## Platform-Specific Debugging

### macOS
- Check shell configuration (.zshrc)
- Verify Gatekeeper permissions for CLI tools
- Review PATH in both Terminal and VS Code

### Windows
- Check PowerShell execution policy
- Verify PATH environment variable
- Review Windows Defender settings

### Linux
- Check shell configuration (.bashrc)
- Verify executable permissions
- Review AppArmor/SELinux policies

## Troubleshooting the Debug System

### Debug Channel Not Appearing

1. Ensure extension activated properly
2. Check VS Code Output panel dropdown
3. Restart VS Code if needed

### No Debug Output

1. Verify DebugLogger initialized in extension.ts
2. Check if debug logging is enabled (future setting)
3. Review console for initialization errors

### Export Not Working

1. Check file system permissions
2. Verify sufficient disk space
3. Try different save location

## Integration with Error Tracking

The ErrorLogger integrates with the debug system while maintaining:
- Status bar error/warning counts
- Problems panel integration
- Critical error notifications

All ErrorLogger output flows through the unified DebugLogger channels.

## Future Enhancements

- Remote debugging support
- Log aggregation for multi-system debugging
- Performance profiling integration
- Automatic issue report generation
- Debug log encryption for sensitive environments