/**
 * Project Creation Handlers - Executor
 *
 * Main project creation execution logic including component installation,
 * mesh deployment, and state management.
 */

import * as vscode from 'vscode';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { ProgressTracker } from './shared';
import { ServiceLocator } from '@/core/di';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import {
    generateComponentEnvFile as generateEnvFile,
    deployMeshComponent as deployMeshHelper,
} from '@/features/project-creation/helpers';
import { AdobeConfig } from '@/types/base';
import { parseJSON, hasEntries, getEntryCount, getComponentIds } from '@/types/typeGuards';
import { extractAndParseJSON } from '@/features/mesh/utils/meshHelpers';
import { getMeshNodeVersion } from '@/features/mesh/services/meshConfig';

/**
 * ProjectCreationConfig - Configuration passed to project creation
 */
interface ProjectCreationConfig {
    projectName: string;
    adobe?: AdobeConfig;
    components?: {
        frontend?: string;
        backend?: string;
        dependencies?: string[];
        integrations?: string[];
        appBuilderApps?: string[];
    };
    componentConfigs?: Record<string, Record<string, unknown>>;
    apiMesh?: {
        meshId?: string;
        endpoint?: string;
        meshStatus?: string;
        workspace?: string;
    };
}

/**
 * Actual project creation logic (extracted for testability)
 */
