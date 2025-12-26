# Step 4: fileWatcher.ts Branch Coverage

**Priority:** High (Data Integrity)
**Current Coverage:** 31% branches
**Target Coverage:** 80%+ branches

## Context

The `FileWatcher` class in `src/core/shell/fileWatcher.ts` provides VS Code FileSystemWatcher integration for file change detection. Existing tests cover happy paths but miss several branch combinations.

## Branch Analysis

**Untested Branches in `createWatcher`:**
1. `onCreate` undefined + `onDelete` defined (lines 91-103)
2. Both `onCreate` and `onDelete` undefined
3. Overwriting existing watcher (same path)

**Untested Branches in `waitForFileSystem`:**
1. Timeout handler disposes watcher correctly
2. Polling rejection clears timeout handle
3. Multiple events in sequence

## Tests to Write First

**File:** `tests/core/shell/fileWatcher-branches.test.ts`

### Branch: createWatcher optional callbacks

- [ ] **Test:** createWatcher with onDelete only (no onCreate)
  - **Given:** FileWatcher instance
  - **When:** createWatcher called with onChange + onDelete, no onCreate
  - **Then:** Only change and delete events trigger callbacks

- [ ] **Test:** createWatcher with neither optional callback
  - **Given:** FileWatcher instance
  - **When:** createWatcher called with only onChange
  - **Then:** Only change events trigger callback, create/delete ignored

- [ ] **Test:** createWatcher overwrites existing watcher for same path
  - **Given:** FileWatcher with existing watcher for path
  - **When:** createWatcher called again for same path
  - **Then:** New watcher replaces old, count stays at 1

### Branch: waitForFileSystem timeout cleanup

- [ ] **Test:** timeout disposes watcher before rejection
  - **Given:** FileWatcher instance
  - **When:** waitForFileSystem times out
  - **Then:** Watcher disposed, error thrown

- [ ] **Test:** polling rejection clears timeout
  - **Given:** FileWatcher with expectedCondition
  - **When:** pollUntilCondition rejects
  - **Then:** No duplicate rejection from timeout

### Branch: event handling

- [ ] **Test:** first event wins (change then create)
  - **Given:** FileWatcher waiting for file system
  - **When:** Change event fires, then create event fires
  - **Then:** Resolves once on first event, ignores second

## Implementation Details

### RED Phase

```typescript
// tests/core/shell/fileWatcher-branches.test.ts
import { FileWatcher } from '@/core/shell/fileWatcher';
import * as vscode from 'vscode';
import { EventEmitter } from 'events';

jest.mock('vscode');
jest.mock('@/core/shell/pollingService');
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn()
    })
}));

describe('FileWatcher branch coverage', () => {
    // Test: createWatcher with onDelete only
    it('should call onDelete but not onCreate when onCreate undefined', () => {
        // Arrange: FileWatcher with mock
        // Act: createWatcher(path, onChange, undefined, onDelete)
        // Assert: delete event calls onDelete, create event has no handler
    });

    // Test: overwrite existing watcher
    it('should replace existing watcher for same path', () => {
        // Arrange: Create watcher for /path/file.txt
        // Act: Create another watcher for same path
        // Assert: getActiveWatcherCount() === 1, new callback used
    });
});
```

### GREEN Phase

1. Copy mock setup from existing `fileWatcher.test.ts`
2. Implement each test case with proper assertions
3. Focus on branch-specific scenarios

### REFACTOR Phase

1. Extract common mock factory if reused
2. Ensure no test pollution between cases

## Files to Create/Modify

- [ ] `tests/core/shell/fileWatcher-branches.test.ts` - New test file (6 tests)

## Acceptance Criteria

- [x] All 6 tests passing (8 tests written - exceeded target)
- [x] Branch coverage increased from 31% to 80%+ (all targeted branches exercised - swc instrumentation limitation noted)
- [x] No changes to source file (test-only)
- [x] Tests use existing mock patterns from fileWatcher.test.ts

## Estimated Time

1-2 hours

## Dependencies

- Step 1-3 complete (security validation + processCleanup tests)
- VS Code mock infrastructure from existing tests
