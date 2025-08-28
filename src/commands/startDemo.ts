import * as vscode from 'vscode';
import { BaseCommand } from './baseCommand';
import { ProcessManager } from '../utils/processManager';

export class StartDemoCommand extends BaseCommand {
    public async execute(): Promise<void> {
        try {
            const project = await this.stateManager.getCurrentProject();
            if (!project) {
                await this.showWarning('No project found. Create a project first.');
                const create = await vscode.window.showInformationMessage(
                    'No Demo Builder project found.',
                    'Create Project',
                    'Cancel'
                );
                if (create === 'Create Project') {
                    await vscode.commands.executeCommand('demoBuilder.createProject');
                }
                return;
            }

            if (project.frontend?.status === 'running') {
                await this.showInfo('Demo is already running');
                return;
            }

            await this.withProgress('Starting demo...', async (progress) => {
                progress.report({ message: 'Checking port availability...' });
                
                const processManager = new ProcessManager(this.logger);
                const port = project.frontend?.port || 3000;
                
                // Check port availability
                const portAvailable = await processManager.isPortAvailable(port);
                if (!portAvailable) {
                    await this.showError(`Port ${port} is already in use`);
                    return;
                }

                progress.report({ message: 'Starting frontend application...' });
                
                // Create terminal for frontend
                const terminal = this.createTerminal('Demo Frontend');
                terminal.show();
                
                // Navigate to frontend directory and start
                const frontendPath = project.frontend?.path;
                if (frontendPath) {
                    terminal.sendText(`cd "${frontendPath}"`);
                    terminal.sendText('npm run dev');
                    
                    // Update project status
                    project.frontend!.status = 'running';
                    project.status = 'running';
                    await this.stateManager.saveProject(project);
                    
                    // Update status bar
                    this.statusBar.updateProject(project);
                    
                    // Wait a moment then open browser
                    setTimeout(() => {
                        const url = `http://localhost:${port}`;
                        vscode.env.openExternal(vscode.Uri.parse(url));
                        this.logger.info(`Demo started at ${url}`);
                    }, 3000);
                }
                
                progress.report({ message: 'Demo started successfully!' });
            });
            
        } catch (error) {
            await this.showError('Failed to start demo', error as Error);
        }
    }
}