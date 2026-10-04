/**
 * Sidebar WebviewViewProvider
 *
 * Implements the VS Code WebviewViewProvider interface for the sidebar.
 * Renders contextual navigation based on current screen.
 */

import * as crypto from 'crypto';
import * as vscode from 'vscode';
import type { SidebarContext } from '../types';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import {
    createWebviewCommunication,
    WebviewCommunicationManager,
} from '@/core/communication/webviewCommunicationManager';
import { LAST_UPDATE_CHECK } from '@/core/constants';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { toggleLogsPanel } from '@/features/lifecycle/services/lifecycleService';
import type { Logger } from '@/types/logger';
import type { StateManager } from '@/types/state';

/**
 * Minimum gap between automatic update checks fired from sidebar activation.
 * Workspace reloads happen frequently (every project switch); without a
 * persistent throttle the auto-check runs on every reload. One hour balances
 * "fresh-enough updates within a session" against "no spam on every reload."
 * The palette command bypasses this throttle.
 */
const UPDATE_CHECK_THROTTLE_MS = 60 * 60 * 1000;

/**
 * The message types the sidebar webview sends.
 *
 * This list and `handleMessage`'s switch must agree: a type here with no case
 * warns as unknown, and a case missing from here is never delivered at all.
 */
const SIDEBAR_MESSAGE_TYPES = [
    'getContext',
    'navigate',
    'back',
    'createProject',
    'openTools',
    'openHelp',
    'openSettings',
    'openLogs',
    'openAiChat',
    'showPrompts',
    'newAiChat',
    'pickAiChat',
    'startDemo',
    'stopDemo',
    'openDashboard',
    'openConfigure',
    'checkUpdates',
] as const;

/** A sidebar button whose whole job is to run one VS Code command. */
interface CommandButton {
    /** Names the action in the log line and the failure line. */
    label: string;
    command: string;
    argument?: string;
}

/**
 * The buttons that only forward to a command, keyed by message type. One
 * forwarder runs them all, so each logs and swallows a failure the same way.
 *
 * `openAiChat` resumes; `newAiChat` starts fresh — the only path onto the current
 * generated `AGENTS.md`; `pickAiChat` opens Claude Code's picker of earlier chats.
 */
const COMMAND_BUTTONS = new Map<string, CommandButton>(Object.entries({
    createProject: { label: 'Create project', command: 'demoBuilder.createProject' },
    openTools: {
        label: 'Open tools',
        command: 'workbench.action.quickOpen',
        argument: '>Demo Builder: ',
    },
    openSettings: {
        label: 'Open settings',
        command: 'workbench.action.openSettings',
        argument: 'demoBuilder',
    },
    openAiChat: { label: 'Open AI chat', command: 'demoBuilder.openAiExperience' },
    showPrompts: { label: 'Show prompts', command: 'demoBuilder.showPromptsPicker' },
    newAiChat: { label: 'New AI chat', command: 'demoBuilder.newAiChat' },
    pickAiChat: { label: 'Pick an earlier AI chat', command: 'demoBuilder.pickAiChat' },
    startDemo: { label: 'Start demo', command: 'demoBuilder.startDemo' },
    stopDemo: { label: 'Stop demo', command: 'demoBuilder.stopDemo' },
    openDashboard: { label: 'Open dashboard', command: 'demoBuilder.showProjectDashboard' },
    openConfigure: { label: 'Open configure', command: 'demoBuilder.configure' },
    checkUpdates: { label: 'Check updates', command: 'demoBuilder.checkUpdates' },
}));

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
    private comm?: WebviewCommunicationManager;
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

        // The channel is the SHARED manager, not a hand-rolled listener (ADR-017 §4).
        // It has to be: the webview side is `webviewClient`, which QUEUES every
        // postMessage until it receives `__handshake_complete__`. Nothing else here
        // sends that, so a raw listener leaves the sidebar on its spinner forever.
        //
        // Each type is registered rather than dispatched by a second switch — the
        // manager silently ignores a type it does not know, while `handleMessage`
        // warns, so routing everything through it would log `__webview_ready__` as
        // unknown on every load.
        // The shared FACTORY, not `new` — construction of a stateful class belongs
        // at a boundary (ADR-015), and this is the same call the seven panels make
        // through BaseWebviewCommand.
        let channel: WebviewCommunicationManager | undefined;
        // TIMEOUTS.NORMAL, the same budget BaseWebviewCommand gives the seven
        // panels — not the factory's QUICK default. The sidebar loads an ~890KB
        // bundle on a cold window, and a handshake it misses is not a slow
        // sidebar, it is a permanently empty one until the view is re-resolved.
        void createWebviewCommunication(webviewView, { handshakeTimeout: TIMEOUTS.NORMAL }, (comm) => {
            channel = comm;
            this.comm = comm;
            for (const type of SIDEBAR_MESSAGE_TYPES) {
                comm.on(type, (payload: unknown) => this.handleMessage({ type, payload }));
            }
        }).catch(() => {
            // The factory disposes the manager when the handshake times out, so the
            // reference has to go too or `sendMessage` posts into a dead channel.
            // VS Code re-resolves the view the next time it is revealed.
            if (this.comm === channel) this.comm = undefined;
            this.logger.debug('[Sidebar] webview did not complete the handshake');
        });

        // Clean up on dispose
        webviewView.onDidDispose(() => {
            this.comm?.dispose();
            this.comm = undefined;
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
    public async sendMessage(type: string, payload?: unknown): Promise<void> {
        if (!this.comm) {
            this.logger.warn(`Cannot send message '${type}' - sidebar not available`);
            return;
        }

        try {
            await this.comm.sendMessage(type, payload);
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
        await this.sendMessage('contextUpdate', {
            context,
        });
    }

    /**
     * Set Projects List state and update sidebar context
     * Call this when showing/hiding the Projects List
     */
    public async setShowingProjectsList(showing: boolean): Promise<void> {
        this.showingProjectsList = showing;

        // Update sidebar context
        const newContext = await this.getCurrentContext();
        await this.sendMessage('contextUpdate', {
            context: newContext,
        });
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

            case 'openHelp':
                await this.handleOpenHelp();
                break;

            case 'openLogs':
                await this.handleOpenLogs();
                break;

            default:
                await this.handleCommandButton(message.type);
        }
    }

    /**
     * Handle getContext request
     */
    private async handleGetContext(): Promise<void> {
        const context = await this.getCurrentContext();
        await this.sendMessage('contextResponse', {
            context,
        });
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

        // No-op for now — back navigation in surfaces that need it lives
        // in the webview's own header, not the sidebar.
        this.logger.debug('Back navigation: no-op');
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

    /** Run a forwarding button's command; a failure is logged, never thrown. */
    private async handleCommandButton(type: string): Promise<void> {
        const button = COMMAND_BUTTONS.get(type);
        if (!button) {
            this.logger.warn(`Unknown sidebar message: ${type}`);
            return;
        }
        const { label, command, argument } = button;
        this.logger.info(`Sidebar: ${label}`);
        try {
            const args = argument === undefined ? [] : [argument];
            await vscode.commands.executeCommand(command, ...args);
        } catch (error) {
            this.logger.error(`${label} failed`, error instanceof Error ? error : undefined);
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
