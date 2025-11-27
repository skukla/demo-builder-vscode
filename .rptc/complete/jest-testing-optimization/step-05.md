# Step 5: Event Listener Cleanup Audit

**Status:** Pending
**Effort:** Medium (3-4 hours)
**Impact:** Medium (prevents memory leaks)
**Dependencies:** Steps 1-3 complete (can run parallel with Step 4)

---

## Objective

Audit test files for event listener patterns and add proper cleanup in afterEach hooks to prevent memory leaks during test execution.

**Expected Outcome:**
- 80%+ of event listener patterns have corresponding cleanup
- afterEach hooks added to high-impact test files
- Test utility created for automatic cleanup (optional)
- Memory leaks from event listeners eliminated

---

## Background

### Current State

From codebase analysis:
- **Event listener patterns found:** ~758 (in source code)
- **Cleanup patterns (dispose calls):** ~21 (in source code)
- **afterEach hooks in tests:** 51 files

The VS Code mock provides proper `dispose()` methods:
```typescript
// From tests/__mocks__/vscode.ts
createFileSystemWatcher: jest.fn(() => ({
    onDidChange: jest.fn(),
    onDidCreate: jest.fn(),
    onDidDelete: jest.fn(),
    dispose: jest.fn(),  // <-- Available but often not called
})),
```

### The Problem

When tests create event listeners but don't dispose them:
- Listeners accumulate across test runs
- Memory grows with each test
- Eventually leads to crashes or slowdowns
- Jest's `clearMocks` doesn't dispose listeners

### The Solution

1. Identify test files creating VS Code event listeners
2. Add `afterEach` hooks calling `dispose()`
3. Create utility for common cleanup patterns
4. Document pattern for new tests

---

## Test Strategy

### Verification Approach

1. Identify files with event listener patterns
2. Add cleanup to highest-impact files first
3. Verify tests still pass after cleanup
4. Monitor memory behavior

### Happy Path Tests

- [ ] **Test:** Cleanup doesn't break existing tests
  - **Given:** afterEach hook added with dispose() calls
  - **When:** Running affected test file
  - **Then:** All tests pass
  - **File:** Each modified file

- [ ] **Test:** Event listeners properly disposed
  - **Given:** Test creates file watcher
  - **When:** Test completes and afterEach runs
  - **Then:** dispose() is called on watcher
  - **File:** N/A (verification via mock assertions)

### Edge Case Tests

- [ ] **Test:** Multiple listeners disposed correctly
  - **Given:** Test creates multiple event sources
  - **When:** afterEach runs
  - **Then:** All sources disposed
  - **File:** N/A (validation)

### Error Condition Tests

- [ ] **Test:** Dispose on undefined doesn't crash
  - **Given:** Listener creation might fail
  - **When:** afterEach attempts dispose
  - **Then:** Handles undefined gracefully (no error)
  - **File:** N/A (implementation detail)

---

## Prerequisites

- [ ] Steps 1-3 complete
- [ ] Understanding of VS Code mock structure
- [ ] List of high-impact files identified

---

## Implementation Details

### Phase 1: Identify Target Files

Find test files with event listener patterns:

```bash
# Find tests creating file watchers
grep -rn "createFileSystemWatcher" tests/ --include="*.test.ts" --include="*.test.tsx"

# Find tests with onDid* event handlers
grep -rn "onDid\(Change\|Create\|Delete\)" tests/ --include="*.test.ts" --include="*.test.tsx"

# Find tests with EventEmitter
grep -rn "EventEmitter" tests/ --include="*.test.ts" --include="*.test.tsx"

# Find tests creating output channels
grep -rn "createOutputChannel" tests/ --include="*.test.ts" --include="*.test.tsx"

# Find tests creating terminals
grep -rn "createTerminal" tests/ --include="*.test.ts" --include="*.test.tsx"
```

### Phase 2: Create Cleanup Utility

Create a shared cleanup utility for common patterns:

**File:** `tests/helpers/cleanup.ts`

```typescript
/**
 * Test cleanup utilities to prevent event listener memory leaks
 */

/**
 * Safely dispose a VS Code disposable resource
 * Handles undefined and already-disposed resources
 */
export function safeDispose(disposable: { dispose?: () => void } | undefined): void {
  if (disposable && typeof disposable.dispose === 'function') {
    try {
      disposable.dispose();
    } catch (error) {
      // Already disposed or invalid - ignore
    }
  }
}

/**
 * Dispose multiple resources safely
 */
export function disposeAll(...disposables: Array<{ dispose?: () => void } | undefined>): void {
  disposables.forEach(safeDispose);
}

/**
 * Create a cleanup registry that tracks disposables
 * Usage:
 *   const cleanup = createCleanupRegistry();
 *   cleanup.register(watcher);
 *   // In afterEach:
 *   cleanup.disposeAll();
 */
export function createCleanupRegistry() {
  const disposables: Array<{ dispose?: () => void }> = [];

  return {
    register<T extends { dispose?: () => void }>(disposable: T): T {
      disposables.push(disposable);
      return disposable;
    },
    disposeAll(): void {
      while (disposables.length > 0) {
        safeDispose(disposables.pop());
      }
    }
  };
}
```

### Phase 3: Add Cleanup to High-Impact Files

For each identified file, add cleanup pattern:

**Pattern A: Simple Cleanup**

