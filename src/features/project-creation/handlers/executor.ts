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
} from '../services';
import { ProgressTracker } from './shared';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { TransformedComponentDefinition } from '@/types';
import { AdobeConfig } from '@/types/base';
import { getProjectFrontendPort, getComponentConfigPort, isEdsStackId } from '@/types/typeGuards';
import type { MeshPhaseState } from '@/types/webview';

// EDS service imports (lazy-loaded, only instantiated for EDS stacks)
import type {
    EdsProjectConfig,
    EdsProgressCallback,
    EdsProjectSetupResult,
} from '@/features/eds/services/types';
import { GitHubAppNotInstalledError, EDS_COMPONENT_ID } from '@/features/eds/services/types';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map EDS setup phase to user-friendly operation name
 */
function getEdsOperationName(phase: string): string {
    const phaseMap: Record<string, string> = {
        'github-repo': 'GitHub Repository',
        'github-clone': 'Cloning Repository',
        'helix-config': 'Helix Configuration',
        'code-sync': 'Code Sync Verification',
        'dalive-content': 'DA.live Content',
        'tools-clone': 'Ingestion Tool',
        'env-config': 'Environment Setup',
        'complete': 'EDS Setup Complete',
    };
    return phaseMap[phase] || 'EDS Setup';
}

/**
 * Frontend source from template (same shape as TemplateSource)
 */
interface FrontendSource {
    type: string;
    url: string;
    branch: string;
    gitOptions?: {
        shallow?: boolean;
        recursive?: boolean;
    };
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
        appBuilder?: string[];
    };
    componentConfigs?: Record<string, Record<string, unknown>>;
    apiMesh?: {
        meshId?: string;
        endpoint?: string;
        meshStatus?: string;
        workspace?: string;
    };
    meshStepEnabled?: boolean;
    // For detecting same-workspace imports to skip mesh deployment
    importedWorkspaceId?: string;
    importedMeshEndpoint?: string;
    // Package/Stack selections
    selectedPackage?: string;
    selectedStack?: string;
    // Selected optional addons (e.g., ['demo-inspector'])
    selectedAddons?: string[];
    // Frontend source from template (templates are source of truth for repos)
    frontendSource?: FrontendSource;
    // Edit mode: re-use existing project directory
    editMode?: boolean;
    editProjectPath?: string;
    // EDS-specific configuration (for Edge Delivery Services stacks)
    edsConfig?: {
        repoName: string;
        repoMode: 'new' | 'existing';
        existingRepo?: string;
        resetToTemplate?: boolean;
        daLiveOrg: string;
        daLiveSite: string;
        accsEndpoint?: string;
        githubOwner?: string;
        isPrivate?: boolean;
        skipContent?: boolean;
        skipTools?: boolean;
    };
}

/**
 * Actual project creation logic (extracted for testability)
 */
