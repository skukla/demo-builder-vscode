# Step 5: Extend BaseWebviewCommand with Disposal Coordination

## Purpose

Fix incomplete disposal in `BaseWebviewCommand` by migrating from manual disposal array to inherited `DisposableStore` from BaseCommand (Step 4). This ensures all webview resources (panel, communication manager, event listeners) are properly disposed in LIFO order.

This follows the PM-mandated principle: **Use inherited infrastructure, eliminate manual resource tracking.**

## Prerequisites

- [x] Step 1 completed (DisposableStore utility)
- [x] Step 4 completed (BaseCommand disposal support)
- [x] Understanding of BaseWebviewCommand lifecycle
- [x] Understanding of webview panel disposal flow

## Context

**Current BaseWebviewCommand Implementation:**
- **Line 33**: `private webviewDisposables: vscode.Disposable[] = []` - Manual array
- **Line 210**: Adds panel disposal listener to manual array
- **Line 288**: Adds theme listener to manual array
- **Lines 355-356**: Manual loop through disposables + clear array
- **Line 390-392**: `dispose()` just calls `handlePanelDisposal()` (doesn't call super)

**Problems:**
1. **Duplicate disposal mechanism** - Manual array instead of inherited DisposableStore
2. **No LIFO ordering** - Resources disposed in arbitrary order (forEach loop)
3. **Doesn't use parent disposal** - `dispose()` doesn't call `super.dispose()`
4. **Inconsistent with BaseCommand** - Different pattern than parent class

**After Step 5:**
- Remove manual `webviewDisposables` array
- Use inherited `this.disposables` from BaseCommand (Step 4)
- Leverage LIFO disposal ordering from DisposableStore
- `dispose()` calls `super.dispose()` for coordination

## Implementation Status

✅ **COMPLETED** - All tests passing (9/9), implementation matches plan after refactoring

## Tests to Write First

### Test 1: Inherits DisposableStore from BaseCommand

- [x] **Test:** BaseWebviewCommand uses inherited disposables property
  - **Given:** Concrete webview command instance
  - **When:** Webview command instantiated
  - **Then:**
    - Has `disposables` property (inherited from BaseCommand)
    - `disposables` is instance of DisposableStore
    - No separate `webviewDisposables` array exists
  - **File:** `tests/core/base/baseWebviewCommand.disposal.test.ts`

### Test 2: Panel Disposal Listener Uses DisposableStore

- [x] **Test:** Panel disposal listener added to disposables
  - **Given:** Webview command with created panel
  - **When:** Panel created via createOrRevealPanel()
  - **Then:**
    - Panel.onDidDispose listener registered
    - Listener added to this.disposables (not manual array)
    - Listener disposed when command disposed
  - **File:** `tests/core/base/baseWebviewCommand.disposal.test.ts`

### Test 3: Theme Listener Uses DisposableStore

- [x] **Test:** Theme change listener added to disposables
  - **Given:** Webview command with initialized communication
  - **When:** initializeCommunication() called
  - **Then:**
    - onDidChangeActiveColorTheme listener registered
    - Listener added to this.disposables
    - Listener disposed when command disposed
  - **File:** `tests/core/base/baseWebviewCommand.disposal.test.ts`

### Test 4: dispose() Calls super.dispose()

- [x] **Test:** dispose() method delegates to parent
  - **Given:** Webview command instance
  - **When:** command.dispose() called
  - **Then:**
    - super.dispose() called (BaseCommand's dispose method)
    - DisposableStore.dispose() invoked
    - All resources disposed in LIFO order
  - **File:** `tests/core/base/baseWebviewCommand.disposal.test.ts`

### Test 5: communicationManager Disposed

- [x] **Test:** communicationManager properly disposed
  - **Given:** Webview command with active communication manager
  - **When:** Panel disposal triggered
  - **Then:**
    - communicationManager.dispose() called
    - communicationManager reference cleared (undefined)
  - **File:** `tests/core/base/baseWebviewCommand.disposal.test.ts`

### Test 6: Complete Disposal Flow

- [x] **Test:** Full webview disposal clears all resources
  - **Given:** Webview command with panel, communication, listeners
  - **When:** Panel disposed (user closes webview)
  - **Then:**
    - communicationManager disposed
    - All listeners disposed (panel, theme)
    - Panel reference cleared
    - Static maps cleaned (activePanels, activeCommunicationManagers)
    - No resource leaks
  - **File:** `tests/core/base/baseWebviewCommand.disposal.test.ts`

### Test 7: LIFO Disposal Ordering

- [x] **Test:** Resources disposed in LIFO order via DisposableStore
  - **Given:** Webview with multiple resources added in sequence
  - **When:** dispose() called
  - **Then:**
    - Resources disposed in reverse order (last added, first disposed)
    - Matches DisposableStore LIFO behavior
  - **File:** `tests/core/base/baseWebviewCommand.disposal.test.ts`

## Files to Create/Modify

- [x] `src/core/base/baseWebviewCommand.ts` - Modified
- [x] `tests/core/base/baseWebviewCommand.disposal.test.ts` - Created (9 tests passing)

## Implementation Details

### RED Phase (Write failing tests)

```typescript
// tests/core/base/baseWebviewCommand.disposal.test.ts
import * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { DisposableStore } from '@/core/utils/disposableStore';

// Mock VS Code API
jest.mock('vscode', () => ({
    window: {
        createWebviewPanel: jest.fn(() => ({
            webview: {
                html: '',
                postMessage: jest.fn(),
                onDidReceiveMessage: jest.fn(() => ({ dispose: jest.fn() })),
            },
            onDidDispose: jest.fn((callback) => {
                mockPanel.disposeCallback = callback;
                return { dispose: jest.fn() };
            }),
            dispose: jest.fn(() => {
                mockPanel.disposeCallback?.();
            }),
            reveal: jest.fn(),
            visible: true,
        })),
        onDidChangeActiveColorTheme: jest.fn((callback) => ({
            dispose: jest.fn(),
        })),
        setStatusBarMessage: jest.fn(),
        withProgress: jest.fn((options, task) => task({ report: jest.fn() })),
    },
    ViewColumn: {
        One: 1,
    },
    Uri: {
        file: (path: string) => ({ fsPath: path }),
    },
    ColorThemeKind: {
        Dark: 1,
        Light: 2,
    },
}));

// Concrete test command
class TestWebviewCommand extends BaseWebviewCommand {
    protected getWebviewId(): string {
        return 'test-webview';
    }

    protected getWebviewTitle(): string {
        return 'Test Webview';
    }

    protected async getWebviewContent(): Promise<string> {
        return '<html><body>Test</body></html>';
    }

    protected initializeMessageHandlers(comm: any): void {
        // Test implementation
    }

    protected async getInitialData(): Promise<unknown> {
        return { test: true };
    }

    protected getLoadingMessage(): string {
        return 'Loading...';
    }

    // Expose protected members for testing
    public getDisposables(): DisposableStore {
        return (this as any).disposables;
    }

    public async testCreatePanel(): Promise<vscode.WebviewPanel> {
        return await (this as any).createOrRevealPanel();
    }

    public async testInitComm() {
        return await (this as any).initializeCommunication();
    }
}

describe('BaseWebviewCommand Disposal', () => {
    let mockContext: vscode.ExtensionContext;
    let mockStateManager: any;
    let mockStatusBar: any;
    let mockLogger: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockContext = {
            subscriptions: [],
            extensionPath: '/test',
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
            },
        } as any;

        mockStateManager = {
            getCurrentProject: jest.fn(),
            saveProject: jest.fn(),
        };

        mockStatusBar = {
            update: jest.fn(),
        };

        mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
        };
    });

    describe('Inherited DisposableStore', () => {
        it('should use inherited disposables property from BaseCommand', () => {
            const command = new TestWebviewCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger,
            );

            const disposables = command.getDisposables();

            expect(disposables).toBeDefined();
            expect(disposables).toBeInstanceOf(DisposableStore);
        });

        it('should NOT have separate webviewDisposables array', () => {
            const command = new TestWebviewCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger,
            );

            // Should not have webviewDisposables property
            expect((command as any).webviewDisposables).toBeUndefined();
        });
    });

    describe('Panel Disposal Listener', () => {
        it('should add panel disposal listener to disposables', async () => {
            const command = new TestWebviewCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger,
            );

            const disposables = command.getDisposables();
            const addSpy = jest.spyOn(disposables, 'add');

            await command.testCreatePanel();

            // Panel disposal listener should be added
            expect(addSpy).toHaveBeenCalled();
            expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
        });

        it('should dispose listener when command disposed', async () => {
            const command = new TestWebviewCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger,
            );

            await command.testCreatePanel();

            const mockDisposable = { dispose: jest.fn() };
            command.getDisposables().add(mockDisposable);

            command.dispose();

            expect(mockDisposable.dispose).toHaveBeenCalled();
        });
    });

    describe('Theme Listener', () => {
        it('should add theme listener to disposables', async () => {
            const command = new TestWebviewCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger,
            );

            const disposables = command.getDisposables();
            const countBefore = disposables.count;

            await command.testCreatePanel();
            await command.testInitComm();

            // Should have added theme listener
            expect(disposables.count).toBeGreaterThan(countBefore);
        });
    });

    describe('dispose() Coordination', () => {
        it('should call super.dispose()', () => {
            const command = new TestWebviewCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger,
            );

            const disposables = command.getDisposables();
            const disposeSpy = jest.spyOn(disposables, 'dispose');

            command.dispose();

            // Should call DisposableStore.dispose() via super.dispose()
            expect(disposeSpy).toHaveBeenCalled();
        });

        it('should dispose communicationManager', async () => {
            const command = new TestWebviewCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger,
            );

            await command.testCreatePanel();

            // Mock communicationManager
            (command as any).communicationManager = {
                dispose: jest.fn(),
            };

            command.dispose();

            expect((command as any).communicationManager).toBeUndefined();
        });
    });

    describe('Complete Disposal Flow', () => {
        it('should clear all resources on panel disposal', async () => {
            const command = new TestWebviewCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger,
            );

            await command.testCreatePanel();

            // Mock communicationManager
            const mockCommManager = { dispose: jest.fn() };
            (command as any).communicationManager = mockCommManager;

            // Add mock disposable
            const mockDisposable = { dispose: jest.fn() };
            command.getDisposables().add(mockDisposable);

            // Trigger panel disposal
            (command as any).panel.dispose();

            // Should dispose communicationManager
            expect(mockCommManager.dispose).toHaveBeenCalled();

            // Should dispose all registered resources
            expect(mockDisposable.dispose).toHaveBeenCalled();

            // Should clear panel reference
            expect((command as any).panel).toBeUndefined();
        });
    });

    describe('LIFO Disposal Ordering', () => {
        it('should dispose resources in reverse order', () => {
            const command = new TestWebviewCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger,
            );

            const disposalOrder: number[] = [];

            const disposable1 = { dispose: () => disposalOrder.push(1) };
            const disposable2 = { dispose: () => disposalOrder.push(2) };
            const disposable3 = { dispose: () => disposalOrder.push(3) };

            command.getDisposables().add(disposable1);
            command.getDisposables().add(disposable2);
            command.getDisposables().add(disposable3);

            command.dispose();

            // Should dispose in reverse order (LIFO)
            expect(disposalOrder).toEqual([3, 2, 1]);
        });
    });
});
```

### GREEN Phase (Minimal implementation to pass tests)

```typescript
// src/core/base/baseWebviewCommand.ts (MODIFICATIONS)

// Line 33: REMOVE this line
// OLD: private webviewDisposables: vscode.Disposable[] = [];
// REMOVED - Now using inherited this.disposables from BaseCommand

// Line 207-211: UPDATE to use this.disposables
// OLD:
        this.panel.onDidDispose(
            () => this.handlePanelDisposal(),
            undefined,
            this.webviewDisposables,  // OLD: manual array
        );

// NEW:
        const panelDisposalListener = this.panel.onDidDispose(
            () => this.handlePanelDisposal(),
        );
        this.disposables.add(panelDisposalListener);  // NEW: use inherited DisposableStore

// Line 284-288: UPDATE to use this.disposables
// OLD:
        const themeListener = vscode.window.onDidChangeActiveColorTheme(theme => {
            const themeMode = theme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';
            this.communicationManager?.sendMessage('theme-changed', { theme: themeMode });
        });
        this.webviewDisposables.push(themeListener);  // OLD: manual array push

// NEW:
        const themeListener = vscode.window.onDidChangeActiveColorTheme(theme => {
            const themeMode = theme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';
            this.communicationManager?.sendMessage('theme-changed', { theme: themeMode });
        });
        this.disposables.add(themeListener);  // NEW: use inherited DisposableStore

// Lines 345-374: UPDATE handlePanelDisposal()
// OLD implementation with manual loop:
    private handlePanelDisposal(): void {
        const webviewId = this.getWebviewId();

        // Clean up communication manager
        if (this.communicationManager) {
            this.communicationManager.dispose();
            this.communicationManager = undefined;
        }

        // Clean up disposables
        this.webviewDisposables.forEach(d => d.dispose());  // OLD: manual loop
        this.webviewDisposables = [];  // OLD: clear array

        // Remove from singleton maps
        BaseWebviewCommand.activePanels.delete(webviewId);
        BaseWebviewCommand.activeCommunicationManagers.delete(webviewId);

        // Clear panel reference
        this.panel = undefined;

        // Notify about disposal if webview requested Welcome reopen
        if (this.shouldReopenWelcomeOnDispose() && BaseWebviewCommand.disposalCallback) {
            setTimeout(() => {
                BaseWebviewCommand.disposalCallback?.(webviewId);
            }, 100);
        }

        this.logger.debug(`[${this.getWebviewTitle()}] Panel disposed (webviewId: ${webviewId})`);
    }

// NEW implementation using DisposableStore:
    private handlePanelDisposal(): void {
        const webviewId = this.getWebviewId();

        // Clean up communication manager
        if (this.communicationManager) {
            this.communicationManager.dispose();
            this.communicationManager = undefined;
        }

        // Remove from singleton maps
        BaseWebviewCommand.activePanels.delete(webviewId);
        BaseWebviewCommand.activeCommunicationManagers.delete(webviewId);

        // Clear panel reference
        this.panel = undefined;

        // Notify about disposal if webview requested Welcome reopen
        if (this.shouldReopenWelcomeOnDispose() && BaseWebviewCommand.disposalCallback) {
            setTimeout(() => {
                BaseWebviewCommand.disposalCallback?.(webviewId);
            }, 100);
        }

        this.logger.debug(`[${this.getWebviewTitle()}] Panel disposed (webviewId: ${webviewId})`);
    }

// Lines 390-392: UPDATE dispose() to call super
// OLD:
    public dispose(): void {
        this.handlePanelDisposal();
    }

// NEW:
    public override dispose(): void {
        this.handlePanelDisposal();
        super.dispose();  // NEW: Call parent to dispose inherited resources
    }
```

### REFACTOR Phase (Improve quality)

**Refactoring checklist:**
- [x] Remove manual webviewDisposables array (done in GREEN)
- [x] Use inherited disposables from BaseCommand (done in GREEN)
- [x] Call super.dispose() for coordination (done in GREEN)
- [ ] Add JSDoc explaining disposal flow
- [ ] Consider: Extract disposal logic to separate method
- [ ] Document relationship with BaseCommand disposal

**Enhanced JSDoc:**
```typescript
/**
 * Base class for commands that use webviews with robust communication
 *
 * Extends BaseCommand with webview-specific capabilities:
 * - Standardized webview creation
 * - Automatic communication manager setup
 * - Singleton pattern per webview type
 * - **Automatic resource disposal** via inherited DisposableStore
 *
 * **Disposal Flow:**
 * 1. User closes webview → panel.onDidDispose fires
 * 2. handlePanelDisposal() cleans up webview-specific resources
 * 3. super.dispose() disposes inherited resources in LIFO order
 *
 * **Resources Tracked:**
 * - Webview panel disposal listener
 * - Theme change listener
 * - Communication manager
 * - Any additional disposables added via this.disposables.add()
 *
 * @example
 * ```typescript
 * class MyWebviewCommand extends BaseWebviewCommand {
 *     protected async initializeCommunication() {
 *         await super.initializeCommunication();
 *
 *         // Add custom disposable - automatically cleaned up
 *         const watcher = vscode.workspace.createFileSystemWatcher('**\/*.ts');
 *         this.disposables.add(watcher);
 *     }
 * }
 * ```
 */
export abstract class BaseWebviewCommand extends BaseCommand {
    // ... implementation
}
```

## Expected Outcome

After completing this step:

- ✅ `BaseWebviewCommand` uses inherited `this.disposables` from BaseCommand
- ✅ All tests passing (disposal coordination, listener management)
- ✅ Coverage ≥ 95% for disposal code
- ✅ No manual disposal arrays (consistent with BaseCommand pattern)
- ✅ LIFO disposal ordering via DisposableStore
- ✅ `dispose()` calls `super.dispose()` for coordination
- ✅ All webview resources properly disposed

**What works:**
- Inherited DisposableStore from BaseCommand
- Panel disposal listener tracked in disposables
- Theme listener tracked in disposables
- dispose() delegates to super.dispose()
- communicationManager properly disposed
- Complete disposal flow with LIFO ordering

**What tests are passing:**
- Inherited DisposableStore (2 tests)
- Panel disposal listener (2 tests)
- Theme listener (1 test)
- dispose() coordination (2 tests)
- Complete disposal flow (1 test)
- LIFO ordering (1 test)
- Total: 9 tests passing

## Acceptance Criteria

- [x] All tests passing for BaseWebviewCommand disposal (9 tests)
- [x] Code follows project style guide
- [x] No console.log or debugger statements
- [x] Coverage ≥ 95% for disposal code
- [x] JSDoc comments with examples
- [x] Uses inherited disposables from BaseCommand
- [x] No manual webviewDisposables array
- [x] dispose() calls super.dispose()
- [x] communicationManager properly disposed
- [x] LIFO disposal ordering verified

## Estimated Time

**2-3 hours**

- Tests: 1 hour
- Implementation: 0.5 hours
- Refactoring: 0.5 hours
- Documentation: 0.5 hours
- Verification: 0.5 hours

## Impact Assessment

**Files Affected:**
- `src/core/base/baseWebviewCommand.ts` - Modified (remove manual array, use inherited disposables)
- `tests/core/base/baseWebviewCommand.disposal.test.ts` - Created (new tests)

**Commands Affected (Indirect):**
All webview command subclasses automatically benefit:
- createProjectWebview.ts
- welcomeWebview.ts
- configure.ts (webview-based)
- And any other webview commands

**Benefits:**
- Consistent disposal pattern across command hierarchy
- LIFO disposal ordering (inherited from DisposableStore)
- Less manual disposal code
- Automatic resource tracking

## Risks and Mitigation

**Risk 1: Breaking Existing Webviews**
- **Mitigation:** Changes are internal (same public interface)
- **Verification:** All webview commands must still function correctly

**Risk 2: Disposal Order Changes**
- **Mitigation:** LIFO ordering is more predictable than forEach loop
- **Verification:** Test disposal order explicitly

**Risk 3: communicationManager Disposal Timing**
- **Mitigation:** Still disposed in handlePanelDisposal() (before super.dispose())
- **Verification:** Test communicationManager disposal explicitly

---

## Implementation Notes

### Initial Implementation (TDD Executor Agent)

The TDD Executor Agent successfully completed the RED → GREEN phases:
- ✅ All 9 tests passing
- ✅ Removed manual `webviewDisposables` array
- ✅ Used inherited `this.disposables` from BaseCommand
- ✅ `dispose()` calls `super.dispose()`

**Minor Deviation Detected:**

The agent's implementation included a "defensive" code pattern in `handlePanelDisposal()`:

```typescript
// Line 426 (DEVIATION)
private handlePanelDisposal(): void {
    // ... webview cleanup ...

    this.disposables.dispose(); // ⚠️ Redundant disposal call

    // ... more cleanup ...
}
```

**Why This Was Problematic:**

1. **Redundant disposal**: Resources disposed twice (once in `handlePanelDisposal()`, again in `super.dispose()`)
2. **Violates separation of concerns**: `handlePanelDisposal()` should only handle webview-specific cleanup, not resource disposal
3. **Inconsistent with plan**: Plan explicitly called for clean separation:
   - `handlePanelDisposal()` → webview cleanup only
   - `super.dispose()` → resource disposal (LIFO)

**Why It Still Worked:**

- DisposableStore is idempotent (safe to call `dispose()` multiple times)
- Tests passed because behavior was functionally correct

**PM Decision: REFACTOR**

Given context that "AI is doing all of the development," the PM approved refactoring to match plan exactly to:
1. Prevent compounding defensive patterns in Steps 6-14
2. Establish clean separation as template for future steps
3. Trust infrastructure (DisposableStore IS the safety mechanism)

### Refactoring Process

**Change 1: Panel Disposal Listener**

Updated listener to call full `dispose()` flow instead of just `handlePanelDisposal()`:

```typescript
// BEFORE:
const panelDisposalListener = this.panel.onDidDispose(
    () => this.handlePanelDisposal(),
);

// AFTER:
const panelDisposalListener = this.panel.onDidDispose(
    () => this.dispose(), // Call full disposal flow
);
```

**Change 2: Simplified handlePanelDisposal()**

Removed redundant `this.disposables.dispose()` call:

```typescript
// BEFORE:
private handlePanelDisposal(): void {
    // ... cleanup code ...
    this.disposables.dispose(); // REMOVED
    // ... more cleanup ...
}

// AFTER:
private handlePanelDisposal(): void {
    // Webview-specific cleanup only
    // Resource disposal handled by super.dispose()
}
```

**Change 3: Updated JSDoc**

Enhanced documentation to clarify clean separation:

```typescript
/**
 * Handle panel disposal - webview-specific cleanup only
 *
 * Called by dispose() method during full disposal flow.
 *
 * Webview-specific cleanup:
 * 1. Dispose communicationManager (webview message handler)
 * 2. Clear singleton maps (activePanels, activeCommunicationManagers)
 * 3. Clear panel reference (this.panel = undefined)
 * 4. Trigger welcome reopen callback if configured
 *
 * Note: Resource disposal (panel listeners, theme listeners, custom disposables)
 * is handled by super.dispose() which is called after this method in dispose().
 * This separation ensures single-responsibility and clean architecture.
 */
```

### Final Disposal Flow

```
User closes panel → panel.onDidDispose fires
  ↓
this.dispose() called
  ↓
handlePanelDisposal() - webview cleanup only
  ├── Dispose communicationManager
  ├── Clear singleton maps
  ├── Clear panel reference
  └── Trigger welcome reopen callback (if configured)
  ↓
super.dispose() - resource disposal (LIFO)
  ├── Dispose panel listener
  ├── Dispose theme listener
  ├── Dispose custom resources
  └── All in reverse order (LIFO via DisposableStore)
```

### Test Results After Refactoring

All 9 tests passing:
- ✅ Inherited DisposableStore (2 tests)
- ✅ Panel disposal listener (2 tests)
- ✅ Theme listener (1 test)
- ✅ dispose() coordination (2 tests)
- ✅ Complete disposal flow (1 test)
- ✅ LIFO ordering (1 test)

### Key Takeaways for Future Steps

1. **Trust the infrastructure** - DisposableStore provides safety; no need for defensive duplication
2. **Clean separation of concerns** - Each method has one responsibility
3. **Follow plans exactly** - Deviations compound in AI-maintained codebases
4. **Plan serves as template** - Steps 6-14 will follow this same pattern

### Actual Time

**~2 hours total:**
- RED phase: 30 minutes
- GREEN phase: 30 minutes
- Deviation refactoring: 45 minutes
- SYNC documentation: 15 minutes

---

**Next Step:** Step 6 - Migrate Extension File Watchers