```typescript
describe('ComponentWithListeners', () => {
  let watcher: ReturnType<typeof vscode.workspace.createFileSystemWatcher>;
  let outputChannel: ReturnType<typeof vscode.window.createOutputChannel>;

  beforeEach(() => {
    watcher = vscode.workspace.createFileSystemWatcher('**/*');
    outputChannel = vscode.window.createOutputChannel('Test');
  });

  afterEach(() => {
    // Clean up to prevent memory leaks
    watcher?.dispose();
    outputChannel?.dispose();
  });

  // ... tests
});
```

**Pattern B: Using Cleanup Utility**

```typescript
import { createCleanupRegistry } from '../../helpers/cleanup';

describe('ComponentWithMultipleListeners', () => {
  const cleanup = createCleanupRegistry();

  beforeEach(() => {
    // Resources automatically tracked for cleanup
    cleanup.register(vscode.workspace.createFileSystemWatcher('**/*'));
    cleanup.register(vscode.window.createOutputChannel('Test'));
  });

  afterEach(() => {
    cleanup.disposeAll();
  });

  // ... tests
});
```

**Pattern C: EventEmitter Cleanup**

```typescript
import { EventEmitter } from 'vscode';

describe('EventEmitterTests', () => {
  let emitter: EventEmitter<any>;
  let subscription: { dispose: () => void };

  beforeEach(() => {
    emitter = new EventEmitter();
    subscription = emitter.event(() => {});
  });

  afterEach(() => {
    subscription?.dispose();
    emitter?.dispose();
  });

  // ... tests
});
```

### Phase 4: Priority Files for Cleanup

Based on analysis, prioritize these files:

1. **tests/core/vscode/envFileWatcherService.mocked.test.ts**
   - Creates file watchers
   - High memory impact

2. **tests/core/communication/*.test.ts**
   - Uses EventEmitters
   - Message handlers

3. **tests/features/dashboard/handlers/*.test.ts**
   - Creates output channels
   - File watchers

4. **tests/core/logging/*.test.ts**
   - Creates output channels
   - Multiple channels per test

5. **tests/core/state/*.test.ts**
   - State change listeners
   - Event subscriptions

### Phase 5: Validation

After adding cleanup to each file:

```bash
# Test individual file
npx jest tests/path/to/modified.test.ts --verbose

# Run related tests
npx jest --testPathPattern="core/vscode" --verbose

# Full suite validation
npx jest
```

---

## Files to Create/Modify

- [ ] `tests/helpers/cleanup.ts` - New cleanup utility
- [ ] `tests/core/vscode/*.test.ts` - Add afterEach cleanup
- [ ] `tests/core/communication/*.test.ts` - Add afterEach cleanup
- [ ] `tests/features/dashboard/handlers/*.test.ts` - Add afterEach cleanup
- [ ] `tests/core/logging/*.test.ts` - Add afterEach cleanup
- [ ] `tests/core/state/*.test.ts` - Add afterEach cleanup

---

## Expected Outcome

After this step:
- 80%+ of event listener patterns have cleanup
- Cleanup utility available for new tests
- Memory usage more stable across long test runs
- Pattern documented for future tests

---

## Acceptance Criteria

- [ ] `tests/helpers/cleanup.ts` created with disposal utilities
- [ ] High-impact files have afterEach cleanup hooks
- [ ] All modified tests pass
- [ ] No new memory warnings in test output
- [ ] Pattern documented in testing guide
- [ ] At least 40+ afterEach hooks added (up from 51)

---

## Rollback Plan

If issues arise:

1. **For individual file:**
   ```bash
   git checkout -- tests/path/to/modified.test.ts
   ```

2. **For cleanup utility:**
   ```bash
   rm tests/helpers/cleanup.ts
   # Update imports in any files that used it
   ```

3. **Document issues:**
   - Which tests failed after cleanup
   - Whether cleanup timing was the issue
   - If specific mocks don't support dispose

---

## Notes

### Jest clearMocks vs Dispose

Jest's `clearMocks: true` (in jest.config.js) clears mock call history but does NOT:
- Call `dispose()` on mocked objects
- Clean up event listener registrations
- Remove references to mock instances

Manual `dispose()` calls are still required for proper cleanup.

### When NOT to Add Cleanup

Don't add cleanup if:
- Mock is created once at module level (not per-test)
- Resource is already cleaned up by test
- dispose() would interfere with assertions about disposal

### Measuring Impact

Before/after comparison:
```bash
# Enable heap logging temporarily
# In jest.config.js: logHeapUsage: true

# Run tests and compare memory output
npx jest --testPathPattern="core/vscode" --logHeapUsage
```

---

## Documentation Update

Add to testing guidelines:

```markdown
## Event Listener Cleanup

When tests create VS Code resources with `dispose()` methods:

1. Store reference in test scope
2. Call `dispose()` in `afterEach`
3. Use `safeDispose()` for optional resources

### Example

```typescript
import { safeDispose } from '../../helpers/cleanup';

describe('MyComponent', () => {
  let watcher: vscode.FileSystemWatcher;

  beforeEach(() => {
    watcher = vscode.workspace.createFileSystemWatcher('**/*');
  });

  afterEach(() => {
    safeDispose(watcher);
  });
});
```
```

---

## Estimated Time

- Utility creation: 30 minutes
- File identification: 30 minutes
- Cleanup implementation: 2-3 hours
- Validation: 30 minutes
- Total: 3-4 hours

---

_Step 5 of 5 - Jest Testing Optimization_
