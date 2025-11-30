/**
 * WorkspaceWatcherManager manages file watchers scoped to workspace folders
 *
 * Pattern: Workspace-scoped resource management (from research)
 * Replaces: Global file watchers with workspace-scoped automatic cleanup
 *
 * Features:
 * - Auto-create watchers when workspace folders added
 * - Auto-dispose watchers when workspace folders removed
 * - Prevent duplicate watchers (same folder + pattern)
 * - Track watchers by workspace folder for scoped disposal
 * - LIFO disposal via DisposableStore
 *
 * @example
 * ```typescript
 * const manager = new WorkspaceWatcherManager();
 *
 * // Listen to workspace changes
 * vscode.workspace.onDidChangeWorkspaceFolders(event => {
 *   event.added.forEach(folder => {
 *     manager.createWatcher(folder, '**\/.env');
 *   });
 *   event.removed.forEach(folder => {
 *     manager.removeWatchersForFolder(folder);
 *   });
 * });
 *
 * // Cleanup on extension deactivation
 * context.subscriptions.push(manager);
 * ```
 */

import * as vscode from 'vscode';
import { DisposableStore } from '@/core/utils/disposableStore';
import { getLogger, DebugLogger } from '@/core/logging';

// Lazy-initialized logger to avoid calling getLogger() before initializeLogger()
let _logger: DebugLogger | null = null;
function getLoggerLazy(): DebugLogger {
    if (!_logger) {
        _logger = getLogger();
    }
    return _logger;
}

/**
 * WorkspaceWatcherManager manages file watchers scoped to workspace folders
 *
 * **Usage Pattern:**
 * 1. Create manager instance (typically singleton)
 * 2. Create watchers for workspace folders
 * 3. Register event listeners (onCreate, onChange, onDelete)
 * 4. Remove watchers when folders removed
 * 5. Dispose manager on extension deactivation
 *
 * **Key Features:**
 * - Prevents duplicate watchers (same folder + pattern)
 * - Workspace-scoped disposal (remove folder = dispose watchers)
 * - LIFO disposal order via DisposableStore
 * - Safe late additions (items added after disposal are rejected)
 *
 * @example Basic Usage
 * ```typescript
 * const manager = new WorkspaceWatcherManager();
 *
 * // Create watcher for .env files
 * const folder = vscode.workspace.workspaceFolders[0];
 * const watcher = manager.createWatcher(folder, '**\/.env');
 *
 * // Listen for file changes
 * watcher.onDidChange(uri => {
 *   console.log('File changed:', uri.fsPath);
 * });
 * ```
 *
 * @example Workspace Change Integration
 * ```typescript
 * const manager = new WorkspaceWatcherManager();
 *
 * vscode.workspace.onDidChangeWorkspaceFolders(event => {
 *   // Add watchers for new folders
 *   event.added.forEach(folder => {
 *     manager.createWatcher(folder, '**\/.env');
 *   });
 *
 *   // Remove watchers for removed folders
 *   event.removed.forEach(folder => {
 *     manager.removeWatchersForFolder(folder);
 *   });
 * });
 * ```
 */
export class WorkspaceWatcherManager implements vscode.Disposable {
    private readonly disposables = new DisposableStore();
    private readonly watchers = new Map<string, vscode.FileSystemWatcher>();
    private disposed = false;

    /**
     * Create file watcher for workspace folder with given pattern
     *
     * @param workspaceFolder Workspace folder to watch
     * @param pattern Glob pattern for files to watch (e.g., "**\/.env")
     * @returns FileSystemWatcher instance (or existing if duplicate)
     *
     * @throws Error if manager already disposed
     */
    public createWatcher(
        workspaceFolder: vscode.WorkspaceFolder,
        pattern: string
    ): vscode.FileSystemWatcher {
        if (this.disposed) {
            throw new Error('WorkspaceWatcherManager is disposed, cannot create watchers');
        }

        // Create composite key: folder URI + pattern
        const key = this.getWatcherKey(workspaceFolder, pattern);

        // Return existing watcher if already created
        if (this.watchers.has(key)) {
            getLoggerLazy().warn(
                `[WorkspaceWatcherManager] Watcher already exists for ${workspaceFolder.name} with pattern ${pattern}`
            );
            return this.watchers.get(key)!;
        }

        // Create new watcher
        getLoggerLazy().debug(
            `[WorkspaceWatcherManager] Creating watcher for ${workspaceFolder.name} with pattern ${pattern}`
        );

        const watcher = vscode.workspace.createFileSystemWatcher(pattern);

        // Track watcher for disposal
        this.watchers.set(key, watcher);
        this.disposables.add(watcher);

        return watcher;
    }

