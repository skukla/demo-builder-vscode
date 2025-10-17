import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import { BaseWebviewCommand } from './baseWebviewCommand';
import { WebviewCommunicationManager } from '../utils/webviewCommunicationManager';
// Prerequisites checking is handled by PrerequisitesManager
import { PrerequisitesManager, InstallStep } from '../utils/prerequisitesManager';
import { AdobeAuthManager, AdobeOrg, AdobeProject } from '../utils/adobeAuthManager';
import { AuthState, AuthContext, AuthRequirements } from '../utils/adobeAuthTypes';
import { AdobeAuthError } from '../utils/adobeAuthErrors';
import { ComponentHandler } from './componentHandler';
import { ErrorLogger } from '../utils/errorLogger';
import { ProgressUnifier } from '../utils/progressUnifier';
import { StepLogger } from '../utils/stepLogger';
import { getExternalCommandManager } from '../extension';
import { getLogger } from '../utils/debugLogger';
import { TIMEOUTS } from '../utils/timeoutConfig';
import { withTimeout } from '../utils/promiseUtils';

export class CreateProjectWebviewCommand extends BaseWebviewCommand {
    // Prerequisites are handled by PrerequisitesManager
    private prereqManager: PrerequisitesManager;
    private authManager: AdobeAuthManager;
    private componentHandler: ComponentHandler;
    private errorLogger: ErrorLogger;
    private debugLogger = getLogger();
    private progressUnifier: ProgressUnifier;
    private stepLogger: StepLogger;
    private currentComponentSelection?: any;
    private componentsData?: any;
    private currentPrerequisites?: any[];  // Store resolved prerequisites for the session
    private currentPrerequisiteStates?: Map<number, any>;  // Track state of each prerequisite
    private isAuthenticating = false;  // Prevent multiple simultaneous auth attempts
    private apiServicesConfig?: any;  // API services detection configuration
    private projectCreationAbortController?: AbortController;  // For cancelling project creation
    private meshCreatedForWorkspace?: string;  // Track workspace ID if mesh was created (for cleanup on failure/cancellation)
    private meshExistedBeforeSession?: string;  // Track workspace ID if mesh pre-existed (prevent deletion on cancel)

    /**
     * Request Welcome reopen when wizard closes
     * Extension will check if any other webviews are open
     */
    protected shouldReopenWelcomeOnDispose(): boolean {
        return true;
    }

    constructor(
        context: vscode.ExtensionContext,
        stateManager: any,
        statusBar: any,
        logger: any
    ) {
        super(context, stateManager, statusBar, logger);
        // PrerequisitesManager is initialized with proper path
        this.prereqManager = new PrerequisitesManager(context.extensionPath, logger);
        this.authManager = new AdobeAuthManager(
            context.extensionPath, 
            logger,
            getExternalCommandManager()
        );
        this.componentHandler = new ComponentHandler(context);
        this.errorLogger = new ErrorLogger(context);
        this.progressUnifier = new ProgressUnifier(logger);
        
        // Initialize StepLogger with configuration
        const templatesPath = path.join(context.extensionPath, 'templates', 'logging.json');
        this.stepLogger = new StepLogger(logger, undefined, templatesPath);
        
        // Load wizard steps configuration for step names
        try {
            const stepsPath = path.join(context.extensionPath, 'templates', 'wizard-steps.json');
            if (fs.existsSync(stepsPath)) {
                const stepsContent = fs.readFileSync(stepsPath, 'utf8');
                const stepsConfig = JSON.parse(stepsContent);
                this.stepLogger = new StepLogger(logger, stepsConfig.steps, templatesPath);
            }
        } catch {
            // StepLogger will use defaults if config loading fails
            this.logger.debug('Could not load wizard steps for logging, using defaults');
        }

        // Load API services configuration
        try {
            const apiServicesPath = path.join(context.extensionPath, 'templates', 'api-services.json');
            if (fs.existsSync(apiServicesPath)) {
                const servicesContent = fs.readFileSync(apiServicesPath, 'utf8');
                this.apiServicesConfig = JSON.parse(servicesContent);
                this.logger.debug('Loaded API services configuration');
            }
        } catch (error) {
            this.logger.debug('Could not load API services configuration:', error);
        }
    }

    // Implement abstract methods from BaseWebviewCommand
    protected getWebviewId(): string {
        return 'demoBuilderWizard';
    }

    protected getWebviewTitle(): string {
        return 'Create Demo Project';
    }

