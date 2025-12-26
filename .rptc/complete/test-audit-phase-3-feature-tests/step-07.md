# Step 7: Lifecycle Feature Tests (17 files)

> **Phase:** 3 - Feature Tests
> **Step:** 7 of 9
> **Feature:** lifecycle
> **Test Files:** 17
> **Estimated Time:** 1-2 hours

---

## Purpose

Audit all 17 lifecycle test files to ensure tests accurately reflect the current demo start/stop operations and process management. Lifecycle controls the running state of demo projects.

---

## Prerequisites

- [ ] Steps 1-6 complete or in parallel
- [ ] All current tests pass before starting audit
- [ ] Read current lifecycle implementation structure

---

## Test Files to Audit

### Commands (11 files)

- [ ] `tests/features/lifecycle/commands/deleteProject-navigation.test.ts`
- [ ] `tests/features/lifecycle/commands/deleteProject.error.test.ts`
- [ ] `tests/features/lifecycle/commands/deleteProject.lifecycle.test.ts`
- [ ] `tests/features/lifecycle/commands/deleteProject.retry.test.ts`
- [ ] `tests/features/lifecycle/commands/startDemo.concurrency.test.ts`
- [ ] `tests/features/lifecycle/commands/startDemo.error.test.ts`
- [ ] `tests/features/lifecycle/commands/startDemo.lifecycle.test.ts`
- [ ] `tests/features/lifecycle/commands/startDemo.portConflict.test.ts`
- [ ] `tests/features/lifecycle/commands/stopDemo.error.test.ts`
- [ ] `tests/features/lifecycle/commands/stopDemo.lifecycle.test.ts`
- [ ] `tests/features/lifecycle/commands/stopDemo.process.test.ts`

### Handlers (5 files)

- [ ] `tests/features/lifecycle/handlers/lifecycleHandlers-cancellation.test.ts`
- [ ] `tests/features/lifecycle/handlers/lifecycleHandlers-initialization.test.ts`
- [ ] `tests/features/lifecycle/handlers/lifecycleHandlers-project-actions.test.ts`
- [ ] `tests/features/lifecycle/handlers/lifecycleHandlers-showLogs.test.ts`
- [ ] `tests/features/lifecycle/handlers/lifecycleHandlers-utilities.test.ts`

### Services (1 file)

- [ ] `tests/features/lifecycle/services/lifecycleService.test.ts`

---

## Audit Checklist Per File

### 1. Demo Status Types

```typescript
// VERIFY: Status types match current definitions
// Check src/features/lifecycle/types.ts

// Example: DemoStatus
type DemoStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error';
// Verify all status values
```

### 2. Start/Stop Command Structure

```typescript
// VERIFY: Command parameters match current implementation
// Check src/features/lifecycle/commands/

// Example: Start command
const startCommand = {
  projectPath: string,
  openBrowser: boolean,
  // Verify all parameters
};
```

### 3. Process Management

```typescript
// VERIFY: Process handling tests match current logic
// Check src/features/lifecycle/services/lifecycleService.ts

// Key areas:
// - Process spawning
// - Port allocation
// - Process termination
// - Cleanup on error
```

### 4. Concurrency Handling

```typescript
// VERIFY: Concurrency tests match current locking logic
// Check src/features/lifecycle/ for concurrency patterns

// Example: Lock acquisition
expect(lockManager.acquire).toHaveBeenCalledWith('demo-start');
// Verify lock names and behavior
```

### 5. Port Conflict Resolution

```typescript
// VERIFY: Port conflict tests match current resolution
// Check src/features/lifecycle/ for port handling

// Example: Port conflict response
expect(result).toEqual({
  success: false,
  error: {
    code: 'PORT_IN_USE',
    message: expect.stringMatching(/port \d+ is already in use/i),
    // Verify error structure
  }
});
```

### 6. Project Deletion Flow

```typescript
// VERIFY: Delete tests match current deletion flow
// Check src/features/lifecycle/commands/deleteProject.ts

// Key areas:
// - Pre-deletion checks (demo running?)
// - File/folder cleanup
// - State cleanup
// - Navigation after delete
```

### 7. Error Handling

```typescript
// VERIFY: Error handling tests match current error codes
// Check src/features/lifecycle/types.ts for error definitions

// Example: Error codes
const lifecycleErrors = {
  DEMO_ALREADY_RUNNING: 'DEMO_ALREADY_RUNNING',
  START_FAILED: 'START_FAILED',
  STOP_FAILED: 'STOP_FAILED',
  // Verify all codes
};
```

---

## Key Source Files to Reference

| Source File | Purpose |
|-------------|---------|
| `src/features/lifecycle/types.ts` | Type definitions |
| `src/features/lifecycle/commands/` | Command implementations |
| `src/features/lifecycle/handlers/` | Handler implementations |
| `src/features/lifecycle/services/` | Service implementations |

---

## Common Issues to Look For

### Issue 1: Status Transition Changes

```typescript
// OLD: Direct status set
setStatus('running');

// CURRENT: May use state machine or validated transitions
transitionTo(DemoStatus.RUNNING);
```

### Issue 2: Process Spawn Parameters

```typescript
// OLD: Simple spawn
spawn('npm', ['start']);

// CURRENT: May include env, cwd, options
spawn('npm', ['start'], {
  cwd: projectPath,
  env: { ...process.env, NODE_ENV: 'development' },
  // Verify options
});
```

### Issue 3: Timeout Constants

```typescript
// OLD: Hardcoded timeouts
const timeout = 30000;

// CURRENT: Use TIMEOUTS constants
const timeout = TIMEOUTS.DEMO_START;
```

### Issue 4: Lock/Concurrency Names

```typescript
// OLD: Might use different lock names
await lock('start-demo');

// CURRENT: Verify lock names match implementation
await lock('lifecycle:start');
```

---

## Expected Outcomes

After auditing all 17 lifecycle test files:

- [ ] All status tests use current status types
- [ ] All command tests match current parameters
- [ ] All process tests match current spawn options
- [ ] All concurrency tests match current locking
- [ ] All error tests use current error codes
- [ ] All timeout values use TIMEOUTS.* constants
- [ ] No version references (v2/v3) remain

---

## Acceptance Criteria

- [ ] All 17 lifecycle test files reviewed
- [ ] Mock data matches current TypeScript interfaces
- [ ] Status types match current definitions
- [ ] Process management matches current logic
- [ ] Error codes match current implementation
- [ ] All lifecycle tests pass
- [ ] No hardcoded timeout values
- [ ] No version-specific logic remains

---

## Notes

- Lifecycle tests are critical for demo operations
- Port conflict handling is user-facing - verify error messages
- Concurrency tests prevent race conditions
- Delete flow affects navigation - verify state cleanup

---

## Implementation Log

_To be filled during audit_

### Files Audited

_List files as they are completed_

### Issues Found

_Document any issues requiring follow-up_

### Mock Updates Made

_Track mock structure changes for cross-feature consistency_
