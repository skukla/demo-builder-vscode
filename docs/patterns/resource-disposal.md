# Resource Disposal Patterns

## Overview

This document describes the resource disposal patterns used in the Adobe Demo Builder extension to prevent memory leaks, file lock issues, and orphaned processes.

**Key Principle:** Dispose resources in LIFO (Last In, First Out) order to ensure dependencies are cleaned up correctly.

## Core Patterns

### 1. DisposableStore Pattern

**Location:** `src/core/utils/disposableStore.ts`

**Purpose:** Manage multiple disposable resources with guaranteed LIFO disposal ordering.

```typescript
import { DisposableStore } from '@/core/utils/disposableStore';

class MyService {
    private disposables = new DisposableStore();

    initialize() {
        // Add resources - will be disposed in reverse order
        this.disposables.add(vscode.workspace.createFileSystemWatcher('**/*.ts'));
        this.disposables.add(vscode.window.onDidChangeActiveTextEditor(handler));
        this.disposables.add(eventEmitter.event(myHandler));
    }

    dispose() {
        // Disposes all resources in LIFO order
        this.disposables.dispose();
    }
}
```

**Key Features:**
- LIFO disposal ordering
- Safe multiple dispose calls (idempotent)
- Clear all resources on dispose
- Track disposal state

### 2. BaseCommand Auto-Disposal

**Location:** `src/core/base/baseCommand.ts`

**Purpose:** Commands automatically get a DisposableStore for resource management.

```typescript
import { BaseCommand } from '@/core/base';

class MyCommand extends BaseCommand {
    async execute(): Promise<void> {
        // Add custom disposables
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.ts');
        this.disposables.add(watcher);

        // Resources automatically disposed when command completes
    }
}
```

**Automatic Disposal:**
- `dispose()` called automatically after execute()
- Cleans up all registered disposables
- LIFO ordering preserved

### 3. BaseWebviewCommand Disposal

**Location:** `src/core/base/baseWebviewCommand.ts`

**Purpose:** Webview commands have two-phase disposal for proper cleanup.

```typescript
import { BaseWebviewCommand } from '@/core/base';

class MyWebviewCommand extends BaseWebviewCommand {
    protected async initializeCommunication() {
        await super.initializeCommunication();

        // Add custom disposable
        const subscription = someEmitter.event(handler);
        this.disposables.add(subscription);
    }

    // Disposal happens automatically:
    // 1. handlePanelDisposal() - webview-specific cleanup
    // 2. super.dispose() - DisposableStore cleanup (LIFO)
}
```

**Two-Phase Disposal:**
1. `handlePanelDisposal()` - Communication manager, singleton maps, panel reference
2. `super.dispose()` - All registered disposables via DisposableStore

### 4. ProcessCleanup Service

**Location:** `src/core/shell/processCleanup.ts`

**Purpose:** Event-driven process termination with process tree killing.

```typescript
import { ProcessCleanup } from '@/core/shell/processCleanup';

// Kill process and all children
await ProcessCleanup.killProcessTree(pid);

// With custom timeout (default 5000ms)
await ProcessCleanup.killProcessTree(pid, { timeoutMs: 10000 });
```

**Key Features:**
- Kills entire process tree (parent + children)
- Cross-platform: macOS/Linux (pkill -P), Windows (taskkill /T)
- Graceful shutdown (SIGTERM first, SIGKILL fallback)
- Event-driven (no polling or grace periods)

**Usage in Lifecycle Commands:**
- `stopDemo.ts` - Terminate running demo processes
- `startDemo.ts` - Kill conflicting port processes

### 5. Workspace-Scoped Watchers

**Location:** `src/core/vscode/workspaceWatcherManager.ts`

**Purpose:** File watchers scoped to workspace folders with automatic cleanup.

```typescript
import { WorkspaceWatcherManager } from '@/core/vscode';

const manager = new WorkspaceWatcherManager();

// Register watcher - auto-disposed when workspace folder removed
manager.registerWatcher(workspaceFolder, '**/*.env', (uri) => {
    console.log('File changed:', uri.fsPath);
});

// All watchers disposed on manager.dispose()
```

**Key Features:**
- Watchers scoped to workspace folders
- Auto-dispose when workspace folder removed
- Prevents duplicate watchers (same folder + pattern)
- LIFO disposal via DisposableStore

### 6. EnvFileWatcherService

**Location:** `src/core/vscode/envFileWatcherService.ts`

**Purpose:** .env file monitoring with smart change detection.

```typescript
import { EnvFileWatcherService } from '@/core/vscode';

const service = new EnvFileWatcherService(stateManager, logger);
service.initialize();

// Register programmatic writes to suppress notifications
await service.registerProgrammaticWrite('/path/to/.env');

// Service disposed on extension deactivate
service.dispose();
```

**Key Features:**
- Hash-based change detection (prevents false notifications)
- Programmatic write suppression
- Show-once notification management
- Startup grace period (10 seconds)

## Anti-Patterns to Avoid

### 1. Grace Period Anti-Pattern ❌

```typescript
// BAD: Using setTimeout to wait for process exit
async stopDemo() {
    terminal.dispose();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Hope process is dead
    await fs.rm(projectPath);  // May fail if process still running
}
```

