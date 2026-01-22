import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { CommandManager } from '@/commands/commandManager';
import { BaseWebviewCommand } from '@/core/base';
import { ServiceLocator } from '@/core/di';
import { initializeLogger, getLogger } from '@/core/logging';
import type { Logger } from '@/types/logger';
import { CommandExecutor } from '@/core/shell';
import { StateManager } from '@/core/state';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { StatusBarManager, WorkspaceWatcherManager, EnvFileWatcherService } from '@/core/vscode';
import { AuthenticationService } from '@/features/authentication';
import { ComponentTreeProvider } from '@/features/components/providers/componentTreeProvider';
import { SidebarProvider } from '@/features/sidebar';
import { getProjectFrontendPort } from '@/types/typeGuards';
import { AutoUpdater } from '@/utils/autoUpdater';
import { DaLiveAuthService } from '@/features/eds/services/daLiveAuthService';
import { cleanupDaLiveSitesCommand } from '@/features/eds/commands/cleanupDaLiveSites';

/**
 * Check if projects list should auto-open when activity bar icon is clicked
 *
 * SOP §10: Extracted 4-condition validation chain to named type guard
 * Auto-opens when:
 * 1. Tree view just became visible
 * 2. No webview panels are currently open
 * 3. Not already in the process of opening projects list
 * 4. Not in a webview transition (prevents duplicate panels)
 *
 * @param visible - Whether the tree view is visible
 * @param isOpeningProjectsList - Whether we're already opening the projects list
 * @returns true if projects list should auto-open
 */
function shouldAutoOpenProjectsList(
    visible: boolean,
    isOpeningProjectsList: boolean,
): boolean {
    if (!visible) return false;
    if (BaseWebviewCommand.getActivePanelCount() !== 0) return false;
    if (isOpeningProjectsList) return false;
    if (BaseWebviewCommand.isWebviewTransitionInProgress()) return false;
    return true;
}

let logger: Logger;
let statusBar: StatusBarManager;
let stateManager: StateManager;
let autoUpdater: AutoUpdater;
let externalCommandManager: CommandExecutor;
let authenticationService: AuthenticationService;
let componentTreeProvider: ComponentTreeProvider;
let componentTreeView: vscode.TreeView<any>;
let daLiveAuthService: DaLiveAuthService;

