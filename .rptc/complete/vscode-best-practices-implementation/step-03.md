# Step 3: Upgrade to LogOutputChannel API

## Objective

Upgrade logging infrastructure from custom `OutputChannel` to VS Code's native `LogOutputChannel` API for native severity levels, while **keeping the dual-channel architecture** for user/support separation.

## Prerequisites

**PM Approval:** ✅ APPROVED (2025-11-25)

Bumping minimum VS Code version from 1.74.0 to 1.84.0 is approved.

**PM Decision:** ✅ KEEP DUAL-CHANNEL (2025-11-25)

Keep two separate channels:
- "Demo Builder: Logs" - User-friendly messages for end users
- "Demo Builder: Debug" - Technical details for support professionals

**Rationale:**
- `LogOutputChannel` introduced in VS Code 1.84 (October 2023)
- VS Code 1.84 is 2+ years old - practically all active users have upgraded
- Dual-channel provides clear separation for different audiences
- Support workflow: "Open Demo Builder: Debug channel" is clearer than "Set log level"

## Current State

```typescript
// src/core/logging/debugLogger.ts
export class DebugLogger {
    private outputChannel: vscode.OutputChannel;  // Standard OutputChannel
    private debugChannel: vscode.OutputChannel;   // Separate debug channel

    public info(message: string): void {
        const timestamp = new Date().toLocaleTimeString();
        const logLine = `[${timestamp}] ${message}`;
        this.outputChannel.appendLine(logLine);
    }

    public debug(message: string, data?: unknown): void {
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] DEBUG: ${message}`;
        this.debugChannel.appendLine(logLine);
    }
}
```

**Problems:**
- Manual timestamp formatting
- No native severity filtering within each channel
- Using older OutputChannel API (not LogOutputChannel)

## Target State

```typescript
export class DebugLogger {
    private logsChannel: vscode.LogOutputChannel;   // User-facing logs
    private debugChannel: vscode.LogOutputChannel;  // Technical debug logs

    public info(message: string): void {
        this.logsChannel.info(message);  // Native info level
    }

    public warn(message: string): void {
        this.logsChannel.warn(message);  // Native warn level
    }

    public error(message: string, error?: Error): void {
        this.logsChannel.error(message);  // Native error level
    }

    public debug(message: string, data?: unknown): void {
        this.debugChannel.debug(message);  // Goes to Debug channel
    }
}
```

**Benefits:**
- Native severity levels within each channel
- Automatic timestamp formatting by VS Code
- Keep clear separation: Logs (users) vs Debug (support)
- Users can still set log level per-channel if desired
- Dashboard toggle remains intuitive

## Implementation

### Phase 1: Version Bump

**package.json**:
```diff
  "engines": {
-   "vscode": "^1.74.0"
+   "vscode": "^1.84.0"
  },
```

### Phase 2: Logger Refactor (Keep Dual-Channel)

**src/core/logging/debugLogger.ts** (refactor to LogOutputChannel):

```typescript
import * as vscode from 'vscode';

export class DebugLogger {
    private logsChannel: vscode.LogOutputChannel;   // User-facing
    private debugChannel: vscode.LogOutputChannel;  // Technical
    private logBuffer: string[] = [];
    private debugBuffer: string[] = [];

    constructor(context: vscode.ExtensionContext) {
        // Create LogOutputChannels with native severity support
        this.logsChannel = vscode.window.createOutputChannel('Demo Builder: Logs', { log: true });
        this.debugChannel = vscode.window.createOutputChannel('Demo Builder: Debug', { log: true });

        context.subscriptions.push(this.logsChannel);
        context.subscriptions.push(this.debugChannel);
    }

    // User-facing messages (Logs channel)
    public info(message: string): void {
        this.logsChannel.info(message);
        this.logBuffer.push(`[INFO] ${message}`);
    }

    public warn(message: string): void {
        this.logsChannel.warn(message);
        this.logBuffer.push(`[WARN] ${message}`);
    }

    public error(message: string, error?: Error): void {
        if (error) {
            this.logsChannel.error(message, error);
        } else {
            this.logsChannel.error(message);
        }
        this.logBuffer.push(`[ERROR] ${message}`);
    }

    // Technical messages (Debug channel)
    public debug(message: string, data?: unknown): void {
        if (data !== undefined) {
            try {
                const formatted = JSON.stringify(data, null, 2);
                this.debugChannel.debug(`${message}\n${formatted}`);
            } catch {
                this.debugChannel.debug(`${message}\n${String(data)}`);
            }
        } else {
            this.debugChannel.debug(message);
        }
        this.debugBuffer.push(`[DEBUG] ${message}`);
    }

