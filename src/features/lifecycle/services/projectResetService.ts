/**
 * Project Reset Service
 *
 * Resets headless (non-EDS) projects by deleting and re-cloning components.
 * Follows the same UI pattern as edsResetService: confirmation → progress → execute → notify.
 *
 * Reuses:
 * - cloneAllComponents / installAllComponents from componentInstallationOrchestrator
 * - ComponentRegistryManager for component definitions
 * - loadComponentDefinitions pattern from executor.ts
 * - generateComponentEnvFile for .env regeneration
 * - StopDemo command for stopping running demos
 *
 * @module features/lifecycle/services/projectResetService
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { resetOperationId } from '@/core/utils/operationIds';
import {
    withOperationProgress,
    type ReportStage,
} from '@/core/vscode/withOperationProgress';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { getComponentRegistryManager } from '@/features/components/services/componentRegistryInstance';
import { getStackById } from '@/features/components/services/demoPackageLoader';
import { handleMeshRedeployment } from '@/features/lifecycle/services/projectResetMesh';
import type { ComponentDefinitionEntry } from '@/features/project-creation/services/componentInstallationOrchestrator';
import type { Project } from '@/types/base';
import type { ComponentRegistry, TransformedComponentDefinition } from '@/types/components';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import type { Stack } from '@/types/stacks';

// ==========================================================
// Types
// ==========================================================

/**
 * The reset's steps are a fixed list, so a count is known up front and may ride
 * the stage as "(4 of 6)" — the one shape a count is allowed to take (PL-59).
 */
const RESET_STEPS = 6;
const at = (index: number): { index: number; total: number } => ({ index, total: RESET_STEPS });

/** The SC's door: the reset's own needs plus where its progress shows. */
export interface ResetWithUIOptions extends ProjectResetDeps {
    /** Started from a screen that hosts the progress modal (PL-59 R1). */
    progress?: 'modal';
    /** The id that screen named the operation by, so its modal follows this run. */
    operationId?: string;
}

// ==========================================================
// Component Definition Loading
// ==========================================================

/** Result of loading component definitions, includes registry for reuse */
interface LoadResult {
    componentDefinitions: Map<string, ComponentDefinitionEntry>;
    registry: ComponentRegistry;
    stack: Stack;
}

/** Look up a component definition by type from the registry manager */
async function findComponentByType(
    registryManager: {
        getFrontends: () => Promise<TransformedComponentDefinition[]>;
        getDependencies: () => Promise<TransformedComponentDefinition[]>;
        getComponentById: (id: string) => Promise<TransformedComponentDefinition | undefined>;
    },
    comp: { id: string; type: string },
): Promise<TransformedComponentDefinition | undefined> {
    if (comp.type === 'frontend') {
        const frontends = await registryManager.getFrontends();
        return frontends.find((f: { id: string }) => f.id === comp.id);
    }
    if (comp.type === 'dependency') {
        const deps = await registryManager.getDependencies();
        return deps.find((d: { id: string }) => d.id === comp.id);
    }
    return undefined;
}

/** Build the flat component list from stack + saved selections */
export function buildComponentList(stack: Stack, project: Project): { id: string; type: string }[] {
    const frontend = stack.frontend;
    // Use project's saved dependencies (includes user-selected optional deps like mesh) or fall back to stack defaults
    const dependencies = project.componentSelections?.dependencies ?? stack.dependencies ?? [];
    // No integrations: reset leaves them alone (see `integrationIds`).
    return [
        ...(frontend ? [{ id: frontend, type: 'frontend' }] : []),
        ...dependencies.map((id: string) => ({ id, type: 'dependency' })),
    ];
}

/**
 * The components a reset leaves exactly as they are: every App Builder component
 * except a mesh (the mesh is a stack dependency, downloaded again and redeployed).
 *
 * Owner decision, 2026-09-21 (AB-23 slice 7): reset never touches an integration.
 * Its code may be the SC's own work — one built with AI exists only on disk, and
 * downloading it again gave back the blank starter it came from — and its app keeps
 * running in Adobe either way, as a storefront project's reset has always left it.
 * Rebuilding only the selected integrations had also deleted the ERP half of a pair
 * for good, since the ERP comes with its integration rather than being selected.
 *
 * @param project - the project being reset
 * @returns the ids whose folders and records stay
 */
function integrationIds(project: Project): Set<string> {
    return new Set(
        Object.entries(project.appBuilderComponents ?? {})
            .filter(([, state]) => state.kind !== 'mesh')
            .map(([id]) => id),
    );
}

/**
 * Remove the components folder, except the folders of what `keep` names.
 *
 * @param componentsDir - the project's components folder
 * @param project - the project, whose instances say where each kept folder is
 * @param keep - the ids whose folders stay
 */
async function removeComponentsExcept(
    componentsDir: string,
    project: Project,
    keep: Set<string>,
): Promise<void> {
    const options = { recursive: true, force: true };
    if (keep.size === 0) {
        await fsPromises.rm(componentsDir, options);
        return;
    }
    const kept = new Set(
        [...keep].map((id) => path.basename(project.componentInstances?.[id]?.path ?? id)),
    );
    for (const name of await fsPromises.readdir(componentsDir)) {
        if (!kept.has(name)) await fsPromises.rm(path.join(componentsDir, name), options);
    }
}

