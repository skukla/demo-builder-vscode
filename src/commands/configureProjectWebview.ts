import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { BaseWebviewCommand } from './baseWebviewCommand';
import { WebviewCommunicationManager } from '../utils/webviewCommunicationManager';
import { ComponentRegistryManager } from '../utils/componentRegistry';
import { Project } from '../types';

export class ConfigureProjectWebviewCommand extends BaseWebviewCommand {
    // Singleton: Track the active Configure panel
    private static activePanel: vscode.WebviewPanel | undefined;

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
            vscode.Uri.file(path.join(this.context.extensionPath, 'dist', 'webview', 'configure-bundle.js'))
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

    protected async getInitialData(): Promise<any> {
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
            envVars: registry.envVars || {}
        };

        // Debug: Log what we're sending
        this.logger.info('[ConfigureProjectWebview] Sending data to webview:');
        this.logger.info(`  - Frontends: ${componentsData.frontends?.length || 0}`);
        this.logger.info(`  - Backends: ${componentsData.backends?.length || 0}`);
        this.logger.info(`  - Dependencies: ${componentsData.dependencies?.length || 0}`);
        this.logger.info(`  - App Builder: ${componentsData.appBuilder?.length || 0}`);
        this.logger.info(`  - EnvVars keys: ${Object.keys(componentsData.envVars || {}).length}`);
        this.logger.info(`  - Project componentSelections: ${JSON.stringify(project.componentSelections || 'none')}`);
        this.logger.info(`  - Project componentInstances: ${project.componentInstances ? Object.keys(project.componentInstances).join(', ') : 'none'}`);

        // Get current theme
        const theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';

        return {
            theme,
            project,
            componentsData
        };
    }

    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        // Handle save configuration
        comm.on('save-configuration', async (data: { componentConfigs: any }) => {
            try {
                const project = await this.stateManager.getCurrentProject();
                if (!project) {
                    throw new Error('No project found');
                }

                this.logger.info('[Configure] Saving configuration...');

                // Update project state
                project.componentConfigs = data.componentConfigs;
                await this.stateManager.saveProject(project);

                // Regenerate .env files
                await this.regenerateEnvFiles(project, data.componentConfigs);

                // Show success message
                await vscode.window.showInformationMessage('Configuration saved successfully');

                // Check if demo is running and prompt to restart
                if (project.frontend?.status === 'running') {
                    const restart = await vscode.window.showInformationMessage(
                        'Demo is currently running. Restart to apply changes?',
                        'Restart Now',
                        'Later'
                    );

                    if (restart === 'Restart Now') {
                        await vscode.commands.executeCommand('demoBuilder.stopDemo');
                        await vscode.commands.executeCommand('demoBuilder.startDemo');
                    }
                }

                return { success: true };
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
            return JSON.parse(componentsContent);
        });
    }

    /**
     * Regenerate .env files for project and components
     */
    private async regenerateEnvFiles(project: Project, componentConfigs: any): Promise<void> {
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
                            componentConfigs[componentId]
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
    private async generateProjectEnvFile(project: Project, componentConfigs: any): Promise<void> {
        const envPath = path.join(project.path, '.env');
        
        const lines: string[] = [
            '# Demo Builder Project Configuration',
            '# Generated: ' + new Date().toISOString(),
            '',
            `PROJECT_NAME=${project.name}`,
            ''
        ];

        // Add project-wide configuration from componentConfigs
        // Collect all unique keys across all components
        const allKeys = new Set<string>();
        Object.values(componentConfigs).forEach((config: any) => {
            Object.keys(config).forEach(key => allKeys.add(key));
        });

        // Write each unique key (using first component's value)
        allKeys.forEach(key => {
            // Find first component that has this key
            for (const config of Object.values(componentConfigs) as any[]) {
                if (config[key] !== undefined) {
                    lines.push(`${key}=${config[key]}`);
                    break;
                }
            }
        });

        await fs.writeFile(envPath, lines.join('\n'), 'utf-8');
        this.logger.debug(`[Configure] Generated project .env at ${envPath}`);
    }

    /**
     * Generate component-specific .env file
     */
    private async generateComponentEnvFile(
        componentPath: string,
        componentId: string,
        config: Record<string, any>
    ): Promise<void> {
        const envPath = path.join(componentPath, '.env');
        
        const lines: string[] = [
            `# ${componentId} - Environment Configuration`,
            '# Generated by Demo Builder',
            '# Generated: ' + new Date().toISOString(),
            ''
        ];

        // Add all configuration values for this component
        Object.entries(config).forEach(([key, value]) => {
            lines.push(`${key}=${value}`);
        });

        await fs.writeFile(envPath, lines.join('\n'), 'utf-8');
        this.logger.debug(`[Configure] Generated component .env at ${envPath}`);
    }
}

