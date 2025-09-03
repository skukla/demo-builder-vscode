import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseCommand } from './baseCommand';
import { PrerequisitesChecker } from '../utils/prerequisitesChecker';
import { PrerequisitesManager, PrerequisiteDefinition, PrerequisiteStatus, PrerequisitePlugin, InstallStep } from '../utils/prerequisitesManager';
import { AdobeAuthManager } from '../utils/adobeAuthManager';
import { setLoadingState } from '../utils/loadingHTML';
import { ComponentHandler } from './componentHandler';
import { ErrorLogger } from '../utils/errorLogger';
import { ComponentRegistryManager } from '../utils/componentRegistry';
import { ProgressUnifier, UnifiedProgress } from '../utils/progressUnifier';

const execAsync = promisify(exec);

export class CreateProjectWebviewCommand extends BaseCommand {
    private panel: vscode.WebviewPanel | undefined;
    private prereqChecker: PrerequisitesChecker;
    private prereqManager: PrerequisitesManager;
    private authManager: AdobeAuthManager;
    private componentHandler: ComponentHandler;
    private errorLogger: ErrorLogger;
    private progressUnifier: ProgressUnifier;
    private currentComponentSelection?: any;
    private componentsData?: any;
    private currentPrerequisites?: any[];  // Store resolved prerequisites for the session
    private currentPrerequisiteStates?: Map<number, any>;  // Track state of each prerequisite

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
        this.errorLogger = new ErrorLogger(context);
        this.progressUnifier = new ProgressUnifier(logger);
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
                
                // Load defaults if available
                let componentDefaults = null;
                try {
                    const defaultsPath = path.join(this.context.extensionPath, 'templates', 'defaults.json');
                    if (fs.existsSync(defaultsPath)) {
                        const defaultsContent = fs.readFileSync(defaultsPath, 'utf8');
                        const defaults = JSON.parse(defaultsContent);
                        componentDefaults = defaults.componentSelection;
                        this.logger.info('Loaded component defaults from defaults.json');
                    }
                } catch (error) {
                    this.logger.info('No defaults.json found or error loading it, using empty defaults');
                }
                
                await this.sendMessage('init', {
                    theme: vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light',
                    state: await this.stateManager.getCurrentProject(),
                    componentDefaults
                });
                break;

            case 'check-prerequisites':
                // Clear previous logs and start checking
                this.errorLogger.clear();
                this.errorLogger.logInfo('Starting prerequisite checks', 'Prerequisites');
                // Clear cached prerequisites for a fresh check
                this.currentPrerequisites = undefined;
                this.currentPrerequisiteStates = undefined;
                await this.checkPrerequisitesWithManager();
                break;
            
            case 'continue-prerequisites':
                // Continue checking from a specific index
                const fromIndex = payload?.fromIndex || 0;
                this.errorLogger.logInfo(`Continuing prerequisite checks from index ${fromIndex}`, 'Prerequisites');
                await this.checkPrerequisitesWithManager(fromIndex);
                break;
            
            case 'update-component-selection':
                // Store component selection for prerequisite checking
                this.currentComponentSelection = payload;
                // Clear cached prerequisites when selection changes
                this.currentPrerequisites = undefined;
                this.currentPrerequisiteStates = undefined;
                break;
            
            case 'update-components-data':
                // Store components data for reference
                this.componentsData = payload;
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

