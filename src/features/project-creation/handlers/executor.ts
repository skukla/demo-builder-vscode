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
    EnvGenerationConfig,
} from '@/features/project-creation/helpers';
import { AdobeConfig } from '@/types/base';
import { parseJSON, hasEntries, getEntryCount, getComponentIds, getProjectFrontendPort, getComponentConfigPort } from '@/types/typeGuards';
import { extractAndParseJSON } from '@/features/mesh/utils/meshHelpers';
import { getMeshNodeVersion } from '@/features/mesh/services/meshConfig';
import { TransformedComponentDefinition } from '@/types';

// ============================================================================
// Helper Functions (SOP §6: Extract named functions for transformations)
// ============================================================================

/**
 * Convert kebab-case submodule ID to Title Case display name
 * @example 'demo-inspector' -> 'Demo Inspector'
 */
function formatSubmoduleDisplayName(id: string): string {
    return id
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Build user-friendly submessage for component installation progress
 * Shows "Adding [Submodule Name]..." only when submodules are selected
 * @param selectedSubmodules - Array of submodule IDs that were selected by user
 */
function buildInstallationSubmessage(selectedSubmodules?: string[]): string {
    const DEFAULT_MESSAGE = 'Cloning repository and installing dependencies...';

    if (!selectedSubmodules || selectedSubmodules.length === 0) {
        return DEFAULT_MESSAGE;
    }

    const displayNames = selectedSubmodules.map(formatSubmoduleDisplayName);
    return `Adding ${displayNames.join(', ')}...`;
}

/**
 * Determine if we should configure an existing mesh (vs clone new one)
 *
 * SOP §10: Extracted validation chain to named predicate function
 *
 * Conditions:
 * - User selected an existing mesh (has meshId and endpoint)
 * - Mesh is NOT already installed as a component (meshComponent is undefined)
 * - Mesh step is NOT enabled (separate wizard step handles deployment)
 */
function shouldConfigureExistingMesh(
    config: { meshId?: string; endpoint?: string } | undefined,
    meshComponent: unknown,
    meshStepEnabled: boolean | undefined,
): boolean {
    const hasExistingMesh = Boolean(config?.meshId && config?.endpoint);
    const notAlreadyInstalled = !meshComponent;
    const notHandledByWizardStep = !meshStepEnabled;
    return hasExistingMesh && notAlreadyInstalled && notHandledByWizardStep;
}

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
    /**
     * When true, mesh deployment is handled by a separate MeshDeploymentStep in the wizard.
     * The executor will skip its internal mesh deployment logic.
     * PM Decision (2025-12-06): Mesh deployment timeout recovery feature.
     */
    meshStepEnabled?: boolean;
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
        const runningPort = getProjectFrontendPort(existingProject);
        const defaultPort = vscode.workspace.getConfiguration('demoBuilder').get<number>('defaultPort', 3000);
        const targetPort = getComponentConfigPort(typedConfig.componentConfigs, 'citisignal-nextjs') || defaultPort;

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

    // Get frontend's submodule IDs to skip them in the dependency loop
    // (submodules are handled during frontend clone via --recursive or selective init)
    const frontendSubmoduleIds = new Set<string>();
    if (typedConfig.components?.frontend) {
        const frontends = await registryManager.getFrontends();
        const frontendDef = frontends.find((f: { id: string }) => f.id === typedConfig.components?.frontend);
        if (frontendDef?.submodules) {
            // SOP §4: Extract Object.keys to named variable
            const submoduleIds = Object.keys(frontendDef.submodules);
            submoduleIds.forEach(id => frontendSubmoduleIds.add(id));
        }
    }

    // ========================================================================
    // PHASE-BASED COMPONENT INSTALLATION
    // Optimized order: Clone → Install → Mesh .env → Deploy → Frontend .env
    // Each .env written exactly once with correct data
    // ========================================================================

    // Filter out submodule IDs from dependencies - they're installed with the frontend
    const filteredDependencies = (typedConfig.components?.dependencies || [])
        .filter((id: string) => !frontendSubmoduleIds.has(id));

    const allComponents = [
        ...(typedConfig.components?.frontend ? [{ id: typedConfig.components.frontend, type: 'frontend' }] : []),
        ...filteredDependencies.map((id: string) => ({ id, type: 'dependency' })),
        ...(typedConfig.components?.appBuilderApps || []).map((id: string) => ({ id, type: 'app-builder' })),
    ];

    // Pre-load all component definitions for phase-based installation
    const componentDefinitions: Map<string, { definition: TransformedComponentDefinition; type: string; installOptions: { selectedSubmodules?: string[]; skipDependencies?: boolean } }> = new Map();

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

        // For frontend components, determine which submodules to initialize
        const installOptions: { selectedSubmodules?: string[]; skipDependencies?: boolean } = { skipDependencies: true };
        if (comp.type === 'frontend' && componentDef.submodules) {
            const allSelectedDeps = typedConfig.components?.dependencies || [];
            const selectedSubmodules = allSelectedDeps.filter(
                (depId: string) => componentDef.submodules?.[depId] !== undefined
            );
            if (selectedSubmodules.length > 0) {
                installOptions.selectedSubmodules = selectedSubmodules;
                context.logger.debug(`[Project Creation] Selected submodules for ${componentDef.name}: ${selectedSubmodules.join(', ')}`);
            }
        }

        componentDefinitions.set(comp.id, { definition: componentDef, type: comp.type, installOptions });
    }

    // ========================================================================
    // PHASE 1: Clone All Components (25-40%) - PARALLEL
    // Download source code only, no npm install
    // ========================================================================
    progressTracker('Downloading Components', 25, 'Cloning repositories...');
    context.logger.info('[Project Creation] 📥 Phase 1: Downloading components...');

    // Clone all components in parallel
    const clonePromises = Array.from(componentDefinitions.entries()).map(
        async ([compId, { definition, installOptions }]) => {
            context.logger.debug(`[Project Creation] Cloning: ${definition.name}`);

            // Clone without npm install (skipDependencies: true)
            const result = await componentManager.installComponent(project, definition, installOptions);

            if (!result.success || !result.component) {
                throw new Error(`Failed to clone ${definition.name}: ${result.error}`);
            }

            return { compId, component: result.component };
        }
    );

    const cloneResults = await Promise.all(clonePromises);

    // Update project with all cloned components
    for (const { compId, component } of cloneResults) {
        project.componentInstances![compId] = component;
    }

    // Save project state after all clones (show components in sidebar)
    await context.stateManager.saveProject(project);
    progressTracker('Downloading Components', 40, 'All components downloaded');
    context.logger.info('[Project Creation] ✅ Phase 1 complete: All components downloaded');

    // ========================================================================
    // PHASE 2: Install All Components (40-70%) - PARALLEL
    // Run npm install for each component
    // ========================================================================
    progressTracker('Installing Components', 40, 'Installing npm packages...');
    context.logger.info('[Project Creation] 📦 Phase 2: Installing components...');

    // Run npm install for all components in parallel
    const installPromises = Array.from(componentDefinitions.entries()).map(
        async ([compId, { definition }]) => {
            const componentPath = project.componentInstances?.[compId]?.path;
            if (!componentPath) return { compId, success: true };

            context.logger.debug(`[Project Creation] npm install: ${definition.name}`);

            const installResult = await componentManager.installNpmDependencies(componentPath, definition);

            if (!installResult.success) {
                throw new Error(`Failed to install ${definition.name}: ${installResult.error}`);
            }

            return { compId, success: true };
        }
    );

    await Promise.all(installPromises);

    // Update all component statuses to ready
    for (const [compId] of componentDefinitions) {
        const componentInstance = project.componentInstances![compId];
        if (componentInstance) {
            componentInstance.status = 'ready';
            componentInstance.lastUpdated = new Date();
        }
    }

    progressTracker('Installing Components', 70, 'All components installed');
    context.logger.info('[Project Creation] ✅ Phase 2 complete: All components installed');

    // ========================================================================
    // PHASE 3: Mesh Configuration (70-85%)
    // Generate mesh .env (needs commerce URLs) + Deploy mesh
    // ========================================================================
    const meshComponent = project.componentInstances?.['commerce-mesh'];
    const meshDefinition = componentDefinitions.get('commerce-mesh')?.definition;

    if (meshComponent?.path && meshDefinition && !typedConfig.meshStepEnabled) {
        // Generate mesh .env BEFORE deployment (mesh needs commerce URLs from .env)
        progressTracker('Configuring API Mesh', 70, 'Generating mesh configuration...');
        context.logger.info('[Project Creation] 🔧 Phase 3: Configuring and deploying API Mesh...');

        await generateEnvFile(
            meshComponent.path,
            'commerce-mesh',
            meshDefinition,
            sharedEnvVars,
            config,
            context.logger,
        );
        context.logger.debug('[Project Creation] Mesh .env generated');

        // Now deploy mesh
        progressTracker('Deploying API Mesh', 75, 'Deploying mesh to Adobe I/O...');

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
                        const describeResult = await commandManager.execute('aio api-mesh:describe', {
                            timeout: TIMEOUTS.MESH_DESCRIBE,
                            configureTelemetry: false,
                            useNodeVersion: getMeshNodeVersion(),
                            enhancePath: true,
                        });

                        if (describeResult.code === 0) {
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

                // Update meshState to track deployment
                const { updateMeshState } = await import('@/features/mesh/services/stalenessDetector');
                await updateMeshState(project);
                context.logger.debug('[Project Creation] Updated mesh state after successful deployment');

                // Fetch deployed mesh config to populate meshState.envVars
                const { fetchDeployedMeshConfig } = await import('@/features/mesh/services/stalenessDetector');
                const deployedConfig = await fetchDeployedMeshConfig();

                if (hasEntries(deployedConfig)) {
                    project.meshState!.envVars = deployedConfig;
                    context.logger.debug('[Project Creation] Populated meshState.envVars with deployed config');
                }

                context.logger.info(`[Project Creation] ✅ Phase 3 complete: Mesh deployed${endpoint ? ' at ' + endpoint : ''}`);
            } else {
                throw new Error(meshDeployResult.error || 'Mesh deployment failed');
            }
        } catch (meshError) {
            context.logger.error('[Project Creation] Failed to deploy mesh', meshError as Error);
            const { formatMeshDeploymentError } = await import('@/features/mesh/utils/errorFormatter');
            throw new Error(formatMeshDeploymentError(meshError as Error));
        }
    }

    // Alternative: Use existing mesh if user selected one instead of cloning
    if (shouldConfigureExistingMesh(typedConfig.apiMesh, meshComponent, typedConfig.meshStepEnabled)) {
        const meshConfig = typedConfig.apiMesh!;
        progressTracker('Configuring API Mesh', 75, 'Adding existing mesh to project...');
        context.logger.info('[Project Creation] 🔗 Phase 3: Linking existing API Mesh...');

        project.componentInstances!['commerce-mesh'] = {
            id: 'commerce-mesh',
            name: 'Commerce API Mesh',
            type: 'dependency',
            subType: 'mesh',
            status: 'deployed',
            endpoint: meshConfig.endpoint,
            lastUpdated: new Date(),
            metadata: {
                meshId: meshConfig.meshId,
                meshStatus: meshConfig.meshStatus,
            },
        };

        const { updateMeshState } = await import('@/features/mesh/services/stalenessDetector');
        await updateMeshState(project);
        context.logger.debug('[Project Creation] Updated mesh state for existing mesh');

        const { fetchDeployedMeshConfig } = await import('@/features/mesh/services/stalenessDetector');
        const deployedConfig = await fetchDeployedMeshConfig();

        if (hasEntries(deployedConfig)) {
            project.meshState!.envVars = deployedConfig;
            context.logger.debug('[Project Creation] Populated meshState.envVars with deployed config');
        }

        context.logger.info('[Project Creation] ✅ Phase 3 complete: Existing mesh linked');
    }

    // ========================================================================
    // PHASE 4: Frontend Configuration (85-90%)
    // Generate frontend .env with MESH_ENDPOINT (now available)
    // ========================================================================
    progressTracker('Configuring Environment', 85, 'Generating environment files...');
    context.logger.info('[Project Creation] 📝 Phase 4: Generating environment configuration...');

    // Get deployed mesh endpoint (if available)
    const deployedMeshEndpoint = project.componentInstances?.['commerce-mesh']?.endpoint;

    // Create config with mesh endpoint for .env generation
    const envConfig: EnvGenerationConfig = {
        ...config,
        apiMesh: deployedMeshEndpoint ? {
            ...typedConfig.apiMesh,
            endpoint: deployedMeshEndpoint,
        } : typedConfig.apiMesh,
    };

    // Generate .env for all non-mesh components (frontend, app-builder, etc.)
    for (const [compId, { definition }] of componentDefinitions) {
        // Skip mesh - already generated in Phase 3
        if (compId === 'commerce-mesh') continue;

        const componentPath = project.componentInstances?.[compId]?.path;
        if (!componentPath) continue;

        await generateEnvFile(
            componentPath,
            compId,
            definition,
            sharedEnvVars,
            envConfig,
            context.logger,
        );
    }

    context.logger.info('[Project Creation] ✅ Phase 4 complete: Environment configured');

    // ========================================================================
    // PHASE 5: Finalize Project (90-100%)
    // Create manifest, save state, complete
    // ========================================================================
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

    progressTracker('Finalizing Project', 95, 'Saving project state...');

    context.logger.debug(`[Project Creation] Saving project: ${project.name} (${getEntryCount(project.componentInstances)} components)`);

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

    progressTracker('Project Created', 100, 'Project creation complete');
    context.logger.info('[Project Creation] ✅ Phase 5 complete: Project finalized');

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
            try {
                // Check if panel is still visible (not already disposed)
                if (context.panel.visible) {
                    context.panel.dispose();
                    context.logger.debug('[Project Creation] Webview panel auto-closed after timeout');
                }
            } catch {
                // Panel was already disposed by user action - this is expected
            }
        }
    }, TIMEOUTS.WEBVIEW_AUTO_CLOSE);

    context.logger.debug('[Project Creation] ===== PROJECT CREATION WORKFLOW COMPLETE =====');
}
