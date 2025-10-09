import * as vscode from 'vscode';
import { BaseCommand } from './baseCommand';
import * as fs from 'fs/promises';

export class DeleteProjectCommand extends BaseCommand {
    public async execute(): Promise<void> {
        try {
            const project = await this.stateManager.getCurrentProject();
            if (!project) {
                await this.showWarning('No project found to delete.');
                return;
            }

            const confirm = await this.confirm(
                `Are you sure you want to delete project "${project.name}"?`,
                'This will remove all project files and configuration. This action cannot be undone.'
            );

            if (!confirm) {
                return;
            }

            await this.withProgress('Deleting project', async (_progress) => {
                // Stop demo if running
                if (project.status === 'running') {
                    await vscode.commands.executeCommand('demoBuilder.stopDemo');
                }

                // Delete project files
                if (project.path) {
                    try {
                        await fs.rm(project.path, { recursive: true, force: true });
                    } catch (error) {
                        this.logger.warn(`Failed to delete project files: ${error}`);
                    }
                }

                // Clear state
                await this.stateManager.clearProject();
                
                // Update status bar
                this.statusBar.clear();
                
                this.logger.info(`Project "${project.name}" deleted`);
            });

            // Show simple confirmation
            vscode.window.showInformationMessage('Project deleted successfully');
            
            // Open Welcome screen to guide user to create a new project
            await vscode.commands.executeCommand('demoBuilder.showWelcome');
            
        } catch (error) {
            await this.showError('Failed to delete project', error as Error);
        }
    }
}