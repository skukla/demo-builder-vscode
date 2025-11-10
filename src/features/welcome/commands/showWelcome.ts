import * as path from 'path';
import * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base';
import type { WebviewCommunicationManager } from '@/core/communication';
import { getWebviewHTMLWithBundles } from '@/core/utils/getWebviewHTMLWithBundles';

export class WelcomeWebviewCommand extends BaseWebviewCommand {

    /**
     * Static method to dispose any active Welcome panel
     * Useful for cleanup when transitioning to other views (e.g., after project creation)
     */
    public static disposeActivePanel(): void {
        const panel = BaseWebviewCommand.getActivePanel('demoBuilderWelcome');
        panel?.dispose();
    }

    public async execute(): Promise<void> {
        this.logger.info('[UI] Showing Demo Builder Welcome screen...');

        await this.createOrRevealPanel();
        if (!this.communicationManager) {
            await this.initializeCommunication();
            this.logger.debug('Welcome webview initialized with handshake protocol');
        }
    }

    protected getWebviewId(): string {
        return 'demoBuilderWelcome';
    }

    protected getWebviewTitle(): string {
        return 'Demo Builder';
    }

    protected getLoadingMessage(): string {
        return 'Loading Demo Builder...';
    }

    protected async getInitialData(): Promise<unknown> {
        return {
            theme: vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light',
            workspacePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
        };
    }

    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        comm.onStreaming('create-new', async () => {
            // Start webview transition to prevent auto-welcome reopening
            BaseWebviewCommand.startWebviewTransition();
            WelcomeWebviewCommand.disposeActivePanel();
            await new Promise(resolve => setTimeout(resolve, 50));
            await vscode.commands.executeCommand('demoBuilder.createProject');
            return { success: true };
        });

        comm.onStreaming('open-project', async () => {
            await this.browseForProject();
            return { success: true };
        });

        comm.onStreaming('import-project', async () => {
            await this.importProject();
            return { success: true };
        });
    }

    /**
     * Generate webview HTML with webpack 4-bundle pattern.
     *
     * Loads bundles in correct order for code splitting:
     * 1. runtime-bundle.js - Webpack runtime
     * 2. vendors-bundle.js - Third-party libraries (React, Spectrum)
     * 3. common-bundle.js - Shared application code (WebviewClient)
     * 4. welcome-bundle.js - Welcome-specific code
     */
    protected async getWebviewContent(): Promise<string> {
        this.logger.debug('[UI] getWebviewContent called');
        const webviewPath = path.join(this.context.extensionPath, 'dist', 'webview');

        // Build bundle URIs for webpack code-split bundles
        const bundleUris = {
            runtime: this.panel!.webview.asWebviewUri(
                vscode.Uri.file(path.join(webviewPath, 'runtime-bundle.js'))
            ),
            vendors: this.panel!.webview.asWebviewUri(
                vscode.Uri.file(path.join(webviewPath, 'vendors-bundle.js'))
            ),
            common: this.panel!.webview.asWebviewUri(
                vscode.Uri.file(path.join(webviewPath, 'common-bundle.js'))
            ),
            feature: this.panel!.webview.asWebviewUri(
                vscode.Uri.file(path.join(webviewPath, 'welcome-bundle.js'))
            ),
        };

        const nonce = this.getNonce();
        const cspSource = this.panel!.webview.cspSource;

        // Generate HTML using 4-bundle helper
        const html = getWebviewHTMLWithBundles({
            bundleUris,
            nonce,
            cspSource,
            title: 'Demo Builder',
            additionalImgSources: ['https:', 'data:'],
        });

        this.logger.debug('[UI] getWebviewContent completed, returning HTML');
        return html;
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
                
                // Open project dashboard (dashboard will initialize file hashes if demo is running)
                await vscode.commands.executeCommand('demoBuilder.showProjectDashboard');
                
                this.logger.info(`[Welcome] Opened project dashboard for: ${project.name}`);
            }
        } catch (error) {
            await this.showError('Failed to open project', error as Error);
        }
    }

    private async browseForProject(): Promise<void> {
        // Get all projects from ~/.demo-builder/projects/
        const projects = await this.stateManager.getAllProjects();
        
        if (projects.length === 0) {
            vscode.window.showInformationMessage('No existing projects found. Create a new project to get started!');
            return;
        }
        
        // Show QuickPick with project list
        const items = projects.map((project: { name: string; path: string; lastModified: Date }) => ({
            label: project.name,
            description: project.path,
            detail: `Last modified: ${project.lastModified.toLocaleDateString()}`,
            projectPath: project.path,
        }));
        
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a project to open',
            title: 'Open Existing Project',
        });
        
        if (selected) {
            await this.openProject(selected.projectPath);
        }
    }


    private async importProject(): Promise<void> {
        const result = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'Console Config': ['json'],
                'All Files': ['*'],
            },
            openLabel: 'Import',
            title: 'Import Adobe Console Configuration',
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