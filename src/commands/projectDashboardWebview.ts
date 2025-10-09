import * as vscode from 'vscode';
import * as path from 'path';
import { BaseCommand } from './baseCommand';
import { StateManager } from '../utils/stateManager';
import { setLoadingState } from '../utils/loadingHTML';

/**
 * Command to show the "Project Dashboard" after project creation
 * This provides a control panel for demo management and quick actions
 */
export class ProjectDashboardWebviewCommand extends BaseCommand {
    // Singleton: Track the active Project Dashboard panel
    private static activePanel: vscode.WebviewPanel | undefined;
    
    private panel: vscode.WebviewPanel | undefined;
    private currentProject: any = null; // Store project for message handler access

    /**
     * Static method to dispose any active Project Dashboard panel
     * Useful for cleanup during reset or navigation
     */
    public static disposeActivePanel(): void {
        if (ProjectDashboardWebviewCommand.activePanel) {
            ProjectDashboardWebviewCommand.activePanel.dispose();
            ProjectDashboardWebviewCommand.activePanel = undefined;
        }
    }

    public async execute(): Promise<void> {
        try {
            // Check if Project Dashboard panel already exists (singleton)
            if (ProjectDashboardWebviewCommand.activePanel) {
                ProjectDashboardWebviewCommand.activePanel.reveal();
                return;
            }

            const project = await this.stateManager.getCurrentProject();
            if (!project) {
                this.logger.warn('[Project Dashboard] No project found');
                return;
            }
            
            this.logger.info(`[Project Dashboard] Showing dashboard for project: ${project.name}`);
            
            // Store project for message handler
            this.currentProject = project;

            // Create webview panel
            this.panel = vscode.window.createWebviewPanel(
                'demoBuilder.projectDashboard',
                'Project Dashboard',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [
                        vscode.Uri.file(path.join(this.context.extensionPath, 'dist', 'webview'))
                    ]
                }
            );

            // Register in singleton
            ProjectDashboardWebviewCommand.activePanel = this.panel;

            // Handle disposal
            this.panel.onDidDispose(
                () => {
                    ProjectDashboardWebviewCommand.activePanel = undefined;
                    this.panel = undefined;
                },
                undefined,
                this.context.subscriptions
            );

            // Set up message handler BEFORE loading content (so React can communicate)
            this.panel.webview.onDidReceiveMessage(
                async (message) => {
                    // Handle structured messages from vscodeApi wrapper (has .type field)
                    if (message && typeof message === 'object' && message.type) {
                        // Handle handshake protocol
                        if (message.type === '__webview_ready__') {
                            if (this.panel) {
                                await this.panel.webview.postMessage({
                                    id: `msg_${Date.now()}`,
                                    type: '__handshake_complete__',
                                    timestamp: Date.now()
                                });
                            }
                            return;
                        }
                        
                        switch (message.type) {
                        case 'ready':
                            // Send initialization data
                            if (this.currentProject && this.panel) {
                                this.panel.webview.postMessage({
                                    type: 'init',
                                    payload: {
                                        theme: vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light',
                                        project: {
                                            name: this.currentProject.name,
                                            path: this.currentProject.path
                                        }
                                    }
                                });
                            }
                            break;
                        case 'requestStatus':
                            // Send current project status
                            await this.sendProjectStatus();
                            break;
                        case 'startDemo':
                            await vscode.commands.executeCommand('demoBuilder.startDemo');
                            // Update status after start
                            setTimeout(() => this.sendProjectStatus(), 1000);
                            break;
                        case 'stopDemo':
                            await vscode.commands.executeCommand('demoBuilder.stopDemo');
                            // Update status after stop
                            setTimeout(() => this.sendProjectStatus(), 1000);
                            break;
                        case 'openBrowser':
                            // Open demo in browser
                            const currentProject = await this.stateManager.getCurrentProject();
                            if (currentProject?.frontend?.port) {
                                const url = `http://localhost:${currentProject.frontend.port}`;
                                await vscode.env.openExternal(vscode.Uri.parse(url));
                                this.logger.info(`[Project Dashboard] Opening browser: ${url}`);
                            }
                            break;
                        case 'viewLogs':
                            await vscode.commands.executeCommand('demoBuilder.showLogs');
                            break;
                        case 'configure':
                            await vscode.commands.executeCommand('demoBuilder.configureProject');
                            break;
                        case 'deployMesh':
                            await vscode.commands.executeCommand('demoBuilder.deployMesh');
                            break;
                        case 'openDevConsole':
                            // Open Adobe Developer Console for this project/workspace
                            const project = await this.stateManager.getCurrentProject();
                            let consoleUrl = 'https://developer.adobe.com/console';
                                
                            if (project?.adobe?.organization && project?.adobe?.projectId && project?.adobe?.workspace) {
                                // Direct link to workspace (same as API Mesh modal)
                                consoleUrl = `https://developer.adobe.com/console/projects/${project.adobe.organization}/${project.adobe.projectId}/workspaces/${project.adobe.workspace}/details`;
                                this.logger.info('[Dev Console] Opening workspace-specific URL', {
                                    org: project.adobe.organization,
                                    project: project.adobe.projectId,
                                    workspace: project.adobe.workspace
                                });
                            } else if (project?.adobe?.organization && project?.adobe?.projectId) {
                                // Fallback: project overview if no workspace
                                consoleUrl = `https://developer.adobe.com/console/projects/${project.adobe.organization}/${project.adobe.projectId}/overview`;
                                this.logger.info('[Dev Console] Opening project-specific URL (no workspace)');
                            } else {
                                this.logger.info('[Dev Console] Opening generic console URL (missing IDs)');
                            }
                                
                            await vscode.env.openExternal(vscode.Uri.parse(consoleUrl));
                            break;
                        case 'deleteProject':
                            await vscode.commands.executeCommand('demoBuilder.deleteProject');
                            // Close cockpit after delete
                            this.panel?.dispose();
                            break;
                        }
                    }
                },
                undefined,
                this.context.subscriptions
            );

            // Set loading state with spinner (matching Welcome screen UX)
            await setLoadingState(
                this.panel,
                async () => this.getHtmlContent(this.panel!.webview),
                'Loading Project Dashboard...',
                this.logger
            );

            // Initiate handshake protocol (required by vscodeApi wrapper)
            await this.panel.webview.postMessage({
                id: `msg_${Date.now()}`,
                type: '__extension_ready__',
                timestamp: Date.now()
            });

        } catch (error) {
            this.logger.error('[Project Dashboard] Failed to create panel', error as Error);
        }
    }

    /**
     * Send current project status to the webview
     */
    private async sendProjectStatus(): Promise<void> {
        if (!this.panel) return;

        const project = await this.stateManager.getCurrentProject();
        if (!project) return;

        // Get mesh component for status
        const meshComponent = project.componentInstances?.['commerce-mesh'];

        const statusData = {
            name: project.name,
            path: project.path,
            status: project.status || 'ready',
            port: project.frontend?.port,
            adobeOrg: project.adobe?.organization,
            adobeProject: project.adobe?.projectName,
            mesh: project.mesh ? {
                status: project.mesh.status || 'not-deployed',
                endpoint: meshComponent?.endpoint || project.mesh.endpoint,
                message: undefined
            } : undefined
        };

        this.panel.webview.postMessage({
            type: 'statusUpdate',
            payload: statusData
        });
    }
    
    /**
     * Public method to send mesh status updates (called by deployMesh command)
     */
    public static async sendMeshStatusUpdate(
        status: 'deploying' | 'deployed' | 'error' | 'not-deployed',
        message?: string,
        endpoint?: string
    ): Promise<void> {
        if (ProjectDashboardWebviewCommand.activePanel) {
            await ProjectDashboardWebviewCommand.activePanel.webview.postMessage({
                type: 'meshStatusUpdate',
                payload: {
                    status,
                    message,
                    endpoint
                }
            });
        }
    }

    private getHtmlContent(webview: vscode.Webview): string {
        const nonce = this.getNonce();
        
        // Get bundle URI
        const bundlePath = vscode.Uri.joinPath(
            this.context.extensionUri,
            'dist',
            'webview',
            'projectDashboard-bundle.js'
        );
        const bundleUri = webview.asWebviewUri(bundlePath);

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}';">
            <title>Project Dashboard</title>
        </head>
        <body>
            <div id="root"></div>
            <script nonce="${nonce}" src="${bundleUri}"></script>
        </body>
        </html>`;
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}