    private async checkPrerequisitesWithManager(startFromIndex: number = 0): Promise<void> {
        try {
            // Only load and resolve prerequisites if starting fresh or not already loaded
            if (startFromIndex === 0 || !this.currentPrerequisites) {
                // Load prerequisites from configuration
                let prerequisites = await this.prereqManager.getRequiredPrerequisites(
                    this.currentComponentSelection
                );
                
                // Resolve dependencies to get correct order
                prerequisites = this.prereqManager.resolveDependencies(prerequisites);
                
                // Store for reuse during this session
                this.currentPrerequisites = prerequisites;
                
                // Clear any previous states when starting fresh
                if (startFromIndex === 0) {
                    this.currentPrerequisiteStates = new Map();
                }
            }
            
            // Use the stored prerequisites list
            const prerequisites = this.currentPrerequisites;
            
            // Build Node version to component mapping
            const versionComponentMap = await this.buildNodeVersionComponentMap();
            const versionComponentMapping: { [key: string]: string } = {};
            versionComponentMap.forEach((value, key) => {
                versionComponentMapping[key] = value;
            });
            
            // Get required Node versions from configuration
            const requiredNodeVersions = await this.prereqManager.getRequiredNodeVersions(
                this.currentComponentSelection
            );
            
            // Only send prerequisites list to UI when starting fresh, not when continuing
            if (startFromIndex === 0) {
                await this.sendMessage('prerequisites-loaded', {
                    prerequisites: prerequisites.map(p => ({
                        id: p.id,
                        name: p.name,
                        description: p.description,
                        optional: p.optional || false,
                        plugins: p.plugins?.map((plugin: any) => ({
                            id: plugin.id,
                            name: plugin.name,
                            description: plugin.description
                        }))
                    })),
                    versionComponentMapping,
                    requiredNodeVersions
                });
            }
            
            // If continuing from a specific index, mark previous ones as already checked
            if (startFromIndex > 0) {
                for (let i = 0; i < startFromIndex; i++) {
                    const prereq = prerequisites[i];
                    
                    // Check if we have a stored state for this prerequisite
                    const storedState = this.currentPrerequisiteStates?.get(i);
                    if (storedState) {
                        // Use stored state instead of re-checking
                        await this.sendMessage('prerequisite-status', {
                            index: i,
                            id: prereq.id,
                            status: storedState.installed ? 'success' : 'error',
                            message: storedState.message
                        });
                    } else {
                        // Fallback to checking if no stored state
                        const status = await this.prereqManager.checkPrerequisite(prereq);
                        await this.sendMessage('prerequisite-status', {
                            index: i,
                            id: prereq.id,
                            status: status.installed ? 'success' : 'error',
                            message: status.message || `${prereq.name} ${status.installed ? 'is installed' : 'is not installed'}`
                        });
                    }
                }
            }
            
            // Check each prerequisite sequentially, starting from the specified index
            for (let i = startFromIndex; i < prerequisites.length; i++) {
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
                let status: PrerequisiteStatus;
                if (prereq.perNodeVersion) {
                    // Initialize empty status for perNodeVersion prereqs to avoid wrong context
                    status = {
                        id: prereq.id,
                        name: prereq.name,
                        description: prereq.description,
                        installed: false,  // Will be updated by perNodeVersion logic
                        optional: prereq.optional || false,
                        canInstall: true,
                        message: undefined,
                        plugins: undefined
                        // plugins will be populated during Node version checks
                    };
                } else {
                    status = await this.prereqManager.checkPrerequisite(prereq);
                }
                
                // Special handling for perNodeVersion prerequisites
                if (prereq.perNodeVersion) {
                    // Check if it's installed in all Node versions that need this prerequisite
                    const nodeVersionsNeedingPrereq = await this.getNodeVersionsForPrerequisite(prereq.id);
                    const requiredNodeVersions = Array.from(nodeVersionsNeedingPrereq);
                    
                    if (requiredNodeVersions.length === 0) {
                        // This prerequisite is not needed by any selected components
                        status.message = `${prereq.name} not required for selected components`;
                    } else if (requiredNodeVersions.length > 0) {
                        let installedNodeVersions: string[] = [];
                        let pluginStatusByVersion: Record<string, Array<{id: string; name: string; installed: boolean}>> = {};
                        try {
                            const { stdout: fnmList } = await execAsync('fnm list');
                            const versionLines = fnmList.split('\n').filter(line => line.trim());
                            
                            for (const line of versionLines) {
                                const versionMatch = line.match(/v?(\d+\.\d+\.\d+)/);
                                if (versionMatch) {
                                    installedNodeVersions.push(versionMatch[1]);
                                }
                            }
                        } catch (error) {
                            this.errorLogger.logInfo('Could not query fnm for installed versions', 'Prerequisites');
                        }
                        
                        // Check each required Node version
                        const missingInVersions: string[] = [];
                        const installedInVersions: string[] = [];
                        
                        for (const nodeVer of installedNodeVersions) {
                            const nodeMajor = nodeVer.split('.')[0];
                            
                            // Check if this is a required version family
                            const isRequired = requiredNodeVersions.includes(nodeMajor);
                            
                            if (isRequired) {
                                try {
                                    // Check prerequisite in this Node version's context
                                    const contextualCheckCommand = `eval "$(fnm env)" && fnm use ${nodeVer} && ${prereq.check.command}`;
                                    const { stdout } = await execAsync(contextualCheckCommand);
                                    
                                    // Parse the result based on prereq configuration
                                    let isInstalled = false;
                                    if (prereq.check.parseVersion) {
                                        const versionRegex = new RegExp(prereq.check.parseVersion);
                                        isInstalled = versionRegex.test(stdout);
                                    } else if (prereq.check.contains) {
                                        isInstalled = stdout.includes(prereq.check.contains);
                                    } else {
                                        isInstalled = true; // Command succeeded
                                    }
                                    
                                    if (isInstalled) {
                                        installedInVersions.push(nodeVer);
                                        
                                        // Check plugins if this prerequisite has them
                                        if (prereq.plugins && prereq.plugins.length > 0) {
                                            for (const plugin of prereq.plugins) {
                                                const pluginCheckCommand = `eval "$(fnm env)" && fnm use ${nodeVer} && ${plugin.check.command}`;
                                                try {
                                                    const { stdout: pluginOutput } = await execAsync(pluginCheckCommand);
                                                    const pluginInstalled = plugin.check.contains ? 
                                                        pluginOutput.includes(plugin.check.contains) : true;
                                                    
                                                    // Track plugin status
                                                    if (!pluginStatusByVersion[nodeVer]) {
                                                        pluginStatusByVersion[nodeVer] = [];
                                                    }
                                                    pluginStatusByVersion[nodeVer].push({
                                                        id: plugin.id,
                                                        name: plugin.name,
                                                        installed: pluginInstalled
                                                    });
                                                } catch {
                                                    // Plugin check failed in this version
                                                    if (!pluginStatusByVersion[nodeVer]) {
                                                        pluginStatusByVersion[nodeVer] = [];
                                                    }
                                                    pluginStatusByVersion[nodeVer].push({
                                                        id: plugin.id,
                                                        name: plugin.name,
                                                        installed: false
                                                    });
                                                }
                                            }
                                        }
                                    } else {
                                        missingInVersions.push(nodeVer);
                                    }
                                } catch (error) {
                                    missingInVersions.push(nodeVer);
                                }
                            }
                        }
                        
                        // Update status based on findings
                        if (missingInVersions.length > 0) {
                            status.installed = false;
                            const versionComponentMap = await this.buildNodeVersionComponentMap();
                            const missingWithComponents = missingInVersions.map(v => {
                                const vMajor = v.split('.')[0];
                                const component = versionComponentMap.get(vMajor) || '';
                                return `Node ${v}${component ? ` (${component})` : ''}`;
                            });
                            status.message = `${prereq.name} missing in: ${missingWithComponents.join(', ')}`;
                        } else if (installedInVersions.length > 0) {
                            // Check if we have it in ALL required versions
                            const allRequiredVersions = installedNodeVersions.filter(nodeVer => {
                                const nodeMajor = nodeVer.split('.')[0];
                                return requiredNodeVersions.includes(nodeMajor);
                            });
                            
                            if (installedInVersions.length === allRequiredVersions.length) {
                                // Installed in all required versions
                                status.installed = true;
                                status.message = `${prereq.name} installed in all required Node versions`;
                            } else {
                                // Partial installation - show what's missing
                                status.installed = false;
                                const versionComponentMap = await this.buildNodeVersionComponentMap();
                                
                                // Find which required versions don't have it
                                const stillMissingVersions = allRequiredVersions.filter(v => 
                                    !installedInVersions.includes(v)
                                );
                                
                                const missingWithComponents = stillMissingVersions.map(v => {
                                    const vMajor = v.split('.')[0];
                                    const component = versionComponentMap.get(vMajor) || '';
                                    return `Node ${v}${component ? ` (${component})` : ''}`;
                                });
                                
                                status.message = `${prereq.name} missing in: ${missingWithComponents.join(', ')}`;
                            }
                            
                            // Aggregate plugin status across all installed versions
                            if (prereq.plugins && prereq.plugins.length > 0) {
                                status.plugins = prereq.plugins.map((plugin: PrerequisitePlugin) => {
                                    // A plugin is considered installed if it's installed in ALL Node versions where the prerequisite is installed
                                    const installedInAll = installedInVersions.every(nodeVer => {
                                        const versionPlugins = pluginStatusByVersion[nodeVer];
                                        return versionPlugins && versionPlugins.find(p => p.id === plugin.id)?.installed;
                                    });
                                    
                                    return {
                                        id: plugin.id,
                                        name: plugin.name,
                                        installed: installedInAll
                                    };
                                });
                            }
                        }
                    }
                }
                
                // Special handling for Node.js - check if ALL required versions are installed
                if (prereq.id === 'node') {
                    // Get required version families from components.json (single source of truth)
                    const registryManager = new ComponentRegistryManager(this.context.extensionPath);
                    const requiredVersionSet = await registryManager.getRequiredNodeVersions(
                        this.currentComponentSelection?.frontend,
                        this.currentComponentSelection?.backend,
                        this.currentComponentSelection?.dependencies,
                        this.currentComponentSelection?.externalSystems,
                        this.currentComponentSelection?.appBuilderApps
                    );
                    const requiredVersions = Array.from(requiredVersionSet);
                    
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
                            this.errorLogger.logInfo('Could not query fnm for installed versions', 'Prerequisites');
                        }
                        
                        // Check which required versions are missing
                        const missingVersions: string[] = [];
                        const installedMajorVersions = installedVersions.map(v => v.split('.')[0]);
                        
                        for (const reqVersion of requiredVersions) {
                            // Since we resolved versions, we're now dealing with actual version numbers
                            const reqMajor = reqVersion.split('.')[0];
                            if (!installedMajorVersions.includes(reqMajor)) {
                                missingVersions.push(reqVersion);
                            }
                        }
                        
                        // Build version component mapping
                        const versionComponentMap = await this.buildNodeVersionComponentMap();
                        
                        // Update status based on missing versions
                        if (missingVersions.length > 0) {
                            status.installed = false;
                            
                            // Build structured data for mixed color rendering
                            const nodeVersionStatus: Array<{version: string; component: string; installed: boolean}> = [];
                            
                            // Add installed versions
                            const installedRequiredVersions = installedVersions.filter(v => {
                                const major = v.split('.')[0];
                                return requiredVersions.some(reqVer => reqVer === major);
                            });
                            
                            installedRequiredVersions.forEach(v => {
                                const major = v.split('.')[0];
                                const component = versionComponentMap.get(major) || '';
                                nodeVersionStatus.push({
                                    version: v,
                                    component,
                                    installed: true
                                });
                            });
                            
                            // Add missing versions
                            missingVersions.forEach(v => {
                                const component = versionComponentMap.get(v) || '';
                                nodeVersionStatus.push({
                                    version: `${v}.x`,
                                    component,
                                    installed: false
                                });
                            });
                            
                            // Store structured data
                            (status as any).nodeVersionStatus = nodeVersionStatus;
                            
                            // Store missing versions for later installation
                            (status as any).missingVersions = missingVersions;
                            (status as any).installedVersions = installedRequiredVersions;
                        } else {
                            // All required versions are installed - filter to only show required ones
                            status.installed = true;
                            const requiredInstalledVersions = installedVersions.filter(v => {
                                const major = v.split('.')[0];
                                return requiredVersions.some(reqVer => reqVer === major);
                            });
                            
                            const messageParts: string[] = [];
                            requiredInstalledVersions.forEach(v => {
                                const majorVersion = v.split('.')[0];
                                const component = versionComponentMap.get(majorVersion) || '';
                                messageParts.push(`${v}${component ? ` (${component})` : ''}`);
                            });
                            status.message = messageParts.join(', ');
                            (status as any).installedVersions = requiredInstalledVersions;
                        }
                    }
                }
                
                // Log result
                if (status.installed) {
                    this.errorLogger.logInfo(`${prereq.name} found: ${status.version || 'version unknown'}`, 'Prerequisites');
                } else {
                    this.errorLogger.logInfo(`${prereq.name} not installed${status.message ? ': ' + status.message : ''}`, 'Prerequisites');
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
                    nodeVersionStatus: (status as any).nodeVersionStatus,
                    missingVersions: (status as any).missingVersions,
                    installedVersions: (status as any).installedVersions
                });
                
