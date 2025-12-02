import * as vscode from 'vscode';
import { CommandManager } from '@/commands/commandManager';
import { BaseWebviewCommand } from '@/core/base';
import { ServiceLocator } from '@/core/di';
import { initializeLogger, Logger } from '@/core/logging';
import { CommandExecutor } from '@/core/shell';
import { StateManager } from '@/core/state';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { StatusBarManager, WorkspaceWatcherManager, EnvFileWatcherService } from '@/core/vscode';
import { SidebarProvider } from '@/features/sidebar';
import { AuthenticationService } from '@/features/authentication';
import { ComponentTreeProvider } from '@/features/components/providers/componentTreeProvider';
import { parseJSON, getProjectFrontendPort } from '@/types/typeGuards';
import { AutoUpdater } from '@/utils/autoUpdater';

let logger: Logger;
let statusBar: StatusBarManager;
let stateManager: StateManager;
let autoUpdater: AutoUpdater;
let externalCommandManager: CommandExecutor;
let authenticationService: AuthenticationService;
let componentTreeProvider: ComponentTreeProvider;
let componentTreeView: vscode.TreeView<any>;

export async function activate(context: vscode.ExtensionContext) {
    // Initialize the debug logger first
    const debugLogger = initializeLogger(context);
    
    // Check for pending log replay (after Extension Host restart)
    try {
        const os = require('os');
        const path = require('path');
        const fs = require('fs').promises;
        
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
    } catch (replayError) {
        // Silently ignore errors (flag file might not exist, which is fine)
    }
    
    logger = new Logger('Demo Builder');
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
                }
            )
        );

        // Register SidebarProvider with ServiceLocator (for wizard/command access)
        ServiceLocator.setSidebarProvider(sidebarProvider);
        logger.debug('[Extension] Sidebar provider registered');

        // Register Component TreeView
        // This displays the component file browser when a project is loaded
        componentTreeProvider = new ComponentTreeProvider(stateManager, context.extensionPath);
        componentTreeView = vscode.window.createTreeView('demoBuilder.components', {
            treeDataProvider: componentTreeProvider,
            showCollapseAll: true,
        });

        // Update TreeView title when project changes
        const projectChangeSubscription = stateManager.onProjectChanged((project) => {
            if (project) {
                componentTreeView.title = project.name;
            }
            // Note: When project is undefined, we keep the TreeView (visibility is controlled
            // by the "when" clause in package.json: demoBuilder.projectLoaded && !demoBuilder.wizardActive)
        });

        // When user clicks the activity bar icon and no main webview is open,
        // auto-open the projects list as the home screen
        let isOpeningProjectsList = false;
        const treeViewVisibilitySubscription = componentTreeView.onDidChangeVisibility(async (e) => {
            // Guard against opening during webview transitions (prevents duplicate panels)
            // When switching from Projects List → Dashboard, there's a brief moment where
            // getActivePanelCount() === 0, which would incorrectly trigger this handler
            if (e.visible &&
                BaseWebviewCommand.getActivePanelCount() === 0 &&
                !isOpeningProjectsList &&
                !BaseWebviewCommand.isWebviewTransitionInProgress()) {
                isOpeningProjectsList = true;
                logger.debug('[Extension] User clicked icon with no main webview - opening projects list');
                await vscode.commands.executeCommand('demoBuilder.showProjectsList');
                isOpeningProjectsList = false;
            }
        });

        // Add to subscriptions for proper disposal
        context.subscriptions.push(componentTreeView);
        context.subscriptions.push(componentTreeProvider);
        context.subscriptions.push(projectChangeSubscription);
        context.subscriptions.push(treeViewVisibilitySubscription);
        logger.debug('[Extension] Component TreeView registered');

        // Initialize external command manager
        externalCommandManager = new CommandExecutor();

        // Register CommandExecutor with ServiceLocator (breaks circular dependencies)
        ServiceLocator.setCommandExecutor(externalCommandManager);

        // Initialize authentication service
        authenticationService = new AuthenticationService(
            context.extensionPath,
            logger,
            externalCommandManager
        );

        // Register AuthenticationService with ServiceLocator
        ServiceLocator.setAuthenticationService(authenticationService);

        // Check workspace trust
        if (!vscode.workspace.isTrusted) {
            vscode.window.showWarningMessage(
                'Demo Builder requires a trusted workspace to function properly.',
            );
            return;
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

        // Initialize auto-updater if enabled
        const autoUpdateEnabled = vscode.workspace
            .getConfiguration('demoBuilder')
            .get<boolean>('autoUpdate', true);
        
        if (autoUpdateEnabled) {
            autoUpdater = new AutoUpdater(context, logger);
            autoUpdater.checkForUpdates().catch(err => {
                // Only log non-404 errors
                if (!err.response || err.response.status !== 404) {
                    logger.debug(`Update check failed: ${err.message}`);
                }
            });
        }

        // Check for dashboard reopen flag (after workspace folder addition restart)
        let openingDashboardAfterRestart = false;
        try {
            const os = require('os');
            const path = require('path');
            const fs = require('fs').promises;
            
            const flagFile = path.join(os.homedir(), '.demo-builder', '.open-dashboard-after-restart');
            const flagExists = await fs.access(flagFile).then(() => true).catch(() => false);
            
            if (flagExists) {
                openingDashboardAfterRestart = true;
                
                // Read flag data
                const flagData = await fs.readFile(flagFile, 'utf8');
                const parsed = parseJSON<{ projectName: string; projectPath: string }>(flagData);
                if (!parsed) {
                    logger.warn('[Extension] Failed to parse dashboard flag file');
                    await fs.unlink(flagFile).catch(() => {});
                    return;
                }
                const { projectName, projectPath } = parsed;
                
                // Remove flag immediately
                await fs.unlink(flagFile).catch(() => {});
                
                logger.debug(`[Extension] Opening Project Dashboard after restart for: ${projectName}`);
                
                // Ensure project is loaded
                const project = await stateManager.getCurrentProject();
                if (project) {
                    statusBar.updateProject(project);
                    componentTreeView.title = project.name;

                    // Small delay to ensure extension is fully initialized
                    setTimeout(() => {
                        logger.debug('[Extension] Executing showProjectDashboard command...');
                        vscode.commands.executeCommand('demoBuilder.showProjectDashboard').then(
                            () => logger.debug('[Extension] Project Dashboard opened successfully'),
                            (err) => logger.error('[Extension] Failed to open Project Dashboard:', err),
                        );
                    }, 500);
                } else {
                    logger.warn(`[Extension] Could not load project from ${projectPath}, showing Welcome instead`);
                    openingDashboardAfterRestart = false;
                }
            }
        } catch (error) {
            // Silently ignore errors
            logger.debug('[Extension] No dashboard reopen flag found or error reading it');
        }

        // Normal startup - load project state for status bar and TreeView
        // Don't auto-open UI - wait for user to click the activity bar icon
        if (!openingDashboardAfterRestart) {
            // Load existing project if available (for status bar and TreeView title)
            const hasExistingProject = await stateManager.hasProject();
            if (hasExistingProject) {
                const project = await stateManager.getCurrentProject();
                if (project) {
                    statusBar.updateProject(project);
                    componentTreeView.title = project.name;
                    logger.debug(`[Extension] Loaded existing project: ${project.name}`);
                }
            }
            // Projects list opens when user clicks the activity bar icon
            // (handled by tree view visibility handler)
        }

        // Auto-check for updates on startup (if enabled)
        const autoCheck = vscode.workspace.getConfiguration('demoBuilder')
            .get<boolean>('autoUpdate', true);

        if (autoCheck) {
            // Check in background, don't block activation
            setTimeout(() => {
                vscode.commands.executeCommand('demoBuilder.checkForUpdates').then(
                    () => {
                        // Success - no action needed
                    },
                    (err: Error) => {
                        logger.debug('[Updates] Background check failed:', err);
                    },
                );
            }, TIMEOUTS.STARTUP_UPDATE_CHECK_DELAY);
        }

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