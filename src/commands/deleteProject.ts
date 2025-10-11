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
                    // Wait a moment for demo to fully stop
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                // Save project path before clearing state
                const projectPath = project.path;

                // Delete project files
                if (projectPath) {
                    this.logger.info(`[Delete Project] Deleting project directory: ${projectPath}`);
                    try {
                        await fs.rm(projectPath, { recursive: true, force: true });
                        this.logger.info('[Delete Project] ✅ Project directory deleted successfully');
                        
                        // Verify deletion
                        try {
                            await fs.access(projectPath);
                            // If we get here, the directory still exists
                            throw new Error('Project directory still exists after deletion attempt');
                        } catch (accessError: any) {
                            if (accessError.code !== 'ENOENT') {
                                // Some other error besides "file not found" - deletion may have failed
                                throw accessError;
                            }
                            // ENOENT is good - it means the directory is gone
                        }
                    } catch (error) {
                        this.logger.error('[Delete Project] ❌ Failed to delete project files', error as Error);
                        throw new Error(`Failed to delete project directory: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }

                // Remove from recent projects list
                if (projectPath) {
                    await this.stateManager.removeFromRecentProjects(projectPath);
                }

                // Clear state
                await this.stateManager.clearProject();
                
                // Update status bar
                this.statusBar.clear();
                
                this.logger.info(`Project "${project.name}" deleted`);
            });

            // Show auto-dismissing success message
            this.showSuccessMessage('Project deleted successfully');
            
            // Open Welcome screen to guide user to create a new project
            await vscode.commands.executeCommand('demoBuilder.showWelcome');
            
        } catch (error) {
            await this.showError('Failed to delete project', error as Error);
        }
    }
}