# Step 4: Extend BaseCommand with Disposal Support

## Purpose

Extend the `BaseCommand` base class with disposal support using the DisposableStore pattern from Step 1. This provides a foundation for all command subclasses to properly manage disposable resources (terminals, file watchers, event subscriptions, etc.) with LIFO (Last-In-First-Out) disposal ordering.

This follows the PM-mandated principle: **Extend base classes to provide infrastructure, keep implementation in subclasses.**

## Prerequisites

- [x] Step 1 completed (DisposableStore utility)
- [x] Understanding of VS Code Disposable pattern
- [x] Understanding of BaseCommand usage across codebase
- [x] Awareness that ALL command subclasses will inherit these changes

## Context

**Current BaseCommand Usage:**
- Used by 15+ command classes throughout the codebase
- createTerminal() currently adds to context.subscriptions (line 114)
- No centralized disposal mechanism for command-owned resources
- Commands manually manage resource cleanup (inconsistent)

**After Step 4:**
- All commands automatically get `this.disposables` property
- Commands can use `this.disposables.add()` for any disposable resource
- BaseCommand implements vscode.Disposable interface
- Foundation ready for Steps 6-14 migrations

## Tests to Write First

### Test 1: DisposableStore Property Initialization

- [ ] **Test:** BaseCommand initializes disposables property
  - **Given:** Mock dependencies (context, stateManager, statusBar, logger)
  - **When:** Concrete command class instantiated (extends BaseCommand)
  - **Then:**
    - `disposables` property exists
    - `disposables` is instance of DisposableStore
    - Property is accessible from subclass
  - **File:** `tests/core/base/baseCommand.disposal.test.ts`

### Test 2: Dispose Method Calls DisposableStore

- [ ] **Test:** dispose() method delegates to DisposableStore.dispose()
  - **Given:** Command instance with disposables
  - **When:** command.dispose() called
  - **Then:**
    - DisposableStore.dispose() called exactly once
    - All added resources disposed in LIFO order
  - **File:** `tests/core/base/baseCommand.disposal.test.ts`

### Test 3: Idempotent Disposal

- [ ] **Test:** Multiple dispose() calls safe (no double-disposal)
  - **Given:** Command instance already disposed
  - **When:** dispose() called again
  - **Then:**
    - No error thrown
    - DisposableStore.dispose() not called again (idempotent)
    - Command remains in disposed state
  - **File:** `tests/core/base/baseCommand.disposal.test.ts`

### Test 4: CreateTerminal Uses Disposables

- [ ] **Test:** createTerminal() adds terminal to disposables (not context.subscriptions)
  - **Given:** Command instance
  - **When:** createTerminal('Test Terminal') called
  - **Then:**
    - Terminal created via vscode.window.createTerminal
    - Terminal added to this.disposables (tracked)
    - Terminal NOT added to context.subscriptions (legacy pattern removed)
  - **File:** `tests/core/base/baseCommand.disposal.test.ts`

### Test 5: Subclass Inheritance

- [ ] **Test:** Subclasses inherit disposal support
  - **Given:** Custom command class extending BaseCommand
  - **When:** Subclass adds resources to this.disposables
  - **Then:**
    - Resources tracked in parent's DisposableStore
    - dispose() disposes subclass resources
    - Subclass can override dispose() and call super.dispose()
  - **File:** `tests/core/base/baseCommand.disposal.test.ts`

### Test 6: Implements vscode.Disposable Interface

- [ ] **Test:** BaseCommand implements vscode.Disposable
  - **Given:** BaseCommand class definition
  - **When:** Type checking performed
  - **Then:**
    - BaseCommand assignable to vscode.Disposable type
    - Has dispose(): void method
    - Can be used with context.subscriptions.push(command)
  - **File:** `tests/core/base/baseCommand.disposal.test.ts`

## Files to Create/Modify

- [ ] `src/core/base/baseCommand.ts` - Modify existing base class
- [ ] `tests/core/base/baseCommand.disposal.test.ts` - New test file

## Implementation Details

### RED Phase (Write failing tests)

