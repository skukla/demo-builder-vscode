import * as crypto from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import { BaseCommand } from './baseCommand';
import { WebviewPanelManager } from './webviewPanelManager';
import { WebviewCommunicationManager, createWebviewCommunication } from '@/core/communication';
import { setLoadingState, TIMEOUTS } from '@/core/utils';

/**
 * Base class for commands that use webviews with robust communication
 *
 * Extends BaseCommand with webview-specific capabilities:
 * - Standardized webview creation with singleton pattern (prevents duplicate panels)
 * - Automatic communication manager setup with handshake protocol
 * - Loading state management and error recovery
 * - Automatic resource disposal via inherited DisposableStore (LIFO order)
 * - See handlePanelDisposal() and dispose() for disposal flow details
 *
 * @example Basic Webview Command
 * ```typescript
 * class MyWebviewCommand extends BaseWebviewCommand {
 *     protected getWebviewId() { return 'my-webview'; }
 *     protected getWebviewTitle() { return 'My Webview'; }
 *
 *     protected async getWebviewContent() {
 *         return '<html><body>Content</body></html>';
 *     }
 *
 *     protected initializeMessageHandlers(comm: WebviewCommunicationManager) {
 *         comm.on('action', async (data) => {
 *             return await this.handleAction(data);
 *         });
 *     }
 * }
 * ```
 *
 * @example Custom Resource Disposal
 * ```typescript
 * class MyWebviewCommand extends BaseWebviewCommand {
 *     protected async initializeCommunication() {
 *         await super.initializeCommunication();
 *
 *         // Add custom disposable - automatically cleaned up
 *         const watcher = vscode.workspace.createFileSystemWatcher('**\/*.ts');
 *         this.disposables.add(watcher);
 *
 *         // Add multiple resources - disposed in LIFO order
 *         this.disposables.add(subscription1);
 *         this.disposables.add(subscription2);
 *     }
 * }
 * ```
 */
export abstract class BaseWebviewCommand extends BaseCommand {
    // Instance references to webview panel and communication manager
    protected panel: vscode.WebviewPanel | undefined;
    protected communicationManager: WebviewCommunicationManager | undefined;

    // ========================================================================
    // Static Delegations to WebviewPanelManager
    // These maintain backward compatibility while centralizing panel management
    // ========================================================================

    /**
     * Set callback to be invoked when any webview disposes
     * Used by extension.ts to handle auto-reopen logic centrally
     */
    public static setDisposalCallback(callback: (webviewId: string) => Promise<void>): void {
        WebviewPanelManager.setDisposalCallback(callback);
    }

    /**
     * Start a webview transition (prevents auto-welcome during transition)
     */
    public static async startWebviewTransition(): Promise<void> {
        await WebviewPanelManager.startWebviewTransition();
    }

    /**
     * End a webview transition
     */
    public static endWebviewTransition(): void {
        WebviewPanelManager.endWebviewTransition();
    }

    /**
     * Check if a webview transition is in progress
     */
    public static isWebviewTransitionInProgress(): boolean {
        return WebviewPanelManager.isWebviewTransitionInProgress();
    }

    /**
     * Get count of active webview panels
     * Used to check if any webviews are still open
     */
    public static getActivePanelCount(): number {
        return WebviewPanelManager.getActivePanelCount();
    }

    /**
     * Get a specific active webview panel by ID
     * @param webviewId The webview ID to retrieve
     * @returns The active panel or undefined if not found
     */
    public static getActivePanel(webviewId: string): vscode.WebviewPanel | undefined {
        return WebviewPanelManager.getActivePanel(webviewId);
    }

    /**
     * Override in subclasses to indicate if Welcome should reopen on disposal
     * @returns true if this webview should trigger Welcome reopen when closed
     */
    protected shouldReopenWelcomeOnDispose(): boolean {
        return false; // Default: don't reopen
    }

    /**
     * Check if this webview is currently visible
     */
    public isVisible(): boolean {
        const webviewId = this.getWebviewId();
        const activePanel = WebviewPanelManager.getActivePanel(webviewId);
        try {
            return (activePanel !== undefined && activePanel.visible) ||
                   (this.panel !== undefined && this.panel.visible);
        } catch {
            // Panel was disposed - accessing .visible throws "Webview is disposed"
            return false;
        }
    }

    /**
     * Static method to dispose all active webview panels
     * Useful for cleanup during extension reset
     */
    public static disposeAllActivePanels(): void {
        WebviewPanelManager.disposeAllActivePanels();
    }

    /**
     * Get the webview identifier (used for panel type)
     */
    protected abstract getWebviewId(): string;

