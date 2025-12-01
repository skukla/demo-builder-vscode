/**
 * Sidebar WebviewViewProvider
 *
 * Implements the VS Code WebviewViewProvider interface for the sidebar.
 * Renders contextual navigation based on current screen.
 */

import * as crypto from 'crypto';
import * as vscode from 'vscode';
import type { StateManager } from '@/core/state/stateManager';
import type { Logger } from '@/core/logging/logger';
import type { SidebarContext } from '../types';

/**
 * SidebarProvider - WebviewViewProvider for the Demo Builder sidebar
 *
 * Provides contextual navigation:
 * - Projects: Shows projects list navigation
 * - Project Detail: Shows project-specific navigation (Overview, Configure, Updates)
 * - Wizard: Shows wizard step progress
 */
export class SidebarProvider implements vscode.WebviewViewProvider {
    /** The view ID registered in package.json */
    public readonly viewId = 'demoBuilder.sidebar';

    private view?: vscode.WebviewView;
    private extensionUri: vscode.Uri;

    // Local context state (for wizard tracking)
    private wizardContext?: { step: number; total: number };

    constructor(
        private context: vscode.ExtensionContext,
        private stateManager: StateManager,
        private logger: Logger
    ) {
        this.extensionUri = context.extensionUri;
    }

    /**
     * Called when the sidebar view needs to be resolved
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.view = webviewView;

        // Configure webview options
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview'),
                vscode.Uri.joinPath(this.extensionUri, 'media'),
            ],
        };

        // Set HTML content
        webviewView.webview.html = this.getHtmlContent(webviewView.webview);

        // Set up message handling
        const messageListener = webviewView.webview.onDidReceiveMessage(
            (message) => this.handleMessage(message)
        );

        // Clean up on dispose
        webviewView.onDidDispose(() => {
            messageListener.dispose();
            this.view = undefined;
            this.logger.debug('Sidebar view disposed');
        });

        this.logger.debug('Sidebar view resolved');
    }

    /**
     * Send a message to the webview
     */
    public async sendMessage(type: string, data?: unknown): Promise<void> {
        if (!this.view) {
            this.logger.warn(`Cannot send message '${type}' - sidebar not available`);
            return;
        }

        await this.view.webview.postMessage({ type, data });
    }

    /**
     * Update the sidebar context
     * Call this from wizard or other commands to update the sidebar
     */
    public async updateContext(context: SidebarContext): Promise<void> {
        // Store wizard context locally
        if (context.type === 'wizard') {
            this.wizardContext = { step: context.step, total: context.total };
        } else {
            this.wizardContext = undefined;
        }

        await this.sendMessage('contextUpdate', { context });
    }

    /**
     * Clear wizard context (call when wizard closes)
     */
    public clearWizardContext(): void {
        this.wizardContext = undefined;
    }

    /**
     * Handle messages from the webview
     */
    private async handleMessage(message: { type: string; payload?: unknown }): Promise<void> {
        this.logger.info(`Sidebar message: ${message.type}`);

        switch (message.type) {
            case 'getContext':
                await this.handleGetContext();
                break;

            case 'navigate':
                await this.handleNavigate(message.payload as { target: string } | undefined);
                break;

            case 'back':
                await this.handleBack();
                break;

            case 'createProject':
                await this.handleCreateProject();
                break;

            case 'openDocs':
                await this.handleOpenDocs();
                break;

            case 'openHelp':
                await this.handleOpenHelp();
                break;

            case 'openSettings':
                await this.handleOpenSettings();
                break;

            default:
                this.logger.warn(`Unknown sidebar message: ${message.type}`);
        }
    }

    /**
     * Handle getContext request
     */
    private async handleGetContext(): Promise<void> {
        const context = await this.getCurrentContext();
        await this.sendMessage('contextResponse', { context });
    }

    /**
     * Get current sidebar context based on state
     */
    private async getCurrentContext(): Promise<SidebarContext> {
        // Check for wizard state (stored locally)
        if (this.wizardContext) {
            return {
                type: 'wizard',
                step: this.wizardContext.step,
                total: this.wizardContext.total,
            };
        }

        // Check for current project
        const currentProject = await this.stateManager.getCurrentProject();
        if (currentProject) {
            return {
                type: 'project',
                project: currentProject,
            };
        }

        // Default to projects list
        return { type: 'projects' };
    }

