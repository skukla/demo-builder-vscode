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
import stacksConfig from '../config/stacks.json';
import {
    cloneAllComponents,
    installAllComponents,
    deployNewMesh,
    linkExistingMesh,
    shouldConfigureExistingMesh,
    generateEnvironmentFiles,
    finalizeProject,
    sendCompletionAndCleanup,
    generateAIContextFiles,
    ensureEdsContent,
    type ComponentDefinitionEntry,
    type MeshApiConfig,
} from '../services';
import {
    getAppBuilderComponentEntry,
    buildCustomIntegrationEntry,
} from '../services/appBuilderComponentCatalogLoader';
import { ProgressTracker } from './shared';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { COMPONENT_IDS } from '@/core/constants';
import {
    buildOrgTargetFromProjectAdobe,
    withOrgContext,
    type OrgContextTarget,
} from '@/core/shell';
import { parseGitHubUrl } from '@/core/utils';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { migrateDeclaredSecrets } from '@/features/components/services/commerceSecretMigration';
import { detectB2bReadiness } from '@/features/eds/services/b2bReadinessDetection';
import { extractConfigParamsFromConfigs } from '@/features/eds/services/configGenerator';
import { syncConfigToRemote } from '@/features/eds/services/configSyncService';
import { executeCatalogPrewarmPhase } from '@/features/project-creation/services/catalogPrewarmPhase';
import { TransformedComponentDefinition } from '@/types';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import { AdobeConfig } from '@/types/base';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import type { CommerceStoreStructure } from '@/types/commerceStore';
import type { Logger } from '@/types/logger';
import type { Stack } from '@/types/stacks';
import {
    getProjectFrontendPort,
    getComponentConfigPort,
    isEdsStackId,
    getMeshComponentInstance,
    getMeshComponentId,
    getMeshEndpointUrl,
} from '@/types/typeGuards';
import type { MeshPhaseState } from '@/types/webview';

// EDS config.json sync to remote (Phase 5)

// Stacks configuration - source of truth for frontend/backend/dependencies

/**
 * Look up a stack by ID from the stacks configuration
 * This is the source of truth for frontend/backend/dependencies - no derivation needed
 */
function getStackById(stackId: string): Stack | undefined {
    return (stacksConfig.stacks as Stack[]).find((s) => s.id === stackId);
}

// ============================================================================
// Helper Functions
// ============================================================================

/** Keys of a project's component instances (empty when none set). */
function getComponentInstanceKeys(project: import('@/types').Project): string[] {
    return Object.keys(project.componentInstances || {});
}

/**
 * A project's deployed mesh endpoint, if any — keyed-first via the shared
 * accessor (legacy meshState fallback inside, ADR-011 D3 Steps 07+09).
 */
function getMeshEndpoint(project?: import('@/types').Project): string | undefined {
    return getMeshEndpointUrl(project);
}

/**
 * Pre-flight authentication check before mesh CLI operations.
 *
 * Adobe CLI commands (`aio api-mesh:*`) each independently open a browser
 * window when the token is expired. This check ensures the token is valid
 * before any CLI calls run, preventing multiple browser popups. Follows the
 * pattern from DeployMeshCommand (deployMesh.ts:51-92).
 *
 * @param authManager - Authentication service (may be undefined)
 * @param logger - Logger for diagnostics
 * @param adobeConfig - Adobe org/project/workspace for context restoration after login
 * @returns true if authenticated (or no authManager), false if re-auth failed
 */
export async function ensureMeshPreflightAuth(
    authManager: HandlerContext['authManager'],
    logger: Logger,
    adobeConfig: { organization?: string; projectId?: string; workspace?: string },
): Promise<boolean> {
    if (!authManager) {
        return true; // Graceful degradation
    }

    const isAuthenticated = await authManager.isAuthenticated();
    if (isAuthenticated) {
        return true;
    }

    // Token expired — attempt re-login with context restoration
    logger.warn(
        '[Mesh Setup] Adobe auth token expired before mesh deployment — attempting re-login',
    );
    const loginSuccess = await authManager.loginAndRestoreProjectContext({
        organization: adobeConfig.organization,
        projectId: adobeConfig.projectId,
        workspace: adobeConfig.workspace,
    });

    if (!loginSuccess) {
        logger.warn('[Mesh Setup] Re-login failed — mesh deployment will likely fail');
        return false;
    }

    // Verify token is actually valid after login
    const postLoginAuth = await authManager.isAuthenticated();
    if (!postLoginAuth) {
        logger.warn('[Mesh Setup] Re-login completed but token still invalid');
        return false;
    }

    logger.info('[Mesh Setup] Re-login successful — continuing with mesh deployment');
    return true;
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
    };
}

/**
 * ProjectCreationConfig - Configuration passed to project creation
 */
interface ProjectCreationConfig {
    /** The SLUG — folder name and dedupe key. */
    projectName: string;
    /** What the user typed. Absent for a project with no title set. */
    projectTitle?: string;
    adobe?: AdobeConfig;
    components?: {
        frontend?: string;
        backend?: string;
        dependencies?: string[];
        integrations?: string[];
        appBuilder?: string[];
    };
    componentConfigs?: Record<string, Record<string, unknown>>;
    /** The discovered Commerce store hierarchy (names for the chosen codes). */
    commerceStoreStructure?: CommerceStoreStructure;
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
    datapack?: { name: string; version: string };
    selectedStack?: string;
    // Selected App Builder integration ids (Model B deploy) + custom GitHub sources
    selectedAppBuilderComponents?: string[];
    appBuilderComponentSources?: Record<
        string,
        { owner: string; repo: string; branch?: string; name?: string }
    >;
    // Free Console API picks (union across integrations) — persisted on the Project
    // so Phase 3b's subscribe union covers them. LEGACY: derived from the keyed
    // record below, which is the durable, attributed form.
    additionalConsoleApis?: string[];
    // The same picks keyed by integration id — what resolveDesiredApis unions.
    componentApiPicks?: Record<string, string[]>;
    // Selected optional addons (e.g., ['adobe-commerce-aco'])
    selectedAddons?: string[];
    // Selected block library IDs (e.g., ['isle5', 'demo-team-blocks'])
    selectedBlockLibraries?: string[];
    // Custom block libraries added by URL
    customBlockLibraries?: CustomBlockLibrary[];
    // Frontend source from template (templates are source of truth for repos)
    frontendSource?: FrontendSource;
    // Edit mode: re-use existing project directory (editProjectPath presence signals edit mode)
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
        // Second content source for the account chrome (hybrid packages).
        accountContentSource?: {
            org: string;
            site: string;
        };
        // Preflight completion fields (set by StorefrontSetupStep)
        preflightComplete?: boolean;
        repoUrl?: string;
        // Note: previewUrl/liveUrl not stored - derived from githubRepo by typeGuards
        // Patch IDs to apply during reset (from demo-packages.json)
        patches?: string[];
        // Content patch IDs to apply during DA.live content copy
        contentPatches?: string[];
        // External source for content patches (from demo-packages.json)
        contentPatchSource?: {
            owner: string;
            repo: string;
            path: string;
        };
        // Code patch IDs to apply (canonical + block) — Step 5 populates these.
        codePatches?: string[];
        // External source for code patches (e.g., skukla/eds-demo-patches/citisignal).
        // When set, the storefront is "thin-layer": `lastSyncedCommit` records the
        // verified canonical LKG SHA (per ADR-006 D2) rather than the template
        // repo's `main` HEAD, so "is there an update?" means "did the LKG pointer
        // advance?" not "is canonical main ahead of where we created?".
        codePatchSource?: {
            owner: string;
            repo: string;
            path: string;
            /** Per-ledger LKG file when the ledger tracks a non-default canonical
             *  (e.g., b2b's B2B template). Omitted for ledgers sharing the
             *  default root `last-known-good`. */
            lkgFile?: string;
        };
    };
}

