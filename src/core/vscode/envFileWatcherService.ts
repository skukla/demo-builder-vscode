/**
 * EnvFileWatcherService manages workspace-scoped .env file watchers
 *
 * Replaces global file watcher in extension.ts with workspace-scoped approach.
 * Automatically disposes watchers when workspace folders removed.
 *
 * Features:
 * - Workspace-scoped watcher lifecycle (auto-dispose on folder removal)
 * - Hash-based change detection (prevent false notifications from file events)
 * - Programmatic write suppression (Configure UI coordination)
 * - Demo startup grace period (10-second anti-pattern from existing implementation)
 * - Show-once notification management (don't spam user)
 * - Internal command registration for state coordination
 * - Integration with WorkspaceWatcherManager for automatic cleanup
 *
 * @example Basic Usage
 * ```typescript
 * const watcherManager = new WorkspaceWatcherManager();
 * const envWatcherService = new EnvFileWatcherService(
 *   context,
 *   stateManager,
 *   watcherManager,
 *   logger
 * );
 *
 * envWatcherService.initialize();
 * context.subscriptions.push(envWatcherService);
 * ```
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { WorkspaceWatcherManager } from './workspaceWatcherManager';
import { DisposableStore } from '@/core/utils/disposableStore';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/**
 * Service for managing workspace-scoped .env file watchers
 *
 * Responsibilities:
 * - Create watchers for each workspace folder
 * - Auto-dispose watchers when workspace folders removed
 * - Hash-based change detection (prevent false notifications)
 * - Programmatic write suppression (Configure UI)
 * - Demo startup grace period handling
 * - Show-once notification management
 * - Internal command registration for state coordination
 *
 * Disposal:
 * - Watchers tied to workspace folder lifetime via WorkspaceWatcherManager
 * - Internal commands disposed with service via DisposableStore
 * - All resources tracked and cleaned up in LIFO order
 */
export class EnvFileWatcherService implements vscode.Disposable {
    private disposables = new DisposableStore();
    private demoStartTime: number | null = null;
    private restartNotificationShown = false;
    private meshNotificationShown = false;
    private programmaticWrites = new Set<string>();
    private fileContentHashes = new Map<string, string>();
    private activeTimeouts = new Set<NodeJS.Timeout>();

    // SOP §1: Using TIMEOUTS constant for startup grace period
    private readonly STARTUP_GRACE_PERIOD = TIMEOUTS.STARTUP_UPDATE_CHECK_DELAY;

    constructor(
        private _context: vscode.ExtensionContext,
        private stateManager: any, // Using any to avoid circular dependencies with StateManager
        private watcherManager: WorkspaceWatcherManager,
        private logger: any,
    ) {
        this.registerInternalCommands();
    }

    /**
     * Initialize watchers for all workspace folders
     *
     * Creates workspace-scoped .env file watchers for each workspace folder.
     * Watchers are automatically managed by WorkspaceWatcherManager.
     *
     * @example
     * ```typescript
     * const service = new EnvFileWatcherService(...);
     * service.initialize();
     * ```
     */
    public initialize(): void {
        const folders = vscode.workspace.workspaceFolders || [];

        for (const folder of folders) {
            this.createWatcherForFolder(folder);
        }
        // Silent initialization - only log errors, not routine setup
    }

    /**
     * Create watcher for specific workspace folder
     *
     * @param folder Workspace folder to watch
     * @private
     */
    private createWatcherForFolder(folder: vscode.WorkspaceFolder): void {
        const pattern = new vscode.RelativePattern(folder, '{.env,.env.local}');

        const watcher = vscode.workspace.createFileSystemWatcher(
            pattern,
            false, // create
            false, // change
            false, // delete
        );

        // Register change handler
        watcher.onDidChange(async (uri) => {
            await this.handleFileChange(uri);
        });

        // Register in WorkspaceWatcherManager for automatic disposal
        this.watcherManager.registerWatcher(folder, watcher, `env-watcher-${folder.name}`);

        this.logger.debug(`[Env Watcher] Created watcher for ${folder.name}`);
    }

