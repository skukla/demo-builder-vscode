/**
 * Project Creation Handlers - Executor
 *
 * Main project creation execution logic. Orchestrates the phases:
 * - Pre-flight checks (port conflicts, directory cleanup)
 * - Phase 1-2: Component installation (via componentInstallationOrchestrator)
 * - Phase 3: Mesh configuration (via meshSetupService)
 * - Phase 4-5: Finalization (via projectFinalizationService)
 */

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
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
import { COMPONENT_IDS } from '@/core/constants';
import { parseGitHubUrl } from '@/core/utils';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { TransformedComponentDefinition } from '@/types';
import { AdobeConfig } from '@/types/base';
import { getProjectFrontendPort, getComponentConfigPort, isEdsStackId, getMeshComponentInstance, getMeshComponentId } from '@/types/typeGuards';
import type { MeshPhaseState } from '@/types/webview';

// EDS config.json sync to remote (Phase 5)
import { syncConfigToRemote } from '@/features/eds/services/configSyncService';

// Stacks configuration - source of truth for frontend/backend/dependencies
import stacksConfig from '../config/stacks.json';
import type { Stack } from '@/types/stacks';

/**
 * Look up a stack by ID from the stacks configuration
 * This is the source of truth for frontend/backend/dependencies - no derivation needed
 */
function getStackById(stackId: string): Stack | undefined {
    return (stacksConfig.stacks as Stack[]).find(s => s.id === stackId);
}

// ============================================================================
// Helper Functions
// ============================================================================

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
        // Template source repo (from frontendSource) for GitHub reset operations
        templateOwner?: string;
        templateRepo?: string;
        // DA.live content source (explicit config, not derived from GitHub)
        contentSource?: {
            org: string;
            site: string;
            indexPath?: string;
        };
        // Preflight completion fields (set by StorefrontSetupStep)
        preflightComplete?: boolean;
        repoUrl?: string;
        // Note: previewUrl/liveUrl not stored - derived from githubRepo by typeGuards
        // Patch IDs to apply during reset (from demo-packages.json)
        patches?: string[];
        // Content patch IDs to apply during DA.live content copy
        contentPatches?: string[];
    };
}

/**
 * Actual project creation logic (extracted for testability)
 */