/**
 * Actual project creation logic (extracted for testability)
 */
/** A defined array only when it has at least one item (else undefined, so the manifest omits it). */
function nonEmptyArray<T>(items: T[] | undefined): T[] | undefined {
    return items && items.length > 0 ? items : undefined;
}

/**
 * Selected App Builder integration ids for `componentSelections.appBuilder`.
 *
 * Excludes mesh-kind ids (they dual-flow through `components.dependencies` and
 * are installed by the mesh phase) plus anything literally riding dependencies,
 * so reset/edit flows never see the same component under two categories.
 *
 * Exclusion keys on the catalog KIND rather than on membership in dependencies.
 * That mattered when the two id namespaces differed and it still does: mesh
 * catalog entries are derived from the registry now, so the ids always match and
 * the dependencies check would silently cover for a broken kind check.
 *
 * Falls back to the legacy `components.appBuilder` list when no Model B
 * selection is present.
 */
function selectedAppBuilderIds(typedConfig: ProjectCreationConfig): string[] {
    const dependencies = typedConfig.components?.dependencies ?? [];
    const ids = typedConfig.selectedAppBuilderComponents?.length
        ? typedConfig.selectedAppBuilderComponents
        : (typedConfig.components?.appBuilder ?? []);
    return ids.filter(
        (id) => !dependencies.includes(id) && getAppBuilderComponentEntry(id)?.kind !== 'mesh',
    );
}

/**
 * Assemble the initial Project persisted through creation. Runs BEFORE Phase 3b
 * (`executeAppBuilderIntegrationsPhase`), so everything Phase 3b reads off the
 * Project — notably `additionalConsoleApis` for the subscribe union — must be
 * written here. `componentSelections.appBuilder` persists the selected ids;
 * custom/instance SOURCES are NOT persisted (§E) — edit mode derives them from
 * the keyed `appBuilderComponents` map via `extractSettingsFromProject`.
 */
export function buildInitialProject(
    typedConfig: ProjectCreationConfig,
    projectPath: string,
    existingProject?: import('@/types').Project,
): import('@/types').Project {
    return {
        name: typedConfig.projectName,
        // Only when the user actually set one. Seeding it from the slug would
        // render identically and then persist the slug as a genuine title, so a
        // later rename would move the folder and leave the old name on screen.
        ...(typedConfig.projectTitle ? { title: typedConfig.projectTitle } : {}),
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
            appBuilder: selectedAppBuilderIds(typedConfig),
        },
        componentConfigs: (typedConfig.componentConfigs || {}) as Record<
            string,
            Record<string, string | number | boolean | undefined>
        >,
        // The discovered store hierarchy — a CATALOG that names the scope codes
        // on every later surface, kept out of componentConfigs so no `.env`
        // generator can walk it.
        //
        // Falls back to the EXISTING structure, like `created` above: this
        // rebuilds the whole Project, and an edit session that never reached the
        // Commerce step carries no structure. Overwriting a good one with
        // undefined would silently drop every store name the project had.
        commerceStoreStructure:
            typedConfig.commerceStoreStructure ?? existingProject?.commerceStoreStructure,
        selectedPackage: typedConfig.selectedPackage,
        // Same fallback reasoning as `commerceStoreStructure` above: this rebuilds
        // the whole Project, and an edit session that never opened the Sample
        // Data area carries no choice. Overwriting a recorded one with undefined
        // would silently forget what the project was meant to be seeded with.
        datapack: typedConfig.datapack ?? existingProject?.datapack,
        selectedStack: typedConfig.selectedStack,
        selectedAddons: typedConfig.selectedAddons,
        selectedBlockLibraries: typedConfig.selectedBlockLibraries,
        customBlockLibraries: typedConfig.customBlockLibraries,
        additionalConsoleApis: nonEmptyArray(typedConfig.additionalConsoleApis),
        componentApiPicks: typedConfig.componentApiPicks,
        // Note: componentVersions, meshState, etc. are NOT preserved during edit
        // - componentVersions: Regenerated from fresh component installation
        // - meshState: Must be clean slate - old sourceHash won't match fresh files
        // - frontendEnvState: Only valid if demo is running (cleared during edit)
    };
}

