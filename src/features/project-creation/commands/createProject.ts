import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { WebviewCommunicationManager } from '@/core/communication/webviewCommunicationManager';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { dispatchHandler, getRegisteredTypes } from '@/core/handlers/dispatchHandler';
import { getLogger } from '@/core/logging/debugLogger';
import { ErrorLogger } from '@/core/logging/errorLogger';
import { StepLogger } from '@/core/logging/stepLogger';
import { getBundleUri } from '@/core/utils/bundleUri';
import { getWebviewHTML } from '@/core/utils/getWebviewHTMLWithBundles';
import { showOneTimeTip } from '@/core/utils/oneTimeTip';
import { ProgressUnifier } from '@/core/utils/progressUnifier/ProgressUnifier';
import { AuthenticationService } from '@/features/authentication/services/authenticationService';
// Prerequisites checking is handled by PrerequisitesManager
import { getEndpoint as getEndpointHelper } from '@/features/mesh/services/meshEndpoint';
import type { PrerequisitesManager } from '@/features/prerequisites/services/PrerequisitesManager';
import { getPrerequisitesManager } from '@/features/prerequisites/services/prerequisitesManagerInstance';
// Handler utilities and handlers
import { projectCreationHandlers } from '@/features/project-creation/handlers/ProjectCreationHandlerRegistry';
import {
    formatGroupName as formatGroupNameHelper,
} from '@/features/project-creation/helpers';
import { parseCustomBlockLibrarySettings } from '@/features/project-creation/services/customBlockLibraryUtils';
import { HandlerContext, SharedState } from '@/types/handlers';
import type { SettingsFile } from '@/types/settingsFile';
import { parseJSON } from '@/types/typeGuards';
import type { ComponentSelection } from '@/types/webview';
import type { BlockLibraryDefaultsUpdatedPayload, CustomBlockLibraryDefaultsUpdatedPayload, WizardInitialData } from '@/types/webviewPayloads';
import type { EditProjectConfig, WizardStepDefinition } from '@/types/wizard';

/**
 * Type guard for one wizard-steps.json entry (SOP §10 compliance)
 *
 * `enabled` is validated because the webview filters every step on it
 * (wizardHelpers.ts filterStepsByComponents / getFirstEnabledStep /
 * getEnabledWizardSteps) — a step without it is silently dropped there,
 * so it must fail loudly here instead.
 */
function isWizardStepDefinition(value: unknown): value is WizardStepDefinition {
    if (typeof value !== 'object' || value === null) return false;
    if (!('id' in value) || typeof value.id !== 'string') return false;
    if (!('name' in value) || typeof value.name !== 'string') return false;
    if (!('enabled' in value) || typeof value.enabled !== 'boolean') return false;
    return true;
}

/**
 * Format component defaults for logging (SOP §10 compliance)
 *
 * Extracts deep optional chaining into readable helper function.
 */
function formatComponentDefaults(defaults: ComponentSelection | null): string {
    if (!defaults) return 'no defaults loaded';
    const frontend = defaults.frontend || 'none';
    const backend = defaults.backend || 'none';
    const depCount = defaults.dependencies?.length || 0;
    return `frontend=${frontend}, backend=${backend}, ${depCount} dependencies`;
}

export class CreateProjectWebviewCommand extends BaseWebviewCommand<WizardInitialData> {
    // Debug: Instance tracking for diagnosing retry/state issues
    private static instanceCounter = 0;
    private readonly _instanceId: number;