    /**
     * Register an existing file watcher for workspace folder
     *
     * Alternative to createWatcher() for pre-created watchers.
     * Useful when caller needs to configure watcher before registration.
     *
     * @param workspaceFolder Workspace folder that watcher belongs to
     * @param watcher Pre-created FileSystemWatcher instance
     * @param identifier Optional identifier for diagnostics (e.g., "env-watcher")
     *
     * @throws Error if manager already disposed
     *
     * @example
     * ```typescript
     * const watcher = vscode.workspace.createFileSystemWatcher(pattern);
     * watcher.onDidChange(handler);
     * manager.registerWatcher(folder, watcher, 'my-watcher');
     * ```
     */
    public registerWatcher(
        workspaceFolder: vscode.WorkspaceFolder,
        watcher: vscode.FileSystemWatcher,
        identifier?: string
    ): void {
        if (this.disposed) {
            throw new Error('WorkspaceWatcherManager is disposed, cannot register watchers');
        }

        // Create composite key: folder URI + identifier (or timestamp)
        const key = identifier
            ? `${workspaceFolder.uri.toString()}::${identifier}`
            : `${workspaceFolder.uri.toString()}::${Date.now()}`;

        // Warn if duplicate key
        if (this.watchers.has(key)) {
            getLoggerLazy().warn(
                `[WorkspaceWatcherManager] Watcher already exists with key ${key}, replacing`
            );
            const existingWatcher = this.watchers.get(key);
            existingWatcher?.dispose();
        }

        getLoggerLazy().debug(
            `[WorkspaceWatcherManager] Registering watcher for ${workspaceFolder.name} with key ${key}`
        );

        // Track watcher for disposal
        this.watchers.set(key, watcher);
        this.disposables.add(watcher);
    }

    /**
     * Remove all watchers for specific workspace folder
     *
     * @param workspaceFolder Workspace folder to remove watchers for
     */
    public removeWatchersForFolder(workspaceFolder: vscode.WorkspaceFolder): void {
        const folderUri = workspaceFolder.uri.toString();

        getLoggerLazy().debug(`[WorkspaceWatcherManager] Removing watchers for ${workspaceFolder.name}`);

        // Find all watchers for this folder
        const keysToRemove: string[] = [];
        for (const [key, watcher] of this.watchers.entries()) {
            if (key.startsWith(folderUri)) {
                watcher.dispose();
                keysToRemove.push(key);
            }
        }

        // Remove from map
        keysToRemove.forEach(key => this.watchers.delete(key));

        getLoggerLazy().info(
            `[WorkspaceWatcherManager] Removed ${keysToRemove.length} watchers for ${workspaceFolder.name}`
        );
    }

    /**
     * Get composite key for watcher (folder URI + pattern)
     *
     * @param workspaceFolder Workspace folder
     * @param pattern Glob pattern
     * @returns Composite key (URI::pattern)
     */
    private getWatcherKey(workspaceFolder: vscode.WorkspaceFolder, pattern: string): string {
        return `${workspaceFolder.uri.toString()}::${pattern}`;
    }

    /**
     * Get count of active watchers
     *
     * Useful for diagnostics and testing
     *
     * @returns Number of active watchers
     *
     * @example
     * ```typescript
     * const count = manager.getWatcherCount();
     * console.log(`Active watchers: ${count}`);
     * ```
     */
    public getWatcherCount(): number {
        return this.watchers.size;
    }

    /**
     * Get all watchers for specific workspace folder
     *
     * Useful for debugging and diagnostics
     *
     * @param workspaceFolder Workspace folder
     * @returns Array of FileSystemWatchers for this folder
     *
     * @example
     * ```typescript
     * const watchers = manager.getWatchersForFolder(folder);
     * console.log(`Folder has ${watchers.length} watchers`);
     * ```
     */
    public getWatchersForFolder(workspaceFolder: vscode.WorkspaceFolder): vscode.FileSystemWatcher[] {
        const folderUri = workspaceFolder.uri.toString();
        const result: vscode.FileSystemWatcher[] = [];

        for (const [key, watcher] of this.watchers.entries()) {
            if (key.startsWith(folderUri)) {
                result.push(watcher);
            }
        }

        return result;
    }

    /**
     * Dispose all watchers
     *
     * Safe to call multiple times (idempotent)
     * Disposes all watchers in LIFO order via DisposableStore
     *
     * @example
     * ```typescript
     * // Cleanup on extension deactivation
     * context.subscriptions.push(manager);
     * // OR
     * manager.dispose();
     * ```
     */
    public dispose(): void {
        if (this.disposed) {
            return;
        }

        getLoggerLazy().debug('[WorkspaceWatcherManager] Disposing all watchers');

        this.disposables.dispose();
        this.watchers.clear();
        this.disposed = true;

        getLoggerLazy().info('[WorkspaceWatcherManager] Disposed');
    }
}
