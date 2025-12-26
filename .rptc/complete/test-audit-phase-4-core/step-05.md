# Step 5: VSCode + Communication + Logging + Base + Commands Tests (18 files)

> **Phase:** 4 - Core Infrastructure
> **Step:** 5 of 5
> **Focus:** VS Code wrappers, webview communication, logging, base commands

## Overview

**Purpose:** Audit all VSCode, communication, logging, base, and commands module tests to ensure they accurately reflect current VS Code API wrappers, messaging protocol, logging implementations, and base command classes.

**Estimated Time:** 1-2 hours

**Prerequisites:**
- [ ] Step 4 (UI + Handlers + DI + Cache) complete
- [ ] All current tests pass
- [ ] Access to relevant src/core/ directories for reference

---

## Source Files for Reference

### VSCode Module

```
src/core/vscode/
├── StatusBarManager.ts           # Status bar integration
├── envFileWatcherService.ts      # .env file change detection
├── workspaceWatcherManager.ts    # Workspace-scoped file watchers
└── index.ts                      # Public exports
```

### Communication Module

```
src/core/communication/
├── webviewCommunicationManager.ts # Bidirectional messaging
├── README.md                      # Protocol documentation
└── index.ts                       # Public exports
```

### Logging Module

```
src/core/logging/
├── logger.ts                     # Basic logging
├── debugLogger.ts                # Dual channel logging
├── errorLogger.ts                # Error tracking
├── stepLogger.ts                 # Step-based logging
└── index.ts                      # Public exports
```

### Base Module

```
src/core/base/
├── BaseCommand.ts               # Base command class
├── BaseWebviewCommand.ts        # Base webview command class
├── types.ts                     # Base types
└── index.ts                     # Public exports
```

### Commands Module

```
src/core/commands/
├── commandManager.ts            # Command registration
└── [ResetAllCommand related]
```

---

## Test Files to Audit

### VSCode Tests (5 files)

#### 1. envFileWatcherService.test.ts

**File:** `tests/core/vscode/envFileWatcherService.test.ts`

**Audit Checklist:**
- [ ] EnvFileWatcherService API matches current
- [ ] Workspace-scoped watcher creation verified
- [ ] File change detection verified
- [ ] VS Code FileSystemWatcher mock correct

#### 2. envFileWatcherService-changeDetection.mocked.test.ts

**File:** `tests/core/vscode/envFileWatcherService-changeDetection.mocked.test.ts`

**Audit Checklist:**
- [ ] Hash-based change detection verified
- [ ] False positive prevention verified
- [ ] Content comparison behavior verified

#### 3. envFileWatcherService-gracePeriodNotifications.mocked.test.ts

**File:** `tests/core/vscode/envFileWatcherService-gracePeriodNotifications.mocked.test.ts`

**Audit Checklist:**
- [ ] 10-second grace period verified
- [ ] Notification suppression during startup verified
- [ ] Show-once-per-session behavior verified

#### 4. envFileWatcherService-security.mocked.test.ts

**File:** `tests/core/vscode/envFileWatcherService-security.mocked.test.ts`

**Audit Checklist:**
- [ ] Path validation verified
- [ ] Defense-in-depth checks verified
- [ ] Malicious path rejection verified

#### 5. workspaceWatcherManager.mocked.test.ts

**File:** `tests/core/vscode/workspaceWatcherManager.mocked.test.ts`

**Audit Checklist:**
- [ ] WorkspaceWatcherManager API matches current
- [ ] Watcher registration verified
- [ ] Duplicate prevention verified
- [ ] Cleanup on workspace folder removal verified

---

### Communication Tests (3 files)

#### 6. webviewCommunicationManager.handshake.test.ts

**File:** `tests/core/communication/webviewCommunicationManager.handshake.test.ts`

**Audit Checklist:**
- [ ] **Reversed handshake protocol** verified (webview initiates)
- [ ] Extension waits passively (no __extension_ready__ sent first)
- [ ] __webview_ready__ handling verified
- [ ] Message queuing until handshake complete verified

**Critical Verification:**
```typescript
// Current behavior (reversed handshake):
// 1. Extension creates WebviewCommunicationManager
// 2. Extension waits passively
// 3. Webview sends __webview_ready__
// 4. Extension acknowledges and handshake complete
// 5. Queued messages sent
```

#### 7. webviewCommunicationManager.messaging.test.ts

**File:** `tests/core/communication/webviewCommunicationManager.messaging.test.ts`

**Audit Checklist:**
- [ ] Message sending API verified
- [ ] Request-response pattern verified
- [ ] Timeout handling verified
- [ ] Message type routing verified

#### 8. webviewCommunicationManager.edge-cases.test.ts