export async function executeProjectCreation(
    context: HandlerContext,
    config: Record<string, unknown>,
): Promise<void> {
    const typedConfig = config as unknown as ProjectCreationConfig;

    // Debug: trace incoming config values for selectedPackage/selectedStack
    context.logger.debug(
        `[Project Creation] Received config: selectedPackage=${typedConfig.selectedPackage}, selectedStack=${typedConfig.selectedStack}`,
    );

    // Track current mesh phase for progress messages
    let currentMeshPhase: MeshPhaseState | undefined;

    // Create progress tracker (includes mesh phase state when present)
    const progressTracker: ProgressTracker = (
        currentOperation: string,
        progress: number,
        message?: string,
    ) => {
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

    // Determine project path based on edit mode (editProjectPath presence signals edit)
    const isEditMode = Boolean(typedConfig.editProjectPath);
    const projectPath =
        isEditMode && typedConfig.editProjectPath
            ? typedConfig.editProjectPath
            : path.join(os.homedir(), '.demo-builder', 'projects', typedConfig.projectName);

    // Load existing project state if in edit mode (to preserve creation date);
    // otherwise clean up any orphaned/invalid directory (new project only).
    let existingProject: import('@/types').Project | undefined;
    if (isEditMode) {
        existingProject = await loadExistingProjectForEdit(projectPath, context);
    } else {
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

    const project: import('@/types').Project = buildInitialProject(
        typedConfig,
        projectPath,
        existingProject,
    );

    // Route declared secrets (`secret: true` in components.json) to SecretStorage
    // BEFORE the project is ever persisted, so a NEW project's credential is never
    // written to the manifest in the clear — not even once, to be cleaned up on a
    // later save. This is the first moment a project path exists, which is the
    // first moment the key scheme can address it.
    //
    // Write-through with a verified read-back: a value only leaves the config once
    // SecretStorage is proven to hold it. A failure leaves it exactly where it was
    // and creation proceeds — the credential still works, it is merely still in the
    // manifest, which is where it lived before this existed.
    const secretMigration = await migrateDeclaredSecrets(
        project.componentConfigs,
        project.path,
        context.context?.secrets,
        (line) => context.logger.info(`[Project Creation] ${line}`),
    );
    project.componentConfigs = secretMigration.sanitizedConfigs as typeof project.componentConfigs;
    if (secretMigration.retained.length > 0) {
        context.logger.warn(
            `[Project Creation] ${secretMigration.retained.length} secret(s) remain in project ` +
                `config: ${secretMigration.retained.join(', ')}`,
        );
    }

    context.logger.debug(
        '[Project Creation] Deferring project state save until after installation',
    );

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

    const { ComponentRegistryManager } = await import(
        '@/features/components/services/ComponentRegistryManager'
    );
    const registryManager = new ComponentRegistryManager(context.context.extensionPath);
    const registry = await registryManager.loadRegistry();

    // Create unified setup context (eliminates parameter threading)
    // Composes HandlerContext to avoid duplicating logger and other common dependencies
    const { ProjectSetupContext } = await import(
        '@/features/project-creation/services/ProjectSetupContext'
    );
    const setupContext = new ProjectSetupContext(context, registry, project, config);

    const componentDefinitions = await loadComponentDefinitions(
        typedConfig,
        registryManager,
        context,
        isEdsStack,
    );

    // ========================================================================
    // RUNTIME READINESS (first Adobe step — provision a Runtime namespace on the
    // deploy workspace if it lacks one, BEFORE any deploy, so a selected/imported
    // Runtime-less workspace is healed rather than orphaning a mesh at app-deploy)
    // ========================================================================

    await ensureWorkspaceRuntimeReady(context, typedConfig);

    // ========================================================================
    // EDIT MODE: PREPARE ATOMIC COMPONENT SWAP
    // ========================================================================
    // In edit mode, install components to a temp directory first.
    // Only swap to production after ALL components install successfully.
    // This preserves the original components if installation fails.

    const tempComponentsDir = isEditMode
        ? await prepareEditModeTempDir(projectPath, context)
        : undefined;

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
        const oldComponents = getComponentInstanceKeys(project);
        context.logger.debug(
            `[Project Edit] Clearing old component instances: [${oldComponents.join(', ')}]`,
        );
        project.componentInstances = {};
    }

    await cloneAllComponents(installationContext);
    await installAllComponents(installationContext);

    // ========================================================================
    // EDIT MODE: ATOMIC COMPONENT SWAP
    // ========================================================================

    if (isEditMode && tempComponentsDir) {
        await performAtomicComponentSwap(context, project, projectPath, progressTracker);
    }

    // ========================================================================
    // EDS METADATA POPULATION (if EDS stack)
    // ========================================================================

    await populateEdsMetadata(context, project, typedConfig, isEdsStack);

    // ========================================================================
    // PHASE 3: MESH CONFIGURATION
    // ========================================================================

    await executeMeshPhase(
        context,
        setupContext,
        project,
        typedConfig,
        componentDefinitions,
        progressTracker,
        isEditMode,
        existingProject,
    );

    // ========================================================================
    // PHASE 3b: APP BUILDER INTEGRATIONS
    // ========================================================================

    await executeAppBuilderIntegrationsPhase(context, project, typedConfig, progressTracker);

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
        sendMessage: (type: string, data: Record<string, unknown>) =>
            context.sendMessage(type, data),
        panel: context.panel,
    };

    await generateEnvironmentFiles(finalizationContext);

    // Populate componentConfigs for mesh from the generated .env file
    await populateMeshComponentConfigs(context, project);

    // ========================================================================
    // PHASE 5: SYNC EDS CONFIG TO REMOTE + PHASE 5b: EDS CONTENT SETUP
    // ========================================================================

    await syncEdsConfigToRemote(
        context,
        project,
        typedConfig,
        isEdsStack,
        edsComponentPath,
        progressTracker,
    );

    await setupEdsContent(context, typedConfig, isEdsStack, progressTracker);

    // ========================================================================
    // PHASE 5c: SAMPLE DATA
    // ========================================================================
    //
    // After the config files exist, because the credentials this needs are read
    // from them. Never throws — see `executeSampleDataPhase`.

    await executeSampleDataPhase(context, project, progressTracker);

    // ========================================================================
    // PHASE 5d: CATALOG PRE-WARMING
    // ========================================================================
    //
    // AFTER sample data, because pre-warming a catalog that has not been seeded
    // publishes nothing useful. The EDS pipeline pre-warms at its own step 8,
    // which is correct for RESET (that flow imports data BEFORE the pipeline)
    // and impossible for creation, where the pipeline runs during storefront
    // setup and the datapack lands here. Never throws.
    await executeCatalogPrewarmPhase(context, project, progressTracker);

    await finalizeProject(finalizationContext);
    await sendCompletionAndCleanup(finalizationContext);

    // Phase 6: Generate AI context files (non-blocking — failure does not abort project creation)
    try {
        await generateAIContextFiles(projectPath, project, context.context.extensionPath);
        // Persist the freshness stamp generateAIContextFiles set on `project`
        // (aiContextVersion), else the activation sweep re-refreshes the bundle on every start and the freshness log reports perpetual staleness.
        await context.stateManager.saveProjectConfigOnly(project);
    } catch (err) {
        // Landed hashes must survive a partial failure (Phase-4 review) — on a
        // fresh creation there are no OLD hashes to desync, but a retried
        // creation over an existing directory has them.
        try {
            await context.stateManager.saveProjectConfigOnly(project);
        } catch {
            /* best-effort */
        }
        context.logger.warn(
            '[Project Creation] Failed to generate AI context files',
            err instanceof Error ? err : undefined,
        );
    }

    // The per-project .mcp.json written in Phase 6 lets AI agents discover this
    // project's tools when launched from its directory, and it only loads those
    // tools where they're relevant. No global (~/.claude.json) registration is
    // performed — the in-extension MCP server hosts the tools per-project.

    // No workspace anchoring: in the always-root home model the VS Code window
    // stays homed at the projects root. `finalizeProject` → `saveProject`
    // already set this new project as the current-project pointer, which the
    // dashboards render in-place and the home Chat resolves via the
    // `get_current_project` MCP tool. Anchoring the window to the project subdir
    // would reload the window (killing any live MCP session) and break the
    // single-home-Chat model, so it is intentionally omitted.
}

/**
 * The selected App Builder components that resolve to a DEPLOYABLE integration app
 * (`kind: 'integration'`) — catalog entries or custom-URL entries. Mesh-kind
 * selections are excluded (they dual-flow through the mesh phase). This is the set
 * that will `aio app deploy`, so it also gates the Runtime pre-flight.
 */
function deployableAppIntegrationEntries(
    typedConfig: ProjectCreationConfig,
): AppBuilderComponentCatalogEntry[] {
    const sources = typedConfig.appBuilderComponentSources ?? {};
    return (typedConfig.selectedAppBuilderComponents ?? [])
        .map(
            (id) =>
                getAppBuilderComponentEntry(id) ??
                // The sources-map key IS the instance id (shell instancing: N
                // named instances may share one template repo).
                (sources[id] ? buildCustomIntegrationEntry(sources[id], id) : undefined),
        )
        .filter((entry): entry is AppBuilderComponentCatalogEntry => entry?.kind === 'integration');
}

/**
 * Ensure the deploy workspace has an Adobe I/O Runtime namespace, PROVISIONING one
 * when it lacks it — the first Adobe step, before any deploy.
 *
 * `aio app deploy` (an App Builder app) needs a Runtime namespace; a mesh does not.
 * A workspace WE create ships one (createProject/createWorkspace), but a pre-existing
 * or imported workspace the user SELECTS may not — so provision it here rather than
 * failing the deploy. Running before the mesh phase keeps the no-orphan guarantee:
 * if provisioning genuinely can't complete, the flow stops before any mesh exists.
 * No-op for mesh-only projects (no deployable app) or when the org/project/workspace
 * ids are absent. Best-effort provisioning + verification (see `ensureWorkspaceRuntime`).
 */
