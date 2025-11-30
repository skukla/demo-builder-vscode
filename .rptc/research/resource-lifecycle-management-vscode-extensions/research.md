# Resource Lifecycle Management in VS Code Extensions - Research Report

**Research Date:** 2025-11-23
**Research Topic:** Systemic resource lifecycle management issues affecting project deletion and overall extension stability
**Scope:** Codebase analysis + Industry best practices
**Depth:** Standard (comprehensive analysis with actionable recommendations)

---

## Executive Summary

The project deletion bug (`ENOTEMPTY: directory not empty, rmdir`) revealed **systemic architectural issues** with resource lifecycle management affecting 15+ files across the codebase. This is not a simple bug—it's a code smell indicating missing architectural patterns that the VS Code ecosystem has already solved.

**7 Critical Code Smells Identified:**
1. No centralized disposal coordinator
2. File watcher lifecycle not tied to projects (global watcher locks deleted files)
3. Terminal processes not properly tracked (fire-and-forget pattern)
4. Event subscriptions not cleanup-safe (memory leaks)
5. Async command pattern creates race conditions (`.then()` without await)
6. Grace period anti-pattern (unreliable timing)
7. Incomplete webview disposal

**Industry Solutions Exist:**
- DisposableStore pattern (VS Code internal)
- Workspace-scoped resource management (Remote Development extension pattern)
- Event-driven process completion (Task API)
- File watcher disposal before operations (official guidance)

**Immediate Fix:** Add retry logic + file watcher disposal (2-4 hours)
**Long-term Solution:** Architectural refactoring implementing proven VS Code patterns (1-2 weeks)

---

## Table of Contents

