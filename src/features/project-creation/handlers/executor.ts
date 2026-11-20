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
 * - Phase 5c sample data — `executorDatapackPhase`
 * - The optional steps and the finish — `creationLastSteps`
 *
 * This file keeps `buildInitialProject` and `executeProjectCreation`, and
 * re-exports the phase modules' public functions so every existing
 * `./executor` import path keeps working.
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { runLastSteps } from './creationLastSteps';
import { caught, stepRunner } from './creationPause';
import { creationReporter, creationSteps } from './creationProgress';
import { stepBoundary } from './creationStop';
import {
    executeAppBuilderIntegrationsPhase,
    ensureWorkspaceRuntimeReady,
} from './executorAppBuilderPhase';
import { loadComponentDefinitions } from './executorComponentLoading';
import { finishEditWithoutRebuild } from './executorEditApply';
import { settleConnectionBeforeRebuild } from './executorEditConnection';
import {
    carriedOverFromEdit,
    loadExistingProjectForEdit,
    prepareEditModeTempDir,
    performAtomicComponentSwap,
} from './executorEditMode';
import { renameAfterEdit } from './executorEditRename';
import { populateEdsMetadata, syncEdsConfigToRemote, setupEdsContent } from './executorEdsPhase';
import { executeMeshPhase, populateMeshComponentConfigs } from './executorMeshPhase';
import {
    creationPath,
    handlePortConflicts,
    cleanupOrphanedDirectory,
    refuseSecondErpIntegration,
} from './executorPreflight';
import { ProgressTracker } from './shared';
import { COMPONENT_IDS } from '@/core/constants';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { whileRunning } from '@/core/state/projectWorkRunning';
import { OPERATION_STAGES as S } from '@/core/utils/operationStages';
import { RESET_STAGES } from '@/core/utils/resetStages';
import { getAppBuilderComponentEntry } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { componentRegistryFrom } from '@/features/components/services/componentRegistryAccess';
import { migrateDeclaredSecrets } from '@/features/components/services/declaredSecretStore';
import { cloneAllComponents, installAllComponents } from '@/features/project-creation/services/componentInstallationOrchestrator';
import { fillCreationDefaults } from '@/features/project-creation/services/creationConfigDefaults';
import { generateEnvironmentFiles } from '@/features/project-creation/services/projectFinalizationService';
import { HandlerContext } from '@/types/handlers';
import { isEdsStackId } from '@/types/typeGuards';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

// ===== Helper Functions =====

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
 * the keyed `appBuilderComponents` map via `extractSettingsFromProject` (Edit
 * and Copy) and `createExportSettings` (the exported project file).
 * In Edit, the old project's records are kept: see `carriedOverFromEdit`.
 */
export function buildInitialProject(
    typedConfig: ProjectCreationConfig,
    projectPath: string,
    existingProject?: import('@/types/base').Project,
): import('@/types/base').Project {
    return {
        ...carriedOverFromEdit(existingProject),
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
        // The storefront row for a project built on an added demo (D2). Same
        // fallback as the fields below: an edit session keeps what it had.
        demo: typedConfig.demo ?? existingProject?.demo,
        // Same fallback reasoning as `commerceStoreStructure` above: this rebuilds
        // the whole Project, and an edit session that never opened the Sample
        // Data area carries no choice. Overwriting a recorded one with undefined
        // would silently forget what the project was meant to be seeded with.
        datapack: typedConfig.datapack ?? existingProject?.datapack,
        selectedStack: typedConfig.selectedStack,
        selectedAddons: typedConfig.selectedAddons,
        selectedBlockLibraries: typedConfig.selectedBlockLibraries,
        customBlockLibraries: typedConfig.customBlockLibraries,
        // What THIS run's storefront setup installed; an edit that installed none keeps its own.
        installedBlockLibraries: typedConfig.edsConfig?.installedBlockLibraries?.length
            ? typedConfig.edsConfig.installedBlockLibraries
            : existingProject?.installedBlockLibraries,
        componentApiPicks: typedConfig.componentApiPicks,
    };
}

