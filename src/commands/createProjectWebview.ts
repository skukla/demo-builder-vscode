import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ServiceLocator } from '../services/serviceLocator';
import { parseJSON } from '../types/typeGuards';
import { AuthenticationService } from '../utils/auth';
import { getLogger, ErrorLogger, StepLogger } from '../shared/logging';
import { PrerequisitesManager } from '../utils/prerequisitesManager';
import { ProgressUnifier } from '../utils/progressUnifier';
import { WebviewCommunicationManager } from '@/shared/communication';
import { BaseWebviewCommand } from './baseWebviewCommand';
// Prerequisites checking is handled by PrerequisitesManager
import { ComponentHandler } from './componentHandler';
// Extracted helper functions
import { HandlerContext, SharedState } from './handlers/HandlerContext';
import { HandlerRegistry } from './handlers/HandlerRegistry';
import {
    formatGroupName as formatGroupNameHelper,
    generateComponentEnvFile as generateEnvFile,
    getSetupInstructions as getSetupInstructionsHelper,
    getEndpoint as getEndpointHelper,
    deployMeshComponent as deployMeshHelper,
} from './helpers';

// Type definitions for createProjectWebview
interface WizardStep {
    id: string;
    [key: string]: unknown;
}

interface ComponentDefaults {
    frontend?: string;
    backend?: string;
    dependencies?: string[];
}

interface InitialWizardData {
    theme: 'dark' | 'light';
    workspacePath: string | undefined;
    componentDefaults: ComponentDefaults | null;
    wizardSteps: WizardStep[] | null;
}

export class CreateProjectWebviewCommand extends BaseWebviewCommand {
    // Prerequisites are handled by PrerequisitesManager
    private prereqManager: PrerequisitesManager;
    private authManager: AuthenticationService;
    private componentHandler: ComponentHandler;
    private errorLogger: ErrorLogger;
    private debugLogger = getLogger();
    private progressUnifier: ProgressUnifier;
    private stepLogger: StepLogger;
    private handlerRegistry: HandlerRegistry;  // Handler registry for message dispatch

    // Shared state object (passed by reference to handlers for automatic synchronization)
    private sharedState: SharedState;

    /**
     * Request Welcome reopen when wizard closes
     * Extension will check if any other webviews are open
     */
    protected shouldReopenWelcomeOnDispose(): boolean {
        return true;
    }