**File:** `tests/core/communication/webviewCommunicationManager.edge-cases.test.ts`

**Audit Checklist:**
- [ ] Edge cases match current behavior
- [ ] Retry logic verified
- [ ] Error recovery verified
- [ ] **Async handler resolution** verified (v1.5.0 fix)

**v1.5.0 Critical Fix:**
```typescript
// Handlers must be properly awaited
// Before: Promise objects sent to UI
// After: Resolved values sent to UI
```

---

### Logging Tests (4 files)

#### 9. debugLogger-core.test.ts

**File:** `tests/core/logging/debugLogger-core.test.ts`

**Audit Checklist:**
- [ ] DebugLogger API matches current
- [ ] Logger initialization verified
- [ ] Log level handling verified

#### 10. debugLogger-channels.test.ts

**File:** `tests/core/logging/debugLogger-channels.test.ts`

**Audit Checklist:**
- [ ] Dual channel output verified ("Demo Builder: Logs" + "Demo Builder: Debug")
- [ ] Channel selection logic verified
- [ ] Output channel mock correct

#### 11. debugLogger-logging.test.ts

**File:** `tests/core/logging/debugLogger-logging.test.ts`

**Audit Checklist:**
- [ ] Log formatting verified
- [ ] Timestamp formatting verified
- [ ] Log levels (debug, info, warn, error) verified

#### 12. debugLogger-pathValidation.test.ts

**File:** `tests/core/logging/debugLogger-pathValidation.test.ts`

**Audit Checklist:**
- [ ] Path validation in log output verified
- [ ] Sensitive path masking verified (if applicable)

---

### Base Tests (3 files)

#### 13. baseCommand.disposal.test.ts

**File:** `tests/core/base/baseCommand.disposal.test.ts`

**Audit Checklist:**
- [ ] BaseCommand disposal pattern verified
- [ ] DisposableStore usage verified
- [ ] Resource cleanup verified

#### 14. baseWebviewCommand.disposal.test.ts

**File:** `tests/core/base/baseWebviewCommand.disposal.test.ts`

**Audit Checklist:**
- [ ] BaseWebviewCommand disposal verified
- [ ] Webview panel cleanup verified
- [ ] Communication manager cleanup verified

#### 15. baseWebviewCommand.transition.test.ts

**File:** `tests/core/base/baseWebviewCommand.transition.test.ts`

**Audit Checklist:**
- [ ] State transition behavior verified
- [ ] Lifecycle hooks verified
- [ ] Webview initialization verified

---

### Commands Tests (3 files)

#### 16. commandManager.test.ts

**File:** `tests/core/commands/commandManager.test.ts`

**Audit Checklist:**
- [ ] Command registration API verified
- [ ] Command execution verified
- [ ] Context passing verified

#### 17. ResetAllCommand.test.ts

**File:** `tests/core/commands/ResetAllCommand.test.ts`

**Audit Checklist:**
- [ ] ResetAllCommand behavior verified
- [ ] State clearing verified
- [ ] User confirmation flow verified

#### 18. ResetAllCommand.security.test.ts

**File:** `tests/core/commands/ResetAllCommand.security.test.ts`

**Audit Checklist:**
- [ ] Security restrictions verified
- [ ] Dev-only access verified (if applicable)
- [ ] Confirmation requirements verified

---

## Audit Process

For each file:

1. **Read current source** in relevant src/core/ subdirectory
2. **Open test file** in corresponding tests/core/ subdirectory
3. **Verify mock setup** matches current dependencies
4. **For communication tests:** Verify handshake protocol is reversed
5. **Check each test** for:
   - Correct API calls
   - Correct expected values
   - No version references (v2/v3)
6. **Run tests** after changes: `npm test -- tests/core/[subdir]/[file].test.ts`
7. **Commit** after each file passes

---

## Common Issues to Fix

### Issue 1: Old Handshake Protocol

**Before (OLD - Extension initiates):**
```typescript
// Extension sends __extension_ready__ first
expect(mockWebview.postMessage).toHaveBeenCalledWith(
  expect.objectContaining({ type: '__extension_ready__' })
);
```

**After (CURRENT - Webview initiates):**
```typescript
// Extension waits passively - does NOT send __extension_ready__ first
expect(mockWebview.postMessage).not.toHaveBeenCalledWith(
  expect.objectContaining({ type: '__extension_ready__' })
);
```

### Issue 2: Missing Async Handler Await

**Before:**
```typescript
// Promises not awaited
const handler = jest.fn().mockReturnValue(Promise.resolve({ data: 'value' }));
```

**After:**
```typescript
// Properly verify async handlers are awaited
const handler = jest.fn().mockResolvedValue({ data: 'value' });
// Test should verify resolved value is sent, not Promise
```

