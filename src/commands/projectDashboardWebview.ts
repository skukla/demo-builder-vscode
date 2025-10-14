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

            // If demo is already running, initialize file hashes for change detection
            if (project.status === 'running') {
                await this.initializeFileHashesForRunningDemo(project);
            }

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
                        case 're-authenticate':
                            // Trigger browser authentication flow
                            await this.handleReAuthentication();
                            break;
                        case 'startDemo':
                            await vscode.commands.executeCommand('demoBuilder.startDemo');
                            // Update demo status only (don't re-check mesh)
                            setTimeout(() => this.sendDemoStatusUpdate(), 1000);
                            break;
                        case 'stopDemo':
                            await vscode.commands.executeCommand('demoBuilder.stopDemo');
                            // Update demo status only (don't re-check mesh)
                            setTimeout(() => this.sendDemoStatusUpdate(), 1000);
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
     * Check mesh status asynchronously and update UI when complete
     * This prevents blocking the initial UI render on slow auth checks
     */
    private async checkMeshStatusAsync(project: Project, meshComponent: any, frontendConfigChanged: boolean): Promise<void> {
        try {
            let meshStatus: 'needs-auth' | 'deploying' | 'deployed' | 'config-changed' | 'not-deployed' | 'error' = 'not-deployed';
            let meshEndpoint: string | undefined;
            let meshMessage: string | undefined;
            
            if (project.componentConfigs) {
                this.logger.debug('[Dashboard] Checking mesh deployment status...');
                
                // Pre-check: Quick auth verification (< 1 second vs 9+ seconds for full check)
                const { AdobeAuthManager } = await import('../utils/adobeAuthManager');
                const { getExternalCommandManager } = await import('../extension');
                const authManager = new AdobeAuthManager(
                    this.context.extensionPath,
                    this.logger,
                    getExternalCommandManager()
                );
                
                // Use quick check - doesn't validate org access or init SDK (much faster)
                const isAuthenticated = await authManager.isAuthenticatedQuick();
                
                if (!isAuthenticated) {
                    this.logger.debug('[Dashboard] Not authenticated, showing auth prompt');
                    // Send 'needs-auth' status to show inline authentication prompt
                    if (this.panel) {
                        this.panel.webview.postMessage({
                            type: 'statusUpdate',
                            payload: {
                                name: project.name,
                                path: project.path,
                                status: project.status || 'ready',
                                port: project.componentInstances?.['citisignal-nextjs']?.port,
                                adobeOrg: project.adobe?.organization,
                                adobeProject: project.adobe?.projectName,
                                frontendConfigChanged,
                                mesh: {
                                    status: 'needs-auth',
                                    message: 'Sign in to verify mesh status'
                                }
                            }
                        });
                    }
                    return;
                }
                
                // Check org access (degraded mode detection)
                // Ensure SDK is initialized for faster org operations
                await authManager.ensureSDKInitialized();
                
                if (project.adobe?.organization) {
                    const currentOrg = await authManager.getCurrentOrganization();
                    if (!currentOrg || currentOrg.id !== project.adobe.organization) {
                        this.logger.warn('[Dashboard] User lost access to project organization');
                        // Send degraded mode status
                        if (this.panel) {
                            this.panel.webview.postMessage({
                                type: 'statusUpdate',
                                payload: {
                                    name: project.name,
                                    path: project.path,
                                    status: project.status || 'ready',
                                    port: project.componentInstances?.['citisignal-nextjs']?.port,
                                    adobeOrg: project.adobe?.organization,
                                    adobeProject: project.adobe?.projectName,
                                    frontendConfigChanged,
                                    mesh: {
                                        status: 'error',
                                        message: 'Organization access lost'
                                    }
                                }
                            });
                        }
                        return;
                    }
                }
                
                // Initialize meshState if it doesn't exist
                if (!project.meshState) {
                    this.logger.debug('[Dashboard] No meshState found, initializing empty state');
                    project.meshState = {
                        envVars: {},
                        sourceHash: null,
                        lastDeployed: ''
                    };
                }
                
                const meshChanges = await detectMeshChanges(project, project.componentConfigs);
                
                // If we fetched and populated deployed config, save the project
                if (meshChanges.shouldSaveProject) {
                    this.logger.debug('[Dashboard] Populated meshState.envVars from deployed config, saving project');
                    await this.stateManager.saveProject(project);
                    meshStatus = 'deployed';
                }
                
                // Check if we have a valid meshState now (deployed if lastDeployed is set)
                if (project.meshState && project.meshState.lastDeployed) {
                    meshStatus = 'deployed';
                    
                    if (meshChanges.hasChanges) {
                        meshStatus = 'config-changed';
                        
                        if (meshChanges.unknownDeployedState) {
                            this.logger.debug('[Dashboard] Mesh flagged as changed due to unknown deployed state');
                        }
                    }
                    
                    meshEndpoint = meshComponent.endpoint;
                    
                    // Verify mesh still exists in Adobe I/O (async, non-blocking)
                    this.verifyMeshDeployment(project).catch(err => {
                        this.logger.debug('[Project Dashboard] Background mesh verification failed', err);
                    });
                } else if (meshChanges.unknownDeployedState) {
                    meshStatus = 'not-deployed';
                    this.logger.debug('[Dashboard] Could not verify mesh deployment status');
                }
            } else {
                this.logger.debug('[Dashboard] No component configs available for mesh status check');
                // If meshState exists with lastDeployed, the mesh is deployed even if we can't check for config changes
                if (project.meshState && project.meshState.lastDeployed) {
                    meshStatus = 'deployed';
                    this.logger.info('[Dashboard] Mesh marked as deployed based on meshState.lastDeployed (no componentConfigs)');
                }
            }
            
            // Send updated status to UI
            if (this.panel) {
                this.panel.webview.postMessage({
                    type: 'statusUpdate',
                    payload: {
                        name: project.name,
                        path: project.path,
                        status: project.status || 'ready',
                        port: project.componentInstances?.['citisignal-nextjs']?.port,
                        adobeOrg: project.adobe?.organization,
                        adobeProject: project.adobe?.projectName,
                        frontendConfigChanged,
                        mesh: {
                            status: meshStatus,
                            endpoint: meshEndpoint,
                            message: meshMessage
                        }
                    }
                });
            }
        } catch (error) {
            this.logger.error('[Dashboard] Error in async mesh status check', error as Error);
            
            // Send error status to UI
            if (this.panel) {
                this.panel.webview.postMessage({
                    type: 'statusUpdate',
                    payload: {
                        name: project.name,
                        path: project.path,
                        status: project.status || 'ready',
                        port: project.componentInstances?.['citisignal-nextjs']?.port,
                        adobeOrg: project.adobe?.organization,
                        adobeProject: project.adobe?.projectName,
                        frontendConfigChanged,
                        mesh: {
                            status: 'error',
                            message: 'Failed to check deployment status'
                        }
                    }
                });
            }
        }
    }

    /**
     * Send quick demo status update without re-checking mesh
     * Used after start/stop demo to avoid unnecessary "checking" state
     */
    private async sendDemoStatusUpdate(): Promise<void> {
        if (!this.panel) return;

        const project = await this.stateManager.getCurrentProject();
        if (!project) return;

        // Quick check of frontend config changes (no async operations)
        const frontendConfigChanged = project.status === 'running' ? detectFrontendChanges(project) : false;
        
        // Get mesh component and derive status from current state (no re-check)
        const meshComponent = project.componentInstances?.['commerce-mesh'];
        let meshStatus: any = undefined;
        
        if (meshComponent) {
            // Use component status for transient states
            if (meshComponent.status === 'deploying') {
                meshStatus = { status: 'deploying', message: 'Deploying...' };
            } else if (meshComponent.status === 'error') {
                meshStatus = { status: 'error', message: 'Deployment error' };
            } else if (project.meshState && Object.keys(project.meshState.envVars || {}).length > 0) {
                // Has mesh state - determine if config changed
                if (project.componentConfigs) {
                    const meshChanges = await detectMeshChanges(project, project.componentConfigs);
                    meshStatus = {
                        status: meshChanges.hasChanges ? 'config-changed' : 'deployed',
                        endpoint: meshComponent.endpoint
                    };
                } else {
                    meshStatus = { status: 'deployed', endpoint: meshComponent.endpoint };
                }
            } else {
                // No mesh state - not deployed
                meshStatus = { status: 'not-deployed' };
            }
        }
        
        // Send lightweight status update
        this.panel.webview.postMessage({
            type: 'statusUpdate',
            payload: {
                name: project.name,
                path: project.path,
                status: project.status || 'ready',
                port: project.componentInstances?.['citisignal-nextjs']?.port,
                adobeOrg: project.adobe?.organization,
                adobeProject: project.adobe?.projectName,
                frontendConfigChanged,
                mesh: meshStatus
            }
        });
    }

    /**
     * Send current project status to the webview
     */
    private async sendProjectStatus(): Promise<void> {
        if (!this.panel) return;

        const project = await this.stateManager.getCurrentProject();
        if (!project) return;

        // DEBUG: Log project structure
        this.logger.info('[Project Dashboard] Project data:', {
            hasComponentInstances: !!project.componentInstances,
            componentKeys: Object.keys(project.componentInstances || {}),
            hasMeshState: !!project.meshState,
            meshState: project.meshState
        });

        // Get mesh component for status
        const meshComponent = project.componentInstances?.['commerce-mesh'];
        
        this.logger.info('[Project Dashboard] Mesh component data:', {
            hasMeshComponent: !!meshComponent,
            meshStatus: meshComponent?.status,
            meshEndpoint: meshComponent?.endpoint,
            meshPath: meshComponent?.path,
            hasComponentConfigs: !!project.componentConfigs
        });

        // Send initial status immediately with mesh as 'checking' if mesh component exists
        const frontendConfigChanged = project.status === 'running' ? detectFrontendChanges(project) : false;
        
        if (meshComponent && meshComponent.status !== 'deploying' && meshComponent.status !== 'error') {
            // Send initial status with 'checking' for mesh
            this.panel.webview.postMessage({
                type: 'statusUpdate',
                payload: {
                    name: project.name,
                    path: project.path,
                    status: project.status || 'ready',
                    port: project.componentInstances?.['citisignal-nextjs']?.port,
                    adobeOrg: project.adobe?.organization,
                    adobeProject: project.adobe?.projectName,
                    frontendConfigChanged,
                    mesh: {
                        status: 'checking',
                        message: 'Verifying deployment status...'
                    }
                }
            });
            
            // Check mesh status asynchronously and update when complete
            this.checkMeshStatusAsync(project, meshComponent, frontendConfigChanged).catch(err => {
                this.logger.error('[Dashboard] Failed to check mesh status', err as Error);
            });
            return;
        }

        // For other cases (deploying, error, no mesh), continue with synchronous check
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
            else {
                // Check mesh deployment status via detectMeshChanges
                // This will fetch deployed config from Adobe I/O if meshState is missing
                if (project.componentConfigs) {
                    this.logger.debug('[Dashboard] Checking mesh deployment status...');
                    
                    // Pre-check: Verify auth before fetching (prevents browser popup)
                    const { AdobeAuthManager } = await import('../utils/adobeAuthManager');
                    const { getExternalCommandManager } = await import('../extension');
                    const authManager = new AdobeAuthManager(
                        this.context.extensionPath,
                        this.logger,
                        getExternalCommandManager()
                    );
                    
                    const isAuthenticated = await authManager.isAuthenticated();
                    
                    if (!isAuthenticated) {
                        this.logger.debug('[Dashboard] Not authenticated, skipping mesh status fetch');
                        meshStatus = 'not-deployed';
                        // Don't set meshEndpoint - leave undefined
                    } else {
                        // Initialize meshState if it doesn't exist
                        if (!project.meshState) {
                            this.logger.debug('[Dashboard] No meshState found, initializing empty state');
                            project.meshState = {
                                envVars: {},
                                sourceHash: null,
                                lastDeployed: '' // Empty string, not null (Project type expects string)
                            };
                        }
                        
                        const meshChanges = await detectMeshChanges(project, project.componentConfigs);
                        
                        // If we fetched and populated deployed config, save the project
                        if (meshChanges.shouldSaveProject) {
                            this.logger.debug('[Dashboard] Populated meshState.envVars from deployed config, saving project');
                            await this.stateManager.saveProject(project);
                            meshStatus = 'deployed';
                        }
                        
                        // Check if we have a valid meshState now (deployed if lastDeployed is set)
                        if (project.meshState && project.meshState.lastDeployed) {
                            meshStatus = 'deployed';
                            
                            if (meshChanges.hasChanges) {
                                meshStatus = 'config-changed';
                                
                                // Log if this is due to unknown deployed state
                                if (meshChanges.unknownDeployedState) {
                                    this.logger.debug('[Dashboard] Mesh flagged as changed due to unknown deployed state (could not fetch from Adobe I/O)');
                                }
                            }
                            
                            // Periodically verify mesh still exists in Adobe I/O (async, non-blocking)
                            // This catches cases where mesh was deleted externally
                            this.verifyMeshDeployment(project).catch(err => {
                                this.logger.debug('[Project Dashboard] Background mesh verification failed', err);
                            });
                        } else if (meshChanges.unknownDeployedState) {
                            // Could not fetch deployed config - show as not deployed
                            meshStatus = 'not-deployed';
                            this.logger.debug('[Dashboard] Could not verify mesh deployment status');
                        }
                    }
                } else {
                    this.logger.debug('[Dashboard] No component configs available for mesh status check');
                    // If meshState exists with lastDeployed, the mesh is deployed even if we can't check for config changes
                    if (project.meshState && project.meshState.lastDeployed) {
                        meshStatus = 'deployed';
                        this.logger.info('[Dashboard] Mesh marked as deployed based on meshState.lastDeployed (no componentConfigs)');
                    }
                }
            }
        }

        // Build status data for synchronous path (deploying, error, no mesh)
        const statusData = {
            name: project.name,
            path: project.path,
            status: project.status || 'ready',
            port: project.componentInstances?.['citisignal-nextjs']?.port,
            adobeOrg: project.adobe?.organization,
            adobeProject: project.adobe?.projectName,
            frontendConfigChanged, // Already calculated above for both async and sync paths
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

    /**
     * Handle re-authentication request from dashboard
     * Triggers browser authentication flow and auto-selects project's organization
     */
    private async handleReAuthentication(): Promise<void> {
        try {
            const project = await this.stateManager.getCurrentProject();
            if (!project) {
                this.logger.error('[Dashboard] No current project for re-authentication');
                return;
            }
            
            // Update UI to 'authenticating' state
            this.panel?.webview.postMessage({
                type: 'meshStatusUpdate',
                payload: { 
                    status: 'authenticating', 
                    message: 'Opening browser for authentication...' 
                }
            });
            
            this.logger.info('[Dashboard] Starting re-authentication flow');
            
            const { AdobeAuthManager } = await import('../utils/adobeAuthManager');
            const { getExternalCommandManager } = await import('../extension');
            const authManager = new AdobeAuthManager(
                this.context.extensionPath,
                this.logger,
                getExternalCommandManager()
            );
            
            // Trigger browser auth (reuses wizard pattern)
            await authManager.login();
            
            this.logger.info('[Dashboard] Browser authentication completed');
            
            // Auto-select project's organization if available
            if (project.adobe?.organization) {
                this.logger.info(`[Dashboard] Auto-selecting project org: ${project.adobe.organization}`);
                
                try {
                    await authManager.selectOrganization(project.adobe.organization);
                    this.logger.info('[Dashboard] Organization selected successfully');
                } catch (orgError) {
                    this.logger.warn('[Dashboard] Could not select project organization', orgError as Error);
                    // Continue - user might have lost access, but auth succeeded
                }
            }
            
            // Re-check mesh status with fresh authentication
            this.logger.info('[Dashboard] Re-checking mesh status after authentication');
            await this.sendProjectStatus();
            
        } catch (error) {
            this.logger.error('[Dashboard] Re-authentication failed', error as Error);
            
            // Send error status to UI
            this.panel?.webview.postMessage({
                type: 'meshStatusUpdate',
                payload: { 
                    status: 'error', 
                    message: 'Authentication failed. Please try again.' 
                }
            });
        }
    }

    /**
     * Initialize file hashes for a running demo
     * Collects all .env files from component instances and initializes their hashes for change detection
     */
    private async initializeFileHashesForRunningDemo(project: Project): Promise<void> {
        const envFiles: string[] = [];
        
        this.logger.debug('[Project Dashboard] Initializing file hashes for running demo');
        
        // Collect .env files from all component instances
        if (project.componentInstances) {
            for (const [componentKey, componentInstance] of Object.entries(project.componentInstances)) {
                if (componentInstance.path) {
                    const componentPath = componentInstance.path;
                    const envPath = path.join(componentPath, '.env');
                    const envLocalPath = path.join(componentPath, '.env.local');
                    
                    // Check if files exist
                    const fs = require('fs').promises;
                    try {
                        await fs.access(envPath);
                        envFiles.push(envPath);
                    } catch {}
                    
                    try {
                        await fs.access(envLocalPath);
                        envFiles.push(envLocalPath);
                    } catch {}
                }
            }
        }
        
        if (envFiles.length > 0) {
            this.logger.debug(`[Project Dashboard] Initializing file hashes for ${envFiles.length} .env files`);
            await vscode.commands.executeCommand('demoBuilder._internal.initializeFileHashes', envFiles);
        }
    }
}