    /**
     * Handle file change event
     *
     * Implements sophisticated change detection logic:
     * 1. Check grace period (10 seconds after demo start)
     * 2. Check programmatic write suppression
     * 3. Hash-based change detection (content actually changed?)
     * 4. Show-once notification management
     * 5. Demo running status check
     *
     * @param uri URI of changed file
     * @private
     */
    private async handleFileChange(uri: vscode.Uri): Promise<void> {
        try {
            const filePath = uri.fsPath;
            this.logger.debug(`[Env Watcher] File system event for: ${filePath}`);

            // Check grace period
            if (this.demoStartTime && Date.now() - this.demoStartTime < this.STARTUP_GRACE_PERIOD) {
                this.logger.debug('[Env Watcher] Ignoring change during demo startup grace period');
                return;
            }

            // Check programmatic write
            if (this.programmaticWrites.has(filePath)) {
                this.logger.debug('[Env Watcher] Ignoring programmatic write (Configure screen handles notification)');
                this.programmaticWrites.delete(filePath);
                return;
            }

            // Hash-based change detection
            const currentHash = await this.getFileHash(filePath);
            if (!currentHash) {
                this.logger.debug('[Env Watcher] File no longer readable, skipping');
                return;
            }

            const previousHash = this.fileContentHashes.get(filePath);
            if (previousHash === undefined) {
                // First time seeing file - initialize hash without notification
                this.fileContentHashes.set(filePath, currentHash);
                this.logger.debug(`[Env Watcher] First time tracking file, initialized hash: ${currentHash.substring(0, 8)}...`);
                return;
            }

            if (previousHash === currentHash) {
                this.logger.debug('[Env Watcher] Content unchanged (hash match), ignoring');
                return;
            }

            // Content changed
            this.fileContentHashes.set(filePath, currentHash);
            this.logger.debug(`[Env Watcher] Content actually changed: ${filePath}`);
            this.logger.debug(`[Env Watcher] Hash changed from ${previousHash.substring(0, 8)}... to ${currentHash.substring(0, 8)}...`);

            // Show notification if demo running
            const currentProject = await this.stateManager.getCurrentProject();
            if (currentProject && currentProject.status === 'running') {
                if (this.restartNotificationShown) {
                    this.logger.debug('[Env Watcher] Restart notification already shown this session, suppressing');
                    return;
                }

                this.logger.debug('[Env Watcher] Demo is running, suggesting restart');
                this.restartNotificationShown = true;

                vscode.window.showInformationMessage(
                    'Environment configuration changed. Restart the demo to apply changes.',
                    'Restart Demo',
                ).then(selection => {
                    if (selection === 'Restart Demo') {
                        vscode.commands.executeCommand('demoBuilder.stopDemo').then(() => {
                            vscode.commands.executeCommand('demoBuilder.startDemo');
                        });
                    }
                });
            } else {
                this.logger.debug('[Env Watcher] No running demo, skipping restart notification');
            }
        } catch (error) {
            this.logger.error('[Env Watcher] Error handling file change:', error as Error);
        }
    }

