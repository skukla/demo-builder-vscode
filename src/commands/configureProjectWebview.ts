import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { Project } from '@/types';
import { parseJSON } from '@/types/typeGuards';
import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import { detectMeshChanges } from '@/features/mesh/services/stalenessDetector';
import { WebviewCommunicationManager } from '@/core/communication';
import { BaseWebviewCommand } from '@/core/base';
import { ProjectDashboardWebviewCommand } from './projectDashboardWebview';
import {
    validateProjectPath,
    sanitizeErrorForLogging,
} from '@/core/validation/securityValidation';

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
        externalSystems?: unknown[];
        appBuilder?: unknown[];
        envVars: Record<string, unknown>;
    };
    existingEnvValues: Record<string, Record<string, string>>;
}

export class ConfigureProjectWebviewCommand extends BaseWebviewCommand {
    // Singleton: Track the active Configure panel
    private static activePanel: vscode.WebviewPanel | undefined;

    /**
     * Static method to dispose any active Configure panel
     * Useful for cleanup during navigation
     */
    public static disposeActivePanel(): void {
        if (ConfigureProjectWebviewCommand.activePanel) {
            ConfigureProjectWebviewCommand.activePanel.dispose();
            ConfigureProjectWebviewCommand.activePanel = undefined;
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

            this.logger.info(`[Configure] Opened configuration for project: ${project.name}`);
        } catch (error) {
            await this.showError('Failed to open configuration', error as Error);
        }
    }