                // Stop checking if this prerequisite failed and is not optional
                if (!status.installed && !prereq.optional) {
                    this.errorLogger.logInfo(
                        `Prerequisite ${prereq.name} needs to be installed`,
                        'Prerequisites'
                    );
                    
                    // Send a message to UI that we're stopping
                    await this.sendMessage('prerequisite-check-stopped', {
                        stoppedAt: i,
                        reason: `${prereq.name} must be installed before continuing`
                    });
                    
                    // Mark remaining prerequisites as pending
                    for (let j = i + 1; j < prerequisites.length; j++) {
                        await this.sendMessage('prerequisite-status', {
                            index: j,
                            id: prerequisites[j].id,
                            status: 'pending'
                            // No message - frontend will show "Waiting..."
                        });
                    }
                    
                    break; // Stop checking further prerequisites
                }
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
            
            // Get install commands
            let nodeVersions: string[] = [];
            
            // For Node.js, get required versions and filter out already installed ones
            if (prereq.id === 'node') {
                // Get required version families from components.json (single source of truth)
                const registryManager = new ComponentRegistryManager(this.context.extensionPath);
                const requiredVersionSet = await registryManager.getRequiredNodeVersions(
                    this.currentComponentSelection?.frontend,
                    this.currentComponentSelection?.backend,
                    this.currentComponentSelection?.dependencies,
                    this.currentComponentSelection?.externalSystems,
                    this.currentComponentSelection?.appBuilderApps
                );
                const requiredVersions = Array.from(requiredVersionSet);
                
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
                
                // Filter out already installed version families
                const versionsToInstall: string[] = [];
                for (const versionFamily of requiredVersions) {
                    // Check if this version family is already installed
                    if (!installedMajorVersions.includes(versionFamily)) {
                        versionsToInstall.push(versionFamily);
                        this.errorLogger.logInfo(`Will install Node.js ${versionFamily}.x`, 'Prerequisites');
                    } else {
                        this.errorLogger.logInfo(`Node.js ${versionFamily}.x already installed`, 'Prerequisites');
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
                    
                    // Send install complete to continue checking other prerequisites
                    await this.sendMessage('prerequisite-install-complete', {
                        index,
                        id: prereqId,
                        continueChecking: true
                    });
                    return;
                }
                
                // Resolve major versions to actual versions using fnm list-remote
                const resolvedVersions: string[] = [];
                for (const majorVersion of versionsToInstall) {
                    try {
                        const { stdout } = await execAsync(`fnm list-remote | grep "^v${majorVersion}\\." | tail -1`);
                        if (stdout) {
                            // Remove 'v' prefix and any codename in parentheses (e.g., "(Iron)")
                            let fullVersion = stdout.trim().replace('v', '');
                            // Remove codename if present (e.g., "20.19.4 (Iron)" -> "20.19.4")
                            fullVersion = fullVersion.replace(/\s*\([^)]+\).*$/, '');
                            resolvedVersions.push(fullVersion);
                            this.errorLogger.logInfo(`Resolved Node.js ${majorVersion} to ${fullVersion}`, 'Prerequisites');
                        } else {
                            // Fallback to major version if resolution fails
                            resolvedVersions.push(majorVersion);
                            this.errorLogger.logWarning(`Could not resolve Node.js ${majorVersion}, using major version`, 'Prerequisites');
                        }
                    } catch (error) {
                        // If fnm list-remote fails, fall back to major version
                        resolvedVersions.push(majorVersion);
                        this.errorLogger.logWarning(`Failed to resolve Node.js ${majorVersion}: ${error}`, 'Prerequisites');
                    }
                }
                
                nodeVersions = resolvedVersions;
            }
            
