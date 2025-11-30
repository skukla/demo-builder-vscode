import * as vscode from 'vscode';
import { Logger } from '@/core/logging';
import { StateManager } from '@/core/state';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { StatusBarManager } from '@/core/vscode/StatusBarManager';
import { DisposableStore } from '@/core/utils/disposableStore';

/**
 * Base class for all VS Code commands
 *
 * Provides standardized infrastructure for command implementations:
 * - Error handling and user notifications
 * - Progress indicators
 * - User prompts (confirm, input, quick pick)
 * - Terminal creation with automatic disposal
 * - Resource disposal via DisposableStore (LIFO ordering)
 *
 * All command subclasses automatically get:
 * - `this.disposables` - DisposableStore for managing command-owned resources
 * - `this.dispose()` - Dispose all resources in LIFO order
 * - vscode.Disposable compliance (can be added to context.subscriptions)
 *
 * @example Basic Command with Disposal
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
 * @example Subclass with Custom Disposal
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
 *
 *     // Optional: Override dispose for custom cleanup
 *     override dispose(): void {
 *         // Custom cleanup first
 *         this.logger.info('Cleaning up complex command');
 *         // Then call parent to dispose all resources
 *         super.dispose();
 *     }
 * }
 * ```
 *
 * @see DisposableStore for LIFO disposal ordering details
 */
export abstract class BaseCommand implements vscode.Disposable {
    protected context: vscode.ExtensionContext;
    protected stateManager: StateManager;
    protected statusBar: StatusBarManager;
    protected logger: Logger;
    protected disposables = new DisposableStore();

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

    protected async withProgress<T>(
        title: string,
        task: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<T>,
    ): Promise<T> {
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title,
            cancellable: false,
        }, task);
    }

    protected async showError(message: string, error?: Error): Promise<void> {
        this.logger.error(`${message}: ${error?.message || 'Unknown error'}`);
        await vscode.window.showErrorMessage(message, 'OK');
    }

    protected async showWarning(message: string): Promise<void> {
        this.logger.warn(message);
        await vscode.window.showWarningMessage(message, 'OK');
    }

    protected async showInfo(message: string): Promise<void> {
        this.logger.info(message);
        await vscode.window.showInformationMessage(message, 'OK');
    }

    /**
     * Show a temporary success message (auto-dismissing)
     * Use for simple confirmations that don't require user interaction
     * Shows a notification popup that auto-dismisses after 2 seconds
     * and a status bar message that persists for 5 seconds
     * @param message Success message to display
     * @param timeout Milliseconds to show in status bar (default STATUS_BAR_SUCCESS)
     */
    protected async showSuccessMessage(message: string, timeout = TIMEOUTS.STATUS_BAR_SUCCESS): Promise<void> {
        this.logger.info(message);
        // Show auto-dismissing notification popup
        await this.showProgressNotification(message, TIMEOUTS.NOTIFICATION_AUTO_DISMISS);
        // Also show in status bar as secondary indicator
        vscode.window.setStatusBarMessage(`✅ ${message}`, timeout);
    }

    /**
     * Show an auto-dismissing progress notification
     * Use for informational messages that should disappear automatically
     * @param message Message to display
     * @param duration Duration in milliseconds (default NOTIFICATION_AUTO_DISMISS)
     */
    protected async showProgressNotification(message: string, duration = TIMEOUTS.NOTIFICATION_AUTO_DISMISS): Promise<void> {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: message,
                cancellable: false,
            },
            async () => {
                await new Promise(resolve => setTimeout(resolve, duration));
            },
        );
    }

    /**
     * Show a temporary info message in status bar (auto-dismissing)
     * Use for non-critical informational messages
     * @param message Info message to display
     * @param timeout Milliseconds to show (default STATUS_BAR_INFO)
     */
    protected showStatusMessage(message: string, timeout = TIMEOUTS.STATUS_BAR_INFO): void {
        this.logger.info(message);
        vscode.window.setStatusBarMessage(`ℹ️  ${message}`, timeout);
    }

    protected async showQuickPick<T extends vscode.QuickPickItem>(
        items: T[],
        options?: vscode.QuickPickOptions,
    ): Promise<T | undefined> {
        return vscode.window.showQuickPick(items, options);
    }

    protected async showInputBox(options?: vscode.InputBoxOptions): Promise<string | undefined> {
        return vscode.window.showInputBox(options);
    }

    /**
     * Create a terminal with automatic disposal
     *
     * The terminal is automatically added to this.disposables and will be
     * disposed when the command is disposed. This ensures terminals are
     * properly cleaned up on extension deactivation.
     *
     * @param name Terminal name
     * @param cwd Optional working directory
     * @returns Created terminal instance
     *
     * @example
     * ```typescript
     * const terminal = this.createTerminal('Build');
     * terminal.sendText('npm run build');
     * terminal.show();
     * // Terminal automatically disposed when command disposed
     * ```
     */
    protected createTerminal(name: string, cwd?: string): vscode.Terminal {
        const terminal = vscode.window.createTerminal({
            name,
            cwd: cwd || undefined, // Only set cwd if explicitly provided
        });
        this.disposables.add(terminal);
        return terminal;
    }

    protected async confirm(message: string, detail?: string): Promise<boolean> {
        const result = await vscode.window.showInformationMessage(
            message,
            { modal: true, detail },
            'Yes',
            'No',
        );
        return result === 'Yes';
    }

    /**
     * Get the current project directory path
     *
     * Smart directory detection that returns the project path directly
     * without relying on workspace folders.
     *
     * NOTE: In refactor branch, getCurrentProject() is async. Callers should
     * await getCurrentProject() directly and access .path property.
     * This helper is kept for compatibility but marked deprecated.
     *
     * @returns Project directory path
     * @throws Error if no project is loaded
     * @deprecated Use `await this.stateManager.getCurrentProject()` directly
     */
    protected async getProjectDirectory(): Promise<string> {
        const project = await this.stateManager.getCurrentProject();
        if (!project?.path) {
            throw new Error('No project loaded');
        }
        return project.path;
    }

    /**
     * Get terminal working directory for commands
     *
     * Returns the parent directory of the project for operations like
     * Homebrew installation that need to run outside the project directory.
     *
     * @returns Parent directory of project, or workspace folder, or cwd
     */
    protected async getTerminalCwd(): Promise<string> {
        try {
            const projectDir = await this.getProjectDirectory();
            // Return parent directory for operations outside project
            const path = require('path');
            return path.dirname(projectDir);
        } catch {
            // No project loaded, fall back to workspace or cwd
            return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
        }
    }
}