    // Command execution logging (Debug channel - trace level)
    public logCommand(command: string, result: CommandResultWithContext, args?: string[]): void {
        this.debugChannel.debug(`Command: ${command}`);
        if (args?.length) {
            this.debugChannel.trace(`Arguments: ${args.join(' ')}`);
        }
        if (result.duration) {
            this.debugChannel.debug(`Duration: ${result.duration}ms`);
        }
        this.debugChannel.trace(`Exit Code: ${result.code ?? 'null'}`);
        if (result.stdout) {
            this.debugChannel.trace(`STDOUT:\n${result.stdout}`);
        }
        if (result.stderr) {
            this.debugChannel.trace(`STDERR:\n${result.stderr}`);
        }
    }

    // Show Logs channel
    public show(preserveFocus = true): void {
        this.logsChannel.show(preserveFocus);
    }

    // Show Debug channel
    public showDebug(preserveFocus = true): void {
        this.debugChannel.show(preserveFocus);
    }

    // Clear channels
    public clear(): void {
        this.logsChannel.clear();
    }

    public clearDebug(): void {
        this.debugChannel.clear();
    }

    // Export log content
    public getLogContent(): string {
        return this.logBuffer.join('\n');
    }

    public dispose(): void {
        this.logsChannel.dispose();
        this.debugChannel.dispose();
    }
}
```

### Phase 3: Simplify Channel Management

Remove unnecessary complexity while keeping dual-channel:
- Remove `isLogsVisible`/`isDebugVisible` tracking (not needed with LogOutputChannel)
- Remove `hide()` methods (let VS Code handle panel management)
- Keep `show()` and `showDebug()` for dashboard toggle

### Phase 4: Dashboard - Keep Toggle

The dashboard's "Logs/Debug" toggle **stays as-is**:
- "Logs" button → `logger.show()` → Opens Logs channel
- "Debug" button → `logger.showDebug()` → Opens Debug channel

This is the preferred UX for the support workflow.

## Migration Strategy

### Backward Compatibility

Since we're bumping the VS Code version, no backward compatibility needed for the logging API. All users will have VS Code 1.84+.

### Configuration

Keep the existing `demoBuilder.logLevel` setting - it can control the default log level for both channels if desired.

## Testing Strategy

### Unit Tests

Update existing logging tests:
- Test all severity levels on both channels
- Test data serialization in debug
- Test command logging goes to debug channel
- Test show() opens Logs channel
- Test showDebug() opens Debug channel

### Manual Tests

1. Open "Demo Builder: Logs" channel
   - Verify info/warn/error messages appear
   - Verify timestamps are automatic (VS Code format)

2. Open "Demo Builder: Debug" channel
   - Verify debug messages appear
   - Verify command logging appears

3. Dashboard toggle
   - "Logs" button opens Logs channel
   - "Debug" button opens Debug channel

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `package.json` | Modify | Bump VS Code version to 1.84.0 |
| `src/core/logging/debugLogger.ts` | Refactor | Upgrade both channels to LogOutputChannel |
| `tests/core/logging/debugLogger.test.ts` | Update | New API tests |

**Dashboard files unchanged** - toggle behavior stays the same.

## Acceptance Criteria

- [x] VS Code minimum version bumped to 1.84.0
- [x] DebugLogger uses LogOutputChannel API for BOTH channels
- [x] "Demo Builder: User Logs" channel works with native severity (info/warn/error)
- [x] "Demo Builder: Debug Logs" channel works with native severity (debug/trace)
- [x] Dashboard uses single Logs button (users switch via Output panel dropdown)
- [x] All existing logging calls produce equivalent output
- [x] All tests passing (53 tests)
- [x] Buffer size cap (10K) with LRU eviction
- [x] Path validation for replayLogsFromFile
- [x] Efficiency Agent - PASS
- [x] Security Agent - PASS

## Risk Assessment

**Risk Level:** LOW (revised from MEDIUM)

**Rationale:**
- Keeping dual-channel means minimal UX change
- Dashboard toggle unchanged
- Only internal API upgrade (OutputChannel → LogOutputChannel)

**Risks:**
1. **Version bump may exclude some users** - Mitigated by 2+ year old version
2. **API differences** - LogOutputChannel is well-documented, same method names

## Dependencies

- **PM approval:** ✅ Version bump approved
- **PM decision:** ✅ Keep dual-channel

## Estimated Effort

~2 hours (simpler than single-channel refactor)

## PM Decisions

✅ **VS Code Version Bump** (2025-11-25) - Approved 1.74.0 → 1.84.0

✅ **Keep Dual-Channel** (2025-11-25) - Maintain Logs/Debug separation for user/support workflow
