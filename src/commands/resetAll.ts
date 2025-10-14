import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { BaseCommand } from '@/shared/base';

export class ResetAllCommand extends BaseCommand {
    public async execute(): Promise<void> {
        try {
            // Only allow in development mode
            const isDevelopment = this.context.extensionMode === vscode.ExtensionMode.Development;
            
            if (!isDevelopment) {
                vscode.window.showWarningMessage('Reset command is only available in development mode');
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                'This will delete all Demo Builder data and state. Are you sure?',
                { modal: true },
                'Yes, Reset Everything',
                'Cancel',
            );

            if (confirm !== 'Yes, Reset Everything') {
                return;
            }

            this.logger.info('Resetting all Demo Builder state...');

            // 1. Stop any running processes first
            try {
                await vscode.commands.executeCommand('demoBuilder.stopDemo');
                this.logger.info('Stopped any running demos');
            } catch {
                // Ignore errors if no demo is running
            }

            // 2. Close all open webview panels (Welcome, Project Dashboard, Create Project wizard)
            try {
                const { WelcomeWebviewCommand } = await import('./welcomeWebview');
                const { ProjectDashboardWebviewCommand } = await import('./projectDashboardWebview');
                const { BaseWebviewCommand } = await import('@/shared/base');
                
                WelcomeWebviewCommand.disposeActivePanel();
                ProjectDashboardWebviewCommand.disposeActivePanel();
                BaseWebviewCommand.disposeAllActivePanels();
                
                this.logger.info('Closed all webview panels');
            } catch (err) {
                this.logger.warn('Error closing webview panels:', err as Error);
            }

            // 3. Remove all Demo Builder workspace folders from VSCode
            const workspaceFolders = vscode.workspace.workspaceFolders || [];
            const demoBuilderPath = path.join(os.homedir(), '.demo-builder');
            const foldersToRemove: number[] = [];
            
            workspaceFolders.forEach((folder, index) => {
                if (folder.uri.fsPath.startsWith(demoBuilderPath)) {
                    foldersToRemove.push(index);
                }
            });
            
            if (foldersToRemove.length > 0) {
                // Remove in reverse order to avoid index shifting
                for (let i = foldersToRemove.length - 1; i >= 0; i--) {
                    vscode.workspace.updateWorkspaceFolders(foldersToRemove[i], 1);
                }
                this.logger.info(`Removed ${foldersToRemove.length} workspace folder(s)`);
            }

            // 4. Clear VSCode workspace state
            await this.stateManager.clearAll();
            this.logger.info('Cleared workspace state');

            // 5. Reset status bar
            this.statusBar.reset();

            // 7. Delete .demo-builder directory (after closing workspace folders)
            try {
                await fs.rm(demoBuilderPath, { recursive: true, force: true });
                this.logger.info(`Deleted ${demoBuilderPath} and all projects`);
            } catch (error) {
                this.logger.warn(`Could not delete ${demoBuilderPath}: ${error}`);
                this.logger.warn('You may need to manually delete this directory');
            }

            // Reload window automatically to ensure clean state
            // This prevents workspace folder references from lingering
            this.logger.info('Reloading window to complete reset');
            vscode.window.setStatusBarMessage('✅ Demo Builder reset complete', 3000);
            
            // Small delay to let message show
            await new Promise(resolve => setTimeout(resolve, 500));
            
            await vscode.commands.executeCommand('workbench.action.reloadWindow');

        } catch (error) {
            await this.showError('Failed to reset Demo Builder', error as Error);
        }
    }
}