**Fix: Use event-driven completion**

```typescript
// GOOD: Wait for actual process exit
async stopDemo() {
    await ProcessCleanup.killProcessTree(pid);  // Waits for exit
    await fs.rm(projectPath);  // Safe - process guaranteed dead
}
```

### 2. Fire-and-Forget Async ❌

```typescript
// BAD: Promise not awaited
vscode.commands.executeCommand('demoBuilder.stopDemo').then(() => {
    vscode.commands.executeCommand('demoBuilder.startDemo');
});
```

**Fix: Proper async/await**

```typescript
// GOOD: Sequential execution with error handling
try {
    await vscode.commands.executeCommand('demoBuilder.stopDemo');
    await vscode.commands.executeCommand('demoBuilder.startDemo');
} catch (error) {
    logger.error('Failed to restart demo', error);
}
```

### 3. Manual Disposal Without LIFO ❌

```typescript
// BAD: Random disposal order
dispose() {
    this.watcher?.dispose();      // Might depend on eventEmitter
    this.subscription?.dispose();  // Unknown dependencies
    this.eventEmitter?.dispose();  // Should be disposed last
}
```

**Fix: Use DisposableStore**

```typescript
// GOOD: LIFO ordering guaranteed
constructor() {
    this.disposables.add(this.eventEmitter);   // Added first, disposed last
    this.disposables.add(this.subscription);   // Depends on eventEmitter
    this.disposables.add(this.watcher);        // Added last, disposed first
}

dispose() {
    this.disposables.dispose();  // Automatic LIFO
}
```

### 4. Deletion Before Watcher Disposal ❌

```typescript
// BAD: Delete directory while watcher holds file handles
async deleteProject() {
    await fs.rm(projectPath);  // ENOTEMPTY error!
    this.watcher?.dispose();   // Too late
}
```

**Fix: Dispose watchers first**

```typescript
// GOOD: Dispose watchers before deletion
async deleteProject() {
    await this.disposeProjectWatchers();  // Release file handles
    await deleteWithRetry(projectPath);    // Now safe to delete
}
```

## Testing Disposal

### Test Pattern: Verify Disposal Called

```typescript
describe('MyService', () => {
    it('should dispose all resources', () => {
        const mockDisposable = { dispose: jest.fn() };
        const service = new MyService();
        service.addResource(mockDisposable);

        service.dispose();

        expect(mockDisposable.dispose).toHaveBeenCalled();
    });

    it('should handle multiple dispose calls', () => {
        const service = new MyService();

        // Should not throw
        service.dispose();
        service.dispose();
        service.dispose();
    });
});
```

### Test Pattern: LIFO Order Verification

```typescript
describe('DisposableStore', () => {
    it('should dispose in LIFO order', () => {
        const order: number[] = [];
        const store = new DisposableStore();

        store.add({ dispose: () => order.push(1) });
        store.add({ dispose: () => order.push(2) });
        store.add({ dispose: () => order.push(3) });

        store.dispose();

        expect(order).toEqual([3, 2, 1]);  // LIFO
    });
});
```

## Migration Guide

### From Manual Disposal to DisposableStore

**Before:**
```typescript
class MyService {
    private watcher: vscode.FileSystemWatcher | undefined;
    private subscription: vscode.Disposable | undefined;

    dispose() {
        this.watcher?.dispose();
        this.subscription?.dispose();
    }
}
```

**After:**
```typescript
class MyService {
    private disposables = new DisposableStore();

    initialize() {
        this.disposables.add(vscode.workspace.createFileSystemWatcher('**/*'));
        this.disposables.add(someEmitter.event(handler));
    }

    dispose() {
        this.disposables.dispose();
    }
}
```

### From setTimeout to Event-Driven

**Before:**
```typescript
async stopProcess() {
    process.kill();
    await new Promise(r => setTimeout(r, 2000));  // Hope it's dead
}
```

**After:**
```typescript
async stopProcess() {
    await ProcessCleanup.killProcessTree(pid);  // Waits for actual exit
}
```

## Related Documentation

- `src/core/base/README.md` - BaseCommand and BaseWebviewCommand disposal
- `src/core/CLAUDE.md` - Core infrastructure overview
- `tests/core/utils/disposableStore.test.ts` - DisposableStore tests
- `tests/core/shell/processCleanup.test.ts` - ProcessCleanup tests

## Summary

| Pattern | Use Case | Key Benefit |
|---------|----------|-------------|
| DisposableStore | Multiple disposables | LIFO ordering |
| BaseCommand | Command resources | Auto-disposal |
| BaseWebviewCommand | Webview resources | Two-phase cleanup |
| ProcessCleanup | Process termination | Event-driven, tree killing |
| WorkspaceWatcherManager | File watchers | Workspace-scoped |
| EnvFileWatcherService | .env monitoring | Smart change detection |

**Golden Rules:**
1. Always use DisposableStore for multiple resources
2. Dispose watchers BEFORE deleting files
3. Use ProcessCleanup instead of setTimeout
4. Await async operations (no fire-and-forget)
5. Test disposal behavior