    // Prerequisites are handled by PrerequisitesManager
    private prereqManager: PrerequisitesManager;
    private authManager: AuthenticationService;
    private errorLogger: ErrorLogger;
    private debugLogger = getLogger();
    private progressUnifier: ProgressUnifier;
    private stepLogger: StepLogger | null = null;
    private stepLoggerInitPromise: Promise<StepLogger> | null = null;
    private templatesPath: string;
    private importedSettings: SettingsFile | null = null; // Settings imported from file or copied from project
    private editProject: EditProjectConfig | null = null; // Configuration for editing existing project

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
        logger: import('@/types/logger').Logger,
    ) {
        super(context, stateManager, logger);

        // Track instance for debugging
        this._instanceId = ++CreateProjectWebviewCommand.instanceCounter;

        // PrerequisitesManager is initialized with proper path
        // The SESSION's manager, not a second one. Its cache is per-instance, so a
        // command building its own gets an empty cache and re-checks every
        // prerequisite the shared instance had already answered.
        this.prereqManager = getPrerequisitesManager(
            context.extensionPath,
            logger,
            ServiceLocator.getCommandExecutor(),
        );
        this.authManager = ServiceLocator.getAuthenticationService();
        this.errorLogger = new ErrorLogger(context);
        this.progressUnifier = new ProgressUnifier(logger);

        // Store templates path for lazy initialization
        this.templatesPath = path.join(
            context.extensionPath,
            'src',
            'core',
            'logging',
            'config',
            'logging.json',
        );

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
            const apiServicesPath = path.join(
                context.extensionPath,
                'src',
                'features',
                'project-creation',
                'config',
                'api-services.json',
            );
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
     * Read and validate wizard-steps.json — THE one load ritual, shared by
     * the step-logger init and getInitialData. It was pasted in both and the
     * copies had already drifted in their logging; the outcomes are
     * discriminated because the two callers legitimately react differently
     * (getInitialData shouts on a shape failure, the step logger quietly
     * falls back to default step names).
     */
    private readWizardStepsFile():
        | { outcome: 'ok'; steps: WizardStepDefinition[] }
        | { outcome: 'absent' }
        | { outcome: 'unparseable' }
        | { outcome: 'invalid-shape' }
        | { outcome: 'unreadable'; error: Error } {
        try {
            const stepsPath = path.join(
                this.context.extensionPath,
                'src',
                'features',
                'project-creation',
                'config',
                'wizard-steps.json',
            );
            if (!fs.existsSync(stepsPath)) {
                return { outcome: 'absent' };
            }
            const stepsConfig = parseJSON<{ steps: unknown[] }>(fs.readFileSync(stepsPath, 'utf8'));
            if (!stepsConfig || !Array.isArray(stepsConfig.steps)) {
                return { outcome: 'unparseable' };
            }
            if (!stepsConfig.steps.every(isWizardStepDefinition)) {
                return { outcome: 'invalid-shape' };
            }
            return { outcome: 'ok', steps: stepsConfig.steps };
        } catch (error) {
            return { outcome: 'unreadable', error: error as Error };
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
            // Try to load wizard steps for better step names. Tolerant on
            // purpose: any failure just means default step names.
            let wizardSteps: WizardStepDefinition[] | undefined;
            const read = this.readWizardStepsFile();
            if (read.outcome === 'ok') {
                wizardSteps = read.steps;
            } else if (read.outcome === 'unreadable') {
                this.logger.debug('Could not load wizard steps for logging, using defaults');
            }

            const stepLogger = await StepLogger.create(
                this.logger,
                wizardSteps,
                this.templatesPath,
            );
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
        // editProject is set in execute() before the panel/loading state exist,
        // so edit mode is identified from the first pixel (tab + loading header).
        return this.editProject ? 'Edit Project' : 'Create Demo Project';
    }

    protected getLoadingHeader(): { title: string; subtitle?: string } {
        return { title: this.getWebviewTitle(), subtitle: this.editProject?.projectName };
    }

    protected async getWebviewContent(): Promise<string> {
        if (!this.panel) {
            throw new Error('Panel must be created before getting webview content');
        }
        const scriptUri = getBundleUri({
            webview: this.panel.webview,
            extensionPath: this.context.extensionPath,
            featureBundleName: 'wizard',
        });

        const nonce = this.getNonce();

        // Get base URI for media assets
        const mediaPath = vscode.Uri.file(path.join(this.context.extensionPath, 'dist'));
        const baseUri = this.panel.webview.asWebviewUri(mediaPath);

        return getWebviewHTML({
            scriptUri,
            nonce,
            cspSource: this.panel.webview.cspSource,
            title: 'Adobe Demo Builder',
            baseUri,
        });
    }

    protected async getInitialData(): Promise<WizardInitialData> {
        // Load component defaults from defaults.json
        let componentDefaults: ComponentSelection | null = null;
        try {
            const defaultsPath = path.join(
                this.context.extensionPath,
                'src',
                'features',
                'project-creation',
                'config',
                'defaults.json',
            );
            if (fs.existsSync(defaultsPath)) {
                const defaultsContent = fs.readFileSync(defaultsPath, 'utf8');
                const defaults = parseJSON<{ componentSelection: ComponentSelection }>(
                    defaultsContent,
                );
                if (defaults) {
                    componentDefaults = defaults.componentSelection;
                    this.logger.debug(
                        `Loaded component defaults: ${formatComponentDefaults(componentDefaults)}`,
                    );
                }
            }
        } catch (error) {
            this.logger.debug('Could not load component defaults:', error);
        }

        // Load wizard steps configuration. This caller SHOUTS on a shape
        // failure — a config that lost `enabled` once silently dropped every
        // wizard step (the finding-3 bug) — while the step-logger caller of
        // the same read quietly falls back. The read itself is one helper.
        let wizardSteps: WizardStepDefinition[] | null = null;
        const stepsRead = this.readWizardStepsFile();
        if (stepsRead.outcome === 'ok') {
            wizardSteps = stepsRead.steps;
            // Extract step IDs for logging (show first 3 + count of remaining)
            const stepCount = wizardSteps.length;
            const stepPreview = wizardSteps
                .slice(0, 3)
                .map((s) => s.id)
                .join(', ');
            const remainingCount = stepCount > 3 ? ` ... (and ${stepCount - 3} more)` : '';
            this.logger.debug(`Loaded ${stepCount} wizard steps: ${stepPreview}${remainingCount}`);
        } else if (stepsRead.outcome === 'invalid-shape') {
            this.logger.error(
                'wizard-steps.json failed validation: every step needs a string ' +
                    'id, a string name, and a boolean enabled. Steps not sent to ' +
                    'the wizard.',
            );
        } else if (stepsRead.outcome === 'unreadable') {
            this.logger.error('Failed to load wizard steps configuration:', stepsRead.error);
        }

        // Get existing project names for duplicate validation
        const allProjects = await this.stateManager.getAllProjects();
        const existingProjectNames = allProjects.map((p) => p.name);

        // Get view mode setting
        const config = vscode.workspace.getConfiguration('demoBuilder');
        const projectsViewMode = config.get<'cards' | 'rows'>('projectsViewMode', 'cards');

        // Get block library default settings (single array setting)
        const blockLibraryDefaults = config.get<string[]>('blockLibraries.defaults', []);

        // Get custom block library defaults from settings
        const customBlockLibraryDefaults = parseCustomBlockLibrarySettings(
            config.get<string[]>('blockLibraries.custom', []),
        );

        // Debug: Log EDS config being sent to webview
        if (this.editProject?.settings?.edsConfig) {
            this.logger.debug(
                `[getInitialData] Sending edsConfig to webview: ${JSON.stringify({
                    githubOwner: this.editProject.settings.edsConfig.githubOwner,
                    repoName: this.editProject.settings.edsConfig.repoName,
                    daLiveOrg: this.editProject.settings.edsConfig.daLiveOrg,
                    daLiveSite: this.editProject.settings.edsConfig.daLiveSite,
                })}`,
            );
        } else if (this.editProject) {
            this.logger.debug('[getInitialData] editProject exists but NO edsConfig');
        }

        return {
            theme:
                vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark
                    ? 'dark'
                    : 'light',
            workspacePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
            componentDefaults,
            wizardSteps,
            existingProjectNames,
            importedSettings: this.importedSettings,
            editProject: this.editProject,
            projectsViewMode,
            blockLibraryDefaults,
            customBlockLibraryDefaults,
        };
    }

    protected getLoadingMessage(): string {
        return this.editProject
            ? 'Loading Project Editor...'
            : 'Loading Project Creation Wizard...';
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
        // Handle one-time tip to save block library defaults
        // Fires once when user first confirms block library selection in the Project Builder step.
        // Tracked via globalState. Uses shared showOneTimeTip utility.
        comm.on('offer-save-block-library-defaults', (data: unknown) => {
            const payload = data as { selectedLibraries?: string[] };
            const selectedLibraries = payload?.selectedLibraries;
            if (!selectedLibraries || selectedLibraries.length === 0) {
                return { success: true };
            }

            const config = vscode.workspace.getConfiguration('demoBuilder');

            showOneTimeTip(this.context.globalState, {
                stateKey: 'blockLibraries.defaultsTipShown',
                message:
                    'Tip: Save your block library selections as defaults for future EDS projects.',
                actions: ['Save as Defaults', 'Open Settings'],
                onAction: (selection) => {
                    if (selection === 'Save as Defaults') {
                        config.update(
                            'blockLibraries.defaults',
                            selectedLibraries,
                            vscode.ConfigurationTarget.Global,
                        );
                    } else if (selection === 'Open Settings') {
                        vscode.commands.executeCommand(
                            'workbench.action.openSettings',
                            'demoBuilder.blockLibraries',
                        );
                    }
                },
            });

            return { success: true };
        });

        // Open VS Code settings for custom block libraries
        comm.on('open-block-library-settings', () => {
            vscode.commands.executeCommand(
                'workbench.action.openSettings',
                'demoBuilder.blockLibraries.custom',
            );
            return { success: true };
        });

        // Auto-register all handlers from projectCreationHandlers object literal
        // This eliminates boilerplate by automatically discovering and registering
        // all message handlers.
        //
        // SharedState is passed by reference, so handlers can modify state directly
        // without manual synchronization. Changes to context.sharedState automatically persist.

        const messageTypes = getRegisteredTypes(projectCreationHandlers);

        for (const messageType of messageTypes) {
            comm.onStreaming(messageType, async (data: unknown) => {
                const context = await this.createHandlerContext();
                return dispatchHandler(projectCreationHandlers, context, messageType, data);
            });
        }

        // Listen for block library settings changes and propagate to webview
        const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('demoBuilder.blockLibraries.custom')) {
                const config = vscode.workspace.getConfiguration('demoBuilder');
                const updated = parseCustomBlockLibrarySettings(
                    config.get<string[]>('blockLibraries.custom', []),
                );
                this.sendMessage('customBlockLibraryDefaultsUpdated', {
                    customBlockLibraryDefaults: updated,
                } satisfies CustomBlockLibraryDefaultsUpdatedPayload);
            }
            if (e.affectsConfiguration('demoBuilder.blockLibraries.defaults')) {
                const config = vscode.workspace.getConfiguration('demoBuilder');
                const blockLibraryDefaults = config.get<string[]>('blockLibraries.defaults', []);
                this.sendMessage('blockLibraryDefaultsUpdated', { blockLibraryDefaults } satisfies BlockLibraryDefaultsUpdatedPayload);
            }
        });
        this.disposables.add(configListener);
    }

    /**
     * Dispose the active wizard panel if one exists.
     * Used to reset the wizard when switching modes (e.g., Create while Edit is open).
     */
    public static disposeActivePanel(): void {
        const panel = BaseWebviewCommand.getActivePanel('demoBuilderWizard');
        if (panel) {
            try {
                panel.dispose();
            } catch {
                // Panel may already be disposed
            }
        }
    }

    public async execute(options?: {
        importedSettings?: SettingsFile;
        sourceDescription?: string;
        editProject?: EditProjectConfig;
    }): Promise<void> {
        try {
            // Store imported settings for use in getInitialData
            this.importedSettings = options?.importedSettings ?? null;
            if (this.importedSettings) {
                this.logger.debug(
                    `[Project Creation] Loading wizard with imported settings from: ${options?.sourceDescription ?? 'unknown source'}`,
                );
            }

            // Store edit project config for use in getInitialData
            this.editProject = options?.editProject ?? null;
            if (this.editProject) {
                this.logger.debug(
                    `[Project Creation] Loading wizard in edit mode for project: ${this.editProject.projectName}`,
                );

                // Populate sharedState with existing component selection for prerequisites check
                // This ensures Node version requirements are known based on project's components
                if (this.editProject.settings?.selections) {
                    const selections = this.editProject.settings.selections;
                    this.sharedState.currentComponentSelection = {
                        frontend: selections.frontend,
                        backend: selections.backend,
                        dependencies: selections.dependencies ?? [],
                        integrations: selections.integrations ?? [],
                    };
                    this.logger.debug(
                        `[Project Creation] Loaded component selection for edit mode: frontend=${selections.frontend}, backend=${selections.backend}`,
                    );
                }
            }

            // Dispose Projects List if open (replace it with the wizard)
            BaseWebviewCommand.disposePanel('demoBuilder.projectsList');

            // Create or reveal panel
            await this.createOrRevealPanel();

            // Singleton reuse: a revealed pre-existing panel keeps its old tab
            // title — refresh it so create↔edit transitions retitle the tab.
            if (this.panel) {
                this.panel.title = this.getWebviewTitle();
            }

            // Initialize communication only if not already initialized
            // (singleton pattern: panel might already exist with active communication)
            if (!this.communicationManager) {
                await this.initializeCommunication();
            }

            // Update context variables for view switching
            await vscode.commands.executeCommand('setContext', 'demoBuilder.wizardActive', true);

            // End webview transition (wizard successfully opened)
            BaseWebviewCommand.endWebviewTransition();
        } catch (error) {
            // Ensure transition is ended even on error
            BaseWebviewCommand.endWebviewTransition();
            this.logger.error('Failed to create webview', error as Error);
            await this.showError('Failed to create webview', error as Error);
        }
    }

    // Override dispose to clean up polling intervals and wizard context
    public dispose(): void {
        // Update context variable for view switching (fire-and-forget since dispose is synchronous)
        vscode.commands.executeCommand('setContext', 'demoBuilder.wizardActive', false);

        // Navigate to projects list (fire-and-forget)
        // Skip during webview transitions (e.g., wizard being re-created for a different mode)
        if (!BaseWebviewCommand.isWebviewTransitionInProgress()) {
            vscode.commands.executeCommand('demoBuilder.showProjectsList');
        }

        // Call parent dispose
        super.dispose();
    }

    /**
     * Get mesh endpoint - single source of truth approach:
     * 1. Use cached endpoint if available (instant)
     * 2. Call aio api-mesh:describe (official Adobe method, ~3s)
     * 3. Construct from meshId as reliable fallback
     */
    private async _getEndpoint(meshId: string, cachedEndpoint?: string): Promise<string> {
        const commandManager = ServiceLocator.getCommandExecutor();
        return getEndpointHelper(
            meshId,
            cachedEndpoint,
            commandManager,
            this.logger,
            this.debugLogger,
        );
    }

    // Validation

    // Project creation with timeout and cancellation support

    // Actual project creation logic (extracted for testability)

    /**
     * Format group name for display
     */
    private _formatGroupName(group: string): string {
        return formatGroupNameHelper(group);
    }

    // No _deployMeshComponent wrapper any more: zero callers — the creation
    // flow deploys through meshSetupService onto the shared
    // deployMeshComponent spine. Found by the 2026-08-22 mesh call-path audit.
}
