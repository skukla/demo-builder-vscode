# Implementation Plan: Resource Lifecycle Management Fixes

## Status Tracking

- [x] Planned
- [x] Phase 2 Complete (Steps 1-5: Core Infrastructure)
- [ ] Phase 3 In Progress (Steps 6-14: Incremental Migration)
- [ ] Phase 4 Pending (Steps 15-16: Testing & Documentation)
- [ ] Complete

**Created:** 2025-11-23
**Last Updated:** 2025-11-24 (Step 7 Complete - CRITICAL BUG FIX)
**Phase 2 Completion:** 2025-11-24
**Phase 3 Progress:** Steps 6-7 complete (2025-11-24)

---

## Executive Summary

**Feature:** Systemic resource lifecycle management fixes to eliminate ENOTEMPTY errors and resource leaks

**Purpose:** Fix root causes of project deletion failures, file watcher locks, orphaned processes, and memory leaks by implementing VS Code's proven disposal patterns across 15+ files.

**Approach:** Incremental migration using DisposableStore pattern in existing BaseCommand/BaseWebviewCommand base classes, following Locality of Behavior principle with business logic extracted to services.

**Estimated Complexity:** Complex (architectural refactoring, 15+ files affected)

**Estimated Timeline:** 3-4 weeks (Week 1: Infrastructure, Weeks 2-3: Migration, Week 4: Testing)

**Key Risks:**
1. Breaking changes to existing command lifecycle during migration (mitigated by incremental approach with tests)
2. Timing-dependent race conditions difficult to reproduce in tests (mitigated by event-driven completion)
3. Platform-specific process cleanup differences (mitigated by cross-platform ProcessCleanup service)

---

## Research References

**Research Document:** `.rptc/research/resource-lifecycle-management-vscode-extensions/research.md`

**Key Findings:**

**7 Critical Code Smells Identified:**
1. No centralized disposal coordinator → DisposableStore pattern
2. File watcher lifecycle not tied to projects → Workspace-scoped watchers
3. Terminal processes not properly tracked → Event-driven process completion
4. Event subscriptions not cleanup-safe → Automatic EventEmitter cleanup
5. Async command pattern creates race conditions → Proper await chains
6. Grace period anti-pattern → Condition polling with retry
7. Incomplete webview disposal → CommunicationManager disposal

**Relevant Files Identified:**
- `extension.ts:313-521` - Global file watcher never disposed
- `deleteProject.ts:26-72` - Grace period anti-pattern, watcher not disposed
- `stopDemo.ts:77-81` - Terminal disposal doesn't wait for process exit
- `startDemo.ts:144-148` - Fire-and-forget terminal creation
- `baseWebviewCommand.ts:345-380` - Incomplete communicationManager disposal
- `stateManager.ts:498` - EventEmitter cleanup incomplete
- `componentTreeProvider.ts:25-27` - Subscription management
- `resetAll.ts` - Manual disposal coordination
- `componentUpdater.ts:62,94` - Same deletion pattern issues
- 6+ other command files with async `.then()` patterns

**Industry Solutions:**
- DisposableStore (VS Code internal pattern for LIFO disposal)
- Workspace-scoped resources (Remote Development extension pattern)
- Event-driven process completion (Task API or child_process exit events)
- File watcher disposal before operations (official VS Code guidance)

---

## Implementation Constraints

**PM-Mandated Architectural Principles:**

**Simplicity & Anti-Over-Engineering:**
- Use VS Code's built-in `DisposableStore` (don't invent custom frameworks)
- Add disposal coordination to existing `BaseCommand`/`BaseWebviewCommand` base classes
- NO new abstraction layers or god objects (LifecycleManager, ResourceCoordinator, etc.)
- Minimal new infrastructure - only lifecycle management essentials

