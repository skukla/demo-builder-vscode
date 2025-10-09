import * as vscode from 'vscode';
import { StateManager } from '../utils/stateManager';
import { StatusBarManager } from '../providers/statusBar';
import { Logger } from '../utils/logger';

export abstract class BaseCommand {
    protected context: vscode.ExtensionContext;
    protected stateManager: StateManager;
    protected statusBar: StatusBarManager;
    protected logger: Logger;

    constructor(
        context: vscode.ExtensionContext,
        stateManager: StateManager,
        statusBar: StatusBarManager,
        logger: Logger
    ) {
        this.context = context;
        this.stateManager = stateManager;
        this.statusBar = statusBar;
        this.logger = logger;
    }

    public abstract execute(): Promise<void>;

    protected async withProgress<T>(
        title: string,
        task: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<T>
    ): Promise<T> {
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title,
            cancellable: false
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

    protected async showQuickPick<T extends vscode.QuickPickItem>(
        items: T[],
        options?: vscode.QuickPickOptions
    ): Promise<T | undefined> {
        return vscode.window.showQuickPick(items, options);
    }

    protected async showInputBox(options?: vscode.InputBoxOptions): Promise<string | undefined> {
        return vscode.window.showInputBox(options);
    }

    protected createTerminal(name: string, cwd?: string): vscode.Terminal {
        const terminal = vscode.window.createTerminal({
            name,
            cwd: cwd || undefined // Only set cwd if explicitly provided
        });
        this.context.subscriptions.push(terminal);
        return terminal;
    }

    protected async confirm(message: string, detail?: string): Promise<boolean> {
        const result = await vscode.window.showInformationMessage(
            message,
            { modal: true, detail },
            'Yes',
            'No'
        );
        return result === 'Yes';
    }
}