### Issue 3: Outdated Output Channel Names

**Before:**
```typescript
expect(vscode.window.createOutputChannel).toHaveBeenCalledWith('Demo Builder');
```

**After:**
```typescript
expect(vscode.window.createOutputChannel).toHaveBeenCalledWith('Demo Builder: Logs');
expect(vscode.window.createOutputChannel).toHaveBeenCalledWith('Demo Builder: Debug');
```

### Issue 4: Old BaseCommand Signature

**Before:**
```typescript
class MyCommand extends BaseCommand {
  constructor(stateManager, logger) {
    super(stateManager, logger);
  }
}
```

**After:**
```typescript
class MyCommand extends BaseCommand {
  constructor(context: vscode.ExtensionContext) {
    super(context);
  }
}
```

---

## Communication Protocol Critical Checks

Ensure these protocol behaviors are verified:

### Reversed Handshake (Current)
- [ ] Extension creates manager but does NOT send __extension_ready__
- [ ] Extension waits for __webview_ready__ from webview
- [ ] After receiving __webview_ready__, handshake is complete
- [ ] Queued messages are then sent

### Message Queuing
- [ ] Messages sent before handshake are queued
- [ ] Queue is flushed after handshake complete
- [ ] Messages are sent in order

### Async Handler Resolution
- [ ] Async handlers are properly awaited
- [ ] Resolved values (not Promises) are sent to UI
- [ ] Error handling for rejected handlers

---

## Logging Pattern Checks

Ensure these logging patterns are verified:

### Dual Channels
- [ ] "Demo Builder: Logs" - User-facing logs
- [ ] "Demo Builder: Debug" - Debug information

### Log Formatting
- [ ] Timestamps included
- [ ] Log level prefixes
- [ ] Consistent formatting

---

## Completion Criteria

- [ ] All 5 vscode test files audited
- [ ] All 3 communication test files audited
- [ ] All 4 logging test files audited
- [ ] All 3 base test files audited
- [ ] All 3 commands test files audited
- [ ] Reversed handshake protocol verified in communication tests
- [ ] Async handler resolution verified (v1.5.0 fix)
- [ ] All tests pass: `npm test -- tests/core/vscode/ tests/core/communication/ tests/core/logging/ tests/core/base/ tests/core/commands/`
- [ ] No TypeScript errors

---

## Files Modified (Tracking)

### VSCode

| File | Status | Notes |
|------|--------|-------|
| envFileWatcherService.test.ts | [ ] | |
| envFileWatcherService-changeDetection.mocked.test.ts | [ ] | |
| envFileWatcherService-gracePeriodNotifications.mocked.test.ts | [ ] | |
| envFileWatcherService-security.mocked.test.ts | [ ] | |
| workspaceWatcherManager.mocked.test.ts | [ ] | |

### Communication

| File | Status | Notes |
|------|--------|-------|
| webviewCommunicationManager.handshake.test.ts | [ ] | Critical: Reversed handshake |
| webviewCommunicationManager.messaging.test.ts | [ ] | |
| webviewCommunicationManager.edge-cases.test.ts | [ ] | Critical: Async handler fix |

### Logging

| File | Status | Notes |
|------|--------|-------|
| debugLogger-core.test.ts | [ ] | |
| debugLogger-channels.test.ts | [ ] | |
| debugLogger-logging.test.ts | [ ] | |
| debugLogger-pathValidation.test.ts | [ ] | |

### Base

| File | Status | Notes |
|------|--------|-------|
| baseCommand.disposal.test.ts | [ ] | |
| baseWebviewCommand.disposal.test.ts | [ ] | |
| baseWebviewCommand.transition.test.ts | [ ] | |

### Commands

| File | Status | Notes |
|------|--------|-------|
| commandManager.test.ts | [ ] | |
| ResetAllCommand.test.ts | [ ] | |
| ResetAllCommand.security.test.ts | [ ] | |

---

## Phase 4 Completion

After completing Step 5:

1. **Verify all tests pass:** `npm test -- tests/core/`
2. **Verify no TypeScript errors**
3. **Mark Phase 4 complete** in overview.md
4. **Update** TEST-AUDIT-MASTER.md progress tracking

### Summary Statistics (Expected)

- **Total Files Audited:** 98
- **Shell:** 20 files
- **State:** 15 files
- **Validation + Utils:** 20 files
- **UI + Handlers + DI + Cache:** 25 files
- **VSCode + Communication + Logging + Base + Commands:** 18 files

---

## Next Phase

After completing Phase 4, proceed to:
**Phase 5: Webview & React Tests**

See `.rptc/plans/test-audit-phase-5-webview/` for the next phase plan.
