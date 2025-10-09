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
                
                // Set status to 'stopping' immediately
                project.status = 'stopping';
                if (project.frontend) {
                    project.frontend.status = 'stopping';
                }
                await this.stateManager.saveProject(project);
                this.statusBar.updateProject(project);
                
                // Find and close the terminal
                vscode.window.terminals.forEach(terminal => {
                    if (terminal.name === 'Demo Frontend') {
                        terminal.dispose();
                    }
                });
                
                // Update project status to 'stopped'
                if (project.frontend) {
                    project.frontend.status = 'stopped';
                }
                project.status = 'ready';
                await this.stateManager.saveProject(project);
                
                // Notify extension to reset env change grace period
                await vscode.commands.executeCommand('demoBuilder._internal.demoStopped');
                
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