import * as vscode from 'vscode';
import { LicenseValidator } from './license/validator';
import { CommandManager } from './commands/commandManager';
import { StatusBarManager } from './providers/statusBar';
import { AutoUpdater } from './utils/autoUpdater';
import { Logger } from './utils/logger';
import { initializeLogger } from './utils/debugLogger';
import { StateManager } from './utils/stateManager';
import { ProjectTreeProvider } from './providers/projectTreeProvider';
import { ExternalCommandManager } from './utils/externalCommandManager';

let logger: Logger;
let statusBar: StatusBarManager;
let stateManager: StateManager;
let autoUpdater: AutoUpdater;
let externalCommandManager: ExternalCommandManager;

export async function activate(context: vscode.ExtensionContext) {
    // Initialize the debug logger first
    initializeLogger(context);
    
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

        // Initialize license validator
        const licenseValidator = new LicenseValidator(context);
        const isLicensed = await licenseValidator.checkLicense();

        // Initialize status bar
        statusBar = new StatusBarManager(context, stateManager);
        statusBar.initialize();

        // Initialize command manager
        const commandManager = new CommandManager(context, stateManager, statusBar, logger);
        commandManager.registerCommands();

        // Initialize control panel tree view (shows under Explorer)
        const projectTreeProvider = new ProjectTreeProvider(stateManager);
        const treeView = vscode.window.createTreeView('demoBuilder.controls', {
            treeDataProvider: projectTreeProvider,
            showCollapseAll: false // Simple flat list, no collapse needed
        });
        context.subscriptions.push(treeView);
        
        // Set context to show/hide the panel based on project existence
        const updateTreeViewContext = async () => {
            const hasProject = await stateManager.hasProject();
            vscode.commands.executeCommand('setContext', 'demoBuilder.hasProject', hasProject);
        };
        
        // Update immediately and on state changes
        await updateTreeViewContext();
        stateManager.onProjectChanged(updateTreeViewContext);

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

        // Check for existing project in workspace
        const hasExistingProject = await stateManager.hasProject();
        if (hasExistingProject) {
            const project = await stateManager.getCurrentProject();
            if (project) {
                statusBar.updateProject(project);
                logger.info(`[Extension] Loaded existing project: ${project.name}`);
            }
        } else {
            // First time or no project - show welcome screen
            vscode.commands.executeCommand('demoBuilder.showWelcome').then(
                () => logger.info('[Extension] Welcome screen shown successfully'),
                (err) => {
                    logger.error('[Extension] Failed to show welcome screen:', err);
                    vscode.window.showErrorMessage(`Failed to show welcome screen: ${err?.message || err}`);
                }
            );
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


async function promptForLicense(): Promise<string | undefined> {
    const key = await vscode.window.showInputBox({
        prompt: 'Enter your Demo Builder license key',
        placeHolder: 'DEMO-2024-XXXXXX',
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) => {
            if (!value) {
                return 'License key is required';
            }
            if (!value.match(/^DEMO-\d{4}-[A-Z0-9]{6}$/)) {
                return 'Invalid license key format';
            }
            return undefined;
        }
    });
    
    return key;
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
    
    envWatcher.onDidChange(async uri => {
        logger.info('Environment file changed');
        
        // Only show restart notification if a demo is currently running
        const currentProject = await stateManager.getCurrentProject();
        if (currentProject && currentProject.status === 'running') {
            logger.info('Demo is running, suggesting restart');
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
            logger.debug('No running demo, skipping restart notification');
        }
    });
    
    context.subscriptions.push(envWatcher);
}