import * as vscode from 'vscode';
import * as path from 'path';
import { BaseCommand } from './baseCommand';
import { setLoadingState } from '../utils/loadingHTML';
import { detectMeshChanges, detectFrontendChanges } from '../utils/stalenessDetector';
import { Project } from '../types';

/**
 * Command to show the "Project Dashboard" after project creation
 * This provides a control panel for demo management and quick actions
 */
export class ProjectDashboardWebviewCommand extends BaseCommand {
    // Singleton: Track the active Project Dashboard panel and instance
    private static activePanel: vscode.WebviewPanel | undefined;
    private static activeInstance: ProjectDashboardWebviewCommand | undefined;
    
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
            ProjectDashboardWebviewCommand.activeInstance = undefined;
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
            ProjectDashboardWebviewCommand.activeInstance = this;

            // Handle disposal
            this.panel.onDidDispose(
                async () => {
                    ProjectDashboardWebviewCommand.activePanel = undefined;
                    ProjectDashboardWebviewCommand.activeInstance = undefined;
                    this.panel = undefined;
                    
                    // Auto-open Welcome screen when dashboard closes (for easy navigation)
                    try {
                        const hasProject = await this.stateManager.hasProject();
                        if (hasProject) {
                            this.logger.debug('[Project Dashboard] Dashboard closed, showing Welcome screen');
                            // Small delay to ensure disposal is complete before opening new webview
                            setTimeout(() => {
                                vscode.commands.executeCommand('demoBuilder.showWelcome').then(
                                    () => this.logger.debug('[Project Dashboard] Welcome screen opened successfully'),
                                    (err) => this.logger.debug(`[Project Dashboard] Could not open Welcome screen: ${err?.message || err}`)
                                );
                            }, 100);
                        }
                    } catch (error) {
                        // Silently ignore errors during disposal
                        this.logger.debug(`[Project Dashboard] Error during disposal: ${error}`);
                    }
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
                        case 'openBrowser': {
                            // Open demo in browser
                            const currentProject = await this.stateManager.getCurrentProject();
                            const frontendPort = currentProject?.componentInstances?.['citisignal-nextjs']?.port;
                            if (frontendPort) {
                                const url = `http://localhost:${frontendPort}`;
                                await vscode.env.openExternal(vscode.Uri.parse(url));
                                this.logger.info(`[Project Dashboard] Opening browser: ${url}`);
                            }
                            break;
                        }
                        case 'viewLogs':
                            await vscode.commands.executeCommand('demoBuilder.showLogs');
                            break;
                        case 'configure':
                            await vscode.commands.executeCommand('demoBuilder.configureProject');
                            break;
                        case 'deployMesh':
                            await vscode.commands.executeCommand('demoBuilder.deployMesh');
                            break;
                        case 'openDevConsole': {
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
                        }
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

        // DEBUG: Log project structure
        this.logger.debug('[Project Dashboard] Project data:', {
            hasComponentInstances: !!project.componentInstances,
            componentKeys: Object.keys(project.componentInstances || {}),
            hasMeshState: !!project.meshState,
            meshStateKeys: project.meshState ? Object.keys(project.meshState) : []
        });

        // Get mesh component for status
        const meshComponent = project.componentInstances?.['commerce-mesh'];
        
        this.logger.debug('[Project Dashboard] Mesh component data:', {
            hasMeshComponent: !!meshComponent,
            meshStatus: meshComponent?.status,
            meshEndpoint: meshComponent?.endpoint,
            meshPath: meshComponent?.path
        });

        // Determine mesh status
        let meshStatus: 'deploying' | 'deployed' | 'config-changed' | 'not-deployed' | 'error' = 'not-deployed';
        
        if (meshComponent) {
            // Check component status for transient states (deploying, error)
            if (meshComponent.status === 'deploying') {
                meshStatus = 'deploying';
            }
            else if (meshComponent.status === 'error') {
                meshStatus = 'error';
            }
            // meshState = source of truth for deployment
            // meshState is ONLY set after successful deployment AND verification
            else if (project.meshState) {
                meshStatus = 'deployed';
                
                // Check if configuration has changed since deployment
                if (project.componentConfigs) {
                    const meshChanges = await detectMeshChanges(project, project.componentConfigs);
                    if (meshChanges.hasChanges) {
                        meshStatus = 'config-changed';
                    }
                }
                
                // Periodically verify mesh still exists in Adobe I/O (async, non-blocking)
                // This catches cases where mesh was deleted externally
                this.verifyMeshDeployment(project).catch(err => {
                    this.logger.debug('[Project Dashboard] Background mesh verification failed', err);
                });
            }
            // Otherwise, mesh is not deployed
        }

        // Detect if frontend configuration has changed since demo started
        let frontendConfigChanged = false;
        if (project.status === 'running') {
            frontendConfigChanged = detectFrontendChanges(project);
        }

        const statusData = {
            name: project.name,
            path: project.path,
            status: project.status || 'ready',
            port: project.componentInstances?.['citisignal-nextjs']?.port,
            adobeOrg: project.adobe?.organization,
            adobeProject: project.adobe?.projectName,
            frontendConfigChanged,
            // Show mesh status if mesh component exists
            mesh: meshComponent ? {
                status: meshStatus,
                endpoint: meshComponent.endpoint,
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
        status: 'deploying' | 'deployed' | 'config-changed' | 'error' | 'not-deployed',
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

    /**
     * Public method to trigger a full status refresh (called after config changes)
     */
    public static async refreshStatus(): Promise<void> {
        if (ProjectDashboardWebviewCommand.activeInstance) {
            await ProjectDashboardWebviewCommand.activeInstance.sendProjectStatus();
        }
    }

    /**
     * Verify mesh deployment with Adobe I/O and update status if needed
     * Runs in background to avoid blocking UI
     */
    private async verifyMeshDeployment(project: Project): Promise<void> {
        const { verifyMeshDeployment, syncMeshStatus } = await import('../utils/meshVerifier');
        
        this.logger.debug('[Project Dashboard] Verifying mesh deployment with Adobe I/O...');
        
        const verificationResult = await verifyMeshDeployment(project);
        
        if (!verificationResult.exists) {
            this.logger.warn('[Project Dashboard] Mesh verification failed - mesh may not exist in Adobe I/O', {
                error: verificationResult.error
            });
            
            // Sync project state with reality
            await syncMeshStatus(project, verificationResult);
            await this.stateManager.saveProject(project);
            
            // Update dashboard to show correct status
            await this.sendProjectStatus();
            
            // Show warning to user
            if (this.panel) {
                await this.panel.webview.postMessage({
                    type: 'meshStatusUpdate',
                    payload: {
                        status: 'not-deployed',
                        message: 'Mesh not found in Adobe I/O - may have been deleted externally'
                    }
                });
            }
        } else {
            this.logger.debug('[Project Dashboard] Mesh verified successfully', {
                meshId: verificationResult.meshId,
                endpoint: verificationResult.endpoint
            });
            
            // Update endpoint if it changed
            await syncMeshStatus(project, verificationResult);
            await this.stateManager.saveProject(project);
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



