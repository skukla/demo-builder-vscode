import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';
import { BaseCommand } from './baseCommand';
import { PrerequisitesChecker } from '../utils/prerequisitesChecker';
import { AdobeAuthManager } from '../utils/adobeAuthManager';
import { setLoadingState } from '../utils/loadingHTML';

export class CreateProjectWebviewCommand extends BaseCommand {
    private panel: vscode.WebviewPanel | undefined;
    private prereqChecker: PrerequisitesChecker;
    private authManager: AdobeAuthManager;

    constructor(
        context: vscode.ExtensionContext,
        stateManager: any,
        statusBar: any,
        logger: any
    ) {
        super(context, stateManager, statusBar, logger);
        this.prereqChecker = new PrerequisitesChecker(logger);
        this.authManager = new AdobeAuthManager(logger);
    }

    public async execute(): Promise<void> {
        try {
            this.logger.info('CreateProjectWebviewCommand.execute() called');
            this.logger.info('Starting project creation wizard (webview)...');
            
            // Check if panel already exists
            if (this.panel) {
                this.logger.info('Panel already exists, revealing it');
                this.panel.reveal();
                return;
            }

            // Create webview panel with loading HTML set immediately
            this.panel = vscode.window.createWebviewPanel(
                'demoBuilderWizard',
                'Create Demo Project',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [
                        vscode.Uri.file(path.join(this.context.extensionPath, 'dist', 'webview'))
                    ]
                }
            );

            // Use the loading utility to manage the loading state and content transition
            // Call it IMMEDIATELY after panel creation
            await setLoadingState(
                this.panel,
                () => this.getWebviewContent(),
                'Loading Adobe Demo Builder...',
                this.logger
            );

            // Handle messages from webview
            this.panel.webview.onDidReceiveMessage(
                async message => {
                    await this.handleWebviewMessage(message);
                },
                undefined,
                this.context.subscriptions
            );

            // Clean up on dispose
            this.panel.onDidDispose(
                () => {
                    this.panel = undefined;
                    this.logger.info('Webview panel disposed');
                },
                undefined,
                this.context.subscriptions
            );

        } catch (error) {
            this.logger.error('Failed to create webview', error as Error);
            await this.showError('Failed to create webview', error as Error);
        }
    }

    private async getWebviewContent(): Promise<string> {
        const webviewPath = path.join(this.context.extensionPath, 'dist', 'webview');
        
        // Get URI for bundle
        const bundleUri = this.panel!.webview.asWebviewUri(
            vscode.Uri.file(path.join(webviewPath, 'main-bundle.js'))
        );
        
        const nonce = this.getNonce();
        
        // Build the HTML content
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' 'unsafe-eval'; style-src 'unsafe-inline' ${this.panel!.webview.cspSource}; img-src data: https:; font-src data:;">
            <title>Adobe Demo Builder</title>
            <style>
                :root {
                    /* VSCode will inject these CSS variables automatically */
                }
                body, html {
                    margin: 0;
                    padding: 0;
                    width: 100%;
                    height: 100vh;
                    overflow: hidden;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
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
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    font-weight: var(--vscode-font-weight);
                    color: var(--vscode-foreground);
                    background: var(--vscode-editor-background);
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
        <body class="${vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'vscode-dark' : 'vscode-light'}">
            <div id="root">
                <div class="loading">
                    <div class="spinner">
                        <div class="spinner-track"></div>
                        <div class="spinner-fill"></div>
                    </div>
                    <div>Loading Adobe Demo Builder...</div>
                </div>
            </div>
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


    private async handleWebviewMessage(message: any): Promise<void> {
        const { type, payload } = message;
        this.logger.info(`Received message from webview: ${type}`);

        switch (type) {
            case 'ready':
                // Send initialization data
                this.logger.info('Webview ready, sending init message');
                await this.sendMessage('init', {
                    theme: vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light',
                    state: await this.stateManager.getCurrentProject()
                });
                break;

            case 'check-prerequisites':
                await this.checkPrerequisites();
                break;

            case 'install-prerequisite':
                await this.installPrerequisite(payload.index, payload.name);
                break;

            case 'check-auth':
                await this.checkAuthentication();
                break;

            case 'authenticate':
                await this.authenticate(payload.force);
                break;

            case 'get-organizations':
                await this.getOrganizations();
                break;

            case 'get-projects':
                await this.getProjects(payload.orgId);
                break;

            case 'validate':
                await this.validateField(payload.field, payload.value);
                break;

            case 'create-project':
                await this.createProject(payload);
                break;

            case 'cancel':
                // Dispose the wizard panel
                this.panel?.dispose();
                this.panel = undefined;
                // Show the welcome screen (it should already exist)
                await vscode.commands.executeCommand('demoBuilder.welcome');
                break;

            case 'log':
                if (payload.level === 'info') {
                this.logger.info(payload.message);
            } else if (payload.level === 'warn') {
                this.logger.warn(payload.message);
            } else if (payload.level === 'error') {
                this.logger.error(payload.message);
            }
                break;
        }
    }

    private async sendMessage(type: string, payload?: any): Promise<void> {
        if (this.panel) {
            await this.panel.webview.postMessage({ type, payload });
        }
    }

    private async sendFeedback(
        step: string,
        status: string,
        primary: string,
        secondary?: string,
        progress?: number,
        log?: string,
        error?: string
    ): Promise<void> {
        await this.sendMessage('feedback', {
            step,
            status,
            primary,
            secondary,
            progress,
            log,
            error
        });
    }

    private async checkPrerequisites(): Promise<void> {
        const result = await this.prereqChecker.check();
        
        const checks = [
            { name: 'Node.js', status: result.node },
            { name: 'Node Version Manager', status: result.fnm },
            { name: 'Adobe I/O CLI', status: result.adobeIO },
            { name: 'API Mesh Plugin', status: result.apiMesh }
        ];

        for (let i = 0; i < checks.length; i++) {
            const check = checks[i];
            let status: string;
            let message: string;
            
            if (check.status.installed) {
                status = 'success';
                const version = check.status.version || 'unknown';
                message = `${check.name} is installed${version !== 'unknown' ? ` (v${version})` : ''}`;
            } else {
                status = 'error';
                message = `${check.name} is not installed`;
            }
            
            await this.sendMessage('prerequisite-status', {
                index: i,
                status,
                message
            });
        }
    }

    private async installPrerequisite(index: number, name: string): Promise<void> {
        await this.sendMessage('prerequisite-status', {
            index,
            status: 'checking',
            message: `Installing ${name}...`
        });

        try {
            let success = false;
            
            switch (name) {
                case 'Node Version Manager':
                    success = await this.installFnm(index);
                    break;
                case 'Node.js':
                    success = await this.installNode(index);
                    break;
                case 'Adobe I/O CLI':
                    success = await this.prereqChecker.installAdobeIO();
                    break;
                case 'API Mesh Plugin':
                    // API Mesh is installed via aio plugins:install @adobe/aio-cli-plugin-api-mesh
                    success = await new Promise<boolean>((resolve) => {
                        const installer = spawn('aio', ['plugins:install', '@adobe/aio-cli-plugin-api-mesh']);
                        installer.on('close', (code) => resolve(code === 0));
                    });
                    break;
            }

            await this.sendMessage('prerequisite-status', {
                index,
                status: success ? 'success' : 'error',
                message: success ? `${name} installed successfully` : `Failed to install ${name}`
            });
        } catch (error) {
            await this.sendMessage('prerequisite-status', {
                index,
                status: 'error',
                message: `Error installing ${name}: ${error}`,
                log: error instanceof Error ? error.message : String(error)
            });
        }
    }

    private async installFnm(index: number): Promise<boolean> {
        return new Promise((resolve) => {
            const installer = spawn('bash', ['-c', 'curl -fsSL https://fnm.vercel.app/install | bash']);
            
            installer.stdout.on('data', (data) => {
                this.sendMessage('prerequisite-status', {
                    index,
                    status: 'checking',
                    log: data.toString()
                });
            });

            installer.stderr.on('data', (data) => {
                this.sendMessage('prerequisite-status', {
                    index,
                    status: 'checking',
                    log: data.toString()
                });
            });

            installer.on('close', (code) => {
                resolve(code === 0);
            });
        });
    }

    private async installNode(index: number): Promise<boolean> {
        return new Promise((resolve) => {
            const installer = spawn('fnm', ['install', '20']);
            
            installer.stdout.on('data', (data) => {
                this.sendMessage('prerequisite-status', {
                    index,
                    status: 'checking',
                    log: data.toString()
                });
            });

            installer.on('close', (code) => {
                resolve(code === 0);
            });
        });
    }

    private async checkAuthentication(): Promise<void> {
        const isAuth = await this.authManager.isAuthenticated();
        
        await this.sendMessage('auth-status', {
            isAuthenticated: isAuth,
            message: isAuth ? 'Authenticated' : 'Not authenticated'
        });
    }

    private async authenticate(force: boolean): Promise<void> {
        const terminal = this.createTerminal('Adobe Auth');
        
        if (force) {
            terminal.sendText('aio auth logout --force');
            terminal.sendText('aio auth login -f');
        } else {
            terminal.sendText('aio auth login');
        }
        
        terminal.show();
        
        // Wait a moment and check status
        setTimeout(async () => {
            await this.checkAuthentication();
        }, 5000);
    }

    private async getOrganizations(): Promise<void> {
        const orgs = await this.authManager.getOrganizations();
        await this.sendMessage('organizations', orgs);
    }

    private async getProjects(orgId: string): Promise<void> {
        const projects = await this.authManager.getProjects(orgId);
        await this.sendMessage('projects', projects);
    }

    private async validateField(field: string, value: string): Promise<void> {
        // Implement validation logic
        let isValid = true;
        let message = '';

        switch (field) {
            case 'projectName':
                if (!value) {
                    isValid = false;
                    message = 'Project name is required';
                } else if (!/^[a-z0-9-]+$/.test(value)) {
                    isValid = false;
                    message = 'Use lowercase letters, numbers, and hyphens only';
                }
                break;
            case 'commerceUrl':
                try {
                    new URL(value);
                } catch {
                    isValid = false;
                    message = 'Invalid URL format';
                }
                break;
        }

        await this.sendMessage('validation-result', {
            field,
            isValid,
            message
        });
    }

    private async createProject(config: any): Promise<void> {
        // Implement project creation logic
        await this.sendFeedback('creating', 'start', 'Creating project', 'Initializing...');
        
        // TODO: Implement full project creation flow
        
        await this.sendFeedback('creating', 'complete', 'Project created', 'Successfully created demo project');
        
        // Close webview after success
        setTimeout(() => {
            this.panel?.dispose();
        }, 2000);
    }
}