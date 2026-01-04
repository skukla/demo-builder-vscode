/**
 * Sidebar WebviewViewProvider
 *
 * Implements the VS Code WebviewViewProvider interface for the sidebar.
 * Renders contextual navigation based on current screen.
 */

import * as crypto from 'crypto';
import * as vscode from 'vscode';
import type { SidebarContext } from '../types';
import { BaseWebviewCommand } from '@/core/base';
import type { StateManager } from '@/core/state/stateManager';
import type { Logger } from '@/types/logger';

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
    // Stores the full wizard context including steps array
    private wizardContext?: { step: number; total: number; completedSteps?: number[]; steps?: { id: string; label: string }[]; isEditMode?: boolean };

    // Track when we're showing the Projects List (vs Project Dashboard)
    private showingProjectsList = false;

    // Track if we've already triggered the initial update check
    private hasCheckedForUpdates = false;

    constructor(
        private context: vscode.ExtensionContext,
        private stateManager: StateManager,
        private logger: Logger,
    ) {
        this.extensionUri = context.extensionUri;
    }

    /**
     * Called when the sidebar view needs to be resolved
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
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
            (message) => this.handleMessage(message),
        );

        // Clean up on dispose
        webviewView.onDidDispose(() => {
            messageListener.dispose();
            this.view = undefined;
            this.logger.debug('Sidebar view disposed');
        });

        // When sidebar is revealed (user clicks extension icon), auto-open the main dashboard
        // Only if not in wizard mode and no webview panels are currently open
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible && !this.wizardContext && !this.hasOpenWebview()) {
                this.openMainDashboard();
            }
        });

        // Also open on initial resolve (first time sidebar is shown)
        // Skip if a webview panel is already open
        if (!this.wizardContext && !this.hasOpenWebview()) {
            this.openMainDashboard();
        }

        // Trigger update check on first sidebar activation (if enabled)
        // This defers update checking until the user actually opens the extension
        if (!this.hasCheckedForUpdates) {
            this.hasCheckedForUpdates = true;
            this.triggerUpdateCheck();
        }

        this.logger.debug('Sidebar view resolved');
    }

    /**
     * Check if any webview panel is currently open
     */
    private hasOpenWebview(): boolean {
        return BaseWebviewCommand.getActivePanelCount() > 0;
    }

    /**
     * Trigger update check if auto-update is enabled
     * Called once when sidebar is first activated
     */
    private triggerUpdateCheck(): void {
        const autoUpdateEnabled = vscode.workspace
            .getConfiguration('demoBuilder')
            .get<boolean>('autoUpdate', true);

        if (autoUpdateEnabled) {
            // Run in background, don't block sidebar activation
            vscode.commands.executeCommand('demoBuilder.checkForUpdates').then(
                () => {
                    // Success - no action needed
                },
                (err: Error) => {
                    this.logger.debug('[Updates] Background check failed:', err);
                },
            );
        }
    }

    /**
     * Open the Projects List as the home screen
     * Always opens Projects List regardless of whether a project is loaded
     */
    private async openMainDashboard(): Promise<void> {
        try {
            await vscode.commands.executeCommand('demoBuilder.showProjectsList');
        } catch (error) {
            this.logger.error(
                'Failed to open projects list',
                error instanceof Error ? error : undefined,
            );
        }
    }

    /**
     * Send a message to the webview
     */
    public async sendMessage(type: string, data?: unknown): Promise<void> {
        if (!this.view) {
            this.logger.warn(`Cannot send message '${type}' - sidebar not available`);
            return;
        }

        try {
            await this.view.webview.postMessage({ type, data });
        } catch {
            // Webview may be disposed during cleanup - this is expected
            this.logger.debug(`Cannot send message '${type}' - webview may be disposed`);
        }
    }

    /**
     * Update the sidebar context
     * Call this from wizard or other commands to update the sidebar
     */
    public async updateContext(context: SidebarContext): Promise<void> {
        // Store wizard context locally (including steps array for getContext requests)
        if (context.type === 'wizard') {
            this.wizardContext = {
                step: context.step,
                total: context.total,
                completedSteps: context.completedSteps,
                steps: context.steps,
            };
        } else {
            this.wizardContext = undefined;
        }

        await this.sendMessage('contextUpdate', { context });
    }

    /**
     * Clear wizard context (call when wizard closes)
     * Sends updated context to webview to refresh the sidebar view
     */
    public async clearWizardContext(): Promise<void> {
        this.logger.info('Clearing wizard context from sidebar');
        this.wizardContext = undefined;

        // Get the new context (will be 'projects' or 'project' based on state)
        const newContext = await this.getCurrentContext();
        this.logger.info(`New sidebar context: ${newContext.type}`);
        await this.sendMessage('contextUpdate', { context: newContext });
    }

    /**
     * Set Projects List state and update sidebar context
     * Call this when showing/hiding the Projects List
     */
    public async setShowingProjectsList(showing: boolean): Promise<void> {
        this.logger.info(`Setting showingProjectsList: ${showing}`);
        this.showingProjectsList = showing;

        // Update sidebar context
        const newContext = await this.getCurrentContext();
        await this.sendMessage('contextUpdate', { context: newContext });
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

            case 'startDemo':
                await this.handleStartDemo();
                break;

            case 'stopDemo':
                await this.handleStopDemo();
                break;

            case 'openDashboard':
                await this.handleOpenDashboard();
                break;

            case 'openConfigure':
                await this.handleOpenConfigure();
                break;

            case 'checkUpdates':
                await this.handleCheckUpdates();
                break;

            case 'wizardStepClick':
                await this.handleWizardStepClick(message.payload as { stepIndex: number } | undefined);
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
                completedSteps: this.wizardContext.completedSteps,
                steps: this.wizardContext.steps,
                isEditMode: this.wizardContext.isEditMode,
            };
        }

        // Check for current project
        const currentProject = await this.stateManager.getCurrentProject();

        // If showing projects list, return that context
        if (this.showingProjectsList) {
            return { type: 'projectsList' };
        }

        // If project is loaded, show project context
        if (currentProject) {
            return {
                type: 'project',
                project: currentProject,
            };
        }

        // Default to projects list (no project loaded)
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
                error instanceof Error ? error : undefined,
            );
        }
    }

    /**
     * Handle back navigation
     * Context-aware: closes wizard when in wizard context, otherwise navigates back
     */
    private async handleBack(): Promise<void> {
        this.logger.info('Sidebar back navigation');

        try {
            // If in wizard context, close the active editor (wizard panel)
            if (this.wizardContext) {
                // Close the active editor which will trigger the wizard's dispose()
                // The dispose() method will call clearWizardContext() to update sidebar
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            } else {
                // For other contexts, navigate back (future implementation)
                this.logger.debug('Back navigation: no wizard context, no-op for now');
            }
        } catch (error) {
            this.logger.error(
                'Back navigation failed',
                error instanceof Error ? error : undefined,
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
                error instanceof Error ? error : undefined,
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
                error instanceof Error ? error : undefined,
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
                error instanceof Error ? error : undefined,
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
                error instanceof Error ? error : undefined,
            );
        }
    }

    /**
     * Handle start demo request
     */
    private async handleStartDemo(): Promise<void> {
        this.logger.info('Sidebar: Start demo');

        try {
            await vscode.commands.executeCommand('demoBuilder.startDemo');
        } catch (error) {
            this.logger.error(
                'Start demo failed',
                error instanceof Error ? error : undefined,
            );
        }
    }

    /**
     * Handle stop demo request
     */
    private async handleStopDemo(): Promise<void> {
        this.logger.info('Sidebar: Stop demo');

        try {
            await vscode.commands.executeCommand('demoBuilder.stopDemo');
        } catch (error) {
            this.logger.error(
                'Stop demo failed',
                error instanceof Error ? error : undefined,
            );
        }
    }

    /**
     * Handle open dashboard request
     */
    private async handleOpenDashboard(): Promise<void> {
        this.logger.info('Sidebar: Open dashboard');

        try {
            await vscode.commands.executeCommand('demoBuilder.showProjectDashboard');
        } catch (error) {
            this.logger.error(
                'Open dashboard failed',
                error instanceof Error ? error : undefined,
            );
        }
    }

    /**
     * Handle open configure request
     */
    private async handleOpenConfigure(): Promise<void> {
        this.logger.info('Sidebar: Open configure');

        try {
            await vscode.commands.executeCommand('demoBuilder.configure');
        } catch (error) {
            this.logger.error(
                'Open configure failed',
                error instanceof Error ? error : undefined,
            );
        }
    }

    /**
     * Handle check updates request
     */
    private async handleCheckUpdates(): Promise<void> {
        this.logger.info('Sidebar: Check updates');

        try {
            await vscode.commands.executeCommand('demoBuilder.checkUpdates');
        } catch (error) {
            this.logger.error(
                'Check updates failed',
                error instanceof Error ? error : undefined,
            );
        }
    }

    /**
     * Handle wizard step click (for back navigation)
     */
    private async handleWizardStepClick(payload?: { stepIndex: number }): Promise<void> {
        if (payload?.stepIndex === undefined) {
            this.logger.warn('Wizard step click: stepIndex not provided');
            return;
        }

        this.logger.info(`Sidebar: Navigate wizard to step ${payload.stepIndex}`);

        try {
            await vscode.commands.executeCommand('demoBuilder.internal.wizardNavigate', payload.stepIndex);
        } catch (error) {
            this.logger.error(
                'Wizard navigation failed',
                error instanceof Error ? error : undefined,
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
        /* Immediate background colors - prevents flash before CSS loads
         * Uses --spectrum-global-color-gray-75 which is defined by React Spectrum
         * and matches the wizard header/footer background (#0e0e0e in dark mode) */
        html, body, #root, .sidebar-provider {
            background: var(--spectrum-global-color-gray-75) !important;
            margin: 0;
            padding: 0;
            height: 100%;
        }
        /* Inline spinner styles - shows until React mounts */
        .initial-spinner {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background: var(--spectrum-global-color-gray-75);
        }
        .spinner {
            width: 24px;
            height: 24px;
            border: 2px solid var(--spectrum-global-color-gray-400);
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
<body class="vscode-dark spectrum--dark">
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
