# Testing: Mocking Patterns for Resource-Intensive Tests

> **Quick Reference** for Steps 3, 6, 8, 9, and any step touching system resources

## Why Fully Mocked Tests?

**Problem:** Tests that spawn real processes or create actual file system resources **crash Cursor IDE** due to excessive resource usage.

**Solution:** Two-tier testing strategy with **Tier 1 fully mocked tests** (run in IDE) as primary validation.

**Complete Strategy:** See `overview.md` → "CRITICAL LEARNING: Resource-Intensive Test Strategy"

---

## Pattern 1: Process Mocking (Steps 2, 8)

**Use for:** ProcessCleanup service, terminal process tracking

**Files:** `processCleanup.mocked.test.ts` ✅ (reference implementation)

```typescript
// Mock tree-kill module
const mockTreeKill = jest.fn();
jest.mock('tree-kill', () => mockTreeKill);

// Track which processes "exist"
const processExists = new Set([1000, 2000, 3000]);

// Configure tree-kill behavior in beforeEach
beforeEach(() => {
  mockTreeKill.mockImplementation((pid: number, signal: string, callback: (err?: Error) => void) => {
    if (!processExists.has(pid)) {
      callback(new Error('ESRCH')); // Process doesn't exist
      return;
    }

    if (signal === 'SIGTERM' || signal === 'TERM') {
      // Simulate delayed exit
      setTimeout(() => {
        processExists.delete(pid);
        callback();
      }, 50);
    } else if (signal === 'SIGKILL' || signal === 'KILL') {
      // Immediate exit
      processExists.delete(pid);
      callback();
    } else {
      callback();
    }
  });
});

// Mock process.kill for existence checking
beforeEach(() => {
  originalKill = process.kill;
  process.kill = jest.fn((pid: number, signal: NodeJS.Signals | number = 'SIGTERM') => {
    // Signal 0 = check existence
    if (signal === 0) {
      if (!processExists.has(pid)) {
        const error: any = new Error('No such process');
        error.code = 'ESRCH';
        throw error;
      }
      return true;
    }

    // Handle SIGTERM/SIGKILL
    if (!processExists.has(pid)) {
      const error: any = new Error('No such process');
      error.code = 'ESRCH';
      throw error;
    }

    if (signal === 'SIGKILL') {
      processExists.delete(pid);
    }

    return true;
  }) as any;
});

afterEach(() => {
  process.kill = originalKill;
  mockTreeKill.mockClear();
});
```

**Test Example:**
```typescript
it('should kill process gracefully', async () => {
  const cleanup = new ProcessCleanup();
  const pid = 1000;

  await cleanup.killProcessTree(pid, 'SIGTERM');

  // Verify mock was called
  expect(mockTreeKill).toHaveBeenCalledWith(pid, 'SIGTERM', expect.any(Function));

  // Verify process "died"
  expect(processExists.has(pid)).toBe(false);
});
```

---

## Pattern 2: File Watcher Mocking (Steps 3, 6)

**Use for:** WorkspaceWatcherManager, extension.ts file watchers

**Future Implementation:** Step 3

```typescript
// Mock vscode.workspace.createFileSystemWatcher
const mockWatchers: any[] = [];

jest.mock('vscode', () => {
  const original = jest.requireActual('vscode');
  return {
    ...original,
    workspace: {
      ...original.workspace,
      createFileSystemWatcher: jest.fn((pattern: string) => {
        const watcher = {
          pattern,
          _disposed: false,
          _listeners: {
            onCreate: [] as Function[],
            onChange: [] as Function[],
            onDelete: [] as Function[]
          },
          onDidCreate: jest.fn((listener) => {
            watcher._listeners.onCreate.push(listener);
            return { dispose: () => {} };
          }),
          onDidChange: jest.fn((listener) => {
            watcher._listeners.onChange.push(listener);
            return { dispose: () => {} };
          }),
          onDidDelete: jest.fn((listener) => {
            watcher._listeners.onDelete.push(listener);
            return { dispose: () => {} };
          }),
          dispose: jest.fn(() => {
            watcher._disposed = true;
            const idx = mockWatchers.indexOf(watcher);
            if (idx !== -1) mockWatchers.splice(idx, 1);
          })
        };

        mockWatchers.push(watcher);
        return watcher;
      })
    }
  };
});

// Helper: Trigger watcher events
function triggerWatcherEvent(pattern: string, eventType: 'create' | 'change' | 'delete', uri: any) {
  const watcher = mockWatchers.find(w => w.pattern === pattern);
  if (!watcher || watcher._disposed) return;

  const listeners = watcher._listeners[`on${eventType.charAt(0).toUpperCase() + eventType.slice(1)}`];
  listeners.forEach(listener => listener(uri));
}
```

**Test Example:**
```typescript
it('should create watcher for workspace pattern', () => {
  const manager = new WorkspaceWatcherManager();
  const workspaceFolder = { uri: { fsPath: '/workspace' } };

  manager.createWatcher(workspaceFolder, '**/.env');

  expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledWith('**/.env');
  expect(mockWatchers).toHaveLength(1);
});

it('should dispose watcher when workspace removed', () => {
  const manager = new WorkspaceWatcherManager();
  const workspaceFolder = { uri: { fsPath: '/workspace' } };

  const watcher = manager.createWatcher(workspaceFolder, '**/.env');
  manager.dispose();

  expect(watcher._disposed).toBe(true);
  expect(mockWatchers).toHaveLength(0);
});
```

