/**
 * Project Creation Handlers - Executor
 *
 * Main project creation execution logic. Orchestrates the phases:
 * - Pre-flight checks (port conflicts, directory cleanup)
 * - Phase 1-2: Component installation (via componentInstallationOrchestrator)
 * - Phase 3: Mesh configuration (via meshSetupService)
 * - Phase 4-5: Finalization (via projectFinalizationService)
 */

import * as vscode from 'vscode';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { ProgressTracker } from './shared';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { AdobeConfig } from '@/types/base';
import { getProjectFrontendPort, getComponentConfigPort } from '@/types/typeGuards';
import { TransformedComponentDefinition } from '@/types';
import {
    cloneAllComponents,
    installAllComponents,
    deployNewMesh,
    linkExistingMesh,
    shouldConfigureExistingMesh,
    generateEnvironmentFiles,
    finalizeProject,
    sendCompletionAndCleanup,
    type ComponentDefinitionEntry,
} from './services';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert kebab-case submodule ID to Title Case display name
 */
function formatSubmoduleDisplayName(id: string): string {
    return id
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Build user-friendly submessage for component installation progress
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
    meshStepEnabled?: boolean;
}

/**
 * Actual project creation logic (extracted for testability)
 */
export async function executeProjectCreation(context: HandlerContext, config: Record<string, unknown>): Promise<void> {
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

    // ========================================================================
    // PRE-FLIGHT CHECKS
    // ========================================================================

    // Safety check: Ensure port is available
    await handlePortConflicts(context, typedConfig, progressTracker);

    // Import dependencies
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');

    // Clean up orphaned/invalid directories
    const projectPath = path.join(os.homedir(), '.demo-builder', 'projects', typedConfig.projectName);
    await cleanupOrphanedDirectory(projectPath, context, progressTracker, fs);

    // ========================================================================
    // PROJECT INITIALIZATION
    // ========================================================================

    progressTracker('Setting Up Project', 10, 'Creating project directory structure...');

    const componentsDir = path.join(projectPath, 'components');
    await fs.mkdir(componentsDir, { recursive: true });
    await fs.mkdir(path.join(projectPath, 'logs'), { recursive: true });

    context.logger.debug(`[Project Creation] Created directory: ${projectPath}`);

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

    context.logger.debug('[Project Creation] Deferring project state save until after installation');

    // ========================================================================
    // LOAD COMPONENT DEFINITIONS
    // ========================================================================

    progressTracker('Loading Components', 20, 'Preparing component definitions...');

    const { ComponentRegistryManager } = await import('@/features/components/services/ComponentRegistryManager');
    const registryManager = new ComponentRegistryManager(context.context.extensionPath);
    const registry = await registryManager.loadRegistry();
    const sharedEnvVars = registry.envVars || {};

    const componentDefinitions = await loadComponentDefinitions(typedConfig, registryManager, context);

    // ========================================================================
    // PHASE 1-2: COMPONENT INSTALLATION
    // ========================================================================

    const installationContext = {
        project,
        componentDefinitions,
        progressTracker,
        logger: context.logger,
        saveProject: () => context.stateManager.saveProject(project),
    };

    await cloneAllComponents(installationContext);
    await installAllComponents(installationContext);

    // ========================================================================
    // PHASE 3: MESH CONFIGURATION
    // ========================================================================

    const meshComponent = project.componentInstances?.['commerce-mesh'];
    const meshDefinition = componentDefinitions.get('commerce-mesh')?.definition;

    const meshContext = {
        project,
        meshDefinition,
        sharedEnvVars,
        config,
        progressTracker,
        logger: context.logger,
        onMeshCreated: (workspace: string | undefined) => {
            context.sharedState.meshCreatedForWorkspace = workspace;
        },
    };

    if (meshComponent?.path && meshDefinition && !typedConfig.meshStepEnabled) {
        await deployNewMesh(meshContext, typedConfig.apiMesh);
    } else if (shouldConfigureExistingMesh(typedConfig.apiMesh, meshComponent, typedConfig.meshStepEnabled)) {
        await linkExistingMesh(meshContext, typedConfig.apiMesh!);
    }

    // ========================================================================
    // PHASE 4-5: FINALIZATION
    // ========================================================================

    const finalizationContext = {
        project,
        projectPath,
        componentDefinitions,
        sharedEnvVars,
        config,
        progressTracker,
        logger: context.logger,
        saveProject: () => context.stateManager.saveProject(project),
        sendMessage: (type: string, data: Record<string, unknown>) => context.sendMessage(type, data),
        panel: context.panel,
    };

    await generateEnvironmentFiles(finalizationContext);
    await finalizeProject(finalizationContext);
    await sendCompletionAndCleanup(finalizationContext);
}

