import * as vscode from 'vscode';
import { CommandManager } from '@/commands/commandManager';
import { BaseWebviewCommand } from '@/core/base';
import { ServiceLocator } from '@/core/di';
import { initializeLogger, Logger } from '@/core/logging';
import { CommandExecutor } from '@/core/shell';
import { StateManager } from '@/core/state';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { StatusBarManager, WorkspaceWatcherManager, EnvFileWatcherService } from '@/core/vscode';
import { ComponentTreeProvider } from '@/features/components/providers/componentTreeProvider';
import { AuthenticationService } from '@/features/authentication';
import { parseJSON, getProjectFrontendPort } from '@/types/typeGuards';
import { AutoUpdater } from '@/utils/autoUpdater';

let logger: Logger;
let statusBar: StatusBarManager;
let stateManager: StateManager;
let autoUpdater: AutoUpdater;
let externalCommandManager: CommandExecutor;
let authenticationService: AuthenticationService;

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
        // Initialize state manager
        stateManager = new StateManager(context);
        await stateManager.initialize();

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

        // Initialize Components view (file browser)
        const componentTreeProvider = new ComponentTreeProvider(stateManager, context.extensionPath);
        const componentsView = vscode.window.createTreeView('demoBuilder.components', {
            treeDataProvider: componentTreeProvider,
            showCollapseAll: false,
        });
        context.subscriptions.push(componentsView);
        
        // Auto-show Welcome when appropriate
        // 1. When Components view becomes visible (sidebar opened)
        componentsView.onDidChangeVisibility(async (e) => {
            if (e.visible) {
                const hasProject = await stateManager.hasProject();
                const isWizardOpen = commandManager.createProjectWebview?.isVisible() || false;
                const isWelcomeOpen = commandManager.welcomeScreen?.isVisible() || false;
                
                // Only show Welcome if:
                // - No project exists
                // - Welcome isn't already open
                // - Wizard isn't currently in progress
                if (!hasProject && !isWelcomeOpen && !isWizardOpen) {
                    vscode.commands.executeCommand('demoBuilder.showWelcome');
                }
            }
        });
        
        // 2. When a webview closes, ensure user isn't left with no webviews
        BaseWebviewCommand.setDisposalCallback(async (webviewId: string) => {
            // Small delay to let disposal complete before checking
            await new Promise(resolve => setTimeout(resolve, TIMEOUTS.UI_UPDATE_DELAY));

            // Check if any webviews are still open using the singleton map
            const activeWebviewCount = BaseWebviewCommand.getActivePanelCount();

            // Don't auto-reopen Welcome if we're transitioning between webviews
            if (BaseWebviewCommand.isWebviewTransitionInProgress()) {
                return;
            }

            // If no webviews are open, show Welcome to prevent user being stuck
            if (activeWebviewCount === 0) {
                logger.debug('[Extension] No webviews open after disposal - opening Welcome');
                await vscode.commands.executeCommand('demoBuilder.showWelcome');
            }
        });
        
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

        // Normal startup - show Welcome screen if not opening dashboard
        if (!openingDashboardAfterRestart) {
            // Load existing project if available (for status bar), but don't auto-open dashboard
            const hasExistingProject = await stateManager.hasProject();
            if (hasExistingProject) {
                const project = await stateManager.getCurrentProject();
                if (project) {
                    statusBar.updateProject(project);
                    logger.debug(`[Extension] Loaded existing project: ${project.name}`);
                }
            }
            
            // Show Welcome screen on startup
            const isWelcomeVisible = commandManager.welcomeScreen?.isVisible() || false;
            
            if (!isWelcomeVisible) {
                vscode.commands.executeCommand('demoBuilder.showWelcome').then(
                    () => logger.info('[Extension] Welcome screen shown successfully'),
                    (err) => {
                        logger.error('[Extension] Failed to show welcome screen:', err);
                        vscode.window.showErrorMessage(`Failed to show welcome screen: ${err?.message || err}`);
                    },
                );
            } else {
                logger.debug('[Extension] Welcome screen already visible, not showing duplicate');
            }
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