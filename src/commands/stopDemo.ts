import * as vscode from 'vscode';
import { BaseCommand } from './baseCommand';

export class StopDemoCommand extends BaseCommand {
    public async execute(): Promise<void> {
        try {
            const project = await this.stateManager.getCurrentProject();
            if (!project) {
                // Silently return - no project means nothing to stop
                // (often called programmatically during cleanup/reset)
                this.logger.debug('[StopDemo] No project found, nothing to stop');
                return;
            }

            // Check if frontend exists and is running
            if (!project.frontend) {
                this.logger.debug('[StopDemo] No frontend component, nothing to stop');
                return;
            }
            
            if (project.frontend.status === 'stopped') {
                this.logger.debug('[StopDemo] Demo already stopped');
                return;
            }

            await this.withProgress('Stopping demo...', async (progress) => {
                progress.report({ message: 'Stopping frontend application...' });
                
                // Find and close the terminal
                vscode.window.terminals.forEach(terminal => {
                    if (terminal.name === 'Demo Frontend') {
                        terminal.dispose();
                    }
                });
                
                // Update project status
                if (project.frontend) {
                    project.frontend.status = 'stopped';
                }
                project.status = 'ready';
                await this.stateManager.saveProject(project);
                
                // Update status bar
                this.statusBar.updateProject(project);
                
                progress.report({ message: 'Demo stopped successfully!' });
                this.logger.info('Demo stopped');
            });
            
        } catch (error) {
            await this.showError('Failed to stop demo', error as Error);
        }
    }
}