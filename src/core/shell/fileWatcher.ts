import * as vscode from 'vscode';
import { getLogger } from '@/core/logging';
import { PollingService } from './pollingService';

/**
 * Manages file system change detection
 * Provides smart waiting for file changes with timeout support
 */
export class FileWatcher {
    private logger = getLogger();
    private watchers = new Map<string, vscode.FileSystemWatcher>();
    private pollingService: PollingService;

    constructor() {
        this.pollingService = new PollingService();
    }

    /**
     * Wait for a file system change with smart detection
     */
    async waitForFileSystem(
        path: string,
        expectedCondition?: () => Promise<boolean>,
        timeout = 10000,
    ): Promise<void> {
        this.logger.debug(`[File Watcher] Waiting for file system change: ${path}`);

        return new Promise((resolve, reject) => {
            const timeoutHandle = setTimeout(() => {
                if (watcher) {
                    watcher.dispose();
                }
                reject(new Error(`File system wait timeout: ${path}`));
            }, timeout);

            // If we have a condition, poll for it
            if (expectedCondition) {
                this.pollingService.pollUntilCondition(expectedCondition, {
                    timeout,
                    name: `file system: ${path}`,
                    initialDelay: 100,
                    maxDelay: 1000,
                }).then(() => {
                    clearTimeout(timeoutHandle);
                    resolve();
                }).catch(reject);
                return;
            }

            // Otherwise, wait for any change
            const watcher = vscode.workspace.createFileSystemWatcher(path);

            const handleChange = () => {
                clearTimeout(timeoutHandle);
                watcher.dispose();
                this.logger.debug(`[File Watcher] File system change detected: ${path}`);
                resolve();
            };

            watcher.onDidChange(handleChange);
            watcher.onDidCreate(handleChange);
            watcher.onDidDelete(handleChange);

            this.watchers.set(path, watcher);
        });
    }

    /**
     * Create a persistent file watcher
     */
    createWatcher(
        path: string,
        onChange: () => void,
        onCreate?: () => void,
        onDelete?: () => void,
    ): vscode.Disposable {
        this.logger.debug(`[File Watcher] Creating persistent watcher for: ${path}`);

        const watcher = vscode.workspace.createFileSystemWatcher(path);

        watcher.onDidChange(() => {
            this.logger.debug(`[File Watcher] Change event: ${path}`);
            onChange();
        });

        if (onCreate) {
            watcher.onDidCreate(() => {
                this.logger.debug(`[File Watcher] Create event: ${path}`);
                onCreate();
            });
        }

        if (onDelete) {
            watcher.onDidDelete(() => {
                this.logger.debug(`[File Watcher] Delete event: ${path}`);
                onDelete();
            });
        }

        this.watchers.set(path, watcher);

        return watcher;
    }

    /**
     * Dispose a specific watcher
     */
    disposeWatcher(path: string): void {
        const watcher = this.watchers.get(path);
        if (watcher) {
            watcher.dispose();
            this.watchers.delete(path);
            this.logger.debug(`[File Watcher] Disposed watcher for: ${path}`);
        }
    }

    /**
     * Dispose all watchers
     */
    disposeAll(): void {
        this.watchers.forEach(watcher => watcher.dispose());
        this.watchers.clear();
        this.logger.debug('[File Watcher] Disposed all watchers');
    }

    /**
     * Get count of active watchers
     */
    getActiveWatcherCount(): number {
        return this.watchers.size;
    }
}