    protected async getWebviewContent(): Promise<string> {
        const webviewPath = path.join(this.context.extensionPath, 'dist', 'webview');
        
        // Get URI for bundle
        const bundleUri = this.panel!.webview.asWebviewUri(
            vscode.Uri.file(path.join(webviewPath, 'main-bundle.js'))
        );
        
        const nonce = this.getNonce();
        const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
        
        // Build the HTML content
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' 'unsafe-eval'; style-src 'unsafe-inline' ${this.panel!.webview.cspSource}; img-src data: https:; font-src data:;">
            <title>Adobe Demo Builder</title>
            <style>
                :root {
                    /* VSCode will inject these CSS variables automatically */
                }
                body, html {
                    margin: 0;
                    padding: 0;
                    width: 100%;
                    height: 100vh;
                    overflow: hidden;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                }
                #root {
                    width: 100%;
                    height: 100%;
                }
                .loading {
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    font-weight: var(--vscode-font-weight);
                    color: var(--vscode-foreground);
                    background: var(--vscode-editor-background);
                    gap: 20px;
                }
                .spinner {
                    width: 32px;
                    height: 32px;
                    position: relative;
                    display: inline-block;
                }
                .spinner-track {
                    width: 100%;
                    height: 100%;
                    border: 3px solid var(--vscode-editorWidget-border, #e1e1e1);
                    border-radius: 50%;
                    box-sizing: border-box;
                }
                .spinner-fill {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    border: 3px solid transparent;
                    border-top-color: var(--vscode-focusBorder, #0078d4);
                    border-left-color: var(--vscode-focusBorder, #0078d4);
                    border-radius: 50%;
                    animation: spectrum-rotate 1s cubic-bezier(.25, .78, .48, .89) infinite;
                    box-sizing: border-box;
                }
                @keyframes spectrum-rotate {
                    0% { transform: rotate(-90deg); }
                    100% { transform: rotate(270deg); }
                }
            </style>
        </head>
        <body class="${isDark ? 'vscode-dark' : 'vscode-light'}">
            <div id="root">
                <div class="loading">
                    <div class="spinner">
                        <div class="spinner-track"></div>
                        <div class="spinner-fill"></div>
                    </div>
                    <div>Loading Adobe Demo Builder...</div>
                </div>
            </div>
            <script nonce="${nonce}" src="${bundleUri}"></script>
        </body>
        </html>`;
    }

    protected async getInitialData(): Promise<any> {
        // Load component defaults from defaults.json
        let componentDefaults = null;
        try {
            const defaultsPath = path.join(this.context.extensionPath, 'templates', 'defaults.json');
            if (fs.existsSync(defaultsPath)) {
                const defaultsContent = fs.readFileSync(defaultsPath, 'utf8');
                const defaults = JSON.parse(defaultsContent);
                componentDefaults = defaults.componentSelection;
                this.logger.debug(`Loaded component defaults: frontend=${componentDefaults?.frontend || 'none'}, backend=${componentDefaults?.backend || 'none'}, ${componentDefaults?.dependencies?.length || 0} dependencies`);
            }
        } catch (error) {
            this.logger.debug('Could not load component defaults:', error);
        }

        // Load wizard steps configuration
        let wizardSteps = null;
        try {
            const stepsPath = path.join(this.context.extensionPath, 'templates', 'wizard-steps.json');
            if (fs.existsSync(stepsPath)) {
                const stepsContent = fs.readFileSync(stepsPath, 'utf8');
                const stepsConfig = JSON.parse(stepsContent);
                wizardSteps = stepsConfig.steps;
                this.logger.debug(`Loaded ${wizardSteps?.length || 0} wizard steps: ${wizardSteps?.slice(0, 3).map((s: any) => s.id).join(', ')}${wizardSteps?.length > 3 ? ` ... (and ${wizardSteps.length - 3} more)` : ''}`);
            }
        } catch (error) {
            this.logger.error('Failed to load wizard steps configuration:', error as Error);
        }

        return {
            theme: vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light',
            workspacePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
            componentDefaults,
            wizardSteps
        };
    }

    protected getLoadingMessage(): string {
        return 'Loading Project Creation Wizard...';
    }

    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        // Register all message handlers
        
        // Initial ready message
        comm.on('ready', async () => {
            this.logger.debug('Wizard webview ready');
            // Note: init message is already sent by BaseWebviewCommand with getInitialData()
            // Just load components here
            await this.loadComponents();
            
            return { success: true };
        });

        // Prerequisites handling
        comm.on('check-prerequisites', async (data: any) => {
            this.logger.debug('Starting prerequisites check');
            await this.handleCheckPrerequisites(data);
            return { success: true };
        });

        comm.on('continue-prerequisites', async (data: any) => {
            this.logger.debug('Continuing with prerequisites');
            await this.continueWithPrerequisites(data?.fromIndex);
            return { success: true };
        });

        comm.on('install-prerequisite', async (data: any) => {
            // Webview sends { index, id, name }
            await this.handleInstallPrerequisite(data.index, data.version);
            return { success: true };
        });

        // Component management
        comm.on('update-component-selection', (data: any) => {
            this.currentComponentSelection = data;
            this.logger.debug(`Updated component selection: ${data.frontend || 'none'}/${data.backend || 'none'} + ${data.dependencies?.length || 0} deps + ${data.services?.length || 0} services`);
            return { success: true };
        });

        comm.on('update-components-data', (data: any) => {
            this.componentsData = data;
            this.logger.debug('Updated components data');
            return { success: true };
        });

        comm.on('loadComponents', async () => {
            await this.loadComponents();
            return { success: true };
        });

        comm.on('get-components-data', async () => {
            await this.componentHandler.handleMessage({ type: 'get-components-data' }, this.panel!);
            return { success: true };
        });

        comm.on('checkCompatibility', async (data: any) => {
            await this.componentHandler.handleMessage({ type: 'checkCompatibility', payload: data }, this.panel!);
            return { success: true };
        });

        comm.on('loadDependencies', async (data: any) => {
            await this.componentHandler.handleMessage({ type: 'loadDependencies', payload: data }, this.panel!);
            return { success: true };
        });

        comm.on('loadPreset', async (data: any) => {
            await this.componentHandler.handleMessage({ type: 'loadPreset', payload: data }, this.panel!);
            return { success: true };
        });

        comm.on('validateSelection', async (data: any) => {
            await this.componentHandler.handleMessage({ type: 'validateSelection', payload: data }, this.panel!);
            return { success: true };
        });

        // Adobe authentication
        comm.on('check-auth', async () => {
            await this.handleCheckAuth();
            return { success: true };
        });

        comm.on('authenticate', async (data: any) => {
            await this.handleAuthenticate(data?.force || false);
            return { success: true };
        });

        comm.on('cancel-auth-polling', () => {
            // Polling is now handled internally by authManager.login()
            this.isAuthenticating = false;
            this.logger.info('[Auth] Cancelled authentication request');
            return { success: true };
        });

        // Organization management
        // Note: Organization selection happens during login, not as a separate step


        comm.on('ensure-org-selected', async () => {
            await this.handleEnsureOrgSelected();
            return { success: true };
        });

        // Project management
        comm.on('get-projects', async (data: any) => {
            await this.handleGetProjects(data.orgId);
            return { success: true };
        });

        // Check required APIs (e.g., API Mesh) for the currently selected project
        comm.on('check-project-apis', async (_data: any) => {
            try {
                const result = await this.handleCheckProjectApis();
                return { success: true, ...result };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        });

        // Check API Mesh API availability (new enhanced check)
        comm.on('check-api-mesh', async (data: any) => {
            try {
                const result = await this.handleCheckApiMesh(data.workspaceId, data.selectedComponents);
                return { success: true, ...result };
            } catch (error) {
                this.logger.error('[API Mesh Check] Failed', error as Error);
                return { 
                    success: false, 
                    apiEnabled: false,
                    meshExists: false,
                    error: error instanceof Error ? error.message : String(error) 
                };
            }
        });

        // Create a new API Mesh
        comm.on('create-api-mesh', async (data: any) => {
            try {
                // Create progress callback to send updates to webview
                const onProgress = (message: string, subMessage?: string) => {
                    // Fire-and-forget sendMessage, catch errors to prevent crashes
                    comm.sendMessage('api-mesh-progress', { message, subMessage }).catch(err => {
                        this.logger.warn('[API Mesh] Failed to send progress update', err);
                    });
                };
                
                const result = await this.handleCreateApiMesh(data.workspaceId, onProgress);
                return result;
            } catch (error) {
                this.logger.error('[API Mesh Create] Failed', error as Error);
                return { 
                    success: false,
                    error: error instanceof Error ? error.message : String(error) 
                };
            }
        });

        // Delete API Mesh
        comm.on('delete-api-mesh', async (data: any) => {
            try {
                this.logger.info('[API Mesh] Deleting mesh for workspace', { workspaceId: data.workspaceId });
                
                try {
                    await this.requireAuthContext({ 
                        needsToken: true, 
                        needsOrg: true, 
                        needsProject: true, 
                        needsWorkspace: true 
                    });
                } catch (error) {
                    this.logger.warn('[API Mesh] Token expired - cannot delete mesh');
                    return {
                        success: false,
                        error: 'Your Adobe session has expired. Please refresh your authentication.'
                    };
                }
                
                const commandManager = getExternalCommandManager();
                const result = await commandManager.executeAdobeCLI(
                    'aio api-mesh delete --autoConfirmAction',
                    {
                        timeout: TIMEOUTS.API_CALL
                    }
                );
                
                if (result.code === 0) {
                    this.logger.info('[API Mesh] Mesh deleted successfully');
                    // Clear the pre-existing mesh flag since user explicitly deleted it
                    // Any new mesh created after this is NOT pre-existing
                    this.meshExistedBeforeSession = undefined;
                    this.logger.debug('[API Mesh] Cleared pre-existing mesh flag after explicit deletion');
                    return { success: true };
                } else {
                    const errorMsg = result.stderr || 'Failed to delete mesh';
                    this.logger.error('[API Mesh] Delete failed', new Error(errorMsg));
                    throw new Error(errorMsg);
                }
            } catch (error) {
                this.logger.error('[API Mesh Delete] Failed', error as Error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        });

        // Handle mesh creation cancellation
        comm.on('cancel-mesh-creation', async () => {
            try {
                this.logger.info('[API Mesh] User cancelled mesh creation');
                // Set cancellation flag if needed (for future implementation)
                // For now, just acknowledge the cancellation
                return { success: true, cancelled: true };
            } catch (error) {
                this.logger.error('[API Mesh Cancel] Failed', error as Error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        });

        // Open Adobe Console in browser (with optional direct workspace link)
        comm.on('open-adobe-console', async (data: any) => {
            try {
                let consoleUrl = 'https://developer.adobe.com/console';
                
                this.logger.info('[Adobe Console] Received data from webview', { 
                    data,
                    hasOrgId: !!data?.orgId,
                    hasProjectId: !!data?.projectId,
                    hasWorkspaceId: !!data?.workspaceId
                });
                
                // Construct direct link to workspace if IDs are provided
                if (data?.orgId && data?.projectId && data?.workspaceId) {
                    consoleUrl = `https://developer.adobe.com/console/projects/${data.orgId}/${data.projectId}/workspaces/${data.workspaceId}/details`;
                    this.logger.info('[Adobe Console] Opening workspace-specific URL', { 
                        url: consoleUrl,
                        orgId: data.orgId,
                        projectId: data.projectId, 
                        workspaceId: data.workspaceId 
                    });
                } else if (data?.orgId && data?.projectId) {
                    consoleUrl = `https://developer.adobe.com/console/projects/${data.orgId}/${data.projectId}/overview`;
                    this.logger.info('[Adobe Console] Opening project-specific URL', { 
                        url: consoleUrl,
                        orgId: data.orgId,
                        projectId: data.projectId 
                    });
                } else {
                    this.logger.info('[Adobe Console] Opening generic console URL (missing IDs)', { data });
                }
                
                await vscode.env.openExternal(vscode.Uri.parse(consoleUrl));
                return { success: true };
            } catch (error) {
                this.logger.error('[Adobe Console] Failed to open URL', error as Error);
                return { success: false };
            }
        });

        comm.on('select-project', async (data: any) => {
            this.debugLogger.debug('[Project] select-project handler called with data:', data);
            try {
                await this.handleSelectProject(data.projectId);
                this.debugLogger.debug('[Project] handleSelectProject completed successfully');
                return { success: true };
            } catch (error) {
                this.debugLogger.debug('[Project] select-project handler caught error:', error);
                this.logger.error('select-project handler failed:', error as Error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        });

        // Workspace management
        comm.on('get-workspaces', async (data: any) => {
            await this.handleGetWorkspaces(data.orgId, data.projectId);
            return { success: true };
        });

        comm.on('select-workspace', async (data: any) => {
            try {
                await this.handleSelectWorkspace(data.workspaceId);
                return { success: true };
            } catch (error) {
                this.logger.error('select-workspace handler failed:', error as Error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        });

        // Validation
        comm.on('validate', async (data: any) => {
            await this.handleValidate(data.field, data.value);
            return { success: true };
        });

        // Project creation
        comm.on('create-project', async (data: any) => {
            await this.handleCreateProject(data);
            return { success: true };
        });

        // Cancel project creation
        comm.on('cancel-project-creation', async () => {
            if (this.projectCreationAbortController) {
                this.logger.info('[Project Creation] Cancellation requested by user');
                this.projectCreationAbortController.abort();
                return { success: true, message: 'Project creation cancelled' };
            }
            return { success: false, message: 'No active project creation to cancel' };
        });

        // Cancel
        comm.on('cancel', () => {
            this.panel?.dispose();
            this.logger.info('Wizard cancelled by user');
            return { success: true };
        });

        // Open project in workspace (after project creation completes)
        comm.on('openProject', async () => {
            this.logger.info('[Project Creation] ✓ openProject message received');
            this.logger.debug(`[Project Creation] Current panel: ${this.panel ? 'exists' : 'undefined'}`);
            
            // Set transitioning flag to prevent auto-welcome during transition
            const { setWebviewTransitioning } = await import('../extension');
            setWebviewTransitioning(true);
            
            try {
                // Get current project to access path
                const project = await this.stateManager.getCurrentProject();
                
                if (!project || !project.path) {
                    this.logger.error('[Project Creation] No project found or path missing');
                    throw new Error('Project not found');
                }
                
                // Set flag to reopen dashboard after Extension Host restart
                try {
                    const os = await import('os');
                    const path = await import('path');
                    const fs = await import('fs/promises');
                    
                    const demoBuilderDir = path.join(os.homedir(), '.demo-builder');
                    await fs.mkdir(demoBuilderDir, { recursive: true });
                    
                    const flagFile = path.join(demoBuilderDir, '.open-dashboard-after-restart');
                    await fs.writeFile(flagFile, JSON.stringify({
                        projectName: project.name,
                        projectPath: project.path,
                        timestamp: Date.now()
                    }), 'utf8');
                    
                    this.logger.debug('[Project Creation] Set dashboard reopen flag');
                } catch (flagError) {
                    this.logger.warn('[Project Creation] Could not set reopen flag', flagError instanceof Error ? flagError.message : String(flagError));
                }
                
                // Close any existing Welcome webview before opening project
                const { WelcomeWebviewCommand } = await import('./welcomeWebview');
                WelcomeWebviewCommand.disposeActivePanel();
                this.logger.debug('[Project Creation] Closed Welcome webview if it was open');
                
                // Dispose this panel
                this.panel?.dispose();
                this.logger.info('[Project Creation] Wizard closed');
                
                // Add workspace folder (triggers Extension Host restart)
                this.logger.info('[Project Creation] Adding project to workspace...');
                const workspaceFolder = {
                    uri: vscode.Uri.file(project.path),
                    name: project.name
                };
                
                const added = vscode.workspace.updateWorkspaceFolders(
                    0, // Insert at beginning
                    0, // Don't delete any
                    workspaceFolder
                );
                
                if (added) {
                    this.logger.info('[Project Creation] ✓ Workspace folder added (Extension Host will restart)');
                    // Flag will auto-clear on Extension Host restart
                } else {
                    this.logger.warn('[Project Creation] Workspace folder may already exist, opening dashboard directly');
                    // If folder already exists, open dashboard directly (no restart will occur)
                    await new Promise(resolve => setTimeout(resolve, 500));
                    await vscode.commands.executeCommand('demoBuilder.showProjectDashboard');
                    // Clear transition flag after dashboard opens
                    setWebviewTransitioning(false);
                }
                
            } catch (error) {
                // Clear transition flag on error
                setWebviewTransitioning(false);
                this.logger.error('[Project Creation] Error opening project', error as Error);
                vscode.window.showErrorMessage('Failed to open project. Please use the tree view or status bar to access your project.');
            }
            
            return { success: true };
        });

        // Open project in file Explorer
        comm.on('browseFiles', async (data: any) => {
            try {
                const projectPath = data.projectPath;
                if (projectPath) {
                    await vscode.commands.executeCommand('workbench.view.explorer');
                    await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(projectPath));
                    this.logger.info('[Project Creation] Opened project in Explorer');
                }
                return { success: true };
            } catch (error) {
                this.logger.error('[Project Creation] Failed to open Explorer', error as Error);
                return { success: false, error: 'Failed to open file browser' };
            }
        });

        // Logging
        comm.on('log', (data: any) => {
            const { level, message } = data;
            switch (level) {
            case 'error':
                this.logger.error(`[Webview] ${message}`);
                break;
            case 'warn':
                this.logger.warn(`[Webview] ${message}`);
                break;
            case 'debug':
                this.logger.debug(`[Webview] ${message}`);
                break;
            default:
                this.logger.info(`[Webview] ${message}`);
            }
            return { success: true };
        });
    }

    public async execute(): Promise<void> {
        try {
            this.debugLogger.debug('[Project Creation] Initializing wizard interface...');
            this.logger.debug(`[Project Creation] execute() called. Current panel: ${this.panel ? 'exists' : 'undefined'}, comm: ${this.communicationManager ? 'exists' : 'undefined'}`);
            
            // Create or reveal panel
            await this.createOrRevealPanel();
            
            this.logger.debug(`[Project Creation] After createOrRevealPanel(). Panel: ${this.panel ? 'exists' : 'undefined'}, comm: ${this.communicationManager ? 'exists' : 'undefined'}`);
            
            // Initialize communication only if not already initialized
            // (singleton pattern: panel might already exist with active communication)
            if (!this.communicationManager) {
                this.logger.debug('[Project Creation] No communication manager, initializing...');
                await this.initializeCommunication();
                this.logger.debug('Wizard webview initialized with handshake protocol');
            } else {
                this.logger.debug('Wizard webview already initialized, reusing existing communication');
            }
            
        } catch (error) {
            this.logger.error('Failed to create webview', error as Error);
            await this.showError('Failed to create webview', error as Error);
        }
    }

    // Override dispose to clean up polling intervals
    public dispose(): void {
        // Call parent dispose
        super.dispose();
    }

    // Helper method to send feedback messages
    private async sendFeedback(
        step: string,
        status: string,
        primary: string,
        secondary?: string,
        details?: string[],
        action?: string,
        actionParams?: any
    ): Promise<void> {
        await this.sendMessage('feedback', {
            step,
            status,
            primary,
            secondary,
            details,
            action,
            actionParams,
            timestamp: Date.now()
        });
    }

    // Load components
    private async loadComponents(): Promise<void> {
        try {
            await this.componentHandler.handleMessage({ type: 'loadComponents' }, this.panel!);
        } catch (error) {
            this.logger.error('Failed to load components:', error as Error);
        }
    }

    // Prerequisites handling methods
    private async handleCheckPrerequisites(componentSelection?: any): Promise<void> {
        try {
            this.debugLogger.debug('[Prerequisites] Starting prerequisites check');

            // Store the component selection for later use
            if (componentSelection) {
                this.currentComponentSelection = componentSelection;
            }

            // Load config and get prerequisites
            const config = await this.prereqManager.loadConfig();
            // Get prerequisites and resolve dependency order
            const prerequisites = this.prereqManager.resolveDependencies(config.prerequisites || []);
            this.currentPrerequisites = prerequisites;

            // Initialize state tracking
            this.currentPrerequisiteStates = new Map();

            // Collect Node versions based on component selection
            let nodeVersionMapping: { [version: string]: string } = {};
            
            if (this.currentComponentSelection) {
                try {
                    const { ComponentRegistryManager } = await import('../utils/componentRegistry');
                    const { NodeVersionResolver } = await import('../utils/nodeVersionResolver');
                    const registryManager = new ComponentRegistryManager(this.context.extensionPath);
                    
                    // Get all component definitions
                    const componentDefs = [];
                    const allSelections = [
                        ...(this.currentComponentSelection.frontend ? [{ id: this.currentComponentSelection.frontend, type: 'frontend' }] : []),
                        ...(this.currentComponentSelection.dependencies || []).map((id: string) => ({ id, type: 'dependency' })),
                        ...(this.currentComponentSelection.appBuilder || []).map((id: string) => ({ id, type: 'app-builder' }))
                    ];
                    
                    for (const sel of allSelections) {
                        let componentDef;
                        if (sel.type === 'frontend') {
                            const frontends = await registryManager.getFrontends();
                            componentDef = frontends.find((f: any) => f.id === sel.id);
                        } else if (sel.type === 'dependency') {
                            const dependencies = await registryManager.getDependencies();
                            componentDef = dependencies.find((d: any) => d.id === sel.id);
                        } else if (sel.type === 'app-builder') {
                            const appBuilder = await registryManager.getAppBuilder();
                            componentDef = appBuilder.find((a: any) => a.id === sel.id);
                        }
                        if (componentDef) {
                            componentDefs.push(componentDef);
                        }
                    }
                    
                    // Load infrastructure items
                    const infrastructure = await registryManager.getInfrastructure();
                    
                    // Collect Node versions (no strategy, just collect)
                    const nodeVersions = NodeVersionResolver.collectVersions(componentDefs, infrastructure);
                    
                    // Build version mapping for UI (group items by version)
                    // Use component display names instead of IDs for better readability
                    for (const [componentId, version] of Object.entries(nodeVersions.components)) {
                        const componentDef = componentDefs.find((c: any) => c.id === componentId);
                        const displayName = componentDef?.name || componentId;
                        const existing = nodeVersionMapping[version.toString()];
                        if (existing) {
                            nodeVersionMapping[version.toString()] = `${existing}, ${displayName}`;
                        } else {
                            nodeVersionMapping[version.toString()] = displayName;
                        }
                    }
                    for (const [infraId, version] of Object.entries(nodeVersions.infrastructure)) {
                        const infraItem = infrastructure.find((i: any) => i.id === infraId);
                        const displayName = infraItem?.name || infraId;
                        const existing = nodeVersionMapping[version.toString()];
                        if (existing) {
                            nodeVersionMapping[version.toString()] = `${existing}, ${displayName}`;
                        } else {
                            nodeVersionMapping[version.toString()] = displayName;
                        }
                    }
                    
                    const uniqueVersions = NodeVersionResolver.getUniqueVersions(nodeVersions);
                    this.debugLogger.debug(`[Prerequisites] Node versions needed: ${uniqueVersions.join(', ')}`);
                    
                    // Set allowed Node versions in command manager for Adobe CLI detection
                    // This ensures we only scan/use project-required versions
                    const commandManager = getExternalCommandManager();
                    commandManager.setAllowedNodeVersions(uniqueVersions);
                } catch (error) {
                    this.debugLogger.debug('Failed to collect Node versions:', error);
                }
            }

            this.debugLogger.debug(`[Prerequisites] Found ${prerequisites.length} prerequisites to check`);

            // Send prerequisites list to UI so it can display them
            await this.sendMessage('prerequisites-loaded', {
                prerequisites: prerequisites.map((p, index) => ({
                    id: index,
                    name: p.name,
                    description: p.description,
                    optional: p.optional || false,
                    plugins: p.plugins,
                    requiresPassword: (p.install as any)?.requiresPassword || false,
                    isInteractive: (p.install as any)?.interactive || false
                })),
                nodeVersionMapping
            });
            
            // Small delay to ensure UI updates before we start checking
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Check each prerequisite
            for (let i = 0; i < prerequisites.length; i++) {
                const prereq = prerequisites[i];
                this.debugLogger.debug(`[Prerequisites] Checking ${prereq.name}...`);

                // Send status update
                await this.sendMessage('prerequisite-status', {
                    index: i,
                    name: prereq.name,
                    status: 'checking',
                    description: prereq.description,
                    required: !prereq.optional
                });

                // Check prerequisite with timeout error handling
                let checkResult;
                try {
                    checkResult = await this.prereqManager.checkPrerequisite(prereq);
                } catch (error) {
                    // Handle timeout or other check errors
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    const isTimeout = errorMessage.toLowerCase().includes('timed out') || 
                                     errorMessage.toLowerCase().includes('timeout');
                    
                    // Log to debug channel
                    if (isTimeout) {
                        this.debugLogger.debug('[Prerequisites] Timeout details:', { prereq: prereq.id, timeout: TIMEOUTS.PREREQUISITE_CHECK, error: errorMessage });
                    } else {
                        this.logger.warn(`[Prerequisites] ${prereq.name} check failed`);
                        this.debugLogger.debug('[Prerequisites] Check failure details:', { prereq: prereq.id, error });
                    }
                    
                    await this.sendMessage('prerequisite-status', {
                        index: i,
                        name: prereq.name,
                        status: 'error',
                        description: prereq.description,
                        required: !prereq.optional,
                        installed: false,
                        message: isTimeout 
                            ? `Check timed out after ${TIMEOUTS.PREREQUISITE_CHECK / 1000} seconds. Click Recheck to try again.`
                            : `Failed to check: ${errorMessage}`,
                        canInstall: false
                    });
                    
                    // Continue to next prerequisite
                    continue;
                }

                // For Node.js, check multiple versions if we have a mapping
                let nodeVersionStatus: { version: string; component: string; installed: boolean }[] | undefined;
                if (prereq.id === 'node' && Object.keys(nodeVersionMapping).length > 0) {
                    nodeVersionStatus = await this.prereqManager.checkMultipleNodeVersions(nodeVersionMapping);
                }

                // For per-node-version prerequisites (e.g., Adobe I/O CLI), detect partial installs across required Node majors
                let perNodeVariantMissing = false;
                const missingVariantMajors: string[] = [];
                const perNodeVersionStatus: { version: string; component: string; installed: boolean }[] = [];
                if (prereq.perNodeVersion && Object.keys(nodeVersionMapping).length > 0) {
                    const requiredMajors = Object.keys(nodeVersionMapping);
                    const commandManager = getExternalCommandManager();
                    
                    // Per-node-version checks REQUIRE fnm - skip if not installed
                    const fnmInstalled = await commandManager.commandExists('fnm');
                    if (!fnmInstalled) {
                        this.debugLogger.debug(`[Prerequisites] Skipping per-node-version checks for ${prereq.id} - fnm not installed`);
                        // Mark all required versions as NOT installed (so UI shows red X)
                        perNodeVariantMissing = true;
                        for (const major of requiredMajors) {
                            missingVariantMajors.push(major);
                            perNodeVersionStatus.push({ version: `Node ${major}`, component: '', installed: false });
                        }
                    } else {
                    
                    // For aio-cli, use direct fnm commands instead of eval wrapper to avoid shell hanging
                    // For other prerequisites, use standard approach
                    for (const major of requiredMajors) {
                        try {
                            let stdout: string;
                            let isInstalled = false;
                            
                            if (prereq.id === 'aio-cli') {
                                // Use direct fnm exec to avoid eval "$(fnm env)" wrapper that can hang
                                // 'fnm exec --using=20 aio --version' provides isolation:
                                // - fnm sets up Node 20's environment
                                // - Any command found will be from that Node version
                                // - If not installed there, command fails (no fallback to nvm/system)
                                // Therefore, success = installed in fnm's Node 20 ✓
                                const result = await commandManager.execute(
                                    `fnm exec --using=${major} ${prereq.check.command}`,
                                    { 
                                        enhancePath: true,
                                        timeout: TIMEOUTS.PREREQUISITE_CHECK
                                    }
                                );
                                stdout = result.stdout;
                                isInstalled = result.code === 0;
                            } else {
                                // Other prerequisites use standard Node version switching
                                const result = await commandManager.execute(prereq.check.command, { 
                                    useNodeVersion: major,
                                    timeout: TIMEOUTS.PREREQUISITE_CHECK
                                });
                                stdout = result.stdout;
                                isInstalled = result.code === 0;
                            }
                            
                            // Parse CLI version if regex provided
                            let cliVersion = '';
                            if (prereq.check.parseVersion && isInstalled) {
                                try {
                                    const match = stdout.match(new RegExp(prereq.check.parseVersion));
                                    if (match) cliVersion = match[1] || '';
                                } catch {
                                    // Ignore regex parse errors
                                }
                            }
                            perNodeVersionStatus.push({ version: `Node ${major}`, component: cliVersion, installed: isInstalled });
                        } catch {
                            perNodeVariantMissing = true;
                            missingVariantMajors.push(major);
                            perNodeVersionStatus.push({ version: `Node ${major}`, component: '', installed: false });
                        }
                    }
                    } // end else (fnm installed)
                }

                // Store state for this prerequisite (include nodeVersionStatus if available)
                this.currentPrerequisiteStates.set(i, {
                    prereq,
                    result: checkResult,
                    nodeVersionStatus: prereq.id === 'node' ? nodeVersionStatus : perNodeVersionStatus
                });

                // Log the result (user-facing - shows progress)
                if (checkResult.installed) {
                    this.logger.info(`[Prerequisites] ✓ ${prereq.name} is installed${checkResult.version ? ': ' + checkResult.version : ''}`);
                } else {
                    this.logger.warn(`[Prerequisites] ✗ ${prereq.name} is not installed`);
                }

                // Compute dependency gating (disable install until deps are installed)
                let depsInstalled = true;
                if (prereq.depends && prereq.depends.length > 0) {
                    depsInstalled = prereq.depends.every(depId => {
                        for (const entry of this.currentPrerequisiteStates!.values()) {
                            if (entry.prereq.id === depId) {
                                // Special handling: if dependency is Node and required majors missing, treat as not installed
                                if (depId === 'node' && entry.nodeVersionStatus && entry.nodeVersionStatus.length > 0) {
                                    const missing = entry.nodeVersionStatus.some((v: any) => !v.installed);
                                    if (missing) return false;
                                }
                                return !!entry.result?.installed;
                            }
                        }
                        return false;
                    });
                }

                // Determine overall status for Node when specific required versions are missing
                let overallStatus: 'success' | 'error' | 'warning' = checkResult.installed ? 'success' : (!prereq.optional ? 'error' : 'warning');
                let nodeMissing = false;
                if (prereq.id === 'node' && nodeVersionStatus && nodeVersionStatus.length > 0) {
                    nodeMissing = nodeVersionStatus.some(v => !v.installed);
                    if (nodeMissing) {
                        overallStatus = 'error';
                    }
                }
                // For per-node-version prerequisites (like aio-cli), determine overall status based on per-node results
                if (prereq.perNodeVersion && perNodeVersionStatus.length > 0) {
                    const allInstalled = perNodeVersionStatus.every(v => v.installed);
                    const anyInstalled = perNodeVersionStatus.some(v => v.installed);
                    
                    if (allInstalled) {
                        overallStatus = 'success';
                    } else if (anyInstalled) {
                        overallStatus = 'warning'; // Partial install
                    } else {
                        overallStatus = 'error'; // Nothing installed
                    }
                }

                // Send result with proper status values
                await this.sendMessage('prerequisite-status', {
                    index: i,
                    name: prereq.name,
                    status: overallStatus,
                    description: prereq.description,
                    required: !prereq.optional,
                    installed: checkResult.installed,
                    version: checkResult.version,
                    message: (prereq.perNodeVersion && perNodeVersionStatus && perNodeVersionStatus.some(v => v.installed))
                        ? 'Installed for versions:'
                        : (prereq.perNodeVersion && perNodeVariantMissing)
                            ? `${prereq.name} is missing in Node ${missingVariantMajors.join(', ')}. Plugin status will be checked after CLI is installed.`
                            : (checkResult.installed
                                ? `${prereq.name} is installed${checkResult.version ? ': ' + checkResult.version : ''}`
                                : `${prereq.name} is not installed`),
                    // Enable install only when dependencies are satisfied AND this prerequisite is incomplete
                    // Node: missing majors; perNodeVersion: missing any variant; Otherwise: not installed
                    canInstall: depsInstalled && (
                        (prereq.id === 'node' && nodeMissing)
                        || (prereq.perNodeVersion && perNodeVariantMissing)
                        || (!checkResult.installed && checkResult.canInstall)
                    ),
                    // Suppress plugin list until CLI is present on all required Node majors to avoid confusion
                    plugins: (prereq.perNodeVersion && perNodeVariantMissing) ? undefined : checkResult.plugins,
                    nodeVersionStatus: prereq.id === 'node' ? nodeVersionStatus : perNodeVersionStatus
                });
            }
            
            // Check if all required prerequisites are installed
            const allRequiredInstalled = Array.from(this.currentPrerequisiteStates.values())
                .filter(state => !state.prereq.optional)
                .every(state => state.result.installed);
            
            // Send completion status
            await this.sendMessage('prerequisites-complete', {
                allInstalled: allRequiredInstalled,
                prerequisites: Array.from(this.currentPrerequisiteStates.entries()).map(([id, state]) => ({
                    id,
                    name: state.prereq.name,
                    required: !state.prereq.optional,
                    installed: state.result.installed,
                    version: state.result.version,
                    canInstall: state.result.canInstall
                }))
            });
            
            // Prerequisites check complete (UI already shows status)
            this.debugLogger.debug(`[Prerequisites] Check complete. All required installed: ${allRequiredInstalled}`);
            
        } catch (error) {
            this.logger.error('Prerequisites check failed:', error as Error);
            await this.sendMessage('error', {
                message: 'Failed to check prerequisites',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    }

    private async continueWithPrerequisites(fromIndex?: number): Promise<void> {
        // Resume checking remaining prerequisites (used after an install)
        try {
            if (!this.currentPrerequisites || !this.currentPrerequisiteStates) return;

            const start = typeof fromIndex === 'number' ? fromIndex : 0;

            // Recompute Node version mapping if we have a component selection (for variant checks)
            let nodeVersionMapping: { [version: string]: string } = {};
            if (this.currentComponentSelection) {
                try {
                    const { ComponentRegistryManager } = await import('../utils/componentRegistry');
                    const registryManager = new ComponentRegistryManager(this.context.extensionPath);
                    nodeVersionMapping = await registryManager.getNodeVersionToComponentMapping(
                        this.currentComponentSelection.frontend,
                        this.currentComponentSelection.backend,
                        this.currentComponentSelection.dependencies,
                        this.currentComponentSelection.externalSystems,
                        this.currentComponentSelection.appBuilder
                    );
                } catch (error) {
                    this.logger.warn('Failed to get Node version mapping (continue):', error as Error);
                }
            }

            for (let i = start; i < this.currentPrerequisites.length; i++) {
                const prereq = this.currentPrerequisites[i];
                await this.sendMessage('prerequisite-status', {
                    index: i,
                    name: prereq.name,
                    status: 'checking',
                    description: prereq.description,
                    required: !prereq.optional
                });

                // Check prerequisite with timeout error handling
                let checkResult;
                try {
                    checkResult = await this.prereqManager.checkPrerequisite(prereq);
                } catch (error) {
                    // Handle timeout or other check errors
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    const isTimeout = errorMessage.toLowerCase().includes('timed out') || 
                                     errorMessage.toLowerCase().includes('timeout');
                    
                    // Log to all appropriate channels
                    if (isTimeout) {
                        this.logger.warn(`[Prerequisites] ${prereq.name} re-check timed out after ${TIMEOUTS.PREREQUISITE_CHECK / 1000}s`);
                        this.stepLogger.log('prerequisites', `⏱ ${prereq.name} re-check timed out (${TIMEOUTS.PREREQUISITE_CHECK / 1000}s)`, 'warn');
                        this.debugLogger.debug('[Prerequisites] Re-check timeout details:', { prereq: prereq.id, timeout: TIMEOUTS.PREREQUISITE_CHECK, error: errorMessage });
                    } else {
                        this.logger.error(`[Prerequisites] Failed to re-check ${prereq.name}:`, error as Error);
                        this.stepLogger.log('prerequisites', `✗ ${prereq.name} re-check failed: ${errorMessage}`, 'error');
                        this.debugLogger.debug('[Prerequisites] Re-check failure details:', { prereq: prereq.id, error });
                    }
                    
                    await this.sendMessage('prerequisite-status', {
                        index: i,
                        name: prereq.name,
                        status: 'error',
                        description: prereq.description,
                        required: !prereq.optional,
                        installed: false,
                        message: isTimeout 
                            ? `Check timed out after ${TIMEOUTS.PREREQUISITE_CHECK / 1000} seconds. Click Recheck to try again.`
                            : `Failed to check: ${errorMessage}`,
                        canInstall: false
                    });
                    
                    // Continue to next prerequisite
                    continue;
                }

                this.currentPrerequisiteStates.set(i, { prereq, result: checkResult });

                // Variant checks
                let nodeVersionStatus: { version: string; component: string; installed: boolean }[] | undefined;
                if (prereq.id === 'node' && Object.keys(nodeVersionMapping).length > 0) {
                    nodeVersionStatus = await this.prereqManager.checkMultipleNodeVersions(nodeVersionMapping);
                }

                let perNodeVariantMissing = false;
                const missingVariantMajors: string[] = [];
                const perNodeVersionStatus: { version: string; component: string; installed: boolean }[] = [];
                if (prereq.perNodeVersion && Object.keys(nodeVersionMapping).length > 0) {
                    const requiredMajors = Object.keys(nodeVersionMapping);
                    const commandManager = getExternalCommandManager();
                    
                    // Per-node-version checks REQUIRE fnm - skip if not installed
                    const fnmInstalled = await commandManager.commandExists('fnm');
                    if (!fnmInstalled) {
                        this.debugLogger.debug(`[Prerequisites] Skipping per-node-version checks for ${prereq.id} - fnm not installed`);
                        // Mark all required versions as NOT installed (so UI shows red X)
                        perNodeVariantMissing = true;
                        for (const major of requiredMajors) {
                            missingVariantMajors.push(major);
                            perNodeVersionStatus.push({ version: `Node ${major}`, component: '', installed: false });
                        }
                    } else {
                    for (const major of requiredMajors) {
                        try {
                            const { stdout } = await commandManager.execute(prereq.check.command, { useNodeVersion: major });
                            // Parse CLI version if regex provided
                            let cliVersion = '';
                            if (prereq.check.parseVersion) {
                                try {
                                    const match = stdout.match(new RegExp(prereq.check.parseVersion));
                                    if (match) cliVersion = match[1] || '';
                                } catch {
                                    // Ignore regex parse errors
                                }
                            }
                            perNodeVersionStatus.push({ version: `Node ${major}`, component: cliVersion, installed: true });
                        } catch {
                            perNodeVariantMissing = true;
                            missingVariantMajors.push(major);
                            perNodeVersionStatus.push({ version: `Node ${major}`, component: '', installed: false });
                        }
                    }
                    } // end else (fnm installed)
                }

                // Dependency gating
                let depsInstalled = true;
                if (prereq.depends && prereq.depends.length > 0) {
                    depsInstalled = prereq.depends.every((depId: string) => {
                        for (const entry of this.currentPrerequisiteStates!.values()) {
                            if (entry.prereq.id === depId) {
                                if (depId === 'node' && entry.nodeVersionStatus && entry.nodeVersionStatus.length > 0) {
                                    const missing = entry.nodeVersionStatus.some((v: any) => !v.installed);
                                    if (missing) return false;
                                }
                                return !!entry.result?.installed;
                            }
                        }
                        return false;
                    });
                }

                // Overall status and canInstall
                let overallStatus: 'success' | 'error' | 'warning' = checkResult.installed ? 'success' : (!prereq.optional ? 'error' : 'warning');
                let nodeMissing = false;
                if (prereq.id === 'node' && nodeVersionStatus && nodeVersionStatus.length > 0) {
                    nodeMissing = nodeVersionStatus.some(v => !v.installed);
                    if (nodeMissing) overallStatus = 'error';
                }
                if (prereq.perNodeVersion && perNodeVariantMissing) overallStatus = 'error';

                // Persist nodeVersionStatus to state for downstream gating
                this.currentPrerequisiteStates.set(i, { prereq, result: checkResult, nodeVersionStatus });

                await this.sendMessage('prerequisite-status', {
                    index: i,
                    name: prereq.name,
                    status: overallStatus,
                    description: prereq.description,
                    required: !prereq.optional,
                    installed: checkResult.installed,
                    version: checkResult.version,
                    message: (prereq.perNodeVersion && perNodeVariantMissing)
                        ? `${prereq.name} is missing in Node ${missingVariantMajors.join(', ')}`
                        : (checkResult.installed
                            ? `${prereq.name} is installed${checkResult.version ? ': ' + checkResult.version : ''}`
                            : `${prereq.name} is not installed`),
                    canInstall: depsInstalled && (
                        (prereq.id === 'node' && nodeMissing)
                        || (prereq.perNodeVersion && perNodeVariantMissing)
                        || (!checkResult.installed && checkResult.canInstall)
                    ),
                    plugins: checkResult.plugins,
                    nodeVersionStatus
                });
            }

            const allRequiredInstalled = Array.from(this.currentPrerequisiteStates.values())
                .filter(state => !state.prereq.optional)
                .every(state => state.result.installed);

            await this.sendMessage('prerequisites-complete', {
                allInstalled: allRequiredInstalled
            });
        } catch (error) {
            this.logger.error('Failed to continue prerequisites:', error as Error);
        }
    }

    private async handleInstallPrerequisite(prereqId: number, version?: string): Promise<void> {
        try {
            const state = this.currentPrerequisiteStates?.get(prereqId);
            if (!state) {
                throw new Error(`Prerequisite state not found for ID ${prereqId}`);
            }
            
            const { prereq } = state;
            // Log to debug channel
            this.debugLogger.debug('[Prerequisites] install-prerequisite payload', { id: prereqId, name: prereq.name, version });
            
            // Resolve install steps from config
            const nodeVersions = this.currentComponentSelection
                ? await (async () => {
                    try {
                        const { ComponentRegistryManager } = await import('../utils/componentRegistry');
                        const registryManager = new ComponentRegistryManager(this.context.extensionPath);
                        const mapping = await registryManager.getRequiredNodeVersions(
                            this.currentComponentSelection.frontend,
                            this.currentComponentSelection.backend,
                            this.currentComponentSelection.dependencies,
                            this.currentComponentSelection.externalSystems,
                            this.currentComponentSelection.appBuilder
                        );
                        return Array.from(mapping);
                    } catch {
                        return [] as string[];
                    }
                })()
                : [];

            const installPlan = this.prereqManager.getInstallSteps(prereq, {
                nodeVersions: prereq.perNodeVersion
                    ? nodeVersions
                    : (prereq.id === 'node' ? (version ? [version] : undefined) : undefined)
            });

            if (!installPlan) {
                throw new Error(`No installation steps defined for ${prereq.name}`);
            }

            if (installPlan.manual && installPlan.url) {
                await this.sendMessage('prerequisite-status', {
                    index: prereqId,
                    name: prereq.name,
                    status: 'warning',
                    message: `Manual installation required. Open: ${installPlan.url}`,
                    required: !prereq.optional
                });
                await vscode.env.openExternal(vscode.Uri.parse(installPlan.url));
                return;
            }
            
            // Handle interactive installations (requires user input in terminal)
            if ((prereq.install as any)?.interactive) {
                await this.handleInteractiveInstall(prereqId, prereq, installPlan.steps || []);
                return;
            }

            const steps = installPlan.steps || [];

            // If Node requires additional versions (multi-version case), surface Install when any required version missing
            if (prereq.id === 'node') {
                const mapping = this.currentComponentSelection
                    ? await (async () => {
                        try {
                            const { ComponentRegistryManager } = await import('../utils/componentRegistry');
                            const registryManager = new ComponentRegistryManager(this.context.extensionPath);
                            return await registryManager.getNodeVersionToComponentMapping(
                                this.currentComponentSelection.frontend,
                                this.currentComponentSelection.backend,
                                this.currentComponentSelection.dependencies,
                                this.currentComponentSelection.externalSystems,
                                this.currentComponentSelection.appBuilder
                            );
                        } catch {
                            return {} as { [version: string]: string };
                        }
                    })()
                    : {};
                const requiredMajors = Object.keys(mapping);
                if (requiredMajors.length > 0) {
                    // ensure steps include per required version when not installed; ProgressUnifier handles template replacement
                }
            }

            // Execute steps with unified progress. For Node multi-version, iterate missing majors.
            let targetVersions: string[] | undefined = undefined;
            if (prereq.id === 'node') {
                // Determine missing majors from mapping
                let mapping: { [version: string]: string } = {};
                try {
                    const { ComponentRegistryManager } = await import('../utils/componentRegistry');
                    const registryManager = new ComponentRegistryManager(this.context.extensionPath);
                    mapping = await registryManager.getNodeVersionToComponentMapping(
                        this.currentComponentSelection?.frontend,
                        this.currentComponentSelection?.backend,
                        this.currentComponentSelection?.dependencies,
                        this.currentComponentSelection?.externalSystems,
                        this.currentComponentSelection?.appBuilder
                    );
                } catch {
                    // Use empty mapping if component registry fails
                }
                const nodeStatus = Object.keys(mapping).length > 0
                    ? await this.prereqManager.checkMultipleNodeVersions(mapping)
                    : undefined;
                const missingMajors = nodeStatus
                    ? Object.keys(mapping).filter(m => !nodeStatus.some(s => s.version.startsWith(`Node ${m}`) && s.installed))
                    : [];
                targetVersions = missingMajors.length > 0 ? missingMajors : (version ? [version] : undefined);
            } else if (prereq.perNodeVersion) {
                // For per-node-version prerequisites, check which Node versions are missing this prereq
                const commandManager = getExternalCommandManager();
                const missingNodeVersions: string[] = [];
                
                for (const nodeVer of nodeVersions) {
                    const result = await commandManager.execute(prereq.check.command, { useNodeVersion: nodeVer });
                    if (result.code === 0) {
                        // Already installed for this Node version
                        this.debugLogger.debug(`[Prerequisites] ${prereq.name} already installed for Node ${nodeVer}, skipping`);
                    } else {
                        // Missing for this Node version
                        this.debugLogger.debug(`[Prerequisites] ${prereq.name} not found for Node ${nodeVer}, will install`);
                        missingNodeVersions.push(nodeVer);
                    }
                }
                
                targetVersions = missingNodeVersions.length > 0 ? missingNodeVersions : (version ? [version] : []);
            }

            // Calculate total steps:
            // - For multi-version installs: (install steps × versions) + default steps
            // - For single/no version: all steps
            let total: number;
            if (targetVersions && targetVersions.length > 1) {
                const installSteps = steps.filter(s => !s.name.toLowerCase().includes('default'));
                const defaultSteps = steps.filter(s => s.name.toLowerCase().includes('default'));
                total = (installSteps.length * targetVersions.length) + defaultSteps.length;
            } else {
                total = steps.length * (targetVersions && targetVersions.length ? targetVersions.length : 1);
            }
            let counter = 0;
            const run = async (step: InstallStep, ver?: string) => {
                // Debug before step
                this.debugLogger.debug(`[Prerequisites] Executing step: ${step.name}${ver ? ` (Node ${ver})` : ''}`);
                await this.progressUnifier.executeStep(
                    step,
                    counter,
                    total,
                    async (progress) => {
                        await this.sendMessage('prerequisite-status', {
                            index: prereqId,
                            name: prereq.name,
                            status: 'checking',
                            message: ver ? `${step.message} for Node ${ver}` : step.message,
                            required: !prereq.optional,
                            unifiedProgress: progress
                        });
                    },
                    ver ? { nodeVersion: ver } : undefined
                );
                counter++;
                // Debug after step
                this.debugLogger.debug(`[Prerequisites] Completed step: ${step.name}${ver ? ` (Node ${ver})` : ''}`);
            };

            if (targetVersions && targetVersions.length) {
                // For multi-version installs (like Node.js), run installation steps for all versions,
                // but only run "set default" step for the last version
                const installSteps = steps.filter(s => !s.name.toLowerCase().includes('default'));
                const defaultSteps = steps.filter(s => s.name.toLowerCase().includes('default'));
                
                // Install all versions
                for (const ver of targetVersions) {
                    for (const step of installSteps) {
                        await run(step, ver);
                    }
                }
                
                // Set only the last version as default
                if (defaultSteps.length > 0) {
                    const lastVersion = targetVersions[targetVersions.length - 1];
                    for (const step of defaultSteps) {
                        await run(step, lastVersion);
                    }
                }
            } else {
                for (const step of steps) {
                    await run(step);
                }
            }

            // Re-check after installation and include variant details/messages
            let installResult;
            try {
                installResult = await this.prereqManager.checkPrerequisite(prereq);
            } catch (error) {
                // Handle timeout or other check errors during verification
                const errorMessage = error instanceof Error ? error.message : String(error);
                const isTimeout = errorMessage.toLowerCase().includes('timed out') || 
                                 errorMessage.toLowerCase().includes('timeout');
                
                // Log to all appropriate channels
                if (isTimeout) {
                    this.logger.warn(`[Prerequisites] ${prereq.name} verification timed out after ${TIMEOUTS.PREREQUISITE_CHECK / 1000}s`);
                    this.stepLogger.log('prerequisites', `⏱ ${prereq.name} verification timed out (${TIMEOUTS.PREREQUISITE_CHECK / 1000}s) - installation may have succeeded`, 'warn');
                    this.debugLogger.debug('[Prerequisites] Verification timeout details:', { prereq: prereq.id, timeout: TIMEOUTS.PREREQUISITE_CHECK, error: errorMessage });
                } else {
                    this.logger.error(`[Prerequisites] Failed to verify ${prereq.name} after installation:`, error as Error);
                    this.stepLogger.log('prerequisites', `✗ ${prereq.name} verification failed: ${errorMessage}`, 'error');
                    this.debugLogger.debug('[Prerequisites] Verification failure details:', { prereq: prereq.id, error });
                    
                    // Log to error channel for critical errors
                    try {
                        this.errorLogger.logError(error as Error, `Prerequisite Verification - ${prereq.name}`, true);
                    } catch {
                        // Ignore errors from error logger
                    }
                }
                
                await this.sendMessage('prerequisite-status', {
                    index: prereqId,
                    name: prereq.name,
                    status: 'warning',
                    description: prereq.description,
                    required: !prereq.optional,
                    installed: false,
                    message: isTimeout 
                        ? `Installation completed but verification timed out after ${TIMEOUTS.PREREQUISITE_CHECK / 1000} seconds. Click Recheck to verify.`
                        : `Installation completed but verification failed: ${errorMessage}. Click Recheck to verify.`,
                    canInstall: false
                });
                return;
            }

            let finalNodeVersionStatus: { version: string; component: string; installed: boolean }[] | undefined;
            let finalPerNodeVersionStatus: { version: string; component: string; installed: boolean }[] | undefined;
            if (prereq.id === 'node') {
                // Build mapping and check installed status per required major
                let mapping: { [version: string]: string } = {};
                try {
                    const { ComponentRegistryManager } = await import('../utils/componentRegistry');
                    const registryManager = new ComponentRegistryManager(this.context.extensionPath);
                    mapping = await registryManager.getNodeVersionToComponentMapping(
                        this.currentComponentSelection?.frontend,
                        this.currentComponentSelection?.backend,
                        this.currentComponentSelection?.dependencies,
                        this.currentComponentSelection?.externalSystems,
                        this.currentComponentSelection?.appBuilder
                    );
                } catch {
                    // Use empty mapping if component registry fails
                }
                if (Object.keys(mapping).length > 0) {
                    finalNodeVersionStatus = await this.prereqManager.checkMultipleNodeVersions(mapping);
                }
            } else if (prereq.perNodeVersion) {
                // For per-node-version prerequisites (e.g., Adobe I/O CLI), re-check under each required Node major
                let mapping: { [version: string]: string } = {};
                try {
                    const { ComponentRegistryManager } = await import('../utils/componentRegistry');
                    const registryManager = new ComponentRegistryManager(this.context.extensionPath);
                    mapping = await registryManager.getNodeVersionToComponentMapping(
                        this.currentComponentSelection?.frontend,
                        this.currentComponentSelection?.backend,
                        this.currentComponentSelection?.dependencies,
                        this.currentComponentSelection?.externalSystems,
                        this.currentComponentSelection?.appBuilder
                    );
                } catch {
                    // Use empty mapping if component registry fails
                }
                const requiredMajors = Object.keys(mapping);
                if (requiredMajors.length > 0) {
                    const commandManager = getExternalCommandManager();
                    
                    // Per-node-version checks REQUIRE fnm - skip if not installed
                    const fnmInstalled = await commandManager.commandExists('fnm');
                    if (!fnmInstalled) {
                        this.debugLogger.debug(`[Prerequisites] Skipping per-node-version verification for ${prereq.id} - fnm not installed`);
                        // Mark all required versions as NOT installed (so UI shows red X)
                        finalPerNodeVersionStatus = [];
                        for (const major of requiredMajors) {
                            finalPerNodeVersionStatus.push({ version: `Node ${major}`, component: '', installed: false });
                        }
                    } else {
                    finalPerNodeVersionStatus = [];
                    for (const major of requiredMajors) {
                        const result = await commandManager.execute(prereq.check.command, { useNodeVersion: major });
                        let cliVersion = '';
                        const isInstalled = result.code === 0;
                        
                        // Parse CLI version if regex provided and command succeeded
                        if (isInstalled && prereq.check.parseVersion) {
                            try {
                                const match = result.stdout.match(new RegExp(prereq.check.parseVersion));
                                if (match) cliVersion = match[1] || '';
                            } catch {
                                // Ignore regex parse errors
                            }
                        }
                        
                        finalPerNodeVersionStatus.push({ version: `Node ${major}`, component: cliVersion, installed: isInstalled });
                    }
                    } // end else (fnm installed)
                }
            }

            // For perNodeVersion prerequisites, update overall status based on per-node results
            if (prereq.perNodeVersion && finalPerNodeVersionStatus && finalPerNodeVersionStatus.length > 0) {
                const allInstalled = finalPerNodeVersionStatus.every(s => s.installed);
                const anyInstalled = finalPerNodeVersionStatus.some(s => s.installed);
                
                if (allInstalled) {
                    // All Node versions have the CLI installed
                    installResult.installed = true;
                    installResult.version = finalPerNodeVersionStatus[0]?.component || undefined;
                } else if (anyInstalled) {
                    // Some Node versions have the CLI (partial install)
                    installResult.installed = false;
                } else {
                    // No Node versions have the CLI
                    installResult.installed = false;
                }
            }

            this.currentPrerequisiteStates!.set(prereqId, { prereq, result: installResult, nodeVersionStatus: finalNodeVersionStatus });

            const finalMessage = (prereq.id === 'node' && finalNodeVersionStatus && finalNodeVersionStatus.length > 0)
                ? finalNodeVersionStatus.every(s => s.installed)
                    ? `${prereq.name} is installed: ${finalNodeVersionStatus.map(s => s.version).join(', ')}`
                    : `${prereq.name} is missing in ${finalNodeVersionStatus.filter(s => !s.installed).map(s => s.version.replace('Node ', 'Node ')).join(', ')}`
                : (prereq.perNodeVersion && finalPerNodeVersionStatus && finalPerNodeVersionStatus.length > 0)
                    ? finalPerNodeVersionStatus.every(s => s.installed)
                        ? `${prereq.name} is installed${installResult.version ? ` (${installResult.version})` : ''} for all required Node versions`
                        : finalPerNodeVersionStatus.some(s => s.installed)
                            ? `${prereq.name} is partially installed (missing in ${finalPerNodeVersionStatus.filter(s => !s.installed).map(s => s.version).join(', ')})`
                            : `${prereq.name} is not installed in any required Node version`
                    : (installResult.installed
                        ? `${prereq.name} is installed${installResult.version ? ': ' + installResult.version : ''}`
                        : `${prereq.name} is not installed`);

            // Log result to debug channel
            this.debugLogger.debug(`[Prerequisites] ${prereq.name} installation ${installResult.installed ? 'succeeded' : 'incomplete'}`, { nodeVersionStatus: finalNodeVersionStatus });

            await this.sendMessage('prerequisite-status', {
                index: prereqId,
                name: prereq.name,
                status: installResult.installed ? 'success' : (!prereq.optional ? 'error' : 'warning'),
                description: prereq.description,
                required: !prereq.optional,
                installed: installResult.installed,
                version: installResult.version,
                message: finalMessage,
                canInstall: !installResult.installed,
                plugins: installResult.plugins,
                // Include per-node-version status for CLI and per-version status for Node
                nodeVersionStatus: prereq.id === 'node' ? finalNodeVersionStatus : finalPerNodeVersionStatus
            });

            // Continue checking remaining prerequisites from the next index
            await this.sendMessage('prerequisite-install-complete', { index: prereqId, continueChecking: true });
            
        } catch (error) {
            this.logger.error(`Failed to install prerequisite ${prereqId}:`, error as Error);
            // Surface to error channel with context
            try {
                this.errorLogger.logError(error as Error, 'Prerequisite Installation', true);
            } catch {
                // Ignore errors from error logger
            }
            await this.sendMessage('prerequisite-status', {
                index: prereqId,
                status: 'error',
                message: error instanceof Error ? error.message : String(error),
                canInstall: true  // Allow retry
            });
            // CRITICAL: Always send install-complete to reset UI state
            await this.sendMessage('prerequisite-install-complete', { index: prereqId, continueChecking: false });
        }
    }
    
    /**
     * Handle interactive installations that require user input (e.g., Homebrew)
     * Opens terminal and runs command, letting user interact directly
     */
    private async handleInteractiveInstall(prereqId: number, prereq: any, steps: any[]): Promise<void> {
        try {
            if (!steps || steps.length === 0) {
                throw new Error('No installation steps provided');
            }
            
            const step = steps[0]; // Interactive installs typically have one step
            let command = Array.isArray(step.commands) ? step.commands[0] : step.commands;
            
            // For Homebrew, add completion/failure signals
            let completionMarkerPath: string | undefined;
            let failureMarkerPath: string | undefined;
            if (prereq.id === 'homebrew') {
                const timestamp = Date.now();
                completionMarkerPath = path.join(os.tmpdir(), `demo-builder-homebrew-${timestamp}.complete`);
                failureMarkerPath = path.join(os.tmpdir(), `demo-builder-homebrew-${timestamp}.failed`);
                // Append success/failure markers: write success OR failure based on exit code
                command = `${command} && echo "SUCCESS" > "${completionMarkerPath}" || echo "FAILED" > "${failureMarkerPath}"`;
                this.debugLogger.debug(`[Prerequisites] Added completion markers`, { completionMarkerPath, failureMarkerPath });
            }
            
            // Log to all channels
            this.logger.info(`[Prerequisites] Starting interactive installation for: ${prereq.name}`);
            this.stepLogger.log('prerequisites', `Installing ${prereq.name} (interactive - requires user input)`, 'info');
            this.debugLogger.debug(`[Prerequisites] Opening terminal for interactive install`, { 
                prereq: prereq.id, 
                name: prereq.name,
                command: command.substring(0, 100) + '...' // truncate for security
            });
            
            // Create a dedicated, disposable terminal for this prerequisite installation
            // This ensures clean output and makes it clear what's happening
            const terminalName = prereq.id === 'homebrew' 
                ? 'Homebrew Installation' 
                : `${prereq.name} Installation`;
            
            const terminal = vscode.window.createTerminal({
                name: terminalName,
                cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
            });
            
            terminal.show(true); // Show and focus terminal
            
            // Send command to terminal
            terminal.sendText(command);
            
            this.debugLogger.debug(`[Prerequisites] Terminal opened and command sent`, { 
                prereq: prereq.id,
                terminalName 
            });
            
            // Update status with instructions from step
            await this.sendMessage('prerequisite-status', {
                index: prereqId,
                name: prereq.name,
                status: 'checking',
                message: step.message || 'Installing in terminal - follow the prompts',
                required: !prereq.optional,
                instructions: step.instructions || []
            });
            
            this.logger.info(`[Prerequisites] Interactive installation initiated. Monitoring for completion...`);
            this.stepLogger.log('prerequisites', `⏸ ${prereq.name}: Waiting for user to complete installation in terminal`, 'info');
            
            // Start monitoring for installation completion (Homebrew-specific)
            if (prereq.id === 'homebrew' && completionMarkerPath && failureMarkerPath) {
                this.monitorHomebrewInstallation(prereqId, prereq, terminal, completionMarkerPath, failureMarkerPath);
            }
            
        } catch (error) {
            this.logger.error(`[Prerequisites] Interactive installation failed for ${prereq.name}`, error as Error);
            this.stepLogger.log('prerequisites', `✗ ${prereq.name} interactive installation failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
            this.debugLogger.debug('[Prerequisites] Interactive installation error details:', { prereq: prereq.id, error });
            
            await this.sendMessage('prerequisite-status', {
                index: prereqId,
                name: prereq.name,
                status: 'error',
                message: `Failed to start installation: ${error instanceof Error ? error.message : String(error)}`,
                required: !prereq.optional
            });
        }
    }

    private async monitorHomebrewInstallation(prereqId: number, prereq: any, terminal: vscode.Terminal, completionMarkerPath: string, failureMarkerPath: string): Promise<void> {
        this.logger.info('[Prerequisites] Monitoring for Homebrew installation completion via file markers');
        this.debugLogger.debug(`[Prerequisites] Watching for markers`, { completionMarkerPath, failureMarkerPath });
        
        // Set up timeout fallback (2 minutes - should be plenty since we detect success/failure instantly)
        // Timeout only triggers if: user cancels (Ctrl+C), closes terminal, or script hangs
        const timeoutDuration = 2 * 60 * 1000;
        const timeoutHandle = setTimeout(() => {
            this.logger.warn('[Prerequisites] Homebrew installation monitoring timed out (no completion signal received).');
            this.stepLogger.log('prerequisites', '⏸ Homebrew: Installation appears incomplete. If you cancelled or closed the terminal, click Install to try again.', 'info');
        }, timeoutDuration);
        
        // Watch the tmp directory for completion or failure markers
        const watchDir = path.dirname(completionMarkerPath);
        const successFilename = path.basename(completionMarkerPath);
        const failureFilename = path.basename(failureMarkerPath);
        
        try {
            // Check if markers already exist (fast completion/failure)
            try {
                await fsPromises.access(completionMarkerPath, fs.constants.F_OK);
                // Success file exists! Installation completed before we started watching
                this.debugLogger.debug('[Prerequisites] Success marker found immediately');
                clearTimeout(timeoutHandle);
                await this.handleHomebrewInstallationComplete(prereq, terminal, completionMarkerPath, failureMarkerPath);
                return;
            } catch {
                // Success file doesn't exist yet, check for failure
            }
            
            try {
                await fsPromises.access(failureMarkerPath, fs.constants.F_OK);
                // Failure file exists! Installation failed before we started watching
                this.debugLogger.debug('[Prerequisites] Failure marker found immediately');
                clearTimeout(timeoutHandle);
                await this.handleHomebrewInstallationFailure(prereqId, prereq, terminal, completionMarkerPath, failureMarkerPath);
                return;
            } catch {
                // Neither file exists yet, start watching
            }
            
            const watcher = fs.watch(watchDir, async (eventType, filename) => {
                this.debugLogger.debug(`[Prerequisites] File system event: ${eventType} ${filename}`);
                
                if ((eventType === 'rename' || eventType === 'change')) {
                    if (filename === successFilename) {
                        // Success marker detected!
                        this.logger.info('[Prerequisites] ✓ Homebrew installation completion detected!');
                        
                        // Clean up
                        clearTimeout(timeoutHandle);
                        watcher.close();
                        
                        // Small delay to ensure file write is complete
                        await new Promise(resolve => setTimeout(resolve, 100));
                        
                        // Handle completion
                        await this.handleHomebrewInstallationComplete(prereq, terminal, completionMarkerPath, failureMarkerPath);
                    } else if (filename === failureFilename) {
                        // Failure marker detected!
                        this.logger.warn('[Prerequisites] ✗ Homebrew installation failure detected');
                        
                        // Clean up
                        clearTimeout(timeoutHandle);
                        watcher.close();
                        
                        // Small delay to ensure file write is complete
                        await new Promise(resolve => setTimeout(resolve, 100));
                        
                        // Handle failure
                        await this.handleHomebrewInstallationFailure(prereqId, prereq, terminal, completionMarkerPath, failureMarkerPath);
                    }
                }
            });
            
            // Store watcher for potential cleanup
            this.debugLogger.debug('[Prerequisites] File watcher established - waiting for installation to complete or fail');
            
        } catch (error) {
            this.logger.error('[Prerequisites] Failed to set up installation monitoring', error as Error);
            this.stepLogger.log('prerequisites', '⚠ Could not monitor installation. Please click Recheck when done.', 'warn');
            clearTimeout(timeoutHandle);
        }
    }
    
    private async handleHomebrewInstallationComplete(prereq: any, terminal: vscode.Terminal, completionMarkerPath: string, failureMarkerPath: string): Promise<void> {
        try {
            this.stepLogger.log('prerequisites', '✓ Homebrew installation completed', 'info');
            
            // Check if terminal still exists before sending messages
            if (vscode.window.terminals.includes(terminal)) {
                // Inject status message into terminal
                terminal.sendText('echo ""');  // Blank line for spacing
                terminal.sendText('echo "✓ Installation complete! Configuring PATH..."');
            }
            
            // Verify Homebrew is actually available
            const commandManager = getExternalCommandManager();
            try {
                await commandManager.execute('brew --version', { timeout: TIMEOUTS.HOMEBREW_CHECK });
                this.logger.info('[Prerequisites] Verified: Homebrew is operational');
            } catch (error) {
                this.logger.warn('[Prerequisites] Homebrew completion marker found but brew command not yet available');
                this.debugLogger.debug('[Prerequisites] This may indicate PATH needs configuration');
            }
            
            // Auto-configure PATH
            await this.configureHomebrewPath();
            
            // Inject completion message into terminal
            if (vscode.window.terminals.includes(terminal)) {
                terminal.sendText('echo "✓ PATH configured successfully!"');
                terminal.sendText('echo ""');  // Blank line
                terminal.sendText('echo "✅ All done! The wizard will continue automatically."');
                terminal.sendText('echo "   You can close this terminal (Cmd+W) or leave it open for reference."');
            }
            
            // Clean up both marker files
            try {
                await fsPromises.unlink(completionMarkerPath);
                this.debugLogger.debug('[Prerequisites] Cleaned up success marker file');
            } catch (error) {
                this.debugLogger.debug('[Prerequisites] Could not clean up success marker (non-critical):', error);
            }
            try {
                await fsPromises.unlink(failureMarkerPath);
                this.debugLogger.debug('[Prerequisites] Cleaned up failure marker file');
            } catch (error) {
                // Expected if failure marker was never created
                this.debugLogger.debug('[Prerequisites] No failure marker to clean up (expected)');
            }
            
            // Show notification with Continue button (always closes terminal)
            // Users who want to keep terminal open can dismiss notification (Esc)
            this.logger.debug('[Prerequisites] Showing completion notification...');
            const action = await vscode.window.showInformationMessage(
                'Homebrew installed successfully! PATH configured.',
                'Continue'
            );
            
            this.logger.debug(`[Prerequisites] User action: ${action || 'dismissed'}`);
            
            if (action === 'Continue') {
                // User clicked Continue - close terminal AND panel
                this.logger.debug('[Prerequisites] Closing terminal and panel...');
                try {
                    // Check if terminal is still in the terminal list
                    const terminalStillExists = vscode.window.terminals.includes(terminal);
                    this.logger.debug(`[Prerequisites] Terminal exists before dispose: ${terminalStillExists}`);
                    
                    if (terminalStillExists) {
                        // Dispose the terminal first
                        terminal.dispose();
                        this.logger.debug('[Prerequisites] Terminal disposed');
                        
                        // Give VS Code time to process the terminal disposal
                        await new Promise(resolve => setTimeout(resolve, 100));
                        
                        const terminalStillExistsAfter = vscode.window.terminals.includes(terminal);
                        this.logger.debug(`[Prerequisites] Terminal exists after dispose: ${terminalStillExistsAfter}`);
                    } else {
                        this.logger.warn('[Prerequisites] Terminal was already closed/disposed');
                    }
                    
                    // Now close the entire bottom panel (Terminal, Output, Problems, etc.)
                    // This is what the user wants - hide the whole panel UI
                    this.logger.debug('[Prerequisites] Closing bottom panel...');
                    await vscode.commands.executeCommand('workbench.action.closePanel');
                    this.logger.info('[Prerequisites] ✓ Bottom panel closed successfully');
                    
                } catch (disposeError) {
                    this.logger.error('[Prerequisites] Error closing terminal/panel:', disposeError as Error);
                }
            } else {
                // User dismissed notification (Esc) - leave terminal open for reference
                this.logger.debug('[Prerequisites] Terminal left open (notification dismissed)');
            }
            
            // ALWAYS auto-recheck prerequisites regardless of user's choice
            // This ensures wizard never appears "stuck"
            this.logger.info('[Prerequisites] Auto-rechecking prerequisites after Homebrew installation');
            await this.handleCheckPrerequisites();
            
        } catch (error) {
            this.logger.error('[Prerequisites] Error handling Homebrew installation completion', error as Error);
        }
    }
    
    private async handleHomebrewInstallationFailure(prereqId: number, prereq: any, terminal: vscode.Terminal, completionMarkerPath: string, failureMarkerPath: string): Promise<void> {
        try {
            this.logger.error('[Prerequisites] Homebrew installation failed');
            this.stepLogger.log('prerequisites', '✗ Homebrew installation failed - check terminal for details', 'error');
            
            // Update UI to show error state
            await this.sendMessage('prerequisite-status', {
                index: prereqId,
                name: prereq.name,
                status: 'error',
                message: 'Installation failed. Check terminal for error details, then click Recheck to try again.',
                required: !prereq.optional
            });
            
            // Clean up both marker files
            try {
                await fsPromises.unlink(failureMarkerPath);
                this.debugLogger.debug('[Prerequisites] Cleaned up failure marker file');
            } catch (error) {
                this.debugLogger.debug('[Prerequisites] Could not clean up failure marker (non-critical):', error);
            }
            try {
                await fsPromises.unlink(completionMarkerPath);
                this.debugLogger.debug('[Prerequisites] Cleaned up success marker file');
            } catch (error) {
                // Expected if success marker was never created
                this.debugLogger.debug('[Prerequisites] No success marker to clean up (expected)');
            }
            
            // Keep terminal open so user can see error details
            this.logger.info('[Prerequisites] Terminal left open for user to review error details');
            
        } catch (error) {
            this.logger.error('[Prerequisites] Error handling Homebrew installation failure', error as Error);
        }
    }

    private async configureHomebrewPath(): Promise<void> {
        try {
            this.logger.info('[Prerequisites] Configuring Homebrew PATH...');
            
            const homeDir = process.env.HOME || process.env.USERPROFILE;
            if (!homeDir) {
                this.logger.warn('[Prerequisites] Cannot determine home directory for PATH configuration');
                return;
            }
            
            // Determine shell profile file
            const shell = process.env.SHELL || '/bin/zsh';
            let profileFile = '';
            
            if (shell.includes('zsh')) {
                profileFile = path.join(homeDir, '.zprofile');
            } else if (shell.includes('bash')) {
                profileFile = path.join(homeDir, '.bash_profile');
            } else {
                this.logger.warn(`[Prerequisites] Unknown shell: ${shell}, defaulting to .zprofile`);
                profileFile = path.join(homeDir, '.zprofile');
            }
            
            this.debugLogger.debug('[Prerequisites] Detected shell profile', { shell, profileFile });
            
            // Check if Homebrew PATH already exists in profile
            let profileContent = '';
            try {
                profileContent = await fsPromises.readFile(profileFile, 'utf-8');
            } catch (error) {
                // File doesn't exist yet, will be created
                this.debugLogger.debug('[Prerequisites] Profile file does not exist, will create');
            }
            
            const homebrewPathConfig = 'eval "$(/opt/homebrew/bin/brew shellenv)"';
            
            if (profileContent.includes(homebrewPathConfig)) {
                this.logger.info('[Prerequisites] Homebrew PATH already configured in shell profile');
                return;
            }
            
            // Append Homebrew PATH configuration
            const configLines = [
                '', // Empty line for separation
                '# Homebrew PATH (auto-configured by Adobe Demo Builder)',
                homebrewPathConfig
            ].join('\n');
            
            await fsPromises.appendFile(profileFile, configLines + '\n');
            
            this.logger.info('[Prerequisites] ✓ Homebrew PATH configured successfully');
            this.stepLogger.log('prerequisites', '✓ Homebrew PATH added to shell profile automatically', 'info');
            
            // Also evaluate in current process environment
            const commandManager = getExternalCommandManager();
            await commandManager.execute('eval "$(/opt/homebrew/bin/brew shellenv)"', { timeout: TIMEOUTS.HOMEBREW_CHECK });
            
            this.debugLogger.debug('[Prerequisites] Homebrew PATH evaluated in current environment');
            
        } catch (error) {
            this.logger.error('[Prerequisites] Failed to configure Homebrew PATH', error as Error);
            this.stepLogger.log('prerequisites', `⚠ Could not auto-configure Homebrew PATH: ${error instanceof Error ? error.message : String(error)}`, 'warn');
        }
    }

    // Adobe authentication helper methods
    
    /**
     * Unified auth context checker
     * Validates auth requirements and sends appropriate messages to UI
     */
    private async requireAuthContext(requirements: AuthRequirements): Promise<AuthContext> {
        const context = await this.authManager.getAuthContext();
        
        // Check token
        if (requirements.needsToken && context.state === AuthState.UNAUTHENTICATED) {
            await this.sendMessage('auth-required', {
                message: 'Sign in required',
                subMessage: 'Please sign in to continue'
            });
            throw new Error('Authentication required');
        }
        
        if (requirements.needsToken && context.state === AuthState.TOKEN_EXPIRED) {
            await this.sendMessage('auth-expired', {
                message: 'Your Adobe session has expired',
                subMessage: 'Please sign in again to continue'
            });
            throw new Error('Token expired');
        }
        
        // Check org
        if (requirements.needsOrg && !context.org) {
            await this.sendMessage('org-required', {
                message: 'Organization selection required',
                subMessage: 'Please select an organization to continue'
            });
            throw new Error('Organization required');
        }
        
        // Check project
        if (requirements.needsProject && !context.project) {
            await this.sendMessage('project-required', {
                message: 'Project selection required',
                subMessage: 'Please select a project to continue'
            });
            throw new Error('Project required');
        }
        
        // Check workspace
        if (requirements.needsWorkspace && !context.workspace) {
            await this.sendMessage('workspace-required', {
                message: 'Workspace selection required',
                subMessage: 'Please select a workspace to continue'
            });
            throw new Error('Workspace required');
        }
        
        return context;
    }

    // Adobe authentication methods
    private async handleCheckAuth(): Promise<void> {
        this.logger.debug('[Auth] Starting authentication check');
        const context = await this.authManager.getAuthContext();
        
        let message = 'Sign in required';
        let subMessage = 'Please sign in to continue';
        
        if (context.state === AuthState.AUTHENTICATED_WITH_ORG) {
            message = `Signed in as ${context.org?.name}`;
            subMessage = 'Ready to proceed';
        } else if (context.state === AuthState.AUTHENTICATED_NO_ORG) {
            message = 'Signed in';
            subMessage = 'Select an organization to continue';
        } else if (context.state === AuthState.TOKEN_EXPIRED) {
            message = 'Your Adobe session has expired';
            subMessage = 'Please sign in again';
        } else if (context.state === AuthState.TOKEN_EXPIRING_SOON) {
            message = `Signed in as ${context.org?.name}`;
            subMessage = `Token expires in ${context.token?.expiresIn} minutes`;
        }
        
        this.logger.info(`[Auth] ${message} - ${subMessage}`);

        await this.sendMessage('auth-status', {
            authenticated: context.state === AuthState.AUTHENTICATED_WITH_ORG || context.state === AuthState.TOKEN_EXPIRING_SOON,
            isAuthenticated: context.state !== AuthState.UNAUTHENTICATED && context.state !== AuthState.TOKEN_EXPIRED,
            isChecking: false,
            organization: context.org,
            project: context.project,
            message,
            subMessage,
            expiresIn: context.token?.expiresIn,
            requiresOrgSelection: context.state === AuthState.AUTHENTICATED_NO_ORG,
            orgLacksAccess: false
        });
    }

    private async handleAuthenticate(force: boolean = false): Promise<void> {
        if (this.isAuthenticating) {
            this.logger.warn('[Auth] Authentication already in progress, ignoring duplicate request');
            return;
        }
        
        const authStartTime = Date.now();
        
        try {
            this.isAuthenticating = true;
            
            // IMMEDIATELY clear any error/timeout state and show authenticating message
            // This prevents UI from showing stale "Signed In..." or "Authorization Timed Out" messages
            await this.sendMessage('auth-status', {
                isChecking: true,
                message: 'Authenticating...',
                subMessage: 'Checking your Adobe credentials',
                isAuthenticated: false
            });
            
            // Check if already authenticated with valid token (skip if force)
            if (!force) {
                const context = await this.authManager.getAuthContext();
                if (context.state === AuthState.AUTHENTICATED_WITH_ORG || 
                    context.state === AuthState.TOKEN_EXPIRING_SOON) {
                    this.logger.info('[Auth] Already authenticated with valid token');
                    this.isAuthenticating = false;
                    await this.sendMessage('auth-status', {
                        authenticated: true,
                        isAuthenticated: true,
                        isChecking: false,
                        organization: context.org,
                        project: context.project,
                        message: 'Already authenticated',
                        subMessage: `Connected to ${context.org?.name}`
                    });
                    return;
                }
            }
            
            // Only logout if explicitly switching orgs
            if (force) {
                this.logger.debug('[Auth] Clearing existing context for org switch');
                await this.authManager.logout();
            }
            
            // Update to "opening browser" message
            await this.sendMessage('auth-status', {
                isChecking: true,
                message: 'Opening browser for authentication...',
                subMessage: 'Please sign in to your Adobe account in the browser',
                isAuthenticated: false
            });
            
            // Perform login
            this.debugLogger.debug('[Auth] About to call authManager.login()...');
            let loginSuccess: boolean;
            try {
                loginSuccess = await this.authManager.login(force);
                this.debugLogger.debug(`[Auth] login() returned: ${loginSuccess}`);
            } catch (loginError) {
                // login() throws errors for specific issues (e.g., token corruption)
                this.debugLogger.debug('[Auth] login() threw an error:', loginError);
                // Re-throw to be handled by outer catch block
                throw loginError;
            }
            
            const loginDuration = Date.now() - authStartTime;
            this.isAuthenticating = false;
            
            if (loginSuccess) {
                this.logger.info(`[Auth] Authentication completed successfully after ${loginDuration}ms`);

                // Clear cache after login
                this.authManager.clearCache();
                
                // When force=true (org switch), Adobe CLI's browser login doesn't update `aio console where`
                // So we can't trust syncContextFromCLI(). Instead, get orgs directly with the new token.
                let currentOrg: AdobeOrg | undefined;
                let currentProject: AdobeProject | undefined;
                
                if (force) {
                    // Org switch: Don't trust CLI config, use token-based org lookup
                    this.debugLogger.debug('[Auth] Force login - fetching orgs with new token (bypassing stale CLI config)');
                    try {
                        const availableOrgs = await this.authManager.getOrganizations();
                        this.debugLogger.debug(`[Auth] Found ${availableOrgs.length} orgs with new token`);
                        
                        if (availableOrgs.length === 1) {
                            // User selected this org in browser, select it (uses org code, not ID)
                            this.logger.info(`[Auth] Auto-selecting single available organization: ${availableOrgs[0].name}`);
                            const selectSuccess = await this.authManager.selectOrganization(availableOrgs[0].id);
                            if (selectSuccess) {
                                currentOrg = availableOrgs[0];
                            } else {
                                this.logger.warn('[Auth] Failed to select organization');
                            }
                        } else if (availableOrgs.length > 1) {
                            this.debugLogger.debug('[Auth] Multiple orgs available, user must select');
                        }
                    } catch (error) {
                        this.logger.warn('[Auth] Failed to fetch orgs after login:', error);
                    }
                } else {
                    // Normal login (not switching): Safe to check CLI config
                    const context = await this.authManager.getAuthContext();
                    currentOrg = context.org;
                    currentProject = context.project;
                    
                    // Auto-select single org if none selected
                    if (!currentOrg) {
                        try {
                            const availableOrgs = await this.authManager.getOrganizations();
                            if (availableOrgs.length === 1) {
                                this.logger.info('[Auth] Auto-selecting single available organization');
                                await this.authManager.selectOrganization(availableOrgs[0].id);
                                currentOrg = availableOrgs[0];
                            }
                        } catch (error) {
                            this.logger.debug('[Auth] Failed to auto-select org:', error);
                        }
                    }
                }
                
                // Send final status
                if (currentOrg) {
                    await this.sendMessage('auth-status', {
                        authenticated: true,
                        isAuthenticated: true,
                        isChecking: false,
                        organization: currentOrg,
                        project: currentProject,
                        message: 'Ready to continue',
                        subMessage: `Connected to ${currentOrg.name}`
                    });
                } else {
                    await this.sendMessage('auth-status', {
                        authenticated: true,
                        isAuthenticated: true,
                        isChecking: false,
                        organization: undefined,
                        project: undefined,
                        message: 'Authentication successful',
                        subMessage: 'Please select your organization to continue',
                        requiresOrgSelection: true
                    });
                }
            } else {
                this.logger.warn(`[Auth] Authentication timed out after ${loginDuration}ms`);
                
                await this.sendMessage('auth-status', {
                    authenticated: false,
                    isAuthenticated: false,
                    isChecking: false,
                    error: 'timeout',
                    message: 'Authentication timed out',
                    subMessage: 'The browser window may have been closed or the session expired'
                });
            }
            
        } catch (error) {
            const failDuration = Date.now() - authStartTime;
            this.isAuthenticating = false;
            
            const errorMsg = error instanceof Error ? error.message : String(error);
            
            // Check for specific Adobe CLI token corruption error
            if (errorMsg.includes('ADOBE_CLI_TOKEN_CORRUPTION')) {
                this.debugLogger.debug('[Auth] Detected ADOBE_CLI_TOKEN_CORRUPTION error, showing UI messages');
                this.logger.error(`[Auth] Adobe CLI token corruption detected after ${failDuration}ms`);
                
                // Show helpful error message with manual fix instructions
                this.debugLogger.debug('[Auth] Sending auth-status message to webview');
                await this.sendMessage('auth-status', {
                    authenticated: false,
                    isAuthenticated: false,
                    isChecking: false,
                    error: 'cli_corruption',
                    message: 'Adobe CLI Installation Issue',
                    subMessage: 'Automatic fixes failed. Manual terminal intervention required - see notification for details.'
                });
                this.debugLogger.debug('[Auth] auth-status message sent');
                
                // Also show a VS Code notification with action button
                this.debugLogger.debug('[Auth] Showing VS Code error notification');
                const action = await vscode.window.showErrorMessage(
                    'Adobe CLI failed to store authentication correctly even after automatic repair attempts. This suggests your Adobe CLI installation is corrupted.\n\n' +
                    'Try these fixes:\n' +
                    '1. Run: aio logout -f && aio login -f\n' +
                    '2. If that fails, reinstall: npm install -g @adobe/aio-cli',
                    'Open Terminal',
                    'Dismiss'
                );
                this.debugLogger.debug(`[Auth] User clicked: ${action || 'Dismiss'}`);
                
                if (action === 'Open Terminal') {
                    // Open integrated terminal and suggest command
                    this.debugLogger.debug('[Auth] Opening terminal for manual fix');
                    const terminal = vscode.window.createTerminal('Adobe CLI Fix');
                    terminal.show();
                    terminal.sendText('# The extension already tried:');
                    terminal.sendText('#   1. aio auth logout');
                    terminal.sendText('#   2. Deleting cached tokens (aio config delete)');
                    terminal.sendText('#   3. aio auth login -f (fresh browser auth)');
                    terminal.sendText('# But token is still corrupted. Try these manual fixes:');
                    terminal.sendText('');
                    terminal.sendText('# Option 1: Force fresh login (recommended)');
                    terminal.sendText('aio logout -f && aio login -f');
                    terminal.sendText('');
                    terminal.sendText('# Option 2: If that fails, delete config and retry');
                    terminal.sendText('# rm -rf ~/.config/@adobe/aio-cli');
                    terminal.sendText('# aio login -f');
                    terminal.sendText('');
                    terminal.sendText('# Option 3: If still failing, reinstall Adobe CLI');
                    terminal.sendText('# npm uninstall -g @adobe/aio-cli');
                    terminal.sendText('# npm install -g @adobe/aio-cli');
                    terminal.sendText('# aio login -f');
                    this.debugLogger.debug('[Auth] Terminal commands sent');
                }
            } else {
                // Generic error handling
                this.logger.error(`[Auth] Failed to start authentication after ${failDuration}ms:`, error as Error);
                await this.sendMessage('authError', {
                    error: errorMsg
                });
            }
        }
    }


    // Organization management


    private async handleEnsureOrgSelected(): Promise<void> {
        try {
            const currentOrg = await this.authManager.getCurrentOrganization();
            const hasOrg = !!currentOrg;
            await this.sendMessage('orgSelectionStatus', { hasOrg });
        } catch (error) {
            this.logger.error('Failed to ensure org selected:', error as Error);
            await this.sendMessage('error', {
                message: 'Failed to check organization selection',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    }

    // Project management
    private async handleGetProjects(_orgId: string): Promise<void> {
        try {
            await this.requireAuthContext({ 
                needsToken: true, 
                needsOrg: true, 
                needsProject: false, 
                needsWorkspace: false 
            });
            
            // Send loading status
            const currentOrg = await this.authManager.getCurrentOrganization();
            if (currentOrg) {
                await this.sendMessage('project-loading-status', {
                    isLoading: true,
                    message: 'Loading your Adobe projects...',
                    subMessage: `Fetching from organization: ${currentOrg?.name || 'your organization'}`
                });
            }
            
            // Get projects with timeout
            const projects = await withTimeout(
                this.authManager.getProjects(),
                {
                    timeoutMs: TIMEOUTS.PROJECT_LIST,
                    timeoutMessage: 'Request timed out. Please check your connection and try again.'
                }
            );
            await this.sendMessage('projects', projects);
        } catch (error: unknown) {
            const err = error as Error;
            if (err.message !== 'Authentication required' && 
                err.message !== 'Token expired' &&
                err.message !== 'Organization required') {
                const errorMessage = err.message?.includes('timed out')
                    ? err.message
                    : 'Failed to load projects. Please try again.';
                
                this.logger.error('Failed to get projects:', err);
                await this.sendMessage('projects', {
                    error: errorMessage
                });
            }
            // Auth errors already handled by requireAuthContext
        }
    }

    private async handleSelectProject(projectId: string): Promise<void> {
        this.debugLogger.debug(`[Project] handleSelectProject called with projectId: ${projectId}`);

        try {
            this.debugLogger.debug('[Project] About to call authManager.selectProject');
            // Directly select the project - we already have the projectId
            const success = await this.authManager.selectProject(projectId);

            this.debugLogger.debug(`[Project] authManager.selectProject returned: ${success}`);

            if (success) {
                this.logger.info(`Selected project: ${projectId}`);
                this.debugLogger.debug('[Project] Project selection succeeded, about to send projectSelected message');

                // Ensure fresh workspace data after project change
                // (selectProject already clears workspace cache)

                try {
                    await this.sendMessage('projectSelected', { projectId });
                    this.debugLogger.debug('[Project] projectSelected message sent successfully');
                } catch (sendError) {
                    this.debugLogger.debug('[Project] Failed to send projectSelected message:', sendError);
                    throw new Error(`Failed to send project selection response: ${sendError instanceof Error ? sendError.message : String(sendError)}`);
                }
            } else {
                // Log error but don't throw - let caller handle response
                this.logger.error(`Failed to select project ${projectId}`);
                this.debugLogger.debug('[Project] Project selection failed, sending error message');
                await this.sendMessage('error', {
                    message: 'Failed to select project',
                    details: `Project selection for ${projectId} was unsuccessful`
                });
                throw new Error(`Failed to select project ${projectId}`);
            }
        } catch (error) {
            this.debugLogger.debug('[Project] Exception caught in handleSelectProject:', error);
            
            // Import AdobeAuthError to check error type
            const { AdobeAuthError, AuthErrorCode } = await import('../utils/adobeAuthErrors');
            
            // Handle auth errors specially (show re-auth button)
            if (error instanceof AdobeAuthError) {
                this.logger.warn(`[Project] Auth error during project selection: ${error.code}`);
                
                if (error.code === AuthErrorCode.PERMISSION_DENIED) {
                    // Token is for wrong org or expired - show re-auth UI
                    await this.sendMessage('auth-status', {
                        authenticated: false,
                        isAuthenticated: false,
                        isChecking: false,
                        error: 'permission_denied',
                        message: 'Your Adobe session may have expired',
                        subMessage: error.userMessage || 'Please sign in again to continue'
                    });
                } else {
                    // Other auth errors
                    await this.sendMessage('auth-status', {
                        authenticated: false,
                        isAuthenticated: false,
                        isChecking: false,
                        error: error.code,
                        message: 'Authentication Error',
                        subMessage: error.userMessage
                    });
                }
            } else {
                // Generic error
                this.logger.error('Failed to select project:', error as Error);
                await this.sendMessage('error', {
                    message: 'Failed to select project',
                    details: error instanceof Error ? error.message : String(error)
                });
            }
            
            // Re-throw so the handler can send proper response
            throw error;
        }
    }

    private getSetupInstructions(selectedComponents: string[] = []): Array<{ step: string; details: string; important?: boolean }> | undefined {
        const meshConfig = this.apiServicesConfig?.services?.apiMesh;
        const rawInstructions = meshConfig?.setupInstructions;
        
        if (!rawInstructions || !Array.isArray(rawInstructions)) {
            return undefined;
        }

        // Process dynamic values in instructions
        return rawInstructions.map((instruction: any) => {
            let details = instruction.details;
            
            // Process {{ALLOWED_DOMAINS}} substitution
            if (instruction.dynamicValues?.ALLOWED_DOMAINS) {
                // Get frontends from selected components
                const frontends = selectedComponents.filter((comp: string) => {
                    // Check if it's a frontend by looking it up in components data
                    const componentsData = this.componentsData?.components;
                    return componentsData?.frontends?.some((f: any) => f.id === comp);
                });
                
                // Get ports from frontends
                const allowedDomains = frontends.map((compId: string) => {
                    const componentsData = this.componentsData?.components;
                    const frontend = componentsData?.frontends?.find((f: any) => f.id === compId);
                    const port = frontend?.configuration?.port || 3000;
                    return `localhost:${port}`;
                }).join(', ');
                
                details = details.replace('{{ALLOWED_DOMAINS}}', allowedDomains || 'localhost:3000');
            }
            
            return {
                step: instruction.step,
                details,
                important: instruction.important
            };
        });
    }

    /**
     * Get mesh endpoint - single source of truth approach:
     * 1. Use cached endpoint if available (instant)
     * 2. Call aio api-mesh:describe (official Adobe method, ~3s)
     * 3. Construct from meshId as reliable fallback
     */
    private async getEndpoint(
        meshId: string,
        cachedEndpoint?: string
    ): Promise<string> {
        // Use cache if available (instant)
        if (cachedEndpoint) {
            this.debugLogger.debug('[API Mesh] Using cached endpoint');
            return cachedEndpoint;
        }
        
        // Call describe command (official Adobe method)
        try {
            this.debugLogger.debug('[API Mesh] Fetching endpoint via describe command');
            const commandManager = getExternalCommandManager();
            const result = await commandManager.executeAdobeCLI(
                'aio api-mesh:describe',
                {
                    timeout: TIMEOUTS.API_CALL
                }
            );
            
            if (result.code === 0) {
                // Parse JSON response
                const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const meshData = JSON.parse(jsonMatch[0]);
                    const endpoint = meshData.meshEndpoint || meshData.endpoint;
                    if (endpoint) {
                        this.logger.info('[API Mesh] Retrieved endpoint from describe:', endpoint);
                        return endpoint;
                    }
                }
            }
        } catch {
            this.debugLogger.debug('[API Mesh] Describe failed, using constructed fallback');
        }
        
        // Construct as reliable fallback
        const endpoint = `https://edge-sandbox-graph.adobe.io/api/${meshId}/graphql`;
        this.logger.info('[API Mesh] Using constructed endpoint (fallback)');
        return endpoint;
    }

    private async handleCheckApiMesh(workspaceId: string, selectedComponents: string[] = []): Promise<{
        apiEnabled: boolean;
        meshExists: boolean;
        meshId?: string;
        meshStatus?: 'deployed' | 'not-deployed' | 'pending' | 'error';
        endpoint?: string;
        error?: string;
        setupInstructions?: Array<{ step: string; details: string; important?: boolean }>;
    }> {
        this.logger.info('[API Mesh] Checking API Mesh availability for workspace', { workspaceId });
        this.debugLogger.debug('[API Mesh] Starting multi-layer check');
        
        try {
            await this.requireAuthContext({ 
                needsToken: true, 
                needsOrg: true, 
                needsProject: true, 
                needsWorkspace: true 
            });
        } catch (error) {
            this.logger.warn('[API Mesh Check] Token expired - cannot check mesh status');
            return {
                apiEnabled: false,
                meshExists: false,
                error: 'Your Adobe session has expired. Please refresh your authentication.'
            };
        }
        
        const commandManager = getExternalCommandManager();

        try {
            // LAYER 1: Download workspace configuration (most reliable)
            this.logger.info('[API Mesh] Layer 1: Downloading workspace configuration');
            
            // Use extension's global storage instead of OS temp for better control and isolation
            // This keeps all extension files organized and makes debugging easier
            const extensionTempPath = path.join(this.context.globalStorageUri.fsPath, 'temp');
            await fsPromises.mkdir(extensionTempPath, { recursive: true });
            
            const tempDir = await fsPromises.mkdtemp(path.join(extensionTempPath, 'aio-workspace-'));
            const configPath = path.join(tempDir, 'workspace-config.json');
            
            this.debugLogger.debug('[API Mesh] Using extension temp path', { tempDir });
            
            try {
                await commandManager.executeAdobeCLI(
                    `aio console workspace download "${configPath}" --workspaceId ${workspaceId}`
                );
                
                const configContent = await fsPromises.readFile(configPath, 'utf-8');
                const config = JSON.parse(configContent);
                const services = config.project?.workspace?.details?.services || [];
                
                this.debugLogger.debug('[API Mesh] Workspace services', { services });
                
                // Use configuration for service detection with fallback to hardcoded values
                const meshConfig = this.apiServicesConfig?.services?.apiMesh;
                const namePatterns = meshConfig?.detection?.namePatterns || ['API Mesh'];
                const codes = meshConfig?.detection?.codes || ['MeshAPI'];
                const codeNames = meshConfig?.detection?.codeNames || ['MeshAPI'];
                
                const hasMeshApi = services.some((s: any) => 
                    namePatterns.some((pattern: string) => s.name?.includes(pattern)) ||
                    codes.some((code: string) => s.code === code) ||
                    codeNames.some((codeName: string) => s.code_name === codeName)
                );
                
                // Cleanup temp directory
                await fsPromises.rm(tempDir, { recursive: true, force: true });
                
                if (!hasMeshApi) {
                    this.logger.warn('[API Mesh] API Mesh API not found in workspace services');
                    this.debugLogger.debug('[API Mesh] Available services', { serviceNames: services.map((s: any) => s.name || s.code) });
                    return {
                        apiEnabled: false,
                        meshExists: false,
                        setupInstructions: this.getSetupInstructions(selectedComponents)
                    };
                }
                
                this.logger.info('[API Mesh] API Mesh API is enabled (confirmed via workspace config)');
                
                // LAYER 2: Now check if a mesh exists (API is already confirmed as enabled)
                this.logger.info('[API Mesh] Layer 2: Checking for existing mesh');
                
                try {
                    // Use 'get' without --active to get JSON response with meshStatus
                    const { stdout, stderr, code } = await commandManager.executeAdobeCLI('aio api-mesh get');
                    
                    if (code !== 0) {
                        // Command failed - check if it's because no mesh exists
                        const combined = `${stdout}\n${stderr}`;
                        const noMeshFound = /no mesh found|unable to get mesh config/i.test(combined);
                        
                        if (noMeshFound) {
                            this.logger.info('[API Mesh] API enabled, no mesh exists yet');
                            return {
                                apiEnabled: true,
                                meshExists: false
                            };
                        }
                        
                        // Other error - treat as unknown state
                        this.logger.warn('[API Mesh] Mesh check command failed with unexpected error');
                        this.debugLogger.debug('[API Mesh] Error output:', combined);
                        throw new Error(`Mesh check failed: ${stderr || stdout}`);
                    }
                    
                    // Parse JSON response
                    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
                    if (!jsonMatch) {
                        this.logger.warn('[API Mesh] Could not parse JSON from get response');
                        this.debugLogger.debug('[API Mesh] Output:', stdout);
                        // Assume no mesh if we can't parse
                        return {
                            apiEnabled: true,
                            meshExists: false
                        };
                    }
                    
                    const meshData = JSON.parse(jsonMatch[0]);
                    const meshStatus = meshData.meshStatus?.toLowerCase();
                    const meshId = meshData.meshId;
                    
                    // Get endpoint using single source of truth (cached, describe, or construct)
                    const endpoint = meshId ? await this.getEndpoint(meshId) : undefined;
                    
                    this.debugLogger.debug('[API Mesh] Parsed mesh data', { meshStatus, meshId, endpoint });
                    
                    // Mesh exists - check its status
                    if (meshStatus === 'deployed' || meshStatus === 'success') {
                        this.logger.info('[API Mesh] Existing mesh found and deployed', { meshId, endpoint });
                        // Track that mesh existed before this session (prevent deletion on cancel)
                        this.meshExistedBeforeSession = workspaceId;
                        return {
                            apiEnabled: true,
                            meshExists: true,
                            meshId,
                            meshStatus: 'deployed',
                            endpoint
                        };
                    } else if (meshStatus === 'error' || meshStatus === 'failed') {
                        this.logger.warn('[API Mesh] Mesh exists but is in error state');
                        const errorMsg = meshData.error || 'Mesh deployment failed';
                        this.debugLogger.debug('[API Mesh] Error details:', errorMsg.substring(0, 500));
                        
                        // Track that mesh existed (even in error state) to prevent deletion on cancel
                        this.meshExistedBeforeSession = workspaceId;
                        
                        return {
                            apiEnabled: true,
                            meshExists: true,
                            meshId,
                            meshStatus: 'error',
                            endpoint, // Include endpoint even in error state for reference
                            error: 'Mesh exists but deployment failed. Click "Recreate Mesh" to delete and redeploy it.'
                        };
                    } else {
                        // Status is pending/provisioning/building
                        this.logger.info('[API Mesh] Mesh exists but is still provisioning', { meshStatus });
                        // Track that mesh existed to prevent deletion on cancel
                        this.meshExistedBeforeSession = workspaceId;
                        return {
                            apiEnabled: true,
                            meshExists: true,
                            meshId,
                            meshStatus: 'pending',
                            endpoint, // Include endpoint for consistency
                            error: 'Mesh is currently being provisioned. This could take up to 2 minutes.'
                        };
                    }
                    
                } catch (meshError: any) {
                    const combined = `${meshError?.message || ''}\n${meshError?.stderr || ''}\n${meshError?.stdout || ''}`;
                    this.logger.warn('[API Mesh] Mesh check failed', meshError as Error);
                    this.debugLogger.debug('[API Mesh] Full error output:', combined);
                
                    // Check if it's "no mesh found"
                    const noMeshFound = /no mesh found|unable to get mesh config/i.test(combined);
                
                    if (noMeshFound) {
                        this.logger.info('[API Mesh] API enabled, no mesh exists yet');
                        return {
                            apiEnabled: true,
                            meshExists: false
                        };
                    }
                
                    // Other error - treat as unknown/error state
                    return {
                        apiEnabled: true,
                        meshExists: false,
                        error: 'Unable to check mesh status. Try refreshing or check Adobe Console.'
                    };
                }
                
            } catch (configError) {
                this.debugLogger.debug('[API Mesh] Layer 1 failed, falling back to Layer 2', { error: String(configError) });
                // Cleanup temp directory on error
                try {
                    await fsPromises.rm(tempDir, { recursive: true, force: true });
                } catch {
                    // Ignore cleanup errors
                }
                
                // FALLBACK: Layer 1 failed, use Layer 2 to check both API status and mesh existence
                this.logger.info('[API Mesh] Layer 2 (fallback): Checking API status and mesh');
                
                try {
                    const { stdout, stderr } = await commandManager.executeAdobeCLI('aio api-mesh get --active');
                    const combined = `${stdout}\n${stderr}`;
                    
                    this.debugLogger.debug('[API Mesh] get --active output (fallback)', { stdout, stderr });
                    
                    // "Unable to get mesh config" indicates API is NOT enabled
                    const unableToGet = /unable to get mesh config/i.test(combined);
                    if (unableToGet) {
                        this.logger.warn('[API Mesh] API Mesh API not enabled (unable to get mesh config)');
                        return {
                            apiEnabled: false,
                            meshExists: false
                        };
                    }
                    
                    // Check for "No mesh found" without "unable to get" (API enabled, no mesh exists)
                    const noMeshOnly = /no mesh found/i.test(combined) && !unableToGet;
                    if (noMeshOnly) {
                        this.logger.info('[API Mesh] API enabled, no mesh exists yet (fallback check)');
                        return {
                            apiEnabled: true,
                            meshExists: false
                        };
                    }
                    
                    // If we got here without error, mesh exists
                    const meshIdMatch = combined.match(/mesh[_-]?id[:\s]+([a-f0-9-]+)/i);
                    const meshId = meshIdMatch ? meshIdMatch[1] : undefined;
                    
                    this.logger.info('[API Mesh] Existing mesh found (fallback check)', { meshId });
                    
                    return {
                        apiEnabled: true,
                        meshExists: true,
                        meshId,
                        meshStatus: 'deployed',
                        endpoint: undefined
                    };
                    
                } catch (meshError: any) {
                    const combined = `${meshError?.message || ''}\n${meshError?.stderr || ''}\n${meshError?.stdout || ''}`;
                    this.debugLogger.debug('[API Mesh] Mesh get error (fallback)', { combined });
                    
                    // Check for permission errors (API not enabled)
                    const forbidden = /403|forbidden|not authorized|not enabled|no access|missing permission/i.test(combined);
                    if (forbidden) {
                        this.logger.warn('[API Mesh] API Mesh API not enabled (permission denied)');
                        return {
                            apiEnabled: false,
                            meshExists: false
                        };
                    }
                    
                    // "Unable to get mesh config" indicates API is NOT enabled
                    const unableToGet = /unable to get mesh config/i.test(combined);
                    if (unableToGet) {
                        this.logger.warn('[API Mesh] API Mesh API not enabled (unable to get mesh config)');
                        return {
                            apiEnabled: false,
                            meshExists: false
                        };
                    }
                
                    // Check for "No mesh found" (API enabled, just no mesh)
                    const noMesh = /no mesh found/i.test(combined);
                    if (noMesh) {
                        this.logger.info('[API Mesh] API enabled, no mesh exists yet');
                        return {
                            apiEnabled: true,
                            meshExists: false
                        };
                    }
                
                    // Unknown error
                    throw meshError;
                }
            }
            
        } catch (error) {
            this.logger.error('[API Mesh] Check failed', error as Error);
            throw error;
        }
    }

    private async handleCreateApiMesh(
        workspaceId: string,
        onProgress?: (message: string, subMessage?: string) => void
    ): Promise<{
		meshId?: string;
		endpoint?: string;
		success: boolean;
		message?: string;
		meshExists?: boolean;
		meshStatus?: 'deployed' | 'error';
		error?: string;
	}> {
        this.logger.info('[API Mesh] Creating new mesh for workspace', { workspaceId });
		
        try {
            await this.requireAuthContext({ 
                needsToken: true, 
                needsOrg: true, 
                needsProject: true, 
                needsWorkspace: true 
            });
        } catch (error) {
            this.logger.warn('[API Mesh] Token expired - cannot create mesh');
            return {
                success: false,
                error: 'Your Adobe session has expired. Please go back and sign in again.',
                meshStatus: 'error'
            };
        }
        
        const commandManager = getExternalCommandManager();
        const storagePath = this.context.globalStorageUri.fsPath;
        let meshConfigPath: string | undefined;

        try {
            // Ensure storage directory exists
            await fsPromises.mkdir(storagePath, { recursive: true });
			
            // Load minimal mesh configuration from template
            onProgress?.('Creating API Mesh...', 'Loading mesh configuration template');
            const templatePath = path.join(this.context.extensionPath, 'templates', 'mesh-config.json');
            const templateContent = await fsPromises.readFile(templatePath, 'utf-8');
            const minimalMeshConfig = JSON.parse(templateContent);
			
            // Write mesh config to temporary file in extension storage
            meshConfigPath = path.join(storagePath, `mesh-config-${Date.now()}.json`);
            await fsPromises.writeFile(meshConfigPath, JSON.stringify(minimalMeshConfig, null, 2), 'utf-8');
			
            this.logger.info('[API Mesh] Created minimal mesh configuration from template', { 
                templatePath, 
                outputPath: meshConfigPath 
            });
            this.debugLogger.debug('[API Mesh] Mesh config content', minimalMeshConfig);
			
            // Create mesh with the configuration file
            onProgress?.('Creating API Mesh...', 'Submitting configuration to Adobe');
		
            let lastOutput = '';
            const createResult = await commandManager.executeAdobeCLI(
                `aio api-mesh create "${meshConfigPath}" --autoConfirmAction`,
                {
                    streaming: true,
                    timeout: TIMEOUTS.API_MESH_CREATE,
                    onOutput: (data: string) => {
                        lastOutput += data;
						
                        // Parse output for progress indicators (don't show raw CLI output)
                        const output = data.toLowerCase();
                        if (output.includes('validating')) {
                            onProgress?.('Creating API Mesh...', 'Validating configuration');
                        } else if (output.includes('creating')) {
                            onProgress?.('Creating API Mesh...', 'Provisioning mesh infrastructure');
                        } else if (output.includes('deploying')) {
                            onProgress?.('Creating API Mesh...', 'Deploying mesh');
                        } else if (output.includes('success')) {
                            onProgress?.('Creating API Mesh...', 'Finalizing mesh setup');
                        }
                        // Note: Don't show raw CLI output - it may contain masked credentials (*******) or other noise
                    }
                }
            );
			
            if (createResult.code !== 0) {
                const errorMsg = createResult.stderr || lastOutput || 'Failed to create mesh';
			
                // Special case 1: mesh already exists - update it instead
                // Special case 2: mesh was created but deployment failed - update to redeploy
                const meshAlreadyExists = errorMsg.includes('already has a mesh') || lastOutput.includes('already has a mesh');
                const meshCreatedButFailed = createResult.stdout.includes('Mesh created') || 
			                             createResult.stdout.includes('mesh created') ||
			                             lastOutput.includes('Mesh created');
			
                if (meshAlreadyExists || meshCreatedButFailed) {
                    if (meshCreatedButFailed) {
                        this.logger.info('[API Mesh] Mesh created but deployment failed, attempting update to redeploy');
                        onProgress?.('Completing API Mesh Setup...', 'Detected partial creation, now deploying mesh');
                    } else {
                        this.logger.info('[API Mesh] Mesh already exists, updating with new configuration');
                        onProgress?.('Updating Existing Mesh...', 'Found existing mesh, updating configuration');
                    }
				
                    // Update the existing mesh to ensure proper deployment
                    try {
                        const updateResult = await commandManager.executeAdobeCLI(
                            `aio api-mesh update "${meshConfigPath}" --autoConfirmAction`,
                            {
                                streaming: true,
                                timeout: TIMEOUTS.API_MESH_UPDATE,
                                onOutput: (data: string) => {
                                    const output = data.toLowerCase();
                                    if (output.includes('validating')) {
                                        onProgress?.('Deploying API Mesh...', 'Validating mesh configuration');
                                    } else if (output.includes('updating')) {
                                        onProgress?.('Deploying API Mesh...', 'Updating mesh infrastructure');
                                    } else if (output.includes('deploying')) {
                                        onProgress?.('Deploying API Mesh...', 'Deploying to Adobe infrastructure');
                                    } else if (output.includes('success')) {
                                        onProgress?.('API Mesh Ready', 'Mesh deployed successfully');
                                    }
                                }
                            }
                        );
					
                        if (updateResult.code === 0) {
                            this.logger.info('[API Mesh] Mesh updated successfully');
						
                            // Extract mesh ID from output
                            const meshIdMatch = updateResult.stdout.match(/mesh[_-]?id[:\s]+([a-f0-9-]+)/i);
                            const meshId = meshIdMatch ? meshIdMatch[1] : undefined;
						
                            // Get endpoint using single source of truth
                            const endpoint = meshId ? await this.getEndpoint(meshId) : undefined;
						
                            onProgress?.('✓ API Mesh Ready', 'Mesh successfully deployed and ready to use');
						
                            return {
                                success: true,
                                meshId,
                                endpoint,
                                message: 'API Mesh deployed successfully'
                            };
                        } else {
                            const updateError = updateResult.stderr || 'Failed to update mesh';
                            this.logger.error('[API Mesh] Update failed', new Error(updateError));
                            throw new Error(updateError);
                        }
                    } catch (updateError) {
                        this.logger.error('[API Mesh] Failed to update existing mesh', updateError as Error);
                        throw updateError;
                    }
                }
			
                // Other errors: fail
                this.logger.error('[API Mesh] Creation failed', new Error(errorMsg));
                throw new Error(errorMsg);
            }
			
            this.logger.info('[API Mesh] Mesh created successfully');
            this.debugLogger.debug('[API Mesh] Create output', { stdout: createResult.stdout });
		
            // Mesh creation is asynchronous - poll until it's deployed
            // Typical deployment time: 60-90 seconds, with 2 minute buffer for safety
            this.logger.info('[API Mesh] Starting deployment verification polling...');
            onProgress?.('Waiting for mesh deployment...', 'Mesh is being provisioned (typically takes 60-90 seconds)');
		
            const maxRetries = 10; // 10 attempts with strategic timing = ~2 minutes max
            const pollInterval = 10000; // 10 seconds between checks
            const initialWait = 20000; // 20 seconds before first check (avoid premature polling)
            let attempt = 0;
            let meshDeployed = false;
            let deployedMeshId: string | undefined;
            let deployedEndpoint: string | undefined;
		
            // Initial wait: mesh won't be ready for at least 20 seconds
            onProgress?.('Waiting for mesh deployment...', 'Provisioning mesh (~20 seconds)');
            await new Promise(resolve => setTimeout(resolve, initialWait));
		
            while (attempt < maxRetries && !meshDeployed) {
                attempt++;
			
                const elapsed = initialWait + (attempt - 1) * pollInterval;
                const elapsedSeconds = Math.floor(elapsed / 1000);
                onProgress?.(
                    'Waiting for mesh deployment...', 
                    `Checking deployment status (~${elapsedSeconds}s elapsed, attempt ${attempt}/${maxRetries})`
                );
			
                // Wait between attempts (but not before first check, we already waited)
                if (attempt > 1) {
                    await new Promise(resolve => setTimeout(resolve, pollInterval));
                }
			
                this.logger.info(`[API Mesh] Verification attempt ${attempt}/${maxRetries}`);
			
                try {
                    // Use 'get' without --active flag to get JSON response with meshStatus
                    const verifyResult = await commandManager.executeAdobeCLI(
                        'aio api-mesh get',
                        {
                            timeout: TIMEOUTS.API_CALL
                        }
                    );
				
                    if (verifyResult.code === 0) {
                        // Parse JSON response to check meshStatus
                        try {
                            // Extract JSON from output (skip "Successfully retrieved mesh" line)
                            const jsonMatch = verifyResult.stdout.match(/\{[\s\S]*\}/);
                            if (!jsonMatch) {
                                this.logger.warn('[API Mesh] Could not parse JSON from get response');
                                this.debugLogger.debug('[API Mesh] Output:', verifyResult.stdout);
                                continue; // Try next iteration
                            }
						
                            const meshData = JSON.parse(jsonMatch[0]);
                            const meshStatus = meshData.meshStatus?.toLowerCase();
					
                            this.debugLogger.debug('[API Mesh] Mesh status:', { meshStatus, meshId: meshData.meshId });
						
                            if (meshStatus === 'deployed' || meshStatus === 'success') {
                                // Success! Mesh is fully deployed - store the mesh data
                                const totalTime = Math.floor((initialWait + (attempt - 1) * pollInterval) / 1000);
                                this.logger.info(`[API Mesh] Mesh deployed successfully after ${attempt} attempts (~${totalTime}s total)`);
                                deployedMeshId = meshData.meshId;
                                // Get endpoint using single source of truth
                                deployedEndpoint = meshData.meshId ? await this.getEndpoint(meshData.meshId) : undefined;
                                meshDeployed = true;
                                break;
                            } else if (meshStatus === 'error' || meshStatus === 'failed') {
                                // Deployment failed - return error
                                const errorMsg = meshData.error || 'Mesh deployment failed';
                                this.logger.error('[API Mesh] Mesh deployment failed with error status');
                                this.debugLogger.debug('[API Mesh] Error details:', errorMsg.substring(0, 500));
							
                                return {
                                    success: false,
                                    meshExists: true,
                                    meshStatus: 'error',
                                    error: 'Mesh deployment failed. Click "Recreate Mesh" to delete and try again.'
                                };
                            } else {
                                // Status is pending/provisioning/building - continue polling
                                this.logger.info(`[API Mesh] Mesh status: ${meshStatus || 'unknown'} (attempt ${attempt}/${maxRetries})`);
                            }
                        } catch (parseError) {
                            this.logger.warn('[API Mesh] Failed to parse mesh status JSON', parseError as Error);
                            this.debugLogger.debug('[API Mesh] Raw output:', verifyResult.stdout);
                            // Continue polling
                        }
                    } else {
                        // Non-zero exit code - likely mesh doesn't exist yet or other error
                        this.logger.warn(`[API Mesh] Get command returned exit code ${verifyResult.code}`);
                        this.debugLogger.debug('[API Mesh] stderr:', verifyResult.stderr);
                        // Continue polling - mesh might still be initializing
                    }
                } catch (verifyError: any) {
                    // Command execution failed - log and continue polling
                    this.logger.warn('[API Mesh] Verification command failed', verifyError as Error);
                    this.debugLogger.debug('[API Mesh] Error details:', verifyError);
                    // Continue polling - transient network issues shouldn't fail the entire process
                }
            }
		
            // Check if we succeeded or timed out
            if (!meshDeployed) {
                const totalWaitTime = Math.floor((initialWait + maxRetries * pollInterval) / 1000);
                this.logger.warn(`[API Mesh] Mesh deployment verification timed out after ${maxRetries} attempts (~${totalWaitTime}s)`);
                this.logger.info('[API Mesh] Mesh is still provisioning but taking longer than expected');
                onProgress?.('Mesh still provisioning', 'Deployment is taking longer than usual');
			
                // TIMEOUT is not an ERROR - mesh is likely still being deployed
                // Return success but note that verification is pending
                return {
                    success: true, // Don't block user - mesh was submitted successfully
                    meshId: undefined, // We don't have the ID yet
                    message: `Mesh is still provisioning after ${totalWaitTime} seconds. This is unusual but not necessarily an error. You can continue - the mesh will be available once deployment completes (check Adobe Console for status).`
                };
            }
		
            // Use mesh data from successful polling result
            onProgress?.('✓ API Mesh Ready', 'Mesh successfully created and deployed');
		
            return {
                success: true,
                meshId: deployedMeshId,
                endpoint: deployedEndpoint,
                message: 'API Mesh created and deployed successfully'
            };
			
        } catch (error) {
            this.logger.error('[API Mesh] Creation failed', error as Error);
            throw error;
        } finally {
            // Clean up temporary mesh config file
            if (meshConfigPath) {
                try {
                    await fsPromises.rm(meshConfigPath, { force: true });
                    this.logger.info('[API Mesh] Cleaned up temporary mesh config file');
                } catch (cleanupError) {
                    this.logger.warn('[API Mesh] Failed to clean up mesh config file', cleanupError as Error);
                }
            }
        }
    }

    private async handleCheckProjectApis(): Promise<{ hasMesh: boolean }> {
        this.logger.info('[Adobe Setup] Checking required APIs for selected project');
        this.debugLogger.debug('[Adobe Setup] handleCheckProjectApis invoked');
        try {
            const commandManager = getExternalCommandManager();

            // Step 1: Verify CLI has the API Mesh plugin installed (so commands exist)
            try {
                const { stdout } = await commandManager.executeAdobeCLI('aio plugins --json');
                const plugins = JSON.parse(stdout || '[]');
                const hasPlugin = Array.isArray(plugins)
                    ? plugins.some((p: any) => (p.name || p.id || '').includes('api-mesh'))
                    : JSON.stringify(plugins).includes('api-mesh');
                if (!hasPlugin) {
                    this.logger.warn('[Adobe Setup] API Mesh CLI plugin not installed');
                    return { hasMesh: false };
                }
            } catch (e) {
                this.debugLogger.debug('[Adobe Setup] Failed to verify plugins; continuing', { error: String(e) });
            }

            // Step 2: Confirm project context is selected (best effort)
            try {
                await commandManager.executeAdobeCLI('aio console projects get --json');
            } catch (e) {
                this.debugLogger.debug('[Adobe Setup] Could not confirm project context (non-fatal)', { error: String(e) });
            }

            // Step 3: Probe access by calling a safe mesh command that lists or describes
            // CLI variants differ; try a few options and infer permissions from errors
            // Preferred probe: get active mesh (succeeds only if API enabled; returns 404-style when none exists)
            try {
                const { stdout } = await commandManager.executeAdobeCLI('aio api-mesh:get --active --json');
                this.debugLogger.debug('[Adobe Setup] api-mesh:get --active output', { stdout });
                this.logger.info('[Adobe Setup] API Mesh access confirmed (active mesh or readable config)');
                return { hasMesh: true };
            } catch (cliError: any) {
                const combined = `${cliError?.message || ''}\n${cliError?.stderr || ''}\n${cliError?.stdout || ''}`;
                this.debugLogger.debug('[Adobe Setup] api-mesh:get --active error', { combined });
                const forbidden = /403|forbidden|not authorized|not enabled|no access/i.test(combined);
                if (forbidden) {
                    this.logger.warn('[Adobe Setup] API Mesh not enabled for selected project');
                    return { hasMesh: false };
                }
                // If error indicates no active mesh or not found, treat as enabled but empty
                const noActive = /no active|not found|404/i.test(combined);
                if (noActive) {
                    this.logger.info('[Adobe Setup] API Mesh enabled; no active mesh found');
                    return { hasMesh: true };
                }
            }

            const probes = [
                'aio api-mesh:get --help',
                'aio api-mesh --help'
            ];

            for (const cmd of probes) {
                try {
                    const { stdout } = await commandManager.executeAdobeCLI(cmd);
                    this.debugLogger.debug('[Adobe Setup] Mesh probe success', { cmd, stdout });
                    // If any mesh command runs, assume access exists
                    this.logger.info('[Adobe Setup] API Mesh access confirmed');
                    return { hasMesh: true };
                } catch (cliError: any) {
                    const combined = `${cliError?.message || ''}\n${cliError?.stderr || ''}\n${cliError?.stdout || ''}`;
                    this.debugLogger.debug('[Adobe Setup] Mesh probe error', { cmd, combined });
                    const forbidden = /403|forbidden|not authorized|not enabled|no access|missing permission/i.test(combined);
                    if (forbidden) {
                        this.logger.warn('[Adobe Setup] API Mesh not enabled for selected project');
                        return { hasMesh: false };
                    }
                    // If the error indicates unknown command, try next variant
                    const unknown = /is not a aio command|Unknown argument|Did you mean/i.test(combined);
                    if (unknown) continue;
                }
            }

            // If all probes failed without a definitive permission error, return false to prompt user
            this.logger.warn('[Adobe Setup] Unable to confirm API Mesh access (CLI variant mismatch)');
            return { hasMesh: false };
        } catch (error) {
            this.logger.error('[Adobe Setup] Failed to check project APIs', error as Error);
            throw error;
        }
    }

    // Workspace management
    private async handleGetWorkspaces(_orgId: string, _projectId: string): Promise<void> {
        try {
            await this.requireAuthContext({ 
                needsToken: true, 
                needsOrg: true, 
                needsProject: true, 
                needsWorkspace: false 
            });
            
            // Send loading status
            const currentProject = await this.authManager.getCurrentProject();
            if (currentProject) {
                await this.sendMessage('workspace-loading-status', {
                    isLoading: true,
                    message: 'Loading workspaces...',
                    subMessage: `Fetching from project: ${currentProject.title || currentProject.name}`
                });
            }
            
            // Get workspaces with timeout
            const workspaces = await withTimeout(
                this.authManager.getWorkspaces(),
                {
                    timeoutMs: TIMEOUTS.WORKSPACE_LIST,
                    timeoutMessage: 'Request timed out. Please check your connection and try again.'
                }
            );
            await this.sendMessage('workspaces', workspaces);
        } catch (error: unknown) {
            const err = error as Error;
            if (err.message !== 'Authentication required' && 
                err.message !== 'Token expired' &&
                err.message !== 'Organization required' &&
                err.message !== 'Project required') {
                const errorMessage = err.message?.includes('timed out')
                    ? err.message
                    : 'Failed to load workspaces. Please try again.';
                
                this.logger.error('Failed to get workspaces:', err);
                await this.sendMessage('workspaces', {
                    error: errorMessage
                });
            }
            // Auth errors already handled by requireAuthContext
        }
    }

    private async handleSelectWorkspace(workspaceId: string): Promise<void> {
        try {
            // Actually call the authManager to select the workspace
            const success = await this.authManager.selectWorkspace(workspaceId);
            if (success) {
                this.logger.info(`Selected workspace: ${workspaceId}`);

                // Cache invalidation is handled in authManager.selectWorkspace

                await this.sendMessage('workspaceSelected', { workspaceId });
            } else {
                this.logger.error(`Failed to select workspace ${workspaceId}`);
                await this.sendMessage('error', {
                    message: 'Failed to select workspace',
                    details: `Workspace selection for ${workspaceId} was unsuccessful`
                });
                throw new Error(`Failed to select workspace ${workspaceId}`);
            }
        } catch (error) {
            this.logger.error('Failed to select workspace:', error as Error);
            await this.sendMessage('error', {
                message: 'Failed to select workspace',
                details: error instanceof Error ? error.message : String(error)
            });
            // Re-throw so the handler can send proper response
            throw error;
        }
    }

    // Validation
    private async handleValidate(field: string, value: string): Promise<void> {
        try {
            let isValid = true;
            let message = '';
            
            switch (field) {
            case 'projectName':
                // Validate project name
                if (!value || value.trim().length === 0) {
                    isValid = false;
                    message = 'Project name is required';
                } else if (!/^[a-zA-Z0-9-_]+$/.test(value)) {
                    isValid = false;
                    message = 'Project name can only contain letters, numbers, hyphens, and underscores';
                } else if (value.length > 50) {
                    isValid = false;
                    message = 'Project name must be 50 characters or less';
                } else {
                    // Check if project with this name already exists
                    const existingProjects = await this.stateManager.getAllProjects();
                    this.logger.debug(`[Validation] Checking project name "${value}" against ${existingProjects.length} existing projects:`);
                    existingProjects.forEach(p => {
                        this.logger.debug(`[Validation]   - "${p.name}" (match: ${p.name.toLowerCase() === value.toLowerCase()})`);
                    });
                    
                    const projectExists = existingProjects.some(p => p.name.toLowerCase() === value.toLowerCase());
                    
                    if (projectExists) {
                        isValid = false;
                        message = 'A project with this name already exists';
                        this.logger.debug(`[Validation] Project name "${value}" is a DUPLICATE`);
                    } else {
                        this.logger.debug(`[Validation] Project name "${value}" is UNIQUE`);
                    }
                }
                break;
                    
            case 'commerceUrl':
                // Validate commerce URL
                if (value && value.trim().length > 0) {
                    try {
                        new URL(value);
                        if (!value.startsWith('http://') && !value.startsWith('https://')) {
                            isValid = false;
                            message = 'URL must start with http:// or https://';
                        }
                    } catch {
                        isValid = false;
                        message = 'Invalid URL format';
                    }
                }
                break;
            }
            
            await this.sendMessage('validationResult', {
                field,
                isValid,
                message
            });
        } catch (error) {
            this.logger.error('Validation failed:', error as Error);
            await this.sendMessage('validationResult', {
                field,
                isValid: false,
                message: 'Validation error'
            });
        }
    }

    // Project creation with timeout and cancellation support
    private async handleCreateProject(config: any): Promise<void> {
        const OVERALL_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
        const startTime = Date.now();
        const projectPath = path.join(os.homedir(), '.demo-builder', 'projects', config.projectName);
        
        // FIRST: Check workspace trust and offer one-time tip
        const hasShownTrustTip = this.context.globalState.get('demoBuilder.trustTipShown', false);
        if (!hasShownTrustTip && !vscode.workspace.isTrusted) {
            this.logger.info('[Project Creation] Showing one-time workspace trust tip');
            await this.context.globalState.update('demoBuilder.trustTipShown', true);
            
            const choice = await vscode.window.showInformationMessage(
                'Tip: Trust all Demo Builder projects at once for the best experience',
                'Learn How',
                'Skip for Now'
            );
            
            if (choice === 'Learn How') {
                const demoBuilderPath = path.join(os.homedir(), '.demo-builder');
                vscode.window.showInformationMessage(
                    `Add "${demoBuilderPath}" to your Trusted Folders ` +
                    '(Cmd+Shift+P → "Workspaces: Manage Workspace Trust" → Add Folder). ' +
                    'All future projects will be trusted automatically, no more dialogs!',
                    'Got it!'
                );
            }
        }
        
        // Create abort controller for cancellation
        this.projectCreationAbortController = new AbortController();
        
        try {
            this.logger.info('[Project Creation] Starting with config:', config);
            this.logger.info(`[Project Creation] Overall timeout: ${OVERALL_TIMEOUT_MS / 1000 / 60} minutes`);
            
            // Send initial status with progress
            await this.sendMessage('creationProgress', {
                currentOperation: 'Initializing',
                progress: 0,
                message: 'Preparing to create your project...',
                logs: []
            });
            
            // Execute with timeout and cancellation support
            await withTimeout(
                this.executeProjectCreation(config),
                {
                    timeoutMs: OVERALL_TIMEOUT_MS,
                    timeoutMessage: 
                        'Project creation timed out after 30 minutes. ' +
                        'This may indicate a network issue or very large components. ' +
                        'Please check your connection and try again.',
                    signal: this.projectCreationAbortController!.signal
                }
            );
            
        } catch (error) {
            const elapsed = Date.now() - startTime;
            const elapsedMin = Math.floor(elapsed / 1000 / 60);
            const elapsedSec = Math.floor((elapsed / 1000) % 60);
            
            this.logger.error(`[Project Creation] Failed after ${elapsedMin}m ${elapsedSec}s`, error as Error);
            
            // Cleanup partial project directory on failure
            try {
                if (fs.existsSync(projectPath)) {
                    this.logger.info(`[Project Creation] Cleaning up partial project at ${projectPath}`);
                    await fsPromises.rm(projectPath, { recursive: true, force: true });
                    this.logger.info('[Project Creation] Cleanup complete');
                }
                
                // Cleanup API Mesh if it was created during this session
                // IMPORTANT: Only delete if we created it AND it didn't exist before
                // This prevents deleting pre-existing production meshes on cancel/failure
                if (this.meshCreatedForWorkspace && !this.meshExistedBeforeSession) {
                    this.logger.info(`[Project Creation] Cleaning up orphaned API Mesh for workspace ${this.meshCreatedForWorkspace}`);
                    this.logger.debug('[Project Creation] Mesh was created in this session and did not exist before - safe to delete');
                    try {
                        const commandManager = getExternalCommandManager();
                        const deleteResult = await commandManager.executeAdobeCLI('aio api-mesh:delete --autoConfirmAction', {
                            timeout: TIMEOUTS.API_MESH_UPDATE
                        });
                        
                        if (deleteResult.code === 0) {
                            this.logger.info('[Project Creation] Successfully deleted orphaned mesh');
                        } else {
                            this.logger.warn(`[Project Creation] Failed to delete orphaned mesh: ${deleteResult.stderr}`);
                        }
                    } catch (meshCleanupError) {
                        this.logger.warn('[Project Creation] Error during mesh cleanup', meshCleanupError as Error);
                    }
                } else if (this.meshCreatedForWorkspace && this.meshExistedBeforeSession) {
                    this.logger.info('[Project Creation] Mesh existed before session - preserving it (not deleting on cancel/failure)');
                    this.logger.debug(`[Project Creation] Pre-existing mesh preserved for workspace ${this.meshExistedBeforeSession}`);
                }
            } catch (cleanupError) {
                this.logger.warn('[Project Creation] Failed to cleanup partial project', cleanupError as Error);
                // Don't throw - we still want to report the original error
            }
            
            // Determine error type
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isCancelled = errorMessage.includes('cancelled by user');
            const isTimeout = errorMessage.includes('timed out');
            
            await this.sendMessage('creationProgress', {
                currentOperation: isCancelled ? 'Cancelled' : 'Failed',
                progress: 0,
                message: '',
                logs: [],
                error: errorMessage
            });
            
            // Send specific completion message
            if (isCancelled) {
                await this.sendMessage('creationCancelled', {
                    message: 'Project creation was cancelled',
                    elapsed: `${elapsedMin}m ${elapsedSec}s`
                });
            } else {
                await this.sendMessage('creationFailed', {
                    error: errorMessage,
                    isTimeout,
                    elapsed: `${elapsedMin}m ${elapsedSec}s`
                });
            }
        } finally {
            // Cleanup
            this.projectCreationAbortController = undefined;
            this.meshCreatedForWorkspace = undefined;
            this.meshExistedBeforeSession = undefined;
        }
    }
    
    // Actual project creation logic (extracted for testability)
    private async executeProjectCreation(config: any): Promise<void> {
        // Create progress tracker
        const progressTracker = (currentOperation: string, progress: number, message?: string) => {
            this.sendMessage('creationProgress', {
                currentOperation,
                progress,
                message: message || '',
                logs: []
            });
        };
        
        // Safety check: Ensure port is available (edge case protection)
        // This catches scenarios where a demo was started via command palette during wizard
        const existingProject = await this.stateManager.getCurrentProject();
        if (existingProject && existingProject.status === 'running') {
            // Check if the running demo is using a port that would conflict
            const runningPort = existingProject.componentInstances?.['citisignal-nextjs']?.port;
            const defaultPort = vscode.workspace.getConfiguration('demoBuilder').get<number>('defaultPort', 3000);
            const targetPort = config.componentConfigs?.['citisignal-nextjs']?.PORT || defaultPort;
            
            if (runningPort === targetPort) {
                this.logger.info(`[Project Creation] Stopping running demo on port ${runningPort} before creating new project`);
                
                // Show notification that we're auto-stopping the demo
                vscode.window.setStatusBarMessage(
                    `Stopping "${existingProject.name}" demo (port ${runningPort} conflict)`, 
                    5000
                );
                
                await vscode.commands.executeCommand('demoBuilder.stopDemo');
                
                // Wait for clean stop and port release
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                this.logger.debug(`[Project Creation] Running demo on different port (${runningPort}), no conflict`);
            }
        }
            
        // Import ComponentManager and other dependencies
        this.logger.debug('[Project Creation] Starting dynamic imports...');
        const { ComponentManager } = await import('../utils/componentManager');
        this.logger.debug('[Project Creation] ComponentManager imported');
        const { ComponentRegistryManager } = await import('../utils/componentRegistry');
        this.logger.debug('[Project Creation] ComponentRegistryManager imported');
        const fs = await import('fs/promises');
        const path = await import('path');
        const os = await import('os');
        this.logger.debug('[Project Creation] All dynamic imports completed');
            
        // PRE-FLIGHT CHECK: Ensure clean slate
        const projectPath = path.join(os.homedir(), '.demo-builder', 'projects', config.projectName);
            
        if (await fs.access(projectPath).then(() => true).catch(() => false)) {
            this.logger.warn(`[Project Creation] Directory already exists: ${projectPath}`);
                
            // Check if it has content
            const existingFiles = await fs.readdir(projectPath);
            if (existingFiles.length > 0) {
                this.logger.info(`[Project Creation] Found ${existingFiles.length} existing files/folders, cleaning up...`);
                progressTracker('Preparing Project', 5, 'Removing existing project data...');
                    
                // Clean it up before proceeding
                await fs.rm(projectPath, { recursive: true, force: true });
                this.logger.info('[Project Creation] Existing directory cleaned');
            } else {
                // Empty directory is fine, just remove it to be safe
                await fs.rmdir(projectPath);
            }
        }
            
        // Step 1: Create project directory structure (10%)
        progressTracker('Setting Up Project', 10, 'Creating project directory structure...');
            
        const componentsDir = path.join(projectPath, 'components');
            
        await fs.mkdir(componentsDir, { recursive: true });
        await fs.mkdir(path.join(projectPath, 'logs'), { recursive: true });
            
        this.logger.info(`[Project Creation] Created directory: ${projectPath}`);
            
        // Step 2: Initialize project (15%)
        progressTracker('Setting Up Project', 15, 'Initializing project configuration...');
            
        const project: import('../types').Project = {
            name: config.projectName,
            created: new Date(),
            lastModified: new Date(),
            path: projectPath,
            status: 'created',
            adobe: config.adobe,
            componentInstances: {},
            componentSelections: {
                frontend: config.components?.frontend,
                backend: config.components?.backend,
                dependencies: config.components?.dependencies || [],
                externalSystems: config.components?.externalSystems || [],
                appBuilder: config.components?.appBuilderApps || []
            }
        };
            
        // Save initial project state WITHOUT triggering events (to avoid crash)
        // We'll save again after components are installed
        this.logger.info('[Project Creation] Deferring project state save and workspace addition until after installation');
            
        // Step 3: Load component definitions (20%)
        progressTracker('Loading Components', 20, 'Preparing component definitions...');
            
        const registryManager = new ComponentRegistryManager(this.context.extensionPath);
        const componentManager = new ComponentManager(this.logger);
            
        // Step 3.5: Collect Node versions for this project
        this.logger.info('[Project Creation] Collecting Node.js versions...');
        const { NodeVersionResolver } = await import('../utils/nodeVersionResolver');
        
        const allComponents = [
            ...(config.components?.frontend ? [{ id: config.components.frontend, type: 'frontend' }] : []),
            ...(config.components?.dependencies || []).map((id: string) => ({ id, type: 'dependency' })),
            ...(config.components?.appBuilderApps || []).map((id: string) => ({ id, type: 'app-builder' }))
        ];
        
        // Fetch component definitions
        const componentDefs = [];
        for (const comp of allComponents) {
            let componentDef;
            if (comp.type === 'frontend') {
                const frontends = await registryManager.getFrontends();
                componentDef = frontends.find(f => f.id === comp.id);
            } else if (comp.type === 'dependency') {
                const dependencies = await registryManager.getDependencies();
                componentDef = dependencies.find(d => d.id === comp.id);
            } else if (comp.type === 'app-builder') {
                const appBuilder = await registryManager.getAppBuilder();
                componentDef = appBuilder.find(a => a.id === comp.id);
            }
            if (componentDef) {
                componentDefs.push(componentDef);
            }
        }
        
        // Load infrastructure items (Adobe CLI, SDK, etc.)
        const infrastructure = await registryManager.getInfrastructure();
        
        // Collect all Node versions (no strategy calculation)
        const nodeVersions = NodeVersionResolver.collectVersions(componentDefs, infrastructure);
        project.nodeVersions = nodeVersions;
        
        const uniqueVersions = NodeVersionResolver.getUniqueVersions(nodeVersions);
        this.logger.info(`[Project Creation] Node versions needed: ${uniqueVersions.join(', ')}`);
            
        // Step 4: Install selected components (25-80%)
            
        const progressPerComponent = 55 / Math.max(allComponents.length, 1);
        let currentProgress = 25;
            
        for (const comp of allComponents) {
            let componentDef;
                
            if (comp.type === 'frontend') {
                const frontends = await registryManager.getFrontends();
                componentDef = frontends.find(f => f.id === comp.id);
            } else if (comp.type === 'dependency') {
                const dependencies = await registryManager.getDependencies();
                componentDef = dependencies.find(d => d.id === comp.id);
            } else if (comp.type === 'app-builder') {
                const appBuilder = await registryManager.getAppBuilder();
                componentDef = appBuilder.find(a => a.id === comp.id);
            }
                
            if (!componentDef) {
                this.logger.warn(`[Project Creation] Component ${comp.id} not found in registry`);
                continue;
            }
                
            progressTracker(`Installing ${componentDef.name}`, currentProgress, 'Cloning repository and installing dependencies...');
            this.logger.info(`[Project Creation] Installing component: ${componentDef.name}`);
                
            const result = await componentManager.installComponent(project, componentDef);
                
            if (result.success && result.component) {
                    project.componentInstances![comp.id] = result.component;
                    this.logger.info(`[Project Creation] Successfully installed ${componentDef.name}`);
                    
                    // Generate component-specific .env file (only for components with a path)
                    if (result.component.path) {
                        await this.generateComponentEnvFile(
                            result.component.path,
                            comp.id,
                            componentDef,
                            config
                        );
                    } else {
                        this.logger.debug(`[Project Creation] Skipping .env generation for ${componentDef.name} (no path)`);
                    }
                    
                    // Save project state to trigger sidebar refresh (show component in real-time)
                    await this.stateManager.saveProject(project);
            } else {
                throw new Error(`Failed to install ${componentDef.name}: ${result.error}`);
            }
                
            currentProgress += progressPerComponent;
        }
        
        // Step 4.5: Run build scripts AFTER .env files are generated (70-75%)
        // This ensures build scripts have access to all required environment variables
        this.logger.info('[Project Creation] Running component build scripts...');
        
        for (const comp of allComponents) {
            // Get component definition the same way as installation loop
            let componentDef;
            if (comp.type === 'frontend') {
                const frontends = await registryManager.getFrontends();
                componentDef = frontends.find(f => f.id === comp.id);
            } else if (comp.type === 'dependency') {
                const dependencies = await registryManager.getDependencies();
                componentDef = dependencies.find(d => d.id === comp.id);
            } else if (comp.type === 'app-builder') {
                const appBuilder = await registryManager.getAppBuilder();
                componentDef = appBuilder.find(a => a.id === comp.id);
            }
            
            if (!componentDef) {
                continue; // Skip if component definition not found
            }
            
            const componentInstance = project.componentInstances?.[comp.id];
            const buildScript = componentDef.configuration?.buildScript;
            
            if (buildScript && componentInstance?.path) {
                progressTracker(`Building ${componentDef.name}`, currentProgress, 'Running build script with environment configuration...');
                this.logger.info(`[Project Creation] Running build script for ${componentDef.name}`);
                
                const nodeVersion = componentDef.configuration?.nodeVersion;
                const buildCommand = `npm run ${buildScript}`;
                const buildTimeout = 180000; // 3 minutes for build
                
                this.logger.debug(`[Project Creation] Running: ${buildCommand} with Node ${nodeVersion || 'default'} in ${componentInstance.path}`);
                
                const commandManager = getExternalCommandManager();
                const buildResult = await commandManager.execute(buildCommand, {
                    cwd: componentInstance.path,
                    timeout: buildTimeout,
                    enhancePath: true,
                    useNodeVersion: nodeVersion || null
                });
                
                if (buildResult.code !== 0) {
                    this.logger.warn(`[Project Creation] Build script failed for ${componentDef.name}`);
                    this.stepLogger.log('component-install', `⚠ Build script warning for ${componentDef.name} (continuing anyway)`, 'warn');
                    this.debugLogger.debug(`[Project Creation] Build stderr: ${buildResult.stderr?.substring(0, 500)}`);
                } else {
                    this.logger.info(`[Project Creation] ✓ Build completed successfully for ${componentDef.name}`);
                    this.stepLogger.log('component-install', `✓ Built ${componentDef.name}`, 'info');
                }
            }
        }
            
        // Step 5: Deploy Components (75-85%)
        // Deploy any components that were downloaded and need deployment (e.g., API Mesh)
        this.logger.info('[Project Creation] ✓ All components downloaded and configured');
            
        const meshComponent = project.componentInstances?.['commerce-mesh'];
        if (meshComponent && meshComponent.path) {
            progressTracker('Deploying API Mesh', 80, 'Deploying mesh configuration to Adobe I/O...');
            this.logger.info(`[Project Creation] Deploying mesh from ${meshComponent.path}`);
                
            try {
                const meshDeployResult = await this.deployMeshComponent(
                    meshComponent.path,
                    (message, subMessage) => {
                        progressTracker('Deploying API Mesh', 80, subMessage || message);
                    }
                );
                    
                if (meshDeployResult.success) {
                    // Track that mesh was created for this workspace (for cleanup on failure)
                    this.meshCreatedForWorkspace = config.adobe?.workspace;
                    
                    // Get mesh info - prefer from wizard, but fetch if not available
                    let meshId = config.apiMesh?.meshId;
                    let endpoint = config.apiMesh?.endpoint;
                        
                    // If wizard didn't capture mesh info (e.g., still provisioning), fetch it now
                    if (!meshId || !endpoint) {
                        this.logger.debug('[Project Creation] Fetching mesh info via describe...');
                        try {
                            const commandManager = getExternalCommandManager();
                            const describeResult = await commandManager.executeAdobeCLI('aio api-mesh:describe', {
                                timeout: TIMEOUTS.API_CALL
                            });
                                
                            if (describeResult.code === 0) {
                                const jsonMatch = describeResult.stdout.match(/\{[\s\S]*\}/);
                                if (jsonMatch) {
                                    const meshData = JSON.parse(jsonMatch[0]);
                                    meshId = meshData.meshId || meshData.mesh_id;
                                    endpoint = meshData.meshEndpoint || meshData.endpoint;
                                }
                            }
                        } catch {
                            this.logger.warn('[Project Creation] Could not fetch mesh info, continuing without it');
                        }
                    }
                        
                    // Update component instance with deployment info
                    meshComponent.endpoint = endpoint;
                    meshComponent.status = 'deployed';
                    meshComponent.metadata = {
                        meshId: meshId || '',
                        meshStatus: 'deployed'
                    };
                        project.componentInstances!['commerce-mesh'] = meshComponent;
                        
                        // Update meshState to track deployment (required for status detection)
                        const { updateMeshState } = await import('../utils/stalenessDetector');
                        await updateMeshState(project);
                        this.logger.info('[Project Creation] Updated mesh state after successful deployment');
                        
                        this.logger.info(`[Project Creation] ✓ Mesh configuration updated successfully${endpoint ? ': ' + endpoint : ''}`);
                } else {
                    throw new Error(meshDeployResult.error || 'Mesh deployment failed');
                }
            } catch (meshError) {
                this.logger.error('[Project Creation] Failed to deploy mesh', meshError as Error);
                    
                const { formatMeshDeploymentError } = await import('../utils/errorFormatter');
                throw new Error(formatMeshDeploymentError(meshError as Error));
            }
        }
            
        // Alternative: Use existing mesh if user selected one instead of cloning (80%)
        // This happens when user picks an existing deployed mesh in the wizard
        if (config.apiMesh?.meshId && config.apiMesh?.endpoint && !meshComponent) {
            progressTracker('Configuring API Mesh', 80, 'Adding existing mesh to project...');
                
                // Add mesh as a component instance (deployed, not cloned)
                project.componentInstances!['commerce-mesh'] = {
                    id: 'commerce-mesh',
                    name: 'Commerce API Mesh',
                    type: 'dependency',
                    subType: 'mesh',
                    status: 'deployed',
                    endpoint: config.apiMesh.endpoint,
                    lastUpdated: new Date(),
                    metadata: {
                        meshId: config.apiMesh.meshId,
                        meshStatus: config.apiMesh.meshStatus
                    }
                };
                
                // Update meshState to track deployment (required for status detection)
                const { updateMeshState } = await import('../utils/stalenessDetector');
                await updateMeshState(project);
                this.logger.info('[Project Creation] Updated mesh state for existing mesh');
                
                this.logger.info('[Project Creation] API Mesh configured');
        }
            
        // Step 6: Create project manifest (90%)
        progressTracker('Finalizing Project', 90, 'Creating project manifest...');
            
        const manifest = {
            name: project.name,
            version: '1.0.0',
            created: project.created.toISOString(),
            lastModified: project.lastModified.toISOString(),
            adobe: project.adobe,
            componentSelections: project.componentSelections,
            componentInstances: project.componentInstances,
            componentConfigs: project.componentConfigs,
            meshState: project.meshState,
            commerce: project.commerce,
            components: Object.keys(project.componentInstances || {}) // Keep for backward compatibility
        };
            
        await fs.writeFile(
            path.join(projectPath, '.demo-builder.json'),
            JSON.stringify(manifest, null, 2)
        );
            
        this.logger.info('[Project Creation] Project manifest created');
            
        // Step 8: Save project state (95%)
        progressTracker('Finalizing Project', 95, 'Saving project state...');
            
        this.logger.info('[Project Creation] About to save project state...');
        this.logger.debug('[Project Creation] Project object:', JSON.stringify({
            name: project.name,
            status: 'ready',
            componentCount: Object.keys(project.componentInstances || {}).length
        }));
            
        try {
            project.status = 'ready';
            
            // Initialize component versions (for future update tracking)
            // Run update check to resolve "unknown" versions to proper version numbers
            if (!project.componentVersions) {
                project.componentVersions = {};
            }
            
            // Initialize with git commit SHAs first
            for (const componentId of Object.keys(project.componentInstances || {})) {
                const instance = project.componentInstances?.[componentId];
                project.componentVersions[componentId] = {
                    version: instance?.version || 'unknown', // Git commit hash from installation
                    lastUpdated: new Date().toISOString()
                };
            }
            
            // Now run update check - it will auto-fix "unknown" to proper versions
            this.logger.info('[Project Creation] Resolving component versions from GitHub...');
            try {
                const { UpdateManager } = await import('../utils/updateManager');
                const updateManager = new UpdateManager(this.context, this.logger);
                await updateManager.checkComponentUpdates(project);
                // checkComponentUpdates auto-fixes project.componentVersions when commits match releases
                this.logger.debug('[Project Creation] Component versions resolved');
            } catch (error) {
                this.logger.warn(`[Project Creation] Could not resolve component versions: ${error instanceof Error ? error.message : String(error)}`);
                // Continue anyway - versions will be resolved on first manual update check
            }
            
            await this.stateManager.saveProject(project);
            this.logger.info('[Project Creation] ✓ Project state saved successfully');
        } catch (saveError) {
            this.logger.error('[Project Creation] ✗ Failed to save project', saveError instanceof Error ? saveError : undefined);
            throw saveError; // Re-throw to trigger error handling
        }
            
        // Step 9: Complete
        progressTracker('Project Created', 100, 'Project creation complete');
            
        this.logger.info('[Project Creation] Completed successfully!');
            
        // Note: Tree view auto-refreshes via StateManager.onProjectChanged event
        // (triggered by saveProject() above)
            
        // Project Dashboard is now opened directly via "Open Project" button
        // (No need for restart flag)
            
        // Send completion message (with project path for Browse Files button)
        this.logger.debug('[Project Creation] Sending completion message to webview...');
        try {
            await this.sendMessage('creationComplete', {
                projectPath: projectPath,
                success: true,
                message: 'Your demo is ready to start'
            });
            this.logger.info('[Project Creation] ✓ Completion message sent');
        } catch (messageError) {
            this.logger.error('[Project Creation] ✗ Failed to send completion message', messageError instanceof Error ? messageError : undefined);
        }
            
        // Auto-close the webview panel after 2 minutes as a fallback
        // (User should click "Open Project" to close and open the project in workspace)
        setTimeout(() => {
            if (this.panel) {
                this.panel.dispose();
                this.logger.info('[Project Creation] Webview panel closed automatically (timeout - user did not click Open Project)');
            }
        }, 120000); // 2 minutes
            
        this.logger.info('[Project Creation] ===== PROJECT CREATION WORKFLOW COMPLETE =====');
    }
    
    /**
     * Generate component-specific .env file
     * Each component gets its own .env with only the variables it needs
     */
    private async generateComponentEnvFile(
        componentPath: string,
        componentId: string,
        componentDef: any,
        config: any
    ): Promise<void> {
        const lines: string[] = [
            `# ${componentDef.name} - Environment Configuration`,
            '# Generated by Demo Builder',
            '# Generated: ' + new Date().toISOString(),
            ''
        ];
        
        // Get all environment variables defined for this component
        const envVars = componentDef.configuration?.envVars || [];
        
        // Filter to only variables used by this component
        const relevantVars = envVars.filter((envVar: any) => 
            envVar.usedBy && envVar.usedBy.includes(componentId)
        );
        
        if (relevantVars.length > 0) {
            // Group variables by their group
            const groups = new Map<string, any[]>();
            
            for (const envVar of relevantVars) {
                const group = envVar.group || 'general';
                if (!groups.has(group)) {
                    groups.set(group, []);
                }
                groups.get(group)!.push(envVar);
            }
            
            // Write variables grouped by section
            for (const [groupName, vars] of groups.entries()) {
                lines.push(`# ${this.formatGroupName(groupName)}`);
                
                for (const envVar of vars) {
                    const key = envVar.key;
                    let value = '';
                    
                    // Priority order for values:
                    // 1. Runtime values (e.g., MESH_ENDPOINT from deployment)
                    // 2. User-provided values (from wizard - check all components)
                    // 3. Default value (from components.json)
                    // 4. Empty string
                    
                    if (key === 'MESH_ENDPOINT' && config.apiMesh?.endpoint) {
                        value = config.apiMesh.endpoint;
                    } else if (config.componentConfigs) {
                        // Check if ANY component has this value (field might be entered under different component)
                        for (const compId in config.componentConfigs) {
                            if (config.componentConfigs[compId]?.[key]) {
                                value = config.componentConfigs[compId][key];
                                break;
                            }
                        }
                    }
                    
                    // Fall back to default value from field definition
                    if (!value && envVar.default) {
                        value = String(envVar.default);
                    }
                    
                    // Add description as comment if available
                    if (envVar.description) {
                        lines.push(`# ${envVar.description}`);
                    }
                    
                    lines.push(`${key}=${value || ''}`);
                }
                
                lines.push('');
            }
        }
        
        // Determine filename based on component type
        // Next.js uses .env.local, others use .env
        const envFileName = componentDef.id.includes('nextjs') ? '.env.local' : '.env';
        const envFilePath = path.join(componentPath, envFileName);
        
        // Write the file
        const fs = await import('fs/promises');
        await fs.writeFile(envFilePath, lines.join('\n'));
        
        this.logger.info(`[Project Creation] Created ${envFileName} for ${componentDef.name}`);
    }
    
    /**
     * Format group name for display
     */
    private formatGroupName(group: string): string {
        return group
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
    
    /**
     * Deploy mesh component from cloned repository
     * Reads mesh.json from component path and deploys it to Adobe I/O
     */
    private async deployMeshComponent(
        componentPath: string,
        onProgress?: (message: string, subMessage?: string) => void
    ): Promise<{
        success: boolean;
        meshId?: string;
        endpoint?: string;
        error?: string;
    }> {
        const path = await import('path');
        const fs = await import('fs/promises');
        
        try {
            // Check for mesh.json in component directory
            const meshConfigPath = path.join(componentPath, 'mesh.json');
            await fs.access(meshConfigPath);
            
            onProgress?.('Reading mesh configuration...', '');
            
            // Validate mesh config exists and is valid JSON
            const meshConfigContent = await fs.readFile(meshConfigPath, 'utf-8');
            try {
                JSON.parse(meshConfigContent);
            } catch (parseError) {
                throw new Error('Invalid mesh.json file: ' + (parseError as Error).message);
            }
            
            // Use the original mesh.json path directly (not a temp copy)
            // This ensures relative paths in mesh.json (like build/resolvers/*.js) resolve correctly
            this.logger.debug(`[Deploy Mesh] Using config from: ${meshConfigPath}`);
            
            onProgress?.('Deploying API Mesh...', 'Updating mesh configuration');
            
            const commandManager = getExternalCommandManager();
            
            // Always use 'update' during project creation since mesh was already created in wizard
            this.logger.info('[Deploy Mesh] Updating mesh with configuration from commerce-mesh component');
            const deployResult = await commandManager.executeAdobeCLI(
                `aio api-mesh update "${meshConfigPath}" --autoConfirmAction`,
                {
                    cwd: componentPath, // Run from mesh component directory (where .env file is)
                    streaming: true,
                    timeout: TIMEOUTS.API_MESH_UPDATE,
                    onOutput: (data: string) => {
                        const output = data.toLowerCase();
                        if (output.includes('validating')) {
                            onProgress?.('Deploying...', 'Validating configuration');
                        } else if (output.includes('updating')) {
                            onProgress?.('Deploying...', 'Updating mesh infrastructure');
                        } else if (output.includes('deploying')) {
                            onProgress?.('Deploying...', 'Deploying mesh');
                        } else if (output.includes('success')) {
                            onProgress?.('Deploying...', 'Mesh updated successfully');
                        }
                    }
                }
            );
            
            if (deployResult.code !== 0) {
                const errorMsg = deployResult.stderr || deployResult.stdout || 'Mesh deployment failed';
                const { formatAdobeCliError } = await import('../utils/errorFormatter');
                throw new Error(formatAdobeCliError(errorMsg));
            }
            
            this.logger.info('[Deploy Mesh] Update command completed, verifying deployment...');
            
            // Use shared verification utility (same as manual deploy command)
            const { waitForMeshDeployment } = await import('../utils/meshDeploymentVerifier');
            
            const verificationResult = await waitForMeshDeployment({
                onProgress: (_attempt, _maxRetries, _elapsedSeconds) => {
                    // Don't show individual mesh timing during project creation
                    // The overall "This could take up to 3 minutes" is already shown
                    onProgress?.(
                        'Verifying deployment...',
                        'Checking deployment status...'
                    );
                },
                logger: this.logger
            });
            
            if (!verificationResult.deployed) {
                throw new Error(verificationResult.error || 'Mesh deployment verification failed');
            }
            
            this.logger.info('[Deploy Mesh] ✓ Mesh verified and deployed successfully');
            onProgress?.('✓ Deployment Complete', verificationResult.endpoint || 'Mesh deployed successfully');
            
            return {
                success: true,
                meshId: verificationResult.meshId,
                endpoint: verificationResult.endpoint
            };
            
        } catch (error) {
            this.logger.error('[Deploy Mesh] Deployment failed', error as Error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}