            // Check if this prerequisite needs to be installed per Node version
            if (prereq.perNodeVersion) {
                await this.installPerNodeVersion(index, prereqId, prereq);
                return;
            }
            
            const installInfo = this.prereqManager.getInstallSteps(prereq, {
                nodeVersions: prereq.id === 'node' ? nodeVersions : undefined,
                preferredMethod: 'homebrew' // Could be configured
            });
            
            if (!installInfo) {
                this.errorLogger.logWarning(`No installation method available for ${prereq.name}`, 'Prerequisites');
                await this.sendMessage('prerequisite-status', {
                    index,
                    id: prereqId,
                    status: 'error',
                    message: 'No installation method available'
                });
                return;
            }
            
            if (installInfo.manual) {
                // Manual installation required
                this.errorLogger.logWarning(`Manual installation required for ${prereq.name}`, 'Prerequisites');
                
                await this.sendMessage('prerequisite-status', {
                    index,
                    id: prereqId,
                    status: 'warning',
                    message: `Manual installation required. Please visit: ${installInfo.url}`
                });
                return;
            }
            
            // Execute installation steps using ProgressUnifier
            const steps = installInfo.steps;
            const totalSteps = steps.length;
            
            // For Node.js, we need to loop through each version
            if (prereq.id === 'node' && nodeVersions && nodeVersions.length > 0) {
                // First, determine which version should be set as default based on component requirements
                let versionToSetAsDefault: string | null = null;
                
                // Get the versions that actually need AIO CLI based on component requirements
                // This uses the same logic that determines where AIO CLI will be installed
                const versionsNeedingAioCli = await this.getNodeVersionsForPrerequisite('aio-cli');
                this.errorLogger.logInfo(`Node versions needing AIO CLI: ${Array.from(versionsNeedingAioCli).join(', ')}`, 'Prerequisites');
                
                // Find installed versions that match the requirements
                const installedVersionsNeedingAioCli = nodeVersions.filter(version => {
                    const majorVersion = version.split('.')[0];
                    return versionsNeedingAioCli.has(majorVersion);
                });
                
                if (installedVersionsNeedingAioCli.length > 0) {
                    // Select the highest version that will need AIO CLI
                    versionToSetAsDefault = installedVersionsNeedingAioCli.reduce((latest, current) => {
                        const latestParts = latest.split('.').map(Number);
                        const currentParts = current.split('.').map(Number);
                        // Compare major version first
                        if (currentParts[0] > latestParts[0]) return current;
                        if (currentParts[0] < latestParts[0]) return latest;
                        // If major versions are equal, compare minor
                        if (currentParts[1] > latestParts[1]) return current;
                        if (currentParts[1] < latestParts[1]) return latest;
                        // If minor versions are equal, compare patch
                        if (currentParts[2] > latestParts[2]) return current;
                        return latest;
                    });
                    this.errorLogger.logInfo(`Will set Node.js ${versionToSetAsDefault} as default (will be used with AIO CLI)`, 'Prerequisites');
                } else {
                    // No specific AIO CLI requirements, use the latest version
                    versionToSetAsDefault = nodeVersions.reduce((latest, current) => {
                        const latestParts = latest.split('.').map(Number);
                        const currentParts = current.split('.').map(Number);
                        if (currentParts[0] > latestParts[0]) return current;
                        if (currentParts[0] < latestParts[0]) return latest;
                        if (currentParts[1] > latestParts[1]) return current;
                        if (currentParts[1] < latestParts[1]) return latest;
                        if (currentParts[2] > latestParts[2]) return current;
                        return latest;
                    });
                    this.errorLogger.logInfo(`No specific AIO CLI requirements, will set ${versionToSetAsDefault} as default (latest version)`, 'Prerequisites');
                }
                
                // Now install all Node versions, including "Set as default" for the selected one
                for (let versionIndex = 0; versionIndex < nodeVersions.length; versionIndex++) {
                    const currentVersion = nodeVersions[versionIndex];
                    const isDefault = currentVersion === versionToSetAsDefault;
                    
                    // Build steps for this version
                    const versionSteps: InstallStep[] = [];
                    const installStep = steps.find(s => s.name === "Install Node.js");
                    const setDefaultStep = steps.find(s => s.name === "Set as default");
                    
                    if (installStep) {
                        versionSteps.push(installStep);
                    }
                    
                    // Add "Set as default" step only for the version we want as default
                    if (isDefault && setDefaultStep) {
                        versionSteps.push(setDefaultStep);
                    }
                    
                    const totalStepsForVersion = versionSteps.length;
                    
                    // Main message for this version
                    let versionMessage = nodeVersions.length > 1 
                        ? `Installing Node.js ${currentVersion} (Version ${versionIndex + 1} of ${nodeVersions.length})`
                        : `Installing Node.js ${currentVersion}`;
                    
                    // Process all steps for this version
                    for (let stepIndex = 0; stepIndex < versionSteps.length; stepIndex++) {
                        const step = versionSteps[stepIndex];
                        
                        try {
                            // Determine the step message
                            let stepMessage = versionMessage;
                            let stepName = "";
                            
                            if (step.name === "Install Node.js") {
                                stepName = "Installing Node.js";
                            } else if (step.name === "Set as default") {
                                stepName = "Setting as default";
                            }
                            
                            // Send initial status for this step with progress info to avoid UI blip
                            await this.sendMessage('prerequisite-status', {
                                index,
                                id: prereqId,
                                status: 'checking',
                                message: stepMessage,
                                unifiedProgress: {
                                    overall: {
                                        percent: Math.round((stepIndex / totalStepsForVersion) * 100),
                                        currentStep: stepIndex + 1,
                                        totalSteps: totalStepsForVersion,
                                        stepName: stepName
                                    }
                                }
                            });
                            
                            // Create progress handler for this step
                            const onProgress = async (progress: UnifiedProgress) => {
                                // Calculate percentage based on step position
                                // If this is the final update (no command object), ensure we hit the right percentage
                                let calculatedPercent;
                                if (!progress.command) {
                                    // Final update from ProgressUnifier - ensure we complete this step
                                    calculatedPercent = Math.round(((stepIndex + 1) / totalStepsForVersion) * 100);
                                } else {
                                    // Progress update - calculate based on command progress
                                    calculatedPercent = Math.round(((stepIndex + (progress.command.percent || 0) / 100) / totalStepsForVersion) * 100);
                                }
                                
                                await this.sendMessage('prerequisite-status', {
                                    index,
                                    id: prereqId,
                                    status: 'checking',
                                    message: stepMessage,
                                    unifiedProgress: {
                                        ...progress,
                                        overall: {
                                            ...progress.overall,
                                            percent: calculatedPercent,
                                            currentStep: stepIndex + 1,
                                            totalSteps: totalStepsForVersion,
                                            stepName: stepName
                                        }
                                    }
                                });
                            };
                            
                            // Log the step
                            this.errorLogger.logInfo(`Node.js ${currentVersion} - Step ${stepIndex + 1}/${totalStepsForVersion}: ${step.name}`, 'Prerequisites');
                            
                            // Execute the step with progress tracking
                            await this.progressUnifier.executeStep(
                                step,
                                stepIndex,
                                totalStepsForVersion,
                                onProgress,
                                { nodeVersion: currentVersion }
                            );
                            
                            // Ensure this step reaches 100% completion
                            const stepCompletePercent = Math.round(((stepIndex + 1) / totalStepsForVersion) * 100);
                            await this.sendMessage('prerequisite-status', {
                                index,
                                id: prereqId,
                                status: 'checking',
                                message: stepMessage,
                                unifiedProgress: {
                                    overall: {
                                        percent: stepCompletePercent,
                                        currentStep: stepIndex + 1,
                                        totalSteps: totalStepsForVersion,
                                        stepName: stepName
                                    }
                                }
                            });
                            
                        } catch (error: any) {
                            const errorDetails = `Node.js ${currentVersion} - ${step.name}\nError: ${error.message}`;
                            this.errorLogger.logError(
                                new Error(`Failed: ${step.name} for Node.js ${currentVersion}`),
                                'Prerequisites',
                                false,
                                errorDetails
                            );
                            throw error;
                        }
                    }
                    
                    // Add a brief delay before starting the next version (if any)
                    if (versionIndex < nodeVersions.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                }
            } else {
                // Non-Node.js prerequisite installation or Node.js with no versions specified
                for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
                    const step = steps[stepIndex];
                    
                    try {
                        // Check for special commands that need custom handling
                        if (step.commands && step.commands.includes('configureFnmShell')) {
                            // Handle shell configuration specially
                            await this.sendMessage('prerequisite-status', {
                                index,
                                id: prereqId,
                                status: 'checking',
                                message: step.message || 'Configuring shell environment...',
                                unifiedProgress: {
                                    overall: {
                                    percent: Math.round(((stepIndex + 0.5) / totalSteps) * 100),
                                    currentStep: stepIndex + 1,
                                    totalSteps,
                                    stepName: step.name
                                },
                                command: {
                                    type: 'indeterminate',
                                    detail: 'Configuring shell...',
                                    confidence: 'exact'
                                }
                            }
                        });
                        
                        await this.configureFnmShell(index, prereqId);
                        
                        await this.sendMessage('prerequisite-status', {
                            index,
                            id: prereqId,
                            status: 'checking',
                            message: 'Shell configuration complete',
                            unifiedProgress: {
                                overall: {
                                    percent: Math.round(((stepIndex + 1) / totalSteps) * 100),
                                    currentStep: stepIndex + 1,
                                    totalSteps,
                                    stepName: step.name
                                },
                                command: {
                                    type: 'determinate',
                                    percent: 100,
                                    detail: 'Complete',
                                    confidence: 'exact'
                                }
                            }
                        });
                    } else {
                        // Create progress handler
                        const onProgress = async (progress: UnifiedProgress) => {
                            await this.sendMessage('prerequisite-status', {
                                index,
                                id: prereqId,
                                status: 'checking',
                                message: step.message || step.name,
                                unifiedProgress: progress
                            });
                        };
                        
                        // Log the step
                        this.errorLogger.logInfo(`Executing step ${stepIndex + 1}/${totalSteps}: ${step.name}`, 'Prerequisites');
                        
                        // Execute the step with progress tracking
                        await this.progressUnifier.executeStep(
                            step,
                            stepIndex,
                            totalSteps,
                            onProgress
                        );
                    }
                    
                } catch (error: any) {
                    // Check if we should continue on error
                    if (!step.continueOnError) {
                        const errorDetails = `Step: ${step.name}\nError: ${error.message}`;
                        this.errorLogger.logError(
                            new Error(`Failed to execute step: ${step.name}`),
                            'Prerequisites',
                            false,
                            errorDetails
                        );
                        throw error;
                    }
                    
                    this.errorLogger.logWarning(`Step failed but continuing: ${step.name}`, 'Prerequisites');
                }
            }
            }
            