export async function activate(context: vscode.ExtensionContext) {
    // Initialize the debug logger first
    const debugLogger = initializeLogger(context);
    
    // Check for pending log replay (after Extension Host restart)
    try {
        const flagFile = path.join(os.homedir(), '.demo-builder', '.pending-log-replay');

        // Check if flag file exists
        const flagExists = await fs.access(flagFile).then(() => true).catch(() => false);
        if (flagExists) {
            // Read log file path from flag
            const logFilePath = await fs.readFile(flagFile, 'utf8');

            // Replay logs from the saved file (don't auto-show output panel)
            await debugLogger.replayLogsFromFile(logFilePath.trim());

            // Remove flag file
            await fs.unlink(flagFile);
        }
    } catch {
        // Silently ignore errors (flag file might not exist, which is fine)
    }
    
    logger = getLogger();
    const version = context.extension.packageJSON.version || '1.0.0';
    logger.debug(`[Extension] Adobe Demo Builder v${version} starting...`);

    try {
        // Initialize state manager FIRST (needed by sidebar)
        stateManager = new StateManager(context);
        await stateManager.initialize();

        // Initialize context variables for view switching
        const hasProject = await stateManager.hasProject();
        await vscode.commands.executeCommand('setContext', 'demoBuilder.projectLoaded', hasProject);
        await vscode.commands.executeCommand('setContext', 'demoBuilder.wizardActive', false);

        // Register Sidebar WebviewView EARLY to minimize blank sidebar time
        // The sidebar only needs stateManager and logger to render
        const sidebarProvider = new SidebarProvider(context, stateManager, logger);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                sidebarProvider.viewId,
                sidebarProvider,
                {
                    webviewOptions: {
                        retainContextWhenHidden: true, // Keep state when sidebar hidden
                    },
                },
            ),
        );

        // Register SidebarProvider with ServiceLocator (for wizard/command access)
        ServiceLocator.setSidebarProvider(sidebarProvider);

        // Register Component TreeView
        // This displays the component file browser when a project is loaded
        componentTreeProvider = new ComponentTreeProvider(stateManager, context.extensionPath);
        componentTreeView = vscode.window.createTreeView('demoBuilder.components', {
            treeDataProvider: componentTreeProvider,
            showCollapseAll: true,
        });

        // Listen for project changes (for potential future use)
        const projectChangeSubscription = stateManager.onProjectChanged(() => {
            // TreeView title is set via package.json "name" field
            // Visibility is controlled by "when" clause: demoBuilder.showComponents
        });

        // When user clicks the activity bar icon and no main webview is open,
        // auto-open the projects list as the home screen
        let isOpeningProjectsList = false;
        const treeViewVisibilitySubscription = componentTreeView.onDidChangeVisibility(async (e) => {
            // SOP §10: Using shouldAutoOpenProjectsList predicate instead of inline chain
            // Guard against opening during webview transitions (prevents duplicate panels)
            if (shouldAutoOpenProjectsList(e.visible, isOpeningProjectsList)) {
                isOpeningProjectsList = true;
                await vscode.commands.executeCommand('demoBuilder.showProjectsList');
                isOpeningProjectsList = false;
            }
        });

        // Add to subscriptions for proper disposal
        context.subscriptions.push(componentTreeView);
        context.subscriptions.push(componentTreeProvider);
        context.subscriptions.push(projectChangeSubscription);
        context.subscriptions.push(treeViewVisibilitySubscription);

        // Set up disposal callback to open Projects List when Dashboard closes
        // Only fires for non-transition closures (e.g., user clicking X, not Back button)
        BaseWebviewCommand.setDisposalCallback(async (webviewId: string) => {
            // Skip if we're in a transition (back button navigation handles this itself)
            if (BaseWebviewCommand.isWebviewTransitionInProgress()) {
                return;
            }
            // When Project Dashboard closes, open Projects List
            if (webviewId === 'demoBuilder.projectDashboard') {
                await vscode.commands.executeCommand('demoBuilder.showProjectsList');
            }
        });

        // Initialize external command manager
        externalCommandManager = new CommandExecutor();

        // Register CommandExecutor with ServiceLocator (breaks circular dependencies)
        ServiceLocator.setCommandExecutor(externalCommandManager);

        // Initialize authentication service
        authenticationService = new AuthenticationService(
            context.extensionPath,
            logger,
            externalCommandManager,
        );

        // Register AuthenticationService with ServiceLocator
        ServiceLocator.setAuthenticationService(authenticationService);

        // Initialize DA.live auth service (for darkalley OAuth testing)
        daLiveAuthService = new DaLiveAuthService(context);

        // Register test command for DA.live OAuth (temporary - for testing darkalley client)
        context.subscriptions.push(
            vscode.commands.registerCommand('demoBuilder.testDaLiveAuth', async () => {
                logger.info('[DA.live Auth] Testing darkalley OAuth flow...');
                try {
                    const result = await daLiveAuthService.authenticate();
                    if (result.success) {
                        vscode.window.showInformationMessage(
                            `DA.live auth successful! Email: ${result.email || 'unknown'}`,
                        );
                    } else {
                        vscode.window.showErrorMessage(
                            `DA.live auth failed: ${result.error}`,
                        );
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(
                        `DA.live auth error: ${(error as Error).message}`,
                    );
                }
            }),
        );

        // Check workspace trust
        if (!vscode.workspace.isTrusted) {
            vscode.window.showWarningMessage(
                'Demo Builder requires a trusted workspace to function properly.',
            );
            return;
        }

        // Auto-zoom for optimal demo visibility (per-window, not global)
        const demoBuilderConfig = vscode.workspace.getConfiguration('demoBuilder');
        const autoZoomEnabled = demoBuilderConfig.get<boolean>('autoZoom', true);

        if (autoZoomEnabled) {
            // Reset zoom to 100% for consistent demo experience
            await vscode.commands.executeCommand('workbench.action.zoomReset');
        }

        // Initialize status bar
        statusBar = new StatusBarManager(context, stateManager);
        statusBar.initialize();

        // Initialize command manager
        const commandManager = new CommandManager(context, stateManager, statusBar, logger);
        commandManager.registerCommands();

        // Register file watchers early (before loading projects)
        // This ensures the initializeFileHashes command exists when we need it
        registerFileWatchers(context);

        // Note: Auto-show Welcome logic removed
        // The sidebar now serves as the main navigation hub (Mission Control)
        // Users interact with the sidebar to navigate to Projects Dashboard, project details, etc.
        // The old TreeView-based welcome/components behavior is replaced by the WebviewView sidebar
        
        // Note: Controls view removed - using Status Bar + Project Dashboard instead

        // Register runtime toolbar commands BEFORE creating toolbar
        // (VSCode validates commands exist when assigned to status bar items)
        context.subscriptions.push(
            vscode.commands.registerCommand('demoBuilder.showLogs', () => {
                debugLogger.show(false); // Show Logs channel, take focus
            }),
            vscode.commands.registerCommand('demoBuilder.showDebugLogs', () => {
                debugLogger.showDebug(false); // Show Debug channel, take focus
            }),
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('demoBuilder.restartDemo', async () => {
                await vscode.commands.executeCommand('demoBuilder.stopDemo');
                // Small delay to ensure clean stop
                await new Promise(resolve => setTimeout(resolve, TIMEOUTS.DEMO_STATUS_UPDATE_DELAY));
                await vscode.commands.executeCommand('demoBuilder.startDemo');
            }),
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('demoBuilder.openBrowser', async () => {
                const project = await stateManager.getCurrentProject();
                const port = getProjectFrontendPort(project);
                if (port) {
                    const url = `http://localhost:${port}`;
                    await vscode.env.openExternal(vscode.Uri.parse(url));
                }
            }),
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('demoBuilder.cleanupDaLiveSites', cleanupDaLiveSitesCommand),
        );

        // Initialize auto-updater (but don't check yet - wait for sidebar activation)
        // Update checks are triggered when the user clicks the sidebar icon
        autoUpdater = new AutoUpdater(context, logger);

        // Clean up any stale flag files from previous versions
        // (The workspace folder addition that used this flag was removed in beta.64)
        try {
            const flagFile = path.join(os.homedir(), '.demo-builder', '.open-dashboard-after-restart');
            await fs.unlink(flagFile).catch(() => {}); // Silently remove if exists
        } catch {
            // Ignore errors
        }

        // Load existing project if available (for status bar)
        const hasExistingProject = await stateManager.hasProject();
        if (hasExistingProject) {
            const project = await stateManager.getCurrentProject();
            if (project) {
                statusBar.updateProject(project);
                logger.debug(`[Extension] Loaded existing project: ${project.name}`);
            }
        }

        // Note: Projects List auto-opens via tree view visibility handler (line 128-137)
        // when the sidebar becomes visible with no active webview panels.
        // No explicit setTimeout needed here - that would cause double-opening.

        // Note: Update checks are triggered when the sidebar is first activated
        // (see SidebarProvider.resolveWebviewView)

        logger.info('[Extension] Ready');

    } catch (error) {
        logger.error(`Failed to activate extension: ${error}`);
        vscode.window.showErrorMessage(
            `Demo Builder activation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
    }
}

export function deactivate() {
    logger.info('Adobe Demo Builder extension is deactivating...');

    // Clean up resources
    statusBar?.dispose();
    autoUpdater?.dispose();
    componentTreeView?.dispose();
    componentTreeProvider?.dispose();
    stateManager?.dispose();
    externalCommandManager?.dispose();
    daLiveAuthService?.dispose();
    // Note: authenticationService has no dispose method

    // Reset service locator
    ServiceLocator.reset();

    logger.info('Adobe Demo Builder extension deactivated.');
}

function registerFileWatchers(context: vscode.ExtensionContext) {
    // Create workspace watcher manager and env file watcher service
    const watcherManager = new WorkspaceWatcherManager();
    const envWatcherService = new EnvFileWatcherService(
        context,
        stateManager,
        watcherManager,
        logger,
    );

    // Initialize watchers for all workspace folders
    envWatcherService.initialize();

    // Register for disposal on extension deactivation
    context.subscriptions.push(envWatcherService);
    context.subscriptions.push(watcherManager);
}