/**
 * Create a project, or rebuild an edited one.
 *
 * Listed as running for as long as it runs, so the projects list can tell a project
 * being created from one whose creation never finished (PL-82).
 *
 * @param signal - the run's stop (`creationRun.ts`): checked before each step starts, so a
 *   stopped creation lets its running step finish and starts no other (F274)
 * @throws the cancelled error (`creationStop.ts`) when stopped, or a step's own error
 */
export async function executeProjectCreation(
    context: HandlerContext,
    config: ProjectCreationConfig,
    signal?: AbortSignal,
): Promise<void> {
    const step = stepBoundary(signal);
    await whileRunning(creationPath(config), 'creating', () =>
        createOrRebuild(context, config, signal),
    );
    step();
    await renameAfterEdit(context, config); // a name changed in Edit, applied after it
}

async function createOrRebuild(
    context: HandlerContext,
    config: ProjectCreationConfig,
    signal: AbortSignal | undefined,
): Promise<void> {
    const typedConfig = config;
    const step = stepBoundary(signal); // before each step: a stopped run ends here (F274)

    context.logger.debug(
        `[Project Creation] Received config: selectedPackage=${typedConfig.selectedPackage}, selectedStack=${typedConfig.selectedStack}`,
    );

    // One reporter for the wizard's screen and an agent (`creationProgress.ts`).
    const progress = creationReporter(context.sendMessage, Date.now(), signal);
    const progressTracker: ProgressTracker = progress.report;

    // ===== PRE-FLIGHT CHECKS =====

    step();
    // An Edit that changed nothing, or only integrations, is not a rebuild (PL-75).
    // One runner for every step that can pause on its failure (F307).
    const runStep = stepRunner({ context, reporter: progress, signal, projectName: typedConfig.projectName });
    if (await finishEditWithoutRebuild(context, typedConfig, progressTracker, undefined, runStep)) return;
    await handlePortConflicts(context, typedConfig, progressTracker); // the port is free
    await refuseSecondErpIntegration(context, typedConfig); // one ERP integration per instance (AB-78)

    // Determine project path based on edit mode (editProjectPath presence signals edit)
    const isEditMode = Boolean(typedConfig.editProjectPath);
    const projectPath = creationPath(typedConfig);

    // Load existing project state if in edit mode (to preserve creation date);
    // otherwise clean up any orphaned/invalid directory (new project only).
    let existingProject: import('@/types/base').Project | undefined;
    if (isEditMode) {
        existingProject = await loadExistingProjectForEdit(projectPath, context);
        if (existingProject) await settleConnectionBeforeRebuild(context, typedConfig, existingProject); // asked first (D6)
    } else {
        await cleanupOrphanedDirectory(projectPath, context, progressTracker, fsPromises);
    }
    // From here the run's steps are known, so each shows "(n of N)".
    progress.numberFrom(creationSteps(typedConfig, existingProject));
    step();

    // ===== PROJECT INITIALIZATION =====

    progressTracker(S.settingUpProject.label, 10, 'Creating folders');

    const componentsDir = path.join(projectPath, 'components');
    await fsPromises.mkdir(componentsDir, { recursive: true });
    await fsPromises.mkdir(path.join(projectPath, 'logs'), { recursive: true });

    context.logger.debug(`[Project Creation] Created directory: ${projectPath}`);

    progressTracker(S.settingUpProject.label, 15, 'Writing settings');

    const project: import('@/types/base').Project = buildInitialProject(
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

    // ===== STACK TYPE DETECTION =====
    // Detect EDS stacks for special metadata handling later.
    // EDS components are cloned via the standard flow, but need additional
    // metadata populated from runtime config (from preflight step).

    const isEdsStack = isEdsStackId(typedConfig.selectedStack);
    const edsComponentPath = path.join(projectPath, 'components', COMPONENT_IDS.EDS_STOREFRONT);

    // ===== LOAD COMPONENT DEFINITIONS =====

    progressTracker(S.loadingComponents.label, 20, 'Reading components');

    const registryManager = componentRegistryFrom(context);
    const registry = await registryManager.loadRegistry();

    // The defaults the wizard's settings screen fills on load, filled here for
    // every door — an agent's create_project never mounts that screen. Absent
    // keys only: a value the wizard saved, or one the user cleared, stands.
    project.componentConfigs = fillCreationDefaults(typedConfig, registry, project.componentConfigs ?? {});

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

    // RUNTIME READINESS (first Adobe step — provision a Runtime namespace on the
    // deploy workspace if it lacks one, BEFORE any deploy, so a selected/imported
    // Runtime-less workspace is healed rather than orphaning a mesh at app-deploy)

    // Before the code is on disk there is no project to keep: these steps cannot be
    // skipped (F307). From the mesh on, the dashboard can run each one again.
    step();
    await runStep(S.makingWorkspace.label, caught(() => ensureWorkspaceRuntimeReady(context, typedConfig)), false);

    // ===== EDIT MODE: PREPARE ATOMIC COMPONENT SWAP =====
    // In edit mode, install components to a temp directory first.
    // Only swap to production after ALL components install successfully.
    // This preserves the original components if installation fails.

    const tempComponentsDir = isEditMode
        ? await prepareEditModeTempDir(projectPath, context)
        : undefined;

    // ===== PHASE 1-2: COMPONENT INSTALLATION =====

    const installationContext = {
        project,
        componentDefinitions,
        progressTracker,
        logger: context.logger,
        saveProject: () => context.stateManager.saveProject(project),
        commandManager: ServiceLocator.getCommandExecutor(),
        // In edit mode, install to temp directory for atomic swap
        componentsDir: tempComponentsDir,
    };

    step();
    await runStep(S.downloadingComponents.label, caught(() => cloneAllComponents(installationContext)), false);
    step();
    await runStep(S.installingComponents.label, caught(() => installAllComponents(installationContext)), false);

    // ===== EDIT MODE: ATOMIC COMPONENT SWAP =====

    step();
    if (isEditMode && tempComponentsDir) {
        await performAtomicComponentSwap(context, project, projectPath, progressTracker);
    }

    // ===== EDS METADATA POPULATION (if EDS stack) =====

    await populateEdsMetadata(context, project, typedConfig, isEdsStack);

    // ===== PHASE 3: MESH CONFIGURATION =====

    step();
    await runStep(S.deployingMesh.label, caught(() => executeMeshPhase(
        context,
        setupContext,
        project,
        typedConfig,
        componentDefinitions,
        progressTracker,
        isEditMode,
        existingProject,
    )));

    // ===== PHASE 3b: APP BUILDER INTEGRATIONS =====

    step();
    await runStep(S.deployingIntegrations.label, caught(() =>
        executeAppBuilderIntegrationsPhase(context, project, typedConfig, progressTracker),
    ));

    // ===== PHASE 4-5: FINALIZATION =====
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

    step();
    await runStep(S.writingConfigFiles.label, caught(() => generateEnvironmentFiles(finalizationContext)));

    // Populate componentConfigs for mesh from the generated .env file
    await populateMeshComponentConfigs(context, project);

    // ===== PHASE 5: SYNC EDS CONFIG TO REMOTE + PHASE 5b: EDS CONTENT SETUP =====

    step();
    await runStep(S.publishingSettings.label, caught(() => syncEdsConfigToRemote(
        context,
        project,
        typedConfig,
        isEdsStack,
        edsComponentPath,
        progressTracker,
    )));

    step();
    await runStep(RESET_STAGES.copyingContent.label, () =>
        setupEdsContent(context, typedConfig, isEdsStack, progressTracker, project),
    );

    // ===== PHASE 5c-6: THE OPTIONAL STEPS, THEN THE FINISH =====
    //
    // The datapack, product pages, catalog menu and AI files: each pauses the run on a
    // failure until the SC fixes it or skips the step (F307). See `creationLastSteps.ts`.
    await runLastSteps({
        context,
        project,
        progress,
        runStep,
        step,
        isEdsStack,
        existingProject,
        finalization: finalizationContext,
    });

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


// Public API re-exports — the executor was decomposed into phase modules
// (2026-08-23); every import path that reached these through `./executor`
// keeps working, which is what lets the decomposition prove itself with
// zero consumer or test edits.
export { ensureMeshPreflightAuth, deployFreshMesh } from './executorMeshPhase';
export { executeAppBuilderIntegrationsPhase } from './executorAppBuilderPhase';
export { executeSampleDataPhase } from './executorDatapackPhase';
