# Step 4: Integrate execa for Subprocess Execution

## Objective

Replace direct `child_process.spawn` usage with `execa` for cleaner subprocess handling, better error messages, and built-in timeout support.

## Current State

```typescript
// src/core/shell/commandExecutor.ts
import { spawn, type ExecOptions } from 'child_process';

private async executeStreamingInternal(
    command: string,
    options: ExecOptions,
    onOutput: (data: string) => void,
): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        let stdout = '';
        let stderr = '';

        const child = spawn(command, [], {
            shell: options.shell || false,
            cwd: options.cwd,
            env: options.env!,
        });

        child.stdout?.on('data', (data) => {
            const output = data.toString();
            stdout += output;
            // ... handle output
        });

        child.stderr?.on('data', (data) => {
            // ... handle stderr
        });

        child.on('error', (error) => {
            reject(error);
        });

        child.on('close', (code) => {
            resolve({ stdout, stderr, code: code || 0, duration });
        });

        // Manual timeout handling
        if (options.timeout) {
            const timeoutId = setTimeout(() => {
                // ... manual kill logic
            }, options.timeout);
        }
    });
}
```

**Issues:**
- Manual Promise wrapping
- Manual timeout handling with cleanup
- Manual process kill (SIGTERM → SIGKILL)
- Verbose error handling
- No AbortController support

## Target State

```typescript
import { execa, type Options as ExecaOptions } from 'execa';

private async executeStreamingInternal(
    command: string,
    args: string[],
    options: ExecaOptions,
    onOutput?: (data: string) => void,
): Promise<CommandResult> {
    const startTime = Date.now();

    try {
        const result = await execa(command, args, {
            shell: options.shell,
            cwd: options.cwd,
            env: options.env,
            timeout: options.timeout,
            signal: options.signal,  // AbortController support
            stdio: onOutput ? 'pipe' : 'pipe',
        });

        // Stream output if callback provided
        if (onOutput && result.stdout) {
            onOutput(result.stdout);
        }

        return {
            stdout: result.stdout,
            stderr: result.stderr,
            code: result.exitCode,
            duration: Date.now() - startTime,
        };
    } catch (error) {
        if (error.timedOut) {
            throw new Error(`Command timed out after ${options.timeout}ms`);
        }
        if (error.killed) {
            throw new Error('Command was killed');
        }
        throw error;
    }
}
```

**Benefits:**
- Promise-based by default
- Built-in timeout with automatic cleanup
- AbortController signal support
- Better error types (`error.timedOut`, `error.killed`)
- Cross-platform consistency
- Cleaner code

## Implementation

### Phase 1: Add execa Dependency

```bash
npm install execa
```

**package.json**:
```json
"dependencies": {
    "execa": "^9.0.0"
}
```

**Note:** execa v9+ is ESM-only. If using CommonJS, use execa v8:
```json
"dependencies": {
    "execa": "^8.0.0"
}
```

### Phase 2: Update CommandExecutor

**src/core/shell/commandExecutor.ts**:

```typescript
import { execa, ExecaError, type Options as ExecaOptions, type ResultPromise } from 'execa';

export class CommandExecutor {
    // ... existing properties ...

    /**
     * Execute command with streaming output using execa
     */
    private async executeStreamingInternal(
        command: string,
        options: ExecuteOptions,
        onOutput?: (data: string) => void,
    ): Promise<CommandResult> {
        const startTime = Date.now();

        // Build execa options
        const execaOptions: ExecaOptions = {
            shell: options.shell || false,
            cwd: options.cwd,
            env: options.env || process.env,
            timeout: options.timeout,
            reject: false,  // Don't throw on non-zero exit
        };

        // Add AbortController if provided
        if (options.signal) {
            execaOptions.signal = options.signal;
        }

        try {
            // Parse command for shell execution
            let result: Awaited<ResultPromise>;

            if (execaOptions.shell) {
                // Shell mode: pass entire command as string
                result = await execa(command, { ...execaOptions });
            } else {
                // Non-shell: parse into command + args
                const [cmd, ...args] = command.split(' ');
                result = await execa(cmd, args, execaOptions);
            }

            // Stream output if callback provided
            if (onOutput) {
                if (result.stdout) onOutput(result.stdout);
                if (result.stderr) onOutput(result.stderr);
            }

            // Auto-handle Adobe CLI telemetry prompt
            if (result.stdout?.includes('Would you like to allow @adobe/aio-cli to collect anonymous usage data?')) {
                this.logger.debug('[Command Executor] Detected aio-cli telemetry prompt in output');
                // Note: execa doesn't support stdin interaction the same way
                // This scenario needs special handling - see Phase 3
            }

            const duration = Date.now() - startTime;

            // Warn about slow commands
            if (duration > 3000) {
                this.logger.debug(`[Command Executor] Slow command: ${duration}ms`);
            }

            return {
                stdout: result.stdout || '',
                stderr: result.stderr || '',
                code: result.exitCode,
                duration,
            };
        } catch (error) {
            const execaError = error as ExecaError;

            if (execaError.timedOut) {
                this.logger.warn(`[Command Executor] Command timed out after ${options.timeout}ms`);
                throw new Error(`Command timed out after ${options.timeout}ms`);
            }

            if (execaError.killed) {
                this.logger.debug('[Command Executor] Command was killed');
                throw new Error('Command was killed');
            }

            if (execaError.isCanceled) {
                this.logger.debug('[Command Executor] Command was canceled');
                throw new Error('Command was canceled');
            }

            throw error;
        }
    }
}
```

