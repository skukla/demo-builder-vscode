import * as vscode from 'vscode';
import { Logger } from '@/core/logging';
import { StateManager } from '@/core/state';
import { StatusBarManager } from '@/core/vscode/StatusBarManager';

export abstract class BaseCommand {
    protected context: vscode.ExtensionContext;
    protected stateManager: StateManager;
    protected statusBar: StatusBarManager;
    protected logger: Logger;

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
     * @param timeout Milliseconds to show in status bar (default 5000)
     */
    protected async showSuccessMessage(message: string, timeout = 5000): Promise<void> {
        this.logger.info(message);
        // Show auto-dismissing notification popup (2 seconds)
        await this.showProgressNotification(message, 2000);
        // Also show in status bar as secondary indicator
        vscode.window.setStatusBarMessage(`✅ ${message}`, timeout);
    }

    /**
     * Show an auto-dismissing progress notification
     * Use for informational messages that should disappear automatically
     * @param message Message to display
     * @param duration Duration in milliseconds (default 2000)
     */
    protected async showProgressNotification(message: string, duration = 2000): Promise<void> {
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
     * @param timeout Milliseconds to show (default 3000)
     */
    protected showStatusMessage(message: string, timeout = 3000): void {
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

    protected createTerminal(name: string, cwd?: string): vscode.Terminal {
        const terminal = vscode.window.createTerminal({
            name,
            cwd: cwd || undefined, // Only set cwd if explicitly provided
        });
        this.context.subscriptions.push(terminal);
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