    /**
     * Get file hash (SHA-256)
     *
     * @param filePath Path to file
     * @returns SHA-256 hash of file content, or null if file not readable
     * @private
     */
    private async getFileHash(filePath: string): Promise<string | null> {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            return crypto.createHash('sha256').update(content).digest('hex');
        } catch {
            this.logger.debug(`[Env Watcher] Could not read file ${filePath}`);
            return null;
        }
    }

    /**
     * Validate file paths are within workspace folders
     *
     * Security: Ensures paths from internal commands are workspace-scoped.
     * Prevents path traversal if commands called by malicious extensions.
     *
     * @param filePaths Array of file paths to validate
     * @returns Array of validated paths within workspace folders
     * @private
     */
    private validateWorkspacePaths(filePaths: string[]): string[] {
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        if (workspaceFolders.length === 0) {
            return [];
        }

        // Normalize workspace paths to prevent path traversal attacks
        const workspacePaths = workspaceFolders.map(folder =>
            path.normalize(folder.uri.fsPath) + path.sep,
        );

        return filePaths.filter(filePath => {
            // Normalize input path and add separator to ensure exact prefix match
            // This prevents "/workspace1-fake/.env" from matching "/workspace1"
            const normalizedPath = path.normalize(filePath);
            const isValid = workspacePaths.some(wsPath => normalizedPath.startsWith(wsPath));
            if (!isValid) {
                this.logger.warn(`[Env Watcher] Rejected path outside workspace: ${filePath}`);
            }
            return isValid;
        });
    }

    /**
     * Register internal commands for state coordination
     *
     * Registers 10 internal commands:
     * 1. demoBuilder._internal.demoStarted - Set grace period and reset restart flag
     * 2. demoBuilder._internal.demoStopped - Clear grace period and hashes
     * 3. demoBuilder._internal.registerProgrammaticWrites - Register programmatic writes
     * 4. demoBuilder._internal.initializeFileHashes - Initialize file hashes
     * 5. demoBuilder._internal.restartActionTaken - Reset restart notification flag
     * 6. demoBuilder._internal.meshActionTaken - Reset mesh notification flag
     * 7. demoBuilder._internal.shouldShowRestartNotification - Query restart notification state
     * 8. demoBuilder._internal.shouldShowMeshNotification - Query mesh notification state
     * 9. demoBuilder._internal.markRestartNotificationShown - Mark restart notification shown
     * 10. demoBuilder._internal.markMeshNotificationShown - Mark mesh notification shown
     *
     * @private
     */
    private registerInternalCommands(): void {
        // Demo started
        this.disposables.add(
            vscode.commands.registerCommand('demoBuilder._internal.demoStarted', () => {
                this.demoStartTime = Date.now();
                this.restartNotificationShown = false;
            }),
        );

        // Demo stopped
        this.disposables.add(
            vscode.commands.registerCommand('demoBuilder._internal.demoStopped', () => {
                this.demoStartTime = null;
                this.fileContentHashes.clear();
            }),
        );

        // Register programmatic writes
        this.disposables.add(
            vscode.commands.registerCommand(
                'demoBuilder._internal.registerProgrammaticWrites',
                (filePaths: string[]) => {
                    // Validate paths are within workspace folders
                    const validatedPaths = this.validateWorkspacePaths(filePaths);

                    validatedPaths.forEach(fp => this.programmaticWrites.add(fp));
                    if (validatedPaths.length > 0) {
                        this.logger.debug(`[Env Watcher] Registered ${validatedPaths.length} programmatic writes to ignore`);
                    }

                    // Auto-cleanup in case watcher events are delayed
                    const timeoutId = setTimeout(() => {
                        validatedPaths.forEach(fp => this.programmaticWrites.delete(fp));
                        this.activeTimeouts.delete(timeoutId);
                    }, TIMEOUTS.PROGRAMMATIC_WRITE_CLEANUP);
                    this.activeTimeouts.add(timeoutId);
                },
            ),
        );

        // Initialize file hashes
        this.disposables.add(
            vscode.commands.registerCommand(
                'demoBuilder._internal.initializeFileHashes',
                async (filePaths: string[]) => {
                    // Validate paths are within workspace folders
                    const validatedPaths = this.validateWorkspacePaths(filePaths);

                    for (const filePath of validatedPaths) {
                        const hash = await this.getFileHash(filePath);
                        if (hash) {
                            this.fileContentHashes.set(filePath, hash);
                        }
                    }
                },
            ),
        );

        // Action taken handlers
        this.disposables.add(
            vscode.commands.registerCommand('demoBuilder._internal.restartActionTaken', () => {
                this.restartNotificationShown = false;
            }),
        );

        this.disposables.add(
            vscode.commands.registerCommand('demoBuilder._internal.meshActionTaken', () => {
                this.meshNotificationShown = false;
                this.logger.debug('[Notification] Mesh deployment action taken, flag reset');
            }),
        );

        // Query notification state (for Configure UI)
        this.disposables.add(
            vscode.commands.registerCommand('demoBuilder._internal.shouldShowRestartNotification', () => {
                return !this.restartNotificationShown;
            }),
        );

        this.disposables.add(
            vscode.commands.registerCommand('demoBuilder._internal.shouldShowMeshNotification', () => {
                return !this.meshNotificationShown;
            }),
        );

        // Mark notifications shown (for Configure UI)
        this.disposables.add(
            vscode.commands.registerCommand('demoBuilder._internal.markRestartNotificationShown', () => {
                this.restartNotificationShown = true;
            }),
        );

        this.disposables.add(
            vscode.commands.registerCommand('demoBuilder._internal.markMeshNotificationShown', () => {
                this.meshNotificationShown = true;
            }),
        );
    }

    /**
     * Dispose service and all resources
     *
     * Disposes all internal commands in LIFO order via DisposableStore.
     * Clears all active timeouts to prevent accessing disposed resources.
     * Watchers are disposed by WorkspaceWatcherManager.
     *
     * Safe to call multiple times (idempotent).
     */
    public dispose(): void {
        // Clear all active timeouts before disposal
        this.activeTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        this.activeTimeouts.clear();

        this.disposables.dispose();
        this.logger.debug('[Env Watcher] Service disposed');
    }
}
