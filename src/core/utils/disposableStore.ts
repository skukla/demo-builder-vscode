/**
 * DisposableStore manages multiple disposables with proper LIFO disposal ordering
 *
 * Pattern from VS Code internal implementation (Issue #74242)
 * See: https://github.com/microsoft/vscode/issues/74242
 *
 * Features:
 * - LIFO disposal (Last In, First Out) ensures child resources disposed before parents
 * - Idempotent: Safe to call dispose() multiple times
 * - Error resilient: Continues disposing remaining items if one throws
 * - Late additions: Items added after disposal are immediately disposed
 *
 * Use Cases:
 * - Base command disposal coordination (BaseCommand, BaseWebviewCommand)
 * - Feature-specific resource cleanup (file watchers, event listeners)
 * - Workspace-scoped resource management
 *
 * @example Basic Usage
 * ```typescript
 * const disposables = new DisposableStore();
 *
 * // Add resources
 * const watcher = disposables.add(vscode.workspace.createFileSystemWatcher('**\/*.env'));
 * const subscription = disposables.add(stateManager.onProjectChanged(() => {...}));
 *
 * // Dispose all (LIFO order)
 * disposables.dispose();
 * ```
 *
 * @example Command Usage
 * ```typescript
 * class MyCommand extends BaseCommand {
 *   protected disposables = new DisposableStore();
 *
 *   async execute() {
 *     const watcher = this.disposables.add(createWatcher());
 *     await this.doWork();
 *     this.disposables.dispose();
 *   }
 * }
 * ```
 */

import * as vscode from 'vscode';
import { getLogger } from '@/core/logging';

export class DisposableStore implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];
    private isDisposed = false;

    /**
     * Add a disposable to the store
     *
     * If store already disposed, immediately disposes the item
     *
     * @param disposable Item to add
     * @returns Same disposable (for chaining convenience)
     *
     * @example
     * ```typescript
     * const watcher = disposables.add(vscode.workspace.createFileSystemWatcher('**\/*.ts'));
     * watcher.onDidChange(() => {...}); // Use returned reference
     * ```
     */
    public add<T extends vscode.Disposable>(disposable: T): T {
        if (this.isDisposed) {
            // Late addition - dispose immediately (silent, this is expected behavior)
            disposable.dispose();
            return disposable;
        }

        this.disposables.push(disposable);
        return disposable;
    }

    /**
     * Dispose all managed disposables in LIFO order
     *
     * Safe to call multiple times (idempotent)
     * Continues disposing remaining items if one throws
     *
     * @example
     * ```typescript
     * const disposables = new DisposableStore();
     * disposables.add(resourceA);
     * disposables.add(resourceB);
     * disposables.dispose(); // Disposes B then A (LIFO)
     * disposables.dispose(); // Safe no-op
     * ```
     */
    public dispose(): void {
        if (this.isDisposed) {
            return;  // Already disposed, no-op (expected for idempotent disposal)
        }

        this.isDisposed = true;

        // Dispose in reverse order (LIFO: Last In, First Out)
        // Ensures child resources disposed before parents
        while (this.disposables.length > 0) {
            const disposable = this.disposables.pop();

            if (disposable) {
                try {
                    disposable.dispose();
                } catch (error) {
                    // Log error but continue disposing remaining items
                    // This ensures partial disposal doesn't block complete cleanup
                    getLogger().error('[DisposableStore] Error during disposal:', error as Error);
                }
            }
        }
        // Disposal complete - silent success (internal implementation detail)
    }

    /**
     * Check if store has been disposed
     *
     * @returns true if dispose() has been called
     */
    public get disposed(): boolean {
        return this.isDisposed;
    }

    /**
     * Get count of managed disposables
     *
     * Useful for debugging and testing
     *
     * @returns Number of disposables currently managed
     */
    public get count(): number {
        return this.disposables.length;
    }

    /**
     * Reset the store for reuse after disposal
     *
     * Required for singleton command instances that may be executed multiple times.
     * Clears disposed state so new disposables can be added.
     *
     * NOTE: Does NOT dispose existing items - call dispose() first if needed.
     *
     * @example
     * ```typescript
     * // In a reusable command
     * async execute() {
     *   this.disposables.reset(); // Allow new disposables after previous dispose
     *   const panel = this.disposables.add(createPanel());
     * }
     * ```
     */
    public reset(): void {
        this.isDisposed = false;
        this.disposables = [];
    }
}
