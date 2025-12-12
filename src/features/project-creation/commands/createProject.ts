import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base';
import { WebviewCommunicationManager } from '@/core/communication';
import { ServiceLocator } from '@/core/di';
import { getLogger, ErrorLogger, StepLogger } from '@/core/logging';
import { createBundleUris } from '@/core/utils/bundleUri';
import { getWebviewHTMLWithBundles } from '@/core/utils/getWebviewHTMLWithBundles';
import { ProgressUnifier } from '@/core/utils/progressUnifier';
import { AuthenticationService } from '@/features/authentication';
// Prerequisites checking is handled by PrerequisitesManager
import { ComponentHandler } from '@/features/components/handlers/componentHandler';
import { PrerequisitesManager } from '@/features/prerequisites/services/PrerequisitesManager';
import { ShowProjectsListCommand } from '@/features/projects-dashboard/commands/showProjectsList';
import type { SettingsFile } from '@/features/projects-dashboard';
// Extracted helper functions
import { HandlerContext, SharedState } from '@/commands/handlers/HandlerContext';
import { HandlerRegistry } from '@/features/project-creation/handlers/HandlerRegistry';
import {
    formatGroupName as formatGroupNameHelper,
    getSetupInstructions as getSetupInstructionsHelper,
    getEndpoint as getEndpointHelper,
    deployMeshComponent as deployMeshHelper,
} from '@/features/project-creation/helpers';
import { parseJSON } from '@/types/typeGuards';

// Type definitions for createProjectWebview
interface WizardStep {
    id: string;
    name: string;
    [key: string]: unknown;
}

/**
 * Type guard for WizardStep (SOP §10 compliance)
 *
 * Extracts inline 6-condition validation chain to explicit type guard
 * with early returns for readability.
 */
function isWizardStep(value: unknown): value is WizardStep {
    if (typeof value !== 'object' || value === null) return false;
    if (!('id' in value) || typeof value.id !== 'string') return false;
    if (!('name' in value) || typeof value.name !== 'string') return false;
    return true;
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
    existingProjectNames: string[];
    importedSettings: SettingsFile | null;
}