async function ensureWorkspaceRuntimeReady(
    context: HandlerContext,
    typedConfig: ProjectCreationConfig,
): Promise<void> {
    if (deployableAppIntegrationEntries(typedConfig).length === 0) {
        return;
    }
    const adobe = typedConfig.adobe;
    if (!adobe?.organization || !adobe?.projectId || !adobe?.workspace) {
        return;
    }
    const { ServiceLocator } = await import('@/core/di');
    const { ensureWorkspaceRuntime } = await import(
        '@/features/app-builder/services/runtimeCredentials'
    );
    const commandManager = ServiceLocator.getCommandExecutor();
    const authService = ServiceLocator.getAuthenticationService();
    const target = buildDeployOrgTarget(context, typedConfig);
    context.logger.debug('[Runtime] Ensuring the workspace has an Adobe I/O Runtime namespace');
    // The namespace check runs via CLI (needs withOrgContext targeting); the SDK
    // `createRuntimeNamespace` provision takes explicit ids (targeting-agnostic).
    await withOrgContext(target, () =>
        ensureWorkspaceRuntime(commandManager, context.logger, 'auto', () =>
            authService.ensureWorkspaceRuntimeNamespace(
                adobe.organization as string,
                adobe.projectId as string,
                adobe.workspace as string,
            ),
        ),
    );
}

/**
 * PHASE 3b — deploy each selected App Builder "integration" via the SHARED Model B
 * runner ({@link addAppBuilderComponent}). Mesh-kind selections dual-flow through
 * {@link executeMeshPhase} and are excluded here.
 *
 * Resolves each id to a catalog entry, else to a custom-URL entry from
 * `appBuilderComponentSources`. When nothing resolves to `kind: 'integration'` the
 * phase is a no-op (no permission check). Otherwise it gates on the Developer /
 * System Admin role once, builds the runner deps once, then deploys sequentially;
 * a failed gate or deploy throws (fails the creation flow).
 */
export async function executeAppBuilderIntegrationsPhase(
    context: HandlerContext,
    project: import('@/types').Project,
    typedConfig: ProjectCreationConfig,
    progressTracker: ProgressTracker,
): Promise<void> {
    const entries = deployableAppIntegrationEntries(typedConfig);

    if (entries.length === 0) {
        return;
    }

    const { ServiceLocator } = await import('@/core/di');
    const permission = await ServiceLocator.getAuthenticationService().testDeveloperPermissions();
    if (!permission.hasPermissions) {
        throw new Error(
            permission.error ||
                'Your account lacks the Developer or System Admin role required to deploy ' +
                    'App Builder integrations. Select a different organization or contact your administrator.',
        );
    }

    const { buildDefaultRunnerDeps, buildRunnerDepsContext } = await import(
        '@/features/app-builder/services/appBuilderComponentRunnerDeps'
    );
    const { addAppBuilderComponent } = await import(
        '@/features/app-builder/services/appBuilderComponentRunner'
    );
    const deps = buildDefaultRunnerDeps(await buildRunnerDepsContext(context, project));

    // The runner's first step per integration is the union API subscribe — surface
    // it once up front so the user sees API access being provisioned at build time
    // (the Add-Integration modal no longer subscribes anything itself).
    progressTracker('Deploying Integrations', 69, 'Enabling API access…');
    for (const entry of entries) {
        progressTracker('Deploying Integrations', 70, `Deploying ${entry.name}…`);
        const result = await addAppBuilderComponent(project, entry, deps);
        if (!result.success) {
            throw new Error(result.error || 'App Builder integration deployment failed');
        }
    }
}

// ============================================================================
// Private Helper Functions
// ============================================================================

/**
 * Load existing project state for edit mode, used to preserve the original
 * creation date. Failures are non-fatal (logged, returns undefined).
 */
async function loadExistingProjectForEdit(
    projectPath: string,
    context: HandlerContext,
): Promise<import('@/types').Project | undefined> {
    context.logger.info(`[Project Edit] Editing existing project at: ${projectPath}`);
    try {
        const existingProject =
            (await context.stateManager.loadProjectFromPath(projectPath)) ?? undefined;
        if (existingProject) {
            context.logger.debug(
                '[Project Edit] Loaded existing project state for creation date preservation',
            );
        }
        return existingProject;
    } catch (error) {
        context.logger.warn(
            `[Project Edit] Could not load existing project state: ${(error as Error).message}`,
        );
        return undefined;
    }
}

/**
 * Prepare the temporary components directory used for the edit-mode atomic swap.
 *
 * Components are installed here first; only after all install successfully are
 * they swapped into production, preserving the originals on failure. Any stale
 * temp directory from a previous failed attempt is removed first.
 *
 * @returns The temp components directory path.
 */
async function prepareEditModeTempDir(
    projectPath: string,
    context: HandlerContext,
): Promise<string> {
    const tempComponentsDir = path.join(projectPath, 'components.tmp');

    // Clean up any stale temp directory from previous failed attempts
    const tempDirExists = await fsPromises
        .access(tempComponentsDir)
        .then(() => true)
        .catch(() => false);
    if (tempDirExists) {
        context.logger.info('[Project Edit] Cleaning up stale temporary components directory');
        await fsPromises.rm(tempComponentsDir, { recursive: true, force: true });
    }

    context.logger.info(
        '[Project Edit] Will install components to temporary directory for atomic swap',
    );
    return tempComponentsDir;
}

/**
 * Populate EDS-specific metadata on the component instance after cloning.
 */
async function populateEdsMetadata(
    context: HandlerContext,
    project: import('@/types').Project,
    typedConfig: ProjectCreationConfig,
    isEdsStack: boolean,
): Promise<void> {
    const instanceKeys = getComponentInstanceKeys(project);
    context.logger.debug(
        `[Project Creation] Component instances after clone: [${instanceKeys.join(', ')}]`,
    );
    context.logger.debug(
        `[Project Creation] EDS metadata check: isEdsStack=${isEdsStack}, hasEdsConfig=${!!typedConfig.edsConfig}`,
    );

    if (!isEdsStack || !typedConfig.edsConfig) return;

    context.logger.debug(
        `[Project Creation] EDS config values: repoUrl=${typedConfig.edsConfig.repoUrl}, githubOwner=${typedConfig.edsConfig.githubOwner}, repoName=${typedConfig.edsConfig.repoName}`,
    );

    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    if (!edsInstance) {
        context.logger.warn(
            `[Project Creation] EDS instance NOT found for key "${COMPONENT_IDS.EDS_STOREFRONT}" - metadata NOT populated`,
        );
        return;
    }

    // Derive githubRepo from repoUrl or explicit owner/name
    const repoInfo = typedConfig.edsConfig.repoUrl
        ? parseGitHubUrl(typedConfig.edsConfig.repoUrl)
        : null;
    const githubRepo = repoInfo
        ? `${repoInfo.owner}/${repoInfo.repo}`
        : typedConfig.edsConfig.githubOwner && typedConfig.edsConfig.repoName
          ? `${typedConfig.edsConfig.githubOwner}/${typedConfig.edsConfig.repoName}`
          : undefined;

    // Fetch template commit SHA for future update detection. For thin-layer
    // packages this reads the patches-repo LKG; for legacy/forked packages
    // it falls through to template HEAD. The lkgSource — when set — is
    // persisted alongside so the update checker can compare against the
    // same LKG file the create flow consulted.
    const lastSyncedCommit = await fetchTemplateCommitSha(context, typedConfig.edsConfig);

    const templateOwner = typedConfig.edsConfig.templateOwner;
    const templateRepo = typedConfig.edsConfig.templateRepo;
    const lkgSource = typedConfig.edsConfig.codePatchSource
        ? {
              owner: typedConfig.edsConfig.codePatchSource.owner,
              repo: typedConfig.edsConfig.codePatchSource.repo,
              // Carry lkgFile when present (b2b case) so update checks against
              // multi-canonical patches repos read the right per-ledger file.
              ...(typedConfig.edsConfig.codePatchSource.lkgFile
                  ? { lkgFile: typedConfig.edsConfig.codePatchSource.lkgFile }
                  : {}),
          }
        : undefined;

    edsInstance.metadata = {
        ...edsInstance.metadata,
        repoUrl: typedConfig.edsConfig.repoUrl,
        githubRepo,
        daLiveOrg: typedConfig.edsConfig.daLiveOrg,
        daLiveSite: typedConfig.edsConfig.daLiveSite,
        templateOwner,
        templateRepo,
        lastSyncedCommit,
        ...(lkgSource ? { lkgSource } : {}),
    };
    await context.stateManager.saveProject(project);
    context.logger.debug(
        `[Project Creation] Populated EDS metadata for ${COMPONENT_IDS.EDS_STOREFRONT}: githubRepo=${edsInstance.metadata?.githubRepo}`,
    );
}

