import * as vscode from 'vscode';
import { CommandManager } from './commands/commandManager';
import { StatusBarManager } from './providers/statusBar';
import { AutoUpdater } from './utils/autoUpdater';
import { Logger } from './utils/logger';
import { initializeLogger } from './utils/debugLogger';
import { StateManager } from './utils/stateManager';
import { ComponentTreeProvider } from './providers/componentTreeProvider';
import { ExternalCommandManager } from './utils/externalCommandManager';
import { BaseWebviewCommand } from './commands/baseWebviewCommand';

let logger: Logger;
let statusBar: StatusBarManager;
let stateManager: StateManager;
let autoUpdater: AutoUpdater;
let externalCommandManager: ExternalCommandManager;

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
    logger.info(`[Extension] Adobe Demo Builder v${version} starting...`);

    try {
        // Initialize state manager
        stateManager = new StateManager(context);
        await stateManager.initialize();

        // Initialize external command manager
        externalCommandManager = new ExternalCommandManager();
        

        // Check workspace trust
        if (!vscode.workspace.isTrusted) {
            vscode.window.showWarningMessage(
                'Demo Builder requires a trusted workspace to function properly.'
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
            showCollapseAll: false
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
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Check if any webviews are still open using the singleton map
            const activeWebviewCount = BaseWebviewCommand.getActivePanelCount();
            
            logger.debug(`[Extension] Webview ${webviewId} closed. Active webviews remaining: ${activeWebviewCount}`);
            
            // If no webviews are open, show Welcome to prevent user being stuck
            if (activeWebviewCount === 0) {
                logger.info('[Extension] No webviews open after disposal - opening Welcome');
                await vscode.commands.executeCommand('demoBuilder.showWelcome');
            }
        });
        
        // Note: Controls view removed - using Status Bar + Project Dashboard instead

        // Register runtime toolbar commands BEFORE creating toolbar
        // (VSCode validates commands exist when assigned to status bar items)
        context.subscriptions.push(
            vscode.commands.registerCommand('demoBuilder.showLogs', () => {
                debugLogger.toggle();
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('demoBuilder.restartDemo', async () => {
                await vscode.commands.executeCommand('demoBuilder.stopDemo');
                // Small delay to ensure clean stop
                await new Promise(resolve => setTimeout(resolve, 1000));
                await vscode.commands.executeCommand('demoBuilder.startDemo');
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('demoBuilder.openBrowser', async () => {
                const project = await stateManager.getCurrentProject();
                const port = project?.componentInstances?.['citisignal-nextjs']?.port;
                if (port) {
                    const url = `http://localhost:${port}`;
                    await vscode.env.openExternal(vscode.Uri.parse(url));
                }
            })
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
                const { projectName, projectPath } = JSON.parse(flagData);
                
                // Remove flag immediately
                await fs.unlink(flagFile).catch(() => {});
                
                logger.info(`[Extension] Opening Project Dashboard after restart for: ${projectName}`);
                
                // Ensure project is loaded
                const project = await stateManager.getCurrentProject();
                if (project) {
                    statusBar.updateProject(project);
                    
                    // Small delay to ensure extension is fully initialized
                    setTimeout(() => {
                        logger.debug('[Extension] Executing showProjectDashboard command...');
                        vscode.commands.executeCommand('demoBuilder.showProjectDashboard').then(
                            () => logger.debug('[Extension] Project Dashboard opened successfully'),
                            (err) => logger.error('[Extension] Failed to open Project Dashboard:', err)
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
                    logger.info(`[Extension] Loaded existing project: ${project.name}`);
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
                    }
                );
            } else {
                logger.debug('[Extension] Welcome screen already visible, not showing duplicate');
            }
        }

        logger.info('[Extension] Ready');

    } catch (error) {
        logger.error(`Failed to activate extension: ${error}`);
        vscode.window.showErrorMessage(
            `Demo Builder activation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
    }
}

export function deactivate() {
    logger?.info('Adobe Demo Builder extension is deactivating...');
    
    // Clean up resources
    statusBar?.dispose();
    autoUpdater?.dispose();
    stateManager?.dispose();
    externalCommandManager?.dispose();
    
    logger?.info('Adobe Demo Builder extension deactivated.');
}

// Export managers for use in commands
export function getExternalCommandManager(): ExternalCommandManager {
    return externalCommandManager;
}


function registerFileWatchers(context: vscode.ExtensionContext) {
    // Watch for .env file changes in workspace (component directories)
    const envWatcher = vscode.workspace.createFileSystemWatcher(
        '**/{.env,.env.local}',
        false, // create
        false, // change
        false  // delete
    );
    
    // Track when demo starts to suppress notifications during startup
    let demoStartTime: number | null = null;
    const STARTUP_GRACE_PERIOD = 10000; // 10 seconds grace period after demo starts
    
    // Track if notifications have been shown for current demo session
    // Show once per session, suppress subsequent changes until action taken
    let restartNotificationShown = false;
    let meshNotificationShown = false;
    
    // Track programmatic writes (from Configure screen) to suppress file watcher
    // Configure screen handles its own restart notifications
    const programmaticWrites = new Set<string>();
    
    // Track file content hashes to detect actual changes (not just file events)
    const fileContentHashes = new Map<string, string>();
    
    const crypto = require('crypto');
    const fs = require('fs');
    
    const getFileHash = async (filePath: string): Promise<string | null> => {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            return crypto.createHash('sha256').update(content).digest('hex');
        } catch (error) {
            logger.debug(`[Env Watcher] Could not read file ${filePath}:`, error);
            return null;
        }
    };
    
    // Listen for demo start events to set grace period and reset restart notification flag
    context.subscriptions.push(
        vscode.commands.registerCommand('demoBuilder._internal.demoStarted', () => {
            demoStartTime = Date.now();
            restartNotificationShown = false;
            // Note: meshNotificationShown stays unchanged (mesh doesn't auto-reset on demo restart)
            logger.debug('[Env Watcher] Demo started, grace period active for 10s, restart notification flag reset');
        })
    );
    
    // Listen for demo stop events to reset grace period and clear hashes
    context.subscriptions.push(
        vscode.commands.registerCommand('demoBuilder._internal.demoStopped', () => {
            demoStartTime = null;
            fileContentHashes.clear();
            // Note: Don't reset notification flags on stop - only on start or when action taken
            logger.debug('[Env Watcher] Demo stopped, grace period reset, file hashes cleared');
        })
    );
    
    // Listen for Configure screen to register programmatic writes
    // This allows us to ignore Configure screen's own writes (it shows its own notification)
    context.subscriptions.push(
        vscode.commands.registerCommand('demoBuilder._internal.registerProgrammaticWrites', 
            (filePaths: string[]) => {
                filePaths.forEach(fp => programmaticWrites.add(fp));
                logger.debug(`[Env Watcher] Registered ${filePaths.length} programmatic writes to ignore`);
                
                // Auto-cleanup after 5 seconds in case watcher events are delayed
                setTimeout(() => {
                    filePaths.forEach(fp => programmaticWrites.delete(fp));
                }, 5000);
            }
        )
    );
    
    // Listen for demo start to initialize file hashes (capture baseline state)
    // This ensures first manual change is detected (not just initialization)
    context.subscriptions.push(
        vscode.commands.registerCommand('demoBuilder._internal.initializeFileHashes',
            async (filePaths: string[]) => {
                logger.debug(`[Env Watcher] Initializing hashes for ${filePaths.length} files`);
                for (const filePath of filePaths) {
                    const hash = await getFileHash(filePath);
                    if (hash) {
                        fileContentHashes.set(filePath, hash);
                        logger.debug(`[Env Watcher] Initialized hash for ${filePath}: ${hash.substring(0, 8)}...`);
                    }
                }
                logger.info(`[Env Watcher] Initialized ${fileContentHashes.size} file hashes`);
            }
        )
    );
    
    // Listen for action taken events to reset notification flags
    context.subscriptions.push(
        vscode.commands.registerCommand('demoBuilder._internal.restartActionTaken', () => {
            restartNotificationShown = false;
            logger.debug('[Notification] Restart action taken, flag reset');
        })
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('demoBuilder._internal.meshActionTaken', () => {
            meshNotificationShown = false;
            logger.debug('[Notification] Mesh deployment action taken, flag reset');
        })
    );
    
    // Commands for Configure UI to check notification state
    context.subscriptions.push(
        vscode.commands.registerCommand('demoBuilder._internal.shouldShowRestartNotification', () => {
            return !restartNotificationShown;
        })
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('demoBuilder._internal.shouldShowMeshNotification', () => {
            return !meshNotificationShown;
        })
    );
    
    // Commands to mark notifications as shown
    context.subscriptions.push(
        vscode.commands.registerCommand('demoBuilder._internal.markRestartNotificationShown', () => {
            restartNotificationShown = true;
            logger.debug('[Notification] Restart notification marked as shown');
        })
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('demoBuilder._internal.markMeshNotificationShown', () => {
            meshNotificationShown = true;
            logger.debug('[Notification] Mesh notification marked as shown');
        })
    );
    
    envWatcher.onDidChange(async uri => {
        try {
            const filePath = uri.fsPath;
            logger.debug(`[Env Watcher] File system event for: ${filePath}`);
            
            // Check if we're in the demo startup grace period
            if (demoStartTime && Date.now() - demoStartTime < STARTUP_GRACE_PERIOD) {
                logger.debug('[Env Watcher] Ignoring change during demo startup grace period');
                return;
            }
            
            // Check if this is a programmatic write (Configure screen handles its own notifications)
            if (programmaticWrites.has(filePath)) {
                logger.debug('[Env Watcher] Ignoring programmatic write (Configure screen handles notification)');
                programmaticWrites.delete(filePath); // Clean up immediately
                return;
            }
            
            // Calculate current file hash
            const currentHash = await getFileHash(filePath);
            if (!currentHash) {
                logger.debug('[Env Watcher] File no longer readable, skipping');
                return;
            }
            
            // Check if this is the first time we're seeing this file
            const previousHash = fileContentHashes.get(filePath);
            if (previousHash === undefined) {
                // First time seeing this file - initialize hash without notification
                fileContentHashes.set(filePath, currentHash);
                logger.debug(`[Env Watcher] First time tracking file, initialized hash: ${currentHash.substring(0, 8)}...`);
                return;
            }
            
            // Check if content actually changed
            if (previousHash === currentHash) {
                logger.debug('[Env Watcher] ✓ File event but content unchanged (hash match), ignoring');
                return;
            }
            
            // Content actually changed - update hash and proceed
            fileContentHashes.set(filePath, currentHash);
            logger.info(`[Env Watcher] ✓ Content actually changed: ${filePath}`);
            logger.debug(`[Env Watcher] Hash changed from ${previousHash.substring(0, 8)}... to ${currentHash.substring(0, 8)}...`);
            
            // Only show restart notification if a demo is currently running
            const currentProject = await stateManager.getCurrentProject();
            if (currentProject && currentProject.status === 'running') {
                // Check if we've already shown a restart notification this session
                if (restartNotificationShown) {
                    logger.debug('[Env Watcher] Restart notification already shown this session, suppressing');
                    return;
                }
                
                logger.info('[Env Watcher] Demo is running, suggesting restart');
                restartNotificationShown = true;
                
                vscode.window.showInformationMessage(
                    'Environment configuration changed. Restart the demo to apply changes.',
                    'Restart Demo'
                ).then(selection => {
                    if (selection === 'Restart Demo') {
                        vscode.commands.executeCommand('demoBuilder.stopDemo').then(() => {
                            vscode.commands.executeCommand('demoBuilder.startDemo');
                        });
                    }
                });
            } else {
                logger.debug('[Env Watcher] No running demo, skipping restart notification');
            }
        } catch (error) {
            logger.error('[Env Watcher] Error handling file change:', error as Error);
        }
    });
    
    context.subscriptions.push(envWatcher);
}