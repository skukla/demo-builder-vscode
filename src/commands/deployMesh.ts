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

            // Import ProjectDashboardWebviewCommand for real-time updates
            const { ProjectDashboardWebviewCommand } = await import('./projectDashboardWebview');
            
            // Send immediate feedback so user knows something is happening
            await ProjectDashboardWebviewCommand.sendMeshStatusUpdate('deploying', 'Preparing deployment...');
            
            // Show quick status message for immediate feedback
            vscode.window.setStatusBarMessage('$(sync~spin) Preparing mesh deployment...', 3000);

            // PRE-FLIGHT: Check authentication
            const { AdobeAuthManager } = await import('../utils/adobeAuthManager');
            const authManager = new AdobeAuthManager(
                this.context.extensionPath,
                this.logger,
                getExternalCommandManager()
            );
            
            const isAuthenticated = await authManager.isAuthenticated();
            
            if (!isAuthenticated) {
                // Direct user to dashboard for authentication (dashboard handles browser auth gracefully)
                const selection = await vscode.window.showWarningMessage(
                    'Adobe authentication required to deploy mesh. Please sign in via the Project Dashboard.',
                    'Open Dashboard'
                );
                
                if (selection === 'Open Dashboard') {
                    await vscode.commands.executeCommand('demoBuilder.showProjectDashboard');
                }
                
                this.logger.info('[Deploy Mesh] Authentication required - directed user to dashboard');
                return;
            }
            
            // Check org access (degraded mode detection)
            if (project.adobe?.organization) {
                const currentOrg = await authManager.getCurrentOrganization();
                if (!currentOrg || currentOrg.id !== project.adobe.organization) {
                    vscode.window.showWarningMessage(
                        `You no longer have access to the organization for "${project.name}". ` +
                        `Local demo will continue working, but mesh deployment is unavailable.\n\n` +
                        `Contact your administrator to restore access.`
                    );
                    return;
                }
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
            
            // Log deployment start
            this.logger.info('='.repeat(60));
            this.logger.info('API Mesh Deployment Started');
            this.logger.info('='.repeat(60));
            this.logger.info(`Project: ${project.name}`);
            this.logger.info(`Mesh Config: ${meshConfigPath}`);
            this.logger.info(`Time: ${new Date().toISOString()}`);
            this.logger.info('='.repeat(60));
            
            try {
            
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
                        this.logger.info('[1/3] Reading mesh configuration...');
                    
                        // Validate mesh config exists and is valid JSON
                        const meshConfigContent = await fs.readFile(meshConfigPath, 'utf-8');
                        try {
                            JSON.parse(meshConfigContent);
                            this.logger.info('✓ Configuration validated');
                        } catch (parseError) {
                            this.logger.error(`✗ Invalid JSON: ${(parseError as Error).message}`);
                            throw new Error('Invalid mesh.json file: ' + (parseError as Error).message);
                        }

                        // Use the original mesh.json path directly (not a temp copy)
                        // This ensures relative paths in mesh.json (like build/resolvers/*.js) resolve correctly
                        this.logger.info(`[Deploy Mesh] Deploying mesh from: ${meshConfigPath}`);
                    
                        progress.report({ message: 'Deploying to Adobe I/O...' });
                        await ProjectDashboardWebviewCommand.sendMeshStatusUpdate('deploying', 'Deploying to Adobe I/O...');
                        this.logger.info('');
                        this.logger.info('[2/3] Deploying to Adobe I/O...');
                        this.logger.info('-'.repeat(60));
                    
                        const commandManager = getExternalCommandManager();
                        const updateResult = await commandManager.executeAdobeCLI(
                            `aio api-mesh update "${meshConfigPath}" --autoConfirmAction`,
                            {
                                cwd: meshComponent.path, // Run from mesh component directory (where .env file is)
                                streaming: true,
                                timeout: TIMEOUTS.API_MESH_UPDATE,
                                onOutput: (data: string) => {
                                    // Write detailed streaming output to main logs
                                    const trimmedData = data.trim();
                                    if (trimmedData) {
                                        this.logger.info(`  ${trimmedData}`);
                                    }
                                    
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
                                }
                            }
                        );
                        
                        if (updateResult.code !== 0) {
                            // Log full error details to logs channel
                            this.logger.error('');
                            this.logger.error('✗ Mesh deployment command failed');
                            this.logger.error(`Exit code: ${updateResult.code}`);
                            
                            if (updateResult.stderr) {
                                this.logger.error('');
                                this.logger.error('Error output (stderr):');
                                this.logger.error(updateResult.stderr);
                            }
                            
                            if (updateResult.stdout) {
                                this.logger.error('');
                                this.logger.error('Command output (stdout):');
                                this.logger.error(updateResult.stdout);
                            }
                            
                            const errorMsg = updateResult.stderr || updateResult.stdout || 'Mesh deployment failed';
                            throw new Error(errorMsg);
                        }
                        
                        this.logger.info('[Deploy Mesh] Update command completed, starting deployment verification...');
                        this.logger.info('-'.repeat(60));
                        this.logger.info('✓ Update command completed');
                        this.logger.info('');
                        this.logger.info('[3/3] Verifying deployment...');
                        this.logger.info('-'.repeat(60));
                        
                        // Use shared verification utility
                        progress.report({ message: 'Waiting for mesh deployment...' });
                        await ProjectDashboardWebviewCommand.sendMeshStatusUpdate('deploying', 'Waiting for deployment to complete...');
                        
                        this.logger.info('Waiting 20 seconds for mesh provisioning...');
                        
                        const { waitForMeshDeployment } = await import('../utils/meshDeploymentVerifier');
                        
                        const verificationResult = await waitForMeshDeployment({
                            onProgress: (attempt, maxRetries, elapsedSeconds) => {
                                progress.report({ message: 'Verifying deployment...' });
                                ProjectDashboardWebviewCommand.sendMeshStatusUpdate(
                                    'deploying',
                                    `Verifying deployment (attempt ${attempt}/${maxRetries})...`
                                );
                                this.logger.info(`Attempt ${attempt}/${maxRetries} (${elapsedSeconds}s elapsed)...`);
                            },
                            logger: this.logger
                        });
                        
                        if (!verificationResult.deployed) {
                            this.logger.error('');
                            this.logger.error('✗ Deployment verification failed');
                            this.logger.error(`  ${verificationResult.error || 'Unknown error'}`);
                            throw new Error(verificationResult.error || 'Mesh deployment verification failed');
                        }
                        
                        const deployedMeshId = verificationResult.meshId;
                        const deployedEndpoint = verificationResult.endpoint;
                        
                        this.logger.info('');
                        this.logger.info('✓ Mesh successfully deployed!');
                        if (deployedMeshId) {
                            this.logger.info(`  Mesh ID: ${deployedMeshId}`);
                        }
                        if (deployedEndpoint) {
                            this.logger.info(`  Endpoint: ${deployedEndpoint}`);
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
                        
                        this.logger.info('');
                        this.logger.info('='.repeat(60));
                        this.logger.info('Deployment Completed Successfully');
                        this.logger.info('='.repeat(60));
                        
                        // Show auto-dismissing success message (no logs button - only show logs on error)
                        this.showSuccessMessage('API Mesh deployed successfully');
                        
                        // Reset mesh notification flag (user has deployed)
                        await vscode.commands.executeCommand('demoBuilder._internal.meshActionTaken');
                    }
                );
            
            } catch (error) {
                this.logger.error('[Deploy Mesh] Failed', error as Error);
                
                // Log error details
                this.logger.error('');
                this.logger.error('='.repeat(60));
                this.logger.error('Deployment Failed');
                this.logger.error('='.repeat(60));
                this.logger.error(`Error: ${(error as Error).message}`);
                
                // Log stack trace for debugging (if available)
                if ((error as Error).stack) {
                    this.logger.error('');
                    this.logger.error('Stack trace:');
                    this.logger.error((error as Error).stack || '');
                }
                
                this.logger.error('');
                this.logger.error('Review the logs above for full error details.');
                this.logger.error('='.repeat(60));
                
                // Send error status to Project Dashboard
                await ProjectDashboardWebviewCommand.sendMeshStatusUpdate('error', 'Deployment failed');
                
                // Update component state to error
                const project = await this.stateManager.getCurrentProject();
                const meshComponent = project?.componentInstances?.['commerce-mesh'];
                if (meshComponent) {
                    meshComponent.status = 'error';
                    await this.stateManager.saveProject(project);
                }
                
                // Show shortened error message with View Logs button
                const viewLogs = await vscode.window.showErrorMessage(
                    'Mesh deployment failed',
                    'View Logs'
                );
                
                if (viewLogs === 'View Logs') {
                    // Show the Demo Builder: Logs output channel
                    vscode.commands.executeCommand('demo-builder.showLogs');
                }
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
