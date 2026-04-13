import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { ProjectDashboardWebviewCommand } from './showDashboard';
import { BaseWebviewCommand } from '@/core/base';
import { WebviewCommunicationManager } from '@/core/communication';
import { ServiceLocator } from '@/core/di';
import { getBundleUri } from '@/core/utils/bundleUri';
import { parseEnvFile } from '@/core/utils/envParser';
import { getWebviewHTML } from '@/core/utils/getWebviewHTMLWithBundles';
import { normalizeIfUrl } from '@/core/validation/Validator';
import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import { detectStorefrontChanges, isEdsProject, republishStorefrontConfig } from '@/features/eds';
import { configureHandlers } from '../handlers/configureHandlers';
import { dispatchHandler, getRegisteredTypes } from '@/core/handlers';
import { detectMeshChanges } from '@/features/mesh/services/stalenessDetector';
import { handleRenameProject } from '@/features/projects-dashboard/handlers/dashboardHandlers';
import { Project } from '@/types';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, SharedState } from '@/types/handlers';
import { getComponentInstanceEntries } from '@/types/typeGuards';

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
        mesh?: unknown[];
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
        if (!this.panel) {
            throw new Error('Panel must be created before getting webview content');
        }
        const scriptUri = getBundleUri({
            webview: this.panel.webview,
            extensionPath: this.context.extensionPath,
            featureBundleName: 'configure',
        });

        const nonce = this.getNonce();

        // Get base URI for media assets
        const mediaPath = vscode.Uri.file(path.join(this.context.extensionPath, 'dist'));
        const baseUri = this.panel.webview.asWebviewUri(mediaPath);

        return getWebviewHTML({
            scriptUri,
            nonce,
            cspSource: this.panel.webview.cspSource,
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
            mesh: registry.components.mesh,
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
        // Register standard handlers from handler map (cancel, get-components-data,
        // openExternal, open-eds-settings, discover-store-structure)
        const messageTypes = getRegisteredTypes(configureHandlers);
        for (const messageType of messageTypes) {
            comm.onStreaming(messageType, async (data: unknown) => {
                const context = this.createHandlerContext();
                return dispatchHandler(configureHandlers, context, messageType, data);
            });
        }

        // save-configuration stays inline — depends on private notification/deployment
        // methods that need `this` binding (same mixed pattern as Wizard)
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
                if (meshChanges.hasChanges) {
                    project.meshStatusSummary = 'stale';
                }
                if (storefrontChanges.hasChanges) {
                    project.edsStorefrontStatusSummary = 'stale';
                }
                await this.stateManager.saveProject(project);

                // Register programmatic writes BEFORE writing files
                await this.registerProgrammaticWrites(project, data.componentConfigs);

                // Regenerate .env files
                await this.regenerateEnvFiles(project, data.componentConfigs);

                // Return success immediately so UI can reset (don't block on notifications)
                const result = { success: true };

                // Show success notification after returning (non-blocking)
                setImmediate(() => {
                    this.showPostSaveNotifications(project, meshChanges, storefrontChanges);
                });

                return result;
            } catch (error) {
                this.logger.error('[Configure] Failed to save configuration:', error as Error);
                await vscode.window.showErrorMessage(`Failed to save configuration: ${(error as Error).message}`);
                return { success: false, error: (error as Error).message, code: ErrorCode.CONFIG_INVALID };
            }
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
        return Object.entries(values)
            .filter(([k]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) // skip invalid keys
            .map(([k, v]) => {
                // Quote values containing newlines, spaces, or special characters
                const needsQuoting = /[\n\r\s"'\\#]/.test(v);
                const safeValue = needsQuoting
                    ? `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`
                    : v;
                return `${k}=${safeValue}`;
            })
            .join('\n');
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
                    title: 'Republishing storefront',
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
     * Show post-save notifications based on what changed.
     * Determines the right notification scenario and delegates to specific handlers.
     */
    private async showPostSaveNotifications(
        project: Project,
        meshChanges: { hasChanges: boolean },
        storefrontChanges: { hasChanges: boolean },
    ): Promise<void> {
        await ProjectDashboardWebviewCommand.refreshStatus();

        let contextualNotificationShown = false;
        const isEds = isEdsProject(project);

        if (meshChanges.hasChanges && storefrontChanges.hasChanges && isEds) {
            contextualNotificationShown = await this.handleCombinedMeshStorefrontNotification(project);
        } else if (storefrontChanges.hasChanges && isEds) {
            contextualNotificationShown = await this.handleStorefrontOnlyNotification(project);
        } else if (meshChanges.hasChanges) {
            contextualNotificationShown = await this.handleMeshOnlyNotification(project);
        } else if (project.status === 'running') {
            contextualNotificationShown = await this.handleRestartNotification();
        }

        if (!contextualNotificationShown) {
            this.showSuccessMessage('Configuration saved successfully');
        }
    }

    /** Handle notification when both mesh and storefront changed */
    private async handleCombinedMeshStorefrontNotification(project: Project): Promise<boolean> {
        const shouldShowMesh = await vscode.commands.executeCommand('demoBuilder._internal.shouldShowMeshNotification');
        const shouldShowStorefront = await vscode.commands.executeCommand('demoBuilder._internal.shouldShowStorefrontNotification');

        if (!shouldShowMesh && !shouldShowStorefront) {
            this.logger.debug('[Configure] Combined notification already shown this session, suppressing');
            return false;
        }

        await vscode.commands.executeCommand('demoBuilder._internal.markMeshNotificationShown');
        await vscode.commands.executeCommand('demoBuilder._internal.markStorefrontNotificationShown');

        const selection = await vscode.window.showWarningMessage(
            'Configuration saved. Apply changes to mesh and storefront?',
            'Apply Changes',
            'Later',
        );

        if (selection === 'Apply Changes') {
            await this.ensureAuthAndApply(
                () => this.withDeploymentStatus(async () => {
                    await vscode.commands.executeCommand('demoBuilder.deployMesh');
                    const freshProject = await this.stateManager.getCurrentProject();
                    if (freshProject) {
                        await this.republishStorefront(freshProject);
                    }
                }),
                'apply changes to mesh and storefront',
            );
        } else if (selection === 'Later') {
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

        return true;
    }

    /** Handle notification when only storefront changed */
    private async handleStorefrontOnlyNotification(project: Project): Promise<boolean> {
        const shouldShow = await vscode.commands.executeCommand('demoBuilder._internal.shouldShowStorefrontNotification');
        if (!shouldShow) {
            this.logger.debug('[Configure] Storefront notification already shown this session, suppressing');
            return false;
        }

        await vscode.commands.executeCommand('demoBuilder._internal.markStorefrontNotificationShown');

        const selection = await vscode.window.showInformationMessage(
            'Configuration saved. Republish storefront to apply changes.',
            'Republish',
            'Later',
        );

        if (selection === 'Republish') {
            await this.withDeploymentStatus(() => this.republishStorefront(project));
        } else if (selection === 'Later') {
            if (project.edsStorefrontState) {
                project.edsStorefrontState.userDeclinedUpdate = true;
                project.edsStorefrontState.declinedAt = new Date().toISOString();
            }
            project.edsStorefrontStatusSummary = 'update-declined';
            await this.stateManager.saveProject(project);
            await ProjectDashboardWebviewCommand.refreshStatus();
        }

        return true;
    }

    /** Handle notification when mesh changed (with or without running demo) */
    private async handleMeshOnlyNotification(project: Project): Promise<boolean> {
        const shouldShow = await vscode.commands.executeCommand('demoBuilder._internal.shouldShowMeshNotification');
        if (!shouldShow) {
            this.logger.debug('[Configure] Mesh notification already shown this session, suppressing');
            return false;
        }

        await vscode.commands.executeCommand('demoBuilder._internal.markMeshNotificationShown');

        const isRunning = project.status === 'running';
        const message = isRunning
            ? 'Configuration saved. Redeploy mesh and restart demo to apply changes.'
            : 'Configuration saved. Redeploy mesh to apply changes.';

        const selection = await (isRunning
            ? vscode.window.showWarningMessage(message, 'Redeploy Mesh', 'Later')
            : vscode.window.showInformationMessage(message, 'Redeploy Mesh', 'Later'));

        if (selection === 'Redeploy Mesh') {
            await this.ensureAuthAndApply(
                () => this.withDeploymentStatus(async () => { await vscode.commands.executeCommand('demoBuilder.deployMesh'); }),
                'redeploy mesh',
            );
        } else if (selection === 'Later') {
            if (project.meshState) {
                project.meshState.userDeclinedUpdate = true;
                project.meshState.declinedAt = new Date().toISOString();
                await this.stateManager.saveProject(project);
                await ProjectDashboardWebviewCommand.refreshStatus();
            }
        }

        return true;
    }

    /** Handle notification when only non-mesh configs changed and demo is running */
    private async handleRestartNotification(): Promise<boolean> {
        const shouldShow = await vscode.commands.executeCommand('demoBuilder._internal.shouldShowRestartNotification');
        if (!shouldShow) {
            this.logger.debug('[Configure] Restart notification already shown this session, suppressing');
            return false;
        }

        await vscode.commands.executeCommand('demoBuilder._internal.markRestartNotificationShown');

        const selection = await vscode.window.showInformationMessage(
            'Configuration saved. Restart the demo to apply changes.',
            'Restart Demo',
        );

        if (selection === 'Restart Demo') {
            try {
                await vscode.commands.executeCommand('demoBuilder.stopDemo');
                await vscode.commands.executeCommand('demoBuilder.startDemo');
            } catch (error) {
                this.logger.error('[Configure] Failed to restart demo:', error as Error);
            }
        }

        return true;
    }

    /**
     * Create handler context for message handlers
     */
    private createHandlerContext(): HandlerContext {
        return {
            // Managers (Configure doesn't use all managers, but context requires them)
            prereqManager: undefined as unknown as HandlerContext['prereqManager'],
            authManager: ServiceLocator.getAuthenticationService(),
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
        const project = await this.stateManager.getCurrentProject();

        const { ensureAdobeIOAuth } = await import('@/core/auth/adobeAuthGuard');
        const authResult = await ensureAdobeIOAuth({
            authManager,
            logger: this.logger,
            logPrefix: '[Configure]',
            projectContext: {
                organization: project?.adobe?.organization,
                projectId: project?.adobe?.projectId,
                workspace: project?.adobe?.workspace,
            },
            warningMessage: `Adobe sign-in required to ${operationDescription}.`,
        });

        if (!authResult.authenticated) {
            if (!authResult.cancelled) {
                vscode.window.showErrorMessage('Sign-in failed or was cancelled. Please try again.');
            }
            return false;
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