```typescript
// tests/core/base/baseCommand.disposal.test.ts
import * as vscode from 'vscode';
import { BaseCommand } from '@/core/base/baseCommand';
import { DisposableStore } from '@/core/utils/disposableStore';

// Mock VS Code API
jest.mock('vscode', () => ({
    window: {
        createTerminal: jest.fn(() => ({
            name: 'test',
            processId: Promise.resolve(1234),
            dispose: jest.fn(),
            sendText: jest.fn(),
            show: jest.fn()
        })),
        setStatusBarMessage: jest.fn(),
        withProgress: jest.fn((options, task) => task({ report: jest.fn() })),
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        showWarningMessage: jest.fn()
    },
    ProgressLocation: {
        Notification: 15
    },
    Uri: {
        file: (path: string) => ({ fsPath: path })
    }
}));

// Concrete test command (BaseCommand is abstract)
class TestCommand extends BaseCommand {
    public async execute(): Promise<void> {
        // Test implementation
    }

    // Expose protected disposables for testing
    public getDisposables(): DisposableStore {
        return this.disposables;
    }
}

describe('BaseCommand Disposal Support', () => {
    let mockContext: vscode.ExtensionContext;
    let mockStateManager: any;
    let mockStatusBar: any;
    let mockLogger: any;

    beforeEach(() => {
        // Create mock dependencies
        mockContext = {
            subscriptions: [],
            globalState: {
                get: jest.fn(),
                update: jest.fn()
            }
        } as any;

        mockStateManager = {
            getCurrentProject: jest.fn(),
            setState: jest.fn()
        };

        mockStatusBar = {
            update: jest.fn()
        };

        mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn()
        };
    });

    describe('DisposableStore Initialization', () => {
        it('should initialize disposables property', () => {
            const command = new TestCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger
            );

            expect(command.getDisposables()).toBeDefined();
            expect(command.getDisposables()).toBeInstanceOf(DisposableStore);
        });
    });

    describe('Dispose Method', () => {
        it('should call DisposableStore.dispose()', () => {
            const command = new TestCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger
            );

            const disposables = command.getDisposables();
            const disposeSpy = jest.spyOn(disposables, 'dispose');

            command.dispose();

            expect(disposeSpy).toHaveBeenCalledTimes(1);
        });

        it('should be idempotent (safe to call multiple times)', () => {
            const command = new TestCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger
            );

            const disposables = command.getDisposables();
            const disposeSpy = jest.spyOn(disposables, 'dispose');

            command.dispose();
            command.dispose();
            command.dispose();

            // DisposableStore.dispose() is idempotent, so it's called 3 times
            // but resources only disposed once
            expect(disposeSpy).toHaveBeenCalledTimes(3);
            expect(() => command.dispose()).not.toThrow();
        });
    });

    describe('CreateTerminal Integration', () => {
        it('should add terminal to disposables', () => {
            const command = new TestCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger
            );

            const disposables = command.getDisposables();
            const addSpy = jest.spyOn(disposables, 'add');

            const terminal = (command as any).createTerminal('Test Terminal');

            expect(vscode.window.createTerminal).toHaveBeenCalled();
            expect(addSpy).toHaveBeenCalledWith(terminal);
        });

        it('should NOT add terminal to context.subscriptions', () => {
            const command = new TestCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger
            );

            const initialLength = mockContext.subscriptions.length;

            (command as any).createTerminal('Test Terminal');

            // Should NOT add to context.subscriptions (legacy pattern removed)
            expect(mockContext.subscriptions.length).toBe(initialLength);
        });
    });

    describe('Subclass Inheritance', () => {
        it('should allow subclass to add resources', () => {
            class SubCommand extends BaseCommand {
                public async execute(): Promise<void> {
                    // Add mock resource
                    this.disposables.add({
                        dispose: jest.fn()
                    });
                }
            }

            const command = new SubCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger
            );

            expect(() => command.execute()).not.toThrow();
        });

        it('should dispose subclass resources via parent', () => {
            const mockDisposable = {
                dispose: jest.fn()
            };

            class SubCommand extends BaseCommand {
                public async execute(): Promise<void> {
                    this.disposables.add(mockDisposable);
                }

                public getDisposables() {
                    return this.disposables;
                }
            }

            const command = new SubCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger
            );

            command.execute();
            command.dispose();

            expect(mockDisposable.dispose).toHaveBeenCalled();
        });
    });

    describe('vscode.Disposable Interface', () => {
        it('should implement vscode.Disposable interface', () => {
            const command = new TestCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger
            );

            // Should have dispose method
            expect(typeof command.dispose).toBe('function');

            // Should be usable as Disposable
            const disposable: vscode.Disposable = command;
            expect(disposable).toBeDefined();
        });
    });
});
```

### GREEN Phase (Minimal implementation to pass tests)

```typescript
// src/core/base/baseCommand.ts (MODIFICATIONS)
import * as vscode from 'vscode';
import { Logger } from '@/core/logging';
import { StateManager } from '@/core/state';
import { StatusBarManager } from '@/core/vscode/StatusBarManager';
import { DisposableStore } from '@/core/utils/disposableStore'; // NEW IMPORT

export abstract class BaseCommand implements vscode.Disposable { // IMPLEMENTS vscode.Disposable
    protected context: vscode.ExtensionContext;
    protected stateManager: StateManager;
    protected statusBar: StatusBarManager;
    protected logger: Logger;
    protected disposables = new DisposableStore(); // NEW PROPERTY

    constructor(
        context: vscode.ExtensionContext,
        stateManager: StateManager,
        statusBar: StatusBarManager,
        logger: Logger,
    ) {
        this.context = context;
        this.stateManager = stateManager;
        this.statusBar = statusBar;
        this.logger = logger;
        // Note: disposables already initialized above as property initializer
    }

    public abstract execute(): Promise<void>;

    /**
     * Dispose all resources owned by this command
     *
     * This method is called when the command is no longer needed.
     * It disposes all resources added via this.disposables.add()
     * in LIFO (Last-In-First-Out) order.
     *
     * Safe to call multiple times (idempotent via DisposableStore).
     */
    public dispose(): void {
        this.disposables.dispose();
    }

    // ... existing methods (withProgress, showError, etc.) ...

    protected createTerminal(name: string, cwd?: string): vscode.Terminal {
        const terminal = vscode.window.createTerminal({
            name,
            cwd: cwd || undefined,
        });

        // CHANGED: Use disposables instead of context.subscriptions
        this.disposables.add(terminal);

        return terminal;
    }

    // ... rest of existing methods unchanged ...
}
```

