import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { BaseCommand } from './baseCommand';
import { getExternalCommandManager } from '../extension';

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
                
                const commandManager = getExternalCommandManager();
                const port = project.frontend?.port || 3000;
                
                // Check port availability
                const portAvailable = await commandManager.isPortAvailable(port);
                if (!portAvailable) {
                    await this.showError(`Port ${port} is already in use`);
                    return;
                }

                progress.report({ message: 'Starting frontend application...' });
                
                // Find frontend component
                const frontendComponent = project.componentInstances?.['citisignal-nextjs'];
                if (!frontendComponent || !frontendComponent.path) {
                    const debugInfo = JSON.stringify({
                        hasComponentInstances: !!project.componentInstances,
                        componentKeys: project.componentInstances ? Object.keys(project.componentInstances) : [],
                        frontendComponent: frontendComponent
                    });
                    this.logger.error(`[Start Demo] Frontend component not found: ${debugInfo}`);
                    await this.showError('Frontend component not found or path not set');
                    return;
                }
                
                const frontendPath = frontendComponent.path;
                const nodeVersion = frontendComponent.metadata?.nodeVersion || '20';
                
                this.logger.info(`[Start Demo] Starting demo in: ${frontendPath}`);
                this.logger.info(`[Start Demo] Using Node ${nodeVersion}`);
                
                // Set status to 'starting' immediately
                project.status = 'starting';
                if (!project.frontend) {
                    project.frontend = {
                        path: frontendPath,
                        version: frontendComponent.version || 'latest',
                        port: port,
                        status: 'starting'
                    };
                } else {
                    project.frontend.status = 'starting';
                }
                await this.stateManager.saveProject(project);
                this.statusBar.updateProject(project);
                
                // Create terminal for frontend (don't auto-show)
                const terminal = this.createTerminal('Demo Frontend');
                
                // Navigate to frontend directory and start
                terminal.sendText(`cd "${frontendPath}"`);
                terminal.sendText(`fnm use ${nodeVersion} && npm run dev`);
                
                // Update project status to 'running' after starting
                if (project.frontend) {
                    project.frontend.status = 'running';
                }
                project.status = 'running';
                
                // Store hash of frontend .env for change detection
                await this.captureFrontendEnvHash(project);
                
                await this.stateManager.saveProject(project);
                
                // Notify extension to suppress env change notifications during startup
                await vscode.commands.executeCommand('demoBuilder._internal.demoStarted');
                
                // Update status bar
                this.statusBar.updateProject(project);
                
                // Wait a moment then open browser
                setTimeout(() => {
                    const url = `http://localhost:${port}`;
                    vscode.env.openExternal(vscode.Uri.parse(url));
                    this.logger.info(`Demo started at ${url}`);
                }, 3000);
                
                progress.report({ message: 'Demo started successfully!' });
            });
            
        } catch (error) {
            await this.showError('Failed to start demo', error as Error);
        }
    }

    /**
     * Capture hash of frontend .env file when demo starts
     * This allows us to detect if config changed while demo is running
     */
    private async captureFrontendEnvHash(project: any): Promise<void> {
        try {
            const frontendInstance = project.componentInstances?.['citisignal-nextjs'];
            if (!frontendInstance?.path) {
                return;
            }

            const envPath = path.join(frontendInstance.path, '.env.local');
            const envContent = await fs.readFile(envPath, 'utf-8');
            const hash = crypto.createHash('md5').update(envContent).digest('hex');
            
            project.frontendEnvHash = hash;
            this.logger.debug(`[Start Demo] Captured frontend .env hash: ${hash.substring(0, 8)}...`);
        } catch (error) {
            // .env.local might not exist yet, that's okay
            this.logger.debug('[Start Demo] No frontend .env.local file found');
            project.frontendEnvHash = undefined;
        }
    }
}