1. [Root Cause Analysis](#root-cause-analysis)
2. [Current Codebase Issues](#current-codebase-issues)
3. [Industry Best Practices](#industry-best-practices)
4. [Gap Analysis](#gap-analysis)
5. [Recommended Tools](#recommended-tools)
6. [Implementation Roadmap](#implementation-roadmap)
7. [Appendix: Complete Source List](#appendix-complete-source-list)

---

## Root Cause Analysis

### The Project Deletion Bug

**Error:**
```
[Delete Project] Deleting project directory: /Users/kukla/.demo-builder/projects/my-commerce-demo
❌ [Delete Project] ❌ Failed to delete project files
  Error: ENOTEMPTY: directory not empty, rmdir '<path>/'
```

**Why `rmdir` error despite using `fs.rm({ recursive: true })`?**

Node.js `fs.rm()` internally delegates to `rmdir()` for certain scenarios. When file handles are locked:
- `fs.rm()` tries to remove files first
- Then attempts `rmdir()` on the directory
- `rmdir()` fails with ENOTEMPTY because handles are still open
- Error propagates as "ENOTEMPTY: directory not empty"

### Three Root Causes

#### 1. Insufficient Grace Period (Race Condition)

**File:** `src/features/lifecycle/commands/deleteProject.ts:26-29`

```typescript
if (project.status === 'running') {
    await vscode.commands.executeCommand('demoBuilder.stopDemo');
    await new Promise(resolve => setTimeout(resolve, 1000));  // Only 1 second!
}
```

**Problem:**
- `stopDemo` command returns immediately while async work continues
- Inside `stopDemo.ts:88`, port-free check can take up to 10 seconds
- deleteProject waits only 1 second, then attempts deletion
- File handles still open when deletion starts

#### 2. Global File Watcher Never Disposed

**File:** `src/extension.ts:313-521`

```typescript
const envWatcher = vscode.workspace.createFileSystemWatcher('**/{.env,.env.local}');
envWatcher.onDidChange(...);
envWatcher.onDidCreate(...);
envWatcher.onDidDelete(...);
context.subscriptions.push(envWatcher);
// Watcher disposed ONLY on extension deactivation, never before project deletion
```

**Problem:**
- Global watcher monitors ALL `.env` files in workspace
- Pattern `**/{.env,.env.local}` matches project directories
- When project deleted, watcher still has file handle on `.env` files
- OS prevents deletion because watcher holds reference

#### 3. Terminal Disposal Doesn't Wait for Process Exit

**File:** `src/features/lifecycle/commands/stopDemo.ts:77-81`

```typescript
vscode.window.terminals.forEach(terminal => {
    if (terminal.name === terminalName) {
        terminal.dispose();  // Returns immediately
    }
});
```

**Problem:**
- `terminal.dispose()` closes the terminal UI but may not kill the underlying process
- Process continues running with working directory set to project path
- File handles remain open (config files, logs, node_modules)
- 1-second grace period insufficient for process cleanup

---

## Current Codebase Issues

### 1. No Centralized Disposal Coordinator 🔴 Critical

**Current State:**
- Each component disposes independently in `deactivate()` (extension.ts:295-309)
- No coordination when multiple systems need cleanup
- No cancellation of in-flight operations
- Project deletion can race against cleanup operations

**Affected Files:**
- `src/extension.ts:295-309` - Manual cleanup in deactivate()
- `src/features/lifecycle/commands/deleteProject.ts:26-72` - No coordination
- `src/commands/resetAll.ts:29-104` - Better but still manual

**Code Evidence:**

```typescript
// extension.ts:295-309
export async function deactivate(): Promise<void> {
    logger.info('[Extension] Extension is being deactivated');
    statusBar?.dispose();
    autoUpdater?.dispose();
    stateManager?.dispose();
    externalCommandManager?.dispose();
    // No ordering, no coordination, no cancellation
}
```

**Impact:**
- Resource leaks when cleanup fails
- Race conditions during project deletion
- No way to cancel pending operations

---

### 2. File Watcher Lifecycle Not Tied to Projects 🔴 Critical

**Current State:**
- Global `.env` watcher created in `extension.ts:313-521`
- Watches **ALL** `.env` files with pattern `**/{.env,.env.local}`
- Never disposed before project deletion
- Continues watching deleted project directories indefinitely

**Code Location:**

```typescript
// extension.ts:313-521
function registerFileWatchers(context: vscode.ExtensionContext): void {
    const envWatcher = vscode.workspace.createFileSystemWatcher('**/{.env,.env.local}');

    envWatcher.onDidChange((uri) => {
        logger.debug(`[Extension] Environment file changed: ${uri.fsPath}`);
        // ... handle changes
    });

    context.subscriptions.push(envWatcher);
    // Watcher lives until extension deactivates - not project-scoped!
}
```

**Impact:**
- **ENOTEMPTY errors** when deleting projects (watcher holds file handle)
- **EBUSY errors** when modifying .env files during operations
- **Memory waste** watching deleted project directories
- **Performance impact** on large workspaces (recursive watcher)

**Why This is Wrong:**
- Watcher should be scoped to project lifetime, not extension lifetime
- Deleting a project should dispose its watchers
- Global recursive watchers are expensive (VS Code official guidance recommends scoped watchers)

---

### 3. Terminal Processes Not Properly Tracked 🟠 High

**Current State:**
- Created in `startDemo.ts:144` via `baseCommand.ts:109-116`
- Fire-and-forget: `terminal.sendText()` returns immediately
- Disposal in `stopDemo.ts:77-81` calls `terminal.dispose()` but doesn't wait
- No registry tracking all created terminals
- Process may outlive terminal disposal

**Code Evidence:**

```typescript
// startDemo.ts:144-148
const terminal = this.createTerminal(terminalName);
terminal.show();
terminal.sendText(`cd "${frontendPath}"`);
terminal.sendText(`fnm use ${nodeVersion} && npm run dev`);
// Returns immediately! Process starts in background

// stopDemo.ts:77-81
vscode.window.terminals.forEach(terminal => {
    if (terminal.name === terminalName) {
        terminal.dispose();  // UI closes, but process continues?
    }
});
```

**Impact:**
- **Orphaned processes** consume CPU/memory after "stopped"
- **Port conflicts** when restarting (port still in use)
- **File handle locks** prevent project deletion
- **No cleanup verification** - can't confirm process actually stopped

---

### 4. Event Subscriptions Not Cleanup-Safe 🟠 High

**Current State:**
- `StateManager.ts:21-22` creates EventEmitter `_onProjectChanged`
- `ComponentTreeProvider.ts:25-27` subscribes to the event
- StateManager.dispose() (line 498) disposes emitter BUT doesn't unsubscribe listeners
- Listeners fire even after project deleted
- Potential memory leak if providers created/destroyed repeatedly

**Code Evidence:**

```typescript
// stateManager.ts:21-22, 498
export class StateManager {
    private _onProjectChanged = new vscode.EventEmitter<ProjectConfig | null>();
    readonly onProjectChanged = this._onProjectChanged.event;

    public dispose(): void {
        this._onProjectChanged.dispose();
        // Missing: No unsubscription of existing listeners
    }
}

// componentTreeProvider.ts:25-27
this.projectChangeSubscription = stateManager.onProjectChanged(() => {
    this.refresh();
});
// Subscription remains active even after stateManager disposed
```

**Impact:**
- **Memory leaks** - EventEmitters accumulate listeners
- **Stale listeners** fire after project deleted
- **Cascading UI updates** on deleted resources
- **Error-prone** - easy to forget manual cleanup

**Real-World Comparison:**
In VS Code core, one memory leak involved event listeners growing from 4 to 1,163 before proper disposal was implemented (PR #256887).

---

### 5. Async Command Pattern Creates Race Conditions 🟠 High

**Current State:**
- 3+ instances in `extension.ts` of `.then()` without await
- Operations continue in background after command returns
- Project deletion doesn't cancel pending operations

**Code Locations:**

```typescript
// extension.ts:508-510 - Fire and forget restart
vscode.commands.executeCommand('demoBuilder.stopDemo').then(() => {
    vscode.commands.executeCommand('demoBuilder.startDemo');
});
// Returns immediately while both commands execute async

// extension.ts:224-227 - Fire and forget dashboard
vscode.commands.executeCommand('demoBuilder.showProjectDashboard').then(
    () => logger.debug('[Extension] Project Dashboard opened successfully'),
    (err) => logger.error('[Extension] Failed to open Project Dashboard:', err),
);

// extension.ts:255-261 - Fire and forget welcome
vscode.commands.executeCommand('demoBuilder.showWelcome').then(...);

// extension.ts:274-282 - Background update check
setTimeout(() => {
    vscode.commands.executeCommand('demoBuilder.checkForUpdates').then(...);
}, 10000);
```

**Impact:**
- **Race conditions** - Project deletion while commands still running
- **File watcher conflicts** - Environment changes processed during deletion
- **State corruption** - State Manager loading state of deleted project
- **No cancellation** - Can't abort in-flight operations

---

### 6. Grace Period Anti-Pattern 🟡 Medium

**Current State:**
- `deleteProject.ts:29` - Hardcoded 1-second wait
- `stopDemo.ts:88` - Port check can take up to 10 seconds
- Race condition: deletion starts while processes still have file handles

**Code Evidence:**

```typescript
// deleteProject.ts:26-29
if (project.status === 'running') {
    await vscode.commands.executeCommand('demoBuilder.stopDemo');
    await new Promise(resolve => setTimeout(resolve, 1000));  // Hope this is enough?
}

// stopDemo.ts:88
await waitForPortToFree(port, 10000);  // Up to 10 seconds!
```

**The Race:**
1. `deleteProject` calls `stopDemo` command
2. `stopDemo` returns immediately (async work in `withProgress`)
3. `deleteProject` waits 1 second
4. Meanwhile, `stopDemo`'s port check is still running (0-10 seconds)
5. `deleteProject` attempts deletion while port may still be bound
6. Process still has file handles → ENOTEMPTY error

**Why Grace Periods Are Unreliable:**
- Timing varies by system load
- No verification that condition is actually met
- Either too short (failures) or too long (unnecessary delays)
- "Hope-based programming" - assumes without checking

---

### 7. Incomplete Webview Disposal 🟡 Medium

**Current State:**
- `BaseWebviewCommand.ts:345-380` - handlePanelDisposal() doesn't dispose communicationManager
- Pending requests might not be cleaned up
- Static panel maps cleared but references might persist

**Code Location:**

```typescript
// baseWebviewCommand.ts:345-380
private handlePanelDisposal(): void {
    const id = this.getPanelId();
    BaseWebviewCommand.panelsByCommand.delete(id);
    BaseWebviewCommand.panelsByViewType.delete(this.viewType);

    this.disposables.forEach(d => d.dispose());
    this.disposables = [];

    // BUT: communicationManager not disposed here!
    // Pending requests may not be cleaned up
}
```

**Impact:**
- **Memory leaks** - Pending requests not aborted
- **Stale references** - Static maps cleared but objects may persist
- **Resource waste** - WebviewCommunicationManager continues running

---

## Industry Best Practices

### Pattern 1: Workspace-Scoped Resource Management ⭐ Critical

**Source:** [VS Code API Documentation](https://code.visualstudio.com/api/references/vscode-api), Real-world examples (GitLens, Docker extension)

**What it is:**
Resources (watchers, processes, state) scoped to workspace folders with automatic disposal when workspace folders are removed.

**Implementation:**

```typescript
class WorkspaceResourceManager {
  private resourcesByWorkspace = new Map<string, vscode.Disposable[]>();

  constructor(context: vscode.ExtensionContext) {
    // Initialize for existing workspace folders
    vscode.workspace.workspaceFolders?.forEach(folder => {
      this.initializeWorkspace(folder);
    });

    // Handle workspace folder changes
    context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(e => {
        // Clean up removed folders
        e.removed.forEach(folder => {
          this.cleanupWorkspace(folder);
        });

        // Initialize new folders
        e.added.forEach(folder => {
          this.initializeWorkspace(folder);
        });
      })
    );
  }

  private initializeWorkspace(folder: vscode.WorkspaceFolder): void {
    const disposables: vscode.Disposable[] = [];
    const workspaceKey = folder.uri.fsPath;

    // Create workspace-scoped file watcher
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(folder, '**/*.env')
    );
    disposables.push(watcher);

    // Spawn workspace-scoped dev server
    const serverProcess = this.spawnDevServer(folder);
    disposables.push({
      dispose: () => serverProcess.kill()
    });

    this.resourcesByWorkspace.set(workspaceKey, disposables);
  }

  private cleanupWorkspace(folder: vscode.WorkspaceFolder): void {
    const workspaceKey = folder.uri.fsPath;
    const disposables = this.resourcesByWorkspace.get(workspaceKey);

    if (disposables) {
      disposables.forEach(d => d.dispose());
      this.resourcesByWorkspace.delete(workspaceKey);
    }
  }

  dispose(): void {
    // Clean up all workspaces
    this.resourcesByWorkspace.forEach(disposables => {
      disposables.forEach(d => d.dispose());
    });
    this.resourcesByWorkspace.clear();
  }
}
```

**Why it matters:**
- **Prevents file locks** - Watchers disposed before deletion
- **Proper multi-root support** - Each workspace independent
- **Clear ownership** - Resources tied to workspace lifetime
- **No manual tracking** - Automatic cleanup on folder removal

**Applicability to our codebase:**
Replace the global `.env` watcher in `extension.ts:313-521` with workspace-scoped watchers created/destroyed with workspace folders.

---

### Pattern 2: Event-Driven Process Completion ⭐ Critical

**Source:** [VS Code Task API](https://code.visualstudio.com/api/extension-guides/task-provider), [VS Code Extension Samples](https://github.com/microsoft/vscode-extension-samples)

**What it is:**
Use Task API with `onDidEndTask` for user-visible work, or child_process with exit events for background work. Never rely on grace periods.

**Implementation:**

```typescript
// Option A: Task API (recommended for user-visible work like dev servers)
async function startDevServer(): Promise<void> {
  const task = new vscode.Task(
    { type: 'shell' },
    vscode.TaskScope.Workspace,
    'Dev Server',
    'DemoBuilder',
    new vscode.ShellExecution('npm run dev')
  );

  return new Promise((resolve, reject) => {
    const disposable = vscode.tasks.onDidEndTask(e => {
      if (e.execution.task === task) {
        disposable.dispose();
        resolve();
      }
    });

    vscode.tasks.executeTask(task).then(
      execution => {
        // Task started successfully
      },
      error => {
        disposable.dispose();
        reject(error);
      }
    );
  });
}

// Option B: child_process for background work
import { spawn, ChildProcess } from 'child_process';

class ProcessManager {
  private processes = new Map<string, ChildProcess>();

  spawn(name: string, command: string, args: string[]): void {
    const process = spawn(command, args, {
      shell: true,
      detached: false // Keep attached to parent
    });

    this.processes.set(name, process);
  }

  async killProcess(name: string): Promise<void> {
    const process = this.processes.get(name);
    if (!process || process.killed) return;

    return new Promise((resolve) => {
      process.on('exit', () => {
        this.processes.delete(name);
        resolve();
      });

      if (os.platform() === 'win32') {
        // Windows: Kill process tree
        spawn('taskkill', ['/pid', process.pid!.toString(), '/f', '/t']);
      } else {
        // Unix: Send SIGTERM, then SIGKILL if needed
        process.kill('SIGTERM');

        setTimeout(() => {
          if (!process.killed) {
            process.kill('SIGKILL');
          }
        }, 5000); // 5 second grace period
      }
    });
  }

  async dispose(): Promise<void> {
    const killPromises = Array.from(this.processes.keys()).map(name =>
      this.killProcess(name)
    );
    await Promise.all(killPromises);
  }
}
```

**Why it matters:**
- **Eliminates race conditions** - Wait for actual process exit
- **Reliable cleanup** - Know when process actually stopped
- **Proper async coordination** - Commands return when work done
- **Cross-platform** - Handles Windows vs Unix differences

**Applicability to our codebase:**
Replace terminal fire-and-forget pattern in `startDemo.ts:144-148` and `stopDemo.ts:77-81`.

---

### Pattern 3: DisposableStore for Coordinated Cleanup ⭐ High Priority

**Source:** [VS Code Issue #74242](https://github.com/microsoft/vscode/issues/74242), VS Code internal pattern

**What it is:**
Composite disposable managing multiple disposables with proper LIFO disposal order, preventing double-disposal errors.

**Implementation:**

```typescript
class DisposableStore {
  private disposables: vscode.Disposable[] = [];
  private isDisposed = false;

  add<T extends vscode.Disposable>(disposable: T): T {
    if (this.isDisposed) {
      disposable.dispose(); // Dispose immediately if already disposed
      return disposable;
    }
    this.disposables.push(disposable);
    return disposable;
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    // Dispose in reverse order (LIFO)
    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }
  }
}

// Usage in feature managers
class FeatureManager {
  private disposables = new DisposableStore();

  register(context: vscode.ExtensionContext) {
    this.disposables.add(
      vscode.commands.registerCommand('feature.action', () => {})
    );
    this.disposables.add(
      vscode.workspace.createFileSystemWatcher('**/*.config')
    );

    context.subscriptions.push(this.disposables);
  }
}
```

**Why it matters:**
- **Prevents double-disposal** - Safe against disposing items twice
- **Proper ordering** - LIFO ensures dependent resources disposed first
- **Safe against late additions** - Items added after disposal are immediately disposed
- **Production-ready** - Used internally by VS Code

**Applicability to our codebase:**
Use in all feature managers, commands, and providers to coordinate cleanup.

---

### Pattern 4: Dispose File Watchers Before File Operations ⭐ Critical

**Source:** [VS Code File Watcher Issues Wiki](https://github.com/microsoft/vscode/wiki/File-Watcher-Issues)

**What it is:**
Always dispose file watchers before deleting/moving files, with small delay for OS-level handle release and retry logic for EBUSY/ENOTEMPTY errors.

**Implementation:**

```typescript
async function deleteProjectFolder(projectPath: string): Promise<void> {
  // 1. Dispose all watchers first
  const watchers = this.watcherRegistry.get(projectPath);
  if (watchers) {
    watchers.forEach(w => w.dispose());
    this.watcherRegistry.delete(projectPath);
  }

  // 2. Wait for OS to release file handles
  await new Promise(resolve => setTimeout(resolve, 100));

  // 3. Attempt deletion with exponential backoff retry
  const maxRetries = 5;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await vscode.workspace.fs.delete(
        vscode.Uri.file(projectPath),
        { recursive: true, useTrash: false }
      );
      return; // Success!
    } catch (error) {
      if (error.code === 'EBUSY' || error.code === 'ENOTEMPTY') {
        if (attempt === maxRetries - 1) {
          throw error; // Last attempt failed
        }
        // Exponential backoff: 100ms, 200ms, 400ms, 800ms, 1600ms
        const delay = 100 * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error; // Different error, fail immediately
      }
    }
  }
}
```

**Why it matters:**
- **Eliminates ENOTEMPTY errors** - Root cause addressed
- **Reliable file operations** - Proven pattern
- **Graceful degradation** - Retries handle transient failures
- **Official guidance** - Documented by VS Code team

**Applicability to our codebase:**
Direct application to `deleteProject.ts:39` and `componentUpdater.ts:62, 94`.

---

### Pattern 5: Proper Async Command Coordination

**Source:** [Stack Overflow: VS Code extension wait for command completion](https://stackoverflow.com/questions/51627195/visual-studio-code-extension-wait-for-command-completion)

**What it is:**
Commands must return Promises that resolve only after all async work completes.

**Implementation:**

```typescript
// WRONG: Progress disappears immediately
vscode.window.withProgress({
  location: vscode.ProgressLocation.Notification,
  title: "Deploying..."
}, async (progress) => {
  deploySteps.map(async (step) => {
    await executeStep(step);
    progress.report({ increment: 33 });
  });
  // Missing return statement - function returns immediately!
});

// RIGHT: Progress waits for all work to complete
await vscode.window.withProgress({
  location: vscode.ProgressLocation.Notification,
  title: "Deploying..."
}, async (progress) => {
  // Use Promise.all for concurrent operations
  await Promise.all(
    deploySteps.map(async (step) => {
      await executeStep(step);
      progress.report({ increment: 33 });
    })
  );
});

vscode.window.showInformationMessage('Deployment complete!');
```

**Why it matters:**
- **Proper cleanup timing** - Guarantees work done before command returns
- **Prevents race conditions** - No parallel operations on same resources
- **Accurate progress** - Progress indicator reflects actual work

**Applicability to our codebase:**
Fix fire-and-forget patterns in `extension.ts:508-510, 224-227, 255-261, 274-282`.

---

## Recommended Tools

### 1. tree-kill (npm package)

**Purpose:** Cross-platform process tree termination

**Why recommended:**
- Handles platform-specific differences transparently
- Kills entire process tree, not just parent
- Supports graceful shutdown with signal options
- Battle-tested: 10M+ weekly downloads

**Installation:**
```bash
npm install tree-kill
```

**Usage:**
```typescript
import kill from 'tree-kill';
import { spawn } from 'child_process';

class DevServerManager {
  private serverProcess: ChildProcess | null = null;

  start(): void {
    this.serverProcess = spawn('npm', ['run', 'dev'], {
      shell: true,
      detached: false
    });
  }

  async stop(): Promise<void> {
    if (!this.serverProcess) return;

    return new Promise((resolve, reject) => {
      const pid = this.serverProcess!.pid!;

      // Kill process tree with SIGTERM
      kill(pid, 'SIGTERM', (err) => {
        if (err) {
          // Fallback to SIGKILL if graceful shutdown fails
          kill(pid, 'SIGKILL', () => {
            resolve(); // Always resolve, even if kill fails
          });
        } else {
          resolve();
        }
      });
    });
  }
}
```

**Applicability:** Replace terminal disposal pattern in `stopDemo.ts`.

---

### 2. execa (npm package)

**Purpose:** Better child process execution with improved error handling and Promise-based API

**Why recommended:**
- Promise-based API (better than callbacks)
- Better error messages with command context
- Automatic child process cleanup
- Built-in timeout support
- 40M+ weekly downloads

**Installation:**
```bash
npm install execa
```

**Usage:**
```typescript
import { execa } from 'execa';
import * as vscode from 'vscode';

class CommandRunner {
  private currentProcess: ReturnType<typeof execa> | null = null;

  async run(command: string, args: string[]): Promise<string> {
    try {
      this.currentProcess = execa(command, args, {
        timeout: 30000, // 30 second timeout
        cwd: vscode.workspace.workspaceFolders?.[0].uri.fsPath,
        reject: false // Don't throw on non-zero exit
      });

      const result = await this.currentProcess;

      if (result.exitCode !== 0) {
        throw new Error(`Command failed: ${result.stderr}`);
      }

      return result.stdout;
    } finally {
      this.currentProcess = null;
    }
  }

  async cancel(): Promise<void> {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGTERM', {
        forceKillAfterTimeout: 5000 // SIGKILL after 5s
      });
    }
  }

  dispose(): void {
    this.cancel();
  }
}
```

**Applicability:** Use for CLI commands in `CommandExecutor` or as alternative to terminal execution.

---

## Gap Analysis

### What We're Doing Well ✅

1. **context.subscriptions usage** - Most resources properly registered (extension.ts:100, 147-171, 521)
2. **deactivate() implementation** - Exists and disposes services (extension.ts:295-309)
3. **EventEmitter disposal** - StateManager properly disposes emitter (stateManager.ts:498)
4. **Webview disposal** - handlePanelDisposal cleans up most resources (baseWebviewCommand.ts:345-380)
5. **Error handling** - Commands generally have try-catch blocks
6. **Logging** - Comprehensive logging for debugging

### Critical Gaps 🔴

| What's Missing | Current Impact | Industry Solution | Affected Files |
|----------------|----------------|-------------------|----------------|
| **Workspace-scoped file watchers** | Global watcher locks deleted project files | RelativePattern per workspace folder | extension.ts:313-521 |
| **Process completion detection** | Race conditions, grace period failures | Task API with onDidEndTask | startDemo.ts:144-148, stopDemo.ts:77-81 |
| **Centralized disposal coordinator** | No cleanup coordination, resource leaks | DisposableStore pattern | extension.ts:295-309, deleteProject.ts |
| **File watcher disposal before operations** | ENOTEMPTY errors on deletion | Dispose → wait 100ms → delete | deleteProject.ts:39 |
| **Event-driven cleanup** | Unreliable timing, arbitrary waits | Poll for actual conditions | deleteProject.ts:29 |
| **Async command coordination** | Race conditions, fire-and-forget | Proper await chains | extension.ts:508, 224, 255 |
| **EventEmitter listener cleanup** | Memory leaks, stale listeners | Auto-cleanup on dispose | stateManager.ts:498 |

### Architectural Debt Summary

**Files Requiring Changes:** 15+
- `extension.ts` - Global watcher lifecycle, async command patterns
- `deleteProject.ts` - Incomplete cleanup, grace period
- `stopDemo.ts` - Terminal disposal without verification
- `startDemo.ts` - Fire-and-forget terminal creation
- `baseWebviewCommand.ts` - Incomplete communicationManager disposal
- `stateManager.ts` - EventEmitter cleanup
- `componentTreeProvider.ts` - Subscription management
- `resetAll.ts` - Manual disposal coordination
- `componentUpdater.ts` - Same deletion pattern issues
- 6+ other command files - Async patterns

**Impact Assessment:**
- 🔴 **Critical:** Project deletion failures (ENOTEMPTY errors) - **Blocks users**
- 🔴 **Critical:** File watcher locks prevent operations - **Intermittent failures**
- 🟠 **High:** Process leaks consume memory - **Performance degradation**
- 🟠 **High:** Event listener accumulation - **Memory leaks over time**
- 🟡 **Medium:** Webview resource leaks - **Minor memory waste**
- 🟡 **Medium:** Grace period unreliability - **Timing bugs on slower systems**

---

## Implementation Roadmap

### Phase 1: Immediate Fix (2-4 hours) - Stop the Bleeding

**Goal:** Fix project deletion bug without major refactoring

**Tasks:**

1. **Add Retry Logic to deleteProject.ts** (1 hour)
   ```typescript
   // Replace line 39
   async function deleteWithRetry(path: string): Promise<void> {
     const maxRetries = 5;
     for (let i = 0; i < maxRetries; i++) {
       try {
         await fs.rm(path, { recursive: true, force: true });
         return;
       } catch (error) {
         if (error.code === 'ENOTEMPTY' || error.code === 'EBUSY') {
           if (i === maxRetries - 1) throw error;
           await new Promise(r => setTimeout(r, 100 * Math.pow(2, i)));
         } else {
           throw error;
         }
       }
     }
   }
   ```

2. **Dispose File Watcher Before Deletion** (1-2 hours)
   ```typescript
   // In extension.ts, maintain watcher registry
   const watchersByProject = new Map<string, vscode.FileSystemWatcher>();

   // Before deletion in deleteProject.ts
   const watcher = watchersByProject.get(projectPath);
   if (watcher) {
     watcher.dispose();
     watchersByProject.delete(projectPath);
     await new Promise(r => setTimeout(r, 100));
   }
   ```

3. **Testing** (1 hour)
   - Test deletion with demo running
   - Test deletion with .env watcher active
   - Test on macOS (primary platform)
   - Verify no ENOTEMPTY errors

**Deliverable:** Project deletion works reliably

---

### Phase 2: Core Infrastructure (Week 1) - Foundation

**Goal:** Build reusable infrastructure for proper resource management

**Tasks:**

1. **Create DisposableStore** (2-3 hours)
   - File: `src/core/utils/disposableStore.ts`
   - Implement add(), dispose(), isDisposed flag
   - Add unit tests
   - Documentation

2. **Create WorkspaceResourceManager** (4-6 hours)
   - File: `src/core/utils/workspaceResourceManager.ts`
   - Implement workspace-scoped resource tracking
   - Handle onDidChangeWorkspaceFolders events
   - Migrate `.env` watcher to workspace-scoped
   - Add unit tests

3. **Create ProcessLifecycleManager** (6-8 hours)
   - File: `src/core/shell/processLifecycleManager.ts`
   - Implement process registry with event-driven cleanup
   - Support both Task API and child_process patterns
   - Platform-specific process termination
   - Add integration tests

4. **Install Dependencies** (0.5 hours)
   ```bash
   npm install tree-kill execa
   npm install -D @types/tree-kill
   ```

**Deliverable:** Reusable infrastructure ready for migration

---

### Phase 3: Migration (Week 2-3) - Replace Anti-Patterns

**Goal:** Migrate existing code to new patterns

**Week 2 Focus: File Watchers & Disposal**

1. **Migrate File Watchers** (6-8 hours)
   - Replace global `.env` watcher with WorkspaceResourceManager
   - Update all file watcher creation to use DisposableStore
   - Ensure disposal before file operations
   - Test file deletion scenarios

2. **Migrate Event Subscriptions** (4-6 hours)
   - Update StateManager to properly dispose listeners
   - Update ComponentTreeProvider subscription management
   - Add automatic cleanup when EventEmitter disposed

3. **Fix Webview Disposal** (2-3 hours)
   - Add communicationManager.dispose() to handlePanelDisposal
   - Use DisposableStore for webview resources
   - Test webview cleanup

**Week 3 Focus: Process Management & Commands**

4. **Migrate Process Management** (8-10 hours)
   - Replace terminal fire-and-forget with ProcessLifecycleManager
   - Update startDemo to use Task API or managed child_process
   - Update stopDemo to wait for actual process exit
   - Remove grace period anti-pattern
   - Test start/stop/restart flows

5. **Fix Async Command Patterns** (4-6 hours)
   - Replace `.then()` with `await` in extension.ts
   - Ensure commands return when work completes
   - Add proper progress indication
   - Test command coordination

6. **Update Other Deletion Operations** (2-3 hours)
   - Apply same pattern to resetAll.ts
   - Apply same pattern to componentUpdater.ts
   - Consistent error handling

**Deliverable:** All anti-patterns replaced with proven patterns

---

### Phase 4: Testing & Documentation (Week 4) - Verification

**Goal:** Comprehensive testing and documentation

**Tasks:**

1. **Integration Tests** (8-10 hours)
   - Test project lifecycle (create → run → stop → delete)
   - Test workspace folder add/remove
   - Test multi-root workspaces
   - Test process cleanup verification
   - Test file watcher cleanup
   - Test error scenarios (locked files, running processes)

2. **Performance Testing** (2-3 hours)
   - Memory leak testing (create/delete 100 projects)
   - EventEmitter listener count verification
   - Process cleanup timing measurements
   - File watcher resource usage

3. **Documentation** (4-6 hours)
   - Update CLAUDE.md with new patterns
   - Document DisposableStore usage
   - Document WorkspaceResourceManager usage
   - Document ProcessLifecycleManager usage
   - Add troubleshooting guide

4. **Code Review & Cleanup** (2-3 hours)
   - Remove obsolete code
   - Update comments
   - Consistency check
   - Final testing

**Deliverable:** Production-ready, fully tested, well-documented system

---

### Timeline Summary

| Phase | Duration | Focus | Deliverable |
|-------|----------|-------|-------------|
| Phase 1 | 2-4 hours | Immediate fix | Project deletion works |
| Phase 2 | Week 1 | Infrastructure | Reusable components |
| Phase 3 | Week 2-3 | Migration | Anti-patterns eliminated |
| Phase 4 | Week 4 | Testing | Production-ready |
| **Total** | **3-4 weeks** | **Complete solution** | **Robust resource management** |

---

## Success Criteria

### Phase 1 Success
- ✅ Project deletion succeeds without ENOTEMPTY errors
- ✅ Works with demo running
- ✅ Works with file watcher active
- ✅ Tested on macOS

### Final Success
- ✅ All resources properly scoped to workspace lifetime
- ✅ No file watcher locks prevent operations
- ✅ No orphaned processes after operations
- ✅ No memory leaks (EventEmitters, listeners)
- ✅ No grace period anti-patterns
- ✅ All async commands properly coordinated
- ✅ Comprehensive test coverage
- ✅ Well-documented patterns

---

## Key Takeaways

1. **This is an architectural issue, not a simple bug**
   - 7 major code smells across 15+ files
   - Missing established VS Code patterns
   - Systemic rather than localized problem

2. **Industry has already solved this**
   - DisposableStore (VS Code internal pattern)
   - Workspace-scoped resources (Remote Development extension)
   - Event-driven process completion (Task API)
   - File watcher disposal guidance (official docs)

3. **The gap is significant**
   - Global watchers instead of workspace-scoped
   - Fire-and-forget instead of event-driven
   - Grace periods instead of condition polling
   - Manual coordination instead of DisposableStore

4. **Immediate fix is straightforward**
   - Retry logic (2 hours)
   - File watcher disposal (2 hours)
   - Addresses immediate pain point

5. **Long-term solution requires architectural changes**
   - 3-4 weeks for complete refactoring
   - Reusable infrastructure benefits all features
   - Production-ready patterns from VS Code ecosystem

6. **This affects multiple features**
   - Project deletion (ENOTEMPTY errors)
   - Component updates (same pattern)
   - Reset all (manual coordination)
   - File operations (watcher locks)
   - Process management (all features)

7. **Proven tools available**
   - **tree-kill** - 10M+ weekly downloads
   - **execa** - 40M+ weekly downloads
   - Both battle-tested, production-ready

8. **Testing is critical**
   - Memory leak verification
   - Process cleanup verification
   - Multi-workspace scenarios
   - Error condition handling

---

## Appendix: Complete Source List

### Official VS Code Documentation

1. [VS Code API Reference](https://code.visualstudio.com/api/references/vscode-api) - 2024
2. [Patterns and Principles - vscode-docs](https://vscode-docs.readthedocs.io/en/stable/extensions/patterns-and-principles/) - 2024
3. [Extension Anatomy](https://code.visualstudio.com/api/get-started/extension-anatomy) - 2024
4. [Testing Extensions](https://code.visualstudio.com/api/working-with-extensions/testing-extension) - 2024
5. [Extension API Guidelines](https://github.com/microsoft/vscode/wiki/Extension-API-guidelines) - 2024
6. [File Watcher Issues Wiki](https://github.com/microsoft/vscode/wiki/File-Watcher-Issues) - 2024
7. [File Watcher Internals](https://github.com/microsoft/vscode/wiki/File-Watcher-Internals) - 2024
8. [Task Provider Documentation](https://code.visualstudio.com/api/extension-guides/task-provider) - 2024
9. [Testing API](https://code.visualstudio.com/api/extension-guides/testing) - 2024

### Microsoft Extension Samples

10. [vscode-extension-samples GitHub Repository](https://github.com/microsoft/vscode-extension-samples) - 2024
11. [Tree View Sample](https://github.com/microsoft/vscode-extension-samples/tree/main/tree-view-sample) - 2024
12. [Progress Sample](https://github.com/microsoft/vscode-extension-samples/tree/main/progress-sample) - 2024
13. [Configuration Sample](https://github.com/microsoft/vscode-extension-samples/blob/main/configuration-sample/src/extension.ts) - 2024

### GitHub Issues and Discussions

14. [Issue #11895: Deactivating extensions cleanup time](https://github.com/microsoft/vscode/issues/11895) - 2016
15. [Issue #74242: Add DisposableStore](https://github.com/microsoft/vscode/issues/74242) - 2019
16. [Issue #74250: Review IDisposable[] usage](https://github.com/microsoft/vscode/issues/74250) - 2019
17. [Issue #128418: VS Code Locks Files](https://github.com/microsoft/vscode/issues/128418) - 2021
18. [Issue #81224: VS Code Locks files](https://github.com/microsoft/vscode/issues/81224) - 2019
19. [Issue #142462: File writes hang when locks not cleared](https://github.com/microsoft/vscode/issues/142462) - 2021
20. [Issue #207158: Terminal Command Completion Callback](https://github.com/microsoft/vscode/issues/207158) - 2024
21. [Issue #26852: FileSystemWatcher API discussion](https://github.com/Microsoft/vscode/issues/26852) - 2017
22. [PR #82881: Fix async race condition in tree](https://github.com/microsoft/vscode/pull/82881) - 2019
23. [PR #256887: Fix memory leak - event listeners](https://github.com/microsoft/vscode/pull/256887) - 2024
24. [Issue #198977: Memory leak in extensionList](https://github.com/microsoft/vscode/issues/198977) - 2023

### Stack Overflow

25. [Purpose for subscribing a command](https://stackoverflow.com/questions/55554018/purpose-for-subscribing-a-command-in-vscode-extension) - 2019
26. [VS Code deactivate function](https://stackoverflow.com/questions/50729017/vs-code-extensions-api-undocumented-function-exports-deactivate) - 2018
27. [Kill child process for VS Code Extension](https://stackoverflow.com/questions/62181416/recommend-way-to-kill-child-process-for-vs-code-extension) - 2020
28. [VS Code extension wait for command completion](https://stackoverflow.com/questions/51627195/visual-studio-code-extension-wait-for-command-completion) - 2018
29. [withProgress async code](https://stackoverflow.com/questions/58763318/how-to-write-async-code-promises-with-vscode-api-withprogress) - 2019
30. [Using FileSystemWatcher in TypeScript](https://stackoverflow.com/questions/34230714/using-filesystemwatcher-in-typescript-visual-studio-code-extension) - 2015
31. [File is locked by VS Code](https://stackoverflow.com/questions/55774005/file-is-locked-by-vs-code-visual-studio-code) - 2019
32. [How to await a build task](https://stackoverflow.com/questions/61428928/how-to-await-a-build-task-in-a-vs-code-extension) - 2020

### Community Blogs and Articles

33. [Blog: Visual Studio Code Progress Cancelled by Async Task](https://johnwargo.com/posts/2023/vscode-extension-progress/) - 2023
34. [Blog: Cancel Progress Programmatically](https://www.eliostruyf.com/cancel-progress-programmatically-visual-studio-code-extensions/) - 2020
35. [DEV.to: VSCode Event System - Emitters to Disposables](https://dev.to/ryankolter/vscode-3-event-system-from-emitters-to-disposables-3292) - 2020
36. [ISE Developer Blog: Testing VSCode Extensions](https://devblogs.microsoft.com/ise/testing-vscode-extensions-with-typescript/) - 2020

### Real-World Extension Repositories

37. [GitLens GitHub Repository](https://github.com/gitkraken/vscode-gitlens) - 2024
38. [Microsoft vscode-docker](https://github.com/microsoft/vscode-docker) - 2024
39. [Python Extension Issue #3331](https://github.com/microsoft/vscode-python/issues/3331) - 2018

### Academic Sources

40. [arXiv: Protect Your Secrets - VSCode Extensions](https://arxiv.org/html/2412.00707v1) - 2024

### VS Code Marketplace

41. [Workspace Storage Cleanup Extension](https://marketplace.visualstudio.com/items?itemName=mehyaa.workspace-storage-cleanup) - 2024

### npm Packages

42. [npm: tree-kill](https://www.npmjs.com/package/tree-kill)
43. [npm: chokidar](https://www.npmjs.com/package/chokidar)
44. [npm: execa](https://www.npmjs.com/package/execa)

---

**End of Report**