    /**
     * Get the webview title
     */
    protected abstract getWebviewTitle(): string;

    /**
     * Get the webview content HTML
     */
    protected abstract getWebviewContent(): Promise<string>;

    /**
     * Initialize message handlers for the communication manager
     */
    protected abstract initializeMessageHandlers(comm: WebviewCommunicationManager): void;

    /**
     * Get initial data to send to webview after handshake
     */
    protected abstract getInitialData(): Promise<unknown>;

    /**
     * Get the loading message to display while initializing
     */
    protected abstract getLoadingMessage(): string;

    /**
     * Create or reveal the webview panel (singleton per webview type)
     */
    protected async createOrRevealPanel(): Promise<vscode.WebviewPanel> {
        const webviewId = this.getWebviewId();

        // Reset disposable store if previously disposed (singleton reuse pattern)
        // This ensures new listeners can be registered after a previous dispose
        if (this.disposables.disposed) {
            this.disposables.reset();
        }

        // Check if this webview type already has an active panel
        // Important: Check panel first regardless of comm manager state
        // to prevent orphaning panels when only one reference exists
        const existingPanel = WebviewPanelManager.getActivePanel(webviewId);

        if (existingPanel) {
            try {
                existingPanel.reveal();
                this.panel = existingPanel;
                // Reuse existing comm manager if available
                const existingCommManager = WebviewPanelManager.getActiveCommunicationManager(webviewId);
                if (existingCommManager) {
                    this.communicationManager = existingCommManager;
                }
                return existingPanel;
            } catch {
                // Panel was disposed - clean up stale references and create new one
                WebviewPanelManager.unregisterPanel(webviewId);
                WebviewPanelManager.unregisterCommunicationManager(webviewId);
            }
        }

        // Create new panel
        this.panel = vscode.window.createWebviewPanel(
            webviewId,
            this.getWebviewTitle(),
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'dist', 'webview')),
                    vscode.Uri.file(path.join(this.context.extensionPath, 'dist', 'media')),
                    vscode.Uri.file(path.join(this.context.extensionPath, 'media')),
                ],
            },
        );

        // Register in singleton map
        WebviewPanelManager.registerPanel(webviewId, this.panel);

        // Set up disposal handling - call dispose() to ensure full cleanup
        const panelDisposalListener = this.panel.onDidDispose(() => {
            this.dispose();
        });
        this.disposables.add(panelDisposalListener);

        return this.panel;
    }

    /**
     * Initialize communication with the webview
     */
    protected async initializeCommunication(): Promise<WebviewCommunicationManager> {
        if (!this.panel) {
            throw new Error('Panel must be created before initializing communication');
        }

        // GUARD: Dispose any existing communication manager to prevent duplicate listeners
        // This can happen if the panel was revealed but comm manager was somehow orphaned
        if (this.communicationManager) {
            this.logger.warn(`[BaseWebviewCommand] Disposing orphaned comm manager before creating new one`);
            this.communicationManager.dispose();
            this.communicationManager = undefined;
        }

        // Set loading state while initializing
        await setLoadingState(
            this.panel,
            () => this.getWebviewContent(),
            this.getLoadingMessage(),
            this.logger,
        );

        // Create communication manager
        // SOP §1: Using TIMEOUTS constants instead of magic numbers
        this.communicationManager = await createWebviewCommunication(this.panel, {
            enableLogging: true,
            handshakeTimeout: TIMEOUTS.NORMAL,
            messageTimeout: TIMEOUTS.NORMAL,
            maxRetries: 3,
        });

        // Register in singleton map
        const webviewId = this.getWebviewId();
        WebviewPanelManager.registerCommunicationManager(webviewId, this.communicationManager);

        // Set up message handlers
        this.initializeMessageHandlers(this.communicationManager);

        // Set up standard handlers
        this.setupStandardHandlers();

        // Send initial data
        const initialData = await this.getInitialData();
        await this.communicationManager.sendMessage('init', initialData as import('@/types/messages').MessagePayload | undefined);

        return this.communicationManager;
    }

    /**
     * Set up standard message handlers that all webviews need
     */
    private setupStandardHandlers(): void {
        if (!this.communicationManager) return;

        // Log handler
        this.communicationManager.on('log', (data: { level: string; message: string }) => {
            const prefix = `[${this.getWebviewTitle()}:UI]`;
            switch (data.level) {
                case 'error':
                    this.logger.error(`${prefix} ${data.message}`);
                    break;
                case 'warn':
                    this.logger.warn(`${prefix} ${data.message}`);
                    break;
                case 'debug':
                    this.logger.debug(`${prefix} ${data.message}`);
                    break;
                default:
                    this.logger.info(`${prefix} ${data.message}`);
            }
        });

        // Theme change handler
        const themeListener = vscode.window.onDidChangeActiveColorTheme(theme => {
            const themeMode = theme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';
            this.communicationManager?.sendMessage('theme-changed', { theme: themeMode });
        });
        this.disposables.add(themeListener);

        // State request handler
        this.communicationManager.on('get-state', async () => {
            const state = await this.stateManager.getCurrentProject();
            return state;
        });

        // State update handler
        this.communicationManager.on('update-state', async (updates: Record<string, unknown>) => {
            const current = await this.stateManager.getCurrentProject();
            if (!current) {
                throw new Error('No project loaded');
            }
            const updated = { ...current, ...updates };
            await this.stateManager.saveProject(updated);
            this.communicationManager?.incrementStateVersion();
            return { success: true, version: this.communicationManager?.getStateVersion() };
        });
    }

    /**
     * Send a message to the webview
     */
    protected async sendMessage(type: string, payload?: unknown): Promise<void> {
        if (!this.communicationManager) {
            this.logger.warn(`Cannot send message '${type}' - communication not initialized`);
            return;
        }

        try {
            await this.communicationManager.sendMessage(type, payload as import('@/types/messages').MessagePayload | undefined);
        } catch (error) {
            this.logger.error(`Failed to send message '${type}':`, error as Error);
            throw error;
        }
    }

    /**
     * Send a request and wait for response
     */
    protected async request<T = unknown>(type: string, payload?: unknown): Promise<T> {
        if (!this.communicationManager) {
            throw new Error('Communication not initialized');
        }

        try {
            return await this.communicationManager.request<T>(type, payload as import('@/types/messages').MessagePayload | undefined);
        } catch (error) {
            this.logger.error(`Request '${type}' failed:`, error as Error);
            throw error;
        }
    }

    /**
     * Handle panel disposal - webview-specific cleanup only
     *
     * Called by dispose() method during full disposal flow.
     *
     * Webview-specific cleanup:
     * 1. Dispose communicationManager (webview message handler)
     * 2. Clear singleton maps (activePanels, activeCommunicationManagers)
     * 3. Clear panel reference (this.panel = undefined)
     * 4. Trigger welcome reopen callback if configured
     */
    private handlePanelDisposal(): void {
        const webviewId = this.getWebviewId();

        // Clean up communication manager
        if (this.communicationManager) {
            this.communicationManager.dispose();
            this.communicationManager = undefined;
        }

        // Remove from singleton maps
        WebviewPanelManager.unregisterPanel(webviewId);
        WebviewPanelManager.unregisterCommunicationManager(webviewId);

        // Clear panel reference
        this.panel = undefined;

        // Notify about disposal if webview requested Welcome reopen
        const disposalCallback = WebviewPanelManager.getDisposalCallback();
        if (this.shouldReopenWelcomeOnDispose() && disposalCallback) {
            // Use setTimeout to ensure disposal is fully complete before callback
            // SOP §1: Using TIMEOUTS.UI_UPDATE_DELAY
            setTimeout(() => {
                disposalCallback(webviewId);
            }, TIMEOUTS.UI.UPDATE_DELAY);
        }
    }

    /**
     * Get nonce for CSP
     * Uses cryptographically secure random for security
     */
    protected getNonce(): string {
        // Use Node.js crypto for cryptographically secure random
        // Prevents CSP bypass attacks via nonce prediction
        return crypto.randomBytes(16).toString('base64');
    }

    /**
     * Clean up command resources
     *
     * Performs complete disposal of webview command resources with clean separation:
     * 1. handlePanelDisposal() - Webview-specific cleanup only
     *    - Disposes communicationManager
     *    - Clears singleton maps (activePanels, activeCommunicationManagers)
     *    - Clears panel reference
     *    - Triggers welcome reopen callback if configured
     * 2. super.dispose() - Inherited resource disposal
     *    - Disposes all tracked resources via DisposableStore (LIFO order)
     *    - Includes panel listeners, theme listeners, and any custom disposables
     *
     * This separation ensures single-responsibility:
     * - handlePanelDisposal() knows about webview lifecycle
     * - super.dispose() handles resource cleanup (inherited from BaseCommand)
     *
     * Safe to call multiple times (idempotent via DisposableStore).
     * Automatically called when command is removed from context.subscriptions.
     */
    public override dispose(): void {
        this.handlePanelDisposal();
        super.dispose();
    }
}