/**
 * Fetch the canonical commit SHA to record as `lastSyncedCommit`.
 *
 * Thin-layer storefronts (package has `codePatchSource` configured per
 * ADR-006): read the verified canonical SHA from the patches repo's
 * `last-known-good` file (D2 — Chromium LKGR / Nix git-revision convention).
 * If unreachable, fall back to template HEAD with a warn line (D1
 * proceed-and-warn).
 *
 * Forked storefronts (no `codePatchSource`): unchanged — fetch the template
 * repo's `main` HEAD as `lastSyncedCommit`. Mixed fleets coexist during
 * migration.
 */
async function fetchTemplateCommitSha(
    context: HandlerContext,
    edsConfig: NonNullable<ProjectCreationConfig['edsConfig']>,
): Promise<string | undefined> {
    const { templateOwner, templateRepo, codePatchSource } = edsConfig;
    if (!templateOwner || !templateRepo) return undefined;

    // Thin-layer path: read LKG from patches repo. Fall back to template
    // HEAD on LKG fetch failure (warn already logged inside readLkgSha).
    if (codePatchSource) {
        const { readLkgSha } = await import('@/features/eds/services/lkgReader');
        const lkg = await readLkgSha(
            {
                owner: codePatchSource.owner,
                repo: codePatchSource.repo,
                lkgFile: codePatchSource.lkgFile,
            },
            context.logger,
        );
        if (lkg) {
            context.logger.debug(
                `[Project Creation] Recorded LKG SHA: ${lkg.substring(0, 7)} (from ${codePatchSource.owner}/${codePatchSource.repo})`,
            );
            return lkg;
        }
        context.logger.warn(
            `[Project Creation] LKG unreachable for ${codePatchSource.owner}/${codePatchSource.repo} — falling back to template HEAD`,
        );
    }

    try {
        const { GitHubTokenService } = await import('@/features/eds/services/githubTokenService');
        const { GitHubFileOperations } = await import(
            '@/features/eds/services/githubFileOperations'
        );
        const githubTokenService = new GitHubTokenService(context.context.secrets, context.logger);
        const githubFileOps = new GitHubFileOperations(githubTokenService, context.logger);
        const sha =
            (await githubFileOps.getLatestCommitSha(templateOwner, templateRepo, 'main')) ??
            undefined;
        context.logger.debug(
            `[Project Creation] Fetched template commit SHA: ${sha?.substring(0, 7)}`,
        );
        return sha;
    } catch (error) {
        context.logger.warn(
            `[Project Creation] Could not fetch template commit SHA: ${(error as Error).message}`,
        );
        return undefined;
    }
}

/**
 * Execute Phase 3: Mesh configuration (deploy new, link existing, or skip).
 */
async function executeMeshPhase(
    context: HandlerContext,
    setupContext: import('@/features/project-creation/services/ProjectSetupContext').ProjectSetupContext,
    project: import('@/types').Project,
    typedConfig: ProjectCreationConfig,
    componentDefinitions: Map<string, ComponentDefinitionEntry>,
    progressTracker: ProgressTracker,
    isEditMode: string | boolean | undefined,
    existingProject: import('@/types').Project | undefined,
): Promise<void> {
    // App Builder permission gate. Mesh deployment is an App Builder operation:
    // it creates a workspace credential and deploys an action package, both of
    // which require the Developer/System-Admin role in the IMS org. Demos
    // without App Builder components don't trigger this gate.
    //
    // See `projectAppBuilderPredicate.ts` for the source of truth on which
    // components count as App Builder.
    const { projectRequiresAppBuilder } = await import(
        '@/features/components/services/projectAppBuilderPredicate'
    );
    if (projectRequiresAppBuilder(project, setupContext.registry)) {
        const { ServiceLocator } = await import('@/core/di');
        const authService = ServiceLocator.getAuthenticationService();
        const permissionCheck = await authService.testDeveloperPermissions();
        if (!permissionCheck.hasPermissions) {
            const errorMessage =
                permissionCheck.error ||
                'Your account lacks Developer or System Admin role for this organization. ' +
                    'API Mesh deployment requires App Builder access. ' +
                    'Please select a different organization or contact your administrator.';
            context.logger.error(`[Mesh Setup] Developer permission gate failed: ${errorMessage}`);
            throw new Error(errorMessage);
        }
        context.logger.debug('[Mesh Setup] Developer permission gate passed');
    }

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

    logMeshDecisionContext(
        context,
        typedConfig,
        project,
        meshComponent,
        meshId,
        meshDefinition,
        isEditMode,
        existingProject,
    );

    // Check for same-workspace import FIRST
    const isSameWorkspaceImport =
        typedConfig.importedWorkspaceId &&
        typedConfig.importedMeshEndpoint &&
        typedConfig.importedWorkspaceId === typedConfig.adobe?.workspace;

    if (isSameWorkspaceImport) {
        context.logger.info(
            `[Mesh Setup] Skipping deployment - reusing mesh from imported settings`,
        );
        const importedApiMesh = {
            endpoint: typedConfig.importedMeshEndpoint,
            meshId: '',
            meshStatus: 'deployed' as const,
            workspace: typedConfig.adobe?.workspace,
        };
        await linkExistingMesh(meshContext, importedApiMesh);
    } else if (shouldConfigureExistingMesh(typedConfig.apiMesh, getMeshEndpoint(project))) {
        await linkExistingMesh(meshContext, typedConfig.apiMesh as MeshApiConfig);
    } else if (isEditMode && getMeshEndpoint(existingProject)) {
        context.logger.info('[Mesh Setup] Edit mode - reusing existing mesh from project');
        const existingMesh = {
            endpoint: getMeshEndpoint(existingProject) as string,
            meshId: (getMeshComponentInstance(existingProject)?.metadata?.meshId as string) || '',
            meshStatus: 'deployed' as const,
            workspace: typedConfig.adobe?.workspace,
        };
        await linkExistingMesh(meshContext, existingMesh);
    } else if (meshComponent?.path && meshDefinition) {
        await deployFreshMesh(context, typedConfig, meshContext);
    }
}

/**
 * Log mesh deployment decision context for debugging.
 */
function logMeshDecisionContext(
    context: HandlerContext,
    typedConfig: ProjectCreationConfig,
    project: import('@/types').Project,
    meshComponent: import('@/types').ComponentInstance | undefined,
    meshId: string | undefined,
    meshDefinition: import('@/types').TransformedComponentDefinition | undefined,
    isEditMode: string | boolean | undefined,
    existingProject: import('@/types').Project | undefined,
): void {
    context.logger.debug(`[Mesh Setup] Decision context:`);
    context.logger.debug(`  - isEditMode: ${isEditMode}`);
    context.logger.debug(`  - existing project mesh endpoint: ${getMeshEndpoint(existingProject)}`);
    context.logger.debug(`  - typedConfig.apiMesh: ${JSON.stringify(typedConfig.apiMesh)}`);
    context.logger.debug(`  - meshComponent?.path: ${meshComponent?.path}`);
    context.logger.debug(`  - meshId: ${meshId}`);
    context.logger.debug(`  - meshDefinition: ${meshDefinition ? 'found' : 'NOT FOUND'}`);
    context.logger.debug(
        `  - shouldConfigureExistingMesh result: ${shouldConfigureExistingMesh(typedConfig.apiMesh, getMeshEndpoint(project))}`,
    );
}

