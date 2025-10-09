import * as vscode from 'vscode';
import * as net from 'net';
import { BaseCommand } from './baseCommand';

export class StopDemoCommand extends BaseCommand {
    /**
     * Check if a port is available (not in use)
     */
    private async isPortAvailable(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const server = net.createServer();
            
            server.once('error', () => {
                resolve(false); // Port is in use
            });
            
            server.once('listening', () => {
                server.close();
                resolve(true); // Port is available
            });
            
            server.listen(port);
        });
    }
    
    /**
     * Wait for a port to become available (with timeout)
     */
    private async waitForPortToFree(port: number, timeoutMs: number = 10000): Promise<boolean> {
        const startTime = Date.now();
        const checkInterval = 500; // Check every 500ms
        
        while (Date.now() - startTime < timeoutMs) {
            if (await this.isPortAvailable(port)) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
        
        return false; // Timeout reached
    }
    
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
                
                // Wait for port to be freed (Node process shutdown takes time)
                const port = project.frontend?.port || 3000;
                progress.report({ message: `Waiting for port ${port} to be released...` });
                
                const portFreed = await this.waitForPortToFree(port, 10000);
                if (!portFreed) {
                    this.logger.warn(`Port ${port} still in use after 10 seconds, but marking as stopped`);
                    vscode.window.showWarningMessage(
                        `Port ${port} may still be in use. Wait a moment before restarting.`
                    );
                }
                
                // Update project status to 'stopped'
                if (project.frontend) {
                    project.frontend.status = 'stopped';
                }
                project.status = 'ready';
                
                // Clear frontend env state (config changes don't matter when stopped)
                project.frontendEnvState = undefined;
                
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