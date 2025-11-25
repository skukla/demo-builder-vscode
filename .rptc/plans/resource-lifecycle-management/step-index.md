# Resource Lifecycle Management - Step Index

## Overview

This plan consists of **16 implementation steps** organized into 3 phases:

- **Phase 2: Core Infrastructure (Steps 1-5)** - Week 1
- **Phase 3: Incremental Migration (Steps 6-14)** - Weeks 2-3
- **Phase 4: Testing & Documentation (Steps 15-16)** - Week 4

**Total Estimated Time:** 3-4 weeks

## Testing Strategy Legend

**⚠️ MOCKED TESTS REQUIRED** - Steps that must use fully mocked tests to avoid crashing Cursor IDE

Legend for step markers:
- **🧪 MOCKED** - Requires Tier 1 mocked tests (process spawning, file watchers, terminals)
- **✅ COMPLETED** - Step fully implemented and tested
- **✅ DETAILED** - Detailed plan exists

**Why Mocked Tests?**
Tests that spawn real processes or create actual file system resources crash Cursor IDE. See `overview.md` → "CRITICAL LEARNING: Resource-Intensive Test Strategy" for complete mocking patterns.

---

## Phase 2: Core Infrastructure (Week 1)

### Step 1: Create DisposableStore Utility ✅ COMPLETED
**Status:** ✅ Implementation complete, all tests passing
**File:** `step-01.md`
**Purpose:** LIFO disposal pattern for coordinated cleanup
**Time:** 2-3 hours (actual)
**Deliverable:** Reusable DisposableStore class with 100% test coverage
**Tests:** Regular unit tests (no mocking needed)

### Step 2: Create ProcessCleanup Service ✅ COMPLETED 🧪 MOCKED
**Status:** ✅ Implementation complete, 16/16 mocked tests passing
**File:** `step-02.md`
**Purpose:** Cross-platform process tree termination with event-driven completion
**Time:** 3-4 hours (actual)
**Deliverable:** ProcessCleanup service replacing grace period anti-patterns
**Tests:** `processCleanup.mocked.test.ts` (tree-kill and process.kill fully mocked)
**Mocking Pattern:** See `overview.md` → Process Mocking example

### Step 3: Create WorkspaceWatcherManager ✅ COMPLETED 🧪 MOCKED
**Status:** ✅ Implementation complete, 11/11 mocked tests passing
**File:** `step-03.md`
**Purpose:** Workspace-scoped file watcher management
**Key Features:**
- Auto-create watchers when workspace folders added
- Auto-dispose watchers when workspace folders removed
- Track watchers by workspace folder for scoped disposal
**Files:**
- `src/core/vscode/workspaceWatcherManager.ts`
- `tests/core/vscode/workspaceWatcherManager.test.ts`
- `tests/core/vscode/workspaceWatcherManager.mocked.test.ts` ⚠️ **REQUIRED**
**Time:** 3-4 hours
**Testing:** Mock `vscode.workspace.createFileSystemWatcher` (see overview.md for pattern)

### Step 4: Extend BaseCommand with Disposal Support ✅ COMPLETED
**Status:** ✅ Implementation complete, 13/13 tests passing
**File:** `step-04.md`
**Purpose:** Add `protected disposables: DisposableStore` to BaseCommand
**Key Changes:**
- Added disposables property (initialized in constructor)
- Added dispose() method (calls disposables.dispose())
- Implements vscode.Disposable interface
- Updated createTerminal() to use this.disposables.add()
**Files:**
- `src/core/base/baseCommand.ts` (modified)
- `tests/core/base/baseCommand.disposal.test.ts` (13 tests passing)
**Time:** Completed in <2 hours
**Testing:** Standard unit tests (fully mocked, no resource creation)

### Step 5: Extend BaseWebviewCommand with Disposal Coordination ✅ COMPLETED
**Status:** ✅ Implementation complete, 9/9 tests passing (refactored for clean separation)
**File:** `step-05.md`
**Purpose:** Migrate from manual disposal array to inherited DisposableStore
**Key Changes:**
- Removed manual webviewDisposables array
- Panel/theme listeners use inherited this.disposables
- dispose() calls super.dispose() for coordination
- LIFO disposal ordering via DisposableStore
- Clean separation: handlePanelDisposal() → webview cleanup only, super.dispose() → resources
**Files:**
- `src/core/base/baseWebviewCommand.ts` (modified)
- `tests/core/base/baseWebviewCommand.disposal.test.ts` (9 tests passing)
**Time:** Completed in ~2 hours (including refactoring)
**Testing:** Standard unit tests (fully mocked webview API)
**Deviation:** Initial implementation included defensive disposal call; refactored for clean separation matching plan exactly

**Phase 2 Total:** ~15-20 hours (1 week) ✅ COMPLETE

---

**Phase 3 Progress:** Steps 6-7 complete, Steps 8-14 pending

---

## Phase 3: Incremental Migration (Weeks 2-3)

