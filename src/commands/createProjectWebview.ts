import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BaseWebviewCommand } from './baseWebviewCommand';
import { WebviewCommunicationManager } from '../utils/webviewCommunicationManager';
// Prerequisites checking is handled by PrerequisitesManager
import { PrerequisitesManager, PrerequisiteDefinition, PrerequisiteStatus, PrerequisitePlugin, InstallStep } from '../utils/prerequisitesManager';
import { AdobeAuthManager } from '../utils/adobeAuthManager';
import { ComponentHandler } from './componentHandler';
import { ErrorLogger } from '../utils/errorLogger';
import { ComponentRegistryManager } from '../utils/componentRegistry';
import { ProgressUnifier, UnifiedProgress } from '../utils/progressUnifier';
import { StepLogger } from '../utils/stepLogger';
import { getExternalCommandManager } from '../extension';
import { ExternalCommandManager } from '../utils/externalCommandManager';
import { getLogger } from '../utils/debugLogger';

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
        } catch (error) {
            // StepLogger will use defaults if config loading fails
            this.logger.debug('Could not load wizard steps for logging, using defaults');
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
                this.logger.debug('Loaded component defaults:', componentDefaults);
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
                this.logger.debug('Loaded wizard steps configuration:', wizardSteps);
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

        comm.on('continue-prerequisites', async () => {
            this.logger.debug('Continuing with prerequisites');
            await this.continueWithPrerequisites();
            return { success: true };
        });

        comm.on('install-prerequisite', async (data: any) => {
            await this.handleInstallPrerequisite(data.prereqId, data.version);
            return { success: true };
        });

        // Component management
        comm.on('update-component-selection', (data: any) => {
            this.currentComponentSelection = data;
            this.logger.debug('Updated component selection:', data);
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

        // Cancel
        comm.on('cancel', () => {
            this.panel?.dispose();
            this.logger.info('Wizard cancelled by user');
            return { success: true };
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
            this.logger.info('[Project Creation] Initializing wizard interface...');
            
            // Create or reveal panel
            await this.createOrRevealPanel();
            
            // Initialize communication with handshake
            await this.initializeCommunication();
            
            this.logger.debug('Wizard webview initialized with handshake protocol');
            
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
            this.stepLogger.log('prerequisites', 'Starting prerequisites check', 'info');

            // Store the component selection for later use
            if (componentSelection) {
                this.currentComponentSelection = componentSelection;
            }

            // Load config and get prerequisites
            const config = await this.prereqManager.loadConfig();
            // Get prerequisites based on component selection or use all
            const prerequisites = config.prerequisites || [];
            this.currentPrerequisites = prerequisites;

            // Initialize state tracking
            this.currentPrerequisiteStates = new Map();

            // Get Node version to component mapping if we have components selected
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
                    this.logger.warn('Failed to get Node version mapping:', error as Error);
                }
            }

            this.stepLogger.log('prerequisites', `Found ${prerequisites.length} prerequisites to check`, 'info');

            // Send prerequisites list to UI so it can display them
            await this.sendMessage('prerequisites-loaded', {
                prerequisites: prerequisites.map((p, index) => ({
                    id: index,
                    name: p.name,
                    description: p.description,
                    optional: p.optional || false,
                    plugins: p.plugins
                })),
                nodeVersionMapping
            });
            
            // Small delay to ensure UI updates before we start checking
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Check each prerequisite
            for (let i = 0; i < prerequisites.length; i++) {
                const prereq = prerequisites[i];
                this.stepLogger.log('prerequisites', `Checking ${prereq.name}...`, 'info');

                // Send status update
                await this.sendMessage('prerequisite-status', {
                    index: i,
                    name: prereq.name,
                    status: 'checking',
                    description: prereq.description,
                    required: !prereq.optional
                });

                // Check prerequisite
                const checkResult = await this.prereqManager.checkPrerequisite(prereq);

                // Store state for this prerequisite
                this.currentPrerequisiteStates.set(i, {
                    prereq,
                    result: checkResult
                });

                // For Node.js, check multiple versions if we have a mapping
                let nodeVersionStatus: { version: string; component: string; installed: boolean }[] | undefined;
                if (prereq.id === 'node' && Object.keys(nodeVersionMapping).length > 0) {
                    nodeVersionStatus = await this.prereqManager.checkMultipleNodeVersions(nodeVersionMapping);
                }

                // Log the result
                if (checkResult.installed) {
                    this.stepLogger.log('prerequisites', `✓ ${prereq.name} is installed${checkResult.version ? ': ' + checkResult.version : ''}`, 'info');
                } else {
                    this.stepLogger.log('prerequisites', `✗ ${prereq.name} is not installed`, 'warn');
                }

                // Send result with proper status values
                await this.sendMessage('prerequisite-status', {
                    index: i,
                    name: prereq.name,
                    status: checkResult.installed ? 'success' : (!prereq.optional ? 'error' : 'warning'),
                    description: prereq.description,
                    required: !prereq.optional,
                    installed: checkResult.installed,
                    version: checkResult.version,
                    message: checkResult.installed
                        ? `${prereq.name} is installed${checkResult.version ? ': ' + checkResult.version : ''}`
                        : `${prereq.name} is not installed`,
                    canInstall: checkResult.canInstall,
                    plugins: checkResult.plugins,  // Add plugins data for success messages
                    nodeVersionStatus  // Add multi-version Node.js status
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
            
            this.stepLogger.log('prerequisites', `Prerequisites check complete. All required installed: ${allRequiredInstalled}`, 'info');
            
        } catch (error) {
            this.logger.error('Prerequisites check failed:', error as Error);
            await this.sendMessage('error', {
                message: 'Failed to check prerequisites',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    }

    private async continueWithPrerequisites(): Promise<void> {
        // This is called when user chooses to continue despite missing optional prerequisites
        this.logger.info('User chose to continue with missing optional prerequisites');
        // The UI will handle navigation
    }

    private async handleInstallPrerequisite(prereqId: number, version?: string): Promise<void> {
        try {
            const state = this.currentPrerequisiteStates?.get(prereqId);
            if (!state) {
                throw new Error(`Prerequisite state not found for ID ${prereqId}`);
            }
            
            const { prereq, result } = state;
            this.logger.info(`Installing prerequisite: ${prereq.name}`);
            
            // Create progress tracker for this installation
            const progressId = `install-${prereq.id}-${Date.now()}`;
            
            // Send initial installing status
            await this.sendMessage('prerequisiteStatus', {
                id: prereqId,
                name: prereq.name,
                status: 'installing',
                description: `Installing ${prereq.name}...`,
                required: !prereq.optional,
                progress: 0
            });
            
            // For now, simulate installation since PrerequisitesManager doesn't have installPrerequisite
            // TODO: Implement actual installation
            await this.sendMessage('prerequisiteStatus', {
                id: prereqId,
                name: prereq.name,
                status: 'installing',
                description: `Installing ${prereq.name}...`,
                required: !prereq.optional,
                progress: 50
            });
            
            // Simulate installation delay
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Check again after "installation"
            const installResult = await this.prereqManager.checkPrerequisite(prereq);
            
            // Update state with new result
            this.currentPrerequisiteStates!.set(prereqId, {
                prereq,
                result: installResult
            });
            
            // Send final status
            await this.sendMessage('prerequisiteStatus', {
                id: prereqId,
                name: prereq.name,
                status: installResult.installed ? 'installed' : 'failed',
                description: prereq.description,
                required: !prereq.optional,
                installed: installResult.installed,
                version: installResult.version,
                canInstall: false  // Already attempted install
            });
            
            this.logger.info(`Prerequisite ${prereq.name} installation ${installResult.installed ? 'succeeded' : 'failed'}`);
            
        } catch (error) {
            this.logger.error(`Failed to install prerequisite ${prereqId}:`, error as Error);
            await this.sendMessage('prerequisiteStatus', {
                id: prereqId,
                status: 'failed',
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    // Adobe authentication methods
    private async handleCheckAuth(): Promise<void> {
        const checkStartTime = Date.now();
        this.logger.debug('[Auth] Starting authentication check');
        this.logger.info('[Auth] User initiated authentication check');
        
        // Step 1: Initial check with user-friendly message
        await this.sendMessage('auth-status', {
            isChecking: true,
            message: 'Connecting to Adobe services...',
            subMessage: 'Verifying your credentials',
            isAuthenticated: false
        });

        try {
            const isAuthenticated = await this.authManager.isAuthenticated();
            const checkDuration = Date.now() - checkStartTime;

            this.logger.info(`[Auth] Authentication check completed in ${checkDuration}ms: ${isAuthenticated}`);

            // Get current organization if authenticated
            let currentOrg = undefined;
            let currentProject = undefined;

            if (isAuthenticated) {
                // Step 2: If authenticated, check organization with progress
                await this.sendMessage('auth-status', {
                    isChecking: true,
                    message: 'Authentication verified',
                    subMessage: 'Loading your organization details...',
                    isAuthenticated: true
                });

                currentOrg = await this.authManager.getCurrentOrganization();
                if (currentOrg) {
                    this.logger.info(`[Auth] Current organization: ${currentOrg.name}`);

                    // Step 3: Check project if org exists
                    await this.sendMessage('auth-status', {
                        isChecking: true,
                        message: 'Organization confirmed',
                        subMessage: `Loading projects for ${currentOrg.name}...`,
                        isAuthenticated: true
                    });

                    currentProject = await this.authManager.getCurrentProject();
                    if (currentProject) {
                        this.logger.info(`[Auth] Current project: ${currentProject.name}`);
                    }
                } else {
                    // Authenticated but no org - likely interrupted switch or cleared due to mismatch
                    this.logger.warn('[Auth] Authenticated but no organization selected - likely interrupted switch or access issue');
                }
            }
            
            // Determine final status with user-friendly messaging
            let message: string;
            let subMessage: string | undefined;
            let requiresOrgSelection = false;

            if (isAuthenticated) {
                if (!currentOrg) {
                    message = 'Action required';
                    subMessage = 'Your previous organization is no longer accessible';
                    requiresOrgSelection = true;
                } else if (!currentProject) {
                    message = 'Ready to continue';
                    subMessage = `Connected to ${currentOrg.name}`;
                } else {
                    message = 'Ready to continue';
                    subMessage = `Connected to ${currentOrg.name} - ${currentProject.name}`;
                }
            } else {
                message = 'Sign in required';
                subMessage = 'Connect your Adobe account to access App Builder services';
            }

            // Log the final status message
            this.logger.info(`[Auth] ${message}${subMessage ? ' - ' + subMessage : ''}`);

            await this.sendMessage('auth-status', {
                authenticated: isAuthenticated,
                isAuthenticated: isAuthenticated,
                isChecking: false,
                organization: currentOrg,
                project: currentProject,
                message,
                subMessage,
                requiresOrgSelection
            });
        } catch (error) {
            const checkDuration = Date.now() - checkStartTime;
            this.logger.error(`[Auth] Failed to check auth after ${checkDuration}ms:`, error as Error);
            
            await this.sendMessage('auth-status', {
                authenticated: false,
                isAuthenticated: false,
                isChecking: false,
                error: true,
                message: 'Connection issue',
                subMessage: 'Unable to reach Adobe services. Please check your connection and try again.'
            });
        }
    }

    private async handleAuthenticate(force: boolean = false): Promise<void> {
        if (this.isAuthenticating) {
            this.logger.warn('[Auth] Authentication already in progress, ignoring duplicate request');
            return;
        }
        
        const authStartTime = Date.now();
        
        try {
            this.isAuthenticating = true;
            
            // If not forcing, check if already authenticated
            if (!force) {
                this.logger.debug('[Auth] Checking for existing valid authentication...');
                const isAlreadyAuth = await this.authManager.isAuthenticated();
                
                if (isAlreadyAuth) {
                    this.logger.info('[Auth] Already authenticated, skipping login');
                    this.isAuthenticating = false;
                    
                    // Get the current context
                    const currentOrg = await this.authManager.getCurrentOrganization();
                    const currentProject = await this.authManager.getCurrentProject();
                    
                    await this.sendMessage('auth-status', {
                        authenticated: true,
                        isAuthenticated: true,
                        isChecking: false,
                        organization: currentOrg,
                        project: currentProject,
                        message: 'Already authenticated',
                        subMessage: currentOrg ? `Connected to ${currentOrg?.name || 'your organization'}` : 'Please complete authentication to continue'
                    });
                    return;
                }
            }
            
            this.logger.info(`[Auth] Starting Adobe authentication process${force ? ' (forced)' : ''} - opening browser...`);
            
            // Send initial status that we're starting authentication with clearer message
            await this.sendMessage('auth-status', {
                isChecking: true,
                message: 'Opening browser for authentication...',
                subMessage: force ? 'Starting fresh login...' : 'If you\'re already logged in, the browser will complete automatically.',
                isAuthenticated: false
            });
            
            // Start authentication - pass force flag to authManager
            this.logger.debug(`[Auth] Initiating browser-based login${force ? ' with force flag' : ''}`);
            
            // The login method already handles polling internally
            const loginSuccess = await this.authManager.login(force);
            
            const loginDuration = Date.now() - authStartTime;
            this.isAuthenticating = false;
            
            if (loginSuccess) {
                this.logger.info(`[Auth] Authentication completed successfully after ${loginDuration}ms`);

                // Send update that authentication is complete and we're setting up
                await this.sendMessage('auth-status', {
                    isChecking: true,
                    message: 'Authentication successful',
                    subMessage: force ? 'Setting up organization access...' : 'Loading your details...',
                    isAuthenticated: true
                });

                // Clear cache if this was a forced login (organization switch)
                if (force) {
                    this.authManager.clearCache();
                    // Note: Console context was cleared before login to preserve browser selection
                    this.logger.info('[Auth] Cleared caches after forced login - checking for organization selection');
                }

                // Send update that we're loading organization details
                await this.sendMessage('auth-status', {
                    isChecking: true,
                    message: 'Authentication verified',
                    subMessage: 'Loading organization details...',
                    isAuthenticated: true
                });

                // After fresh authentication, we know org is empty (console context was cleared)
                // Skip the redundant getCurrentOrganization() call and go directly to auto-selection
                this.logger.info('[Auth] Organization empty after fresh login - attempting auto-selection');

                await this.sendMessage('auth-status', {
                    isChecking: true,
                    message: 'Authentication verified',
                    subMessage: 'Checking available organizations...',
                    isAuthenticated: true
                });

                // Attempt auto-selection, skip the redundant current org check for performance
                let currentOrg = await this.authManager.autoSelectOrganizationIfNeeded(true);

                if (currentOrg) {
                    this.logger.info(`[Auth] Auto-selected organization: ${currentOrg.name}`);
                } else {
                    this.logger.info('[Auth] Auto-selection not possible - multiple organizations available or none accessible');
                }

                const currentProject = await this.authManager.getCurrentProject();

                // Handle the case where organization wasn't set during browser login (expected for forced login)
                if (!currentOrg && force) {
                    this.logger.info('[Auth] No organization set after forced login - this is expected, user needs to select organization');

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
                } else {
                    // Normal case - organization is available
                    await this.sendMessage('auth-status', {
                        authenticated: true,
                        isAuthenticated: true,
                        isChecking: false,
                        organization: currentOrg,
                        project: currentProject,
                        message: 'Ready to continue',
                        subMessage: currentOrg ? `Connected to ${currentOrg.name}` : 'Authentication verified'
                    });
                }
            } else {
                this.logger.warn(`[Auth] Authentication timed out after ${loginDuration}ms`);
                
                await this.sendMessage('authTimeout', {
                    message: 'Authentication timed out. Please try again.',
                    authenticated: false,
                    isAuthenticated: false,
                    isChecking: false
                });
            }
            
        } catch (error) {
            const failDuration = Date.now() - authStartTime;
            this.isAuthenticating = false;
            
            this.logger.error(`[Auth] Failed to start authentication after ${failDuration}ms:`, error as Error);
            await this.sendMessage('authError', {
                error: error instanceof Error ? error.message : String(error)
            });
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
    private async handleGetProjects(orgId: string): Promise<void> {
        try {
            // Send loading status with sub-message
            const currentOrg = await this.authManager.getCurrentOrganization();
            if (currentOrg) {
                await this.sendMessage('project-loading-status', {
                    isLoading: true,
                    message: 'Loading your Adobe projects...',
                    subMessage: `Fetching from organization: ${currentOrg?.name || 'your organization'}`
                });
            }
            
            // getProjects doesn't take parameters - it uses the selected org
            const projects = await this.authManager.getProjects();
            await this.sendMessage('projects', projects);
        } catch (error) {
            this.logger.error('Failed to get projects:', error as Error);
            await this.sendMessage('error', {
                message: 'Failed to load projects',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    }

    private async handleSelectProject(projectId: string): Promise<void> {
        this.debugLogger.debug(`[Project] handleSelectProject called with projectId: ${projectId}`);

        try {
            this.debugLogger.debug(`[Project] About to call authManager.selectProject`);
            // Directly select the project - we already have the projectId
            const success = await this.authManager.selectProject(projectId);

            this.debugLogger.debug(`[Project] authManager.selectProject returned: ${success}`);

            if (success) {
                this.logger.info(`Selected project: ${projectId}`);
                this.debugLogger.debug(`[Project] Project selection succeeded, about to send projectSelected message`);

                // Ensure fresh workspace data after project change
                // (selectProject already clears workspace cache)

                try {
                    await this.sendMessage('projectSelected', { projectId });
                    this.debugLogger.debug(`[Project] projectSelected message sent successfully`);
                } catch (sendError) {
                    this.debugLogger.debug(`[Project] Failed to send projectSelected message:`, sendError);
                    throw new Error(`Failed to send project selection response: ${sendError instanceof Error ? sendError.message : String(sendError)}`);
                }
            } else {
                // Log error but don't throw - let caller handle response
                this.logger.error(`Failed to select project ${projectId}`);
                this.debugLogger.debug(`[Project] Project selection failed, sending error message`);
                await this.sendMessage('error', {
                    message: 'Failed to select project',
                    details: `Project selection for ${projectId} was unsuccessful`
                });
                throw new Error(`Failed to select project ${projectId}`);
            }
        } catch (error) {
            this.debugLogger.debug(`[Project] Exception caught in handleSelectProject:`, error);
            this.logger.error('Failed to select project:', error as Error);
            await this.sendMessage('error', {
                message: 'Failed to select project',
                details: error instanceof Error ? error.message : String(error)
            });
            // Re-throw so the handler can send proper response
            throw error;
        }
    }

    // Workspace management
    private async handleGetWorkspaces(orgId: string, projectId: string): Promise<void> {
        try {
            // Send loading status with sub-message
            const currentProject = await this.authManager.getCurrentProject();
            if (currentProject) {
                await this.sendMessage('workspace-loading-status', {
                    isLoading: true,
                    message: 'Loading workspaces...',
                    subMessage: `Fetching from project: ${currentProject.title || currentProject.name}`
                });
            }
            
            // getWorkspaces doesn't take parameters - it uses the selected org/project
            const workspaces = await this.authManager.getWorkspaces();
            await this.sendMessage('workspaces', workspaces);
        } catch (error) {
            this.logger.error('Failed to get workspaces:', error as Error);
            await this.sendMessage('error', {
                message: 'Failed to load workspaces',
                details: error instanceof Error ? error.message : String(error)
            });
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

    // Project creation
    private async handleCreateProject(config: any): Promise<void> {
        try {
            this.logger.info('Starting project creation with config:', config);
            
            // Send initial status
            await this.sendMessage('creationStarted', {});
            
            // Create progress tracker
            const progressTracker = (step: string, progress: number, message?: string) => {
                this.sendMessage('creationProgress', {
                    step,
                    progress,
                    message
                });
            };
            
            // TODO: Implement actual project creation logic
            // This would involve:
            // 1. Setting up project directory
            // 2. Installing dependencies
            // 3. Configuring Adobe services
            // 4. Setting up components
            // 5. Running initial build
            
            // For now, simulate progress
            await progressTracker('setup', 10, 'Creating project directory...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            await progressTracker('dependencies', 30, 'Installing dependencies...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            await progressTracker('adobe', 50, 'Configuring Adobe services...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            await progressTracker('components', 70, 'Setting up components...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            await progressTracker('build', 90, 'Running initial build...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            await progressTracker('complete', 100, 'Project created successfully!');
            
            // Send completion
            await this.sendMessage('creationComplete', {
                projectPath: '/path/to/project',  // TODO: Get actual path
                success: true
            });
            
            this.logger.info('Project creation completed successfully');
            
        } catch (error) {
            this.logger.error('Project creation failed:', error as Error);
            await this.sendMessage('creationError', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
}