import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { ConfigureCommand } from './configure';
import { DiagnosticsCommand } from './diagnostics';
import { OpenInClaudeCommand } from './openInClaude';
import { OpenModernizationAgentCommand } from './openModernizationAgent';
import { RefreshBlockLibraryCommand } from './refreshBlockLibrary';
import { ShowPromptsPickerCommand } from './showPromptsPicker';
import { BaseWebviewCommand } from '@/core/base';
import { ResetAiOnboardingCommand } from '@/core/commands/ResetAiOnboardingCommand';
import { ResetAllCommand } from '@/core/commands/ResetAllCommand';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { StateManager } from '@/core/state';
import { openUrl } from '@/core/utils/browserUtils';
import { ConfigureProjectWebviewCommand } from '@/features/dashboard/commands/configure';
import { ShowAiCommand } from '@/features/dashboard/commands/openAi';
import { ProjectDashboardWebviewCommand } from '@/features/dashboard/commands/showDashboard';
import { getBookmarkletSetupPageUrl } from '@/features/eds/ui/helpers/bookmarkletSetupPage';
import { getBookmarkletUrl } from '@/features/eds/utils/daLiveTokenBookmarklet';
import { DeleteProjectCommand } from '@/features/lifecycle/commands/deleteProject';
import { StartDemoCommand } from '@/features/lifecycle/commands/startDemo';
import { StopDemoCommand } from '@/features/lifecycle/commands/stopDemo';
import { SyncStorefrontCommand } from '@/features/lifecycle/commands/syncStorefront';
import { ViewStatusCommand } from '@/features/lifecycle/commands/viewStatus';
import { DeployMeshCommand } from '@/features/mesh/commands/deployMesh';
import { CreateProjectWebviewCommand } from '@/features/project-creation/commands/createProject';
import { ShowProjectsListCommand } from '@/features/projects-dashboard/commands/showProjectsList';
import { CheckUpdatesCommand } from '@/features/updates/commands/checkUpdates';
import { Project } from '@/types';
import type { Logger } from '@/types/logger';

export class CommandManager {
    private context: vscode.ExtensionContext;
    private stateManager: StateManager;
    private logger: Logger;
    private commands: Map<string, vscode.Disposable>;
    public createProjectWebview!: CreateProjectWebviewCommand;

    constructor(
        context: vscode.ExtensionContext,
        stateManager: StateManager,
        logger: Logger,
    ) {
        this.context = context;
        this.stateManager = stateManager;
        this.logger = logger;
        this.commands = new Map();
    }

