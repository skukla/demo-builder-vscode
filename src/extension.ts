import * as vscode from 'vscode';
import { CommandManager } from './commands/commandManager';
import { StatusBarManager } from './providers/statusBar';
import { AutoUpdater } from './utils/autoUpdater';
import { Logger } from './utils/logger';
import { initializeLogger } from './utils/debugLogger';
import { StateManager } from './utils/stateManager';
import { ComponentTreeProvider } from './providers/componentTreeProvider';
import { ExternalCommandManager } from './utils/externalCommandManager';

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

        // Initialize Components view (file browser)
        const componentTreeProvider = new ComponentTreeProvider(stateManager, context.extensionPath);
        const componentsView = vscode.window.createTreeView('demoBuilder.components', {
            treeDataProvider: componentTreeProvider,
            showCollapseAll: false
        });
        context.subscriptions.push(componentsView);
        
        // Auto-show Welcome when Components view becomes visible (if no project and Welcome not already visible)
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
        
        // Note: Controls view removed - using Status Bar + Project Dashboard instead

        // Register runtime toolbar commands BEFORE creating toolbar
        // (VSCode validates commands exist when assigned to status bar items)
        context.subscriptions.push(
            vscode.commands.registerCommand('demoBuilder.showLogs', () => {
                debugLogger.show();
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

        // Check for "Project Dashboard" flag (after workspace addition restart)
        let showingGettingStarted = false;
        try {
            const os = require('os');
            const path = require('path');
            const fs = require('fs').promises;
            
            const flagFile = path.join(os.homedir(), '.demo-builder', '.wizard-reopen-on-success');
            const flagExists = await fs.access(flagFile).then(() => true).catch(() => false);
            
            if (flagExists) {
                showingGettingStarted = true;
                
                // Read flag data
                const flagData = await fs.readFile(flagFile, 'utf8');
                const { projectName } = JSON.parse(flagData);
                
                // Remove flag immediately
                await fs.unlink(flagFile).catch(() => {});
                
                // Close any existing Welcome webview (may persist across Extension Host restart due to retainContextWhenHidden)
                const { WelcomeWebviewCommand } = require('./commands/welcomeWebview');
                WelcomeWebviewCommand.disposeActivePanel();
                logger.debug('[Extension] Closed any stale Welcome webview from before restart');
                
                // Show Getting Started guide + auto-open Demo Builder sidebar
                logger.info(`[Extension] Showing Getting Started guide for project: ${projectName}`);
                
                // Small delay to ensure extension is fully initialized
                setTimeout(() => {
                    logger.debug('[Extension] Executing showProjectDashboard command...');
                    vscode.commands.executeCommand('demoBuilder.showProjectDashboard').then(
                        () => {
                            logger.debug('[Extension] Project Dashboard command executed successfully');
                            // Focus stays on webview (don't focus sidebar)
                        },
                        (err) => logger.error('[Extension] Getting Started command failed:', err)
                    );
                }, 500);
            }
        } catch (error) {
            // Silently ignore errors
            logger.debug('[Extension] No getting started flag found or error reading it');
        }

        // Handle startup UI based on current state
        if (showingGettingStarted) {
            // We're showing Project Dashboard after restart (post-creation) - just update status bar
            const project = await stateManager.getCurrentProject();
            if (project) {
                statusBar.updateProject(project);
                logger.info(`[Extension] Loaded existing project (Project Dashboard mode): ${project.name}`);
            }
        } else {
            // Normal startup - ALWAYS show Welcome screen first (MVP requirement)
            // User must explicitly choose to open a project or create a new one
            
            // Load existing project if available (for status bar), but don't auto-open dashboard
            const hasExistingProject = await stateManager.hasProject();
            if (hasExistingProject) {
                const project = await stateManager.getCurrentProject();
                if (project) {
                    statusBar.updateProject(project);
                    logger.info(`[Extension] Loaded existing project: ${project.name}`);
                }
            }
            
            // Always show Welcome screen on startup
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

        // Register file watchers
        registerFileWatchers(context);

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
    // Watch for .demo-builder directory
    const demoBuilderWatcher = vscode.workspace.createFileSystemWatcher(
        '**/.demo-builder/**',
        false,
        false,
        false
    );
    
    // Watch for config changes to reload state
    // Note: Individual file operations are not logged to keep logs clean and focused
    demoBuilderWatcher.onDidChange(uri => {
        // Reload state if config changed
        if (uri.fsPath.endsWith('config.yaml') || uri.fsPath.endsWith('state.json')) {
            logger.debug('Project configuration changed, reloading state');
            stateManager.reload();
        }
    });
    
    context.subscriptions.push(demoBuilderWatcher);
    
    // Watch for .env file changes (any component directory)
    const envWatcher = vscode.workspace.createFileSystemWatcher(
        '**/{.env,.env.local}',
        false,
        false,
        false
    );
    
    // Track when demo starts to suppress notifications during startup
    let demoStartTime: number | null = null;
    const STARTUP_GRACE_PERIOD = 10000; // 10 seconds grace period after demo starts
    
    // Track programmatic writes (from Configure screen) to suppress file watcher
    // Configure screen handles its own restart notifications
    const programmaticWrites = new Set<string>();
    
    // Listen for demo start events to set grace period
    context.subscriptions.push(
        vscode.commands.registerCommand('demoBuilder._internal.demoStarted', () => {
            demoStartTime = Date.now();
            logger.debug('[Env Watcher] Demo started, grace period active for 10s');
        })
    );
    
    // Listen for demo stop events to reset grace period
    context.subscriptions.push(
        vscode.commands.registerCommand('demoBuilder._internal.demoStopped', () => {
            demoStartTime = null;
            logger.debug('[Env Watcher] Demo stopped, grace period reset');
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
    
    envWatcher.onDidChange(async uri => {
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
            logger.info('[Env Watcher] Demo is running, suggesting restart');
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
    });
    
    context.subscriptions.push(envWatcher);
}