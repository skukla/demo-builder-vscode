import * as path from 'path';
import * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base';
import { WebviewCommunicationManager } from '@/core/communication';
import { DashboardHandlerRegistry } from '@/features/dashboard/handlers';
import { HandlerContext } from '@/types/handlers';

/**
 * Command to show the "Project Dashboard" after project creation
 * This provides a control panel for demo management and quick actions
 *
 * Refactored in Phase 3.8 to use BaseWebviewCommand pattern with HandlerRegistry.
 */
export class ProjectDashboardWebviewCommand extends BaseWebviewCommand {
    private handlerRegistry: DashboardHandlerRegistry;

    constructor(
        context: vscode.ExtensionContext,
        stateManager: import('@/core/state').StateManager,
        statusBar: import('@/core/vscode/StatusBarManager').StatusBarManager,
        logger: import('@/core/logging').Logger,
    ) {
        super(context, stateManager, statusBar, logger);
        this.handlerRegistry = new DashboardHandlerRegistry();
    }

    // ============================================================================
    // BaseWebviewCommand Implementation
    // ============================================================================

    protected getWebviewId(): string {
        return 'demoBuilder.projectDashboard';
    }

    protected getWebviewTitle(): string {
        return 'Project Dashboard';
    }

    protected async getWebviewContent(): Promise<string> {
        const nonce = this.getNonce();

        // Get bundle URI
        const bundlePath = vscode.Uri.joinPath(
            this.context.extensionUri,
            'dist',
            'webview',
            'projectDashboard-bundle.js',
        );
        const bundleUri = this.panel!.webview.asWebviewUri(bundlePath);

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel!.webview.cspSource} 'unsafe-inline'; font-src ${this.panel!.webview.cspSource}; img-src ${this.panel!.webview.cspSource} https: data:; script-src 'nonce-${nonce}';">
            <title>Project Dashboard</title>
        </head>
        <body>
            <div id="root"></div>
            <script nonce="${nonce}" src="${bundleUri}"></script>
        </body>
        </html>`;
    }

    protected async getInitialData(): Promise<any> {
        const project = await this.stateManager.getCurrentProject();
        const themeKind = vscode.window.activeColorTheme.kind;
        const theme = themeKind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';

        return {
            theme,
            project: project ? {
                name: project.name,
                path: project.path,
            } : null,
        };
    }

    protected getLoadingMessage(): string {
        return 'Loading Project Dashboard...';
    }

    protected shouldReopenWelcomeOnDispose(): boolean {
        return true;
    }

    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        // Auto-register all handlers from DashboardHandlerRegistry
        const messageTypes = this.handlerRegistry.getRegisteredTypes();

        for (const messageType of messageTypes) {
            comm.on(messageType, async (data: unknown) => {
                const context = this.createHandlerContext();
                return await this.handlerRegistry.handle(context, messageType, data);
            });
        }
    }

    // ============================================================================
    // Public API (called by other commands)
    // ============================================================================

    /**
     * Static method to dispose any active Project Dashboard panel
     * Useful for cleanup during reset or navigation
     *
     * NOTE: BaseWebviewCommand already provides singleton management,
     * but we keep this for backward compatibility with external callers.
     */
    public static disposeActivePanel(): void {
        const activePanels = BaseWebviewCommand['activePanels'] as Map<string, vscode.WebviewPanel>;
        const dashboardPanel = activePanels.get('demoBuilder.projectDashboard');
        if (dashboardPanel) {
            dashboardPanel.dispose();
        }
    }

    /**
     * Public method to send mesh status updates (called by deployMesh command)
     */
    public static async sendMeshStatusUpdate(
        status: 'deploying' | 'deployed' | 'config-changed' | 'error' | 'not-deployed',
        message?: string,
        endpoint?: string,
    ): Promise<void> {
        const activePanels = BaseWebviewCommand['activePanels'] as Map<string, vscode.WebviewPanel>;
        const dashboardPanel = activePanels.get('demoBuilder.projectDashboard');
        if (dashboardPanel) {
            await dashboardPanel.webview.postMessage({
                type: 'meshStatusUpdate',
                payload: {
                    status,
                    message,
                    endpoint,
                },
            });
        }
    }

    /**
     * Public method to trigger a full status refresh (called after config changes)
     */
    public static async refreshStatus(): Promise<void> {
        const activeComms = BaseWebviewCommand['activeCommunicationManagers'] as Map<string, WebviewCommunicationManager>;
        const dashboardComm = activeComms.get('demoBuilder.projectDashboard');
        if (dashboardComm) {
            // Trigger requestStatus handler
            await dashboardComm.sendMessage('refresh-status', {});
        }
    }

    // ============================================================================
    // Lifecycle Hooks
    // ============================================================================

    public async execute(): Promise<void> {
        // Check for existing project
        const project = await this.stateManager.getCurrentProject();
        if (!project) {
            this.logger.warn('[Project Dashboard] No project found');
            return;
        }

        this.logger.info(`[Project Dashboard] Showing dashboard for project: ${project.name}`);

        // If demo is already running, initialize file hashes for change detection
        if (project.status === 'running') {
            await this.initializeFileHashesForRunningDemo(project);
        }

        // Create or reveal panel and initialize communication
        await this.createOrRevealPanel();
        if (!this.communicationManager) {
            await this.initializeCommunication();
            this.logger.debug('Dashboard webview initialized with handshake protocol');
        } else {
            this.logger.debug('Dashboard webview already initialized, reusing existing communication');
        }
    }

    // ============================================================================
    // Helper Methods
    // ============================================================================

    /**
     * Create handler context with all dependencies
     */
    private createHandlerContext(): HandlerContext {
        return {
            // Managers (dashboard doesn't use all managers, but context requires them)
            prereqManager: null as any,
            authManager: null as any,
            componentHandler: null as any,
            errorLogger: null as any,
            progressUnifier: null as any,
            stepLogger: null as any,

            // Loggers
            logger: this.logger,
            debugLogger: this.logger,

            // VS Code integration
            context: this.context,
            panel: this.panel,
            stateManager: this.stateManager,
            communicationManager: this.communicationManager,
            sendMessage: (type: string, data?: unknown) => this.sendMessage(type, data),

            // Shared state (dashboard doesn't use shared state)
            sharedState: {} as any,
        };
    }

    /**
     * Initialize file hashes for a running demo
     * Collects all .env files from component instances and initializes their hashes for change detection
     */
    private async initializeFileHashesForRunningDemo(project: any): Promise<void> {
        const envFiles: string[] = [];

        this.logger.debug('[Project Dashboard] Initializing file hashes for running demo');

        // Collect .env files from all component instances
        if (project.componentInstances) {
            for (const componentInstance of Object.values(project.componentInstances)) {
                const instance = componentInstance as any;
                if (instance.path) {
                    const componentPath = instance.path;
                    const envPath = path.join(componentPath, '.env');
                    const envLocalPath = path.join(componentPath, '.env.local');

                    // Check if files exist
                    const fsPromises = (await import('fs')).promises;
                    try {
                        await fsPromises.access(envPath);
                        envFiles.push(envPath);
                    } catch {
                        // File doesn't exist
                    }

                    try {
                        await fsPromises.access(envLocalPath);
                        envFiles.push(envLocalPath);
                    } catch {
                        // File doesn't exist
                    }
                }
            }
        }

        if (envFiles.length > 0) {
            this.logger.debug(`[Project Dashboard] Initializing file hashes for ${envFiles.length} .env files`);
            await vscode.commands.executeCommand('demoBuilder._internal.initializeFileHashes', envFiles);
        }
    }
}
