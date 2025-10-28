import * as path from 'path';
import * as vscode from 'vscode';
import { setLoadingState } from '@/core/utils/loadingHTML';
import { generateWebviewHTML } from '@/core/utils/webviewHTMLBuilder';
import { BaseWebviewCommand } from '@/core/base';
import type { WebviewCommunicationManager } from '@/core/communication';

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

    protected async getWebviewContent(): Promise<string> {
        this.logger.debug('[UI] getWebviewContent called');
        const webviewPath = path.join(this.context.extensionPath, 'dist', 'webview');

        // Get URI for bundle
        const bundlePath = path.join(webviewPath, 'welcome-bundle.js');
        const bundleUri = this.panel!.webview.asWebviewUri(vscode.Uri.file(bundlePath));

        // Get fallback bundle URI for development
        const fallbackBundleUri = this.panel!.webview.asWebviewUri(
            vscode.Uri.file(path.join(webviewPath, 'main-bundle.js'))
        );

        const nonce = this.getNonce();
        const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;

        // Build the HTML content using shared utility
        const html = generateWebviewHTML({
            scriptUri: bundleUri,
            nonce,
            title: 'Demo Builder',
            cspSource: this.panel!.webview.cspSource,
            includeLoadingSpinner: true,
            loadingMessage: 'Loading Demo Builder...',
            isDark,
            fallbackBundleUri,
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