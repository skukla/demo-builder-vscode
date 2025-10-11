# Adobe CLI Timeout Issues

## Problem Overview

Adobe I/O CLI commands frequently succeed but timeout due to the extension's timeout values being too restrictive. This creates a disconnect where:

1. **Backend logs show success**: Commands complete with success indicators in stdout
2. **UI shows errors**: "Error Loading Projects" or similar timeout messages
3. **User confusion**: Apparent failures despite successful operations

## Root Cause

The Adobe CLI (`aio console project select`, `aio console workspace list`, etc.) often takes 8-10 seconds to complete, but the extension was using 5-second timeouts. The commands succeed but the extension gives up waiting too early.

## Symptoms

### User Experience
- "Error Loading Projects" after clicking Continue
- UI appears to fail despite debug logs showing success
- Inconsistent behavior (sometimes works, sometimes doesn't)

### Debug Logs Show
```
[DEBUG] Executing: aio console project select <project-id>
[DEBUG] Command stdout: Project selected : <project-name>
[ERROR] Command timed out after 5000ms
```

Notice the contradiction: stdout shows success, but timeout error is thrown.

## Solution: Two-Part Fix

### 1. Increased Timeout Values

Updated `src/utils/timeoutConfig.ts`:

```typescript
export const TIMEOUT_CONFIG = {
    // Adobe CLI operations - increased timeouts
    AUTH_CHECK: 8000,        // Was: 5000
    ORG_FETCH: 12000,        // Was: 8000
    PROJECT_FETCH: 15000,    // Was: 10000
    WORKSPACE_FETCH: 10000,  // Was: 8000
    CONFIG_WRITE: 10000,     // Was: 5000 ⭐ KEY FIX

    // Other timeouts remain the same
    QUICK_COMMAND: 5000,
    LONG_COMMAND: 30000,
    // ...
};
```

**Critical Change**: `CONFIG_WRITE` increased from 5000ms to 10000ms for project/workspace selection operations.

### 2. Success Detection in Timeout Scenarios

Added success detection in catch blocks throughout `src/utils/adobeAuthManager.ts`:

```typescript
async selectProject(projectId: string): Promise<boolean> {
    try {
        const result = await executeCommand(
            `aio console project select ${projectId}`,
            { timeout: TIMEOUT_CONFIG.CONFIG_WRITE }
        );
        return result.code === 0;
    } catch (error) {
        const err = error as any;

        // ⭐ KEY FIX: Check for success indicators even in timeout
        if (err.stdout && err.stdout.includes('Project selected :')) {
            logger.info('Project selection succeeded (detected via stdout)');
            return true;
        }

        logger.error('Failed to select project', err);
        throw error;
    }
}
```

## Success Indicators by Command

### Project Selection
**Command**: `aio console project select <project-id>`
**Success Pattern**: `Project selected : <project-name>`

```typescript
if (err.stdout && err.stdout.includes('Project selected :')) {
    return true;
}
```

### Workspace Operations
**Command**: `aio console workspace list`
**Success Pattern**: JSON array or workspace data in stdout

```typescript
if (err.stdout && err.stdout.trim().startsWith('[')) {
    // Likely JSON response despite timeout
    try {
        const data = JSON.parse(err.stdout);
        return data;
    } catch (parseError) {
        // Fall through to error
    }
}
```

### Organization Fetching
**Command**: `aio console org list`
**Success Pattern**: JSON array of organizations

```typescript
if (err.stdout && err.stdout.includes('"id"') && err.stdout.includes('"name"')) {
    // Looks like organization data
    try {
        return JSON.parse(err.stdout);
    } catch (parseError) {
        // Fall through to error
    }
}
```

## Implementation Pattern

### Standard Timeout Handling Pattern

```typescript
import { TIMEOUT_CONFIG } from './timeoutConfig';

async function executeAdobeCommand(command: string): Promise<any> {
    try {
        // Use appropriate timeout for command type
        const result = await executeCommand(command, {
            timeout: TIMEOUT_CONFIG.CONFIG_WRITE  // or appropriate timeout
        });

        return result;
    } catch (error) {
        const err = error as any;

        // Check for success indicators in stdout
        if (err.stdout) {
            // Command-specific success detection
            if (command.includes('project select') && err.stdout.includes('Project selected :')) {
                return { success: true, stdout: err.stdout };
            }

            if (command.includes('list') && err.stdout.trim().startsWith('[')) {
                try {
                    return JSON.parse(err.stdout);
                } catch (parseError) {
                    // Continue to error handling
                }
            }
        }

        // No success indicators found, re-throw error
        throw error;
    }
}
```

### Webview Message Handler Pattern

```typescript
// In command message handlers
comm.on('select-project', async (payload) => {
    try {
        const result = await this.adobeAuth.selectProject(payload.projectId);
        return { success: true, data: result };
    } catch (error) {
        // Error already includes success detection logic
        logger.error('Project selection failed', error);
        return {
            success: false,
            error: 'Failed to select project. Please try again.'
        };
    }
});
```

## Debugging Timeout Issues

### 1. Enable Debug Logging

```typescript
// Add debug logging before commands
logger.debug(`Executing Adobe CLI command: ${command}`);
logger.debug(`Timeout set to: ${timeout}ms`);

// Log detailed results
logger.debug('Command result:', {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    duration: Date.now() - startTime
});
```

### 2. Check Command Output

Look for these patterns in debug logs:

```bash
# Success despite timeout
[DEBUG] Command stdout: Project selected : My Project Name
[ERROR] Command timed out after 5000ms

# Actual failure
[DEBUG] Command stdout:
[DEBUG] Command stderr: Error: Authentication failed
[ERROR] Command timed out after 5000ms
```

### 3. Manual Testing

Test Adobe CLI commands manually to understand actual completion times:

```bash
# Time the command
time aio console project select <project-id>

# Typical results:
# real    0m8.234s  <- Takes ~8 seconds
# user    0m2.142s
# sys     0m0.298s
```

## Common Timeout Values by Operation

| Operation | Timeout | Typical Duration | Notes |
|-----------|---------|------------------|-------|
| `aio auth check` | 8000ms | 2-4s | Usually fast |
| `aio console org list` | 12000ms | 4-8s | Moderate |
| `aio console project list` | 15000ms | 6-12s | Slower with many projects |
| `aio console project select` | 10000ms | 6-10s | ⭐ Most problematic |
| `aio console workspace list` | 10000ms | 4-8s | Moderate |

## Prevention

### 1. Use Centralized Timeouts

Always import from `timeoutConfig.ts`:

```typescript
import { TIMEOUT_CONFIG } from '../utils/timeoutConfig';

// Use specific timeout for operation type
const timeout = TIMEOUT_CONFIG.CONFIG_WRITE;
```

### 2. Always Include Success Detection

```typescript
catch (error) {
    // Always check for success indicators
    if (this.isSuccessfulDespiteTimeout(error, commandType)) {
        return this.extractSuccessResult(error);
    }
    throw error;
}
```

### 3. Test with Slow Networks

Adobe CLI performance varies significantly with:
- Network latency
- Adobe service responsiveness
- Authentication token freshness
- Project/org complexity

## Version History

- **Pre v1.5.0**: Fixed 5-second timeouts caused frequent false failures
- **v1.5.0**: Increased timeouts + success detection pattern
- **Future**: Consider adaptive timeouts based on network conditions