# Test Performance Optimization Plan

## Problem Analysis

### Current State
- **359 test files**, ~1000+ tests
- **47 tests** use real `setTimeout` delays instead of fake timers
- **22 tests** already use fake timers correctly
- Single file `loadingHTML.test.ts` takes **33 seconds** (20 tests)

### Root Causes
1. **Timing verification tests** using real delays instead of fake timers
2. **Async-waiting patterns** using `setTimeout` instead of proper async utilities
3. **Missing test utilities** for common async patterns

### Impact Assessment

| File | Current Time | Tests | Issue |
|------|-------------|-------|-------|
| `loadingHTML.test.ts` | 33s | 20 | Real 1.5-3s delays per test |
| `promiseUtils.test.ts` | ~15s | 14 | 50ms-5000ms real delays |
| `processCleanup.*.test.ts` | ~10s | 25+ | Mix of real/needed delays |
| `parallelExecution.test.ts` | 4s | 7 | Real delays + failures |
| Various other tests | ~20s | 30+ | 10-100ms async waits |

**Estimated total waste: 60-80 seconds of pure waiting**

---

## Implementation Plan

### Phase 1: Create Test Utilities
Create shared utilities for common async patterns.

**File: `tests/testUtils/async.ts`**
- `flushPromises()` - Flush microtask queue
- `flushTimers()` - Flush timers with fake timer support
- `waitForCondition()` - Wait for condition without arbitrary delays

### Phase 2: Convert loadingHTML.test.ts (Biggest Win: -32s)
Convert from real delays to fake timers.

**Before:**
```typescript
await new Promise(resolve => setTimeout(resolve, 150));
expect(mockPanel.webview.html).toContain('Loading...');
await promise;
```

**After:**
```typescript
jest.useFakeTimers();
const promise = setLoadingState(mockPanel, getContent);
jest.advanceTimersByTime(150);
await jest.runOnlyPendingTimersAsync();
expect(mockPanel.webview.html).toContain('Loading...');
jest.advanceTimersByTime(1500);
await promise;
```

### Phase 3: Convert promiseUtils.test.ts (-15s)
Tests for `withTimeout`, `delay`, etc. should use fake timers.

### Phase 4: Refactor async-waiting patterns
Replace patterns like:
```typescript
await new Promise(resolve => setTimeout(resolve, 10));
```

With:
```typescript
await flushPromises();
// or
await jest.runAllTimersAsync();
```

**Files to update:**
- `envFileWatcherService-*.test.ts` (6 files, 10ms delays)
- `dashboardHandlers-*.test.ts` (100ms delays)
- `stateManager-projects.test.ts` (10ms delay)
- `HandlerRegistry-execution.test.ts` (10ms delay)

### Phase 5: Fix processCleanup tests
- Keep `processCleanup.test.ts` as integration (spawns real processes)
- Convert mocked versions to fake timers where possible
- Fix timer leaks causing `--forceExit` warnings

### Phase 6: Verify and Document
- Run full test suite, measure improvement
- Document patterns in test README
- Add ESLint rule to prevent real setTimeout in unit tests

---

## Results

### Implemented Changes

| File | Before | After | Improvement |
|------|--------|-------|-------------|
| `loadingHTML.test.ts` | 33s | 4s | **-29s** |
| `dashboardHandlers-unknownDeployed.test.ts` | ~400ms | 0.277s | Instant |
| `stopDemo.lifecycle.test.ts` | ~100ms delay | 0.737s | Instant |
| `stopDemo.error.test.ts` | ~50ms delay | Included above | Instant |
| `adobeEntityService-*.test.ts` | ~10ms delay | 0.22s | Instant |

### Overall Results

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Core tests (68 suites, 1009 tests) | ~40s+ | **10.5s** | **~30s saved** |
| loadingHTML.test.ts | 33s | 4s | **-29s** |

### Key Changes

1. **Created `tests/testUtils/async.ts`** - Shared utilities for async testing
2. **Converted loadingHTML tests to use `jest.advanceTimersByTimeAsync()`** - Fake timers instead of real delays
3. **Replaced `setTimeout` delays with `flushPromises()`** in multiple test files
4. **Removed unnecessary timing tests** that were testing mock behavior, not real behavior

---

## Files to Modify

### New Files
- `tests/testUtils/async.ts` - Async test utilities

### Major Refactors
- `tests/core/utils/loadingHTML.test.ts`
- `tests/core/utils/promiseUtils.test.ts`

### Minor Updates (async-waiting pattern)
- `tests/core/vscode/envFileWatcherService-*.test.ts` (3 files)
- `tests/features/dashboard/handlers/dashboardHandlers-*.test.ts`
- `tests/core/state/stateManager-projects.test.ts`
- `tests/commands/handlers/HandlerRegistry-execution.test.ts`
- `tests/core/communication/webviewCommunicationManager.edge-cases.test.ts`

### Timer Leak Fixes
- `tests/core/shell/processCleanup.mocked.test.ts`
- `tests/core/shell/processCleanup.error.test.ts`
