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
import { LAST_UPDATE_CHECK } from '@/core/constants';
import type { StateManager } from '@/core/state/stateManager';
import { toggleLogsPanel } from '@/features/lifecycle/handlers/lifecycleHandlers';
import type { Logger } from '@/types/logger';

/**
 * Minimum gap between automatic update checks fired from sidebar activation.
 * Workspace reloads happen frequently (every project switch); without a
 * persistent throttle the auto-check runs on every reload. One hour balances
 * "fresh-enough updates within a session" against "no spam on every reload."
 * The palette command bypasses this throttle.
 */
const UPDATE_CHECK_THROTTLE_MS = 60 * 60 * 1000;

/**
 * SidebarProvider - WebviewViewProvider for the Demo Builder sidebar
 *
 * Provides contextual navigation:
 * - Projects: Shows projects list navigation
 * - Project Detail: Shows project-specific navigation (Overview, Configure, Updates)
 */
export class SidebarProvider implements vscode.WebviewViewProvider {
    /** The view ID registered in package.json */
    public readonly viewId = 'demoBuilder.sidebar';

    private view?: vscode.WebviewView;
    private extensionUri: vscode.Uri;


    // Track when we're showing the Projects List (vs Project Dashboard)
    private showingProjectsList = false;

    // Track if we've already triggered the initial update check
    private hasCheckedForUpdates = false;