            // Check if installation was successful
            const status = await this.prereqManager.checkPrerequisite(prereq);
            const success = status.installed;
            
            // Log result
            let successMessage = `${prereq.name} installed successfully`;
            
            if (success) {
                // For Node.js, build a detailed message with component mappings
                if (prereq.id === 'node') {
                    // Get all installed versions
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
                    
                    // Build detailed message with component mappings
                    const versionComponentMap = await this.buildNodeVersionComponentMap();
                    successMessage = 'Node.js installed';
                    installedVersions.forEach(v => {
                        const majorVersion = v.split('.')[0];
                        const component = versionComponentMap.get(majorVersion) || '';
                        successMessage += `\n${v}${component ? ` (${component})` : ''}`;
                    });
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
            
            // If installation was successful, continue checking remaining prerequisites
            if (success) {
                // Store success state
                if (!this.currentPrerequisiteStates) {
                    this.currentPrerequisiteStates = new Map();
                }
                this.currentPrerequisiteStates.set(index, {
                    installed: true,
                    message: successMessage
                });
                
                this.errorLogger.logInfo(`${prereq.name} installed successfully, continuing prerequisite checks`, 'Prerequisites');
                await this.sendMessage('prerequisite-install-complete', {
                    index,
                    id: prereqId,
                    continueChecking: true
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

    private async installPerNodeVersion(index: number, prereqId: string, prereq: PrerequisiteDefinition): Promise<void> {
        try {
            // Get all installed Node versions
            let installedNodeVersions: string[] = [];
            try {
                const { stdout: fnmList } = await execAsync('fnm list');
                const versionLines = fnmList.split('\n').filter(line => line.trim());
                
                for (const line of versionLines) {
                    const versionMatch = line.match(/v?(\d+\.\d+\.\d+)/);
                    if (versionMatch) {
                        installedNodeVersions.push(versionMatch[1]);
                    }
                }
                this.errorLogger.logInfo(`Found Node versions for ${prereq.name} installation: ${installedNodeVersions.join(', ')}`, 'Prerequisites');
            } catch (error) {
                this.errorLogger.logError(new Error('No Node versions found for per-version installation'), 'Prerequisites');
                await this.sendMessage('prerequisite-status', {
                    index,
                    id: prereqId,
                    status: 'error',
                    message: 'No Node.js versions found. Please install Node.js first.'
                });
                return;
            }
            
            // Get Node versions that actually need this prerequisite based on selected components
            const nodeVersionsNeedingPrereq = await this.getNodeVersionsForPrerequisite(prereqId);
            
            // Filter to only install in Node versions that need this prerequisite
            const versionsToInstallIn: string[] = [];
            for (const installedVer of installedNodeVersions) {
                const installedMajor = installedVer.split('.')[0];
                
                // Check if this installed version matches any version that needs this prerequisite
                if (nodeVersionsNeedingPrereq.has(installedMajor)) {
                    versionsToInstallIn.push(installedVer);
                }
            }
            
            if (versionsToInstallIn.length === 0) {
                this.errorLogger.logInfo(`${prereq.name} not needed by any selected components`, 'Prerequisites');
                await this.sendMessage('prerequisite-status', {
                    index,
                    id: prereqId,
                    status: 'success',
                    message: `${prereq.name} not required for selected components`
                });
                return;
            }
            
            // Get installation steps
            const installInfo = this.prereqManager.getInstallSteps(prereq);
            
            if (!installInfo || installInfo.manual) {
                this.errorLogger.logWarning(`Cannot install ${prereq.name} per Node version`, 'Prerequisites');
                await this.sendMessage('prerequisite-status', {
                    index,
                    id: prereqId,
                    status: 'error',
                    message: `Cannot install ${prereq.name} automatically`
                });
                return;
            }
            
            // Install in each Node version
            let successCount = 0;
            let failedVersions: string[] = [];
            
            for (let i = 0; i < versionsToInstallIn.length; i++) {
                const nodeVersion = versionsToInstallIn[i];
                const versionComponentMap = await this.buildNodeVersionComponentMap();
                const componentName = versionComponentMap.get(nodeVersion) || '';
                
                const baseMessage = `Installing ${prereq.name} in Node ${nodeVersion}${componentName ? ` (${componentName})` : ''}`;
                await this.sendMessage('prerequisite-status', {
                    index,
                    id: prereqId,
                    status: 'checking',
                    message: `${baseMessage}... (${i + 1}/${versionsToInstallIn.length})`
                });
                
                try {
                    // Execute each installation step using ProgressUnifier
                    const totalSteps = installInfo.steps.length;
                    
                    for (let stepIndex = 0; stepIndex < installInfo.steps.length; stepIndex++) {
                        const step = installInfo.steps[stepIndex];
                        
                        // Create a modified step with fnm context prepended to commands
                        const contextualStep = {
                            ...step,
                            commands: step.commands?.map(cmd => 
                                `eval "$(fnm env)" && fnm use ${nodeVersion} && ${cmd}`
                            ) || (step.commandTemplate ? 
                                [`eval "$(fnm env)" && fnm use ${nodeVersion} && ${step.commandTemplate}`] : 
                                []
                            )
                        };
                        
                        // Create progress handler
                        const onProgress = async (progress: UnifiedProgress) => {
                            await this.sendMessage('prerequisite-status', {
                                index,
                                id: prereqId,
                                status: 'checking',
                                message: `${baseMessage} (${i + 1}/${versionsToInstallIn.length})`,
                                unifiedProgress: progress
                            });
                        };
                        
                        this.errorLogger.logInfo(`Executing step ${stepIndex + 1}/${totalSteps} in Node ${nodeVersion}: ${step.name}`, 'Prerequisites');
                        
                        try {
                            // Use ProgressUnifier for better progress tracking
                            await this.progressUnifier.executeStep(
                                contextualStep,
                                stepIndex,
                                totalSteps,
                                onProgress
                            );
                            
                                // For aio-cli, verify the binary was installed
                                let binaryInstalled = false;
                                if (prereq.id === 'aio-cli') {
                                    try {
                                        // Check if aio command is available in this Node version
                                        const checkCmd = `eval "$(fnm env)" && fnm use ${nodeVersion} && which aio`;
                                        await execAsync(checkCmd);
                                        binaryInstalled = true;
                                        this.errorLogger.logInfo(`Verified aio CLI is available in Node ${nodeVersion}`, 'Prerequisites');
                                    } catch {
                                        this.errorLogger.logWarning(`Could not verify aio CLI in Node ${nodeVersion}`, 'Prerequisites');
                                    }
                                }
                        } catch (stepError: any) {
                            this.errorLogger.logError(
                                stepError,
                                `Installing ${prereq.name} in Node ${nodeVersion} - Step ${stepIndex + 1}`,
                                false
                            );
                            
                            // Check for specific error conditions
                            if (stepError.message?.includes('EBADENGINE') || 
                                stepError.message?.includes('engine')) {
                                this.errorLogger.logWarning(
                                    `Package incompatible with Node ${nodeVersion}, skipping`,
                                    'Prerequisites'
                                );
                                // Consider this a success since it's an expected incompatibility
                                break;
                            } else {
                                throw stepError;
                            }
                        }
                    }
                    
                    successCount++;
                    this.errorLogger.logInfo(`${prereq.name} installed successfully in Node ${nodeVersion}`, 'Prerequisites');
                    
                } catch (error) {
                    this.errorLogger.logError(
                        error as Error, 
                        `Installing ${prereq.name} in Node ${nodeVersion}`,
                        false
                    );
                    failedVersions.push(nodeVersion);
                }
            }
            
            // Report final status
            if (successCount === versionsToInstallIn.length) {
                const successMessage = `${prereq.name} installed in ${successCount} Node version${successCount > 1 ? 's' : ''}`;
                
                // Store success state
                if (!this.currentPrerequisiteStates) {
                    this.currentPrerequisiteStates = new Map();
                }
                this.currentPrerequisiteStates.set(index, {
                    installed: true,
                    message: successMessage
                });
                
                await this.sendMessage('prerequisite-status', {
                    index,
                    id: prereqId,
                    status: 'success',
                    message: successMessage
                });
                
                // Send completion signal to continue checking
                await this.sendMessage('prerequisite-install-complete', {
                    index,
                    id: prereqId,
                    continueChecking: true
                });
            } else if (successCount > 0) {
                const warningMessage = `${prereq.name} installed in ${successCount}/${versionsToInstallIn.length} Node versions. Failed: ${failedVersions.join(', ')}`;
                
                // Store partial success state
                if (!this.currentPrerequisiteStates) {
                    this.currentPrerequisiteStates = new Map();
                }
                this.currentPrerequisiteStates.set(index, {
                    installed: true,  // Partial success is still success
                    message: warningMessage
                });
                
                await this.sendMessage('prerequisite-status', {
                    index,
                    id: prereqId,
                    status: 'warning',
                    message: warningMessage
                });
                
                // Partial success - still continue
                await this.sendMessage('prerequisite-install-complete', {
                    index,
                    id: prereqId,
                    continueChecking: true
                });
            } else {
                await this.sendMessage('prerequisite-status', {
                    index,
                    id: prereqId,
                    status: 'error',
                    message: `Failed to install ${prereq.name} in any Node version`
                });
                // Don't continue on complete failure
            }
            
        } catch (error) {
            this.errorLogger.logError(error as Error, `Installing ${prereq.name} per Node version`, true);
            
            await this.sendMessage('prerequisite-status', {
                index,
                id: prereqId,
                status: 'error',
                message: `Error installing ${prereq.name}: ${error}`
            });
        }
    }

    private async getNodeVersionsForPrerequisite(prereqId: string): Promise<Set<string>> {
        const nodeVersions = new Set<string>();
        
        // Load prerequisites config to find which components need this prerequisite
        const prereqsConfig = await this.prereqManager.loadConfig();
        const componentRequirements = prereqsConfig.componentRequirements || {};
        
        // Find components that require this prerequisite
        const componentsNeedingPrereq: string[] = [];
        for (const [componentId, requirements] of Object.entries(componentRequirements)) {
            if (requirements.prerequisites?.includes(prereqId)) {
                componentsNeedingPrereq.push(componentId);
            }
            // Also check for plugins (like api-mesh plugin for aio-cli)
            if (prereqId === 'aio-cli' && requirements.plugins && requirements.plugins.length > 0) {
                componentsNeedingPrereq.push(componentId);
            }
        }
        
        // Get all selected components
        const selectedComponents: string[] = [];
        if (this.currentComponentSelection?.frontend) {
            selectedComponents.push(this.currentComponentSelection.frontend);
        }
        if (this.currentComponentSelection?.backend) {
            selectedComponents.push(this.currentComponentSelection.backend);
        }
        if (this.currentComponentSelection?.dependencies) {
            selectedComponents.push(...this.currentComponentSelection.dependencies);
        }
        if (this.currentComponentSelection?.appBuilderApps) {
            selectedComponents.push(...this.currentComponentSelection.appBuilderApps);
        }
        
        // Find intersection - components that are both selected AND need this prerequisite
        const relevantComponents = componentsNeedingPrereq.filter(c => 
            selectedComponents.includes(c)
        );
        
        // Get Node versions for these components from components.json
        const registryManager = new ComponentRegistryManager(this.context.extensionPath);
        for (const componentId of relevantComponents) {
            const component = await registryManager.getComponentById(componentId);
            if (component?.configuration?.nodeVersion) {
                nodeVersions.add(component.configuration.nodeVersion);
            }
        }
        
        this.errorLogger.logInfo(`Prerequisite ${prereqId} needed in Node versions: ${Array.from(nodeVersions).join(', ')} (for components: ${relevantComponents.join(', ')})`, 'Prerequisites');
        
        return nodeVersions;
    }

    private async buildNodeVersionComponentMap(): Promise<Map<string, string>> {
        // Build a mapping of Node version families to component names from configuration
        const versionMap = new Map<string, string>();
        
        if (!this.currentComponentSelection) {
            return versionMap;
        }
        
        // Load component data if not available
        let componentsData = this.componentsData;
        if (!componentsData) {
            // Load components data directly
            const registryManager = new ComponentRegistryManager(this.context.extensionPath);
            try {
                const [frontends, dependencies, appBuilder] = await Promise.all([
                    registryManager.getFrontends(),
                    registryManager.getDependencies(),
                    registryManager.getAppBuilder()
                ]);
                componentsData = {
                    frontends,
                    dependencies,
                    appBuilder
                };
            } catch (error) {
                this.errorLogger.logWarning('Could not load components data for mapping', 'Prerequisites');
                return versionMap;
            }
        }
        
        // Get Node versions directly from component definitions (single source of truth)
        // Check frontend component
        if (this.currentComponentSelection.frontend) {
            const frontend = componentsData.frontends?.find((f: any) => f.id === this.currentComponentSelection.frontend);
            if (frontend?.configuration?.nodeVersion) {
                const version = frontend.configuration.nodeVersion;
                versionMap.set(version, frontend.name || this.currentComponentSelection.frontend);
            }
        }
        
        // Check backend component (if we have backends)
        if (this.currentComponentSelection.backend) {
            // Note: backends aren't currently in componentsData, but if they were:
            const backends = (componentsData as any).backends;
            if (backends) {
                const backend = backends.find((b: any) => b.id === this.currentComponentSelection.backend);
                if (backend?.configuration?.nodeVersion) {
                    const version = backend.configuration.nodeVersion;
                    const existing = versionMap.get(version);
                    const name = backend.name || this.currentComponentSelection.backend;
                    versionMap.set(version, existing ? `${existing}, ${name}` : name);
                }
            }
        }
        
        // Check dependencies
        this.currentComponentSelection.dependencies?.forEach((depId: string) => {
            const dep = componentsData.dependencies?.find((d: any) => d.id === depId);
            if (dep?.configuration?.nodeVersion) {
                const version = dep.configuration.nodeVersion;
                const existing = versionMap.get(version);
                const name = dep.name || depId;
                versionMap.set(version, existing ? `${existing}, ${name}` : name);
            }
        });
        
        // Check App Builder apps
        this.currentComponentSelection.appBuilderApps?.forEach((appId: string) => {
            const app = componentsData.appBuilder?.find((a: any) => a.id === appId);
            if (app?.configuration?.nodeVersion) {
                const version = app.configuration.nodeVersion;
                const existing = versionMap.get(version);
                const name = app.name || appId;
                versionMap.set(version, existing ? `${existing}, ${name}` : name);
            }
        });
        
        return versionMap;
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

    private async configureFnmShell(index: number, prereqId: string): Promise<void> {
        try {
            this.errorLogger.logInfo('Configuring fnm for shell environment', 'Prerequisites');
            
            await this.sendMessage('prerequisite-status', {
                index,
                id: prereqId,
                status: 'checking',
                message: 'Configuring fnm for your shell...'
            });
            
            // Detect user's shell
            const shell = process.env.SHELL || '/bin/zsh';
            const shellName = shell.includes('zsh') ? 'zsh' : 
                            shell.includes('bash') ? 'bash' : 
                            shell.includes('fish') ? 'fish' : 'zsh';
            
            // Determine config file
            const homeDir = process.env.HOME || '~';
            const configFile = shellName === 'zsh' ? `${homeDir}/.zshrc` :
                              shellName === 'bash' ? `${homeDir}/.bashrc` :
                              shellName === 'fish' ? `${homeDir}/.config/fish/config.fish` :
                              `${homeDir}/.zshrc`;
            
            // Prepare the fnm configuration line
            const fnmConfigLine = shellName === 'fish' 
                ? 'fnm env --use-on-cd | source'
                : 'eval "$(fnm env --use-on-cd)"';
            
            // Check if fnm config already exists in shell profile
            try {
                const { stdout: fileContent } = await execAsync(`cat ${configFile}`);
                if (fileContent.includes('fnm env')) {
                    this.errorLogger.logInfo('fnm already configured in shell profile', 'Prerequisites');
                    return;
                }
            } catch {
                // File might not exist, that's okay
                this.errorLogger.logInfo(`Shell config file ${configFile} not found, will create`, 'Prerequisites');
            }
            
            // Add fnm to shell configuration
            const commands = [
                `echo '' >> ${configFile}`,
                `echo '# fnm - Fast Node Manager' >> ${configFile}`,
                `echo '${fnmConfigLine}' >> ${configFile}`
            ];
            
            for (const command of commands) {
                try {
                    await execAsync(command);
                    this.errorLogger.logInfo(`Executed: ${command}`, 'Prerequisites');
                } catch (error: any) {
                    this.errorLogger.logWarning(`Failed to execute: ${command}`, 'Prerequisites');
                }
            }
            
            // Update message to inform user
            await this.sendMessage('prerequisite-status', {
                index,
                id: prereqId,
                status: 'checking',
                message: `fnm configured for ${shellName}. Please restart your terminal or run: source ${configFile}`
            });
            
            // Try to source the config file for the current session
            // Note: This might not work in all contexts, but worth trying
            try {
                await execAsync(`source ${configFile}`);
            } catch {
                // Expected to fail in some contexts, that's okay
                this.errorLogger.logInfo('Could not source shell config in current context', 'Prerequisites');
            }
            
        } catch (error: any) {
            this.errorLogger.logWarning(`Error configuring fnm shell: ${error.message}`, 'Prerequisites');
            // Don't fail the installation, just log the warning
        }
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