export async function executeProjectCreation(context: HandlerContext, config: Record<string, unknown>): Promise<void> {
    const typedConfig = config as unknown as ProjectCreationConfig;

    // Debug: trace incoming config values for selectedPackage/selectedStack
    context.logger.debug(`[Project Creation] Received config: selectedPackage=${typedConfig.selectedPackage}, selectedStack=${typedConfig.selectedStack}`);

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

    // Determine project path based on edit mode
    const isEditMode = typedConfig.editMode && typedConfig.editProjectPath;
    const projectPath = isEditMode
        ? typedConfig.editProjectPath!
        : path.join(os.homedir(), '.demo-builder', 'projects', typedConfig.projectName);

    // Load existing project state if in edit mode (to preserve creation date)
    let existingProject: import('@/types').Project | undefined;
    if (isEditMode) {
        context.logger.info(`[Project Edit] Editing existing project at: ${projectPath}`);
        try {
            existingProject = await context.stateManager.loadProjectFromPath(projectPath) ?? undefined;
            if (existingProject) {
                context.logger.debug('[Project Edit] Loaded existing project state for creation date preservation');
            }
        } catch (error) {
            context.logger.warn(`[Project Edit] Could not load existing project state: ${(error as Error).message}`);
        }
    } else {
        // Clean up orphaned/invalid directories (new project only)
        await cleanupOrphanedDirectory(projectPath, context, progressTracker, fsPromises);
    }

    // ========================================================================
    // PROJECT INITIALIZATION
    // ========================================================================

    progressTracker('Setting Up Project', 10, 'Creating project directory structure...');

    const componentsDir = path.join(projectPath, 'components');
    await fsPromises.mkdir(componentsDir, { recursive: true });
    await fsPromises.mkdir(path.join(projectPath, 'logs'), { recursive: true });

    context.logger.debug(`[Project Creation] Created directory: ${projectPath}`);

    progressTracker('Setting Up Project', 15, 'Initializing project configuration...');

    const project: import('@/types').Project = {
        name: typedConfig.projectName,
        created: existingProject?.created || new Date(), // Preserve original creation date in edit mode
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
        selectedAddons: typedConfig.selectedAddons,
        // Note: componentVersions, meshState, etc. are NOT preserved during edit
        // - componentVersions: Regenerated from fresh component installation
        // - meshState: Must be clean slate - old sourceHash won't match fresh files
        // - frontendEnvState: Only valid if demo is running (cleared during edit)
    };

    context.logger.debug('[Project Creation] Deferring project state save until after installation');

    // ========================================================================
    // STACK TYPE DETECTION
    // ========================================================================
    // Detect EDS stacks for special metadata handling later.
    // EDS components are cloned via the standard flow, but need additional
    // metadata populated from runtime config (from preflight step).

    const isEdsStack = isEdsStackId(typedConfig.selectedStack);
    const edsComponentPath = path.join(projectPath, 'components', COMPONENT_IDS.EDS_STOREFRONT);

    // ========================================================================
    // LOAD COMPONENT DEFINITIONS
    // ========================================================================

    progressTracker('Loading Components', 20, 'Preparing component definitions...');

    const { ComponentRegistryManager } = await import('@/features/components/services/ComponentRegistryManager');
    const registryManager = new ComponentRegistryManager(context.context.extensionPath);
    const registry = await registryManager.loadRegistry();

    // Create unified setup context (eliminates parameter threading)
    // Composes HandlerContext to avoid duplicating logger and other common dependencies
    const { ProjectSetupContext } = await import('@/features/project-creation/services/ProjectSetupContext');
    const setupContext = new ProjectSetupContext(context, registry, project, config);

    const componentDefinitions = await loadComponentDefinitions(typedConfig, registryManager, context, isEdsStack);

    // ========================================================================
    // EDIT MODE: PREPARE ATOMIC COMPONENT SWAP
    // ========================================================================
    // In edit mode, install components to a temp directory first.
    // Only swap to production after ALL components install successfully.
    // This preserves the original components if installation fails.

    let tempComponentsDir: string | undefined;

    if (isEditMode) {
        tempComponentsDir = path.join(projectPath, 'components.tmp');

        // Clean up any stale temp directory from previous failed attempts
        const tempDirExists = await fsPromises.access(tempComponentsDir).then(() => true).catch(() => false);
        if (tempDirExists) {
            context.logger.info('[Project Edit] Cleaning up stale temporary components directory');
            await fsPromises.rm(tempComponentsDir, { recursive: true, force: true });
        }

        context.logger.info('[Project Edit] Will install components to temporary directory for atomic swap');
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
        // In edit mode, install to temp directory for atomic swap
        componentsDir: tempComponentsDir,
    };

    // EDIT MODE: Clear old component instances before cloning new ones
    // When switching stacks (e.g., EDS→Headless), old component entries must be removed
    // Otherwise getMeshComponentInstance may return stale entries with invalid paths
    if (isEditMode) {
        const oldComponents = Object.keys(project.componentInstances || {});
        context.logger.debug(`[Project Edit] Clearing old component instances: [${oldComponents.join(', ')}]`);
        project.componentInstances = {};
    }

    await cloneAllComponents(installationContext);
    await installAllComponents(installationContext);

    // ========================================================================
    // EDIT MODE: ATOMIC COMPONENT SWAP
    // ========================================================================
    // After all components installed successfully in temp directory,
    // atomically swap with production directory.

    if (isEditMode && tempComponentsDir) {
        progressTracker('Applying Changes', 71, 'Swapping components...');
        context.logger.info('[Project Edit] Swapping temporary components with production');

        try {
            await swapComponentsDirectory(projectPath, context.logger);

            // Validate that components were installed before updating paths
            if (!project.componentInstances || Object.keys(project.componentInstances).length === 0) {
                context.logger.error('[Project Edit] No component instances found after swap');
                throw new Error('Component swap completed but no components found in project state');
            }

            // Update component instance paths from .tmp to production
            // (paths were set during clone to point to components.tmp)
            // Use proper path reconstruction to avoid substring matching issues
            const tempComponentsPath = path.join(projectPath, 'components.tmp');
            const productionComponentsPath = path.join(projectPath, 'components');

            for (const [compId, instance] of Object.entries(project.componentInstances)) {
                if (instance.path && instance.path.startsWith(tempComponentsPath)) {
                    const relativePath = path.relative(tempComponentsPath, instance.path);
                    const oldPath = instance.path;
                    instance.path = path.join(productionComponentsPath, relativePath);
                    context.logger.debug(`[Project Edit] Updated path for ${compId}: ${oldPath} → ${instance.path}`);
                }
            }

            // Save updated paths
            await context.stateManager.saveProject(project);
            context.logger.info('[Project Edit] Component swap completed successfully');
        } catch (error) {
            context.logger.error('[Project Edit] Failed to swap components', error as Error);
            throw new Error(
                `Failed to apply component changes: ${(error as Error).message}. ` +
                `The project's original components have been preserved.`,
            );
        }
    }

    // ========================================================================
    // EDS METADATA POPULATION (if EDS stack)
    // ========================================================================
    // After standard cloning, populate EDS-specific metadata from runtime config.
    // The component was cloned by cloneAllComponents, but needs additional metadata
    // that only exists at runtime (from preflight step).

    // Debug: List all component instances after cloning
    const instanceKeys = Object.keys(project.componentInstances || {});
    context.logger.debug(`[Project Creation] Component instances after clone: [${instanceKeys.join(', ')}]`);
    context.logger.debug(`[Project Creation] EDS metadata check: isEdsStack=${isEdsStack}, hasEdsConfig=${!!typedConfig.edsConfig}`);
    if (typedConfig.edsConfig) {
        context.logger.debug(`[Project Creation] EDS config values: repoUrl=${typedConfig.edsConfig.repoUrl}, githubOwner=${typedConfig.edsConfig.githubOwner}, repoName=${typedConfig.edsConfig.repoName}, daLiveOrg=${typedConfig.edsConfig.daLiveOrg}, daLiveSite=${typedConfig.edsConfig.daLiveSite}, preflightComplete=${typedConfig.edsConfig.preflightComplete}`);
    }
    if (isEdsStack && typedConfig.edsConfig) {
        const { COMPONENT_IDS } = await import('@/core/constants');
        context.logger.debug(`[Project Creation] Looking for EDS instance with key: ${COMPONENT_IDS.EDS_STOREFRONT}`);
        const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
        if (edsInstance) {
            // Derive githubRepo from repoUrl or explicit owner/name
            const repoInfo = typedConfig.edsConfig.repoUrl ? parseGitHubUrl(typedConfig.edsConfig.repoUrl) : null;
            const githubRepo = repoInfo
                ? `${repoInfo.owner}/${repoInfo.repo}`
                : (typedConfig.edsConfig.githubOwner && typedConfig.edsConfig.repoName
                    ? `${typedConfig.edsConfig.githubOwner}/${typedConfig.edsConfig.repoName}`
                    : undefined);

            // Fetch the template's current commit SHA for template sync feature
            // This enables future update detection by comparing against the template's latest commit
            let lastSyncedCommit: string | undefined;
            const templateOwner = typedConfig.edsConfig.templateOwner;
            const templateRepo = typedConfig.edsConfig.templateRepo;

            if (templateOwner && templateRepo) {
                try {
                    const { GitHubTokenService } = await import('@/features/eds/services/githubTokenService');
                    const { GitHubFileOperations } = await import('@/features/eds/services/githubFileOperations');
                    const githubTokenService = new GitHubTokenService(context.context.secrets, context.logger);
                    const githubFileOps = new GitHubFileOperations(githubTokenService, context.logger);
                    lastSyncedCommit = await githubFileOps.getLatestCommitSha(templateOwner, templateRepo, 'main') ?? undefined;
                    context.logger.debug(`[Project Creation] Fetched template commit SHA: ${lastSyncedCommit?.substring(0, 7)}`);
                } catch (error) {
                    // Non-fatal: Template sync is optional, don't fail project creation
                    context.logger.warn(`[Project Creation] Could not fetch template commit SHA: ${(error as Error).message}`);
                }
            }

            // Save project-specific EDS data to metadata
            // Now includes template info for future update detection
            edsInstance.metadata = {
                ...edsInstance.metadata,
                repoUrl: typedConfig.edsConfig.repoUrl,
                githubRepo, // Source data for URL derivation (typeGuards derive previewUrl/liveUrl from this)
                daLiveOrg: typedConfig.edsConfig.daLiveOrg,
                daLiveSite: typedConfig.edsConfig.daLiveSite,
                // Template sync fields - enables EDS template updates
                templateOwner,
                templateRepo,
                lastSyncedCommit,
            };
            await context.stateManager.saveProject(project);
            context.logger.debug(`[Project Creation] Populated EDS metadata for ${COMPONENT_IDS.EDS_STOREFRONT}: githubRepo=${edsInstance.metadata?.githubRepo}, daLiveOrg=${edsInstance.metadata?.daLiveOrg}, templateOwner=${templateOwner}, lastSyncedCommit=${lastSyncedCommit?.substring(0, 7)}`);
        } else {
            context.logger.warn(`[Project Creation] EDS instance NOT found for key "${COMPONENT_IDS.EDS_STOREFRONT}" - metadata NOT populated`);
        }
    }

    // ========================================================================
    // PHASE 3: MESH CONFIGURATION
    // ========================================================================

    const meshComponent = getMeshComponentInstance(project);
    const meshId = getMeshComponentId(project);
    const meshDefinition = meshId ? componentDefinitions.get(meshId)?.definition : undefined;

    const meshContext = {
        setupContext,
        meshDefinition,
        progressTracker,
        onMeshCreated: (workspace: string | undefined) => {
            context.sharedState.meshCreatedForWorkspace = workspace;
        },
    };

    // Debug logging for mesh deployment decision context (helps diagnose edit mode issues)
    context.logger.debug(`[Mesh Setup] Decision context:`);
    context.logger.debug(`  - isEditMode: ${isEditMode}`);
    context.logger.debug(`  - existingProject?.meshState?.endpoint: ${existingProject?.meshState?.endpoint}`);
    context.logger.debug(`  - typedConfig.apiMesh: ${JSON.stringify(typedConfig.apiMesh)}`);
    context.logger.debug(`  - meshComponent?.path: ${meshComponent?.path}`);
    context.logger.debug(`  - meshComponent?.endpoint: ${meshComponent?.endpoint}`);
    context.logger.debug(`  - meshId: ${meshId}`);
    context.logger.debug(`  - meshDefinition: ${meshDefinition ? 'found' : 'NOT FOUND'}`);
    context.logger.debug(`  - shouldConfigureExistingMesh result: ${shouldConfigureExistingMesh(typedConfig.apiMesh, meshComponent?.endpoint)}`);

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
    } else if (shouldConfigureExistingMesh(typedConfig.apiMesh, meshComponent?.endpoint)) {
        // Check for existing mesh (takes precedence - don't deploy if workspace already has mesh)
        await linkExistingMesh(meshContext, typedConfig.apiMesh!);
    } else if (isEditMode && existingProject?.meshState?.endpoint) {
        // EDIT MODE: Reuse existing mesh from current project if it exists
        context.logger.info('[Mesh Setup] Edit mode - reusing existing mesh from project');
        const existingMesh = {
            endpoint: existingProject.meshState.endpoint,
            meshId: (getMeshComponentInstance(existingProject)?.metadata?.meshId as string) || '',
            meshStatus: 'deployed' as const,
            workspace: typedConfig.adobe?.workspace,
        };
        await linkExistingMesh(meshContext, existingMesh);
    } else if (meshComponent?.path && meshDefinition) {
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
    }

    // ========================================================================
    // PHASE 4-5: FINALIZATION
    // ========================================================================
    //
    // Phase 4 now generates ALL config files (.env + site.json) using the
    // component registry pattern. EDS site.json is generated via configFiles
    // definition in components.json, eliminating custom hooks.

    const finalizationContext = {
        setupContext,
        projectPath,
        componentDefinitions,
        progressTracker,
        saveProject: () => context.stateManager.saveProject(project),
        sendMessage: (type: string, data: Record<string, unknown>) => context.sendMessage(type, data),
        panel: context.panel,
    };

    await generateEnvironmentFiles(finalizationContext);

    // Populate componentConfigs for mesh from the generated .env file
    // This enables Configure UI to save mesh env var changes
    const meshInstanceForConfig = getMeshComponentInstance(project);
    const meshIdForConfig = getMeshComponentId(project);
    if (meshInstanceForConfig?.path && meshIdForConfig) {
        const { readMeshEnvVarsFromFile } = await import('@/features/mesh/services/stalenessDetector');
        const meshEnvVars = await readMeshEnvVarsFromFile(meshInstanceForConfig.path);
        if (meshEnvVars && Object.keys(meshEnvVars).length > 0) {
            if (!project.componentConfigs) {
                project.componentConfigs = {};
            }
            project.componentConfigs[meshIdForConfig] = meshEnvVars;
            context.logger.debug(`[Project Creation] Populated componentConfigs[${meshIdForConfig}] with ${Object.keys(meshEnvVars).length} env vars`);
        }
    }

    // ========================================================================
    // PHASE 5: SYNC EDS CONFIG TO REMOTE
    // ========================================================================
    // Sync locally generated config.json to GitHub and publish to CDN.
    // This happens AFTER Phase 4 generates the file with mesh endpoint.
    //
    // Config.json generation timeline for EDS projects:
    // 1. StorefrontSetupStep (preflight): Generates fstab.yaml (no mesh endpoint needed)
    // 2. executor Phase 3: Deploys mesh → project.meshState.endpoint
    // 3. executor Phase 4: Generates config.json WITH mesh endpoint (via generateEdsConfigJson)
    // 4. executor Phase 5: Syncs config.json to GitHub/CDN (this phase)

    // Check if EDS preflight completed AND mesh endpoint available
    // preflightComplete ensures StorefrontSetupStep finished successfully
    const edsSetupCompleteForSync = !!typedConfig.edsConfig?.preflightComplete;

    if (isEdsStack && edsSetupCompleteForSync && project.meshState?.endpoint) {
        progressTracker('Syncing Config', 92, 'Pushing config.json to GitHub...');

        const repoUrl = typedConfig.edsConfig?.repoUrl;
        if (repoUrl) {
            const repoInfo = parseGitHubUrl(repoUrl);
            if (repoInfo) {
                // Validate config.json exists and is valid before syncing
                const configJsonPath = path.join(edsComponentPath, 'config.json');
                if (!fs.existsSync(configJsonPath)) {
                    throw new Error(
                        `Commerce configuration failed: config.json not found at ${configJsonPath}. ` +
                        `Config generation may have failed in Phase 4.`,
                    );
                }

                // Validate it's valid JSON
                try {
                    const configContent = fs.readFileSync(configJsonPath, 'utf-8');
                    JSON.parse(configContent);
                } catch (parseError) {
                    throw new Error(
                        `Commerce configuration failed: config.json is invalid JSON. ` +
                        `Error: ${(parseError as Error).message}`,
                    );
                }

                context.logger.info(`[Phase 5] Syncing config.json to ${repoInfo.owner}/${repoInfo.repo}`);

                const syncResult = await syncConfigToRemote({
                    componentPath: edsComponentPath,
                    repoOwner: repoInfo.owner,
                    repoName: repoInfo.repo,
                    logger: context.logger,
                    secrets: context.context.secrets,
                    authManager: context.authManager,
                    onProgress: (message) => progressTracker('Syncing Config', 94, message),
                    verifyBlockLibrary: true, // Verify block library CDN in parallel with config
                });

                if (!syncResult.success) {
                    // Make config sync failure fatal - user must know Commerce features won't work
                    throw new Error(
                        `Commerce configuration failed: Could not sync config.json to GitHub. ` +
                        `The storefront is live but Commerce features will not work. ` +
                        `Error: ${syncResult.error}`,
                    );
                }

                context.logger.info(
                    `[Phase 5] Config synced: GitHub=${syncResult.githubPushed}, CDN=${syncResult.cdnPublished}, ` +
                    `BlockLibrary=${syncResult.blockLibraryVerified ?? 'n/a'}`,
                );
            } else {
                context.logger.warn('[Phase 5] Could not parse repo URL, skipping config sync');
            }
        } else {
            context.logger.warn('[Phase 5] No repo URL available, skipping config sync');
        }
    } else {
        // Log why we're skipping the Phase 5 sync
        if (!isEdsStack) {
            context.logger.debug('[Phase 5] Skipped - not an EDS stack');
        } else if (!typedConfig.edsConfig) {
            context.logger.debug('[Phase 5] Skipped - edsConfig not set');
        } else if (!typedConfig.edsConfig.preflightComplete) {
            context.logger.debug('[Phase 5] Skipped - preflight not completed');
        } else if (!project.meshState?.endpoint) {
            context.logger.debug('[Phase 5] Skipped - meshState.endpoint not set');
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
    // Get components directly from stack configuration - this is the source of truth
    const stack = typedConfig.selectedStack ? getStackById(typedConfig.selectedStack) : undefined;

    if (!stack) {
        context.logger.error(`[Project Creation] Stack "${typedConfig.selectedStack}" not found in stacks.json`);
        throw new Error(`Stack "${typedConfig.selectedStack}" not found. Please check stacks.json configuration.`);
    }

    const frontend = stack.frontend;
    const dependencies = stack.dependencies || [];
    const appBuilder = typedConfig.selectedAddons?.filter(addon =>
        // App builder addons are those not in optionalAddons (which are submodules/integrations)
        !stack.optionalAddons?.some(opt => opt.id === addon)
    ) || [];

    context.logger.info(`[Project Creation] Stack "${stack.id}" components: frontend=${frontend}, dependencies=[${dependencies.join(', ')}]`);

    // Get frontend's submodule IDs to skip them in the dependency loop
    const frontendSubmoduleIds = new Set<string>();
    if (frontend) {
        const frontends = await registryManager.getFrontends();
        const frontendDef = frontends.find((f: { id: string }) => f.id === frontend);
        if (frontendDef?.submodules) {
            Object.keys(frontendDef.submodules).forEach(id => frontendSubmoduleIds.add(id));
        }
    }

    // Filter out submodule IDs from dependencies
    const filteredDependencies = dependencies.filter((id: string) => !frontendSubmoduleIds.has(id));

    // Build component list from stack configuration
    const allComponents = [
        ...(frontend ? [{ id: frontend, type: 'frontend' }] : []),
        ...filteredDependencies.map((id: string) => ({ id, type: 'dependency' })),
        ...appBuilder.map((id: string) => ({ id, type: 'app-builder' })),
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

        // For frontend components, determine source based on stack type:
        // - EDS stacks: use edsConfig.repoUrl (user's repo created from template during preflight)
        // - Other stacks: use frontendSource from config (template is source of truth)
        if (comp.type === 'frontend') {
            if (isEdsStack && typedConfig.edsConfig?.repoUrl) {
                // EDS frontend: source is the user's GitHub repo created during preflight
                componentDef = {
                    ...componentDef,
                    source: {
                        type: 'git' as const,
                        url: typedConfig.edsConfig.repoUrl,
                        branch: 'main',
                    },
                };
                context.logger.debug(`[Project Creation] Using EDS repo source for ${componentDef.name}: ${typedConfig.edsConfig.repoUrl}`);
            } else if (typedConfig.frontendSource) {
                // Non-EDS frontend: source from template config
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
        // Submodules come from stack dependencies and selected addons
        const installOptions: { selectedSubmodules?: string[]; skipDependencies?: boolean } = { skipDependencies: true };
        if (comp.type === 'frontend' && componentDef.submodules && stack) {
            const stackDependencies = stack.dependencies || [];
            const selectedAddons = typedConfig.selectedAddons || [];
            const allSelected = [...stackDependencies, ...selectedAddons];
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

/**
 * Atomically swap temporary components directory with production directory.
 * Uses rename which is atomic on POSIX filesystems (macOS/Linux).
 *
 * Sequence:
 * 1. Rename components → components.backup
 * 2. Rename components.tmp → components
 * 3. Delete components.backup
 *
 * On failure: Attempt to restore from backup
 */
async function swapComponentsDirectory(
    projectPath: string,
    logger: import('@/types/logger').Logger,
): Promise<void> {
    const componentsDir = path.join(projectPath, 'components');
    const tempDir = path.join(projectPath, 'components.tmp');
    const backupDir = path.join(projectPath, 'components.backup');

    logger.debug('[Project Edit] Starting atomic component swap');

    // Pre-flight: Clean up stale backup directory from previous failed attempts
    const staleBackupExists = await fsPromises.access(backupDir).then(() => true).catch(() => false);
    if (staleBackupExists) {
        logger.warn('[Project Edit] Found stale backup directory from previous attempt, removing');
        await fsPromises.rm(backupDir, { recursive: true, force: true });
    }

    try {
        // Step 1: Backup existing components (if they exist)
        const componentsExist = await fsPromises.access(componentsDir).then(() => true).catch(() => false);
        if (componentsExist) {
            logger.debug('[Project Edit] Backing up existing components');
            await fsPromises.rename(componentsDir, backupDir);
        }

        // Step 2: Promote temp to production (atomic rename)
        logger.debug('[Project Edit] Promoting temporary components to production');
        await fsPromises.rename(tempDir, componentsDir);

        // Step 3: Remove backup on success
        if (componentsExist) {
            logger.debug('[Project Edit] Removing backup components');
            await fsPromises.rm(backupDir, { recursive: true, force: true });
        }

        logger.debug('[Project Edit] Component swap completed successfully');
    } catch (error) {
        // Rollback: If rename failed and backup exists, restore it
        logger.error('[Project Edit] Component swap failed, attempting rollback', error as Error);

        const backupExists = await fsPromises.access(backupDir).then(() => true).catch(() => false);
        const componentsExists = await fsPromises.access(componentsDir).then(() => true).catch(() => false);

        // If backup exists and components doesn't, restore backup
        if (backupExists && !componentsExists) {
            try {
                await fsPromises.rename(backupDir, componentsDir);
                logger.info('[Project Edit] Restored components from backup');
            } catch (restoreError) {
                logger.error('[Project Edit] Failed to restore backup', restoreError as Error);
                throw new Error(
                    `Component swap failed and rollback failed. ` +
                    `Original components may be at: ${backupDir}. ` +
                    `Error: ${(error as Error).message}`,
                );
            }
        }

        // Clean up temp dir if it still exists
        const tempExists = await fsPromises.access(tempDir).then(() => true).catch(() => false);
        if (tempExists) {
            try {
                await fsPromises.rm(tempDir, { recursive: true, force: true });
                logger.debug('[Project Edit] Cleaned up temporary directory');
            } catch (cleanupError) {
                logger.warn('[Project Edit] Failed to clean up temporary directory', cleanupError as Error);
                // Non-fatal - continue with the original error
            }
        }

        throw error;
    }
}