    constructor(
        context: vscode.ExtensionContext,
        stateManager: import('../shared/state').StateManager,
        statusBar: import('../providers/statusBar').StatusBarManager,
        logger: import('../shared/logging').Logger,
    ) {
        super(context, stateManager, statusBar, logger);
        // PrerequisitesManager is initialized with proper path
        this.prereqManager = new PrerequisitesManager(context.extensionPath, logger);
        this.authManager = new AuthenticationService(
            context.extensionPath, 
            logger,
            ServiceLocator.getCommandExecutor(),
        );
        this.componentHandler = new ComponentHandler(context);
        this.errorLogger = new ErrorLogger(context);
        this.progressUnifier = new ProgressUnifier(logger);

        // Initialize HandlerRegistry for message dispatch
        this.handlerRegistry = new HandlerRegistry();

        // Initialize StepLogger with configuration
        const templatesPath = path.join(context.extensionPath, 'templates', 'logging.json');
        this.stepLogger = new StepLogger(logger, undefined, templatesPath);

        // Load wizard steps configuration for step names
        try {
            const stepsPath = path.join(context.extensionPath, 'templates', 'wizard-steps.json');
            if (fs.existsSync(stepsPath)) {
                const stepsContent = fs.readFileSync(stepsPath, 'utf8');
                const stepsConfig = parseJSON<{ steps: unknown[] }>(stepsContent);
                if (stepsConfig && Array.isArray(stepsConfig.steps)) {
                    // Type guard: ensure each step has required properties
                    const isWizardStepArray = stepsConfig.steps.every(
                        (s): s is { id: string; name: string; [key: string]: unknown } =>
                            typeof s === 'object' && s !== null && 'id' in s && typeof s.id === 'string' && 'name' in s && typeof s.name === 'string',
                    );
                    if (isWizardStepArray) {
                        // Type assertion after successful type guard
                        const validatedSteps = stepsConfig.steps as { id: string; name: string; [key: string]: unknown }[];
                        this.stepLogger = new StepLogger(logger, validatedSteps, templatesPath);
                    }
                }
            }
        } catch {
            // StepLogger will use defaults if config loading fails
            this.logger.debug('Could not load wizard steps for logging, using defaults');
        }

        // Initialize shared state object (passed by reference to handlers)
        this.sharedState = {
            currentComponentSelection: undefined,
            componentsData: undefined,
            currentPrerequisites: undefined,
            currentPrerequisiteStates: undefined,
            isAuthenticating: false,
            projectCreationAbortController: undefined,
            meshCreatedForWorkspace: undefined,
            meshExistedBeforeSession: undefined,
            apiServicesConfig: undefined,
        };

        // Load API services configuration into shared state
        try {
            const apiServicesPath = path.join(context.extensionPath, 'templates', 'api-services.json');
            if (fs.existsSync(apiServicesPath)) {
                const servicesContent = fs.readFileSync(apiServicesPath, 'utf8');
                const apiServicesConfig = parseJSON<Record<string, unknown>>(servicesContent);
                if (apiServicesConfig) {
                    this.sharedState.apiServicesConfig = apiServicesConfig;
                    this.logger.debug('Loaded API services configuration');
                }
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
            vscode.Uri.file(path.join(webviewPath, 'main-bundle.js')),
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

    protected async getInitialData(): Promise<InitialWizardData> {
        // Load component defaults from defaults.json
        let componentDefaults: ComponentDefaults | null = null;
        try {
            const defaultsPath = path.join(this.context.extensionPath, 'templates', 'defaults.json');
            if (fs.existsSync(defaultsPath)) {
                const defaultsContent = fs.readFileSync(defaultsPath, 'utf8');
                const defaults = parseJSON<{ componentSelection: ComponentDefaults }>(defaultsContent);
                if (defaults) {
                    componentDefaults = defaults.componentSelection;
                    this.logger.debug(`Loaded component defaults: frontend=${componentDefaults?.frontend || 'none'}, backend=${componentDefaults?.backend || 'none'}, ${componentDefaults?.dependencies?.length || 0} dependencies`);
                }
            }
        } catch (error) {
            this.logger.debug('Could not load component defaults:', error);
        }

        // Load wizard steps configuration
        let wizardSteps: WizardStep[] | null = null;
        try {
            const stepsPath = path.join(this.context.extensionPath, 'templates', 'wizard-steps.json');
            if (fs.existsSync(stepsPath)) {
                const stepsContent = fs.readFileSync(stepsPath, 'utf8');
                const stepsConfig = parseJSON<{ steps: WizardStep[] }>(stepsContent);
                if (stepsConfig) {
                    wizardSteps = stepsConfig.steps;
                    this.logger.debug(`Loaded ${wizardSteps?.length || 0} wizard steps: ${wizardSteps?.slice(0, 3).map((s) => s.id).join(', ')}${wizardSteps?.length > 3 ? ` ... (and ${wizardSteps.length - 3} more)` : ''}`);
                }
            }
        } catch (error) {
            this.logger.error('Failed to load wizard steps configuration:', error as Error);
        }

        return {
            theme: vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light',
            workspacePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
            componentDefaults,
            wizardSteps,
        };
    }

    protected getLoadingMessage(): string {
        return 'Loading Project Creation Wizard...';
    }

    /**
     * Create handler context with all dependencies
     *
     * Provides handlers with access to all required managers, loggers,
     * and shared state (passed by reference for automatic synchronization).
     */
    private createHandlerContext(): HandlerContext {
        return {
            // Managers
            prereqManager: this.prereqManager,
            authManager: this.authManager,
            componentHandler: this.componentHandler,
            errorLogger: this.errorLogger,
            progressUnifier: this.progressUnifier,
            stepLogger: this.stepLogger,

            // Loggers
            logger: this.logger,
            debugLogger: this.debugLogger,

            // VS Code integration
            context: this.context,
            panel: this.panel,
            stateManager: this.stateManager,
            communicationManager: this.communicationManager,
            sendMessage: (type: string, data?: unknown) => this.sendMessage(type, data),

            // Shared state (by reference - changes persist automatically)
            sharedState: this.sharedState,
        };
    }

    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        // Auto-register all handlers from HandlerRegistry
        // This eliminates boilerplate by automatically discovering and registering
        // all message handlers. Special cases (like progress callbacks) are handled
        // via HandlerRegistry.needsProgressCallback().
        //
        // SharedState is passed by reference, so handlers can modify state directly
        // without manual synchronization. Changes to context.sharedState automatically persist.

        const messageTypes = this.handlerRegistry.getRegisteredTypes();

        for (const messageType of messageTypes) {
            // Check if this handler needs special progress callback handling
            if (this.handlerRegistry.needsProgressCallback(messageType)) {
                // Special case: create-api-mesh needs progress updates
                comm.on(messageType, async (data: unknown) => {
                    const onProgress = (message: string, subMessage?: string) => {
                        comm.sendMessage('api-mesh-progress', { message, subMessage }).catch(err => {
                            this.logger.warn('[API Mesh] Failed to send progress update', err);
                        });
                    };
                    const context = this.createHandlerContext();
                    return await this.handlerRegistry.handle(context, messageType, { ...(data as object), onProgress });
                });
            } else {
                // Standard handler registration (all other handlers)
                comm.on(messageType, async (data: unknown) => {
                    const context = this.createHandlerContext();
                    return await this.handlerRegistry.handle(context, messageType, data);
                });
            }
        }
    }

    public async execute(): Promise<void> {
        try {
            this.logger.info('[Project Creation] Initializing wizard interface...');
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
        actionParams?: unknown,
    ): Promise<void> {
        await this.sendMessage('feedback', {
            step,
            status,
            primary,
            secondary,
            details,
            action,
            actionParams,
            timestamp: Date.now(),
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

    // Helper methods that delegate to extracted helpers
    private getSetupInstructions(selectedComponents: string[] = []): { step: string; details: string; important?: boolean }[] | undefined {
        return getSetupInstructionsHelper(this.sharedState.apiServicesConfig, selectedComponents, this.sharedState.componentsData as import('../types/components').ComponentRegistry | undefined);
    }

    /**
     * Get mesh endpoint - single source of truth approach:
     * 1. Use cached endpoint if available (instant)
     * 2. Call aio api-mesh:describe (official Adobe method, ~3s)
     * 3. Construct from meshId as reliable fallback
     */
    private async getEndpoint(
        meshId: string,
        cachedEndpoint?: string,
    ): Promise<string> {
        const commandManager = ServiceLocator.getCommandExecutor();
        return getEndpointHelper(meshId, cachedEndpoint, commandManager, this.logger, this.debugLogger);
    }

    // Validation

    // Project creation with timeout and cancellation support
    
    // Actual project creation logic (extracted for testability)
    
    /**
     * Generate component-specific .env file
     * Each component gets its own .env with only the variables it needs
     */
    private async generateComponentEnvFile(
        componentPath: string,
        componentId: string,
        componentDef: unknown,
        config: Record<string, unknown>,
    ): Promise<void> {
        await generateEnvFile(componentPath, componentId, componentDef as import('../types/components').TransformedComponentDefinition, config, this.logger);
    }
    
    /**
     * Format group name for display
     */
    private formatGroupName(group: string): string {
        return formatGroupNameHelper(group);
    }
    
    /**
     * Deploy mesh component from cloned repository
     * Reads mesh.json from component path and deploys it to Adobe I/O
     */
    private async deployMeshComponent(
        componentPath: string,
        onProgress?: (message: string, subMessage?: string) => void,
    ): Promise<{
        success: boolean;
        meshId?: string;
        endpoint?: string;
        error?: string;
    }> {
        const commandManager = ServiceLocator.getCommandExecutor();
        return deployMeshHelper(componentPath, commandManager, this.logger, onProgress);
    }
}