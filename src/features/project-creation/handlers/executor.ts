/**
 * Project Creation Handlers - Executor
 *
 * The orchestrator for project creation. Each phase lives in its own module
 * (2026-08-23 god-file decomposition):
 * - Pre-flight checks — `executorPreflight`
 * - Component definitions — `executorComponentLoading`
 * - Edit-mode atomic swap — `executorEditMode`
 * - Phase 3 mesh — `executorMeshPhase`
 * - Phase 3b App Builder integrations — `executorAppBuilderPhase`
 * - EDS metadata / config sync / content — `executorEdsPhase`
 * - Phase 5c sample data — `executorSampleDataPhase`
 *
 * This file keeps `buildInitialProject` and `executeProjectCreation`, and
 * re-exports the phase modules' public functions so every existing
 * `./executor` import path keeps working.
 */

import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
    cloneAllComponents,
    installAllComponents,
    generateEnvironmentFiles,
    finalizeProject,
    sendCompletionAndCleanup,
    generateAIContextFiles,
} from '../services';
import { getAppBuilderComponentEntry } from '../services/appBuilderComponentCatalogLoader';
import {
    executeAppBuilderIntegrationsPhase,
    ensureWorkspaceRuntimeReady,
} from './executorAppBuilderPhase';
import { loadComponentDefinitions } from './executorComponentLoading';
import {
    loadExistingProjectForEdit,
    prepareEditModeTempDir,
    performAtomicComponentSwap,
} from './executorEditMode';
import { populateEdsMetadata, syncEdsConfigToRemote, setupEdsContent } from './executorEdsPhase';
import { executeMeshPhase, populateMeshComponentConfigs } from './executorMeshPhase';
import { handlePortConflicts, cleanupOrphanedDirectory } from './executorPreflight';
import { executeSampleDataPhase } from './executorSampleDataPhase';
import { ProgressTracker } from './shared';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { COMPONENT_IDS } from '@/core/constants';
import { migrateDeclaredSecrets } from '@/features/components/services/commerceSecretMigration';
import { executeCatalogPrewarmPhase } from '@/features/project-creation/services/catalogPrewarmPhase';
import { isEdsStackId } from '@/types/typeGuards';
import type { MeshPhaseState } from '@/types/webview';
import type { CreationProgressPayload } from '@/types/webviewPayloads';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

// ============================================================================
// Helper Functions
// ============================================================================

/** Keys of a project's component instances (empty when none set). */
function getComponentInstanceKeys(project: import('@/types').Project): string[] {
    return Object.keys(project.componentInstances || {});
}

// ProjectCreationConfig and FrontendSource live in @/types/webviewRequests —
// ONE declaration shared with the wizard's buildProjectConfig and the MCP
// create_project tool (this file used to carry the only copy, and the wire
// crossing was an `as unknown as` cast).


/**
 * Actual project creation logic (extracted for testability)
 */

/**
 * Selected App Builder integration ids for `componentSelections.appBuilder`.
 *
 * Excludes mesh-kind ids (they ride `components.dependencies` and are
 * installed by the mesh phase) plus anything literally riding dependencies,
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
        componentApiPicks: typedConfig.componentApiPicks,
        // Note: componentVersions, meshState, etc. are NOT preserved during edit
        // - componentVersions: Regenerated from fresh component installation
        // - meshState: Must be clean slate - old sourceHash won't match fresh files
        // - frontendEnvState: Only valid if demo is running (cleared during edit)
    };
}

export async function executeProjectCreation(
    context: HandlerContext,
    config: ProjectCreationConfig,
): Promise<void> {
    const typedConfig = config;

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
        const payload: CreationProgressPayload = {
            currentOperation,
            progress,
            message: message || '',
            logs: [],
            meshPhase: currentMeshPhase,
        };
        context.sendMessage('creationProgress', payload);
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


// ============================================================================
// Public API re-exports — the executor was decomposed into phase modules
// (2026-08-23); every import path that reached these through `./executor`
// keeps working, which is what lets the decomposition prove itself with
// zero consumer or test edits.
// ============================================================================
export { ensureMeshPreflightAuth, deployFreshMesh } from './executorMeshPhase';
export { executeAppBuilderIntegrationsPhase } from './executorAppBuilderPhase';
export { executeSampleDataPhase } from './executorSampleDataPhase';