export class CreateProjectWebviewCommand extends BaseWebviewCommand {
    // Prerequisites are handled by PrerequisitesManager
    private prereqManager: PrerequisitesManager;
    private authManager: AuthenticationService;
    private componentHandler: ComponentHandler;
    private errorLogger: ErrorLogger;
    private debugLogger = getLogger();
    private progressUnifier: ProgressUnifier;
    private stepLogger: StepLogger | null = null;
    private stepLoggerInitPromise: Promise<StepLogger> | null = null;
    private templatesPath: string;
    private handlerRegistry: HandlerRegistry;  // Handler registry for message dispatch
    private wizardNavigateCommand: vscode.Disposable | null = null;  // Command for sidebar navigation
    private wizardSteps: WizardStep[] | null = null;  // Loaded wizard steps for sidebar
    private importedSettings: SettingsFile | null = null;  // Settings imported from file or copied from project

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
        stateManager: import('@/core/state').StateManager,
        statusBar: import('@/core/vscode/StatusBarManager').StatusBarManager,
        logger: import('@/core/logging').Logger,
    ) {
        super(context, stateManager, statusBar, logger);
        // PrerequisitesManager is initialized with proper path
        this.prereqManager = new PrerequisitesManager(context.extensionPath, logger);
        this.authManager = ServiceLocator.getAuthenticationService();
        this.componentHandler = new ComponentHandler(context);
        this.errorLogger = new ErrorLogger(context);
        this.progressUnifier = new ProgressUnifier(logger);

        // Initialize HandlerRegistry for message dispatch
        this.handlerRegistry = new HandlerRegistry();

        // Store templates path for lazy initialization
        this.templatesPath = path.join(context.extensionPath, 'templates', 'logging.json');

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
                }
            }
        } catch (error) {
            this.logger.debug('Could not load API services configuration:', error);
        }
    }

    /**
     * Lazy initialization of StepLogger with ConfigurationLoader
     * Uses promise caching to ensure only one initialization happens
     */
    private async ensureStepLogger(): Promise<StepLogger> {
        if (this.stepLogger) {
            return this.stepLogger;
        }

        // If already initializing, wait for that promise
        if (this.stepLoggerInitPromise) {
            return this.stepLoggerInitPromise;
        }

        // Start initialization
        this.stepLoggerInitPromise = (async () => {
            // Try to load wizard steps for better step names
            let wizardSteps: { id: string; name: string; [key: string]: unknown }[] | undefined;
            try {
                const stepsPath = path.join(this.context.extensionPath, 'templates', 'wizard-steps.json');
                if (fs.existsSync(stepsPath)) {
                    const stepsContent = fs.readFileSync(stepsPath, 'utf8');
                    const stepsConfig = parseJSON<{ steps: unknown[] }>(stepsContent);
                    if (stepsConfig && Array.isArray(stepsConfig.steps)) {
                        // Validate all steps have required properties using type guard
                        if (stepsConfig.steps.every(isWizardStep)) {
                            wizardSteps = stepsConfig.steps;
                        }
                    }
                }
            } catch {
                this.logger.debug('Could not load wizard steps for logging, using defaults');
            }

            const stepLogger = await StepLogger.create(this.logger, wizardSteps, this.templatesPath);
            this.stepLogger = stepLogger;
            return stepLogger;
        })();

        return this.stepLoggerInitPromise;
    }

    // Implement abstract methods from BaseWebviewCommand
    protected getWebviewId(): string {
        return 'demoBuilderWizard';
    }

    protected getWebviewTitle(): string {
        return 'Create Demo Project';
    }

    protected async getWebviewContent(): Promise<string> {
        const bundleUris = createBundleUris({
            webview: this.panel!.webview,
            extensionPath: this.context.extensionPath,
            featureBundleName: 'wizard',
        });

        const nonce = this.getNonce();

        // Get base URI for media assets
        const mediaPath = vscode.Uri.file(path.join(this.context.extensionPath, 'dist'));
        const baseUri = this.panel!.webview.asWebviewUri(mediaPath);

        return getWebviewHTMLWithBundles({
            bundleUris,
            nonce,
            cspSource: this.panel!.webview.cspSource,
            title: 'Adobe Demo Builder',
            baseUri,
        });
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
                    // Store for sidebar updates
                    this.wizardSteps = wizardSteps;
                    // Extract step IDs for logging (show first 3 + count of remaining)
                    const stepCount = wizardSteps?.length ?? 0;
                    const stepPreview = wizardSteps?.slice(0, 3).map((s) => s.id).join(', ') ?? '';
                    const remainingCount = stepCount > 3 ? ` ... (and ${stepCount - 3} more)` : '';
                    this.logger.debug(`Loaded ${stepCount} wizard steps: ${stepPreview}${remainingCount}`);
                }
            }
        } catch (error) {
            this.logger.error('Failed to load wizard steps configuration:', error as Error);
        }

        // Get existing project names for duplicate validation
        const allProjects = await this.stateManager.getAllProjects();
        const existingProjectNames = allProjects.map(p => p.name);

        return {
            theme: vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light',
            workspacePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
            componentDefaults,
            wizardSteps,
            existingProjectNames,
            importedSettings: this.importedSettings,
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
    private async createHandlerContext(): Promise<HandlerContext> {
        const stepLogger = await this.ensureStepLogger();

        return {
            // Managers
            prereqManager: this.prereqManager,
            authManager: this.authManager,
            componentHandler: this.componentHandler,
            errorLogger: this.errorLogger,
            progressUnifier: this.progressUnifier,
            stepLogger,

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
        // Handle wizard step changes (update sidebar progress)
        comm.on('wizardStepChanged', (data: unknown) => {
            const payload = data as { step: number; completedSteps?: number[] };
            if (payload?.step) {
                this.updateSidebarWizardContext(payload.step, payload.completedSteps);
            }
            return { success: true };
        });

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
                comm.onStreaming(messageType, async (data: unknown) => {
                    const onProgress = (message: string, subMessage?: string) => {
                        comm.sendMessage('api-mesh-progress', { message, subMessage }).catch(err => {
                            this.logger.warn('[API Mesh] Failed to send progress update', err);
                        });
                    };
                    const context = await this.createHandlerContext();
                    return await this.handlerRegistry.handle(context, messageType, { ...(data as object), onProgress });
                });
            } else {
                // Standard handler registration (all other handlers)
                comm.onStreaming(messageType, async (data: unknown) => {
                    const context = await this.createHandlerContext();
                    return await this.handlerRegistry.handle(context, messageType, data);
                });
            }
        }
    }

    public async execute(options?: { importedSettings?: SettingsFile; sourceDescription?: string }): Promise<void> {
        try {
            this.logger.debug('[Project Creation] Initializing wizard interface...');

            // Store imported settings for use in getInitialData
            this.importedSettings = options?.importedSettings ?? null;
            if (this.importedSettings) {
                this.logger.info(`[Project Creation] Loading wizard with imported settings from: ${options?.sourceDescription ?? 'unknown source'}`);
            }

            // Dispose Projects List if open (replace it with the wizard)
            ShowProjectsListCommand.disposeActivePanel();

            // Create or reveal panel
            await this.createOrRevealPanel();

            // Initialize communication only if not already initialized
            // (singleton pattern: panel might already exist with active communication)
            if (!this.communicationManager) {
                await this.initializeCommunication();
            }

            // Register command for sidebar navigation (if not already registered)
            if (!this.wizardNavigateCommand) {
                this.wizardNavigateCommand = vscode.commands.registerCommand(
                    'demoBuilder.internal.wizardNavigate',
                    (stepIndex: number) => this.navigateToStep(stepIndex)
                );
            }

            // Update context variables for view switching
            await vscode.commands.executeCommand('setContext', 'demoBuilder.wizardActive', true);

            // Notify sidebar that wizard is active (start at step 1)
            this.updateSidebarWizardContext(1);

            // End webview transition (wizard successfully opened)
            BaseWebviewCommand.endWebviewTransition();

        } catch (error) {
            // Ensure transition is ended even on error
            BaseWebviewCommand.endWebviewTransition();
            this.logger.error('Failed to create webview', error as Error);
            await this.showError('Failed to create webview', error as Error);
        }
    }

    // Override dispose to clean up polling intervals and sidebar context
    public dispose(): void {
        this.logger.info('[Wizard] dispose() called - cleaning up sidebar context');

        // Update context variable for view switching (fire-and-forget since dispose is synchronous)
        vscode.commands.executeCommand('setContext', 'demoBuilder.wizardActive', false);

        // Clear wizard context from sidebar
        this.clearSidebarWizardContext();

        // Dispose navigation command
        if (this.wizardNavigateCommand) {
            this.wizardNavigateCommand.dispose();
            this.wizardNavigateCommand = null;
        }

        // Navigate to projects list with sidebar closed (fire-and-forget)
        vscode.commands.executeCommand('demoBuilder.showProjectsList');

        // Call parent dispose
        super.dispose();
    }

    /**
     * Update sidebar to show wizard progress
     */
    private updateSidebarWizardContext(step: number, completedSteps?: number[]): void {
        if (ServiceLocator.isSidebarInitialized()) {
            const sidebarProvider = ServiceLocator.getSidebarProvider();
            // Filter to enabled steps and convert to sidebar format (id, label)
            const enabledSteps = this.wizardSteps?.filter(s => s.enabled !== false) || [];
            const sidebarSteps = enabledSteps.map(s => ({
                id: s.id,
                label: s.name,  // Convert 'name' to 'label' for sidebar
            }));
            sidebarProvider.updateContext({
                type: 'wizard',
                step,
                total: sidebarSteps.length,
                completedSteps,
                steps: sidebarSteps,
            });
        }
    }

    /**
     * Navigate wizard to a specific step (called from sidebar)
     */
    public navigateToStep(stepIndex: number): void {
        if (this.communicationManager) {
            this.communicationManager.sendMessage('navigateToStep', { stepIndex }).catch(err => {
                this.logger.warn('Failed to navigate wizard to step', err);
            });
        }
    }

    /**
     * Clear wizard context from sidebar (called when wizard closes)
     * Note: Fire-and-forget since dispose() is synchronous
     */
    private clearSidebarWizardContext(): void {
        if (ServiceLocator.isSidebarInitialized()) {
            const sidebarProvider = ServiceLocator.getSidebarProvider();
            // Don't await - dispose is synchronous, but message will still be sent
            sidebarProvider.clearWizardContext().catch(err => {
                this.logger.warn('Failed to clear sidebar wizard context', err);
            });
        }
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

    // Helper methods that delegate to extracted helpers
    private getSetupInstructions(selectedComponents: string[] = []): { step: string; details: string; important?: boolean }[] | undefined {
        return getSetupInstructionsHelper(this.sharedState.apiServicesConfig, selectedComponents, this.sharedState.componentsData as import('@/types/components').ComponentRegistry | undefined);
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