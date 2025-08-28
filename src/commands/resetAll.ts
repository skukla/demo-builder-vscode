import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { BaseCommand } from './baseCommand';

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
                'Cancel'
            );

            if (confirm !== 'Yes, Reset Everything') {
                return;
            }

            this.logger.info('Resetting all Demo Builder state...');

            // 1. Clear VSCode workspace state
            await this.stateManager.clearAll();
            this.logger.info('Cleared workspace state');

            // 2. Clear secrets (license key)
            await this.context.secrets.delete('demoBuilder.licenseKey');
            this.logger.info('Cleared stored secrets');

            // 3. Delete .demo-builder directory
            const demoBuilderPath = path.join(os.homedir(), '.demo-builder');
            try {
                await fs.rm(demoBuilderPath, { recursive: true, force: true });
                this.logger.info(`Deleted ${demoBuilderPath}`);
            } catch (error) {
                this.logger.warn(`Could not delete ${demoBuilderPath}: ${error}`);
            }

            // 4. Reset status bar
            this.statusBar.reset();

            // 5. Stop any running processes
            try {
                await vscode.commands.executeCommand('demoBuilder.stopDemo');
            } catch {
                // Ignore errors if no demo is running
            }

            vscode.window.showInformationMessage('Demo Builder has been completely reset. Restart the extension to begin fresh.');
            
            // Suggest restart
            const restart = await vscode.window.showInformationMessage(
                'Would you like to reload the window to complete the reset?',
                'Reload Window',
                'Later'
            );

            if (restart === 'Reload Window') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }

        } catch (error) {
            await this.showError('Failed to reset Demo Builder', error as Error);
        }
    }
}