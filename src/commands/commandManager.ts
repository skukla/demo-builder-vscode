import * as vscode from 'vscode';
import { StatusBarManager } from '../providers/statusBar';
import { Project } from '../types';
import { Logger } from '../shared/logging';
import { StateManager } from '../shared/state';
import { CheckUpdatesCommand } from './checkUpdates';
import { ConfigureCommand } from './configure';
import { ConfigureProjectWebviewCommand } from './configureProjectWebview';
import { CreateProjectWebviewCommand } from './createProjectWebview';
import { DeleteProjectCommand } from './deleteProject';
import { DiagnosticsCommand } from './diagnostics';
import { ProjectDashboardWebviewCommand } from './projectDashboardWebview';
import { StartDemoCommand } from '@/features/lifecycle/commands/startDemo';
import { StopDemoCommand } from '@/features/lifecycle/commands/stopDemo';
import { ViewStatusCommand } from './viewStatus';
import { ResetAllCommand } from './resetAll';
import { DeployMeshCommand } from '@/features/mesh/commands/deployMesh';
import { WelcomeWebviewCommand } from './welcomeWebview';

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
        logger: Logger,
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
            this.logger,
        );
        this.registerCommand('demoBuilder.showWelcome', async () => {
            // Close other webviews when going "home" to Welcome
            ProjectDashboardWebviewCommand.disposeActivePanel();
            ConfigureProjectWebviewCommand.disposeActivePanel();
            await this.welcomeScreen.execute();
        });

        // Create Project (Webview version)
        this.createProjectWebview = new CreateProjectWebviewCommand(
            this.context,
            this.stateManager,
            this.statusBar,
            this.logger,
        );
        this.registerCommand('demoBuilder.createProject', async () => {
            // Port conflicts are automatically handled during project creation
            // (see executeProjectCreation in createProjectWebview.ts)
            await this.createProjectWebview.execute();
        });

        // Project Dashboard (Post-creation guide)
        const projectDashboard = new ProjectDashboardWebviewCommand(
            this.context,
            this.stateManager,
            this.statusBar,
            this.logger,
        );
        this.registerCommand('demoBuilder.showProjectDashboard', async () => {
            // Close Welcome when opening Dashboard (prevent confusion)
            WelcomeWebviewCommand.disposeActivePanel();
            await projectDashboard.execute();
        });

        // Switch Project (Quick picker for existing projects)
        this.registerCommand('demoBuilder.switchProject', async () => {
            // Check if current project has a running demo
            const currentProject = await this.stateManager.getCurrentProject();
            if (currentProject && currentProject.status === 'running') {
                const action = await vscode.window.showWarningMessage(
                    `Demo is currently running for "${currentProject.name}". Stop it before switching projects?`,
                    'Stop & Switch',
                    'Cancel',
                );
                
                if (action !== 'Stop & Switch') {
                    // User cancelled - reopen Welcome screen if no project exists
                    const hasProject = await this.stateManager.hasProject();
                    if (!hasProject) {
                        this.logger.debug('[SwitchProject] User cancelled, reopening Welcome screen');
                        await vscode.commands.executeCommand('demoBuilder.showWelcome');
                    }
                    return;
                }
                
                // Stop the current demo
                this.logger.info('[SwitchProject] Stopping current demo before switching...');
                await vscode.commands.executeCommand('demoBuilder.stopDemo');
            }
            
            const projects = await this.stateManager.getAllProjects();
            
            if (projects.length === 0) {
                vscode.window.showInformationMessage('No existing projects found. Create a new project to get started!');
                return;
            }
            
            const items = projects.map((project: { name: string; path: string; lastModified: Date }) => ({
                label: project.name,
                description: project.path,
                detail: `Last modified: ${project.lastModified.toLocaleDateString()}`,
                projectPath: project.path,
            }));
            
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a project to open',
                title: 'Switch Project',
            });
            
            if (selected) {
                const project = await this.stateManager.loadProjectFromPath(selected.projectPath);
                if (project) {
                    this.logger.info(`[SwitchProject] Switched to project: ${project.name}`);
                    this.statusBar.updateProject(project);
                    vscode.commands.executeCommand('demoBuilder.showProjectDashboard');
                } else {
                    vscode.window.showErrorMessage(`Failed to load project from ${selected.projectPath}`);
                }
            }
        });

        // Load Project (from tree view click)
        this.registerCommand('demoBuilder.loadProject', async (...args: unknown[]) => {
            const projectPath = args[0] as string;

            // Check if current project has a running demo
            const currentProject = await this.stateManager.getCurrentProject();
            if (currentProject && currentProject.status === 'running') {
                const action = await vscode.window.showWarningMessage(
                    `Demo is currently running for "${currentProject.name}". Stop it before switching projects?`,
                    'Stop & Switch',
                    'Cancel',
                );

                if (action !== 'Stop & Switch') {
                    // User cancelled - reopen Welcome screen if no project exists
                    const hasProject = await this.stateManager.hasProject();
                    if (!hasProject) {
                        this.logger.debug('[LoadProject] User cancelled, reopening Welcome screen');
                        await vscode.commands.executeCommand('demoBuilder.showWelcome');
                    }
                    return;
                }

                // Stop the current demo
                this.logger.info('[LoadProject] Stopping current demo before switching...');
                await vscode.commands.executeCommand('demoBuilder.stopDemo');
            }

            const project = await this.stateManager.loadProjectFromPath(projectPath);
            if (project) {
                this.logger.info(`[LoadProject] Loaded project: ${project.name}`);
                this.statusBar.updateProject(project);
                vscode.commands.executeCommand('demoBuilder.showProjectDashboard');
            } else {
                vscode.window.showErrorMessage(`Failed to load project from ${projectPath}`);
            }
        });

        // Start Demo
        const startDemo = new StartDemoCommand(
            this.context,
            this.stateManager,
            this.statusBar,
            this.logger,
        );
        this.registerCommand('demoBuilder.startDemo', () => startDemo.execute());

        // Stop Demo
        const stopDemo = new StopDemoCommand(
            this.context,
            this.stateManager,
            this.statusBar,
            this.logger,
        );
        this.registerCommand('demoBuilder.stopDemo', () => stopDemo.execute());

        // Delete Project
        const deleteProject = new DeleteProjectCommand(
            this.context,
            this.stateManager,
            this.statusBar,
            this.logger,
        );
        this.registerCommand('demoBuilder.deleteProject', () => deleteProject.execute());

        // View Status
        const viewStatus = new ViewStatusCommand(
            this.context,
            this.stateManager,
            this.statusBar,
            this.logger,
        );
        this.registerCommand('demoBuilder.viewStatus', () => viewStatus.execute());

        // Configure (Legacy - command palette)
        const configure = new ConfigureCommand(
            this.context,
            this.stateManager,
            this.statusBar,
            this.logger,
        );
        this.registerCommand('demoBuilder.configure', () => configure.execute());

        // Configure Project (Webview)
        const configureProject = new ConfigureProjectWebviewCommand(
            this.context,
            this.stateManager,
            this.statusBar,
            this.logger,
        );
        this.registerCommand('demoBuilder.configureProject', async () => {
            // Close Welcome when opening Configure (prevent confusion)
            WelcomeWebviewCommand.disposeActivePanel();
            await configureProject.execute();
        });

        // Deploy Mesh
        const deployMesh = new DeployMeshCommand(
            this.context,
            this.stateManager,
            this.statusBar,
            this.logger,
        );
        this.registerCommand('demoBuilder.deployMesh', () => deployMesh.execute());

        // Check Updates
        const checkUpdates = new CheckUpdatesCommand(
            this.context,
            this.stateManager,
            this.statusBar,
            this.logger,
        );
        this.registerCommand('demoBuilder.checkForUpdates', () => checkUpdates.execute());

        // Reset All (Development only)
        if (this.context.extensionMode === vscode.ExtensionMode.Development) {
            const resetAll = new ResetAllCommand(
                this.context,
                this.stateManager,
                this.statusBar,
                this.logger,
            );
            this.registerCommand('demoBuilder.resetAll', () => resetAll.execute());
        }

        // Diagnostics
        const diagnostics = new DiagnosticsCommand();
        this.registerCommand('demoBuilder.diagnostics', () => diagnostics.execute());

        // Open Component (reveal in Explorer)
        this.registerCommand('demoBuilder.openComponent', async (...args: unknown[]) => {
            const componentId = args[0] as string;
            let project = args[1] as Project | undefined;

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

    private registerCommand(command: string, callback: (...args: unknown[]) => unknown): void {
        const disposable = vscode.commands.registerCommand(command, callback);
        this.commands.set(command, disposable);
        this.context.subscriptions.push(disposable);
    }

    public dispose(): void {
        this.commands.forEach(disposable => disposable.dispose());
        this.commands.clear();
    }
}