    /**
     * Handle navigation request
     */
    private async handleNavigate(payload?: { target: string }): Promise<void> {
        if (!payload?.target) {
            this.logger.warn('Navigation target not provided');
            return;
        }

        this.logger.info(`Sidebar navigate to: ${payload.target}`);

        try {
            await vscode.commands.executeCommand('demoBuilder.navigate', {
                target: payload.target,
            });
        } catch (error) {
            this.logger.error(
                'Navigation failed',
                error instanceof Error ? error : undefined
            );
        }
    }

    /**
     * Handle back navigation
     */
    private async handleBack(): Promise<void> {
        this.logger.info('Sidebar back navigation');

        try {
            await vscode.commands.executeCommand('demoBuilder.navigateBack');
        } catch (error) {
            this.logger.error(
                'Back navigation failed',
                error instanceof Error ? error : undefined
            );
        }
    }

    /**
     * Handle create project request
     */
    private async handleCreateProject(): Promise<void> {
        this.logger.info('Sidebar: Create new project');

        try {
            await vscode.commands.executeCommand('demoBuilder.createProject');
        } catch (error) {
            this.logger.error(
                'Create project failed',
                error instanceof Error ? error : undefined
            );
        }
    }

    /**
     * Handle open documentation request
     */
    private async handleOpenDocs(): Promise<void> {
        this.logger.info('Sidebar: Open documentation');

        try {
            // Open documentation URL in browser
            const docsUrl = 'https://github.com/skukla/demo-builder-vscode#readme';
            await vscode.env.openExternal(vscode.Uri.parse(docsUrl));
        } catch (error) {
            this.logger.error(
                'Open docs failed',
                error instanceof Error ? error : undefined
            );
        }
    }

    /**
     * Handle open help request
     */
    private async handleOpenHelp(): Promise<void> {
        this.logger.info('Sidebar: Open help');

        try {
            // Open GitHub issues page for help
            const helpUrl = 'https://github.com/skukla/demo-builder-vscode/issues';
            await vscode.env.openExternal(vscode.Uri.parse(helpUrl));
        } catch (error) {
            this.logger.error(
                'Open help failed',
                error instanceof Error ? error : undefined
            );
        }
    }

    /**
     * Handle open settings request
     */
    private async handleOpenSettings(): Promise<void> {
        this.logger.info('Sidebar: Open settings');

        try {
            // Open VS Code settings filtered to Demo Builder
            await vscode.commands.executeCommand('workbench.action.openSettings', 'demoBuilder');
        } catch (error) {
            this.logger.error(
                'Open settings failed',
                error instanceof Error ? error : undefined
            );
        }
    }

    /**
     * Generate HTML content for the webview
     * Uses the 4-bundle pattern for webpack code splitting
     * Includes inline spinner that shows until React mounts
     */
    private getHtmlContent(webview: vscode.Webview): string {
        // Build URIs for all 4 bundles (webpack code splitting)
        const webviewDir = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
        const runtimeUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'runtime-bundle.js'));
        const vendorsUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'vendors-bundle.js'));
        const commonUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'common-bundle.js'));
        const featureUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'sidebar-bundle.js'));

        // Generate nonce for CSP
        const nonce = this.getNonce();
        const cspSource = webview.cspSource;

        // Custom HTML with inline spinner that shows until React mounts
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="
        default-src 'none';
        style-src ${cspSource} 'unsafe-inline';
        script-src 'nonce-${nonce}' ${cspSource};
        img-src https: data:;
        font-src ${cspSource};
    ">
    <title>Demo Builder</title>
    <style>
        /* Inline spinner styles - replaced when React mounts */
        .initial-spinner {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
        }
        .spinner {
            width: 24px;
            height: 24px;
            border: 2px solid var(--vscode-foreground, #ccc);
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            opacity: 0.6;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body style="margin: 0;">
    <div id="root">
        <div class="initial-spinner">
            <div class="spinner"></div>
        </div>
    </div>
    <script nonce="${nonce}" src="${runtimeUri}"></script>
    <script nonce="${nonce}" src="${vendorsUri}"></script>
    <script nonce="${nonce}" src="${commonUri}"></script>
    <script nonce="${nonce}" src="${featureUri}"></script>
</body>
</html>`;
    }

    /**
     * Generate a nonce for CSP
     * Uses cryptographically secure random bytes to prevent CSP bypass attacks
     */
    private getNonce(): string {
        return crypto.randomBytes(16).toString('base64');
    }
}
