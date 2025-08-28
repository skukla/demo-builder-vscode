import * as vscode from 'vscode';
import { BaseCommand } from './baseCommand';

export class StopDemoCommand extends BaseCommand {
    public async execute(): Promise<void> {
        try {
            const project = await this.stateManager.getCurrentProject();
            if (!project) {
                await this.showWarning('No project found.');
                return;
            }

            if (project.frontend?.status === 'stopped') {
                await this.showInfo('Demo is not running');
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
                project.frontend!.status = 'stopped';
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