---

## Pattern 3: Terminal Mocking (Step 9)

**Use for:** startDemo.ts terminal creation

**Future Implementation:** Step 9

```typescript
// Mock vscode.window.createTerminal
const mockTerminals: any[] = [];
let nextTerminalPid = 10000;

jest.mock('vscode', () => {
  const original = jest.requireActual('vscode');
  return {
    ...original,
    window: {
      ...original.window,
      createTerminal: jest.fn((options: any) => {
        const terminalPid = nextTerminalPid++;
        const terminal = {
          name: options.name,
          _pid: terminalPid,
          _disposed: false,
          processId: Promise.resolve(terminalPid),
          sendText: jest.fn((text: string) => {
            // Track commands sent to terminal
            terminal._sentCommands.push(text);
          }),
          _sentCommands: [] as string[],
          dispose: jest.fn(() => {
            terminal._disposed = true;
            const idx = mockTerminals.indexOf(terminal);
            if (idx !== -1) mockTerminals.splice(idx, 1);
          }),
          show: jest.fn()
        };

        mockTerminals.push(terminal);
        return terminal;
      })
    }
  };
});

afterEach(() => {
  // Cleanup mock terminals
  mockTerminals.length = 0;
  nextTerminalPid = 10000;
});
```

**Test Example:**
```typescript
it('should create terminal and track PID', async () => {
  const command = new StartDemoCommand();

  await command.execute();

  expect(vscode.window.createTerminal).toHaveBeenCalledWith({
    name: expect.stringContaining('Demo'),
    cwd: expect.any(String)
  });

  expect(mockTerminals).toHaveLength(1);
  const terminal = mockTerminals[0];

  // Verify PID was stored for cleanup
  const pid = await terminal.processId;
  expect(pid).toBeGreaterThan(0);
});

it('should dispose terminal on cleanup', async () => {
  const command = new StartDemoCommand();
  await command.execute();

  const terminal = mockTerminals[0];
  command.dispose();

  expect(terminal._disposed).toBe(true);
});
```

---

## Pattern 4: Combined Mocking (Integration Tests)

**Use for:** Commands that use multiple resources (terminals + process cleanup)

```typescript
// Combine patterns from above
const mockTreeKill = jest.fn();
jest.mock('tree-kill', () => mockTreeKill);

const mockTerminals: any[] = [];
jest.mock('vscode', () => ({
  window: {
    createTerminal: jest.fn(/* ... terminal mock ... */)
  }
}));

describe('StopDemo Command Integration', () => {
  it('should stop terminal process using ProcessCleanup', async () => {
    // 1. Start demo (creates terminal)
    const startCmd = new StartDemoCommand();
    await startCmd.execute();

    const terminal = mockTerminals[0];
    const pid = await terminal.processId;

    // 2. Stop demo (kills process)
    const stopCmd = new StopDemoCommand();
    await stopCmd.execute();

    // 3. Verify ProcessCleanup was used
    expect(mockTreeKill).toHaveBeenCalledWith(pid, 'SIGTERM', expect.any(Function));

    // 4. Verify terminal disposed
    expect(terminal._disposed).toBe(true);
  });
});
```

---

## Checklist: Adding Mocked Tests to a Step

When implementing a step that needs mocked tests:

- [ ] **Identify resource type:** Process, file watcher, or terminal?
- [ ] **Copy relevant pattern** from this document
- [ ] **Create `*.mocked.test.ts` file** alongside regular test file
- [ ] **Add file header comment:**
  ```typescript
  /**
   * Fully Mocked Tests for [Component]
   *
   * These tests use mocked resources (no real processes/watchers/terminals)
   * to avoid crashing Cursor IDE. Safe for rapid iteration in IDE.
   *
   * Pattern: [Process/FileWatcher/Terminal] Mocking
   * Reference: .rptc/plans/resource-lifecycle-management/TESTING-MOCKING-PATTERNS.md
   */
  ```
- [ ] **Test in Cursor IDE** - verify no crashes
- [ ] **Run with `npm run test:file`** - verify passing
- [ ] **Document any pattern variations** in this file for future steps

---

## Test Execution Commands

**In Cursor (safe):**
```bash
# Run mocked tests only
npm run test:file -- tests/path/to/component.mocked.test.ts --maxWorkers=1
```

**External Terminal (for real resource tests):**
```bash
# Run real integration tests (NOT in Cursor)
npm run test:file -- tests/path/to/component.test.ts --maxWorkers=1
```

---

## Reference Implementations

| Pattern | Step | File | Status |
|---------|------|------|--------|
| **Process Mocking** | Step 2 | `tests/core/shell/processCleanup.mocked.test.ts` | ✅ Complete (16/16 passing) |
| **File Watcher Mocking** | Step 3 | `tests/core/vscode/workspaceWatcherManager.mocked.test.ts` | ✅ Complete (11/11 passing) |
| **Terminal Mocking** | Step 9 | `tests/features/lifecycle/commands/startDemo.mocked.test.ts` | ⏳ Pending |

---

**Last Updated:** 2025-11-23 (Step 3 completion)
**Maintainer:** Update this document as new patterns emerge
