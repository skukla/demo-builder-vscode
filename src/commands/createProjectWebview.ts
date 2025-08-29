import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseCommand } from './baseCommand';
import { PrerequisitesChecker } from '../utils/prerequisitesChecker';
import { PrerequisitesManager } from '../utils/prerequisitesManager';
import { AdobeAuthManager } from '../utils/adobeAuthManager';
import { setLoadingState } from '../utils/loadingHTML';
import { ComponentHandler } from './componentHandler';
import { TerminalManager } from '../utils/terminalManager';
import { ErrorLogger } from '../utils/errorLogger';

const execAsync = promisify(exec);

export class CreateProjectWebviewCommand extends BaseCommand {
    private panel: vscode.WebviewPanel | undefined;
    private prereqChecker: PrerequisitesChecker;
    private prereqManager: PrerequisitesManager;
    private authManager: AdobeAuthManager;
    private componentHandler: ComponentHandler;
    private terminalManager: TerminalManager;
    private errorLogger: ErrorLogger;
    private currentComponentSelection?: any;

    constructor(
        context: vscode.ExtensionContext,
        stateManager: any,
        statusBar: any,
        logger: any
    ) {
        super(context, stateManager, statusBar, logger);
        this.prereqChecker = new PrerequisitesChecker(logger);
        this.prereqManager = new PrerequisitesManager(context.extensionPath, logger);
        this.authManager = new AdobeAuthManager(logger);
        this.componentHandler = new ComponentHandler(context);
        this.terminalManager = new TerminalManager();
        this.errorLogger = new ErrorLogger(context);
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
                // Clear previous logs and start checking
                this.errorLogger.clear();
                this.errorLogger.logInfo('Starting prerequisite checks', 'Prerequisites');
                await this.checkPrerequisitesWithManager();
                break;
            
            case 'update-component-selection':
                // Store component selection for prerequisite checking
                this.currentComponentSelection = payload;
                break;

            case 'install-prerequisite':
                // Use new manager if ID provided, otherwise fallback to old method
                if (payload.id) {
                    await this.installPrerequisiteWithManager(payload.index, payload.id);
                } else {
                    await this.installPrerequisite(payload.index, payload.name);
                }
                break;

            case 'check-auth':
                await this.checkAuthentication();
                break;

            case 'authenticate':
                await this.authenticate(payload.force);
                break;

            // Component selection messages
            case 'loadComponents':
            case 'checkCompatibility':
            case 'loadDependencies':
            case 'loadPreset':
            case 'validateSelection':
                await this.componentHandler.handleMessage(message, this.panel!);
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

    private async checkPrerequisitesWithManager(): Promise<void> {
        try {
            // Load prerequisites from configuration
            const prerequisites = await this.prereqManager.getRequiredPrerequisites(
                this.currentComponentSelection
            );
            
            // Send prerequisites list to UI
            await this.sendMessage('prerequisites-loaded', {
                prerequisites: prerequisites.map(p => ({
                    id: p.id,
                    name: p.name,
                    description: p.description,
                    optional: p.optional || false,
                    plugins: p.plugins?.map(plugin => ({
                        id: plugin.id,
                        name: plugin.name,
                        description: plugin.description
                    }))
                }))
            });
            
            // Check each prerequisite
            for (let i = 0; i < prerequisites.length; i++) {
                const prereq = prerequisites[i];
                
                // Log to error logger
                this.errorLogger.logInfo(`Checking ${prereq.name}`, 'Prerequisites');
                
                // Send checking status to UI
                await this.sendMessage('prerequisite-status', {
                    index: i,
                    id: prereq.id,
                    status: 'checking'
                });
                
                // No terminal output - just check prerequisites
                
                // Give command time to execute
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Check prerequisite status
                const status = await this.prereqManager.checkPrerequisite(prereq);
                
                // Special handling for Node.js - check if ALL required versions are installed
                if (prereq.id === 'node' && status.installed) {
                    const requiredVersions = await this.prereqManager.getRequiredNodeVersions(
                        this.currentComponentSelection
                    );
                    
                    if (requiredVersions.length > 0) {
                        // Get installed versions from fnm
                        let installedVersions: string[] = [];
                        try {
                            const { stdout: fnmList } = await execAsync('fnm list');
                            const versionLines = fnmList.split('\n').filter(line => line.trim());
                            
                            for (const line of versionLines) {
                                const versionMatch = line.match(/v?(\d+\.\d+\.\d+)/);
                                if (versionMatch) {
                                    installedVersions.push(versionMatch[1]);
                                }
                            }
                        } catch (error) {
                            this.errorLogger.logWarning('Could not query fnm for installed versions', 'Prerequisites');
                        }
                        
                        // Check which required versions are missing
                        const missingVersions: string[] = [];
                        const installedMajorVersions = installedVersions.map(v => v.split('.')[0]);
                        
                        for (const reqVersion of requiredVersions) {
                            if (reqVersion === 'latest') {
                                // Check if we have any version >= 23
                                const hasRecent = installedMajorVersions.some(v => parseInt(v) >= 23);
                                if (!hasRecent) {
                                    missingVersions.push('latest');
                                }
                            } else {
                                // Check for specific major version
                                const reqMajor = reqVersion.split('.')[0];
                                if (!installedMajorVersions.includes(reqMajor)) {
                                    missingVersions.push(reqVersion);
                                }
                            }
                        }
                        
                        // Update status based on missing versions
                        if (missingVersions.length > 0) {
                            status.installed = false;
                            const missingWithComponents = missingVersions.map(v => {
                                const component = this.getComponentNameForNodeVersion(v);
                                return `v${v}${component ? ` (${component})` : ''}`;
                            });
                            status.message = `Node.js partially installed. Missing: ${missingWithComponents.join(', ')}`;
                            
                            // Store missing versions for later installation
                            (status as any).missingVersions = missingVersions;
                        } else {
                            // All required versions are installed
                            status.message = `Node.js is installed (${installedVersions.map(v => `v${v}`).join(', ')})`;
                        }
                        
                        // Store installed versions for display
                        (status as any).installedVersions = installedVersions;
                    }
                }
                
                // Log result
                if (status.installed) {
                    this.errorLogger.logInfo(`${prereq.name} found: ${status.version || 'version unknown'}`, 'Prerequisites');
                } else {
                    this.errorLogger.logWarning(`${prereq.name} not installed${status.message ? ': ' + status.message : ''}`, 'Prerequisites');
                }
                
                // Send result to UI
                await this.sendMessage('prerequisite-status', {
                    index: i,
                    id: prereq.id,
                    status: status.installed ? 'success' : 'error',
                    message: status.message || (status.installed ? 
                        `${status.name} is installed${status.version ? ` (v${status.version})` : ''}` :
                        `${status.name} is not installed`),
                    version: status.version,
                    plugins: status.plugins,
                    missingVersions: (status as any).missingVersions,
                    installedVersions: (status as any).installedVersions
                });
            }
        } catch (error) {
            this.logger.error('Error checking prerequisites:', error as Error);
            this.errorLogger.logError(error as Error, 'Prerequisites', true); // Critical error
            await this.sendMessage('prerequisite-error', {
                error: (error as Error).message
            });
        }
    }

    private async checkPrerequisites(): Promise<void> {
        const result = await this.prereqChecker.check();
        
        const checks = [
            { name: 'Node.js', status: result.node, command: 'node --version' },
            { name: 'Node Version Manager', status: result.fnm, command: 'fnm --version' },
            { name: 'Adobe I/O CLI', status: result.adobeIO, command: 'aio --version' },
            { name: 'API Mesh Plugin', status: result.apiMesh, command: 'aio api-mesh --version' }
        ];

        for (let i = 0; i < checks.length; i++) {
            const check = checks[i];
            let status: string;
            let message: string;
            
            // Check prerequisite command
            
            // Send status update
            await this.sendMessage('prerequisite-status', {
                index: i,
                status: 'checking'
            });
            
            // Add a small delay for visual feedback
            await new Promise(resolve => setTimeout(resolve, 300));
            
            if (check.status.installed) {
                status = 'success';
                const version = check.status.version || 'unknown';
                message = `${check.name} is installed${version !== 'unknown' ? ` (v${version})` : ''}`;
                
                // For Node.js, pass all installed versions from fnm
                let plugins = undefined;
                if (check.name === 'Node.js' && (check.status as any).installedVersions) {
                    plugins = (check.status as any).installedVersions;
                }
                
                await this.sendMessage('prerequisite-status', {
                    index: i,
                    status,
                    message,
                    version: version !== 'unknown' ? version : undefined,
                    plugins // Pass installed versions for Node.js
                });
            } else {
                status = 'error';
                message = `${check.name} is not installed`;
                
                // Not installed
                
                await this.sendMessage('prerequisite-status', {
                    index: i,
                    status,
                    message
                });
            }
        }
    }

    private async installPrerequisiteWithManager(index: number, prereqId: string): Promise<void> {
        try {
            const prereq = await this.prereqManager.getPrerequisiteById(prereqId);
            if (!prereq) {
                throw new Error(`Prerequisite ${prereqId} not found`);
            }
            
            // Start installation
            
            // Log installation start
            this.errorLogger.logInfo(`Installing ${prereq.name}`, 'Prerequisites');
            
            await this.sendMessage('prerequisite-status', {
                index,
                id: prereqId,
                status: 'checking',
                message: `Installing ${prereq.name}...`
            });
            
            // Get install commands
            let nodeVersions: string[] = [];
            
            // For Node.js, get required versions and filter out already installed ones
            if (prereq.id === 'node') {
                const requiredVersions = await this.prereqManager.getRequiredNodeVersions(
                    this.currentComponentSelection
                );
                
                // Get currently installed versions
                let installedMajorVersions: string[] = [];
                try {
                    const { stdout: fnmList } = await execAsync('fnm list');
                    const versionLines = fnmList.split('\n').filter(line => line.trim());
                    
                    for (const line of versionLines) {
                        const versionMatch = line.match(/v?(\d+)\.(\d+)\.(\d+)/);
                        if (versionMatch) {
                            installedMajorVersions.push(versionMatch[1]);
                        }
                    }
                    this.errorLogger.logInfo(`Already installed Node versions: ${installedMajorVersions.join(', ')}`, 'Prerequisites');
                } catch (error) {
                    this.errorLogger.logWarning('Could not query fnm for installed versions', 'Prerequisites');
                }
                
                // Filter out already installed versions and resolve "latest"
                const versionsToInstall: string[] = [];
                for (const version of requiredVersions) {
                    if (version === 'latest') {
                        // Check if we already have a recent version (>= 23)
                        const hasRecent = installedMajorVersions.some(v => parseInt(v) >= 23);
                        if (!hasRecent) {
                            try {
                                // Query fnm for latest available version
                                const { stdout } = await execAsync('fnm list-remote | head -1');
                                const latestVersion = stdout.trim().replace('v', '');
                                versionsToInstall.push(latestVersion);
                                this.errorLogger.logInfo(`Will install latest Node version: ${latestVersion}`, 'Prerequisites');
                            } catch (error) {
                                this.errorLogger.logWarning(`Could not resolve latest version, using 24`, 'Prerequisites');
                                versionsToInstall.push('24'); // Fallback
                            }
                        } else {
                            this.errorLogger.logInfo(`Skipping 'latest' - already have Node ${installedMajorVersions.find(v => parseInt(v) >= 23)}`, 'Prerequisites');
                        }
                    } else {
                        // Check if this major version is already installed
                        const reqMajor = version.split('.')[0];
                        if (!installedMajorVersions.includes(reqMajor)) {
                            versionsToInstall.push(version);
                            this.errorLogger.logInfo(`Will install Node version: ${version}`, 'Prerequisites');
                        } else {
                            this.errorLogger.logInfo(`Skipping Node ${version} - already have Node ${reqMajor}`, 'Prerequisites');
                        }
                    }
                }
                
                if (versionsToInstall.length === 0) {
                    // All required versions are already installed
                    this.errorLogger.logInfo(`All required Node versions are already installed`, 'Prerequisites');
                    
                    await this.sendMessage('prerequisite-status', {
                        index,
                        id: prereqId,
                        status: 'success',
                        message: `All required Node.js versions are already installed`
                    });
                    return;
                }
                
                nodeVersions = versionsToInstall;
            }
            
            const installInfo = this.prereqManager.getInstallCommands(prereq, {
                nodeVersions: prereq.id === 'node' ? nodeVersions : undefined,
                preferredMethod: 'homebrew' // Could be configured
            });
            
            if (installInfo.manual) {
                // Manual installation required
                this.errorLogger.logWarning(`Manual installation required for ${prereq.name}`, 'Prerequisites');
                
                await this.sendMessage('prerequisite-status', {
                    index,
                    id: prereqId,
                    status: 'warning',
                    message: installInfo.message || 'Manual installation required'
                });
                return;
            }
            
            // Execute install commands from prerequisites.json
            let commandIndex = 0;
            for (const command of installInfo.commands) {
                try {
                    // For Node.js with multiple versions, show which version we're installing
                    let progressMessage = `Executing: ${command.substring(0, 50)}...`;
                    if (prereq.id === 'node' && nodeVersions.length > 1) {
                        const version = nodeVersions[commandIndex] || '';
                        const componentName = this.getComponentNameForNodeVersion(version);
                        progressMessage = `Installing Node.js ${version}${componentName ? ` for ${componentName}` : ''}...`;
                    }
                    
                    this.errorLogger.logInfo(`Executing: ${command}`, 'Prerequisites');
                    
                    await this.sendMessage('prerequisite-status', {
                        index,
                        id: prereqId,
                        status: 'checking',
                        message: progressMessage
                    });
                    
                    // Execute the actual command
                    const { stdout, stderr } = await execAsync(command, {
                        timeout: 60000, // 60 second timeout
                        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
                    });
                    
                    // Log output
                    if (stdout) {
                        this.errorLogger.logInfo(`Output: ${stdout.substring(0, 500)}`, 'Prerequisites');
                    }
                    
                    // Check if stderr contains only warnings (common with npm)
                    if (stderr) {
                        const hasOnlyWarnings = stderr.split('\n').every(line => 
                            !line.trim() || 
                            line.includes('warn') || 
                            line.includes('deprecated') ||
                            line.includes('notice')
                        );
                        
                        if (!hasOnlyWarnings) {
                            this.errorLogger.logWarning(`Stderr: ${stderr.substring(0, 500)}`, 'Prerequisites');
                        }
                    }
                    
                } catch (error: any) {
                    // Check if this is actually a failure or just warnings
                    // npm often returns exit code 1 with deprecation warnings but still succeeds
                    const isNpmCommand = command.includes('npm install');
                    const hasSuccessIndicators = error.stdout && (
                        error.stdout.includes('added') || 
                        error.stdout.includes('changed') ||
                        error.stdout.includes('packages in')
                    );
                    
                    if (isNpmCommand && hasSuccessIndicators) {
                        // npm succeeded despite warnings
                        this.errorLogger.logInfo(`Command completed with warnings: ${command}`, 'Prerequisites');
                        if (error.stdout) {
                            this.errorLogger.logInfo(`Output: ${error.stdout.substring(0, 500)}`, 'Prerequisites');
                        }
                    } else {
                        // This is a real error
                        const errorDetails = `Command: ${command}\nError: ${error.message}\nStderr: ${error.stderr || 'N/A'}\nStdout: ${error.stdout || 'N/A'}\nCode: ${error.code || 'N/A'}`;
                        this.errorLogger.logError(
                            new Error(`Failed to execute: ${command}`),
                            'Prerequisites',
                            false,
                            errorDetails
                        );
                        
                        // Re-throw to handle in outer catch
                        throw error;
                    }
                }
                commandIndex++;
            }
            
            // Check if installation was successful
            const status = await this.prereqManager.checkPrerequisite(prereq);
            const success = status.installed;
            
            // Log result
            let successMessage = `${prereq.name} installed successfully`;
            
            if (success) {
                // For Node.js, show which versions were installed
                if (prereq.id === 'node' && nodeVersions.length > 0) {
                    successMessage = `${prereq.name} installed (${nodeVersions.join(', ')})`;
                }
                this.errorLogger.logInfo(successMessage, 'Prerequisites');
            } else {
                this.errorLogger.logError(`Failed to install ${prereq.name}`, 'Prerequisites');
            }
            
            await this.sendMessage('prerequisite-status', {
                index,
                id: prereqId,
                status: success ? 'success' : 'error',
                message: success ? successMessage : `Failed to install ${prereq.name}`
            });
            
            // If there's a post-install message, send it
            if (success && prereq.postInstall?.message) {
                await this.sendMessage('prerequisite-status', {
                    index,
                    id: prereqId,
                    status: 'success',
                    log: prereq.postInstall.message
                });
            }
        } catch (error) {
            // Log error
            this.errorLogger.logError(error as Error, `Installing ${prereqId}`, true);
            
            await this.sendMessage('prerequisite-status', {
                index,
                id: prereqId,
                status: 'error',
                message: `Error installing: ${error}`
            });
        }
    }

    private getComponentNameForNodeVersion(version: string): string {
        // Map Node version to component based on requirements
        if (!this.currentComponentSelection) return '';
        
        const majorVersion = version.split('.')[0];
        
        // Check if version 18 is for API Mesh
        if (majorVersion === '18' && 
            this.currentComponentSelection.dependencies?.includes('commerce-mesh')) {
            return 'API Mesh';
        }
        
        // Check if version 22 is for App Builder
        if (majorVersion === '22' && 
            this.currentComponentSelection.appBuilderApps?.length > 0) {
            return 'App Builder';
        }
        
        // Check if latest/24 is for frontend
        if ((majorVersion === '24' || majorVersion === '23' || version === 'latest') && 
            this.currentComponentSelection.frontend) {
            return 'Headless Storefront';
        }
        
        return '';
    }

    private async installPrerequisite(index: number, name: string): Promise<void> {
        try {
            // Map display names to prerequisite IDs
            const nameToIdMap: { [key: string]: string } = {
                'Node Version Manager': 'fnm',
                'Fast Node Manager': 'fnm',
                'Node.js': 'node',
                'Adobe I/O CLI': 'aio-cli',
                'API Mesh Plugin': 'api-mesh',
                'Git': 'git'
            };
            
            const prereqId = nameToIdMap[name] || name.toLowerCase().replace(/\s+/g, '-');
            
            // Use the PrerequisitesManager to handle installation
            await this.installPrerequisiteWithManager(index, prereqId);
            
        } catch (error) {
            this.errorLogger.logError(error as Error, `Installing ${name}`);
            
            await this.sendMessage('prerequisite-status', {
                index,
                status: 'error',
                message: `Error installing ${name}: ${error}`
            });
        }
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