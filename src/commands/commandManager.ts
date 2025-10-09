import * as vscode from 'vscode';
import { CreateProjectWebviewCommand } from './createProjectWebview';
import { WelcomeWebviewCommand } from './welcomeWebview';
import { ProjectDashboardWebviewCommand } from './projectDashboardWebview';
import { StartDemoCommand } from './startDemo';
import { StopDemoCommand } from './stopDemo';
import { DeleteProjectCommand } from './deleteProject';
import { ViewStatusCommand } from './viewStatus';
import { ConfigureCommand } from './configure';
import { ConfigureProjectWebviewCommand } from './configureProjectWebview';
import { CheckUpdatesCommand } from './checkUpdates';
import { ResetAllCommand } from './resetAll';
import { DiagnosticsCommand } from './diagnostics';
import { DeployMeshCommand } from './deployMesh';
import { StateManager } from '../utils/stateManager';
import { StatusBarManager } from '../providers/statusBar';
import { Logger } from '../utils/logger';

export class CommandManager {
    private context: vscode.ExtensionContext;
    private stateManager: StateManager;
    private statusBar: StatusBarManager;
    private logger: Logger;
    private commands: Map<string, vscode.Disposable>;
    public welcomeScreen!: WelcomeWebviewCommand;
    public createProjectWebview!: CreateProjectWebviewCommand;

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
        // Move to debug logging - this is an implementation detail
        this.logger.debug('Registering Demo Builder commands...');

        // Welcome Screen
        this.welcomeScreen = new WelcomeWebviewCommand(
            this.context,
            this.stateManager,
            this.statusBar,
            this.logger
        );
        this.registerCommand('demoBuilder.showWelcome', () => this.welcomeScreen.execute());

        // Create Project (Webview version)
        this.createProjectWebview = new CreateProjectWebviewCommand(
            this.context,
            this.stateManager,
            this.statusBar,
            this.logger
        );
        this.registerCommand('demoBuilder.createProject', () => this.createProjectWebview.execute());

        // Project Dashboard (Post-creation guide)
        const projectDashboard = new ProjectDashboardWebviewCommand(
            this.context,
            this.stateManager,
            this.statusBar,
            this.logger
        );
        this.registerCommand('demoBuilder.showProjectDashboard', () => projectDashboard.execute());

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

        // Configure (Legacy - command palette)
        const configure = new ConfigureCommand(
            this.context,
            this.stateManager,
            this.statusBar,
            this.logger
        );
        this.registerCommand('demoBuilder.configure', () => configure.execute());

        // Configure Project (Webview)
        const configureProject = new ConfigureProjectWebviewCommand(
            this.context,
            this.stateManager,
            this.statusBar,
            this.logger
        );
        this.registerCommand('demoBuilder.configureProject', () => configureProject.execute());

        // Deploy Mesh
        const deployMesh = new DeployMeshCommand(
            this.context,
            this.stateManager,
            this.statusBar,
            this.logger
        );
        this.registerCommand('demoBuilder.deployMesh', () => deployMesh.execute());

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

        // Diagnostics
        const diagnostics = new DiagnosticsCommand();
        this.registerCommand('demoBuilder.diagnostics', () => diagnostics.execute());

        // Open Component (reveal in Explorer)
        this.registerCommand('demoBuilder.openComponent', async (componentId: string, project?: any) => {
            try {
                // Get project if not provided
                if (!project) {
                    project = await this.stateManager.getCurrentProject();
                }
                
                if (!project?.componentInstances?.[componentId]) {
                    vscode.window.showErrorMessage(`Component ${componentId} not found`);
                    return;
                }
                
                const component = project.componentInstances[componentId];
                
                if (!component.path) {
                    vscode.window.showErrorMessage(`Component ${component.name} has no local files`);
                    return;
                }
                
                const componentUri = vscode.Uri.file(component.path);
                
                // Switch to Explorer view
                await vscode.commands.executeCommand('workbench.view.explorer');
                
                // Reveal in Explorer
                await vscode.commands.executeCommand('revealInExplorer', componentUri);
                
                // Try to open README.md or package.json for quick reference
                const fs = await import('fs/promises');
                const path = await import('path');
                
                try {
                    const readmePath = path.join(component.path, 'README.md');
                    await fs.access(readmePath);
                    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(readmePath));
                } catch {
                    // No README, try package.json
                    try {
                        const packagePath = path.join(component.path, 'package.json');
                        await fs.access(packagePath);
                        await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(packagePath));
                    } catch {
                        // No package.json either, just reveal the folder
                        this.logger.debug(`[OpenComponent] No README or package.json found for ${componentId}`);
                    }
                }
                
                this.logger.info(`[OpenComponent] Opened ${component.name} in Explorer`);
            } catch (error) {
                this.logger.error('[OpenComponent] Failed to open component', error as Error);
                vscode.window.showErrorMessage(`Failed to open component: ${error instanceof Error ? error.message : String(error)}`);
            }
        });

        const commandList = Array.from(this.commands.keys());
        this.logger.debug(`Registered ${this.commands.size} commands: ${commandList.slice(0, 3).join(', ')}${commandList.length > 3 ? ` ... (and ${commandList.length - 3} more)` : ''}`);
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