/**
 * Build the org-context target for the create-time mesh deploy via the shared
 * builder (enriches org code/name from the cached org only on an id match).
 */
function buildDeployOrgTarget(
    context: HandlerContext,
    typedConfig: ProjectCreationConfig,
): OrgContextTarget {
    return buildOrgTargetFromProjectAdobe(
        typedConfig.adobe,
        context.authManager?.getCachedOrganization(),
    );
}

/**
 * Deploy a fresh mesh after pre-flight auth.
 *
 * Targets the project's KNOWN org/project/workspace via per-invocation
 * AIO_CONSOLE_* env (withOrgContext) instead of mutating the shared `aio`
 * global with selectWorkspace (which races concurrent processes). The deploy
 * and all dependent `aio api-mesh` calls run inside the wrapper.
 */
export async function deployFreshMesh(
    context: HandlerContext,
    typedConfig: ProjectCreationConfig,
    meshContext: import('../services').MeshSetupContext,
): Promise<void> {
    if (
        typedConfig.importedWorkspaceId &&
        typedConfig.importedWorkspaceId !== typedConfig.adobe?.workspace
    ) {
        context.logger.debug(
            `[Mesh Setup] Imported workspace differs from selected - deploying new mesh`,
        );
    }

    const authOk = await ensureMeshPreflightAuth(context.authManager, context.logger, {
        organization: typedConfig.adobe?.organization,
        projectId: typedConfig.adobe?.projectId,
        workspace: typedConfig.adobe?.workspace,
    });
    if (!authOk) {
        throw new Error(
            'Adobe authentication expired and re-login failed. Please sign in again and retry.',
        );
    }

    const target = buildDeployOrgTarget(context, typedConfig);
    await withOrgContext(target, () => deployNewMesh(meshContext, typedConfig.apiMesh));
}

/**
 * Perform atomic component swap for edit mode.
 */
