# Adobe CLI Timeout Issues

## Problem Overview

Adobe I/O CLI commands frequently succeed but appear to timeout because the extension's timeout values are too restrictive. This creates a disconnect where:

1. **Backend logs show success**: Commands complete with success indicators in stdout
2. **UI shows errors**: "Error Loading Projects" or similar timeout messages
3. **User confusion**: Apparent failures despite successful operations

## Root Cause

The Adobe CLI (`aio console project select`, `aio console workspace list`, etc.) often takes 8-10 seconds to complete, but the extension was using 5-second timeouts. The commands succeed, but the extension gives up waiting too early.

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

Notice the contradiction: stdout shows success, but a timeout error is thrown.

## Solution: Two-Part Fix

### 1. Semantic Timeout Buckets

Timeouts are configured in `src/core/utils/timeoutConfig.ts` (exported as `TIMEOUTS`):

```typescript
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

export const TIMEOUTS = {
    /** Fast operations: config reads, shell checks, quick validations (5 seconds) */
    QUICK: 5000,

    /** Standard operations: API calls, data loading, list fetching (30 seconds) */
    NORMAL: 30000,

    /** Complex operations: mesh deployment, installations, builds (3 minutes) */
    LONG: 180000,

    // ...plus UI, POLL, AUTH sub-objects and named operation constants
};
```

Adobe CLI operations (org list, project select, workspace list) use `TIMEOUTS.NORMAL` (30 seconds), which is sufficient for even slow CLI responses.

### 2. Success Detection in Timeout Scenarios

Added success detection in catch blocks throughout `src/features/authentication/services/authenticationService.ts`:

```typescript
async selectProject(projectId: string): Promise<boolean> {
    try {
        const result = await executeCommand(
            `aio console project select ${projectId}`,
            { timeout: TIMEOUTS.NORMAL }
        );
        return result.code === 0;
    } catch (error) {
        const err = error as any;

        // KEY FIX: Check for success indicators even on timeout
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
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

async function executeAdobeCommand(command: string): Promise<any> {
    try {
        const result = await executeCommand(command, {
            timeout: TIMEOUTS.NORMAL  // 30s covers all Adobe CLI operations
        });
        return result;
    } catch (error) {
        const err = error as any;

        // Check for success indicators in stdout
        if (err.stdout) {
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

        throw error;
    }
}
```

### Webview Message Handler Pattern

```typescript
comm.on('select-project', async (payload) => {
    try {
        const result = await this.adobeAuth.selectProject(payload.projectId);
        return { success: true, data: result };
    } catch (error) {
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
logger.debug(`Executing Adobe CLI command: ${command}`);
logger.debug(`Timeout set to: ${timeout}ms`);

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
| `aio auth check` | `TIMEOUTS.QUICK` (5s) | 2-4s | Usually fast |
| `aio console org list` | `TIMEOUTS.NORMAL` (30s) | 4-8s | Moderate |
| `aio console project list` | `TIMEOUTS.NORMAL` (30s) | 6-12s | Slower with many projects |
| `aio console project select` | `TIMEOUTS.NORMAL` (30s) | 6-10s | Most problematic |
| `aio console workspace list` | `TIMEOUTS.NORMAL` (30s) | 4-8s | Moderate |

## Prevention

### 1. Use Centralized Timeouts

Always import from `timeoutConfig.ts` using the path alias:

```typescript
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

// Use the semantic bucket that fits the operation
const timeout = TIMEOUTS.NORMAL;   // Adobe CLI calls
const timeout = TIMEOUTS.QUICK;    // Fast checks, config reads
const timeout = TIMEOUTS.LONG;     // Installations, deployments
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

Adobe CLI performance varies with:
- Network latency
- Adobe service responsiveness
- Authentication token freshness
- Project/org complexity

## Version History

- **Pre v1.5.0**: Fixed 5-second timeouts caused frequent false failures
- **v1.5.0**: Increased timeouts + success detection pattern
- **v1.6.0+**: Timeout config moved to `src/core/utils/timeoutConfig.ts`, renamed from `TIMEOUT_CONFIG` to `TIMEOUTS` with semantic bucket keys