export async function executeProjectCreation(context: HandlerContext, config: Record<string, unknown>): Promise<void> {
    const typedConfig = config as unknown as ProjectCreationConfig;

    // Track current mesh phase for progress messages
    let currentMeshPhase: MeshPhaseState | undefined;

    // Create progress tracker (includes mesh phase state when present)
    const progressTracker: ProgressTracker = (currentOperation: string, progress: number, message?: string) => {
        context.sendMessage('creationProgress', {
            currentOperation,
            progress,
            message: message || '',
            logs: [],
            meshPhase: currentMeshPhase,
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

    // Determine project path based on edit mode
    const isEditMode = typedConfig.editMode && typedConfig.editProjectPath;
    const projectPath = isEditMode
        ? typedConfig.editProjectPath!
        : path.join(os.homedir(), '.demo-builder', 'projects', typedConfig.projectName);

    if (isEditMode) {
        context.logger.info(`[Project Edit] Editing existing project at: ${projectPath}`);
    } else {
        // Clean up orphaned/invalid directories (new project only)
        await cleanupOrphanedDirectory(projectPath, context, progressTracker, fs);
    }

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
            appBuilder: typedConfig.components?.appBuilder || [],
        },
        componentConfigs: (typedConfig.componentConfigs || {}) as Record<string, Record<string, string | number | boolean | undefined>>,
        selectedPackage: typedConfig.selectedPackage,
        selectedStack: typedConfig.selectedStack,
    };

    context.logger.debug('[Project Creation] Deferring project state save until after installation');

    // ========================================================================
    // EDS SETUP (if EDS stack selected)
    // ========================================================================

    const isEdsStack = isEdsStackId(typedConfig.selectedStack);
    let edsResult: EdsProjectSetupResult | undefined;

    // EDS frontend is cloned to components/eds-storefront like other frontends
    const edsComponentPath = path.join(projectPath, 'components', EDS_COMPONENT_ID);

    if (isEdsStack && typedConfig.edsConfig) {
        progressTracker('EDS Setup', 16, 'Initializing Edge Delivery Services...');

        // Check if AuthenticationService is available
        if (!context.authManager) {
            context.logger.warn('[Project Creation] AuthenticationService not available - skipping EDS setup');
        } else {
            // Build EdsProjectConfig from wizard config
            const edsProjectConfig: EdsProjectConfig = {
                projectName: typedConfig.projectName,
                projectPath,
                componentPath: edsComponentPath,
                repoName: typedConfig.edsConfig.repoName,
                daLiveOrg: typedConfig.edsConfig.daLiveOrg,
                daLiveSite: typedConfig.edsConfig.daLiveSite,
                accsEndpoint: typedConfig.edsConfig.accsEndpoint || '',
                githubOwner: typedConfig.edsConfig.githubOwner || '',
                isPrivate: typedConfig.edsConfig.isPrivate,
                skipContent: typedConfig.edsConfig.skipContent,
                skipTools: typedConfig.edsConfig.skipTools,
                repoMode: typedConfig.edsConfig.repoMode,
                existingRepo: typedConfig.edsConfig.existingRepo,
                resetToTemplate: typedConfig.edsConfig.resetToTemplate,
            };

            // Map EdsProgressCallback to executor progressTracker
            // EDS progress (0-100) maps to executor progress (16-30)
            // Show each phase as a distinct operation for better visibility
            const edsProgressCallback: EdsProgressCallback = (phase, progress, message) => {
                const mappedProgress = 16 + Math.round(progress * 0.14);
                
                // Map phase to user-friendly operation name
                const operationName = getEdsOperationName(phase);
                progressTracker(operationName, mappedProgress, message);
            };

            // Lazy-load EDS services (only for EDS stacks)
            const { EdsProjectService } = await import('@/features/eds/services/edsProjectService');
            const { GitHubTokenService } = await import('@/features/eds/services/githubTokenService');
            const { GitHubRepoOperations } = await import('@/features/eds/services/githubRepoOperations');
            const { DaLiveOrgOperations } = await import('@/features/eds/services/daLiveOrgOperations');
            const { DaLiveContentOperations } = await import('@/features/eds/services/daLiveContentOperations');
            const { ComponentManager } = await import('@/features/components/services/componentManager');

            // Create TokenProvider adapter from AuthenticationService
            // TokenManager returns undefined, TokenProvider expects null - adapt the type
            const tokenProvider = {
                getAccessToken: async () => {
                    const token = await context.authManager!.getTokenManager().getAccessToken();
                    return token ?? null;
                },
            };

            // GitHub services
            const githubTokenService = new GitHubTokenService(context.context.secrets, context.logger);
            const githubRepoOperations = new GitHubRepoOperations(githubTokenService, context.logger);
            const githubServices = {
                tokenService: githubTokenService,
                repoOperations: githubRepoOperations,
            };

            // DA.live services
            const daLiveOrgOperations = new DaLiveOrgOperations(tokenProvider, context.logger);
            const daLiveContentOperations = new DaLiveContentOperations(tokenProvider, context.logger);
            const daLiveServices = {
                orgOperations: daLiveOrgOperations,
                contentOperations: daLiveContentOperations,
            };

            // ComponentManager for tool cloning
            const componentManager = new ComponentManager(context.logger);

            // Create EdsProjectService and run setup
            const edsProjectService = new EdsProjectService(
                githubServices,
                daLiveServices,
                context.authManager,
                componentManager,
                context.logger,
            );

            context.logger.info(`[Project Creation] Running EDS setup for: ${typedConfig.projectName}`);

            // Run EDS setup - pre-flight check in UI ensures GitHub app is installed
            edsResult = await edsProjectService.setupProject(edsProjectConfig, edsProgressCallback);

            if (!edsResult.success) {
                const errorMsg = `EDS setup failed at phase '${edsResult.phase}': ${edsResult.error}`;
                context.logger.error(`[Project Creation] ${errorMsg}`);
                throw new Error(errorMsg);
            }

            context.logger.info(`[Project Creation] EDS setup complete: ${edsResult.repoUrl}`);

            // Register EDS frontend as a component instance (like other frontends)
            // Uses EDS_COMPONENT_ID for consistency, cloned to components/eds-storefront
            const frontendInstance: import('@/types').ComponentInstance = {
                id: EDS_COMPONENT_ID,
                name: 'EDS Storefront',
                type: 'frontend',
                path: edsComponentPath,
                repoUrl: edsResult?.repoUrl,
                status: 'ready',
                lastUpdated: new Date(),
                metadata: {
                    previewUrl: edsResult.previewUrl,
                    liveUrl: edsResult.liveUrl,
                    repoUrl: edsResult.repoUrl,
                    daLiveOrg: typedConfig.edsConfig.daLiveOrg,
                    daLiveSite: typedConfig.edsConfig.daLiveSite,
                },
            };
            project.componentInstances![EDS_COMPONENT_ID] = frontendInstance;

            context.logger.debug(`[Project Creation] Registered EDS frontend component: ${EDS_COMPONENT_ID} at ${edsComponentPath}`);
        }

        // Save project state after EDS setup completes (ensures EDS metadata is persisted
        // even if later steps fail)
        await context.stateManager.saveProject(project);

        progressTracker('EDS Setup', 30, 'EDS initialization complete');
    }

    // ========================================================================
    // LOAD COMPONENT DEFINITIONS
    // ========================================================================

    progressTracker('Loading Components', 20, 'Preparing component definitions...');

    const { ComponentRegistryManager } = await import('@/features/components/services/ComponentRegistryManager');
    const registryManager = new ComponentRegistryManager(context.context.extensionPath);
    const registry = await registryManager.loadRegistry();
    const sharedEnvVars = registry.envVars || {};

    const componentDefinitions = await loadComponentDefinitions(typedConfig, registryManager, context, isEdsStack);

    // ========================================================================
    // EDIT MODE: CLEAN SLATE FOR COMPONENTS
    // ========================================================================

    if (isEditMode) {
        // Delete existing components directory - will be recreated during installation
        const existingComponentsDir = path.join(projectPath, 'components');
        const componentsExist = await fs.access(existingComponentsDir).then(() => true).catch(() => false);
        if (componentsExist) {
            context.logger.info('[Project Edit] Removing existing components directory');
            progressTracker('Cleaning Up', 18, 'Removing existing components...');
            await fs.rm(existingComponentsDir, { recursive: true, force: true });
        }
    }

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

    // Check for same-workspace import FIRST - if user imported settings from same workspace,
    // the mesh already exists there, so we can skip deployment entirely
    const isSameWorkspaceImport = typedConfig.importedWorkspaceId &&
                                   typedConfig.importedMeshEndpoint &&
                                   typedConfig.importedWorkspaceId === typedConfig.adobe?.workspace;

    if (isSameWorkspaceImport) {
        // Same workspace import - mesh already exists, just link to it
        // This happens when importing from a file - the workspace is auto-selected from the import
        context.logger.info(`[Mesh Setup] Skipping deployment - reusing mesh from imported settings`);
        context.logger.debug(`[Mesh Setup] Imported workspace matches selected: ${typedConfig.importedWorkspaceId}`);
        const importedApiMesh = {
            endpoint: typedConfig.importedMeshEndpoint,
            meshId: '', // We don't have the mesh ID, but endpoint is sufficient
            meshStatus: 'deployed' as const,
            workspace: typedConfig.adobe?.workspace,
        };
        await linkExistingMesh(meshContext, importedApiMesh);
    } else if (shouldConfigureExistingMesh(typedConfig.apiMesh, meshComponent?.endpoint, typedConfig.meshStepEnabled)) {
        // Check for existing mesh (takes precedence - don't deploy if workspace already has mesh)
        await linkExistingMesh(meshContext, typedConfig.apiMesh!);
    } else if (meshComponent?.path && meshDefinition && !typedConfig.meshStepEnabled) {
        // No existing mesh in workspace - deploy new one
        // If imported from different workspace, mesh endpoint won't work - must deploy fresh
        if (typedConfig.importedWorkspaceId && typedConfig.importedWorkspaceId !== typedConfig.adobe?.workspace) {
            context.logger.debug(`[Mesh Setup] Imported workspace differs from selected - deploying new mesh`);
            context.logger.debug(`[Mesh Setup] Imported: ${typedConfig.importedWorkspaceId}, Selected: ${typedConfig.adobe?.workspace}`);
        }

        // CRITICAL: Ensure workspace context is correct before mesh deployment
        // The Adobe CLI mesh commands operate on the currently-selected workspace.
        // CLI context can drift from other sessions/operations, causing mesh to deploy
        // to wrong workspace. This validates and restores context before deployment.
        if (context.authManager && typedConfig.adobe?.workspace && typedConfig.adobe?.projectId) {
            context.logger.debug(`[Mesh Setup] Ensuring workspace context: ${typedConfig.adobe.workspace}`);
            const contextOk = await context.authManager.selectWorkspace(
                typedConfig.adobe.workspace,
                typedConfig.adobe.projectId,
            );
            if (!contextOk) {
                context.logger.error('[Mesh Setup] Failed to set workspace context - mesh may deploy to wrong workspace');
                // Continue anyway - the mesh command may still work if context happens to be correct
            }
        }

        await deployNewMesh(meshContext, typedConfig.apiMesh);
    } else if (meshComponent?.path && typedConfig.meshStepEnabled && typedConfig.apiMesh?.endpoint) {
        // Mesh was deployed via wizard step - update component instance with wizard data
        // Note: endpoint is stored in meshState (authoritative), not componentInstance
        context.logger.debug('[Project Creation] Mesh deployed via wizard step, updating component instance');
        meshComponent.status = 'deployed';
        meshComponent.metadata = {
            meshId: typedConfig.apiMesh.meshId || '',
            meshStatus: 'deployed',
        };
        project.componentInstances!['commerce-mesh'] = meshComponent;

        // Store endpoint in meshState as single source of truth
        // See docs/architecture/state-ownership.md
        if (!project.meshState) {
            project.meshState = {
                envVars: {},
                sourceHash: null,
                lastDeployed: new Date().toISOString(),
                endpoint: typedConfig.apiMesh.endpoint,
            };
        } else {
            project.meshState.endpoint = typedConfig.apiMesh.endpoint;
            project.meshState.lastDeployed = new Date().toISOString();
        }
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

    // Populate componentConfigs['commerce-mesh'] from the generated .env file
    // This enables Configure UI to save mesh env var changes
    const meshInstanceForConfig = project.componentInstances?.['commerce-mesh'];
    if (meshInstanceForConfig?.path) {
        const { readMeshEnvVarsFromFile } = await import('@/features/mesh/services/stalenessDetector');
        const meshEnvVars = await readMeshEnvVarsFromFile(meshInstanceForConfig.path);
        if (meshEnvVars && Object.keys(meshEnvVars).length > 0) {
            if (!project.componentConfigs) {
                project.componentConfigs = {};
            }
            project.componentConfigs['commerce-mesh'] = meshEnvVars;
            context.logger.debug(`[Project Creation] Populated componentConfigs['commerce-mesh'] with ${Object.keys(meshEnvVars).length} env vars`);
        }
    }

    await finalizeProject(finalizationContext);
    await sendCompletionAndCleanup(finalizationContext);
}

// ============================================================================
// Private Helper Functions
// ============================================================================

async function handlePortConflicts(
    context: HandlerContext,
    typedConfig: ProjectCreationConfig,
    _progressTracker: ProgressTracker,
): Promise<void> {
    const existingProject = await context.stateManager.getCurrentProject();
    if (existingProject && existingProject.status === 'running') {
        const runningPort = getProjectFrontendPort(existingProject);
        const defaultPort = vscode.workspace.getConfiguration('demoBuilder').get<number>('defaultPort', 3000);
        const frontendId = typedConfig.components?.frontend;
        const targetPort = (frontendId && getComponentConfigPort(typedConfig.componentConfigs, frontendId)) || defaultPort;

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
    isEdsStack: boolean = false,
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

    // Build component list - skip frontend for EDS stacks (EdsProjectService handles repo cloning)
    const allComponents = [
        // Only include frontend if NOT EDS stack (EDS handles repo cloning internally via setupProject)
        ...(!isEdsStack && typedConfig.components?.frontend
            ? [{ id: typedConfig.components.frontend, type: 'frontend' }]
            : []),
        ...filteredDependencies.map((id: string) => ({ id, type: 'dependency' })),
        ...(typedConfig.components?.appBuilder || []).map((id: string) => ({ id, type: 'app-builder' })),
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

        // Fallback: If not found in type-specific section, search all sections
        // This handles components that are in different sections (e.g., mesh components
        // selected as dependencies are stored in the "mesh" section of components.json)
        if (!componentDef) {
            componentDef = await registryManager.getComponentById(comp.id) as TransformedComponentDefinition | undefined;
        }

        if (!componentDef) {
            context.logger.warn(`[Project Creation] Component ${comp.id} not found in registry`);
            continue;
        }

        // For frontend components, use frontendSource from config (template is source of truth)
        // This allows abstract component types in components.json without hardcoded repos
        if (comp.type === 'frontend' && typedConfig.frontendSource) {
            // Override component source with template source
            componentDef = {
                ...componentDef,
                source: {
                    type: typedConfig.frontendSource.type as 'git' | 'npm' | 'local',
                    url: typedConfig.frontendSource.url,
                    branch: typedConfig.frontendSource.branch,
                    gitOptions: typedConfig.frontendSource.gitOptions,
                },
            };
            context.logger.debug(`[Project Creation] Using template source for ${componentDef.name}: ${typedConfig.frontendSource.url}`);
        }

        // Validate that installable components have a source defined
        // Frontends get source from template (above), dependencies/app-builder from components.json
        // Backends are configuration-only (remote systems) and don't need a source
        if (!componentDef.source) {
            const errorMsg = comp.type === 'frontend'
                ? `No storefront found for stack "${typedConfig.selectedStack}" and package "${typedConfig.selectedPackage}". ` +
                  `Please ensure a matching storefront exists in demo-packages.json.`
                : `Component "${componentDef.name}" (${comp.id}) has no installation source defined. ` +
                  `This is a configuration error in components.json - installable components must have a "source" property.`;
            context.logger.error(`[Project Creation] ${errorMsg}`);
            throw new Error(errorMsg);
        }

        // Determine submodules for frontend components
        // Submodules can be selected via dependencies (required) or addons (optional)
        const installOptions: { selectedSubmodules?: string[]; skipDependencies?: boolean } = { skipDependencies: true };
        if (comp.type === 'frontend' && componentDef.submodules) {
            const dependencies = typedConfig.components?.dependencies || [];
            const addons = typedConfig.selectedAddons || [];
            const allSelected = [...dependencies, ...addons];
            const selectedSubmodules = allSelected.filter(
                (depId: string) => componentDef?.submodules?.[depId] !== undefined,
            );
            if (selectedSubmodules.length > 0) {
                installOptions.selectedSubmodules = selectedSubmodules;
                context.logger.debug(`[Project Creation] Selected submodules for ${componentDef.name}: ${selectedSubmodules.join(', ')}`);
            }
        }

        // Ensure type is set on the definition for ComponentInstance creation
        // This enables dynamic lookup by type (e.g., finding the frontend component)
        componentDef = { ...componentDef, type: comp.type as TransformedComponentDefinition['type'] };

        componentDefinitions.set(comp.id, { definition: componentDef, type: comp.type, installOptions });
    }

    return componentDefinitions;
}
