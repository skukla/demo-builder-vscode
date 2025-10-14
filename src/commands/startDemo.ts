import * as path from 'path';
import * as vscode from 'vscode';
import { ServiceLocator } from '../services/serviceLocator';
import { updateFrontendState } from '../utils/stalenessDetector';
import { BaseCommand } from '@/shared/base';

export class StartDemoCommand extends BaseCommand {
    public async execute(): Promise<void> {
        try {
            const project = await this.stateManager.getCurrentProject();
            if (!project) {
                await this.showWarning('No project found. Create a project first.');
                const create = await vscode.window.showInformationMessage(
                    'No Demo Builder project found.',
                    'Create Project',
                    'Cancel',
                );
                if (create === 'Create Project') {
                    await vscode.commands.executeCommand('demoBuilder.createProject');
                }
                return;
            }

            // Check if demo is already running
            if (project.status === 'running') {
                await this.showInfo('Demo is already running');
                return;
            }

            // Pre-flight check: port availability (outside progress to allow user interaction)
            const commandManager = ServiceLocator.getCommandExecutor();
            const frontendComponent = project.componentInstances?.['citisignal-nextjs'];
            
            // Get port: use component's configured port, fallback to extension setting, then 3000
            const defaultPort = vscode.workspace.getConfiguration('demoBuilder').get<number>('defaultPort', 3000);
            const port = frontendComponent?.port || defaultPort;

            // SECURITY: Validate port number to prevent command injection
            // Port must be a number between 1 and 65535
            if (!Number.isInteger(port) || port < 1 || port > 65535) {
                this.logger.error(`[Start Demo] Invalid port number: ${port}`);
                await this.showError(`Invalid port number: ${port}. Must be between 1 and 65535.`);
                return;
            }

            const portAvailable = await commandManager.isPortAvailable(port);
            if (!portAvailable) {
                // Find out what's running on the port
                let processInfo = 'Unknown process';
                try {
                    // SECURITY: port is validated above as a valid integer
                    const result = await commandManager.execute(`lsof -i:${port}`, {
                        timeout: 5000,
                        configureTelemetry: false,
                        useNodeVersion: null,
                        enhancePath: false,
                        shell: '/bin/sh',  // Required for command syntax
                    });
                    
                    if (result.code === 0 && result.stdout) {
                        // Parse lsof output (skip header line, take first process line)
                        const lines = result.stdout.trim().split('\n');
                        if (lines.length > 1) {
                            const processLine = lines[1].trim();
                            const parts = processLine.split(/\s+/);
                            const processName = parts[0] || 'Unknown';
                            const pid = parts[1] || 'Unknown';
                            processInfo = `${processName} (PID: ${pid})`;
                        }
                    }
                } catch (error) {
                    this.logger.warn(`[Start Demo] Could not identify process on port ${port}:`, error as Error);
                }
                
                this.logger.warn(`[Start Demo] Port ${port} is in use by: ${processInfo}`);
                
                // Ask user if they want to stop the process
                const action = await vscode.window.showWarningMessage(
                    `Port ${port} in use by ${processInfo}. Stop it and start demo?`,
                    'Stop & Start',
                    'Cancel',
                );
                
                if (action !== 'Stop & Start') {
                    this.logger.info('[Start Demo] User cancelled demo start due to port conflict');
                    return;
                }
                
                // Kill the process
                this.logger.info(`[Start Demo] Stopping process on port ${port}...`);
                try {
                    // SECURITY: port is validated above as a valid integer
                    await commandManager.execute(`lsof -ti:${port} | xargs kill`, {
                        timeout: 5000,
                        configureTelemetry: false,
                        useNodeVersion: null,
                        enhancePath: false,
                        shell: '/bin/sh',  // Required for pipes
                    });
                    
                    // Wait a moment for port to be freed
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    this.logger.info('[Start Demo] Process stopped successfully');
                } catch (error) {
                    this.logger.error('[Start Demo] Failed to stop process:', error as Error);
                    await this.showError(`Failed to stop process on port ${port}. Try stopping it manually.`);
                    return;
                }
            }

            await this.withProgress('Starting demo', async (progress) => {
                progress.report({ message: 'Starting frontend application' });
                
                // Validate frontend component
                if (!frontendComponent?.path) {
                    const debugInfo = JSON.stringify({
                        hasComponentInstances: !!project.componentInstances,
                        componentKeys: project.componentInstances ? Object.keys(project.componentInstances) : [],
                        frontendComponent: frontendComponent,
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
                frontendComponent.status = 'starting';
                frontendComponent.port = port;
                await this.stateManager.saveProject(project);
                this.statusBar.updateProject(project);
                
                // Create project-specific terminal name (allows us to identify which project is running)
                const terminalName = `${project.name} - Frontend`;
                const terminal = this.createTerminal(terminalName);
                
                // Navigate to frontend directory and start
                terminal.sendText(`cd "${frontendPath}"`);
                terminal.sendText(`fnm use ${nodeVersion} && npm run dev`);
                
                // Update project status to 'running' after starting
                frontendComponent.status = 'running';
                project.status = 'running';
                
                // Capture frontend env vars for change detection
                updateFrontendState(project);
                
                await this.stateManager.saveProject(project);
                
                // Notify extension to suppress env change notifications during startup
                await vscode.commands.executeCommand('demoBuilder._internal.demoStarted');
                
                // Initialize file hashes for change detection (capture baseline state)
                // Find all .env files in component directories
                const envFiles: string[] = [];

                // Collect .env files from all component instances
                if (project.componentInstances) {
                    for (const componentInstance of Object.values(project.componentInstances)) {
                        if (componentInstance.path) {
                            const componentPath = componentInstance.path;
                            const envPath = path.join(componentPath, '.env');
                            const envLocalPath = path.join(componentPath, '.env.local');

                            // Check if files exist
                            const fsPromises = (await import('fs')).promises;
                            try {
                                await fsPromises.access(envPath);
                                envFiles.push(envPath);
                            } catch {
                                // File doesn't exist
                            }

                            try {
                                await fsPromises.access(envLocalPath);
                                envFiles.push(envLocalPath);
                            } catch {
                                // File doesn't exist
                            }
                        }
                    }
                }
                
                if (envFiles.length > 0) {
                    this.logger.debug(`[Start Demo] Initializing file hashes for ${envFiles.length} .env files`);
                    await vscode.commands.executeCommand('demoBuilder._internal.initializeFileHashes', envFiles);
                }
                
                // Update status bar
                this.statusBar.updateProject(project);
                
                this.logger.info(`Demo started at http://localhost:${port}`);
                progress.report({ message: 'Demo started successfully!' });
            });
            
            // Show auto-dismissing success notification
            this.showSuccessMessage(`Demo started at http://localhost:${port}`);
            
            // Reset restart notification flag (user has restarted)
            await vscode.commands.executeCommand('demoBuilder._internal.restartActionTaken');
            
        } catch (error) {
            await this.showError('Failed to start demo', error as Error);
        }
    }
}