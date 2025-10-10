import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { BaseCommand } from './baseCommand';
import { StateManager } from '../utils/stateManager';
import { StatusBarManager } from '../providers/statusBar';
import { Logger } from '../utils/logger';
import { getExternalCommandManager } from '../extension';
import { updateMeshState } from '../utils/stalenessDetector';
import { TIMEOUTS } from '../utils/timeoutConfig';

/**
 * Deploy (or redeploy) API Mesh using the mesh.json from the mesh component
 */
export class DeployMeshCommand extends BaseCommand {
    constructor(
        context: vscode.ExtensionContext,
        stateManager: StateManager,
        statusBar: StatusBarManager,
        logger: Logger
    ) {
        super(context, stateManager, statusBar, logger);
    }

    async execute(): Promise<void> {
        try {
            // Get current project
            const project = await this.stateManager.getCurrentProject();
            if (!project) {
                vscode.window.showWarningMessage('No active project found. Create a project first.');
                return;
            }

            // Find mesh component
            const meshComponent = this.getMeshComponent(project);
            if (!meshComponent || !meshComponent.path) {
                vscode.window.showWarningMessage('This project does not have an API Mesh component.');
                return;
            }

            // Check for mesh.json in the component directory
            const meshConfigPath = path.join(meshComponent.path, 'mesh.json');
            try {
                await fs.access(meshConfigPath);
            } catch {
                vscode.window.showErrorMessage(
                    `mesh.json not found in ${meshComponent.path}. Please ensure the mesh configuration file exists.`
                );
                return;
            }

            // Import ProjectDashboardWebviewCommand for real-time updates
            const { ProjectDashboardWebviewCommand } = await import('./projectDashboardWebview');
            
            // Create output channel for deployment logs (only shown on error)
            const outputChannel = vscode.window.createOutputChannel('API Mesh Deployment', 'log');
            
            try {
                outputChannel.clear();
                outputChannel.appendLine('='.repeat(60));
                outputChannel.appendLine('API Mesh Deployment Started');
                outputChannel.appendLine('='.repeat(60));
                outputChannel.appendLine(`Project: ${project.name}`);
                outputChannel.appendLine(`Mesh Config: ${meshConfigPath}`);
                outputChannel.appendLine(`Time: ${new Date().toISOString()}`);
                outputChannel.appendLine('='.repeat(60));
                outputChannel.appendLine('');
            
                // Send initial "deploying" status to Project Dashboard
                await ProjectDashboardWebviewCommand.sendMeshStatusUpdate('deploying', 'Starting deployment...');
            
                // Update component state to deploying
                meshComponent.status = 'deploying';
                await this.stateManager.saveProject(project);

                // Show progress notification
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: 'Deploying API Mesh',
                        cancellable: false
                    },
                    async (progress) => {
                        progress.report({ message: 'Reading mesh configuration...' });
                        await ProjectDashboardWebviewCommand.sendMeshStatusUpdate('deploying', 'Reading configuration...');
                        outputChannel.appendLine('[1/3] Reading mesh configuration...');
                    
                        // Validate mesh config exists and is valid JSON
                        const meshConfigContent = await fs.readFile(meshConfigPath, 'utf-8');
                        try {
                            JSON.parse(meshConfigContent);
                            outputChannel.appendLine('✓ Configuration validated');
                        } catch (parseError) {
                            outputChannel.appendLine(`✗ Invalid JSON: ${(parseError as Error).message}`);
                            throw new Error('Invalid mesh.json file: ' + (parseError as Error).message);
                        }

                        // Use the original mesh.json path directly (not a temp copy)
                        // This ensures relative paths in mesh.json (like build/resolvers/*.js) resolve correctly
                        this.logger.info(`[Deploy Mesh] Deploying mesh from: ${meshConfigPath}`);
                    
                        progress.report({ message: 'Deploying to Adobe I/O...' });
                        await ProjectDashboardWebviewCommand.sendMeshStatusUpdate('deploying', 'Deploying to Adobe I/O...');
                        outputChannel.appendLine('');
                        outputChannel.appendLine('[2/3] Deploying to Adobe I/O...');
                        outputChannel.appendLine('-'.repeat(60));
                    
                        const commandManager = getExternalCommandManager();
                        const updateResult = await commandManager.execute(
                            `aio api-mesh update "${meshConfigPath}" --autoConfirmAction`,
                            {
                                cwd: meshComponent.path, // Run from mesh component directory (where .env file is)
                                streaming: true,
                                timeout: TIMEOUTS.API_MESH_UPDATE,
                                onOutput: (data: string) => {
                                    // Write all output to channel
                                    outputChannel.append(data);
                                    
                                    const output = data.toLowerCase();
                                    if (output.includes('validating')) {
                                        progress.report({ message: 'Validating configuration...' });
                                        ProjectDashboardWebviewCommand.sendMeshStatusUpdate('deploying', 'Validating configuration...');
                                    } else if (output.includes('updating')) {
                                        progress.report({ message: 'Updating mesh infrastructure...' });
                                        ProjectDashboardWebviewCommand.sendMeshStatusUpdate('deploying', 'Updating infrastructure...');
                                    } else if (output.includes('deploying')) {
                                        progress.report({ message: 'Deploying mesh...' });
                                        ProjectDashboardWebviewCommand.sendMeshStatusUpdate('deploying', 'Deploying...');
                                    } else if (output.includes('success')) {
                                        progress.report({ message: 'Finalizing deployment...' });
                                        ProjectDashboardWebviewCommand.sendMeshStatusUpdate('deploying', 'Finalizing...');
                                    }
                                },
                                configureTelemetry: false,
                                useNodeVersion: null,
                                enhancePath: true
                            }
                        );
                        
                        if (updateResult.code !== 0) {
                            const errorMsg = updateResult.stderr || updateResult.stdout || 'Mesh deployment failed';
                            throw new Error(errorMsg);
                        }
                        
                        this.logger.info('[Deploy Mesh] Update command completed, starting deployment verification...');
                        outputChannel.appendLine('-'.repeat(60));
                        outputChannel.appendLine('✓ Update command completed');
                        outputChannel.appendLine('');
                        outputChannel.appendLine('[3/3] Verifying deployment...');
                        outputChannel.appendLine('-'.repeat(60));
                        
                        // Use shared verification utility
                        progress.report({ message: 'Waiting for mesh deployment...' });
                        await ProjectDashboardWebviewCommand.sendMeshStatusUpdate('deploying', 'Waiting for deployment to complete...');
                        
                        outputChannel.appendLine('Waiting 20 seconds for mesh provisioning...');
                        
                        const { waitForMeshDeployment } = await import('../utils/meshDeploymentVerifier');
                        
                        const verificationResult = await waitForMeshDeployment({
                            onProgress: (attempt, maxRetries, elapsedSeconds) => {
                                progress.report({ message: 'Verifying deployment...' });
                                ProjectDashboardWebviewCommand.sendMeshStatusUpdate(
                                    'deploying',
                                    `Verifying deployment (attempt ${attempt}/${maxRetries})...`
                                );
                                outputChannel.appendLine(`Attempt ${attempt}/${maxRetries} (${elapsedSeconds}s elapsed)...`);
                            },
                            logger: this.logger
                        });
                        
                        if (!verificationResult.deployed) {
                            outputChannel.appendLine('');
                            outputChannel.appendLine('✗ Deployment verification failed');
                            outputChannel.appendLine(`  ${verificationResult.error || 'Unknown error'}`);
                            throw new Error(verificationResult.error || 'Mesh deployment verification failed');
                        }
                        
                        const deployedMeshId = verificationResult.meshId;
                        const deployedEndpoint = verificationResult.endpoint;
                        
                        outputChannel.appendLine('');
                        outputChannel.appendLine('✓ Mesh successfully deployed!');
                        if (deployedMeshId) {
                            outputChannel.appendLine(`  Mesh ID: ${deployedMeshId}`);
                        }
                        if (deployedEndpoint) {
                            outputChannel.appendLine(`  Endpoint: ${deployedEndpoint}`);
                        }
                        
                        // Update component instance
                        meshComponent.endpoint = deployedEndpoint;
                        meshComponent.status = 'deployed';
                        
                        // Update mesh state (env vars + source hash) to match deployed configuration
                        // This ensures the dashboard knows the config is in sync
                        await updateMeshState(project);
                        this.logger.info('[Deploy Mesh] Updated mesh state after successful deployment');
                        
                        await this.stateManager.saveProject(project);
                        
                        // Send final "deployed" status to Project Dashboard
                        await ProjectDashboardWebviewCommand.sendMeshStatusUpdate('deployed', undefined, deployedEndpoint);
                        
                        outputChannel.appendLine('');
                        outputChannel.appendLine('='.repeat(60));
                        outputChannel.appendLine('Deployment Completed Successfully');
                        outputChannel.appendLine('='.repeat(60));
                        
                        // Show auto-dismissing success message (no logs button - only show logs on error)
                        this.showSuccessMessage('API Mesh deployed successfully');
                    }
                );
            
            } catch (error) {
                this.logger.error('[Deploy Mesh] Failed', error as Error);
                
                // Log error to output channel
                outputChannel.appendLine('');
                outputChannel.appendLine('='.repeat(60));
                outputChannel.appendLine('Deployment Failed');
                outputChannel.appendLine('='.repeat(60));
                outputChannel.appendLine(`Error: ${(error as Error).message}`);
                outputChannel.appendLine('');
                outputChannel.appendLine('Check the logs above for more details.');
                outputChannel.appendLine('='.repeat(60));
                
                // Send error status to Project Dashboard
                await ProjectDashboardWebviewCommand.sendMeshStatusUpdate('error', 'Deployment failed');
                
                // Update component state to error
                const project = await this.stateManager.getCurrentProject();
                const meshComponent = project?.componentInstances?.['commerce-mesh'];
                if (meshComponent) {
                    meshComponent.status = 'error';
                    await this.stateManager.saveProject(project);
                }
                
                const { formatMeshDeploymentError } = await import('../utils/errorFormatter');
                
                // Show error with "View Logs" button
                vscode.window.showErrorMessage(
                    formatMeshDeploymentError(error as Error),
                    'View Logs'
                ).then(selection => {
                    if (selection === 'View Logs') {
                        outputChannel.show();
                    }
                });
            }
        } catch (error) {
            // Outer catch for any unexpected errors during validation/setup
            this.logger.error('[Deploy Mesh] Unexpected error', error as Error);
            vscode.window.showErrorMessage(`Failed to deploy API Mesh: ${(error as Error).message}`);
        }
    }

    /**
     * Get the mesh component from project
     */
    private getMeshComponent(project: any) {
        if (!project.componentInstances) {
            return null;
        }

        // Find the mesh component by ID (commerce-mesh)
        const meshComponent = project.componentInstances['commerce-mesh'];
        if (meshComponent) {
            return meshComponent;
        }

        // Fallback: search for any component with 'mesh' in the ID (for backward compatibility)
        for (const [id, component] of Object.entries(project.componentInstances)) {
            if (id.includes('mesh')) {
                return component;
            }
        }

        return null;
    }

}