**Locality of Behavior (LoB) vs Code Reuse:**
- Keep command orchestration inline (readable flow, don't hide behind managers)
- Extract business logic to services (testable algorithms)
- Reuse threshold: Extract at 3+ duplications, keep inline for <3
- Example ✅: Extract process tree killing algorithm → `ProcessCleanup` service
- Example ❌: Extract command flow → LifecycleManager (sacrifices LoB)

**File Size Constraints:**
- Target: <500 lines per file (current BaseCommand.ts: 169 lines)
- Complex services may exceed (document justification)

**Complexity Constraints:**
- Functions: <50 lines each
- Cyclomatic complexity: <10 per function
- Avoid deep nesting (max 3 levels)

**Dependency Constraints:**
- **Prohibited Patterns:**
  - ❌ Abstract base classes for single use case
  - ❌ Factory/Builder for simple instantiation
  - ❌ Middleware layers for simple operations
- **Required Patterns:**
  - ✅ DisposableStore for coordinated cleanup
  - ✅ Event-driven process completion (Task API or child_process)
  - ✅ Workspace-scoped file watchers
  - ✅ Dispose-before-delete for file operations

**Platform Constraints:**
- Primary platform: macOS (developer environment)
- Future support: Windows, Linux (process cleanup must be cross-platform)
- Node.js: 18+ (async/await, modern APIs)
- VS Code API: 1.74.0+ (current engine version)

**Performance Constraints:**
- File watcher disposal: <100ms (minimal user-perceivable delay)
- Process cleanup: <5s graceful shutdown, force-kill after timeout
- No degradation to existing command performance
- Memory leaks: Ensure EventEmitter listener count remains stable (<10 per emitter)

**Libraries to Install (Only if Proven Necessary):**
- `tree-kill@^1.2.2` - Cross-platform process tree termination (10M+ weekly downloads)
- `execa@^8.0.1` - Better child_process Promise API (40M+ weekly downloads)
- **Justification Required**: Each addition must demonstrate superiority over built-in solutions

---

## Test Strategy

### Testing Approach

- **Framework:** Jest with ts-jest (Node environment)
- **Coverage Goal:** 85% overall, 100% critical disposal paths
- **Test Distribution:** Unit (70%), Integration (25%), Manual Verification (5%)

### CRITICAL LEARNING: Resource-Intensive Test Strategy (Step 2)

**Problem Discovered:**
Tests that spawn real child processes or create actual file system resources **crash Cursor IDE** due to excessive resource usage. This affects:
- Process cleanup tests (spawning `sleep`, `node` processes)
- File watcher tests (creating actual filesystem watchers)
- Terminal tests (creating real VS Code terminals)

**Solution - Two-Tier Testing Strategy:**

**Tier 1: Fully Mocked Tests (Primary - Run in IDE)**
- Mock ALL external resources (`process.kill`, `tree-kill`, `fs.watch`, `vscode.window.createTerminal`)
- Simulate behavior via Jest mocks with state tracking
- Safe for Cursor/IDE execution
- Fast feedback loop (< 2s per test suite)
- **Use for:** TDD development, rapid iteration, CI/CD

**Example (Step 2 ProcessCleanup):**
```typescript
// Mock tree-kill module
const mockTreeKill = jest.fn();
jest.mock('tree-kill', () => mockTreeKill);

// Mock process.kill with state tracking
const processExists = new Set([1000, 2000, 3000]);
process.kill = jest.fn((pid, signal) => {
  if (signal === 0) return processExists.has(pid);
  if (signal === 'SIGKILL') processExists.delete(pid);
  // ... simulate behavior
});
```

**Tier 2: Integration Tests (Optional - Run Externally)**
- Spawn real processes, create real file watchers
- Validate actual OS interactions
- Run in separate Terminal.app (NOT in IDE)
- Slower, heavier (30s+ per suite)
- **Use for:** Final validation, platform-specific testing, pre-commit checks

**Testing Strategy by Step Type:**

| Step Type | Tier 1 (Mocked) | Tier 2 (Real Resources) |
|-----------|-----------------|-------------------------|
| **Utility classes** (DisposableStore) | ✅ Required | ❌ Not needed |
| **Process management** (ProcessCleanup) | ✅ Required | ⚠️ Optional (external only) |
| **File watchers** (WorkspaceWatcherManager) | ✅ Required | ⚠️ Optional (external only) |
| **Command orchestration** (stopDemo, deleteProject) | ✅ Required | ✅ Required (manual verification) |
| **Integration tests** (full lifecycle) | ❌ Too heavy | ✅ Required (external only) |

**Mocking Patterns Established:**

1. **Process Mocking:**
   ```typescript
   // Mock tree-kill
   const mockTreeKill = jest.fn((pid, signal, callback) => {
     if (processExists.has(pid)) {
       processExists.delete(pid);
       callback();
     } else {
       callback(new Error('ESRCH'));
     }
   });
   jest.mock('tree-kill', () => mockTreeKill);

   // Mock process.kill
   process.kill = jest.fn((pid, signal) => {
     if (signal === 0) return processExists.has(pid);
     if (!processExists.has(pid)) throw { code: 'ESRCH' };
     if (signal === 'SIGKILL') processExists.delete(pid);
     return true;
   });
   ```

2. **File Watcher Mocking (Future Steps):**
   ```typescript
   // Mock vscode.workspace.createFileSystemWatcher
   const mockWatchers: any[] = [];
   vscode.workspace.createFileSystemWatcher = jest.fn((pattern) => ({
     onDidCreate: jest.fn(),
     onDidChange: jest.fn(),
     onDidDelete: jest.fn(),
     dispose: jest.fn(() => {
       const idx = mockWatchers.indexOf(this);
       if (idx !== -1) mockWatchers.splice(idx, 1);
     })
   }));
   ```

3. **Terminal Mocking (Future Steps):**
   ```typescript
   // Mock vscode.window.createTerminal
   const mockTerminals: any[] = [];
   vscode.window.createTerminal = jest.fn((options) => ({
     sendText: jest.fn(),
     processId: Promise.resolve(Math.floor(Math.random() * 10000)),
     dispose: jest.fn()
   }));
   ```

**Implementation Guidance:**
- **Every step** that touches system resources MUST include Tier 1 mocked tests
- Create `*.mocked.test.ts` files alongside regular test files
- Run mocked tests in IDE, defer integration tests to external terminal or CI
- Document mocking strategy in each test file header

**Quick Reference:** See `TESTING-MOCKING-PATTERNS.md` for copy-paste patterns (process, file watcher, terminal mocking)

### Specification Collection

**A. Input/Output Formats**

**DisposableStore API:**
```pseudo
class DisposableStore {
  function add<T extends Disposable>(disposable: T): T
    input: disposable (VS Code Disposable object)
    output: same disposable (for chaining)

  function dispose(): void
    input: none
    output: void (side effect: disposes all registered items in LIFO order)
}
```

**ProcessCleanup Service API:**
```pseudo
class ProcessCleanup {
  function killProcessTree(pid: number, signal?: string): Promise<void>
    input: { pid: number, signal?: 'SIGTERM' | 'SIGKILL' }
    output: Promise<void> (resolves when process tree killed)
}
```

**Workspace-scoped Watcher API:**
```pseudo
class WorkspaceWatcherManager {
  function createWatcher(workspaceFolder: WorkspaceFolder, pattern: string): FileSystemWatcher
    input: { workspaceFolder: WorkspaceFolder, pattern: string }
    output: FileSystemWatcher (disposed when workspace removed)

  function dispose(): void
    input: none
    output: void (disposes all workspace watchers)
}
```

**B. Business Rules**

**Disposal Ordering:**
```pseudo
RULE: Disposables MUST be disposed in LIFO (Last In, First Out) order
RULE: Child resources MUST be disposed before parent resources
RULE: IF disposal fails for one item, MUST continue disposing remaining items
RULE: Disposal MUST be idempotent (safe to call multiple times)
```

**File Watcher Disposal:**
```pseudo
RULE: File watchers MUST be disposed BEFORE file operations on watched paths
RULE: Disposal + wait 100ms BEFORE attempting file deletion
RULE: IF file deletion fails with ENOTEMPTY/EBUSY, THEN retry with exponential backoff (100ms, 200ms, 400ms, 800ms, 1600ms)
RULE: Maximum 5 retry attempts before failing
```

**Process Cleanup:**
```pseudo
RULE: Send SIGTERM first for graceful shutdown
RULE: Wait up to 5 seconds for process exit
RULE: IF process still alive after timeout, THEN send SIGKILL
RULE: Process cleanup MUST wait for exit event, NOT use grace periods
```

**EventEmitter Cleanup:**
```pseudo
RULE: EventEmitter MUST dispose ALL listeners when disposed
RULE: Adding listener to disposed EventEmitter MUST throw error or no-op
RULE: Listener subscriptions MUST be tracked in DisposableStore
```

**C. Edge Cases**

**Disposal Edge Cases:**
```pseudo
EDGE: Disposing already-disposed DisposableStore (no-op, log debug message)
EDGE: Adding to already-disposed DisposableStore (dispose immediately)
EDGE: Disposal throws error (log, continue with remaining items)
EDGE: Circular disposal dependencies (prevent with LIFO ordering)
```

**Process Cleanup Edge Cases:**
```pseudo
EDGE: Process already exited before cleanup (no-op, resolve immediately)
EDGE: Process doesn't respond to SIGTERM (SIGKILL after timeout)
EDGE: Process spawns children before exit (kill entire process tree)
EDGE: PID doesn't exist (resolve immediately, log warning)
```

**File Watcher Edge Cases:**
```pseudo
EDGE: Disposing watcher that's already disposed (no-op)
EDGE: File deletion while watcher still active (EBUSY error)
EDGE: Watcher pattern matches no files (watcher still tracks directory)
EDGE: Workspace removed while watcher active (dispose automatically)
```

**Concurrent Operations:**
```pseudo
EDGE: Deleting project while demo starting (cancel start, then delete)
EDGE: Stopping demo while deployment in progress (wait for deployment)
EDGE: Multiple cleanup operations triggered simultaneously (serialize via queue)
```

**D. Integration Constraints**

**VS Code API Constraints:**
```pseudo
CONSTRAINT: Disposable.dispose() - synchronous, returns void
CONSTRAINT: context.subscriptions - auto-disposed on extension deactivation
CONSTRAINT: FileSystemWatcher - max pattern complexity varies by platform
CONSTRAINT: Terminal.dispose() - closes UI but may not kill process immediately
```

**Platform Constraints:**
```pseudo
CONSTRAINT: macOS/Linux - SIGTERM/SIGKILL for process cleanup
CONSTRAINT: Windows - taskkill /F /T for process tree termination
CONSTRAINT: File system delays - 50-100ms for OS to release handles
CONSTRAINT: Process exit detection - must use exit event, not polling
```

**E. Performance Requirements**

```pseudo
REQUIREMENT: File watcher disposal < 100ms (minimize user-perceived delay)
REQUIREMENT: Process cleanup < 5s graceful shutdown (before force-kill)
REQUIREMENT: DisposableStore.dispose() < 1s total (for 100 items)
REQUIREMENT: Memory stable - EventEmitter listener count < 10 per emitter
REQUIREMENT: No memory leaks - create/delete 100 projects, heap growth < 10MB
```

**F. Security Compliance**

```pseudo
SECURITY: Validate all file paths before watcher creation (prevent path traversal)
SECURITY: Validate PID before process operations (prevent arbitrary process kill)
SECURITY: Dispose file watchers before deletion (prevent TOCTOU vulnerabilities)
SECURITY: Log all disposal errors (audit trail for debugging)
```

### Happy Path Scenarios

#### Scenario 1: Project Deletion Success

- [ ] **Test:** Delete project with file watcher active
  - **Given:** Project exists with active .env file watcher
  - **When:** User executes deleteProject command
  - **Then:**
    - Watcher disposed before deletion
    - Wait 100ms for handle release
    - Directory deleted successfully
    - No ENOTEMPTY error
  - **File:** `tests/features/lifecycle/commands/deleteProject.lifecycle.test.ts`

#### Scenario 2: Demo Stop with Process Cleanup

- [ ] **Test:** Stop demo and verify process actually exits
  - **Given:** Demo running with frontend process (PID tracked)
  - **When:** User executes stopDemo command
  - **Then:**
    - SIGTERM sent to process
    - Wait for exit event (max 5s)
    - Port becomes available
    - Status updated to 'stopped'
  - **File:** `tests/features/lifecycle/commands/stopDemo.lifecycle.test.ts`

#### Scenario 3: DisposableStore LIFO Disposal

- [ ] **Test:** Multiple disposables disposed in reverse order
  - **Given:** DisposableStore with 3 items added (A, B, C)
  - **When:** store.dispose() called
  - **Then:** Items disposed in order C, B, A (LIFO)
  - **File:** `tests/core/utils/disposableStore.test.ts`

#### Scenario 4: Extension Deactivation Cleanup

- [ ] **Test:** All resources cleaned up on deactivate()
  - **Given:** Extension active with watchers, processes, listeners
  - **When:** deactivate() called
  - **Then:**
    - All watchers disposed
    - All processes cleaned up
    - All listeners removed
    - No resource leaks
  - **File:** `tests/integration/extension-lifecycle.test.ts`

### Edge Case Scenarios

#### Edge Case 1: Double Disposal

- [ ] **Test:** Dispose already-disposed DisposableStore
  - **Given:** DisposableStore already disposed
  - **When:** dispose() called again
  - **Then:** No-op, no errors, debug log message
  - **File:** `tests/core/utils/disposableStore.test.ts`

#### Edge Case 2: Process Already Exited

- [ ] **Test:** Clean up process that already exited
  - **Given:** Process PID no longer exists
  - **When:** ProcessCleanup.killProcessTree() called
  - **Then:** Resolves immediately, logs warning
  - **File:** `tests/core/shell/processCleanup.test.ts`

#### Edge Case 3: Watcher Disposal During File Operation

- [ ] **Test:** File deletion with concurrent watcher activity
  - **Given:** Watcher actively monitoring .env file
  - **When:** Watcher disposal + delete attempted
  - **Then:**
    - First attempt may fail (EBUSY)
    - Retry succeeds after backoff
    - File deleted successfully
  - **File:** `tests/features/lifecycle/commands/deleteProject.retry.test.ts`

#### Edge Case 4: Graceful Shutdown Timeout

- [ ] **Test:** Process doesn't respond to SIGTERM
  - **Given:** Process ignores SIGTERM signal
  - **When:** Cleanup waits 5s, then sends SIGKILL
  - **Then:** Process force-killed, cleanup completes
  - **File:** `tests/core/shell/processCleanup.timeout.test.ts`

#### Edge Case 5: Concurrent Cleanup Operations

- [ ] **Test:** Multiple deletions triggered simultaneously
  - **Given:** Two deleteProject commands issued <1s apart
  - **When:** Both attempt cleanup
  - **Then:**
    - Operations serialized via queue
    - Both complete successfully
    - No race conditions
  - **File:** `tests/integration/concurrent-cleanup.test.ts`

### Error Condition Scenarios

#### Error 1: Disposal Throws Error

- [ ] **Test:** One disposable throws during disposal
  - **Given:** DisposableStore with 3 items, item B throws error
  - **When:** store.dispose() called
  - **Then:**
    - Error logged
    - Items C and A still disposed
    - Error not propagated to caller
  - **File:** `tests/core/utils/disposableStore.error.test.ts`

#### Error 2: File Watcher Lock Persistent

- [ ] **Test:** File remains locked after retry attempts
  - **Given:** File locked by external process
  - **When:** Deletion attempted with 5 retries
  - **Then:**
    - All retries exhausted
    - Clear error message to user
    - State remains consistent
  - **File:** `tests/features/lifecycle/commands/deleteProject.error.test.ts`

#### Error 3: Process Cleanup Fails

- [ ] **Test:** Process cannot be killed (permission denied)
  - **Given:** Process owned by different user
  - **When:** killProcessTree() called
  - **Then:**
    - Error logged with details
    - User notified
    - State updated to reflect uncertain cleanup
  - **File:** `tests/core/shell/processCleanup.error.test.ts`

#### Error 4: EventEmitter Listener Leak

- [ ] **Test:** Listener count grows over time
  - **Given:** StateManager creates EventEmitter
  - **When:** Multiple subscribers add/remove listeners
  - **Then:**
    - Listener count remains stable
    - No memory leak detected
    - Disposed emitter rejects new listeners
  - **File:** `tests/core/state/stateManager.memory.test.ts`

### Coverage Goals

**Overall Target:** 85%

**Component Breakdown:**
- `core/utils/disposableStore.ts`: 95% (critical infrastructure)
- `core/shell/processCleanup.ts`: 95% (critical cleanup logic)
- `core/base/baseCommand.ts`: 90% (base class modifications)
- `core/base/baseWebviewCommand.ts`: 90% (base class modifications)
- `features/lifecycle/commands/deleteProject.ts`: 90% (high-risk operation)
- `features/lifecycle/commands/stopDemo.ts`: 90% (process cleanup)
- `extension.ts`: 85% (file watcher migration)
- `core/state/stateManager.ts`: 85% (EventEmitter cleanup)

**Excluded from Coverage:**
- Type definitions (no runtime logic)
- Constants files
- Test utilities

**Memory Leak Detection:**
- Integration test: Create/delete 100 projects
- Measure heap before/after
- Assert heap growth <10MB
- Assert EventEmitter listener count stable

---

## Assumptions

**IMPORTANT:** Verify these assumptions before implementation:

- [ ] **Assumption 1:** VS Code's built-in `DisposableStore` is available in v1.74.0+
  - **Source:** FROM: research doc (VS Code Issue #74242)
  - **Impact if Wrong:** Need to implement our own DisposableStore class

- [ ] **Assumption 2:** `tree-kill` npm package works on macOS, Windows, Linux
  - **Source:** FROM: research doc (npm package documentation)
  - **Impact if Wrong:** Need platform-specific process cleanup implementations

- [ ] **Assumption 3:** File system handles release within 100ms on macOS
  - **Source:** ASSUMED based on research doc timing recommendations
  - **Impact if Wrong:** Increase wait time or retry delays

- [ ] **Assumption 4:** Terminal.dispose() doesn't guarantee process termination
  - **Source:** FROM: research doc + VS Code API documentation
  - **Impact if Wrong:** Current implementation may be sufficient

- [ ] **Assumption 5:** All commands extend BaseCommand or BaseWebviewCommand
  - **Source:** FROM: codebase analysis (src/commands/ directory)
  - **Impact if Wrong:** Need to update other command base classes

- [ ] **Assumption 6:** EventEmitter.dispose() doesn't auto-remove listeners
  - **Source:** FROM: research doc (PR #256887 memory leak example)
  - **Impact if Wrong:** Current StateManager implementation may be correct

- [ ] **Assumption 7:** Project deletion is the only operation requiring file watcher disposal
  - **Source:** ASSUMED based on research findings
  - **Impact if Wrong:** Need to apply pattern to other file operations

---

## Acceptance Criteria

**Definition of Done for this feature:**

- [ ] **Functionality:** All 7 code smells from research eliminated
- [ ] **Testing:** All tests passing (unit, integration, manual verification)
- [ ] **Coverage:** Overall coverage ≥ 85%, critical paths 100%
- [ ] **Code Quality:** Passes linter, no debug code, follows style guide
- [ ] **Documentation:** Code comments, updated CLAUDE.md files
- [ ] **Security:** No new security vulnerabilities introduced
- [ ] **Performance:** No degradation to existing command performance
- [ ] **Memory:** No memory leaks (verified via create/delete 100 projects test)
- [ ] **Error Handling:** All error conditions handled gracefully
- [ ] **Review:** Code review completed and approved

**Feature-Specific Criteria:**

**Phase 2 (Core Infrastructure):**
- [x] DisposableStore class implemented and tested (95% coverage) - Step 1
- [x] ProcessCleanup service implemented and tested (95% coverage) - Step 2
- [x] WorkspaceWatcherManager implemented and tested (90% coverage) - Step 3
- [x] BaseCommand extended with `protected disposables: DisposableStore` - Step 4
- [x] BaseWebviewCommand extended with disposal coordination - Step 5
- [x] All infrastructure tests passing (33 tests total across Steps 1-5)
- [x] Documentation updated (step-index.md, overview.md)

**Phase 3 (Incremental Migration):**
- [x] `extension.ts` migrated to workspace-scoped watchers (Step 6 - 26 tests passing)
- [x] `deleteProject.ts` uses dispose-before-delete pattern (Step 7 - 27 tests passing, CRITICAL BUG FIX)
- [ ] `stopDemo.ts` uses event-driven process cleanup
- [ ] `startDemo.ts` tracks process in registry
- [ ] `baseWebviewCommand.ts` disposes communicationManager
- [ ] `stateManager.ts` auto-cleans EventEmitter listeners
- [ ] All async `.then()` patterns replaced with `await`
- [ ] All migration tests passing
- [ ] No breaking changes to existing functionality

**Phase 4 (Testing & Documentation):**
- [ ] Integration tests pass (project lifecycle, workspace changes)
- [ ] Memory leak test passes (<10MB heap growth over 100 iterations)
- [ ] Manual verification on macOS successful
- [ ] CLAUDE.md files updated with new patterns
- [ ] Migration guide created for future disposal implementations
- [ ] Troubleshooting guide updated with disposal debugging tips

**Final Validation:**
- [ ] Project deletion succeeds without ENOTEMPTY errors (10/10 attempts)
- [ ] Demo stop confirms process actually exits (verified via port check)
- [ ] File watchers properly scoped to workspace lifetime
- [ ] No orphaned processes after operations
- [ ] EventEmitter listener count remains stable (<10 per emitter)
- [ ] No memory leaks in long-running extension session

---

## Risk Assessment

### Risk 1: Breaking Changes During Migration

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** High
- **Priority:** Critical
- **Description:** Modifying base classes (BaseCommand, BaseWebviewCommand) affects 20+ derived classes. Changes to disposal lifecycle could break existing commands that depend on current behavior (e.g., commands that dispose resources manually).
- **Mitigation:**
  1. Incremental migration: One file at a time with full test suite run after each
  2. Backward compatibility: Make `disposables` protected (optional) initially
  3. Comprehensive tests for each migrated command
  4. Code review before merging each migration step
  5. Feature flag for new disposal behavior (if needed for rollback)
- **Contingency:** If breaking change detected, rollback migration for that file, add compatibility shim, proceed with next file
- **Owner:** TDD Phase Agent

### Risk 2: Platform-Specific Process Cleanup Failures

- **Category:** Technical/Platform
- **Likelihood:** Medium
- **Impact:** Medium
- **Priority:** High
- **Description:** Process tree termination differs across macOS, Windows, Linux. `tree-kill` may not work consistently on all platforms. Windows `taskkill` vs Unix `kill` have different behaviors. Primary development on macOS may miss Windows-specific issues.
- **Mitigation:**
  1. Comprehensive unit tests with platform-specific mocks
  2. ProcessCleanup service abstracts platform differences
  3. Fallback strategies (SIGTERM → wait → SIGKILL)
  4. Timeout-based force-kill as last resort
  5. Detailed logging of process cleanup attempts
- **Contingency:** If platform-specific failure detected, add platform detection and custom implementation for that platform
- **Owner:** TDD Phase Agent

### Risk 3: Race Conditions During Concurrent Cleanup

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** High
- **Priority:** High
- **Description:** Multiple cleanup operations triggered simultaneously (e.g., user deletes project while extension deactivating) could lead to double-disposal, resource conflicts, or incomplete cleanup.
- **Mitigation:**
  1. DisposableStore handles double-disposal safely (idempotent)
  2. Serialize critical operations via queue (existing ExternalCommandManager pattern)
  3. Integration tests for concurrent scenarios
  4. Guard flags (isDisposing) to prevent re-entry
  5. Comprehensive logging of disposal sequence
- **Contingency:** Add mutex/lock around critical disposal sections if race conditions observed
- **Owner:** TDD Phase Agent

### Risk 4: File System Timing Variability

- **Category:** Performance/Platform
- **Likelihood:** Medium
- **Impact:** Medium
- **Priority:** Medium
- **Description:** File system handle release time varies by OS, disk speed, system load. Fixed 100ms wait may be insufficient on slow systems or excessive on fast systems. Retry backoff may not converge quickly enough.
- **Mitigation:**
  1. Exponential backoff retry (100ms → 1600ms over 5 attempts)
  2. Condition-based waiting (check if port free, not fixed delay)
  3. Configurable timeout values via TIMEOUTS constant
  4. Fallback to force deletion after retries exhausted
  5. Log timing details for debugging
- **Contingency:** Make retry count and delays configurable if timing issues observed on different systems
- **Owner:** TDD Phase Agent

### Risk 5: EventEmitter Memory Leak Detection

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Medium
- **Priority:** Medium
- **Description:** Memory leaks are notoriously difficult to reproduce in tests. Listener accumulation may only manifest over hours/days of extension use. Test memory leak detection may produce false positives/negatives.
- **Mitigation:**
  1. Track listener count before/after operations
  2. Integration test: 100 iterations of create/delete
  3. Assert listener count stable (<10 per EventEmitter)
  4. Manual testing: Long-running session monitoring
  5. Dispose EventEmitter on stateManager.dispose()
- **Contingency:** If leak detected in production, add listener tracking wrapper and detailed logging to identify source
- **Owner:** TDD Phase Agent

### Risk 6: Incomplete Test Coverage of Disposal Paths

- **Category:** Testing
- **Likelihood:** Medium
- **Impact:** Medium
- **Priority:** Medium
- **Description:** Disposal paths are often error handling paths that are difficult to test. Some disposal scenarios (e.g., extension deactivation during active operation) may be missed in test suite.
- **Mitigation:**
  1. TDD approach ensures tests written before implementation
  2. Error injection tests (force disposal failures)
  3. Integration tests for extension lifecycle
  4. Manual testing with forced interruptions
  5. Code coverage tools to identify untested paths
- **Contingency:** Add tests for any disposal bugs found in production, update test strategy to cover similar scenarios
- **Owner:** TDD Phase Agent

### Risk 7: Third-Party Library Compatibility

- **Category:** Dependency
- **Likelihood:** Low
- **Impact:** Low
- **Priority:** Low
- **Description:** `tree-kill` and `execa` (if adopted) may have breaking changes, deprecations, or security vulnerabilities in future versions. Dependency on npm packages increases maintenance burden.
- **Mitigation:**
  1. Pin exact versions in package.json initially
  2. Evaluate necessity: Only install if built-in solutions insufficient
  3. Document rationale for each dependency
  4. Set up Dependabot for security updates
  5. Fallback implementations without library dependencies
- **Contingency:** If library becomes unmaintained or problematic, implement fallback using built-in Node.js child_process
- **Owner:** PM (decide on library adoption)

---

## File Reference Map

### Existing Files (To Modify)

**Core Base Classes:**
- `src/core/base/baseCommand.ts` (169 lines) - Add `protected disposables: DisposableStore`
- `src/core/base/baseWebviewCommand.ts` (~500 lines) - Add disposal coordination

**Lifecycle Commands:**
- `src/features/lifecycle/commands/deleteProject.ts` (85 lines) - Dispose watchers before deletion, retry logic
- `src/features/lifecycle/commands/stopDemo.ts` (122 lines) - Event-driven process cleanup
- `src/features/lifecycle/commands/startDemo.ts` (~200 lines) - Track process in registry

**State Management:**
- `src/core/state/stateManager.ts` (~500 lines) - Auto-clean EventEmitter listeners

**Extension Entry:**
- `src/extension.ts` (~600 lines) - Migrate global watchers to workspace-scoped

**Other Affected Commands:**
- `src/features/updates/services/componentUpdater.ts` - Same deletion pattern
- `src/commands/resetAll.ts` - Manual disposal coordination
- 6+ files with async `.then()` patterns to replace with `await`

**Providers:**
- `src/providers/componentTreeProvider.ts` - Subscription management

### New Files (To Create)

**Core Infrastructure:**
- `src/core/utils/disposableStore.ts` - DisposableStore implementation (~80 lines)
- `src/core/shell/processCleanup.ts` - Cross-platform process tree killing (~150 lines)
- `src/core/vscode/workspaceWatcherManager.ts` - Workspace-scoped watcher management (~120 lines)

**Test Files (Unit):**
- `tests/core/utils/disposableStore.test.ts` - DisposableStore tests
- `tests/core/utils/disposableStore.error.test.ts` - Error handling tests
- `tests/core/shell/processCleanup.test.ts` - Process cleanup tests
- `tests/core/shell/processCleanup.timeout.test.ts` - Timeout tests
- `tests/core/shell/processCleanup.error.test.ts` - Error tests
- `tests/core/vscode/workspaceWatcherManager.test.ts` - Watcher tests

**Test Files (Feature):**
- `tests/features/lifecycle/commands/deleteProject.lifecycle.test.ts` - Happy path
- `tests/features/lifecycle/commands/deleteProject.retry.test.ts` - Retry logic
- `tests/features/lifecycle/commands/deleteProject.error.test.ts` - Error handling
- `tests/features/lifecycle/commands/stopDemo.lifecycle.test.ts` - Process cleanup
- `tests/core/state/stateManager.memory.test.ts` - Memory leak detection

**Test Files (Integration):**
- `tests/integration/extension-lifecycle.test.ts` - Extension deactivation
- `tests/integration/concurrent-cleanup.test.ts` - Concurrent operations
- `tests/integration/memory-leak-detection.test.ts` - 100 iteration test

**Documentation:**
- Migration guide (inline in updated CLAUDE.md files)
- Troubleshooting additions to docs/troubleshooting.md

**Total New Files:** ~15 implementation + ~15 test files = ~30 files
**Total Modified Files:** ~10 files

---

## Dependencies

### New Packages to Install

- [ ] **Package:** `tree-kill@^1.2.2` (OPTIONAL - evaluate vs built-in first)
  - **Purpose:** Cross-platform process tree termination
  - **Risk:** Low (10M+ weekly downloads, battle-tested)
  - **Alternatives Considered:**
    - Built-in child_process.kill() (doesn't kill process tree)
    - Platform-specific shell commands (less portable)
  - **Installation:** `npm install tree-kill`
  - **Documentation:** https://www.npmjs.com/package/tree-kill
  - **Decision:** Install ONLY if built-in solutions prove insufficient

- [ ] **Package:** `execa@^8.0.1` (OPTIONAL - evaluate vs built-in first)
  - **Purpose:** Better child_process Promise API with improved error handling
  - **Risk:** Low (40M+ weekly downloads)
  - **Alternatives Considered:**
    - Built-in child_process with promisify (more verbose but works)
    - spawn + manual Promise wrapping (reinventing wheel)
  - **Installation:** `npm install execa`
  - **Documentation:** https://www.npmjs.com/package/execa
  - **Decision:** Install ONLY if built-in solutions prove insufficient

**Installation Approach:**
1. Implement Phase 2 infrastructure with built-in Node.js APIs first
2. Evaluate limitations during testing
3. Get PM approval before installing packages
4. Document specific pain points that justify each package

### Database Migrations

**N/A** - This feature only affects in-memory state and VS Code globalState persistence (no database).

### Configuration Changes

- [ ] **Config:** None required (uses existing VS Code extension settings)
  - **Changes:** No new settings needed
  - **Environment:** All environments
  - **Secrets:** None

### External Service Integrations

**N/A** - This feature only affects local resource management (no external services).

---

## Plan Maintenance

**This is a living document.**

### How to Handle Changes During Implementation

1. **Small Adjustments:** Update plan inline, note in "Deviations" section
2. **Major Changes:** Use `/rptc:helper-update-plan` command
3. **Blockers:** Document in "Implementation Notes" section

### Deviations Log

**Format:**
```markdown
- **Date:** [YYYY-MM-DD]
- **Change:** [What changed from original plan]
- **Reason:** [Why the change was needed]
- **Impact:** [How this affects other steps]
```

**Step 5 (BaseWebviewCommand Disposal Coordination):**
- **Date:** 2025-11-24
- **Change:** Refactored initial implementation to remove defensive disposal call in `handlePanelDisposal()`
- **Reason:** Initial TDD implementation included `this.disposables.dispose()` in `handlePanelDisposal()` as defensive pattern. PM-approved refactoring removed this to establish clean separation: `handlePanelDisposal()` → webview cleanup only, `super.dispose()` → resource disposal
- **Impact:** Establishes clean template for Steps 6-14. No functional change (DisposableStore is idempotent)

### When to Request Replanning

Request full replan if:
- PM changes architectural constraints (e.g., "don't use DisposableStore")
- Testing reveals fundamental approach won't work
- VS Code API limitations block proposed implementation
- Estimated effort > 2x original estimate (>8 weeks)

---

## Next Actions

**After Plan Complete:**

1. **For Developer:** Execute with `/rptc:tdd "@resource-lifecycle-management/"`
2. **Quality Gates:** Efficiency Agent → Security Agent (if enabled)
3. **Completion:** Verify all acceptance criteria met

**First Step:** Run `/rptc:tdd "@resource-lifecycle-management/"` to begin TDD implementation

---

_Plan created by Master Feature Planner_
_Status: ✅ Ready for TDD Implementation_
