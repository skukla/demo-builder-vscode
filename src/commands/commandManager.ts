import * as vscode from 'vscode';
import { CreateProjectWebviewCommand } from './createProjectWebview';
import { WelcomeWebviewCommand } from './welcomeWebview';
import { StartDemoCommand } from './startDemo';
import { StopDemoCommand } from './stopDemo';
import { DeleteProjectCommand } from './deleteProject';
import { ViewStatusCommand } from './viewStatus';
import { ConfigureCommand } from './configure';
import { CheckUpdatesCommand } from './checkUpdates';
import { ResetAllCommand } from './resetAll';
import { StateManager } from '../utils/stateManager';
import { StatusBarManager } from '../providers/statusBar';
import { Logger } from '../utils/logger';

export class CommandManager {
    private context: vscode.ExtensionContext;
    private stateManager: StateManager;
    private statusBar: StatusBarManager;
    private logger: Logger;
    private commands: Map<string, vscode.Disposable>;

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
        this.commands = new Map();
    }

    public registerCommands(): void {
        this.logger.info('Registering Demo Builder commands...');

        // Welcome Screen
        const welcomeScreen = new WelcomeWebviewCommand(
            this.context,
            this.stateManager,
            this.statusBar,
            this.logger
        );
        this.registerCommand('demoBuilder.showWelcome', () => welcomeScreen.execute());

        // Create Project (Webview version)
        const createProject = new CreateProjectWebviewCommand(
            this.context,
            this.stateManager,
            this.statusBar,
            this.logger
        );
        this.registerCommand('demoBuilder.createProject', () => createProject.execute());

        // Start Demo
        const startDemo = new StartDemoCommand(
            this.context,
            this.stateManager,
            this.statusBar,
            this.logger
        );
        this.registerCommand('demoBuilder.startDemo', () => startDemo.execute());

        // Stop Demo
        const stopDemo = new StopDemoCommand(
            this.context,
            this.stateManager,
            this.statusBar,
            this.logger
        );
        this.registerCommand('demoBuilder.stopDemo', () => stopDemo.execute());

        // Delete Project
        const deleteProject = new DeleteProjectCommand(
            this.context,
            this.stateManager,
            this.statusBar,
            this.logger
        );
        this.registerCommand('demoBuilder.deleteProject', () => deleteProject.execute());

        // View Status
        const viewStatus = new ViewStatusCommand(
            this.context,
            this.stateManager,
            this.statusBar,
            this.logger
        );
        this.registerCommand('demoBuilder.viewStatus', () => viewStatus.execute());

        // Configure
        const configure = new ConfigureCommand(
            this.context,
            this.stateManager,
            this.statusBar,
            this.logger
        );
        this.registerCommand('demoBuilder.configure', () => configure.execute());

        // Check Updates
        const checkUpdates = new CheckUpdatesCommand(
            this.context,
            this.stateManager,
            this.statusBar,
            this.logger
        );
        this.registerCommand('demoBuilder.checkUpdates', () => checkUpdates.execute());

        // Reset All (Development only)
        if (this.context.extensionMode === vscode.ExtensionMode.Development) {
            const resetAll = new ResetAllCommand(
                this.context,
                this.stateManager,
                this.statusBar,
                this.logger
            );
            this.registerCommand('demoBuilder.resetAll', () => resetAll.execute());
        }

        this.logger.info(`Registered ${this.commands.size} commands`);
    }

    private registerCommand(command: string, callback: (...args: any[]) => any): void {
        const disposable = vscode.commands.registerCommand(command, callback);
        this.commands.set(command, disposable);
        this.context.subscriptions.push(disposable);
    }

    public dispose(): void {
        this.commands.forEach(disposable => disposable.dispose());
        this.commands.clear();
    }
}