// ============================================================================
// Private Helper Functions
// ============================================================================

async function handlePortConflicts(
    context: HandlerContext,
    typedConfig: ProjectCreationConfig,
    progressTracker: ProgressTracker,
): Promise<void> {
    const existingProject = await context.stateManager.getCurrentProject();
    if (existingProject && existingProject.status === 'running') {
        const runningPort = getProjectFrontendPort(existingProject);
        const defaultPort = vscode.workspace.getConfiguration('demoBuilder').get<number>('defaultPort', 3000);
        const targetPort = getComponentConfigPort(typedConfig.componentConfigs, 'citisignal-nextjs') || defaultPort;

        if (runningPort === targetPort) {
            context.logger.debug(`[Project Creation] Stopping running demo on port ${runningPort}`);

            vscode.window.setStatusBarMessage(
                `⚠️  Stopping "${existingProject.name}" demo (port ${runningPort} conflict)`,
                TIMEOUTS.STATUS_BAR_SUCCESS,
            );

            await vscode.commands.executeCommand('demoBuilder.stopDemo');
            await new Promise(resolve => setTimeout(resolve, TIMEOUTS.DEMO_STOP_WAIT));
        }
    }
}

async function cleanupOrphanedDirectory(
    projectPath: string,
    context: HandlerContext,
    progressTracker: ProgressTracker,
    fs: typeof import('fs/promises'),
): Promise<void> {
    if (await fs.access(projectPath).then(() => true).catch(() => false)) {
        context.logger.warn(`[Project Creation] Directory already exists: ${projectPath}`);

        const existingFiles = await fs.readdir(projectPath);
        if (existingFiles.length > 0) {
            context.logger.debug(`[Project Creation] Found ${existingFiles.length} files, cleaning up...`);
            progressTracker('Preparing Project', 5, 'Removing existing project data...');
            await fs.rm(projectPath, { recursive: true, force: true });
        } else {
            await fs.rmdir(projectPath);
        }
    }
}

async function loadComponentDefinitions(
    typedConfig: ProjectCreationConfig,
    registryManager: import('@/features/components/services/ComponentRegistryManager').ComponentRegistryManager,
    context: HandlerContext,
): Promise<Map<string, ComponentDefinitionEntry>> {
    // Get frontend's submodule IDs to skip them in the dependency loop
    const frontendSubmoduleIds = new Set<string>();
    if (typedConfig.components?.frontend) {
        const frontends = await registryManager.getFrontends();
        const frontendDef = frontends.find((f: { id: string }) => f.id === typedConfig.components?.frontend);
        if (frontendDef?.submodules) {
            Object.keys(frontendDef.submodules).forEach(id => frontendSubmoduleIds.add(id));
        }
    }

    // Filter out submodule IDs from dependencies
    const filteredDependencies = (typedConfig.components?.dependencies || [])
        .filter((id: string) => !frontendSubmoduleIds.has(id));

    const allComponents = [
        ...(typedConfig.components?.frontend ? [{ id: typedConfig.components.frontend, type: 'frontend' }] : []),
        ...filteredDependencies.map((id: string) => ({ id, type: 'dependency' })),
        ...(typedConfig.components?.appBuilderApps || []).map((id: string) => ({ id, type: 'app-builder' })),
    ];

    const componentDefinitions: Map<string, ComponentDefinitionEntry> = new Map();

    for (const comp of allComponents) {
        let componentDef: TransformedComponentDefinition | undefined;

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

        // Determine submodules for frontend components
        const installOptions: { selectedSubmodules?: string[]; skipDependencies?: boolean } = { skipDependencies: true };
        if (comp.type === 'frontend' && componentDef.submodules) {
            const allSelectedDeps = typedConfig.components?.dependencies || [];
            const selectedSubmodules = allSelectedDeps.filter(
                (depId: string) => componentDef?.submodules?.[depId] !== undefined
            );
            if (selectedSubmodules.length > 0) {
                installOptions.selectedSubmodules = selectedSubmodules;
                context.logger.debug(`[Project Creation] Selected submodules for ${componentDef.name}: ${selectedSubmodules.join(', ')}`);
            }
        }

        componentDefinitions.set(comp.id, { definition: componentDef, type: comp.type, installOptions });
    }

    return componentDefinitions;
}