    protected async getWebviewContent(): Promise<string> {
        const nonce = this.getNonce();
        const scriptUri = this.panel!.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'dist', 'webview', 'configure-bundle.js')),
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel!.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${this.panel!.webview.cspSource} https: data:; font-src ${this.panel!.webview.cspSource};">
    <title>Configure Project</title>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
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
            externalSystems: registry.components.externalSystems,
            appBuilder: registry.components.appBuilder,
            envVars: registry.envVars || {},
        };

        // Load existing env values from component .env files
        const existingEnvValues = await this.loadExistingEnvValues(project);

        // Debug: Log what we're sending
        this.logger.info('[ConfigureProjectWebview] Sending data to webview:');
        this.logger.info(`  - Frontends: ${componentsData.frontends?.length || 0}`);
        this.logger.info(`  - Backends: ${componentsData.backends?.length || 0}`);
        this.logger.info(`  - Dependencies: ${componentsData.dependencies?.length || 0}`);
        this.logger.info(`  - App Builder: ${componentsData.appBuilder?.length || 0}`);
        this.logger.info(`  - EnvVars keys: ${Object.keys(componentsData.envVars || {}).length}`);
        this.logger.info(`  - Existing env values: ${Object.keys(existingEnvValues).length} components`);
        this.logger.info(`  - Project componentSelections: ${JSON.stringify(project.componentSelections || 'none')}`);
        this.logger.info(`  - Project componentInstances: ${project.componentInstances ? Object.keys(project.componentInstances).join(', ') : 'none'}`);

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
        comm.on('save-configuration', async (data: { componentConfigs: ComponentConfigs }) => {
            try {
                const project = await this.stateManager.getCurrentProject();
                if (!project) {
                    throw new Error('No project found');
                }

                this.logger.info('[Configure] Saving configuration...');

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
                    this.showSuccessMessage('Configuration saved successfully');
                    
                    // Refresh Dashboard status (if open) to show amber indicators
                    await ProjectDashboardWebviewCommand.refreshStatus();
                    
                    // Smart notification based on what changed
                    if (meshChanges.hasChanges && project.status === 'running') {
                        // Check if mesh notification already shown this session
                        const shouldShow = await vscode.commands.executeCommand('demoBuilder._internal.shouldShowMeshNotification');
                        if (shouldShow) {
                            await vscode.commands.executeCommand('demoBuilder._internal.markMeshNotificationShown');
                            vscode.window.showWarningMessage(
                                'API Mesh configuration changed. Redeploy mesh and restart demo to apply changes.',
                                'Redeploy Mesh',
                                'Later',
                            ).then(selection => {
                                if (selection === 'Redeploy Mesh') {
                                    vscode.commands.executeCommand('demoBuilder.deployMesh');
                                }
                            });
                        } else {
                            this.logger.debug('[Configure] Mesh notification already shown this session, suppressing');
                        }
                    } else if (meshChanges.hasChanges) {
                        // Mesh changed, demo not running
                        const shouldShow = await vscode.commands.executeCommand('demoBuilder._internal.shouldShowMeshNotification');
                        if (shouldShow) {
                            await vscode.commands.executeCommand('demoBuilder._internal.markMeshNotificationShown');
                            vscode.window.showInformationMessage(
                                'API Mesh configuration changed. Redeploy mesh to apply changes.',
                                'Redeploy Mesh',
                                'Later',
                            ).then(selection => {
                                if (selection === 'Redeploy Mesh') {
                                    vscode.commands.executeCommand('demoBuilder.deployMesh');
                                }
                            });
                        } else {
                            this.logger.debug('[Configure] Mesh notification already shown this session, suppressing');
                        }
                    } else if (project.status === 'running') {
                        // Only non-mesh configs changed, demo is running
                        const shouldShow = await vscode.commands.executeCommand('demoBuilder._internal.shouldShowRestartNotification');
                        if (shouldShow) {
                            await vscode.commands.executeCommand('demoBuilder._internal.markRestartNotificationShown');
                            vscode.window.showInformationMessage(
                                'Restart the demo to apply configuration changes.',
                                'Restart Demo',
                            ).then(selection => {
                                if (selection === 'Restart Demo') {
                                    vscode.commands.executeCommand('demoBuilder.stopDemo').then(() => {
                                        vscode.commands.executeCommand('demoBuilder.startDemo');
                                    });
                                }
                            });
                        } else {
                            this.logger.debug('[Configure] Restart notification already shown this session, suppressing');
                        }
                    }
                });

                return result;
            } catch (error) {
                this.logger.error('[Configure] Failed to save configuration:', error as Error);
                await vscode.window.showErrorMessage(`Failed to save configuration: ${(error as Error).message}`);
                return { success: false, error: (error as Error).message };
            }
        });

        // Handle cancel
        comm.on('cancel', async () => {
            this.panel?.dispose();
        });

        // Handle get components data
        comm.on('get-components-data', async () => {
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

        if (!project.componentInstances) {
            return envValues;
        }

        // Read each component's .env file
        for (const [componentId, instance] of Object.entries(project.componentInstances)) {
            if (!instance.path) {
                continue;
            }

            // SECURITY: Validate path to prevent arbitrary file read
            try {
                validateProjectPath(instance.path);
            } catch (error) {
                this.logger.error(`[Configure] Security: Rejecting invalid path for ${componentId}`, error as Error);
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
                    this.logger.info(`  - Loaded ${Object.keys(envValues[componentId]).length} env vars from ${componentId} (${path.basename(envPath)})`);
                    loaded = true;
                    break;  // Found it, stop looking
                } catch (error) {
                    // File doesn't exist or read error, try next one
                    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                        const sanitized = sanitizeErrorForLogging(error as Error);
                        this.logger.debug(`[Configure] Error reading ${path.basename(envPath)}: ${sanitized}`);
                    }
                }
            }

            if (!loaded) {
                this.logger.info(`  - No .env file found for ${componentId} (will be created on save)`);
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

        // SECURITY: Limit number of lines to prevent DoS
        const MAX_LINES = 1000;
        const MAX_LINE_LENGTH = 10000;

        for (let i = 0; i < Math.min(lines.length, MAX_LINES); i++) {
            const line = lines[i];

            // SECURITY: Skip excessively long lines to prevent DoS
            if (line.length > MAX_LINE_LENGTH) {
                this.logger.debug(`[Configure] Skipping excessively long line ${i + 1} (${line.length} chars)`);
                continue;
            }

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

                // SECURITY: Validate key format (alphanumeric, underscore only)
                if (!this.isValidEnvKey(key)) {
                    this.logger.debug(`[Configure] Skipping invalid env key: ${key}`);
                    continue;
                }

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
     * Validate environment variable key format
     * SECURITY: Only allow safe characters to prevent injection
     */
    private isValidEnvKey(key: string): boolean {
        // Allow only uppercase letters, digits, and underscores (standard env var convention)
        return /^[A-Z_][A-Z0-9_]*$/.test(key);
    }

    /**
     * Sanitize environment variable value
     * SECURITY: Remove potentially dangerous characters
     */
    private sanitizeEnvValue(value: string): string {
        // Remove newlines and carriage returns to prevent .env format injection
        return value.replace(/[\r\n]/g, '');
    }

    /**
     * Register programmatic writes to suppress file watcher notifications
     */
    private async registerProgrammaticWrites(project: Project, componentConfigs: ComponentConfigs): Promise<void> {
        const filePaths: string[] = [];
        
        // Project root .env
        filePaths.push(path.join(project.path, '.env'));
        
        // Component .env files
        if (project.componentInstances) {
            for (const [componentId, instance] of Object.entries(project.componentInstances)) {
                if (instance.path && componentConfigs[componentId]) {
                    const envFileName = componentId.includes('nextjs') ? '.env.local' : '.env';
                    filePaths.push(path.join(instance.path, envFileName));
                }
            }
        }
        
        // Register all paths with file watcher
        await vscode.commands.executeCommand('demoBuilder._internal.registerProgrammaticWrites', filePaths);
        this.logger.debug(`[Configure] Registered ${filePaths.length} programmatic writes`);
    }

    /**
     * Regenerate .env files for project and components
     */
    private async regenerateEnvFiles(project: Project, componentConfigs: ComponentConfigs): Promise<void> {
        try {
            // Regenerate project root .env file
            await this.generateProjectEnvFile(project, componentConfigs);

            // Regenerate component .env files
            if (project.componentInstances) {
                for (const [componentId, instance] of Object.entries(project.componentInstances)) {
                    if (instance.path && componentConfigs[componentId]) {
                        await this.generateComponentEnvFile(
                            instance.path,
                            componentId,
                            componentConfigs[componentId],
                        );
                    }
                }
            }

            this.logger.info('[Configure] Successfully regenerated .env files');
        } catch (error) {
            this.logger.error('[Configure] Failed to regenerate .env files:', error as Error);
            throw error;
        }
    }

    /**
     * Generate project root .env file
     */
    private async generateProjectEnvFile(project: Project, componentConfigs: ComponentConfigs): Promise<void> {
        // SECURITY: Validate path to prevent arbitrary file write
        validateProjectPath(project.path);

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
        const allKeys = new Set<string>();
        Object.values(componentConfigs).forEach((config) => {
            Object.keys(config).forEach(key => {
                // SECURITY: Only add valid env keys
                if (this.isValidEnvKey(key)) {
                    allKeys.add(key);
                }
            });
        });

        // Write each unique key (using first component's value)
        // Skip empty, null, or undefined values
        allKeys.forEach(key => {
            // Find first component that has this key with a non-empty value
            for (const config of Object.values(componentConfigs)) {
                const value = config[key];
                if (value !== undefined && value !== null && value !== '') {
                    // SECURITY: Sanitize value to prevent injection
                    const sanitizedValue = this.sanitizeEnvValue(value);
                    lines.push(`${key}=${sanitizedValue}`);
                    break;
                }
            }
        });

        await fs.writeFile(envPath, lines.join('\n'), 'utf-8');
        const sanitizedPath = sanitizeErrorForLogging(envPath);
        this.logger.debug(`[Configure] Generated project .env at ${sanitizedPath}`);
    }

    /**
     * Generate component-specific .env file
     */
    private async generateComponentEnvFile(
        componentPath: string,
        componentId: string,
        config: Record<string, string>,
    ): Promise<void> {
        // SECURITY: Validate path to prevent arbitrary file write
        validateProjectPath(componentPath);

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
        Object.entries(config).forEach(([key, value]) => {
            // SECURITY: Validate key and sanitize value
            if (value !== undefined && value !== null && value !== '' && this.isValidEnvKey(key)) {
                const sanitizedValue = this.sanitizeEnvValue(value);
                lines.push(`${key}=${sanitizedValue}`);
            }
        });

        await fs.writeFile(envPath, lines.join('\n'), 'utf-8');
        const sanitizedPath = sanitizeErrorForLogging(envPath);
        this.logger.debug(`[Configure] Generated component ${envFileName} at ${sanitizedPath}`);
    }
}