export async function executeProjectCreation(context: HandlerContext, config: Record<string, unknown>): Promise<void> {
    // Type-safe config access
    const typedConfig = config as unknown as ProjectCreationConfig;
    // Create progress tracker
    const progressTracker: ProgressTracker = (currentOperation: string, progress: number, message?: string) => {
        context.sendMessage('creationProgress', {
            currentOperation,
            progress,
            message: message || '',
            logs: [],
        });
    };

    // Safety check: Ensure port is available (edge case protection)
    // This catches scenarios where a demo was started via command palette during wizard
    const existingProject = await context.stateManager.getCurrentProject();
    if (existingProject && existingProject.status === 'running') {
        // Check if the running demo is using a port that would conflict
        const runningPort = existingProject.componentInstances?.['citisignal-nextjs']?.port;
        const defaultPort = vscode.workspace.getConfiguration('demoBuilder').get<number>('defaultPort', 3000);
        const targetPort = typedConfig.componentConfigs?.['citisignal-nextjs']?.PORT || defaultPort;

        if (runningPort === targetPort) {
            context.logger.debug(`[Project Creation] Stopping running demo on port ${runningPort} before creating new project`);

            // Show notification that we're auto-stopping the demo
            // SOP §1: Using TIMEOUTS constant instead of magic number
            vscode.window.setStatusBarMessage(
                `⚠️  Stopping "${existingProject.name}" demo (port ${runningPort} conflict)`,
                TIMEOUTS.STATUS_BAR_SUCCESS,
            );

            await vscode.commands.executeCommand('demoBuilder.stopDemo');

            // Wait for clean stop and port release
            await new Promise(resolve => setTimeout(resolve, TIMEOUTS.DEMO_STOP_WAIT));
        } else {
            context.logger.debug(`[Project Creation] Running demo on different port (${runningPort}), no conflict`);
        }
    }

    // Import ComponentManager and other dependencies
    const { ComponentManager } = await import('@/features/components/services/componentManager');
    const { ComponentRegistryManager } = await import('@/features/components/services/ComponentRegistryManager');
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');

    // PRE-FLIGHT CHECK: Clean up orphaned/invalid directories
    // NOTE: Valid projects (with .demo-builder.json) are blocked by createHandler
    // This only runs for:
    //   1. Orphaned directories (missing manifest)
    //   2. Corrupted project directories
    //   3. Manual folders in .demo-builder/projects/
    const projectPath = path.join(os.homedir(), '.demo-builder', 'projects', typedConfig.projectName);

    if (await fs.access(projectPath).then(() => true).catch(() => false)) {
        context.logger.warn(`[Project Creation] Directory already exists: ${projectPath}`);
        context.logger.debug('[Project Creation] This should only happen for orphaned/invalid directories (valid projects are blocked earlier)');

        // Check if it has content
        const existingFiles = await fs.readdir(projectPath);
        if (existingFiles.length > 0) {
            context.logger.debug(`[Project Creation] Found ${existingFiles.length} existing files/folders, cleaning up...`);
            progressTracker('Preparing Project', 5, 'Removing existing project data...');

            // Clean it up before proceeding
            await fs.rm(projectPath, { recursive: true, force: true });
            context.logger.debug('[Project Creation] Existing directory cleaned');
        } else {
            // Empty directory is fine, just remove it to be safe
            await fs.rmdir(projectPath);
        }
    }

    // Step 1: Create project directory structure (10%)
    progressTracker('Setting Up Project', 10, 'Creating project directory structure...');

    const componentsDir = path.join(projectPath, 'components');

    await fs.mkdir(componentsDir, { recursive: true });
    await fs.mkdir(path.join(projectPath, 'logs'), { recursive: true });

    context.logger.debug(`[Project Creation] Created directory: ${projectPath}`);

    // Step 2: Initialize project (15%)
    progressTracker('Setting Up Project', 15, 'Initializing project configuration...');

    const project: import('@/types').Project = {
        name: typedConfig.projectName,
        created: new Date(),
        lastModified: new Date(),
        path: projectPath,
        status: 'created',
        adobe: typedConfig.adobe,
        componentInstances: {},
        componentSelections: {
            frontend: typedConfig.components?.frontend,
            backend: typedConfig.components?.backend,
            dependencies: typedConfig.components?.dependencies || [],
            integrations: typedConfig.components?.integrations || [],
            appBuilder: typedConfig.components?.appBuilderApps || [],
        },
        componentConfigs: (typedConfig.componentConfigs || {}) as Record<string, Record<string, string | number | boolean | undefined>>,
    };

    // Save initial project state WITHOUT triggering events (to avoid crash)
    // We'll save again after components are installed
    context.logger.debug('[Project Creation] Deferring project state save and workspace addition until after installation');

    // Step 3: Load component definitions (20%)
    progressTracker('Loading Components', 20, 'Preparing component definitions...');

    const registryManager = new ComponentRegistryManager(context.context.extensionPath);
    const componentManager = new ComponentManager(context.logger);

    // Load registry to get shared envVars dictionary
    const registry = await registryManager.loadRegistry();
    const sharedEnvVars = registry.envVars || {};

    // Step 4: Install selected components (25-80%)
    const allComponents = [
        ...(typedConfig.components?.frontend ? [{ id: typedConfig.components.frontend, type: 'frontend' }] : []),
        ...(typedConfig.components?.dependencies || []).map((id: string) => ({ id, type: 'dependency' })),
        ...(typedConfig.components?.appBuilderApps || []).map((id: string) => ({ id, type: 'app-builder' })),
    ];

    const progressPerComponent = 55 / Math.max(allComponents.length, 1);
    let currentProgress = 25;

    for (const comp of allComponents) {
        let componentDef;

        if (comp.type === 'frontend') {
            const frontends = await registryManager.getFrontends();
            componentDef = frontends.find((f: { id: string }) => f.id === comp.id);
        } else if (comp.type === 'dependency') {
            const dependencies = await registryManager.getDependencies();
            componentDef = dependencies.find((d: { id: string }) => d.id === comp.id);
        } else if (comp.type === 'app-builder') {
            const appBuilder = await registryManager.getAppBuilder();
            componentDef = appBuilder.find((a: { id: string }) => a.id === comp.id);
        }

        if (!componentDef) {
            context.logger.warn(`[Project Creation] Component ${comp.id} not found in registry`);
            continue;
        }

        progressTracker(`Installing ${componentDef.name}`, currentProgress, 'Cloning repository and installing dependencies...');
        context.logger.debug(`[Project Creation] Installing component: ${componentDef.name}`);

        const result = await componentManager.installComponent(project, componentDef);

        if (result.success && result.component) {
            project.componentInstances![comp.id] = result.component;
            context.logger.debug(`[Project Creation] Successfully installed ${componentDef.name}`);

            // Generate component-specific .env file (only for components with a path)
            if (result.component.path) {
                await generateEnvFile(
                    result.component.path,
                    comp.id,
                    componentDef,
                    sharedEnvVars,
                    config,
                    context.logger,
                );
            } else {
                context.logger.debug(`[Project Creation] Skipping .env generation for ${componentDef.name} (no path)`);
            }

            // Save project state to trigger sidebar refresh (show component in real-time)
            await context.stateManager.saveProject(project);
        } else {
            throw new Error(`Failed to install ${componentDef.name}: ${result.error}`);
        }

        currentProgress += progressPerComponent;
    }

    // Step 5: Deploy Components (75-85%)
    // Deploy any components that were downloaded and need deployment (e.g., API Mesh)
    context.logger.info('[Project Creation] ✅ All components downloaded and configured');

    const meshComponent = project.componentInstances?.['commerce-mesh'];
    if (meshComponent?.path) {
        progressTracker('Deploying API Mesh', 80, 'Deploying mesh configuration to Adobe I/O...');
        context.logger.debug(`[Project Creation] Deploying mesh from ${meshComponent.path}`);

        try {
            const commandManager = ServiceLocator.getCommandExecutor();
            const meshDeployResult = await deployMeshHelper(
                meshComponent.path,
                commandManager,
                context.logger,
                (message: string, subMessage?: string) => {
                    progressTracker('Deploying API Mesh', 80, subMessage || message);
                },
            );

            if (meshDeployResult.success) {
                // Track that mesh was created for this workspace (for cleanup on failure)
                context.sharedState.meshCreatedForWorkspace = typedConfig.adobe?.workspace;

                // Get mesh info - prefer from wizard, but fetch if not available
                let meshId = typedConfig.apiMesh?.meshId;
                let endpoint = typedConfig.apiMesh?.endpoint;

                // If wizard didn't capture mesh info (e.g., still provisioning), fetch it now
                if (!meshId || !endpoint) {
                    context.logger.debug('[Project Creation] Fetching mesh info via describe...');
                    try {
                        const commandManager = ServiceLocator.getCommandExecutor();
                        const describeResult = await commandManager.execute('aio api-mesh:describe', {
                            timeout: TIMEOUTS.MESH_DESCRIBE,
                            configureTelemetry: false,
                            useNodeVersion: getMeshNodeVersion(),
                            enhancePath: true,
                        });

                        if (describeResult.code === 0) {
                            // Extract JSON from output using Step 2 helper (handles mixed CLI output)
                            const meshData = extractAndParseJSON<{ meshId?: string; mesh_id?: string; meshEndpoint?: string; endpoint?: string }>(describeResult.stdout);
                            if (meshData) {
                                meshId = meshData.meshId || meshData.mesh_id;
                                endpoint = meshData.meshEndpoint || meshData.endpoint;
                            }
                        }
                    } catch {
                        context.logger.warn('[Project Creation] Could not fetch mesh info, continuing without it');
                    }
                }

                // Update component instance with deployment info
                meshComponent.endpoint = endpoint;
                meshComponent.status = 'deployed';
                meshComponent.metadata = {
                    meshId: meshId || '',
                    meshStatus: 'deployed',
                };
                project.componentInstances!['commerce-mesh'] = meshComponent;

                // Update meshState to track deployment (required for status detection)
                const { updateMeshState } = await import('@/features/mesh/services/stalenessDetector');
                await updateMeshState(project);
                context.logger.debug('[Project Creation] Updated mesh state after successful deployment');

                // Fetch deployed mesh config to populate meshState.envVars
                // This ensures dashboard shows correct "Deployed" status immediately
                const { fetchDeployedMeshConfig } = await import('@/features/mesh/services/stalenessDetector');
                const deployedConfig = await fetchDeployedMeshConfig();

                if (hasEntries(deployedConfig)) {
                    project.meshState!.envVars = deployedConfig;
                    context.logger.debug('[Project Creation] Populated meshState.envVars with deployed config');
                    await context.stateManager.saveProject(project);
                }

                context.logger.info(`[Project Creation] ✅ Mesh configuration updated successfully${endpoint ? ': ' + endpoint : ''}`);
            } else {
                throw new Error(meshDeployResult.error || 'Mesh deployment failed');
            }
        } catch (meshError) {
            context.logger.error('[Project Creation] Failed to deploy mesh', meshError as Error);

            const { formatMeshDeploymentError } = await import('@/features/mesh/utils/errorFormatter');
            throw new Error(formatMeshDeploymentError(meshError as Error));
        }
    }

    // Alternative: Use existing mesh if user selected one instead of cloning (80%)
    // This happens when user picks an existing deployed mesh in the wizard
    if (typedConfig.apiMesh?.meshId && typedConfig.apiMesh?.endpoint && !meshComponent) {
        progressTracker('Configuring API Mesh', 80, 'Adding existing mesh to project...');

        // Add mesh as a component instance (deployed, not cloned)
        project.componentInstances!['commerce-mesh'] = {
            id: 'commerce-mesh',
            name: 'Commerce API Mesh',
            type: 'dependency',
            subType: 'mesh',
            status: 'deployed',
            endpoint: typedConfig.apiMesh.endpoint,
            lastUpdated: new Date(),
            metadata: {
                meshId: typedConfig.apiMesh.meshId,
                meshStatus: typedConfig.apiMesh.meshStatus,
            },
        };

        // Update meshState to track deployment (required for status detection)
        const { updateMeshState } = await import('@/features/mesh/services/stalenessDetector');
        await updateMeshState(project);
        context.logger.debug('[Project Creation] Updated mesh state for existing mesh');

        // Fetch deployed mesh config to populate meshState.envVars
        // This ensures dashboard shows correct "Deployed" status immediately
        const { fetchDeployedMeshConfig } = await import('@/features/mesh/services/stalenessDetector');
        const deployedConfig = await fetchDeployedMeshConfig();

        if (hasEntries(deployedConfig)) {
            project.meshState!.envVars = deployedConfig;
            context.logger.debug('[Project Creation] Populated meshState.envVars with deployed config');
            await context.stateManager.saveProject(project);
        }

        context.logger.debug('[Project Creation] API Mesh configured');
    }

    // Step 6: Create project manifest (90%)
    progressTracker('Finalizing Project', 90, 'Creating project manifest...');

    const manifest = {
        name: project.name,
        version: '1.0.0',
        created: project.created.toISOString(),
        lastModified: project.lastModified.toISOString(),
        adobe: project.adobe,
        componentSelections: project.componentSelections,
        componentInstances: project.componentInstances,
        componentConfigs: project.componentConfigs,
        meshState: project.meshState,
        commerce: project.commerce,
        components: getComponentIds(project.componentInstances), // Keep for backward compatibility
    };

    await fs.writeFile(
        path.join(projectPath, '.demo-builder.json'),
        JSON.stringify(manifest, null, 2),
    );

    context.logger.debug('[Project Creation] Project manifest created');

    // Step 8: Save project state (95%)
    progressTracker('Finalizing Project', 95, 'Saving project state...');

    context.logger.debug('[Project Creation] About to save project state...');
    context.logger.debug('[Project Creation] Project object:', JSON.stringify({
        name: project.name,
        status: 'ready',
        componentCount: getEntryCount(project.componentInstances),
    }));

    try {
        project.status = 'ready';

        // Initialize component versions (for future update tracking)
        if (!project.componentVersions) {
            project.componentVersions = {};
        }

        for (const componentId of getComponentIds(project.componentInstances)) {
            const componentInstance = project.componentInstances?.[componentId];
            const detectedVersion = componentInstance?.version || 'unknown';

            project.componentVersions[componentId] = {
                version: detectedVersion, // Use version detected during installation
                lastUpdated: new Date().toISOString(),
            };

            if (detectedVersion !== 'unknown') {
                context.logger.debug(`[Project Creation] ${componentId} version: ${detectedVersion}`);
            }
        }

        await context.stateManager.saveProject(project);
        context.logger.info('[Project Creation] ✅ Project state saved successfully');
    } catch (saveError) {
        context.logger.error('[Project Creation] ❌ Failed to save project', saveError instanceof Error ? saveError : undefined);
        throw saveError; // Re-throw to trigger error handling
    }

    // Step 9: Complete
    progressTracker('Project Created', 100, 'Project creation complete');

    context.logger.info('[Project Creation] Completed successfully!');

    // Note: Tree view auto-refreshes via StateManager.onProjectChanged event
    // (triggered by saveProject() above)

    // Project Dashboard is now opened directly via "Open Project" button
    // (No need for restart flag)

    // Send completion message (with project path for Browse Files button)
    context.logger.debug('[Project Creation] Sending completion message to webview...');
    try {
        await context.sendMessage('creationComplete', {
            projectPath: projectPath,
            success: true,
            message: 'Your demo is ready to start',
        });
        context.logger.debug('[Project Creation] ✅ Completion message sent');
    } catch (messageError) {
        context.logger.error('[Project Creation] ❌ Failed to send completion message', messageError instanceof Error ? messageError : undefined);
    }

    // Auto-close the webview panel after 2 minutes as a fallback
    // (User should click "Open Project" to close and open the project in workspace)
    setTimeout(() => {
        if (context.panel) {
            context.panel.dispose();
            context.logger.debug('[Project Creation] Webview panel closed automatically (timeout - user did not click Open Project)');
        }
    }, TIMEOUTS.WEBVIEW_AUTO_CLOSE);

    context.logger.debug('[Project Creation] ===== PROJECT CREATION WORKFLOW COMPLETE =====');
}
