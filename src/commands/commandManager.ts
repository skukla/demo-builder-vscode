import * as vscode from 'vscode';
import { ConfigureCommand } from './configure';
import { DiagnosticsCommand } from './diagnostics';
import { ResetAllCommand } from '@/core/commands/ResetAllCommand';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { Logger } from '@/core/logging';
import { StateManager } from '@/core/state';
import { StatusBarManager } from '@/core/vscode/StatusBarManager';
import { ConfigureProjectWebviewCommand } from '@/features/dashboard/commands/configure';
import { ProjectDashboardWebviewCommand } from '@/features/dashboard/commands/showDashboard';
import { DeleteProjectCommand } from '@/features/lifecycle/commands/deleteProject';
import { StartDemoCommand } from '@/features/lifecycle/commands/startDemo';
import { StopDemoCommand } from '@/features/lifecycle/commands/stopDemo';
import { ViewStatusCommand } from '@/features/lifecycle/commands/viewStatus';
import { DeployMeshCommand } from '@/features/mesh/commands/deployMesh';
import { CreateProjectWebviewCommand } from '@/features/project-creation/commands/createProject';
import { ShowProjectsListCommand } from '@/features/projects-dashboard/commands/showProjectsList';
import { CheckUpdatesCommand } from '@/features/updates/commands/checkUpdates';
import { Project } from '@/types';

export class CommandManager {
    private context: vscode.ExtensionContext;
    private stateManager: StateManager;
    private statusBar: StatusBarManager;
    private logger: Logger;
    private commands: Map<string, vscode.Disposable>;
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

        // Projects List (Home screen)
        const projectsList = new ShowProjectsListCommand(
            this.context,
            this.stateManager,
            this.statusBar,
            this.logger,
        );
        this.registerCommand('demoBuilder.showProjectsList', async () => {
            // Close other webviews when showing Projects List (tab replacement)
            ProjectDashboardWebviewCommand.disposeActivePanel();
            ConfigureProjectWebviewCommand.disposeActivePanel();
            await projectsList.execute();
        });

        // Create Project (Webview version)
        this.createProjectWebview = new CreateProjectWebviewCommand(
            this.context,
            this.stateManager,
            this.statusBar,
            this.logger,
        );
        this.registerCommand('demoBuilder.createProject', async (...args: unknown[]) => {
            // Close other webviews when starting project creation (tab replacement)
            ShowProjectsListCommand.disposeActivePanel();
            ProjectDashboardWebviewCommand.disposeActivePanel();
            ConfigureProjectWebviewCommand.disposeActivePanel();
            // Port conflicts are automatically handled during project creation
            // (see executeProjectCreation in createProjectWebview.ts)
            // args[0] may contain { importedSettings, sourceDescription } when launched from Import
            const options = args[0] as Parameters<typeof this.createProjectWebview.execute>[0] | undefined;
            await this.createProjectWebview.execute(options);
            // Show sidebar for wizard progress (after webview is loaded)
            await vscode.commands.executeCommand('workbench.view.extension.demoBuilder');
        });

        // Project Dashboard (Post-creation guide)
        const projectDashboard = new ProjectDashboardWebviewCommand(
            this.context,
            this.stateManager,
            this.statusBar,
            this.logger,
        );
        this.registerCommand('demoBuilder.showProjectDashboard', async () => {
            // Clear projects list context to show components tree in sidebar
            await vscode.commands.executeCommand('setContext', 'demoBuilder.showingProjectsList', false);
            // Update sidebar context
            if (ServiceLocator.isSidebarInitialized()) {
                const sidebarProvider = ServiceLocator.getSidebarProvider();
                await sidebarProvider.setShowingProjectsList(false);
            }
            // Note: Projects List disposal is handled by showDashboard.execute() AFTER panel creation
            await projectDashboard.execute();
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
                    // User cancelled - reopen Projects List if no project exists
                    const hasProject = await this.stateManager.hasProject();
                    if (!hasProject) {
                        this.logger.debug('[LoadProject] User cancelled, reopening Projects List');
                        await vscode.commands.executeCommand('demoBuilder.showProjectsList');
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

        // Set Recommended Zoom (120% for better visibility during demos)
        this.registerCommand('demoBuilder.setRecommendedZoom', async () => {
            const config = vscode.workspace.getConfiguration('window');
            await config.update('zoomLevel', 1, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage('Zoom set to 120% for optimal demo visibility.');
        });

        // Reset Zoom (back to 100%)
        this.registerCommand('demoBuilder.resetZoom', async () => {
            const config = vscode.workspace.getConfiguration('window');
            await config.update('zoomLevel', 0, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage('Zoom reset to 100%.');
        });

        // Toggle Sidebar (show/hide Demo Builder sidebar)
        this.registerCommand('demoBuilder.toggleSidebar', async () => {
            await vscode.commands.executeCommand('workbench.action.toggleSidebarVisibility');
        });

        // Show Sidebar (explicit show command - used by dashboard button)
        this.registerCommand('demoBuilder.showSidebar', async () => {
            await vscode.commands.executeCommand('workbench.view.extension.demoBuilder');
        });

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