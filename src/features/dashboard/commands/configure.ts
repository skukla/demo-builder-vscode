import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { ProjectDashboardWebviewCommand } from './showDashboard';
import { BaseWebviewCommand } from '@/core/base';
import { WebviewCommunicationManager } from '@/core/communication';
import { ServiceLocator } from '@/core/di';
import { createBundleUris } from '@/core/utils/bundleUri';
import { parseEnvFile } from '@/core/utils/envParser';
import { getWebviewHTMLWithBundles } from '@/core/utils/getWebviewHTMLWithBundles';
import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import { detectMeshChanges } from '@/features/mesh/services/stalenessDetector';
import { detectStorefrontChanges, isEdsProject, republishStorefrontConfig } from '@/features/eds';
import { handleRenameProject } from '@/features/projects-dashboard/handlers/dashboardHandlers';
import { Project } from '@/types';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, SharedState } from '@/types/handlers';
import { parseJSON, getComponentInstanceEntries } from '@/types/typeGuards';
import { normalizeIfUrl } from '@/core/validation/Validator';

// Component configuration type (key-value pairs for environment variables)
type ComponentConfigs = Record<string, Record<string, string>>;

// Initial data structure sent to webview
interface ConfigureInitialData {
    theme: 'dark' | 'light';
    project: Project;
    componentsData: {
        frontends?: unknown[];
        backends?: unknown[];
        dependencies?: unknown[];
        integrations?: unknown[];
        appBuilder?: unknown[];
        envVars: Record<string, unknown>;
    };
    existingEnvValues: Record<string, Record<string, string>>;
    existingProjectNames: string[];
}

export class ConfigureProjectWebviewCommand extends BaseWebviewCommand {
    /**
     * Static method to dispose any active Configure panel
     * Useful for cleanup during navigation
     */
    public static disposeActivePanel(): void {
        const panel = BaseWebviewCommand.getActivePanel('demoBuilder.configureProject');
        if (panel) {
            try {
                panel.dispose();
            } catch {
                // Panel may already be disposed - this is OK
            }
        }
    }

    protected getWebviewId(): string {
        return 'demoBuilder.configureProject';
    }

    protected getWebviewTitle(): string {
        return 'Configure Project';
    }

    protected getLoadingMessage(): string {
        return 'Loading project configuration...';
    }

    public async execute(): Promise<void> {
        try {
            // Get current project
            const project = await this.stateManager.getCurrentProject();
            if (!project) {
                await this.showWarning('No project found to configure.');
                return;
            }

            // Create or reveal the webview panel
            await this.createOrRevealPanel();

            // Initialize communication if needed
            if (!this.communicationManager) {
                await this.initializeCommunication();
            }

            this.logger.debug(`[Configure] Opened configuration for project: ${project.name}`);
        } catch (error) {
            await this.showError('Failed to open configuration', error as Error);
        }
    }

    protected async getWebviewContent(): Promise<string> {
        const bundleUris = createBundleUris({
            webview: this.panel!.webview,
            extensionPath: this.context.extensionPath,
            featureBundleName: 'configure',
        });

        const nonce = this.getNonce();

        // Get base URI for media assets
        const mediaPath = vscode.Uri.file(path.join(this.context.extensionPath, 'dist'));
        const baseUri = this.panel!.webview.asWebviewUri(mediaPath);

        return getWebviewHTMLWithBundles({
            bundleUris,
            nonce,
            cspSource: this.panel!.webview.cspSource,
            title: 'Configure Project',
            baseUri,
        });
    }