    public registerCommands(): void {

        // Projects List (Home screen)
        const projectsList = new ShowProjectsListCommand(
            this.context,
            this.stateManager,
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
            this.logger,
        );
        this.registerCommand('demoBuilder.createProject', async (...args: unknown[]) => {
            // Start transition to suppress disposal side-effects (e.g., wizard re-creation)
            // execute() calls endWebviewTransition() when the new panel is ready
            await BaseWebviewCommand.startWebviewTransition();
            // Close other webviews when starting project creation (tab replacement)
            CreateProjectWebviewCommand.disposeActivePanel();
            ShowProjectsListCommand.disposeActivePanel();
            ProjectDashboardWebviewCommand.disposeActivePanel();
            ConfigureProjectWebviewCommand.disposeActivePanel();
            // Port conflicts are automatically handled during project creation
            // (see executeProjectCreation in createProjectWebview.ts)
            // args[0] may contain { importedSettings, sourceDescription } when launched from Import
            const options = args[0] as Parameters<typeof this.createProjectWebview.execute>[0] | undefined;
            await this.createProjectWebview.execute(options);
            // Wizard progress now renders inside the wizard webview's left
            // column; no sidebar reveal needed.
        });

        // Project Dashboard (Post-creation guide)
        const projectDashboard = new ProjectDashboardWebviewCommand(
            this.context,
            this.stateManager,
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
                this.logger.debug('[LoadProject] Stopping current demo before switching...');
                await vscode.commands.executeCommand('demoBuilder.stopDemo');
            }

            const project = await this.stateManager.loadProjectFromPath(projectPath);
            if (project) {
                this.logger.info(`[LoadProject] Loaded project: ${project.name}`);
                vscode.commands.executeCommand('demoBuilder.showProjectDashboard');
            } else {
                vscode.window.showErrorMessage(`Failed to load project from ${projectPath}`);
            }
        });

        // Start Demo
        const startDemo = new StartDemoCommand(
            this.context,
            this.stateManager,
            this.logger,
        );
        this.registerCommand('demoBuilder.startDemo', () => startDemo.execute());

        // Stop Demo
        const stopDemo = new StopDemoCommand(
            this.context,
            this.stateManager,
            this.logger,
        );
        this.registerCommand('demoBuilder.stopDemo', () => stopDemo.execute());

        // Delete Project
        const deleteProject = new DeleteProjectCommand(
            this.context,
            this.stateManager,
            this.logger,
        );
        this.registerCommand('demoBuilder.deleteProject', () => deleteProject.execute());

        // View Status
        const viewStatus = new ViewStatusCommand(
            this.context,
            this.stateManager,
            this.logger,
        );
        this.registerCommand('demoBuilder.viewStatus', () => viewStatus.execute());

        // Configure (Legacy - command palette)
        const configure = new ConfigureCommand(
            this.context,
            this.stateManager,
            this.logger,
        );
        this.registerCommand('demoBuilder.configure', () => configure.execute());

        // Configure Project (Webview)
        const configureProject = new ConfigureProjectWebviewCommand(
            this.context,
            this.stateManager,
            this.logger,
        );
        this.registerCommand('demoBuilder.configureProject', async () => {
            await configureProject.execute();
        });

        // Deploy Mesh
        const deployMesh = new DeployMeshCommand(
            this.context,
            this.stateManager,
            this.logger,
        );
        this.registerCommand('demoBuilder.deployMesh', () => deployMesh.execute());

        // Sync Storefront (EDS projects only — runs the same flow as the MCP
        // sync_storefront tool, with VS Code-native conflict resolution UX)
        const syncStorefront = new SyncStorefrontCommand(
            this.context,
            this.stateManager,
            this.logger,
        );
        this.registerCommand('demoBuilder.syncStorefront', () => syncStorefront.execute());

        // Refresh Block Library (EDS projects only — dashboard kebab) —
        // destructive rebuild of the DA.live authoring library from the project's
        // current component-definition.json. No package.json contribution: the
        // dashboard is the only entrypoint.
        const refreshBlockLibrary = new RefreshBlockLibraryCommand(
            this.context,
            this.stateManager,
            this.logger,
        );
        this.registerCommand('demoBuilder.refreshBlockLibrary', () => refreshBlockLibrary.execute());

        // Check Updates
        const checkUpdates = new CheckUpdatesCommand(
            this.context,
            this.stateManager,
            this.logger,
        );
        this.registerCommand('demoBuilder.checkForUpdates', () => checkUpdates.execute());

        // Open in Claude Code (CLI) — URI launch when the Claude Code extension is
        // installed; terminal launch otherwise. Pathway driven by `demoBuilder.ai.harness`.
        const openInClaude = new OpenInClaudeCommand(
            this.context,
            this.stateManager,
            this.logger,
        );
        this.registerCommand('demoBuilder.openInClaude', async (...args: unknown[]) => {
            const project = args[0] as Project | undefined;
            await openInClaude.execute(project);
        });

        // AI — harness-agnostic prompt library webview (create/edit/delete/pin).
        const openAi = new ShowAiCommand(
            this.context,
            this.stateManager,
            this.logger,
        );
        this.registerCommand('demoBuilder.openAi', async () => {
            await openAi.execute();
        });

        // Open AI Experience (chat-first) — onboarding + open the Claude Code
        // terminal/extension tab with no prompt. Delegates to openInClaude.execute().
        this.registerCommand('demoBuilder.openAiExperience', async () => {
            await openInClaude.execute();
        });

        // Show Prompts Picker — single-purpose prompt QuickPick. Replaces the
        // state-aware AiMenuCommand. Always shows the picker; selection inserts
        // via openInClaude or routes to the prompt library.
        const showPromptsPicker = new ShowPromptsPickerCommand(
            this.context,
            this.stateManager,
            this.logger,
        );
        this.registerCommand('demoBuilder.showPromptsPicker', async () => {
            await showPromptsPicker.execute();
        });

        // Open AEM Modernization Agent — launches aemcoder.adobe.io in the
        // browser. Entry point for the Mod Agent workflow described in the
        // scrape-reference-site skill.
        const openModernizationAgent = new OpenModernizationAgentCommand(
            this.context,
            this.stateManager,
            this.logger,
        );
        this.registerCommand('demoBuilder.openModernizationAgent', async () => {
            await openModernizationAgent.execute();
        });

        // Navigate — internal routing command for sidebar nav clicks.
        // Intentionally omitted from package.json contributions (not user-facing).
        this.registerCommand('demoBuilder.navigate', async (...args: unknown[]) => {
            const payload = args[0] as { target?: string } | undefined;
            switch (payload?.target) {
                case 'overview':
                    await projectDashboard.execute();
                    break;
                case 'configure':
                    await configureProject.execute();
                    break;
                case 'ai':
                    // Chat-first: open the AI experience directly. The prompt
                    // manager (openAi) stays reachable via the Prompts picker's
                    // "Manage prompts…" row.
                    await vscode.commands.executeCommand('demoBuilder.openAiExperience');
                    break;
                case 'updates':
                    await checkUpdates.execute();
                    break;
                default:
                    this.logger.warn(`[Navigate] Unknown target: ${payload?.target}`);
            }
        });

        // Reset All (Development only)
        if (this.context.extensionMode === vscode.ExtensionMode.Development) {
            const resetAll = new ResetAllCommand(
                this.context,
                this.stateManager,
                this.logger,
            );
            this.registerCommand('demoBuilder.resetAll', () => resetAll.execute());

            // Scoped: reset only AI onboarding state (flags + AI settings).
            // Doesn't touch projects, Adobe auth, or other state — for iterating
            // on the first-run AI launch experience.
            const resetAiOnboarding = new ResetAiOnboardingCommand(
                this.context,
                this.stateManager,
                this.logger,
            );
            this.registerCommand(
                'demoBuilder.resetAiOnboarding',
                () => resetAiOnboarding.execute(),
            );
        }

        // Diagnostics
        const diagnostics = new DiagnosticsCommand();
        this.registerCommand('demoBuilder.diagnostics', () => diagnostics.execute());

        // Set Recommended Zoom (120% for better visibility during demos)
        this.registerCommand('demoBuilder.setRecommendedZoom', async () => {
            const config = vscode.workspace.getConfiguration('window');
            await config.update('zoomLevel', 1, vscode.ConfigurationTarget.Global);
            await this.applyConfiguredZoomLevel(config);
            // Use status bar message for auto-dismiss (3 seconds)
            vscode.window.setStatusBarMessage('$(check) Zoom set to 120% for optimal demo visibility', 3000);
        });

        // Reset Zoom (back to 100%)
        this.registerCommand('demoBuilder.resetZoom', async () => {
            const config = vscode.workspace.getConfiguration('window');
            await config.update('zoomLevel', 0, vscode.ConfigurationTarget.Global);
            await this.applyConfiguredZoomLevel(config);
            // Use status bar message for auto-dismiss (3 seconds)
            vscode.window.setStatusBarMessage('$(check) Zoom reset to 100%', 3000);
        });

        // Toggle Sidebar (show/hide Demo Builder sidebar)
        this.registerCommand('demoBuilder.toggleSidebar', async () => {
            await vscode.commands.executeCommand('workbench.action.toggleSidebarVisibility');
        });

        // Show Sidebar (explicit show command - used by dashboard button)
        this.registerCommand('demoBuilder.showSidebar', async () => {
            await vscode.commands.executeCommand('workbench.view.extension.demoBuilder');
        });

        // DA.live Bookmarklet Setup (recall the setup page)
        this.registerCommand('demoBuilder.openDaLiveBookmarkletSetup', async () => {
            const bookmarkletUrl = getBookmarkletUrl();
            const setupPageUrl = getBookmarkletSetupPageUrl(bookmarkletUrl);
            await openUrl(setupPageUrl, 'demo-builder-bookmarklet-setup.html');
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
                try {
                    const readmePath = path.join(component.path, 'README.md');
                    await fsPromises.access(readmePath);
                    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(readmePath));
                } catch {
                    // No README, try package.json
                    try {
                        const packagePath = path.join(component.path, 'package.json');
                        await fsPromises.access(packagePath);
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
    }

    private registerCommand(command: string, callback: (...args: unknown[]) => unknown): void {
        const disposable = vscode.commands.registerCommand(command, callback);
        this.commands.set(command, disposable);
        this.context.subscriptions.push(disposable);
    }

    /**
     * Make the configured `window.zoomLevel` take effect on the current window.
     *
     * When `window.zoomPerWindow` is on (VS Code's default), Cmd+/Cmd- set a
     * transient per-window zoom that outranks the `zoomLevel` setting, so writing
     * the setting alone does nothing visible. `zoomReset` reverts the window to its
     * configured `zoomLevel`, applying the value we just wrote. In all-windows mode
     * there is no per-window override and `zoomReset` would force 100%, so it is
     * skipped there.
     */
    private async applyConfiguredZoomLevel(config: vscode.WorkspaceConfiguration): Promise<void> {
        const zoomPerWindow = config.get<boolean>('zoomPerWindow') ?? true;
        if (zoomPerWindow) {
            await vscode.commands.executeCommand('workbench.action.zoomReset');
        }
    }

    public dispose(): void {
        this.commands.forEach(disposable => disposable.dispose());
        this.commands.clear();
    }
}