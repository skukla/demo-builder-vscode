/**
 * Sidebar WebviewViewProvider
 *
 * Implements the VS Code WebviewViewProvider interface for the sidebar.
 * Renders contextual navigation based on current screen.
 */

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
     * Generate HTML content for the webview
     */
    private getHtmlContent(webview: vscode.Webview): string {
        // Get URIs for scripts and styles
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'sidebar-bundle.js')
        );

        const codiconsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this.extensionUri,
                'node_modules',
                '@vscode/codicons',
                'dist',
                'codicon.css'
            )
        );

        // Generate nonce for CSP
        const nonce = this.getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="
        default-src 'none';
        style-src ${webview.cspSource} 'unsafe-inline';
        font-src ${webview.cspSource};
        script-src 'nonce-${nonce}';
    ">
    <link href="${codiconsUri}" rel="stylesheet" />
    <title>Demo Builder</title>
    <style>
        html, body {
            margin: 0;
            padding: 0;
            height: 100%;
            overflow: hidden;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
        }
        #root {
            height: 100%;
        }
    </style>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    /**
     * Generate a nonce for CSP
     */
    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