    protected async getInitialData(): Promise<ConfigureInitialData> {
        const project = await this.stateManager.getCurrentProject();
        if (!project) {
            throw new Error('No project found');
        }

        // Load and transform components data using ComponentRegistryManager
        const registryManager = new ComponentRegistryManager(this.context.extensionPath);
        const registry = await registryManager.loadRegistry();

        // Send both the categorized components structure AND the top-level envVars
        const componentsData = {
            frontends: registry.components.frontends,
            backends: registry.components.backends,
            dependencies: registry.components.dependencies,
            integrations: registry.components.integrations,
            appBuilder: registry.components.appBuilder,
            envVars: registry.envVars || {},
        };

        // Load existing env values from component .env files
        const existingEnvValues = await this.loadExistingEnvValues(project);

        // Get existing project names for rename validation
        const allProjects = await this.stateManager.getAllProjects();
        const existingProjectNames = allProjects.map(p => p.name);

        // Get current theme
        const theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';

        return {
            theme,
            project,
            componentsData,
            existingEnvValues,
            existingProjectNames,
        };
    }

    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        // Handle save configuration
        comm.onStreaming('save-configuration', async (data: { componentConfigs: ComponentConfigs; newProjectName?: string }) => {
            try {
                let project = await this.stateManager.getCurrentProject();
                if (!project) {
                    throw new Error('No project found');
                }

                // Handle project rename if name changed
                if (data.newProjectName && data.newProjectName !== project.name) {
                    const renameResult = await handleRenameProject(this.createHandlerContext(), {
                        projectPath: project.path,
                        newName: data.newProjectName,
                    });

                    if (!renameResult.success) {
                        throw new Error(renameResult.error || 'Failed to rename project');
                    }

                    // Reload project after rename (path may have changed)
                    project = await this.stateManager.getCurrentProject();
                    if (!project) {
                        throw new Error('Project not found after rename');
                    }
                }

                // Detect if mesh configuration changed BEFORE saving
                const meshChanges = await detectMeshChanges(project, data.componentConfigs);

                // Detect if storefront configuration changed (EDS projects only)
                const storefrontChanges = detectStorefrontChanges(project, data.componentConfigs);

                // Update project state
                project.componentConfigs = data.componentConfigs;
                // Persist mesh staleness for card grid (only mark stale; don't overwrite with deployed)
                if (meshChanges.hasChanges) {
                    project.meshStatusSummary = 'stale';
                }
                // Persist storefront staleness for EDS projects
                if (storefrontChanges.hasChanges) {
                    project.edsStorefrontStatusSummary = 'stale';
                }
                await this.stateManager.saveProject(project);

                // Register programmatic writes BEFORE writing files
                // This prevents file watcher from showing duplicate notifications
                await this.registerProgrammaticWrites(project, data.componentConfigs);

                // Regenerate .env files
                await this.regenerateEnvFiles(project, data.componentConfigs);

                // Return success immediately so UI can reset (don't block on notifications)
                const result = { success: true };
                
                // Show success notification after returning (non-blocking)
                setImmediate(async () => {
                    // Refresh Dashboard status (if open) to show amber indicators
                    await ProjectDashboardWebviewCommand.refreshStatus();

                    // Smart notification based on what changed
                    // Only show generic success if no contextual notification is shown
                    let contextualNotificationShown = false;

                    // Check if this is an EDS project for combined notifications
                    const isEds = isEdsProject(project);

                    // Scenario: Both mesh AND storefront changed (EDS projects with mesh)
                    if (meshChanges.hasChanges && storefrontChanges.hasChanges && isEds) {
                        const shouldShowMesh = await vscode.commands.executeCommand('demoBuilder._internal.shouldShowMeshNotification');
                        const shouldShowStorefront = await vscode.commands.executeCommand('demoBuilder._internal.shouldShowStorefrontNotification');

                        if (shouldShowMesh || shouldShowStorefront) {
                            contextualNotificationShown = true;
                            await vscode.commands.executeCommand('demoBuilder._internal.markMeshNotificationShown');
                            await vscode.commands.executeCommand('demoBuilder._internal.markStorefrontNotificationShown');

                            vscode.window.showWarningMessage(
                                'Configuration saved. Apply changes to mesh and storefront?',
                                'Apply Changes',
                                'Later',
                            ).then(async selection => {
                                if (selection === 'Apply Changes') {
                                    // Use ensureAuthAndApply to handle inline sign-in if needed
                                    await this.ensureAuthAndApply(
                                        async () => {
                                            await this.withDeploymentStatus(async () => {
                                                // Deploy mesh first, then republish storefront
                                                await vscode.commands.executeCommand('demoBuilder.deployMesh');
                                                // Reload project after mesh deployment to get updated meshState
                                                const freshProject = await this.stateManager.getCurrentProject();
                                                if (freshProject) {
                                                    await this.republishStorefront(freshProject);
                                                }
                                            });
                                        },
                                        'apply changes to mesh and storefront',
                                    );
                                } else if (selection === 'Later') {
                                    // Track that user declined both updates
                                    if (project.meshState) {
                                        project.meshState.userDeclinedUpdate = true;
                                        project.meshState.declinedAt = new Date().toISOString();
                                    }
                                    if (project.edsStorefrontState) {
                                        project.edsStorefrontState.userDeclinedUpdate = true;
                                        project.edsStorefrontState.declinedAt = new Date().toISOString();
                                        project.edsStorefrontStatusSummary = 'update-declined';
                                    }
                                    await this.stateManager.saveProject(project);
                                    await ProjectDashboardWebviewCommand.refreshStatus();
                                }
                            });
                        } else {
                            this.logger.debug('[Configure] Combined notification already shown this session, suppressing');
                        }
                    }
                    // Scenario: Only storefront changed (EDS projects without mesh changes)
                    else if (storefrontChanges.hasChanges && isEds) {
                        const shouldShow = await vscode.commands.executeCommand('demoBuilder._internal.shouldShowStorefrontNotification');
                        if (shouldShow) {
                            contextualNotificationShown = true;
                            await vscode.commands.executeCommand('demoBuilder._internal.markStorefrontNotificationShown');

                            vscode.window.showInformationMessage(
                                'Configuration saved. Republish storefront to apply changes.',
                                'Republish',
                                'Later',
                            ).then(async selection => {
                                if (selection === 'Republish') {
                                    await this.withDeploymentStatus(() => this.republishStorefront(project));
                                } else if (selection === 'Later') {
                                    // Track that user declined the update
                                    if (project.edsStorefrontState) {
                                        project.edsStorefrontState.userDeclinedUpdate = true;
                                        project.edsStorefrontState.declinedAt = new Date().toISOString();
                                    }
                                    project.edsStorefrontStatusSummary = 'update-declined';
                                    await this.stateManager.saveProject(project);
                                    await ProjectDashboardWebviewCommand.refreshStatus();
                                }
                            });
                        } else {
                            this.logger.debug('[Configure] Storefront notification already shown this session, suppressing');
                        }
                    }
                    // Scenario: Mesh changed (with or without demo running)
                    else if (meshChanges.hasChanges && project.status === 'running') {
                        // Check if mesh notification already shown this session
                        const shouldShow = await vscode.commands.executeCommand('demoBuilder._internal.shouldShowMeshNotification');
                        if (shouldShow) {
                            contextualNotificationShown = true;
                            await vscode.commands.executeCommand('demoBuilder._internal.markMeshNotificationShown');
                            vscode.window.showWarningMessage(
                                'Configuration saved. Redeploy mesh and restart demo to apply changes.',
                                'Redeploy Mesh',
                                'Later',
                            ).then(async selection => {
                                if (selection === 'Redeploy Mesh') {
                                    // Use ensureAuthAndApply to handle inline sign-in if needed
                                    await this.ensureAuthAndApply(
                                        () => this.withDeploymentStatus(() => vscode.commands.executeCommand('demoBuilder.deployMesh')),
                                        'redeploy mesh',
                                    );
                                } else if (selection === 'Later') {
                                    // Track that user declined the update
                                    if (project.meshState) {
                                        project.meshState.userDeclinedUpdate = true;
                                        project.meshState.declinedAt = new Date().toISOString();
                                        await this.stateManager.saveProject(project);
                                        // Refresh dashboard to show declined state
                                        await ProjectDashboardWebviewCommand.refreshStatus();
                                    }
                                }
                            });
                        } else {
                            this.logger.debug('[Configure] Mesh notification already shown this session, suppressing');
                        }
                    } else if (meshChanges.hasChanges) {
                        // Mesh changed, demo not running
                        const shouldShow = await vscode.commands.executeCommand('demoBuilder._internal.shouldShowMeshNotification');
                        if (shouldShow) {
                            contextualNotificationShown = true;
                            await vscode.commands.executeCommand('demoBuilder._internal.markMeshNotificationShown');
                            vscode.window.showInformationMessage(
                                'Configuration saved. Redeploy mesh to apply changes.',
                                'Redeploy Mesh',
                                'Later',
                            ).then(async selection => {
                                if (selection === 'Redeploy Mesh') {
                                    // Use ensureAuthAndApply to handle inline sign-in if needed
                                    await this.ensureAuthAndApply(
                                        () => this.withDeploymentStatus(() => vscode.commands.executeCommand('demoBuilder.deployMesh')),
                                        'redeploy mesh',
                                    );
                                } else if (selection === 'Later') {
                                    // Track that user declined the update
                                    if (project.meshState) {
                                        project.meshState.userDeclinedUpdate = true;
                                        project.meshState.declinedAt = new Date().toISOString();
                                        await this.stateManager.saveProject(project);
                                        // Refresh dashboard to show declined state
                                        await ProjectDashboardWebviewCommand.refreshStatus();
                                    }
                                }
                            });
                        } else {
                            this.logger.debug('[Configure] Mesh notification already shown this session, suppressing');
                        }
                    } else if (project.status === 'running') {
                        // Only non-mesh configs changed, demo is running
                        const shouldShow = await vscode.commands.executeCommand('demoBuilder._internal.shouldShowRestartNotification');
                        if (shouldShow) {
                            contextualNotificationShown = true;
                            await vscode.commands.executeCommand('demoBuilder._internal.markRestartNotificationShown');
                            vscode.window.showInformationMessage(
                                'Configuration saved. Restart the demo to apply changes.',
                                'Restart Demo',
                            ).then(async selection => {
                                if (selection === 'Restart Demo') {
                                    try {
                                        await vscode.commands.executeCommand('demoBuilder.stopDemo');
                                        await vscode.commands.executeCommand('demoBuilder.startDemo');
                                    } catch (error) {
                                        // Commands handle their own error display
                                        this.logger.error('[Configure] Failed to restart demo:', error as Error);
                                    }
                                }
                            });
                        } else {
                            this.logger.debug('[Configure] Restart notification already shown this session, suppressing');
                        }
                    }

                    // Show generic success only if no contextual notification was shown
                    if (!contextualNotificationShown) {
                        this.showSuccessMessage('Configuration saved successfully');
                    }
                });

                return result;
            } catch (error) {
                this.logger.error('[Configure] Failed to save configuration:', error as Error);
                await vscode.window.showErrorMessage(`Failed to save configuration: ${(error as Error).message}`);
                return { success: false, error: (error as Error).message, code: ErrorCode.CONFIG_INVALID };
            }
        });