async function performAtomicComponentSwap(
    context: HandlerContext,
    project: import('@/types').Project,
    projectPath: string,
    progressTracker: ProgressTracker,
): Promise<void> {
    progressTracker('Applying Changes', 71, 'Swapping components...');
    context.logger.info('[Project Edit] Swapping temporary components with production');

    try {
        await swapComponentsDirectory(projectPath, context.logger);

        if (!project.componentInstances || Object.keys(project.componentInstances).length === 0) {
            context.logger.error('[Project Edit] No component instances found after swap');
            throw new Error('Component swap completed but no components found in project state');
        }

        const tempComponentsPath = path.join(projectPath, 'components.tmp');
        const productionComponentsPath = path.join(projectPath, 'components');

        for (const [compId, instance] of Object.entries(project.componentInstances)) {
            if (instance.path && instance.path.startsWith(tempComponentsPath)) {
                const relativePath = path.relative(tempComponentsPath, instance.path);
                const oldPath = instance.path;
                instance.path = path.join(productionComponentsPath, relativePath);
                context.logger.debug(
                    `[Project Edit] Updated path for ${compId}: ${oldPath} → ${instance.path}`,
                );
            }
        }

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

/**
 * Populate componentConfigs for mesh from the generated .env file.
 */
async function populateMeshComponentConfigs(
    context: HandlerContext,
    project: import('@/types').Project,
): Promise<void> {
    const meshInstance = getMeshComponentInstance(project);
    const meshId = getMeshComponentId(project);
    if (!meshInstance?.path || !meshId) return;

    const { readMeshEnvVarsFromFile } = await import('@/features/mesh/services/stalenessDetector');
    const meshEnvVars = await readMeshEnvVarsFromFile(meshInstance.path);
    const envVarCount = meshEnvVars ? Object.keys(meshEnvVars).length : 0;
    if (meshEnvVars && envVarCount > 0) {
        if (!project.componentConfigs) {
            project.componentConfigs = {};
        }
        project.componentConfigs[meshId] = meshEnvVars;
        context.logger.debug(
            `[Project Creation] Populated componentConfigs[${meshId}] with ${envVarCount} env vars`,
        );
    }
}

/**
 * Phase 5: Sync EDS config.json to GitHub and publish to CDN.
 */
async function syncEdsConfigToRemote(
    context: HandlerContext,
    project: import('@/types').Project,
    typedConfig: ProjectCreationConfig,
    isEdsStack: boolean,
    edsComponentPath: string,
    progressTracker: ProgressTracker,
): Promise<void> {
    const edsSetupCompleteForSync = !!typedConfig.edsConfig?.preflightComplete;

    if (!isEdsStack || !edsSetupCompleteForSync) {
        logPhase5SkipReason(context, isEdsStack, typedConfig);
        return;
    }

    progressTracker('Syncing Config', 92, 'Pushing config.json to GitHub...');

    const repoUrl = typedConfig.edsConfig?.repoUrl;
    if (!repoUrl) {
        context.logger.warn('[Phase 5] No repo URL available, skipping config sync');
        return;
    }

    const repoInfo = parseGitHubUrl(repoUrl);
    if (!repoInfo) {
        context.logger.warn('[Phase 5] Could not parse repo URL, skipping config sync');
        return;
    }

    validateConfigJson(edsComponentPath);

    context.logger.info(`[Phase 5] Syncing config.json to ${repoInfo.owner}/${repoInfo.repo}`);

    const syncResult = await syncConfigToRemote({
        componentPath: edsComponentPath,
        repoOwner: repoInfo.owner,
        repoName: repoInfo.repo,
        logger: context.logger,
        secrets: context.context.secrets,
        authManager: context.authManager,
        onProgress: (message) => progressTracker('Syncing Config', 94, message),
        verifyBlockLibrary: true,
    });

    if (!syncResult.success) {
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

    const { updateStorefrontState } = await import(
        '@/features/eds/services/storefrontStalenessDetector'
    );
    // NOTE: passes the project's CURRENT configs, not a snapshot from when
    // config.json was generated earlier in this run. Same latent pattern the
    // republish path hit on 2026-08-10 (see updateStorefrontState) — narrower
    // window here, but fixing it means threading the snapshot through the
    // pipeline. Tracked in .rptc/plans/pdp-prerender-validation/.
    updateStorefrontState(project, project.componentConfigs || {});
    project.edsStorefrontStatusSummary = 'published';
    await context.stateManager.saveProject(project);
}

/**
 * Log reason for skipping Phase 5 config sync.
 */
function logPhase5SkipReason(
    context: HandlerContext,
    isEdsStack: boolean,
    typedConfig: ProjectCreationConfig,
): void {
    if (!isEdsStack) {
        context.logger.debug('[Phase 5] Skipped - not an EDS stack');
    } else if (!typedConfig.edsConfig) {
        context.logger.debug('[Phase 5] Skipped - edsConfig not set');
    } else if (!typedConfig.edsConfig.preflightComplete) {
        context.logger.debug('[Phase 5] Skipped - preflight not completed');
    }
}

/**
 * Validate config.json exists and is valid JSON before syncing.
 */
function validateConfigJson(edsComponentPath: string): void {
    const configJsonPath = path.join(edsComponentPath, 'config.json');
    if (!fs.existsSync(configJsonPath)) {
        throw new Error(
            `Commerce configuration failed: config.json not found at ${configJsonPath}. ` +
                `Config generation may have failed in Phase 4.`,
        );
    }

    try {
        const configContent = fs.readFileSync(configJsonPath, 'utf-8');
        JSON.parse(configContent);
    } catch (parseError) {
        throw new Error(
            `Commerce configuration failed: config.json is invalid JSON. ` +
                `Error: ${(parseError as Error).message}`,
        );
    }
}

/**
 * Phase 5b: Ensure EDS content is set up (DA.live content for imports/creations).
 */
async function setupEdsContent(
    context: HandlerContext,
    typedConfig: ProjectCreationConfig,
    isEdsStack: boolean,
    progressTracker: ProgressTracker,
): Promise<void> {
    if (!isEdsStack || !typedConfig.edsConfig?.contentSource || !typedConfig.edsConfig?.repoUrl) {
        return;
    }

    // B2B-readiness advisory (proceed-and-warn): a B2B-code storefront against a
    // backend without B2B enabled renders an empty B2B account experience. The
    // builder cannot enable B2B (no API — it's a backend prerequisite), so warn
    // only on a definitive negative; 'unknown' (older/SaaS schema) stays silent.
    if (typedConfig.edsConfig.templateRepo === 'boilerplate-b2b-template') {
        // Reuse the canonical config reader (same one envFileGenerator /
        // catalogPrewarmService use) — the GraphQL endpoint is already collected
        // as a project config setting; don't re-derive it. meshEndpoint omitted so
        // we probe the raw Commerce GraphQL the backend exposes.
        const { commerceEndpoint } = extractConfigParamsFromConfigs(
            typedConfig.componentConfigs as
                | Record<string, Record<string, string | number | boolean | undefined>>
                | undefined,
            undefined,
            typedConfig.components?.backend,
        );
        if (commerceEndpoint && (await detectB2bReadiness(commerceEndpoint)) === 'disabled') {
            const msg =
                'This B2B storefront is connected to a Commerce backend that does not have B2B enabled. ' +
                'The B2B account features (company, quotes, purchase orders, requisition lists) will not appear until ' +
                'B2B is enabled on the backend (Admin → Stores → Configuration → General → B2B Features → Enable Company).';
            context.logger.warn(`[Phase 5b] ${msg}`);
            void vscode.window.showWarningMessage(msg);
        }
    }

    try {
        const contentCopied = await ensureEdsContent(
            {
                repoUrl: typedConfig.edsConfig.repoUrl,
                daLiveOrg: typedConfig.edsConfig.daLiveOrg,
                daLiveSite: typedConfig.edsConfig.daLiveSite,
                contentSource: typedConfig.edsConfig.contentSource,
                accountContentSource: typedConfig.edsConfig.accountContentSource,
                contentPatches: typedConfig.edsConfig.contentPatches,
                contentPatchSource: typedConfig.edsConfig.contentPatchSource,
                templateOwner: typedConfig.edsConfig.templateOwner,
                templateRepo: typedConfig.edsConfig.templateRepo,
            },
            {
                logger: context.logger,
                secrets: context.context.secrets,
                extensionContext: context.context,
            },
            (message, subMessage) =>
                progressTracker('Setting Up Content', 95, subMessage || message),
        );

        if (contentCopied) {
            context.logger.info('[Phase 5b] Storefront content populated and published');
        }
    } catch (error) {
        context.logger.warn(`[Phase 5b] Content setup failed: ${(error as Error).message}`);
        context.logger.warn('[Phase 5b] Run EDS Reset from the dashboard to populate content');
    }
}

async function handlePortConflicts(
    context: HandlerContext,
    typedConfig: ProjectCreationConfig,
    _progressTracker: ProgressTracker,
): Promise<void> {
    const existingProject = await context.stateManager.getCurrentProject();
    if (existingProject && existingProject.status === 'running') {
        const runningPort = getProjectFrontendPort(existingProject);
        const defaultPort = vscode.workspace
            .getConfiguration('demoBuilder')
            .get<number>('defaultPort', 3000);
        const frontendId = typedConfig.components?.frontend;
        const targetPort =
            (frontendId && getComponentConfigPort(typedConfig.componentConfigs, frontendId)) ||
            defaultPort;

        if (runningPort === targetPort) {
            context.logger.debug(`[Project Creation] Stopping running demo on port ${runningPort}`);

            vscode.window.setStatusBarMessage(
                `⚠️  Stopping "${existingProject.name}" demo (port ${runningPort} conflict)`,
                TIMEOUTS.STATUS_BAR_SUCCESS,
            );

            await vscode.commands.executeCommand('demoBuilder.stopDemo');
            await sleep(TIMEOUTS.DEMO_STOP_WAIT);
        }
    }
}

async function cleanupOrphanedDirectory(
    projectPath: string,
    context: HandlerContext,
    progressTracker: ProgressTracker,
    fs: typeof import('fs/promises'),
): Promise<void> {
    if (
        await fs
            .access(projectPath)
            .then(() => true)
            .catch(() => false)
    ) {
        context.logger.warn(`[Project Creation] Directory already exists: ${projectPath}`);

        const existingFiles = await fs.readdir(projectPath);
        if (existingFiles.length > 0) {
            context.logger.debug(
                `[Project Creation] Found ${existingFiles.length} files, cleaning up...`,
            );
            progressTracker('Preparing Project', 5, 'Removing existing project data...');
            await fs.rm(projectPath, { recursive: true, force: true });
        } else {
            await fs.rmdir(projectPath);
        }
    }
}

/**
 * Look up a component definition by type from the registry.
 */
async function lookupComponentDef(
    compId: string,
    compType: string,
    registryManager: import('@/features/components/services/ComponentRegistryManager').ComponentRegistryManager,
): Promise<TransformedComponentDefinition | undefined> {
    let componentDef: TransformedComponentDefinition | undefined;

    if (compType === 'frontend') {
        const frontends = await registryManager.getFrontends();
        componentDef = frontends.find((f: { id: string }) => f.id === compId);
    } else if (compType === 'dependency') {
        const deps = await registryManager.getDependencies();
        componentDef = deps.find((d: { id: string }) => d.id === compId);
    } else if (compType === 'app-builder') {
        const apps = await registryManager.getAppBuilder();
        componentDef = apps.find((a: { id: string }) => a.id === compId);
    }

    // Fallback: search all sections (e.g., mesh components in "mesh" section)
    if (!componentDef) {
        componentDef = await registryManager.getComponentById(compId);
    }

    // Tag app components so installed instances are distinguishable by
    // getAppBuilderInstance (subType: 'app').
    if (componentDef && compType === 'app-builder') {
        componentDef = { ...componentDef, subType: 'app' };
    }

    return componentDef;
}

/**
 * Resolve the source for a frontend component based on stack type.
 */
function resolveFrontendSource(
    componentDef: TransformedComponentDefinition,
    typedConfig: ProjectCreationConfig,
    isEdsStack: boolean,
    logger: Logger,
): TransformedComponentDefinition {
    if (isEdsStack && typedConfig.edsConfig?.repoUrl) {
        logger.debug(
            `[Project Creation] Using EDS repo source for ${componentDef.name}: ${typedConfig.edsConfig.repoUrl}`,
        );
        return {
            ...componentDef,
            source: { type: 'git' as const, url: typedConfig.edsConfig.repoUrl, branch: 'main' },
        };
    }

    if (typedConfig.frontendSource) {
        logger.debug(
            `[Project Creation] Using template source for ${componentDef.name}: ${typedConfig.frontendSource.url}`,
        );
        return {
            ...componentDef,
            source: {
                type: typedConfig.frontendSource.type as 'git' | 'npm' | 'local',
                url: typedConfig.frontendSource.url,
                branch: typedConfig.frontendSource.branch,
                gitOptions: typedConfig.frontendSource.gitOptions,
            },
        };
    }

    return componentDef;
}

async function loadComponentDefinitions(
    typedConfig: ProjectCreationConfig,
    registryManager: import('@/features/components/services/ComponentRegistryManager').ComponentRegistryManager,
    context: HandlerContext,
    isEdsStack: boolean = false,
): Promise<Map<string, ComponentDefinitionEntry>> {
    const stack = typedConfig.selectedStack ? getStackById(typedConfig.selectedStack) : undefined;

    if (!stack) {
        context.logger.error(
            `[Project Creation] Stack "${typedConfig.selectedStack}" not found in stacks.json`,
        );
        throw new Error(
            `Stack "${typedConfig.selectedStack}" not found. Please check stacks.json configuration.`,
        );
    }

    const frontend = stack.frontend;
    // Use config dependencies (includes user-selected optional deps like mesh) or fall back to stack defaults
    const dependencies = typedConfig.components?.dependencies ?? stack.dependencies ?? [];
    // App Builder components come from the explicit user selection, NOT from
    // selectedAddons (addons feed the ADDONS path, not app components).
    const appBuilder = typedConfig.components?.appBuilder ?? [];

    context.logger.info(
        `[Project Creation] Stack "${stack.id}" components: frontend=${frontend}, dependencies=[${dependencies.join(', ')}]`,
    );

    const allComponents = [
        ...(frontend ? [{ id: frontend, type: 'frontend' }] : []),
        ...dependencies.map((id: string) => ({ id, type: 'dependency' })),
        ...appBuilder.map((id: string) => ({ id, type: 'app-builder' })),
    ];

    const componentDefinitions: Map<string, ComponentDefinitionEntry> = new Map();

    for (const comp of allComponents) {
        let componentDef = await lookupComponentDef(comp.id, comp.type, registryManager);

        if (!componentDef) {
            context.logger.warn(`[Project Creation] Component ${comp.id} not found in registry`);
            continue;
        }

        // Resolve frontend source based on stack type
        if (comp.type === 'frontend') {
            componentDef = resolveFrontendSource(
                componentDef,
                typedConfig,
                isEdsStack,
                context.logger,
            );
        }

        // Validate source is defined for installable components
        if (!componentDef.source) {
            const errorMsg =
                comp.type === 'frontend'
                    ? `No storefront found for stack "${typedConfig.selectedStack}" and package "${typedConfig.selectedPackage}". ` +
                      `Please ensure a matching storefront exists in demo-packages.json.`
                    : `Component "${componentDef.name}" (${comp.id}) has no installation source defined. ` +
                      `This is a configuration error in components.json - installable components must have a "source" property.`;
            context.logger.error(`[Project Creation] ${errorMsg}`);
            throw new Error(errorMsg);
        }

        const installOptions: { skipDependencies?: boolean } = { skipDependencies: true };

        componentDef = {
            ...componentDef,
            type: comp.type as TransformedComponentDefinition['type'],
        };
        componentDefinitions.set(comp.id, {
            definition: componentDef,
            type: comp.type,
            installOptions,
        });
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
    const staleBackupExists = await fsPromises
        .access(backupDir)
        .then(() => true)
        .catch(() => false);
    if (staleBackupExists) {
        logger.warn('[Project Edit] Found stale backup directory from previous attempt, removing');
        await fsPromises.rm(backupDir, { recursive: true, force: true });
    }

    try {
        // Step 1: Backup existing components (if they exist)
        const componentsExist = await fsPromises
            .access(componentsDir)
            .then(() => true)
            .catch(() => false);
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

        const backupExists = await fsPromises
            .access(backupDir)
            .then(() => true)
            .catch(() => false);
        const componentsExists = await fsPromises
            .access(componentsDir)
            .then(() => true)
            .catch(() => false);

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
        const tempExists = await fsPromises
            .access(tempDir)
            .then(() => true)
            .catch(() => false);
        if (tempExists) {
            try {
                await fsPromises.rm(tempDir, { recursive: true, force: true });
                logger.debug('[Project Edit] Cleaned up temporary directory');
            } catch (cleanupError) {
                logger.warn(
                    '[Project Edit] Failed to clean up temporary directory',
                    cleanupError as Error,
                );
                // Non-fatal - continue with the original error
            }
        }

        throw error;
    }
}

/**
 * PHASE 5c: SAMPLE DATA
 *
 * Installs the datapack the wizard's Sample Data sub-step recorded, into the
 * website/store view Business Structure chose, on the instance Connection has
 * already validated. Runs after the config files exist, because the credentials
 * it needs are read from them.
 *
 * **This phase never throws.** Every other phase here can fail the build; this
 * one must not. A project is complete and usable without sample data, and by the
 * time an import goes wrong the instance is already partly populated — which the
 * wizard has no rollback for. Failing creation would mark a good project bad and
 * leave the mess anyway. So the outcome is reported through the progress line
 * and the build carries on; the dashboard's import modal is where a retry lives.
 *
 * Silence would be the worse failure — the user asked for a pack and has no
 * other way to learn it did not land — so every outcome says something.
 */
export async function executeSampleDataPhase(
    context: HandlerContext,
    project: import('@/types').Project,
    progressTracker: ProgressTracker,
): Promise<void> {
    const chosen = (project as { datapack?: { name: string; version: string } }).datapack;
    if (!chosen) {
        return;
    }

    progressTracker('Installing Sample Data', 92, `Installing ${chosen.name}\u2026`);

    try {
        const { installSampleData } = await import(
            '@/features/data-installer/services/sampleDataInstall'
        );
        const { buildSampleDataDeps } = await import(
            '@/features/data-installer/services/sampleDataInstallDeps'
        );

        const result = await installSampleData(
            project,
            buildSampleDataDeps(context, project, (message) =>
                progressTracker('Installing Sample Data', 94, message),
            ),
        );

        progressTracker('Installing Sample Data', 96, describeSampleDataResult(chosen.name, result));
    } catch (error) {
        // Belt and braces: installSampleData already swallows its own failures,
        // so reaching here means the wiring broke rather than the import. Still
        // not fatal — see the docstring.
        const reason = error instanceof Error ? error.message : String(error);
        context.logger.warn(`[Sample Data] Phase failed, continuing: ${reason}`);
        progressTracker(
            'Installing Sample Data',
            96,
            `Sample data could not be installed \u2014 ${reason}`,
        );
    }
}

/** One line for the build log, honest about which of the three outcomes it was. */
function describeSampleDataResult(
    name: string,
    result: { ran: boolean; skipped?: boolean; outcome?: string; reason?: string },
): string {
    if (result.skipped) {
        return `Skipped sample data \u2014 ${result.reason ?? 'nothing to install'}`;
    }
    if (!result.ran) {
        return `Sample data could not be installed \u2014 ${result.reason ?? 'the import did not start'}`;
    }
    if (result.outcome === 'success') {
        return `Installed ${name}`;
    }
    return `Installed ${name} partially \u2014 some data types did not land. Retry from the dashboard.`;
}
