import * as vscode from 'vscode';
import * as path from 'path';
import { BaseCommand } from './baseCommand';
import { WebviewCommunicationManager, createWebviewCommunication } from '../utils/webviewCommunicationManager';
import { setLoadingState } from '../utils/loadingHTML';

/**
 * Base class for commands that use webviews with robust communication
 * 
 * Features:
 * - Standardized webview creation
 * - Automatic communication manager setup
 * - Loading state management
 * - Error recovery
 * - Consistent logging
 * - Singleton pattern per webview type (prevents duplicate panels)
 */
export abstract class BaseWebviewCommand extends BaseCommand {
    // Singleton: Track active webview panels and their communication managers by ID to prevent duplicates
    private static activePanels: Map<string, vscode.WebviewPanel> = new Map();
    private static activeCommunicationManagers: Map<string, WebviewCommunicationManager> = new Map();
    
    protected panel: vscode.WebviewPanel | undefined;
    protected communicationManager: WebviewCommunicationManager | undefined;
    protected disposables: vscode.Disposable[] = [];

    /**
     * Check if this webview is currently visible
     */
    public isVisible(): boolean {
        const webviewId = this.getWebviewId();
        const activePanel = BaseWebviewCommand.activePanels.get(webviewId);
        return (activePanel !== undefined && activePanel.visible) ||
               (this.panel !== undefined && this.panel.visible);
    }

    /**
     * Static method to dispose all active webview panels
     * Useful for cleanup during extension reset
     */
    public static disposeAllActivePanels(): void {
        BaseWebviewCommand.activePanels.forEach((panel, _id) => {
            try {
                panel.dispose();
            } catch {
                // Ignore errors during disposal
            }
        });
        BaseWebviewCommand.activePanels.clear();
        BaseWebviewCommand.activeCommunicationManagers.clear();
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
    protected abstract getInitialData(): Promise<any>;

    /**
     * Get the loading message to display while initializing
     */
    protected abstract getLoadingMessage(): string;

    /**
     * Create or reveal the webview panel (singleton per webview type)
     */
    protected async createOrRevealPanel(): Promise<vscode.WebviewPanel> {
        const webviewId = this.getWebviewId();
        
        this.logger.debug(`[Webview] createOrRevealPanel() for ${webviewId}. Active panels count: ${BaseWebviewCommand.activePanels.size}`);
        
        // Check if this webview type already has an active panel
        const existingPanel = BaseWebviewCommand.activePanels.get(webviewId);
        const existingCommManager = BaseWebviewCommand.activeCommunicationManagers.get(webviewId);
        
        this.logger.debug(`[Webview] Singleton check for ${webviewId}: panel=${existingPanel ? 'exists' : 'none'}, comm=${existingCommManager ? 'exists' : 'none'}`);
        
        if (existingPanel && existingCommManager) {
            this.logger.debug(`[Webview] Revealing existing ${webviewId} panel`);
            existingPanel.reveal();
            this.panel = existingPanel;
            this.communicationManager = existingCommManager;
            return existingPanel;
        }

        // Check instance panel (legacy support)
        if (this.panel) {
            this.logger.debug(`[Webview] Revealing instance panel for ${webviewId}`);
            this.panel.reveal();
            return this.panel;
        }

        // Create new panel
        this.logger.debug(`[Webview] Creating new ${webviewId} panel`);
        this.panel = vscode.window.createWebviewPanel(
            webviewId,
            this.getWebviewTitle(),
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'dist', 'webview')),
                    vscode.Uri.file(path.join(this.context.extensionPath, 'media'))
                ]
            }
        );

        // Register in singleton map
        BaseWebviewCommand.activePanels.set(webviewId, this.panel);
        this.logger.debug(`[Webview] Registered ${webviewId} in singleton map. Active panels: ${BaseWebviewCommand.activePanels.size}`);

        // Set up disposal handling
        this.panel.onDidDispose(
            () => this.handlePanelDisposal(),
            undefined,
            this.disposables
        );

        return this.panel;
    }

    /**
     * Initialize communication with the webview
     */
    protected async initializeCommunication(): Promise<WebviewCommunicationManager> {
        if (!this.panel) {
            throw new Error('Panel must be created before initializing communication');
        }

        // Set loading state while initializing
        await setLoadingState(
            this.panel,
            () => this.getWebviewContent(),
            this.getLoadingMessage(),
            this.logger
        );

        // Create communication manager
        this.communicationManager = await createWebviewCommunication(this.panel, {
            enableLogging: true,
            handshakeTimeout: 15000,
            messageTimeout: 30000,
            maxRetries: 3
        });

        // Register in singleton map
        const webviewId = this.getWebviewId();
        BaseWebviewCommand.activeCommunicationManagers.set(webviewId, this.communicationManager);

        // Set up message handlers
        this.initializeMessageHandlers(this.communicationManager);

        // Set up standard handlers
        this.setupStandardHandlers();

        // Send initial data
        const initialData = await this.getInitialData();
        await this.communicationManager.sendMessage('init', initialData);

        this.logger.debug(`[${this.getWebviewTitle()}] Communication initialized`);

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
        this.disposables.push(themeListener);

        // State request handler
        this.communicationManager.on('get-state', async () => {
            const state = await this.stateManager.getCurrentProject();
            return state;
        });

        // State update handler
        this.communicationManager.on('update-state', async (updates: any) => {
            const current = await this.stateManager.getCurrentProject();
            const updated = { ...current, ...updates };
            await this.stateManager.saveProject(updated);
            this.communicationManager?.incrementStateVersion();
            return { success: true, version: this.communicationManager?.getStateVersion() };
        });
    }

    /**
     * Send a message to the webview
     */
    protected async sendMessage(type: string, payload?: any): Promise<void> {
        if (!this.communicationManager) {
            this.logger.warn(`Cannot send message '${type}' - communication not initialized`);
            return;
        }

        try {
            await this.communicationManager.sendMessage(type, payload);
        } catch (error) {
            this.logger.error(`Failed to send message '${type}':`, error as Error);
            throw error;
        }
    }

    /**
     * Send a request and wait for response
     */
    protected async request<T = any>(type: string, payload?: any): Promise<T> {
        if (!this.communicationManager) {
            throw new Error('Communication not initialized');
        }

        try {
            return await this.communicationManager.request<T>(type, payload);
        } catch (error) {
            this.logger.error(`Request '${type}' failed:`, error as Error);
            throw error;
        }
    }

    /**
     * Handle panel disposal
     */
    private handlePanelDisposal(): void {
        const webviewId = this.getWebviewId();
        
        // Clean up communication manager
        if (this.communicationManager) {
            this.communicationManager.dispose();
            this.communicationManager = undefined;
        }

        // Clean up disposables
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];

        // Remove from singleton maps
        BaseWebviewCommand.activePanels.delete(webviewId);
        BaseWebviewCommand.activeCommunicationManagers.delete(webviewId);

        // Clear panel reference
        this.panel = undefined;

        this.logger.debug(`[${this.getWebviewTitle()}] Panel disposed (webviewId: ${webviewId})`);
    }

    /**
     * Get nonce for CSP
     */
    protected getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    /**
     * Clean up command resources
     */
    public dispose(): void {
        this.handlePanelDisposal();
    }
}