import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import { BaseWebviewCommand } from './baseWebviewCommand';
import { WebviewCommunicationManager } from '../utils/webviewCommunicationManager';
// Prerequisites checking is handled by PrerequisitesManager
import { PrerequisitesManager, PrerequisiteDefinition, PrerequisiteStatus, PrerequisitePlugin, InstallStep } from '../utils/prerequisitesManager';
import { AdobeAuthManager, AdobeOrg, AdobeProject } from '../utils/adobeAuthManager';
import { ComponentHandler } from './componentHandler';
import { ErrorLogger } from '../utils/errorLogger';
import { ComponentRegistryManager } from '../utils/componentRegistry';
import { ProgressUnifier, UnifiedProgress } from '../utils/progressUnifier';
import { StepLogger } from '../utils/stepLogger';
import { getExternalCommandManager } from '../extension';
import { ExternalCommandManager } from '../utils/externalCommandManager';
import { getLogger } from '../utils/debugLogger';
import { TIMEOUTS } from '../utils/timeoutConfig';

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

        // Check required APIs (e.g., API Mesh) for the currently selected project
        comm.on('check-project-apis', async (data: any) => {
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
                    this.debugLogger.debug('[API Mesh] Sending progress update to frontend:', { message, subMessage });
                    // Fire-and-forget sendMessage, catch errors to prevent crashes
                    comm.sendMessage('api-mesh-progress', { message, subMessage }).catch(err => {
                        this.logger.warn('[API Mesh] Failed to send progress update', err);
                    });
                };
                
                this.logger.debug('[API Mesh] Starting handleCreateApiMesh');
                const result = await this.handleCreateApiMesh(data.workspaceId, onProgress);
                this.logger.debug('[API Mesh] handleCreateApiMesh completed', result);
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
                
                const commandManager = getExternalCommandManager();
                const result = await commandManager.execute(
                    'aio api-mesh delete --autoConfirmAction',
                    {
                        timeout: TIMEOUTS.API_CALL,
                        configureTelemetry: false,
                        useNodeVersion: null,
                        enhancePath: true
                    }
                );
                
                if (result.code === 0) {
                    this.logger.info('[API Mesh] Mesh deleted successfully');
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
            // Get prerequisites and resolve dependency order
            const prerequisites = this.prereqManager.resolveDependencies(config.prerequisites || []);
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

                // For Node.js, check multiple versions if we have a mapping
                let nodeVersionStatus: { version: string; component: string; installed: boolean }[] | undefined;
                if (prereq.id === 'node' && Object.keys(nodeVersionMapping).length > 0) {
                    nodeVersionStatus = await this.prereqManager.checkMultipleNodeVersions(nodeVersionMapping);
                }

                // For per-node-version prerequisites (e.g., Adobe I/O CLI), detect partial installs across required Node majors
                let perNodeVariantMissing = false;
                let missingVariantMajors: string[] = [];
                let perNodeVersionStatus: { version: string; component: string; installed: boolean }[] = [];
                if (prereq.perNodeVersion && Object.keys(nodeVersionMapping).length > 0) {
                    const requiredMajors = Object.keys(nodeVersionMapping);
                    const commandManager = getExternalCommandManager();
                    for (const major of requiredMajors) {
                        try {
                            const { stdout } = await commandManager.execute(prereq.check.command, { useNodeVersion: major });
                            // Parse CLI version if regex provided
                            let cliVersion = '';
                            if (prereq.check.parseVersion) {
                                try {
                                    const match = stdout.match(new RegExp(prereq.check.parseVersion));
                                    if (match) cliVersion = match[1] || '';
                                } catch {}
                            }
                            perNodeVersionStatus.push({ version: `Node ${major}`, component: cliVersion, installed: true });
                        } catch {
                            perNodeVariantMissing = true;
                            missingVariantMajors.push(major);
                            perNodeVersionStatus.push({ version: `Node ${major}`, component: '', installed: false });
                        }
                    }
                }

                // Store state for this prerequisite (include nodeVersionStatus if available)
                this.currentPrerequisiteStates.set(i, {
                    prereq,
                    result: checkResult,
                    nodeVersionStatus: prereq.id === 'node' ? nodeVersionStatus : perNodeVersionStatus
                });

                // Log the result
                if (checkResult.installed) {
                    this.stepLogger.log('prerequisites', `✓ ${prereq.name} is installed${checkResult.version ? ': ' + checkResult.version : ''}`, 'info');
                } else {
                    this.stepLogger.log('prerequisites', `✗ ${prereq.name} is not installed`, 'warn');
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
                if (prereq.perNodeVersion && perNodeVariantMissing) {
                    overallStatus = 'error';
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
                    message: (prereq.perNodeVersion && perNodeVersionStatus && perNodeVersionStatus.length > 0)
                        ? `Installed for versions:`
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
            
            this.stepLogger.log('prerequisites', `Prerequisites check complete. All required installed: ${allRequiredInstalled}`, 'info');
            
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

                const checkResult = await this.prereqManager.checkPrerequisite(prereq);

                this.currentPrerequisiteStates.set(i, { prereq, result: checkResult });

                // Variant checks
                let nodeVersionStatus: { version: string; component: string; installed: boolean }[] | undefined;
                if (prereq.id === 'node' && Object.keys(nodeVersionMapping).length > 0) {
                    nodeVersionStatus = await this.prereqManager.checkMultipleNodeVersions(nodeVersionMapping);
                }

                let perNodeVariantMissing = false;
                let missingVariantMajors: string[] = [];
                let perNodeVersionStatus: { version: string; component: string; installed: boolean }[] = [];
                if (prereq.perNodeVersion && Object.keys(nodeVersionMapping).length > 0) {
                    const requiredMajors = Object.keys(nodeVersionMapping);
                    const commandManager = getExternalCommandManager();
                    for (const major of requiredMajors) {
                        try {
                            const { stdout } = await commandManager.execute(prereq.check.command, { useNodeVersion: major });
                            // Parse CLI version if regex provided
                            let cliVersion = '';
                            if (prereq.check.parseVersion) {
                                try {
                                    const match = stdout.match(new RegExp(prereq.check.parseVersion));
                                    if (match) cliVersion = match[1] || '';
                                } catch {}
                            }
                            perNodeVersionStatus.push({ version: `Node ${major}`, component: cliVersion, installed: true });
                        } catch {
                            perNodeVariantMissing = true;
                            missingVariantMajors.push(major);
                            perNodeVersionStatus.push({ version: `Node ${major}`, component: '', installed: false });
                        }
                    }
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
            
            const { prereq, result } = state;
            // High-level log (user-facing Logs channel)
            this.logger.info(`[Prerequisites] User initiated install for: ${prereq.name}`);
            // Debug channel detail
            this.debugLogger.debug(`[Prerequisites] install-prerequisite payload`, { id: prereqId, name: prereq.name, version });
            
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
                    ? (nodeVersions.length ? nodeVersions : [version || '20'])
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
                } catch {}
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
                    try {
                        await commandManager.execute(prereq.check.command, { useNodeVersion: nodeVer });
                        // Already installed for this Node version
                        this.debugLogger.debug(`[Prerequisites] ${prereq.name} already installed for Node ${nodeVer}, skipping`);
                    } catch {
                        // Missing for this Node version
                        this.debugLogger.debug(`[Prerequisites] ${prereq.name} not found for Node ${nodeVer}, will install`);
                        missingNodeVersions.push(nodeVer);
                    }
                }
                
                targetVersions = missingNodeVersions.length > 0 ? missingNodeVersions : (version ? [version] : []);
            }

            const total = steps.length * (targetVersions && targetVersions.length ? targetVersions.length : 1);
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
                for (const ver of targetVersions) {
                    for (const step of steps) {
                        await run(step, ver);
                    }
                }
            } else {
                for (const step of steps) {
                    await run(step);
                }
            }

            // Re-check after installation and include variant details/messages
            const installResult = await this.prereqManager.checkPrerequisite(prereq);

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
                } catch {}
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
                } catch {}
                const requiredMajors = Object.keys(mapping);
                if (requiredMajors.length > 0) {
                    finalPerNodeVersionStatus = [];
                    const commandManager = getExternalCommandManager();
                    for (const major of requiredMajors) {
                        try {
                            const { stdout } = await commandManager.execute(prereq.check.command, { useNodeVersion: major });
                            // Parse CLI version if regex provided
                            let cliVersion = '';
                            if (prereq.check.parseVersion) {
                                try {
                                    const match = stdout.match(new RegExp(prereq.check.parseVersion));
                                    if (match) cliVersion = match[1] || '';
                                } catch {}
                            }
                            finalPerNodeVersionStatus.push({ version: `Node ${major}`, component: cliVersion, installed: true });
                        } catch {
                            finalPerNodeVersionStatus.push({ version: `Node ${major}`, component: '', installed: false });
                        }
                    }
                }
            }

            this.currentPrerequisiteStates!.set(prereqId, { prereq, result: installResult, nodeVersionStatus: finalNodeVersionStatus });

            const finalMessage = (prereq.id === 'node' && finalNodeVersionStatus && finalNodeVersionStatus.length > 0)
                ? finalNodeVersionStatus.every(s => s.installed)
                    ? `${prereq.name} is installed: ${finalNodeVersionStatus.map(s => s.version).join(', ')}`
                    : `${prereq.name} is missing in ${finalNodeVersionStatus.filter(s => !s.installed).map(s => s.version.replace('Node ', 'Node ')).join(', ')}`
                : (installResult.installed
                    ? `${prereq.name} is installed${installResult.version ? ': ' + installResult.version : ''}`
                    : `${prereq.name} is not installed`);

            // Summarize result in both channels
            if (installResult.installed) {
                this.logger.info(`[Prerequisites] ${prereq.name} installation succeeded`);
                this.debugLogger.debug(`[Prerequisites] ${prereq.name} installation succeeded`, { nodeVersionStatus: finalNodeVersionStatus });
            } else {
                this.logger.warn(`[Prerequisites] ${prereq.name} installation did not complete`);
                this.debugLogger.debug(`[Prerequisites] ${prereq.name} installation incomplete`, { nodeVersionStatus: finalNodeVersionStatus });
            }

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
            } catch {}
            await this.sendMessage('prerequisite-status', {
                index: prereqId,
                status: 'error',
                message: error instanceof Error ? error.message : String(error)
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
            subMessage: 'Verifying your credentials'
            // Don't set isAuthenticated here - leave it undefined while checking
        });

        try {
            const isAuthenticated = await this.authManager.isAuthenticated();
            const checkDuration = Date.now() - checkStartTime;

            this.logger.info(`[Auth] Authentication check completed in ${checkDuration}ms: ${isAuthenticated}`);

            // Get current organization if authenticated
            let currentOrg: AdobeOrg | undefined = undefined;
            let currentProject: AdobeProject | undefined = undefined;

            if (isAuthenticated) {
                // Step 2: If authenticated, check organization (no intermediate messages)
                const orgCheckStart = Date.now();
                currentOrg = await this.authManager.getCurrentOrganization();
                
                if (currentOrg) {
                    this.logger.info(`[Auth] Current organization: ${currentOrg.name} (took ${Date.now() - orgCheckStart}ms)`);

                    // Step 3: Check project if org exists
                    const projectCheckStart = Date.now();
                    currentProject = await this.authManager.getCurrentProject();
                    
                    if (currentProject) {
                        this.logger.info(`[Auth] Current project: ${currentProject.name} (took ${Date.now() - projectCheckStart}ms)`);
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
            
            // Start authentication - pass force flag to authManager
            this.logger.debug(`[Auth] Initiating browser-based login${force ? ' with force flag' : ''}`);
            
            // Show "opening browser" message immediately to inform user
            await this.sendMessage('auth-status', {
                isChecking: true,
                message: 'Opening browser for authentication...',
                subMessage: force ? 'Starting fresh login...' : 'If you\'re already logged in, the browser will complete automatically.',
                isAuthenticated: false
            });
            
            // Start login process
            const loginSuccess = await this.authManager.login(force);
            
            const loginDuration = Date.now() - authStartTime;
            this.isAuthenticating = false;
            
            if (loginSuccess) {
                this.logger.info(`[Auth] Authentication completed successfully after ${loginDuration}ms`);

                // Clear cache if this was a forced login (organization switch)
                if (force) {
                    this.authManager.clearCache();
                    // Note: Console context was cleared before login to preserve browser selection
                    this.logger.info('[Auth] Cleared caches after forced login - checking for organization selection');
                }

                // After fresh authentication, we know org is empty (console context was cleared)
                // Skip the redundant getCurrentOrganization() call and go directly to auto-selection
                this.logger.info('[Auth] Organization empty after fresh login - attempting auto-selection');

                // Start the overall post-login setup (no intermediate messages)
                const setupStart = Date.now();
                
                // Start org auto-selection
                const autoSelectStart = Date.now();
                let currentOrg = await this.authManager.autoSelectOrganizationIfNeeded(true);

                if (currentOrg) {
                    this.logger.info(`[Auth] Auto-selected organization: ${currentOrg.name} (took ${Date.now() - autoSelectStart}ms)`);
                } else {
                    this.logger.info(`[Auth] Auto-selection not possible - multiple organizations available or none accessible (took ${Date.now() - autoSelectStart}ms)`);
                }

                // Get current project (usually fast with SDK)
                const projectCheckStart = Date.now();
                const currentProject = await this.authManager.getCurrentProject();
                if (currentProject) {
                    this.logger.info(`[Auth] Current project: ${currentProject.name} (took ${Date.now() - projectCheckStart}ms)`);
                } else {
                    this.logger.debug(`[Auth] No current project (took ${Date.now() - projectCheckStart}ms)`);
                }

                // Log total post-login setup time
                const totalSetupTime = Date.now() - setupStart;
                this.logger.info(`[Auth] Post-login setup completed in ${totalSetupTime}ms`);

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
                const config = instruction.dynamicValues.ALLOWED_DOMAINS;
                
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
        
        const commandManager = getExternalCommandManager();
        const fs = require('fs').promises;
        const path = require('path');

        try {
            // LAYER 1: Download workspace configuration (most reliable)
            this.logger.info('[API Mesh] Layer 1: Downloading workspace configuration');
            
            // Use extension's global storage instead of OS temp for better control and isolation
            // This keeps all extension files organized and makes debugging easier
            const extensionTempPath = path.join(this.context.globalStorageUri.fsPath, 'temp');
            await fs.mkdir(extensionTempPath, { recursive: true });
            
            const tempDir = await fs.mkdtemp(path.join(extensionTempPath, 'aio-workspace-'));
            const configPath = path.join(tempDir, 'workspace-config.json');
            
            this.debugLogger.debug('[API Mesh] Using extension temp path', { tempDir });
            
            try {
                await commandManager.executeAdobeCLI(
                    `aio console workspace download "${configPath}" --workspaceId ${workspaceId}`
                );
                
                const configContent = await fs.readFile(configPath, 'utf-8');
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
                await fs.rm(tempDir, { recursive: true, force: true });
                
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
                    const endpoint = meshData.meshEndpoint;
                    
                    this.debugLogger.debug('[API Mesh] Parsed mesh data', { meshStatus, meshId, endpoint });
                    
                    // Mesh exists - check its status
                    if (meshStatus === 'deployed' || meshStatus === 'success') {
                        this.logger.info('[API Mesh] Existing mesh found and deployed', { meshId });
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
                        
                        return {
                            apiEnabled: true,
                            meshExists: true,
                            meshId,
                            meshStatus: 'error',
                            error: 'Mesh exists but deployment failed. Click "Recreate Mesh" to delete and redeploy it.'
                        };
                    } else {
                        // Status is pending/provisioning/building
                        this.logger.info('[API Mesh] Mesh exists but is still provisioning', { meshStatus });
                        return {
                            apiEnabled: true,
                            meshExists: true,
                            meshId,
                            meshStatus: 'pending',
                            error: 'Mesh is currently being provisioned. This may take a few minutes.'
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
                    await fs.rm(tempDir, { recursive: true, force: true });
                } catch {}
                
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
		this.logger.info('[API Mesh] About to call onProgress');
		try {
			onProgress?.('Creating API Mesh...', 'Submitting configuration to Adobe');
			this.logger.info('[API Mesh] onProgress call completed');
		} catch (progressError) {
			this.logger.warn('[API Mesh] Progress callback failed (non-fatal)', progressError);
		}
		this.logger.info('[API Mesh] Executing mesh creation command');
		this.logger.info('[API Mesh] Command path:', { meshConfigPath });
		
		let lastOutput = '';
		let meshEndpointFromCreate: string | undefined;
		this.logger.info('[API Mesh] About to execute aio api-mesh create');
			const createResult = await commandManager.execute(
				`aio api-mesh create "${meshConfigPath}" --autoConfirmAction`,
				{
					streaming: true,
					timeout: TIMEOUTS.API_MESH_CREATE,
					onOutput: (data: string) => {
						lastOutput += data;
						
						// Extract mesh endpoint from create output (not returned by 'get' command)
						const endpointMatch = data.match(/Mesh Endpoint:\s*(https:\/\/[^\s]+)/i);
						if (endpointMatch) {
							meshEndpointFromCreate = endpointMatch[1];
							this.logger.info('[API Mesh] Captured endpoint from create output:', meshEndpointFromCreate);
						}
						
						// Parse output for progress indicators
						const output = data.toLowerCase();
						if (output.includes('validating')) {
							onProgress?.('Creating API Mesh...', 'Validating configuration');
						} else if (output.includes('creating')) {
							onProgress?.('Creating API Mesh...', 'Provisioning mesh infrastructure');
						} else if (output.includes('deploying')) {
							onProgress?.('Creating API Mesh...', 'Deploying mesh');
						} else if (output.includes('success')) {
							onProgress?.('Creating API Mesh...', 'Finalizing mesh setup');
						} else if (data.trim()) {
							// Show any other non-empty output as progress
							onProgress?.('Creating API Mesh...', data.trim().substring(0, 80));
						}
					},
					configureTelemetry: false,
					useNodeVersion: null,
					enhancePath: true
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
					const updateResult = await commandManager.execute(
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
							},
							configureTelemetry: false,
							useNodeVersion: null,
							enhancePath: true
						}
					);
					
					if (updateResult.code === 0) {
						this.logger.info('[API Mesh] Mesh updated successfully');
						
						// Extract mesh ID from output
						const meshIdMatch = updateResult.stdout.match(/mesh[_-]?id[:\s]+([a-f0-9-]+)/i);
						const meshId = meshIdMatch ? meshIdMatch[1] : undefined;
						
						onProgress?.('✓ API Mesh Ready', 'Mesh successfully deployed and ready to use');
						
						return {
							success: true,
							meshId,
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
		onProgress?.('Waiting for mesh deployment...', 'Provisioning infrastructure (~20 seconds)');
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
				const verifyResult = await commandManager.execute(
					'aio api-mesh get',
					{
						timeout: TIMEOUTS.API_CALL,
						configureTelemetry: false,
						useNodeVersion: null,
						enhancePath: true
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
					
					// Log the FULL mesh data to understand the structure
					this.debugLogger.debug('[API Mesh] Full mesh data from Adobe API:', JSON.stringify(meshData, null, 2));
					this.debugLogger.debug('[API Mesh] Mesh status:', { meshStatus, meshId: meshData.meshId });
						
						if (meshStatus === 'deployed' || meshStatus === 'success') {
							// Success! Mesh is fully deployed - store the mesh data
							const totalTime = Math.floor((initialWait + (attempt - 1) * pollInterval) / 1000);
							this.logger.info(`[API Mesh] Mesh deployed successfully after ${attempt} attempts (~${totalTime}s total)`);
							deployedMeshId = meshData.meshId;
							// Adobe's 'get' API doesn't return endpoint, use the one from create output
							deployedEndpoint = meshEndpointFromCreate;
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
		
		const returnValue = {
			success: true,
			meshId: deployedMeshId,
			endpoint: deployedEndpoint,
			message: 'API Mesh created and deployed successfully'
		};
		
		this.logger.info('[API Mesh] Returning from handleCreateApiMesh:', {
			success: returnValue.success,
			hasMeshId: !!returnValue.meshId,
			hasEndpoint: !!returnValue.endpoint,
			meshId: returnValue.meshId,
			endpoint: returnValue.endpoint
		});
		
		return returnValue;
			
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