        // Handle cancel
        comm.onStreaming('cancel', async () => {
            this.panel?.dispose();
            return { success: true };
        });

        // Handle get components data
        comm.onStreaming('get-components-data', async () => {
            const componentsPath = path.join(this.context.extensionPath, 'src', 'features', 'components', 'config', 'components.json');
            const componentsContent = await fs.readFile(componentsPath, 'utf-8');
            const componentsData = parseJSON<Record<string, unknown>>(componentsContent);
            if (!componentsData) {
                throw new Error('Failed to parse components.json');
            }
            return componentsData;
        });

        // Handle open external URL (for help links)
        comm.onStreaming('openExternal', async (data: { url: string }) => {
            if (data.url) {
                await vscode.env.openExternal(vscode.Uri.parse(data.url));
            }
            return { success: true };
        });

        // Handle open EDS extension settings
        comm.onStreaming('open-eds-settings', async () => {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'demoBuilder.daLive');
            return { success: true };
        });
    }

    /**
     * Load existing environment variable values from component .env files
     * and project root .env (for values from non-installed components like backends)
     */
    private async loadExistingEnvValues(project: Project): Promise<Record<string, Record<string, string>>> {
        const envValues: Record<string, Record<string, string>> = {};

        // Read each component's .env file
        // SOP §4: Using helper instead of inline Object.entries
        for (const [componentId, instance] of getComponentInstanceEntries(project)) {
            if (!instance.path) {
                continue;
            }

            // Next.js uses .env.local, others use .env
            const possibleEnvFiles = [
                path.join(instance.path, '.env.local'),
                path.join(instance.path, '.env'),
            ];

            let loaded = false;
            for (const envPath of possibleEnvFiles) {
                try {
                    const envContent = await fs.readFile(envPath, 'utf-8');
                    envValues[componentId] = parseEnvFile(envContent);
                    loaded = true;
                    break;  // Found it, stop looking
                } catch {
                    // File doesn't exist, try next one
                }
            }

            if (!loaded) {
                envValues[componentId] = {};
            }
        }

        // Also read project root .env for values from non-installed components
        // (e.g., backend configs like adobe-commerce-accs that don't have componentInstances)
        // These values are merged into project.componentConfigs which the UI also checks
        try {
            const rootEnvPath = path.join(project.path, '.env');
            const rootEnvContent = await fs.readFile(rootEnvPath, 'utf-8');
            const rootEnvValues = parseEnvFile(rootEnvContent);

            // Merge root .env values into any componentConfigs that exist in project state
            // but don't have componentInstances (non-installed components like backends)
            if (project.componentConfigs) {
                for (const [componentId, config] of Object.entries(project.componentConfigs)) {
                    // Skip components that already have loaded env values
                    if (envValues[componentId] && Object.keys(envValues[componentId]).length > 0) {
                        continue;
                    }

                    // For components without instances, use their config keys to extract
                    // corresponding values from root .env
                    const componentEnv: Record<string, string> = {};
                    for (const key of Object.keys(config)) {
                        if (rootEnvValues[key] !== undefined) {
                            componentEnv[key] = rootEnvValues[key];
                        }
                    }

                    if (Object.keys(componentEnv).length > 0) {
                        envValues[componentId] = componentEnv;
                    }
                }
            }
        } catch {
            // Root .env doesn't exist or can't be read - that's fine
        }

        return envValues;
    }


    /**
     * Register programmatic writes to suppress file watcher notifications
     */
    private async registerProgrammaticWrites(project: Project, componentConfigs: ComponentConfigs): Promise<void> {
        const filePaths: string[] = [];
        
        // Project root .env
        filePaths.push(path.join(project.path, '.env'));

        // Component .env files
        // SOP §4: Using helper instead of inline Object.entries
        for (const [componentId, instance] of getComponentInstanceEntries(project)) {
            if (instance.path && componentConfigs[componentId]) {
                const envFileName = componentId.includes('nextjs') ? '.env.local' : '.env';
                filePaths.push(path.join(instance.path, envFileName));
            }
        }
        
        // Register all paths with file watcher (silent - internal coordination)
        await vscode.commands.executeCommand('demoBuilder._internal.registerProgrammaticWrites', filePaths);
    }

    /**
     * Regenerate .env files for project and components.
     * Merges ALL values from ALL componentConfigs for cross-boundary sharing.
     */
    private async regenerateEnvFiles(project: Project, componentConfigs: ComponentConfigs): Promise<void> {
        // Merge all values once (cross-boundary: backend values go to frontend .env files)
        // Normalize URL values (remove trailing slashes) for consistent handling
        const allValues: Record<string, string> = {};
        for (const config of Object.values(componentConfigs)) {
            for (const [key, value] of Object.entries(config)) {
                if (value !== undefined && value !== null && value !== '') {
                    allValues[key] = normalizeIfUrl(String(value));
                }
            }
        }

        // Write root .env
        const rootHeader = `# Demo Builder Project Configuration\n# Generated: ${new Date().toISOString()}\n\nPROJECT_NAME=${project.name}\n`;
        await fs.writeFile(path.join(project.path, '.env'), rootHeader + this.formatEnvValues(allValues), 'utf-8');

        // Write component .env files
        for (const [componentId, instance] of getComponentInstanceEntries(project)) {
            if (instance.path) {
                const fileName = componentId.includes('nextjs') ? '.env.local' : '.env';
                const header = `# ${componentId} - Environment Configuration\n# Generated by Demo Builder\n# Generated: ${new Date().toISOString()}\n`;
                await fs.writeFile(path.join(instance.path, fileName), header + this.formatEnvValues(allValues), 'utf-8');
            }
        }

        this.logger.debug(`[Configure] Wrote ${Object.keys(allValues).length} env vars to ${Object.keys(project.componentInstances || {}).length + 1} files`);
    }

    private formatEnvValues(values: Record<string, string>): string {
        return Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n');
    }

    /**
     * Run an operation while notifying the frontend that deployment is in progress.
     * This keeps the Save button disabled during the operation.
     */
    private async withDeploymentStatus<T>(operation: () => Promise<T>): Promise<T> {
        await this.communicationManager?.sendMessage('deployment-status', { isDeploying: true });
        try {
            return await operation();
        } finally {
            await this.communicationManager?.sendMessage('deployment-status', { isDeploying: false });
        }
    }

    /**
     * Republish storefront config.json for EDS projects.
     * Shows progress notification and handles errors.
     */
    private async republishStorefront(project: Project): Promise<void> {
        try {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Republishing storefront:',
                    cancellable: false,
                },
                async (progress) => {
                    const result = await republishStorefrontConfig({
                        project,
                        secrets: this.context.secrets,
                        logger: this.logger,
                        onProgress: (message) => {
                            progress.report({ message });
                        },
                    });

                    if (result.success) {
                        // Save updated project state
                        await this.stateManager.saveProject(project);
                        await ProjectDashboardWebviewCommand.refreshStatus();
                        this.showSuccessMessage('Storefront configuration republished successfully');
                    } else {
                        vscode.window.showErrorMessage(`Failed to republish storefront: ${result.error}`);
                    }
                },
            );
        } catch (error) {
            this.logger.error('[Configure] Failed to republish storefront:', error as Error);
            vscode.window.showErrorMessage(`Failed to republish storefront: ${(error as Error).message}`);
        }
    }

    /**
     * Create handler context for message handlers
     */
    private createHandlerContext(): HandlerContext {
        return {
            // Managers (Configure doesn't use all managers, but context requires them)
            prereqManager: undefined as unknown as HandlerContext['prereqManager'],
            authManager: undefined as unknown as HandlerContext['authManager'],
            errorLogger: undefined as unknown as HandlerContext['errorLogger'],
            progressUnifier: undefined as unknown as HandlerContext['progressUnifier'],
            stepLogger: undefined as unknown as HandlerContext['stepLogger'],

            // Loggers
            logger: this.logger,
            debugLogger: this.logger,

            // VS Code integration
            context: this.context,
            panel: this.panel,
            stateManager: this.stateManager,
            communicationManager: this.communicationManager,
            sendMessage: (type: string, data?: unknown) => this.sendMessage(type, data),

            // Shared state (Configure doesn't use shared state)
            sharedState: {
                isAuthenticating: false,
            } as SharedState,
        };
    }

    /**
     * Ensure Adobe authentication before applying changes.
     * If not authenticated, prompts the user to sign in inline and restores project context.
     * After successful sign-in, continues with the provided operation.
     *
     * @param operation - The async operation to run after auth is confirmed
     * @param operationDescription - Description for the notification (e.g., "deploy mesh")
     * @returns true if operation completed, false if cancelled or auth failed
     */
    private async ensureAuthAndApply(
        operation: () => Promise<void>,
        operationDescription: string,
    ): Promise<boolean> {
        const authManager = ServiceLocator.getAuthenticationService();
        let isAuthenticated = await authManager.isAuthenticated();

        if (!isAuthenticated) {
            // Prompt for inline sign-in
            const selection = await vscode.window.showWarningMessage(
                `Adobe sign-in required to ${operationDescription}.`,
                'Sign In',
                'Cancel',
            );

            if (selection !== 'Sign In') {
                return false;
            }

            // Get project context for restoration after login
            const project = await this.stateManager.getCurrentProject();

            // Perform inline login and restore project context
            this.logger.info(`[Configure] Starting Adobe sign-in to ${operationDescription}`);
            const loginSuccess = await authManager.loginAndRestoreProjectContext({
                organization: project?.adobe?.organization,
                projectId: project?.adobe?.projectId,
                workspace: project?.adobe?.workspace,
            });

            if (!loginSuccess) {
                vscode.window.showErrorMessage('Sign-in failed or was cancelled. Please try again.');
                return false;
            }

            // Verify auth after login
            isAuthenticated = await authManager.isAuthenticated();
            if (!isAuthenticated) {
                vscode.window.showErrorMessage('Sign-in completed but authentication check failed. Please try again.');
                return false;
            }

            this.logger.info('[Configure] Adobe sign-in successful, continuing with operation');
        }

        // Auth confirmed, run the operation
        try {
            await operation();
            return true;
        } catch (error) {
            this.logger.error(`[Configure] Failed to ${operationDescription}:`, error as Error);
            return false;
        }
    }
}