### Phase 3: Handle Interactive Commands

Some commands (like Adobe CLI telemetry prompt) require stdin interaction. execa handles this differently:

```typescript
/**
 * Execute command with stdin interaction support
 */
private async executeWithStdin(
    command: string,
    options: ExecuteOptions,
    stdinResponses: Map<RegExp, string>,
): Promise<CommandResult> {
    const subprocess = execa(command, {
        shell: options.shell || '/bin/zsh',
        cwd: options.cwd,
        env: options.env,
        stdin: 'pipe',
    });

    // Monitor stdout for prompts
    subprocess.stdout?.on('data', (data) => {
        const output = data.toString();
        for (const [pattern, response] of stdinResponses) {
            if (pattern.test(output)) {
                subprocess.stdin?.write(response);
            }
        }
    });

    const result = await subprocess;
    return {
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        code: result.exitCode,
        duration: 0,
    };
}
```

### Phase 4: Update ProcessCleanup

**src/core/shell/processCleanup.ts**:

execa provides better kill handling, but ProcessCleanup tree-killing is still valuable:

```typescript
import { execa } from 'execa';

export class ProcessCleanup {
    /**
     * Kill process tree using execa for the pgrep/pkill commands
     */
    static async killProcessTree(pid: number, options?: { timeoutMs?: number }): Promise<void> {
        const timeout = options?.timeoutMs ?? 5000;

        // Find child processes
        const { stdout: childrenStdout } = await execa('pgrep', ['-P', String(pid)], {
            reject: false,
            timeout: 2000,
        });

        const childPids = childrenStdout
            .split('\n')
            .filter(Boolean)
            .map(Number)
            .filter(p => !isNaN(p));

        // Kill children first, then parent
        // ... rest of implementation
    }
}
```

## Testing Strategy

### Unit Tests

```typescript
describe('CommandExecutor with execa', () => {
    it('should execute simple command', async () => {
        const executor = new CommandExecutor();
        const result = await executor.execute('echo "hello"', { shell: true });
        expect(result.stdout.trim()).toBe('hello');
        expect(result.code).toBe(0);
    });

    it('should handle timeout', async () => {
        const executor = new CommandExecutor();
        await expect(
            executor.execute('sleep 10', { shell: true, timeout: 100 })
        ).rejects.toThrow('timed out');
    });

    it('should support AbortController', async () => {
        const executor = new CommandExecutor();
        const controller = new AbortController();

        const promise = executor.execute('sleep 10', {
            shell: true,
            signal: controller.signal,
        });

        controller.abort();

        await expect(promise).rejects.toThrow();
    });

    it('should handle non-zero exit code', async () => {
        const executor = new CommandExecutor();
        const result = await executor.execute('exit 1', { shell: true });
        expect(result.code).toBe(1);
    });
});
```

### Integration Tests

1. **Adobe CLI Commands** - Verify fnm exec wrapping still works
2. **Long-running Commands** - Verify timeout behavior
3. **Streaming Output** - Verify onOutput callback receives data

### Regression Tests

Run full test suite to ensure all existing functionality works:
```bash
npm test -- tests/core/shell/
```

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `package.json` | Modify | Add execa dependency |
| `src/core/shell/commandExecutor.ts` | Major Refactor | Replace spawn with execa |
| `src/core/shell/processCleanup.ts` | Modify | Use execa for pgrep/pkill |
| `src/core/shell/types.ts` | Modify | Add signal option |
| `tests/core/shell/commandExecutor.test.ts` | Update | New tests for execa |

## Migration Notes

### Breaking Changes

None - the public API remains the same:
```typescript
// Before and after - same interface
const result = await executor.execute('aio --version', { timeout: 5000 });
```

### Internal Changes

- `executeStreamingInternal` uses execa instead of spawn
- Timeout handling delegated to execa
- Error types more structured

## Acceptance Criteria

- [ ] execa package added to dependencies
- [ ] CommandExecutor refactored to use execa
- [ ] All existing tests pass
- [ ] New tests for execa-specific features
- [ ] AbortController support added
- [ ] Timeout behavior preserved
- [ ] Adobe CLI commands work correctly
- [ ] Process cleanup still works

## Risk Assessment

**Risk Level:** MEDIUM

**Risks:**
1. **ESM/CommonJS compatibility** - execa v9 is ESM-only
2. **Different behavior** - execa may have subtle differences
3. **Interactive commands** - stdin handling differs

**Mitigation:**
- Use execa v8 if CommonJS needed
- Comprehensive test coverage
- Document stdin handling changes

## Dependencies

- None - this step is independent of Steps 1-3
- Can be implemented in parallel with other steps

## Estimated Effort

~4-6 hours (refactor + comprehensive testing)

## Alternative: Minimal Integration

If full refactor is too risky, consider a minimal approach:

1. Add execa as optional tool for new features only
2. Keep existing spawn code for current functionality
3. Gradually migrate as code is touched

```typescript
// New code uses execa
const result = await execa('new-command', args, options);

// Existing code keeps spawn (unchanged)
const child = spawn(command, [], options);
```

This reduces risk but doesn't get full benefits. **Recommendation:** Full refactor with thorough testing.
