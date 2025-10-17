import * as vscode from 'vscode';
import { StateManager } from './stateManager';
import { Logger } from './logger';

export class TerminalManager {
    private terminal: vscode.Terminal | undefined;
    private readonly terminalName = 'Demo Builder';
    private stateManager: StateManager;
    private logger: Logger;

    constructor(stateManager: StateManager) {
        this.stateManager = stateManager;
        this.logger = new Logger('TerminalManager');
    }

    /**
     * Creates or reuses the terminal
     */
    public async getOrCreateTerminal(): Promise<vscode.Terminal> {
        // Check if terminal already exists and is still open
        if (this.terminal) {
            const existingTerminal = vscode.window.terminals.find(t => t === this.terminal);
            if (existingTerminal) {
                return this.terminal;
            }
        }

        // Create new terminal with safe working directory
        // Prefer project directory if it exists, otherwise use workspace folder or home directory
        let safeCwd = process.env.HOME || process.env.USERPROFILE || undefined;
        
        try {
            // Check if we have a current project with an existing directory
            const currentProject = await this.stateManager.getCurrentProject();
            if (currentProject?.path && require('fs').existsSync(currentProject.path)) {
                // Project directory exists, use it for terminal operations
                safeCwd = currentProject.path;
                this.logger.debug(`[Terminal] Using project directory: ${currentProject.path}`);
            } else {
                // Fall back to workspace folder or home directory
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                if (workspaceFolder) {
                    safeCwd = workspaceFolder;
                    this.logger.debug(`[Terminal] Using workspace folder: ${workspaceFolder}`);
                } else {
                    this.logger.debug(`[Terminal] Using home directory: ${safeCwd}`);
                }
            }
        } catch (error) {
            this.logger.debug(`[Terminal] Could not determine project directory, using fallback: ${error}`);
        }
        
        this.terminal = vscode.window.createTerminal({
            name: this.terminalName,
            cwd: safeCwd
        });

        return this.terminal;
    }

    /**
     * Shows the terminal in a split pane (right side)
     */
    public async showInSplitPane(): Promise<void> {
        try {
            // Try to create terminal in editor area to the side
            await vscode.commands.executeCommand('workbench.action.createTerminalEditorSide');
            
            // Find the newly created terminal and store reference
            const terminals = vscode.window.terminals;
            const newTerminal = terminals[terminals.length - 1];
            if (newTerminal) {
                this.terminal = newTerminal;
            }
        } catch {
            // Fallback to regular terminal panel
            const terminal = await this.getOrCreateTerminal();
            terminal.show(false); // false = don't steal focus from webview
        }
        
        // Give VS Code time to create the terminal
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    /**
     * Clears the terminal
     */
    public clear(): void {
        if (this.terminal && vscode.window.terminals.includes(this.terminal)) {
            this.terminal.sendText('clear');
        }
    }

    /**
     * Starts a new section with a title
     */
    public startSection(title: string): void {
        if (this.terminal && vscode.window.terminals.includes(this.terminal)) {
            // Clear screen and show section title
            this.terminal.sendText(`clear && echo "${title}" && echo ""`);
        }
    }

    /**
     * Sends a command to the terminal
     */
    public sendCommand(command: string): void {
        if (this.terminal && vscode.window.terminals.includes(this.terminal)) {
            this.terminal.sendText(command);
        }
    }

    /**
     * Disposes the terminal
     */
    public dispose(): void {
        if (this.terminal) {
            this.terminal.dispose();
            this.terminal = undefined;
        }
    }

    /**
     * Checks if the terminal is active
     */
    public isActive(): boolean {
        if (!this.terminal) {
            return false;
        }
        return vscode.window.terminals.includes(this.terminal);
    }
}