    constructor(
        private _context: vscode.ExtensionContext,
        private stateManager: StateManager,
        private logger: Logger,
    ) {
        this.extensionUri = _context.extensionUri;
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
        });

        // When sidebar is revealed (user clicks extension icon), auto-open
        // the main dashboard — unless a webview panel is already open.
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible && !this.hasOpenWebview()) {
                this.openMainDashboard();
            }
        });

        // Also open on initial resolve (first time sidebar is shown).
        // Skip if a webview panel is already open.
        if (!this.hasOpenWebview()) {
            this.openMainDashboard();
        }

        // Trigger update check on first sidebar activation (if enabled)
        // This defers update checking until the user actually opens the extension
        if (!this.hasCheckedForUpdates) {
            this.hasCheckedForUpdates = true;
            this.triggerUpdateCheck();
        }
    }

    /**
     * Check if any webview panel is currently open
     */
    private hasOpenWebview(): boolean {
        return BaseWebviewCommand.getActivePanelCount() > 0;
    }

    /**
     * Trigger update check if auto-update is enabled.
     *
     * Throttled across workspace reloads: when switching projects, VS Code
     * reactivates the extension and re-resolves the sidebar, which would
     * re-fire the check on every project switch. A persistent
     * `LAST_UPDATE_CHECK` timestamp in globalState skips the check while
     * the last run is within `UPDATE_CHECK_THROTTLE_MS` (inclusive of the
     * boundary — `<=`). The palette command (`demoBuilder.checkForUpdates`)
     * bypasses this — only the automatic sidebar-activation path is throttled.
     *
     * The timestamp is written eagerly before the network call to prevent
     * concurrent activations from double-checking. If the network call
     * fails, the timestamp is rolled back so the next sidebar activation
     * can retry instead of burning the full throttle window on a transient
     * error.
     */
    private triggerUpdateCheck(): void {
        const autoUpdateEnabled = vscode.workspace
            .getConfiguration('demoBuilder')
            .get<boolean>('autoUpdate', true);

        if (!autoUpdateEnabled) {
            return;
        }

        const now = Date.now();
        const last = this._context.globalState.get<number>(LAST_UPDATE_CHECK) ?? 0;
        if (last > 0 && now - last <= UPDATE_CHECK_THROTTLE_MS) {
            this.logger.debug(
                `[Updates] Skipping auto-check; last ran ${Math.round((now - last) / 1000)}s ago`,
            );
            return;
        }

        // Set the timestamp eagerly so concurrent activations cannot
        // double-check before the network call returns. The catch arm
        // rolls back to the previous value so transient failures don't
        // burn the throttle window.
        const previous = last > 0 ? last : undefined;
        void this._context.globalState.update(LAST_UPDATE_CHECK, now);

        // Run in background, don't block sidebar activation
        vscode.commands.executeCommand('demoBuilder.checkForUpdates').then(
            () => {
                // Success - no action needed
            },
            (err: Error) => {
                this.logger.debug('[Updates] Background check failed:', err);
                // Restore the prior timestamp so the next activation retries.
                void this._context.globalState.update(LAST_UPDATE_CHECK, previous);
            },
        );
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
     * Update the sidebar context.
     * Used by commands that need to push a new context to the sidebar webview
     * (e.g., projects list vs project detail). Wizard mode no longer uses this
     * — the wizard timeline lives inside the wizard webview itself.
     */
    public async updateContext(context: SidebarContext): Promise<void> {
        await this.sendMessage('contextUpdate', { context });
    }

    /**
     * Set Projects List state and update sidebar context
     * Call this when showing/hiding the Projects List
     */
    public async setShowingProjectsList(showing: boolean): Promise<void> {
        this.showingProjectsList = showing;

        // Update sidebar context
        const newContext = await this.getCurrentContext();
        await this.sendMessage('contextUpdate', { context: newContext });
    }

    /**
     * Handle messages from the webview
     */
    private async handleMessage(message: { type: string; payload?: unknown }): Promise<void> {
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

            case 'openTools':
                await this.handleOpenTools();
                break;

            case 'openHelp':
                await this.handleOpenHelp();
                break;

            case 'openSettings':
                await this.handleOpenSettings();
                break;

            case 'openLogs':
                await this.handleOpenLogs();
                break;

            case 'openAiChat':
                await this.handleOpenAiChat();
                break;

            case 'showPrompts':
                await this.handleShowPrompts();
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
     */
    private async handleBack(): Promise<void> {
        this.logger.info('Sidebar back navigation');

        try {
            // No-op for now — back navigation in surfaces that need it lives
            // in the webview's own header, not the sidebar.
            this.logger.debug('Back navigation: no-op');
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
     * Handle open tools request - opens command palette filtered to Demo Builder commands
     */
    private async handleOpenTools(): Promise<void> {
        this.logger.info('Sidebar: Open tools');

        try {
            await vscode.commands.executeCommand('workbench.action.quickOpen', '>Demo Builder: ');
        } catch (error) {
            this.logger.error(
                'Open tools failed',
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
     * Handle open logs request — toggles the logs output panel.
     * Backs the Logs button in the sidebar's UtilityBar. Reuses the shared
     * lifecycle toggle chokepoint so visibility state stays in sync with the
     * dashboard's Logs toggle (open if hidden, close if shown).
     */
    private async handleOpenLogs(): Promise<void> {
        this.logger.info('Sidebar: Toggle logs');

        try {
            await toggleLogsPanel();
        } catch (error) {
            this.logger.error(
                'Toggle logs failed',
                error instanceof Error ? error : undefined,
            );
        }
    }

    /**
     * Handle open AI chat request — opens/focuses the Claude terminal.
     * Backs the Chat button in the sidebar's AiZone.
     */
    private async handleOpenAiChat(): Promise<void> {
        this.logger.info('Sidebar: Open AI chat');

        try {
            await vscode.commands.executeCommand('demoBuilder.openAiExperience');
        } catch (error) {
            this.logger.error(
                'Open AI chat failed',
                error instanceof Error ? error : undefined,
            );
        }
    }

    /**
     * Handle show prompts request — shows the prompt QuickPick.
     * Backs the Prompts button in the sidebar's AiZone.
     */
    private async handleShowPrompts(): Promise<void> {
        this.logger.info('Sidebar: Show prompts');

        try {
            await vscode.commands.executeCommand('demoBuilder.showPromptsPicker');
        } catch (error) {
            this.logger.error(
                'Show prompts failed',
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
     * Generate HTML content for the webview.
     * Loads the single esbuild IIFE bundle; inline spinner shows until React mounts.
     */
    private getHtmlContent(webview: vscode.Webview): string {
        const webviewDir = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
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
<body>
    <div id="root">
        <div class="initial-spinner">
            <div class="spinner"></div>
        </div>
    </div>
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