### Step 6: Migrate extension.ts File Watchers ✅ COMPLETED 🧪 MOCKED
**Status:** ✅ Implementation complete, 26/26 tests passing (includes 2 security tests)
**File:** `step-06.md`
**Purpose:** Replace global `.env` watcher with workspace-scoped watchers
**Key Changes:**
- Extracted 200+ lines from extension.ts to EnvFileWatcherService (308 lines)
- Created workspace-scoped watcher lifecycle via WorkspaceWatcherManager
- Added registerWatcher() method to WorkspaceWatcherManager
- All 10 internal commands preserved (100% compatibility)
- Defense-in-depth path validation added (Security Agent enhancement)
**Files:**
- `src/core/vscode/envFileWatcherService.ts` (new, 308 lines)
- `src/core/vscode/workspaceWatcherManager.ts` (modified, +16 lines)
- `src/core/vscode/index.ts` (modified, export new service)
- `src/extension.ts` (modified, -210 lines, 39% reduction)
- `tests/core/vscode/envFileWatcherService.test.ts` (4 unit tests)
- `tests/core/vscode/envFileWatcherService.mocked.test.ts` (9 mocked tests) ⚠️ **REQUIRED**
- `tests/integration/extension-watchers.mocked.test.ts` (8 integration tests) ⚠️ **REQUIRED**
**Time:** ~3 hours actual (under 6-8 hour estimate)
**Testing:** Mocked file watchers and workspace folder changes
**Quality Gates:** Efficiency (no changes needed), Security (path validation added)

### Step 7: Migrate deleteProject.ts with Dispose-Before-Delete Pattern ✅ COMPLETED
**Status:** Implementation complete, 27/27 tests passing (CRITICAL BUG FIX)
**File:** `step-07.md`
**Purpose:** Eliminate ENOTEMPTY errors with retry logic - **PRIMARY BUG FIX**
**Key Changes:**
- Added deleteWithRetry() with exponential backoff (5 retries, 100ms base delay)
- State cleanup only on successful deletion
- Clear error messages for all failure modes
**Files:**
- `src/features/lifecycle/commands/deleteProject.ts` (modified, 138 lines)
- `tests/features/lifecycle/commands/deleteProject.lifecycle.test.ts` (11 tests)
- `tests/features/lifecycle/commands/deleteProject.retry.test.ts` (10 tests)
- `tests/features/lifecycle/commands/deleteProject.error.test.ts` (6 tests)
**Time:** ~2 hours actual (under 3-4 hour estimate)
**Quality Gates:** Efficiency (no changes needed - EXCELLENT), Security (CLEAN - 0 issues)
**Deliverable:** Reliable project deletion (10/10 success rate vs previous ~50%)

### Step 8: Migrate stopDemo.ts with Event-Driven Process Cleanup 🧪 MOCKED
**Status:** Brief outline (to be detailed)
**Purpose:** Replace terminal.dispose() with ProcessCleanup service
**Key Changes:**
- Track process PID when starting demo
- Use ProcessCleanup.killProcessTree() instead of terminal.dispose()
- Wait for actual process exit (event-driven, not grace period)
**Testing:** Use ProcessCleanup mocks from Step 2 (already established)
- Verify port freed before updating status
**Files:**
- `src/features/lifecycle/commands/stopDemo.ts` (modify line 77-81)
- `tests/features/lifecycle/commands/stopDemo.lifecycle.test.ts` (new)
**Time:** 3-4 hours

### Step 9: Migrate startDemo.ts with Process Tracking 🧪 MOCKED
**Status:** Brief outline (to be detailed)
**Purpose:** Track spawned process PIDs for proper cleanup
**Key Changes:**
- Store process PID in project state
- Register process with ProcessCleanup service
- Remove fire-and-forget terminal pattern
**Files:**
- `src/features/lifecycle/commands/startDemo.ts` (modify line 144-148)
- `tests/features/lifecycle/commands/startDemo.process.test.ts` (new)
- `tests/features/lifecycle/commands/startDemo.mocked.test.ts` ⚠️ **REQUIRED**
**Time:** 2-3 hours
**Testing:** Mock `vscode.window.createTerminal` (see overview.md for pattern)

### Step 10: Migrate stateManager EventEmitter Cleanup
**Status:** Brief outline (to be detailed)
**Purpose:** Fix EventEmitter memory leak (auto-remove listeners on dispose)
**Key Changes:**
- Track listener subscriptions in DisposableStore
- Dispose all listeners when EventEmitter disposed
- Prevent adding listeners to disposed emitter
- Test listener count remains stable (<10)
**Files:**
- `src/core/state/stateManager.ts` (modify line 498)
- `tests/core/state/stateManager.memory.test.ts` (new)
**Time:** 2-3 hours

### Step 11: Migrate componentTreeProvider Subscription Management
**Status:** Brief outline (to be detailed)
**Purpose:** Proper subscription disposal
**Key Changes:**
- Use DisposableStore for subscriptions
- Dispose subscriptions when provider disposed
**Files:**
- `src/providers/componentTreeProvider.ts` (modify line 25-27)
- `tests/providers/componentTreeProvider.disposal.test.ts` (new)
**Time:** 1-2 hours