/**
 * Reconstruct component definitions from saved project state.
 *
 * Uses the same logic as executor.ts loadComponentDefinitions() but reads
 * from the saved project (selectedStack, selectedAddons, componentInstances)
 * instead of the wizard's ProjectCreationConfig.
 *
 * Returns the registry alongside definitions so callers can reuse it
 * (avoids duplicate file I/O).
 */
async function loadComponentDefinitionsFromProject(
    project: Project,
    context: HandlerContext,
): Promise<LoadResult> {
    const registryManager = getComponentRegistryManager(context.context.extensionPath);
    const registry = await registryManager.loadRegistry();
    const stack = project.selectedStack ? getStackById(project.selectedStack) : undefined;

    if (!stack) {
        throw new Error(`Stack "${project.selectedStack}" not found in stacks.json. Cannot reset.`);
    }

    const allComponents = buildComponentList(stack, project);

    const componentDefinitions: Map<string, ComponentDefinitionEntry> = new Map();

    for (const comp of allComponents) {
        let componentDef = await findComponentByType(registryManager, comp);

        // Fallback: search all sections (e.g., mesh in "mesh" section)
        if (!componentDef) {
            componentDef = await registryManager.getComponentById(comp.id);
        }

        if (!componentDef) {
            context.logger.warn(`[ProjectReset] Component ${comp.id} not found in registry`);
            continue;
        }

        // For frontend, restore source URL from saved componentInstance
        if (comp.type === 'frontend') {
            const savedInstance = project.componentInstances?.[comp.id];
            if (savedInstance?.repoUrl) {
                componentDef = {
                    ...componentDef,
                    source: {
                        type: 'git' as const,
                        url: savedInstance.repoUrl,
                        branch: savedInstance.branch || 'main',
                    },
                };
            }
        }

        if (!componentDef.source) {
            context.logger.warn(`[ProjectReset] Component ${comp.id} has no source, skipping`);
            continue;
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

    return { componentDefinitions, registry, stack };
}

// ==========================================================
// The reset itself
// ==========================================================

/** What a reset needs, whoever started it. */
export interface ProjectResetDeps {
    /** Project to reset */
    project: Project;
    /** Handler context */
    context: HandlerContext;
    /** Log prefix for messages (e.g., '[Dashboard]' or '[ProjectsList]') */
    logPrefix?: string;
    /** ADR-015: the shell executor, supplied by the calling handler. */
    commandManager: CommandExecutor;
    /** ADR-015: the auth service, likewise. */
    authManager: AuthenticationService;
}

/** A reset's answer, with what the mesh leg did (an agent has no notification to read it from). */
export interface ProjectResetOutcome {
    success: boolean;
    error?: string;
    meshRedeployed?: boolean;
}

/** Mark the project resetting for the length of `run`; put the old status back if it never landed. */
async function whileResetting<T>(deps: ProjectResetDeps, run: () => Promise<T>): Promise<T> {
    const { project, context } = deps;
    const originalStatus = project.status;
    project.status = 'resetting';
    await context.stateManager.saveProject(project);
    try {
        return await run();
    } finally {
        // Restore status if still 'resetting' (error path)
        if (project.status === 'resetting') {
            project.status = originalStatus;
            await context.stateManager.saveProject(project);
        }
    }
}

/** Steps 2–5: remove the components, download and install them again, write the settings back. */
async function rebuildComponents(
    deps: ProjectResetDeps,
    loaded: LoadResult,
    report: ReportStage,
): Promise<void> {
    const { project, context, logPrefix = '[ProjectReset]', commandManager } = deps;

    report('Removing the old components', undefined, at(2));
    const componentsDir = path.join(project.path, 'components');
    const kept = integrationIds(project);
    try {
        await removeComponentsExcept(componentsDir, project, kept);
        context.logger.info(`${logPrefix} Removed components directory`);
    } catch {
        context.logger.debug(`${logPrefix} No components directory to remove`);
    }

    // Clear component instances (rebuilt by cloneAllComponents), except the
    // integrations', whose folders were left where they are.
    project.componentInstances = Object.fromEntries(
        Object.entries(project.componentInstances ?? {}).filter(([id]) => kept.has(id)),
    );

    report('Downloading the components', undefined, at(3));
    const { cloneAllComponents, installAllComponents } = await import(
        '@/features/project-creation/services/componentInstallationOrchestrator'
    );
    const installContext = {
        project,
        componentDefinitions: loaded.componentDefinitions,
        progressTracker: ((_phase: string, _pct: number, msg: string) => {
            report('Downloading the components', msg, at(3));
        }) as import('@/features/project-creation/handlers/shared').ProgressTracker,
        logger: context.logger,
        saveProject: () => context.stateManager.saveProject(project),
        commandManager,
    };
    await cloneAllComponents(installContext);

    report('Installing dependencies', undefined, at(4));
    await installAllComponents(installContext);

    report('Writing the settings back', undefined, at(5));
    const { regenerateProjectEnvFiles } = await import(
        '@/features/project-creation/helpers/envFileGenerator'
    );
    await regenerateProjectEnvFiles(project, loaded.registry, context.logger, context.context.secrets);
}

/** The six steps, reported through `report`. Throws on failure; the caller decides who hears. */
async function runResetSteps(deps: ProjectResetDeps, report: ReportStage): Promise<ProjectResetOutcome> {
    const { project, context, logPrefix = '[ProjectReset]', commandManager, authManager } = deps;
    const vscode = await import('vscode');
    context.logger.info(`${logPrefix} Resetting project: ${project.name}`);

    // Step 1: Load component definitions from saved project state
    report('Reading what this project has', undefined, at(1));
    const loaded = await loadComponentDefinitionsFromProject(project, context);
    if (loaded.componentDefinitions.size === 0) {
        return { success: false, error: 'No components found for this project stack' };
    }
    context.logger.info(`${logPrefix} Found ${loaded.componentDefinitions.size} components to reset`);

    await rebuildComponents(deps, loaded, report);

    // Step 6: Redeploy API Mesh (if project has mesh)
    const mesh = await handleMeshRedeployment(
        project,
        context,
        logPrefix,
        report,
        vscode,
        commandManager,
        authManager,
    );
    if (mesh?.earlyReturn) {
        return { success: true, error: mesh.earlyReturn.error, meshRedeployed: false };
    }
    const meshRedeployed = mesh?.redeployed ?? false;

    project.status = 'ready';
    await context.stateManager.saveProject(project);

    // No timed success toast (PL-59 R6): the modal closes itself, and
    // a run handed to the background ends with "— done". What the mesh
    // did belongs in the log, which is where anyone checking will look.
    context.logger.info(
        `${logPrefix} Project reset completed` + (meshRedeployed ? ' (mesh redeployed)' : ''),
    );
    return { success: true, meshRedeployed };
}

/**
 * Reset a headless project with no dialog and no notification: the core both
 * doors share. `resetProjectWithUI` wraps it for an SC; the `reset_project`
 * agent tool calls it directly, having taken consent through `confirm:true`.
 *
 * It does not stop a running demo — the caller does, by whatever means it has.
 *
 * @param deps - the project, its context and the two services the rebuild uses
 * @param report - told each stage as it starts
 * @returns the outcome, with what the mesh leg did
 * @throws whatever a step threw, after the project's status is put back
 */
export async function executeProjectReset(
    deps: ProjectResetDeps,
    report: ReportStage,
): Promise<ProjectResetOutcome> {
    return whileResetting(deps, () => runResetSteps(deps, report));
}

/** What the SC's surfaces read: the outcome without the agent's mesh detail. */
function asHandlerResponse({ success, error }: ProjectResetOutcome): HandlerResponse {
    return { success, ...(error ? { error } : {}) };
}

// ==========================================================
// Full Reset with UI
// ==========================================================

/**
 * Reset a headless project with full UI flow.
 *
 * Pattern mirrors edsResetService.resetEdsProjectWithUI:
 * 1. Confirmation dialog
 * 2. Stop demo if running
 * 3. Set status to 'resetting'
 * 4. The six steps of {@link executeProjectReset}'s core, narrated to the
 *    notification or the progress modal
 * 5. Restore status, show the error notification on failure
 */
export async function resetProjectWithUI(options: ResetWithUIOptions): Promise<HandlerResponse> {
    const { project, context, logPrefix = '[ProjectReset]' } = options;

    const vscode = await import('vscode');

    // Show confirmation dialog
    const confirmButton = 'Reset Project';
    const confirmation = await vscode.window.showWarningMessage(
        `Are you sure you want to reset "${project.name}"? This will delete its components and ` +
            'install them again from scratch. Integrations are left as they are, and your ' +
            'configuration is kept.',
        { modal: true },
        confirmButton,
    );

    if (confirmation !== confirmButton) {
        context.logger.info(`${logPrefix} Reset cancelled by user`);
        return { success: false, cancelled: true };
    }

    // Stop demo if running
    if (project.status === 'running' || project.status === 'starting') {
        context.logger.info(`${logPrefix} Stopping running demo before reset`);
        await vscode.commands.executeCommand('demoBuilder.stopDemo');
    }

    return whileResetting(options, async () => {
        try {
            return await withOperationProgress(
                {
                    id: options.operationId ?? resetOperationId(project.name),
                    title: `Resetting ${project.name}`,
                    inModal: options.progress === 'modal',
                },
                async (report) => asHandlerResponse(await runResetSteps(options, report)),
            );
        } catch (error) {
            const errorMessage = (error as Error).message;
            context.logger.error(`${logPrefix} Reset failed`, error as Error);

            // A modal already shows the reason, with Debug Logs beside it.
            if (options.progress !== 'modal') {
                vscode.window.showErrorMessage(`Failed to reset project: ${errorMessage}`);
            }

            return { success: false, error: errorMessage };
        }
    });
}