### REFACTOR Phase (Improve quality)

**Refactoring checklist:**
- [ ] Add JSDoc examples for disposal usage
- [ ] Consider: Warn if resources added after disposal
- [ ] Consider: Disposal tracking metric (for debugging)
- [ ] Update BaseCommand JSDoc with disposal documentation
- [ ] Add migration guide for subclasses

**Enhanced JSDoc Example:**
```typescript
/**
 * Base class for all VS Code commands
 *
 * Provides:
 * - Standardized error handling
 * - Progress indicators
 * - User prompts (confirm, input, quick pick)
 * - Terminal creation with automatic disposal
 * - Resource disposal via DisposableStore (LIFO ordering)
 *
 * @example Basic command with disposal
 * ```typescript
 * class MyCommand extends BaseCommand {
 *     async execute(): Promise<void> {
 *         // Resources automatically disposed when command disposed
 *         const terminal = this.createTerminal('My Terminal');
 *
 *         // Add custom disposables
 *         const watcher = vscode.workspace.createFileSystemWatcher('**\/*.ts');
 *         this.disposables.add(watcher);
 *
 *         // Work with resources...
 *     }
 * }
 *
 * // Usage
 * const command = new MyCommand(context, state, statusBar, logger);
 * context.subscriptions.push(command); // Auto-disposed on deactivation
 * ```
 *
 * @example Subclass with custom disposal
 * ```typescript
 * class ComplexCommand extends BaseCommand {
 *     private connection: Connection;
 *
 *     async execute(): Promise<void> {
 *         this.connection = await createConnection();
 *         this.disposables.add({
 *             dispose: () => this.connection.close()
 *         });
 *     }
 * }
 * ```
 */
export abstract class BaseCommand implements vscode.Disposable {
    // ... implementation
}
```

## Expected Outcome

After completing this step:

- ✅ `BaseCommand` implements `vscode.Disposable` interface
- ✅ All tests passing (disposal initialization, method behavior, inheritance)
- ✅ Coverage ≥ 95% for new disposal code
- ✅ `createTerminal()` uses disposables (not context.subscriptions)
- ✅ All command subclasses inherit disposal support
- ✅ Foundation ready for Steps 6-14 migrations

**What works:**
- DisposableStore property initialized in constructor
- dispose() method delegates to DisposableStore.dispose()
- Idempotent disposal (safe to call multiple times)
- Terminals tracked in disposables
- Subclasses can use this.disposables.add()
- Type-compatible with vscode.Disposable

**What tests are passing:**
- Property initialization (1 test)
- Dispose method behavior (2 tests)
- CreateTerminal integration (2 tests)
- Subclass inheritance (2 tests)
- Interface compliance (1 test)
- Total: 8 tests passing

## Acceptance Criteria

- [ ] All tests passing for BaseCommand disposal (8 tests)
- [ ] Code follows project style guide
- [ ] No console.log or debugger statements
- [ ] Coverage ≥ 95% for new disposal code
- [ ] JSDoc comments with examples
- [ ] DisposableStore integration verified
- [ ] Subclass inheritance verified
- [ ] createTerminal uses disposables (not context.subscriptions)
- [ ] Implements vscode.Disposable interface

## Estimated Time

**2-3 hours**

- Tests: 1 hour
- Implementation: 0.5 hours
- Refactoring: 0.5 hours
- Documentation: 0.5 hours
- Verification: 0.5 hours

## Impact Assessment

**Files Affected:**
- `src/core/base/baseCommand.ts` - Modified (add disposal support)
- `tests/core/base/baseCommand.disposal.test.ts` - Created (new tests)

**Commands Affected (Indirect):**
All command subclasses automatically inherit disposal support:
- createProjectWebview.ts
- deleteProject.ts
- configure.ts
- diagnostics.ts
- resetAll.ts
- viewStatus.ts
- And 10+ other command classes

**Migration in Future Steps:**
- Step 6: Migrate extension.ts file watchers
- Step 7: Migrate deleteProject.ts
- Step 8: Migrate stopDemo.ts
- Step 9: Migrate startDemo.ts
- Steps 10-14: Migrate other command resources

## Risks and Mitigation

**Risk 1: Breaking Existing Commands**
- **Mitigation:** BaseCommand changes are additive (new property, new method)
- **Verification:** All existing tests must pass after changes

**Risk 2: createTerminal Behavior Change**
- **Mitigation:** Terminals still tracked for disposal (just different mechanism)
- **Verification:** Test that terminals are properly disposed

**Risk 3: Subclass Override Issues**
- **Mitigation:** Document disposal patterns clearly
- **Verification:** Test subclass inheritance explicitly

---

**Next Step:** Step 5 - Extend BaseWebviewCommand with Disposal Coordination
