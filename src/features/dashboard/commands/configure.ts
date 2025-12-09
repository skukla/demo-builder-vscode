import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { ProjectDashboardWebviewCommand } from './showDashboard';
import { BaseWebviewCommand } from '@/core/base';
import { WebviewCommunicationManager } from '@/core/communication';
import { getWebviewHTMLWithBundles } from '@/core/utils/getWebviewHTMLWithBundles';
import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import { detectMeshChanges } from '@/features/mesh/services/stalenessDetector';
import { Project } from '@/types';
import { ErrorCode } from '@/types/errorCodes';
import { parseJSON, getComponentInstanceEntries } from '@/types/typeGuards';

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

    /**
     * Generate webview HTML with webpack 4-bundle pattern.
     *
     * Loads bundles in correct order for code splitting:
     * 1. runtime-bundle.js - Webpack runtime
     * 2. vendors-bundle.js - Third-party libraries
     * 3. common-bundle.js - Shared application code
     * 4. configure-bundle.js - Configure-specific code
     */
    protected async getWebviewContent(): Promise<string> {
        const nonce = this.getNonce();
        const webviewPath = path.join(this.context.extensionPath, 'dist', 'webview');

        // Build bundle URIs for webpack code-split bundles
        const bundleUris = {
            runtime: this.panel!.webview.asWebviewUri(
                vscode.Uri.file(path.join(webviewPath, 'runtime-bundle.js'))
            ),
            vendors: this.panel!.webview.asWebviewUri(
                vscode.Uri.file(path.join(webviewPath, 'vendors-bundle.js'))
            ),
            common: this.panel!.webview.asWebviewUri(
                vscode.Uri.file(path.join(webviewPath, 'common-bundle.js'))
            ),
            feature: this.panel!.webview.asWebviewUri(
                vscode.Uri.file(path.join(webviewPath, 'configure-bundle.js'))
            ),
        };

        // Get base URI for media assets
        const mediaPath = vscode.Uri.file(path.join(this.context.extensionPath, 'dist'));
        const baseUri = this.panel!.webview.asWebviewUri(mediaPath);

        // Generate HTML using 4-bundle helper
        return getWebviewHTMLWithBundles({
            bundleUris,
            nonce,
            cspSource: this.panel!.webview.cspSource,
            title: 'Configure Project',
            additionalImgSources: ['https:', 'data:'],
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

        // Get current theme
        const theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';

        return {
            theme,
            project,
            componentsData,
            existingEnvValues,
        };
    }

    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        // Handle save configuration
        comm.onStreaming('save-configuration', async (data: { componentConfigs: ComponentConfigs }) => {
            try {
                const project = await this.stateManager.getCurrentProject();
                if (!project) {
                    throw new Error('No project found');
                }

                // Detect if mesh configuration changed BEFORE saving
                const meshChanges = await detectMeshChanges(project, data.componentConfigs);

                // Update project state
                project.componentConfigs = data.componentConfigs;
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

                    if (meshChanges.hasChanges && project.status === 'running') {
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
                                    // deployMesh command handles its own errors
                                    await vscode.commands.executeCommand('demoBuilder.deployMesh');
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
                                    // deployMesh command handles its own errors
                                    await vscode.commands.executeCommand('demoBuilder.deployMesh');
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
            const componentsPath = path.join(this.context.extensionPath, 'templates', 'components.json');
            const componentsContent = await fs.readFile(componentsPath, 'utf-8');
            const componentsData = parseJSON<Record<string, unknown>>(componentsContent);
            if (!componentsData) {
                throw new Error('Failed to parse components.json');
            }
            return componentsData;
        });
    }

    /**
     * Load existing environment variable values from component .env files
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
                    envValues[componentId] = this.parseEnvFile(envContent);
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

        return envValues;
    }

    /**
     * Parse .env file content into key-value pairs
     */
    private parseEnvFile(content: string): Record<string, string> {
        const values: Record<string, string> = {};
        const lines = content.split('\n');

        for (const line of lines) {
            // Skip comments and empty lines
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            // Parse KEY=VALUE
            const match = /^([^=]+)=(.*)$/.exec(trimmed);
            if (match) {
                const key = match[1].trim();
                let value = match[2].trim();
                
                // Remove quotes if present
                if ((value.startsWith('"') && value.endsWith('"')) || 
                    (value.startsWith('\'') && value.endsWith('\''))) {
                    value = value.slice(1, -1);
                }
                
                values[key] = value;
            }
        }

        return values;
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
     * Regenerate .env files for project and components
     */
    private async regenerateEnvFiles(project: Project, componentConfigs: ComponentConfigs): Promise<void> {
        try {
            // Count files for summary log
            let fileCount = 1;  // Project root .env

            // Regenerate project root .env file
            await this.generateProjectEnvFile(project, componentConfigs);

            // Regenerate component .env files
            // SOP §4: Using helper instead of inline Object.entries
            for (const [componentId, instance] of getComponentInstanceEntries(project)) {
                if (instance.path && componentConfigs[componentId]) {
                    await this.generateComponentEnvFile(
                        instance.path,
                        componentId,
                        componentConfigs[componentId],
                    );
                    fileCount++;
                }
            }

            this.logger.debug(`[Configure] Regenerated ${fileCount} .env files`);
        } catch (error) {
            this.logger.error('[Configure] Failed to regenerate .env files:', error as Error);
            throw error;
        }
    }

    /**
     * Generate project root .env file
     */
    private async generateProjectEnvFile(project: Project, componentConfigs: ComponentConfigs): Promise<void> {
        const envPath = path.join(project.path, '.env');
        
        const lines: string[] = [
            '# Demo Builder Project Configuration',
            '# Generated: ' + new Date().toISOString(),
            '',
            `PROJECT_NAME=${project.name}`,
            '',
        ];

        // Add project-wide configuration from componentConfigs
        // Collect all unique keys across all components
        // SOP §4: Extract Object operations to variables
        const allKeys = new Set<string>();
        const configValues = Object.values(componentConfigs);
        for (const config of configValues) {
            const configKeys = Object.keys(config);
            for (const key of configKeys) {
                allKeys.add(key);
            }
        }

        // Write each unique key (using first component's value)
        // Skip empty, null, or undefined values
        for (const key of allKeys) {
            // Find first component that has this key with a non-empty value
            for (const config of configValues) {
                const value = config[key];
                if (value !== undefined && value !== null && value !== '') {
                    lines.push(`${key}=${value}`);
                    break;
                }
            }
        }

        await fs.writeFile(envPath, lines.join('\n'), 'utf-8');
    }

    /**
     * Generate component-specific .env file
     */
    private async generateComponentEnvFile(
        componentPath: string,
        componentId: string,
        config: Record<string, string>,
    ): Promise<void> {
        // Next.js uses .env.local, others use .env
        const envFileName = componentId.includes('nextjs') ? '.env.local' : '.env';
        const envPath = path.join(componentPath, envFileName);
        
        const lines: string[] = [
            `# ${componentId} - Environment Configuration`,
            '# Generated by Demo Builder',
            '# Generated: ' + new Date().toISOString(),
            '',
        ];

        // Add all configuration values for this component
        // Skip empty, null, or undefined values (don't write them to file)
        // SOP §4: Using for...of instead of Object.entries().forEach()
        const configEntries = Object.entries(config);
        for (const [key, value] of configEntries) {
            if (value !== undefined && value !== null && value !== '') {
                lines.push(`${key}=${value}`);
            }
        }

        await fs.writeFile(envPath, lines.join('\n'), 'utf-8');
    }
}

