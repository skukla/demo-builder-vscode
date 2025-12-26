# Step 1: Shell Module Tests (20 files)

> **Phase:** 4 - Core Infrastructure
> **Step:** 1 of 5
> **Focus:** Command execution, environment setup, process management

## Overview

**Purpose:** Audit all shell module tests to ensure they accurately reflect the current CommandExecutor, EnvironmentSetup, and ProcessCleanup implementations.

**Estimated Time:** 3-4 hours

**Prerequisites:**
- [ ] All current tests pass
- [ ] Access to src/core/shell/*.ts for reference

---

## Source Files for Reference

Before auditing tests, review these source files:

```
src/core/shell/
├── commandExecutor.ts      # Main executor - orchestrates execution
├── commandSequencer.ts     # Sequential command execution
├── environmentSetup.ts     # Node version, PATH discovery
├── processCleanup.ts       # Event-driven process termination
├── fileWatcher.ts          # File change detection
├── pollingService.ts       # Smart polling with backoff
├── rateLimiter.ts          # Rate limiting for APIs
├── resourceLocker.ts       # Mutual exclusion
├── retryStrategyManager.ts # Retry strategies
└── types.ts                # Type definitions
```

---

## Test Files to Audit

### Command Execution Tests (6 files)

#### 1. commandExecutor-basic-execution.test.ts

**File:** `tests/core/shell/commandExecutor-basic-execution.test.ts`

**Audit Checklist:**
- [ ] Mock setup matches current CommandExecutor constructor dependencies
- [ ] `execute()` call signature matches current API
- [ ] `ExecuteOptions` interface matches current type
- [ ] `CommandResult` shape matches current return type
- [ ] Timeout handling uses TIMEOUTS.* constants
- [ ] Streaming callback signature matches current pattern
- [ ] Error types match current exception handling

**Key Verification Points:**
```typescript
// Verify these match current implementation:
- CommandExecutor constructor (no args)
- execute(command: string, options?: ExecuteOptions): Promise<CommandResult>
- CommandResult: { stdout, stderr, code, duration }
- ExecuteOptions: { timeout, exclusive, streaming, onOutput, shell }
```

#### 2. commandExecutor-adobe-cli.test.ts

**File:** `tests/core/shell/commandExecutor-adobe-cli.test.ts`

**Audit Checklist:**
- [ ] Adobe CLI command patterns match current usage
- [ ] Retry behavior matches current RetryStrategyManager
- [ ] Timeout values use TIMEOUTS.CONFIG_WRITE, TIMEOUTS.ADOBE_CLI
- [ ] Error parsing matches current Adobe CLI error format
- [ ] Success detection in timeout scenarios tested

#### 3. commandExecutor-cancellation.test.ts

**File:** `tests/core/shell/commandExecutor-cancellation.test.ts`

**Audit Checklist:**
- [ ] Cancellation token interface matches current API
- [ ] Process cleanup on cancel matches current behavior
- [ ] Partial result handling matches current implementation

#### 4. commandExecutor-delegation.test.ts

**File:** `tests/core/shell/commandExecutor-delegation.test.ts`

**Audit Checklist:**
- [ ] Delegation to internal services verified
- [ ] Mock service setup matches current internal structure
- [ ] ResourceLocker integration tested correctly
- [ ] CommandSequencer delegation verified

#### 5. commandExecutor-timeout.test.ts

**File:** `tests/core/shell/commandExecutor-timeout.test.ts`

**Audit Checklist:**
- [ ] Timeout values use TIMEOUTS.* constants (not magic numbers)
- [ ] TIMEOUTS.MIN_COMMAND_TIMEOUT enforced
- [ ] TIMEOUTS.COMMAND_DEFAULT used correctly
- [ ] Timeout validation error message matches current

#### 6. commandExecutor.security.test.ts

**File:** `tests/core/shell/commandExecutor.security.test.ts`

**Audit Checklist:**
- [ ] Command injection tests still valid
- [ ] Shell metacharacter handling tested
- [ ] Path traversal prevention verified
- [ ] validateTimeout() security check tested

---

### Command Sequencing Tests (2 files)

#### 7. commandSequencer.test.ts

**File:** `tests/core/shell/commandSequencer.test.ts`

**Audit Checklist:**
- [ ] Sequencer API matches current implementation
- [ ] Queue behavior matches current FIFO ordering
- [ ] Error handling in sequence matches current

#### 8. commandSequencer-helpers.test.ts

**File:** `tests/core/shell/commandSequencer-helpers.test.ts`

**Audit Checklist:**
- [ ] Helper functions match current exports
- [ ] Utility function signatures verified

---

### Environment Setup Tests (3 files)

#### 9. environmentSetup-configuration.test.ts

**File:** `tests/core/shell/environmentSetup-configuration.test.ts`

**Audit Checklist:**
- [ ] Configuration options match current EnvironmentSetup
- [ ] Shell selection logic tested correctly
- [ ] Path configuration matches current behavior

#### 10. environmentSetup-pathDiscovery.test.ts

**File:** `tests/core/shell/environmentSetup-pathDiscovery.test.ts`

**Audit Checklist:**
- [ ] PATH discovery algorithm matches current
- [ ] FNM path detection tested
- [ ] NVM path detection tested
- [ ] Platform-specific paths (macOS/Linux) verified

#### 11. environmentSetup-nodeVersion.test.ts

**File:** `tests/core/shell/environmentSetup-nodeVersion.test.ts`

**Audit Checklist:**
- [ ] Node version discovery matches current
- [ ] Multi-version support tested (fnm, nvm)
- [ ] Version validation matches current requirements
- [ ] Node version switching behavior verified

---

### Process Management Tests (4 files)

#### 12. processCleanup.test.ts

**File:** `tests/core/shell/processCleanup.test.ts`

**Audit Checklist:**
- [ ] Event-driven termination pattern tested
- [ ] killProcessTree() API matches current
- [ ] No polling/grace period patterns (event-driven only)

#### 13. processCleanup.error.test.ts

**File:** `tests/core/shell/processCleanup.error.test.ts`

**Audit Checklist:**
- [ ] Error conditions match current exception handling
- [ ] Invalid PID handling tested
- [ ] Permission error handling verified

#### 14. processCleanup.mocked.test.ts

**File:** `tests/core/shell/processCleanup.mocked.test.ts`

**Audit Checklist:**
- [ ] Cross-platform mocks correct (macOS, Linux, Windows)
- [ ] pkill -P mocked for Unix
- [ ] taskkill /T mocked for Windows

#### 15. processCleanup.timeout.test.ts

**File:** `tests/core/shell/processCleanup.timeout.test.ts`

**Audit Checklist:**
- [ ] Timeout options match current API
- [ ] SIGTERM -> SIGKILL fallback tested
- [ ] Timeout values use TIMEOUTS.* if applicable

---

### Supporting Services Tests (5 files)

#### 16. fileWatcher.test.ts

**File:** `tests/core/shell/fileWatcher.test.ts`

**Audit Checklist:**
- [ ] FileWatcher API matches current
- [ ] Watch patterns match current implementation
- [ ] Debounce behavior tested correctly

#### 17. pollingService.test.ts

**File:** `tests/core/shell/pollingService.test.ts`

**Audit Checklist:**
- [ ] PollingService API matches current
- [ ] Exponential backoff behavior tested
- [ ] Condition-based stopping verified
- [ ] PollOptions type matches current

#### 18. rateLimiter.test.ts

**File:** `tests/core/shell/rateLimiter.test.ts`

**Audit Checklist:**
- [ ] RateLimiter API matches current
- [ ] Token bucket algorithm tested
- [ ] Rate configuration options verified

#### 19. resourceLocker.test.ts

**File:** `tests/core/shell/resourceLocker.test.ts`

**Audit Checklist:**
- [ ] ResourceLocker API matches current
- [ ] executeExclusive() signature verified
- [ ] Mutual exclusion behavior tested
- [ ] Lock timeout handling verified

#### 20. retryStrategyManager.test.ts

**File:** `tests/core/shell/retryStrategyManager.test.ts`

**Audit Checklist:**
- [ ] RetryStrategyManager API matches current
- [ ] Retry strategies (network, file, adobe-cli) tested
- [ ] Backoff calculation verified
- [ ] Max retries configuration tested

---

## Audit Process

For each file:

1. **Read current source** in src/core/shell/
2. **Open test file** in tests/core/shell/
3. **Verify mock setup** matches current dependencies
4. **Check each test** for:
   - Correct API calls
   - Correct expected values
   - No magic numbers (use TIMEOUTS.*)
   - No version references (v2/v3)
5. **Run tests** after changes: `npm test -- tests/core/shell/[file].test.ts`
6. **Commit** after each file passes

---

## Common Issues to Fix

### Issue 1: Magic Timeout Numbers

**Before:**
```typescript
const result = await executor.execute('cmd', { timeout: 10000 });
```

**After:**
```typescript
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
const result = await executor.execute('cmd', { timeout: TIMEOUTS.COMMAND_DEFAULT });
```

### Issue 2: Outdated Mock Setup

**Before:**
```typescript
const executor = new CommandExecutor(mockLogger, mockEnv);
```

**After:**
```typescript
const executor = new CommandExecutor(); // No constructor args
```

### Issue 3: Outdated CommandResult Shape

**Before:**
```typescript
expect(result).toEqual({
  output: 'hello',
  exitCode: 0
});
```

**After:**
```typescript
expect(result).toEqual({
  stdout: 'hello',
  stderr: '',
  code: 0,
  duration: expect.any(Number)
});
```

---

## Completion Criteria

- [ ] All 20 shell test files audited
- [ ] All mocks match current src/core/shell/ implementations
- [ ] No hardcoded timeout values (all use TIMEOUTS.*)
- [ ] All tests pass: `npm test -- tests/core/shell/`
- [ ] No TypeScript errors

---

## Files Modified (Tracking)

| File | Status | Notes |
|------|--------|-------|
| commandExecutor-basic-execution.test.ts | [ ] | |
| commandExecutor-adobe-cli.test.ts | [ ] | |
| commandExecutor-cancellation.test.ts | [ ] | |
| commandExecutor-delegation.test.ts | [ ] | |
| commandExecutor-timeout.test.ts | [ ] | |
| commandExecutor.security.test.ts | [ ] | |
| commandSequencer.test.ts | [ ] | |
| commandSequencer-helpers.test.ts | [ ] | |
| environmentSetup-configuration.test.ts | [ ] | |
| environmentSetup-pathDiscovery.test.ts | [ ] | |
| environmentSetup-nodeVersion.test.ts | [ ] | |
| processCleanup.test.ts | [ ] | |
| processCleanup.error.test.ts | [ ] | |
| processCleanup.mocked.test.ts | [ ] | |
| processCleanup.timeout.test.ts | [ ] | |
| fileWatcher.test.ts | [ ] | |
| pollingService.test.ts | [ ] | |
| rateLimiter.test.ts | [ ] | |
| resourceLocker.test.ts | [ ] | |
| retryStrategyManager.test.ts | [ ] | |

---

## Next Step

After completing Step 1, proceed to:
**Step 2: State Module Tests (15 files)**
