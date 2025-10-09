import * as vscode from 'vscode';
import * as path from 'path';
import { BaseCommand } from './baseCommand';
import { Project } from '../types';
import { setLoadingState } from '../utils/loadingHTML';

export class WelcomeWebviewCommand extends BaseCommand {
    // Singleton: Track the active Welcome panel to prevent duplicates
    private static activePanel: vscode.WebviewPanel | undefined;
    
    private panel: vscode.WebviewPanel | undefined;
    private messageIdCounter = 0;
    private handshakeComplete = false;

    /**
     * Check if Welcome webview is currently visible
     */
    public isVisible(): boolean {
        return (WelcomeWebviewCommand.activePanel !== undefined && WelcomeWebviewCommand.activePanel.visible) ||
               (this.panel !== undefined && this.panel.visible);
    }

    /**
     * Static method to dispose any active Welcome panel
     * Useful for cleanup when transitioning to other views (e.g., after project creation)
     */
    public static disposeActivePanel(): void {
        if (WelcomeWebviewCommand.activePanel) {
            WelcomeWebviewCommand.activePanel.dispose();
            WelcomeWebviewCommand.activePanel = undefined;
        }
    }

    public async execute(): Promise<void> {
        try {
            this.logger.info('[UI] Showing Demo Builder Welcome screen...');

            // Check if Welcome panel already exists globally (singleton)
            if (WelcomeWebviewCommand.activePanel) {
                this.logger.debug('[UI] Global Welcome panel already exists, revealing it');
                WelcomeWebviewCommand.activePanel.reveal();
                this.panel = WelcomeWebviewCommand.activePanel;
                return;
            }

            // Check if panel already exists in this instance (legacy support)
            if (this.panel) {
                this.logger.debug('[UI] Panel already exists, revealing it');
                this.panel.reveal();
                return;
            }

            this.logger.debug('[UI] Creating new Welcome webview panel');
            // Create webview panel
            this.panel = vscode.window.createWebviewPanel(
                'demoBuilderWelcome',
                'Demo Builder',
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
            WelcomeWebviewCommand.activePanel = this.panel;
            
            this.logger.debug('[UI] Welcome panel created successfully');

            // Use the loading utility to manage the loading state and content transition
            // Call it IMMEDIATELY after panel creation
            this.logger.debug('[UI] Setting loading state...');
            await setLoadingState(
                this.panel,
                () => this.getWebviewContent(),
                'Loading Demo Builder...',
                this.logger
            );
            this.logger.debug('[UI] Loading state set, content should be loaded');
            
            // Handle messages from webview
            this.panel.webview.onDidReceiveMessage(
                async message => {
                    // Handle handshake protocol
                    if (message.type === '__webview_ready__') {
                        this.logger.debug('[UI] Received webview ready signal');
                        // Send handshake complete
                        await this.sendRawMessage({
                            id: this.generateMessageId(),
                            type: '__handshake_complete__',
                            timestamp: Date.now()
                        });
                        this.handshakeComplete = true;
                        this.logger.debug('[UI] Handshake complete');
                        return;
                    }
                    
                    await this.handleWebviewMessage(message);
                },
                undefined,
                this.context.subscriptions
            );
            
            // Initiate handshake protocol
            this.logger.debug('[UI] Initiating handshake protocol');
            await this.sendRawMessage({
                id: this.generateMessageId(),
                type: '__extension_ready__',
                timestamp: Date.now()
            });

            // Clean up on dispose
            this.panel.onDidDispose(
                () => {
                    // Clear both instance and static references
                    WelcomeWebviewCommand.activePanel = undefined;
                    this.panel = undefined;
                    this.logger.debug('[UI] Welcome panel disposed');
                },
                undefined,
                this.context.subscriptions
            );

        } catch (error) {
            await this.showError('Failed to show welcome screen', error as Error);
        }
    }

    private async getWebviewContent(): Promise<string> {
        this.logger.debug('[UI] getWebviewContent called');
        const webviewPath = path.join(this.context.extensionPath, 'dist', 'webview');
        
        // Get URI for bundle
        const bundlePath = path.join(webviewPath, 'welcome-bundle.js');
        
        if (!this.panel) {
            this.logger.error('[UI] Panel is undefined in getWebviewContent!');
            throw new Error('Panel is undefined');
        }
        
        const bundleUri = this.panel.webview.asWebviewUri(
            vscode.Uri.file(bundlePath)
        );
        
        const nonce = this.getNonce();
        const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
        
        // Build the HTML content
        const html = `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' 'unsafe-eval'; style-src 'unsafe-inline' ${this.panel!.webview.cspSource}; img-src data: https: ${this.panel!.webview.cspSource}; font-src data:;">
            <title>Demo Builder</title>
            <style>
                :root {
                    /* VSCode CSS variables are injected automatically */
                }
                body, html {
                    margin: 0;
                    padding: 0;
                    width: 100%;
                    height: 100vh;
                    overflow: hidden;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    font-weight: var(--vscode-font-weight);
                }
                #root {
                    width: 100%;
                    height: 100%;
                }
                .loading {
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    color: var(--vscode-foreground);
                    gap: 20px;
                }
                .spinner {
                    width: 32px;
                    height: 32px;
                    position: relative;
                    display: inline-block;
                }
                .spinner-track {
                    width: 100%;
                    height: 100%;
                    border: 3px solid var(--vscode-editorWidget-border, #e1e1e1);
                    border-radius: 50%;
                    box-sizing: border-box;
                }
                .spinner-fill {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    border: 3px solid transparent;
                    border-top-color: var(--vscode-focusBorder, #0078d4);
                    border-left-color: var(--vscode-focusBorder, #0078d4);
                    border-radius: 50%;
                    animation: spectrum-rotate 1s cubic-bezier(.25, .78, .48, .89) infinite;
                    box-sizing: border-box;
                }
                @keyframes spectrum-rotate {
                    0% { transform: rotate(-90deg); }
                    100% { transform: rotate(270deg); }
                }
            </style>
        </head>
        <body class="${isDark ? 'vscode-dark' : 'vscode-light'}">
            <div id="root">
                <div class="loading">
                    <div class="spinner">
                        <div class="spinner-track"></div>
                        <div class="spinner-fill"></div>
                    </div>
                    <div>Loading Demo Builder...</div>
                </div>
            </div>
            <script nonce="${nonce}">
                // For development - use main bundle if welcome bundle doesn't exist
                window.addEventListener('error', (e) => {
                    if (e.filename && e.filename.includes('welcome-bundle.js')) {
                        console.warn('Welcome bundle not found, falling back to main bundle');
                        const script = document.createElement('script');
                        script.src = '${this.panel!.webview.asWebviewUri(vscode.Uri.file(path.join(webviewPath, 'main-bundle.js')))}';
                        script.nonce = '${nonce}';
                        document.body.appendChild(script);
                    }
                });
            </script>
            <script nonce="${nonce}" src="${bundleUri}"></script>
        </body>
        </html>`;
        
        this.logger.debug('[UI] getWebviewContent completed, returning HTML');
        return html;
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }


    private async sendInitialData(): Promise<void> {
        // Check license status
        // For testing, temporarily bypass license check
        const isLicensed = true; // TODO: Re-enable license check
        /*
        const { LicenseValidator } = await import('../license/validator');
        const licenseValidator = new LicenseValidator(this.context);
        const isLicensed = await licenseValidator.checkLicense();
        */
        
        this.logger.info(`[License] Check result: ${isLicensed} (bypassed for testing)`);

        // Send initialization data
        await this.sendMessage('init', {
            theme: vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light',
            workspacePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
            isLicensed
        });
        
        this.logger.debug('Initial data sent to webview');
    }

    private async handleWebviewMessage(message: any): Promise<void> {
        const { type, payload } = message;
        this.logger.debug(`Welcome screen action: ${type}`);

        switch (type) {
        case 'ready':
            await this.sendInitialData();
            break;

        case 'create-new':
            // Open wizard (welcome panel stays in background)
            this.logger.info('[Project Creation] Starting wizard from welcome screen');
            await vscode.commands.executeCommand('demoBuilder.createProject');
            // Don't dispose the welcome panel - keep it available for navigation back
            break;

        case 'open-project':
            await this.browseForProject();
            break;

        case 'import-project':
            await this.importProject();
            break;

        case 'open-docs':
            vscode.env.openExternal(vscode.Uri.parse('https://docs.adobe.com/demo-builder'));
            break;

        case 'open-settings':
            vscode.commands.executeCommand('workbench.action.openSettings', 'demoBuilder');
            break;

        case 'validate-license':
            await this.validateLicense(payload.licenseKey);
            break;

        case 'log':
            this.logger.info(`[Welcome] ${payload.message}`);
            break;
        }
    }

    private async validateLicense(licenseKey: string): Promise<void> {
        const { LicenseValidator } = await import('../license/validator');
        const licenseValidator = new LicenseValidator(this.context);
        
        const isValid = await licenseValidator.validateLicense(licenseKey);
        
        if (isValid) {
            await this.context.secrets.store('demoBuilder.licenseKey', licenseKey);
            await this.sendMessage('license-validated', { valid: true });
            vscode.window.showInformationMessage('License validated successfully!');
        } else {
            await this.sendMessage('license-validated', { valid: false });
            vscode.window.showErrorMessage('Invalid license key provided.');
        }
    }

    private generateMessageId(): string {
        return `ext-${Date.now()}-${++this.messageIdCounter}`;
    }
    
    private async sendRawMessage(message: any): Promise<void> {
        if (this.panel) {
            await this.panel.webview.postMessage(message);
        }
    }
    
    private async sendMessage(type: string, payload?: any): Promise<void> {
        if (this.panel) {
            // Send message with proper format for new vscodeApi
            await this.sendRawMessage({
                id: this.generateMessageId(),
                type,
                payload,
                timestamp: Date.now()
            });
        }
    }

    private async openProject(projectPath: string): Promise<void> {
        try {
            // Load project into state
            const project = await this.stateManager.loadProjectFromPath(projectPath);
            
            if (project) {
                // Update status bar
                this.statusBar.updateProject(project);
                
                // Close welcome screen
                this.panel?.dispose();
                
                // Show success message
                vscode.window.showInformationMessage(
                    `Project "${project.name}" loaded successfully!`,
                    'Start Demo',
                    'View Status'
                ).then(selection => {
                    if (selection === 'Start Demo') {
                        vscode.commands.executeCommand('demoBuilder.startDemo');
                    } else if (selection === 'View Status') {
                        vscode.commands.executeCommand('demoBuilder.viewStatus');
                    }
                });
            }
        } catch (error) {
            await this.showError('Failed to open project', error as Error);
        }
    }

    private async browseForProject(): Promise<void> {
        const result = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Demo Project',
            title: 'Select Demo Builder Project Directory'
        });

        if (result && result.length > 0) {
            const projectPath = result[0].fsPath;
            await this.openProject(projectPath);
        }
    }


    private async importProject(): Promise<void> {
        const result = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'Console Config': ['json'],
                'All Files': ['*']
            },
            openLabel: 'Import',
            title: 'Import Adobe Console Configuration'
        });

        if (result && result.length > 0) {
            const filePath = result[0].fsPath;
            
            // Close welcome screen
            this.panel?.dispose();
            
            // Execute import command (to be implemented)
            vscode.commands.executeCommand('demoBuilder.importProject', filePath);
        }
    }
}