### Step 12: Fix Async .then() Patterns Across Multiple Files
**Status:** Brief outline (to be detailed)
**Purpose:** Replace fire-and-forget `.then()` with proper `await`
**Key Changes:**
- extension.ts lines 508-510, 224-227, 255-261, 274-282
- Ensure commands return when work complete
- Proper error propagation
**Files:**
- `src/extension.ts` (modify 4 locations)
- 6+ other command files with `.then()` patterns
**Time:** 4-6 hours (multiple files)

### Step 13: Migrate componentUpdater.ts Deletion Pattern
**Status:** Brief outline (to be detailed)
**Purpose:** Apply same dispose-before-delete + retry pattern
**Key Changes:**
- Copy deleteWithRetry logic from Step 7
- Dispose watchers before component updates
**Files:**
- `src/features/updates/services/componentUpdater.ts` (modify line 62, 94)
**Time:** 2-3 hours

### Step 14: Migrate resetAll.ts Disposal Coordination
**Status:** Brief outline (to be detailed)
**Purpose:** Use DisposableStore instead of manual disposal
**Key Changes:**
- Replace manual disposal sequence with DisposableStore
- Ensure LIFO ordering
**Files:**
- `src/commands/resetAll.ts`
**Time:** 2-3 hours

**Phase 3 Total:** ~25-35 hours (2-3 weeks)

---

## Phase 4: Testing & Documentation (Week 4)

### Step 15: Integration Testing & Memory Leak Verification
**Status:** Brief outline (to be detailed)
**Purpose:** Comprehensive integration tests and memory leak detection
**Key Tests:**
- Project lifecycle (create → run → stop → delete) x100 iterations
- Workspace folder add/remove with watchers
- Concurrent cleanup operations
- Extension deactivation cleanup
- Memory leak detection (<10MB heap growth, <10 listeners per emitter)
**Files:**
- `tests/integration/extension-lifecycle.test.ts`
- `tests/integration/concurrent-cleanup.test.ts`
- `tests/integration/memory-leak-detection.test.ts`
**Time:** 6-8 hours

### Step 16: Documentation & Troubleshooting Guide
**Status:** Brief outline (to be detailed)
**Purpose:** Update documentation and create troubleshooting guide
**Deliverables:**
- Update `src/core/CLAUDE.md` with DisposableStore pattern
- Update `src/core/base/README.md` with disposal examples
- Update `src/features/lifecycle/CLAUDE.md` with new process cleanup
- Add disposal debugging section to `docs/troubleshooting.md`
- Create migration guide for future disposal implementations
**Files:**
- Multiple CLAUDE.md files
- `docs/troubleshooting.md`
- New: `docs/patterns/resource-disposal.md`
**Time:** 4-6 hours

**Phase 4 Total:** ~10-14 hours (1 week)

---

## Total Timeline Summary

| Phase | Steps | Time | Focus |
|-------|-------|------|-------|
| Phase 2 | 1-5 | 15-20 hours | Core Infrastructure |
| Phase 3 | 6-14 | 25-35 hours | Incremental Migration |
| Phase 4 | 15-16 | 10-14 hours | Testing & Documentation |
| **Total** | **16** | **50-69 hours** | **3-4 weeks** |

---

## Critical Path

**Must complete in order:**
1. Step 1 → Step 2 → Step 3 (Core utilities)
2. Step 4 → Step 5 (Base class extensions)
3. Step 6 (File watcher migration - enables Step 7)
4. Step 7 (Highest priority - fixes user-facing bug)
5. Step 8 → Step 9 (Process cleanup)

**Can be parallelized:**
- Steps 10, 11, 13, 14 (Independent migrations)
- Step 12 can be done incrementally alongside other steps

---

## Success Metrics

**After Step 7 (Critical Bug Fix):**
- ✅ Project deletion succeeds 10/10 times (currently ~5/10)
- ✅ No ENOTEMPTY errors in logs

**After Step 8 (Process Cleanup):**
- ✅ Demo stop confirms process actually exits (not just terminal closed)
- ✅ Port verified free before status update

**After Phase 3 (All Migrations):**
- ✅ All 7 code smells from research eliminated
- ✅ No orphaned processes after operations
- ✅ No file watcher locks preventing operations

**After Phase 4 (Complete):**
- ✅ 85%+ test coverage overall
- ✅ 100% coverage on critical disposal paths
- ✅ <10MB heap growth over 100 create/delete iterations
- ✅ <10 listeners per EventEmitter (stable)

---

## Next Actions

**To begin TDD implementation:**

```bash
/rptc:tdd "@resource-lifecycle-management/"
```

**To update this plan during implementation:**

```bash
/rptc:helper-update-plan "@resource-lifecycle-management/"
```

**To track progress:**
- Mark steps complete in this index as they're finished
- Update Deviations Log in `overview.md` for any changes
- Run full test suite after each step

---

_Updated: 2025-11-23_
_Status: ✅ Ready for TDD Implementation_
