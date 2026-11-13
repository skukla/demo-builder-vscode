/**
 * Project Reset Service
 *
 * Resets headless (non-EDS) projects by deleting and re-cloning components.
 * Two doors, neither with a dialog: a batch's answered run (`runProjectResetAnswered`) and the
 * `reset_project` agent tool (`executeProjectReset`).
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
import { whileRunning } from '@/core/state/projectWorkRunning';
import { numberedSteps } from '@/core/utils/numberedSteps';
import { OPERATION_STAGES as S } from '@/core/utils/operationStages';
import type { ReportStage } from '@/core/vscode/withOperationProgress';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { getComponentRegistryManager } from '@/features/components/services/componentRegistryInstance';
import { getStackById } from '@/features/components/services/demoPackageLoader';
import { handleMeshRedeployment } from '@/features/lifecycle/services/projectResetMesh';
import { toComponentDefinitionEntry } from '@/features/project-creation/services/componentDefinitionEntry';
import type { ComponentDefinitionEntry } from '@/features/project-creation/services/componentInstallationOrchestrator';
import type { Project } from '@/types/base';
import type { ComponentRegistry, TransformedComponentDefinition } from '@/types/components';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import type { Stack } from '@/types/stacks';
import { getMeshComponentInstance } from '@/types/typeGuards';

// ==========================================================
// Types
// ==========================================================

/**
 * The reset's steps, known before it starts, so each shows its place as "(4 of 7)".
 * Named from the stage table as creation names the same jobs (progress vocabulary
 * slice 6, owner 2026-10-16); the mesh adds its access check and its redeploy.
 *
 * ORDER IS LOAD-BEARING: a step's number is its index here, so the list follows
 * `runResetSteps`.
 *
 * @param project - the project being reset
 * @returns the step names
 */
function projectResetSteps(project: Project): string[] {
    return [
        S.loadingComponents.label,
        S.removingComponents.label,
        S.downloadingComponents.label,
        S.installingComponents.label,
        S.writingConfigFiles.label,
        ...(getMeshComponentInstance(project)?.path ? [S.checkingRequirements.label, S.redeployingMesh.label] : []),
    ];
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

        componentDefinitions.set(comp.id, toComponentDefinitionEntry(componentDef, comp.type));
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

/**
 * Mark the project resetting for the length of `run`; put the old status back if it
 * never landed. Listed as resetting too, which is what the projects list reads.
 */
async function whileResetting<T>(deps: ProjectResetDeps, run: () => Promise<T>): Promise<T> {
    const { project, context } = deps;
    return whileRunning(project.path, 'resetting', async () => {
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
    });
}

/** Steps 2–5: remove the components, download and install them again, write the settings back. */
async function rebuildComponents(
    deps: ProjectResetDeps,
    loaded: LoadResult,
    report: ReportStage,
): Promise<void> {
    const { project, context, logPrefix = '[ProjectReset]', commandManager } = deps;

    report(S.removingComponents.label);
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

    report(S.downloadingComponents.label);
    const { cloneAllComponents, installAllComponents } = await import(
        '@/features/project-creation/services/componentInstallationOrchestrator'
    );
    const installContext = {
        project,
        componentDefinitions: loaded.componentDefinitions,
        progressTracker: ((_phase: string, _pct: number, msg: string) => {
            report(S.downloadingComponents.label, msg);
        }) as import('@/features/project-creation/handlers/shared').ProgressTracker,
        logger: context.logger,
        saveProject: () => context.stateManager.saveProject(project),
        commandManager,
    };
    await cloneAllComponents(installContext);

    report(S.installingComponents.label);
    await installAllComponents(installContext);

    report(S.writingConfigFiles.label);
    const { regenerateProjectEnvFiles } = await import(
        '@/features/project-creation/helpers/envFileRegeneration'
    );
    await regenerateProjectEnvFiles(project, loaded.registry, context.logger, context.context.secrets);
}

/** The steps, numbered and reported through `show`. Throws on failure; the caller decides who hears. */
async function runResetSteps(deps: ProjectResetDeps, show: ReportStage): Promise<ProjectResetOutcome> {
    const { project, context, logPrefix = '[ProjectReset]', commandManager, authManager } = deps;
    const vscode = await import('vscode');
    context.logger.info(`${logPrefix} Resetting project: ${project.name}`);
    const report: ReportStage = numberedSteps(projectResetSteps(project), show);

    // Step 1: Load component definitions from saved project state
    report(S.loadingComponents.label);
    const loaded = await loadComponentDefinitionsFromProject(project, context);
    if (loaded.componentDefinitions.size === 0) {
        return { success: false, error: 'No components found for this project stack' };
    }
    context.logger.info(`${logPrefix} Found ${loaded.componentDefinitions.size} components to reset`);

    await rebuildComponents(deps, loaded, report);

    // Steps 6–7: check Adobe access, redeploy the API Mesh (if project has mesh)
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
 * Reset a headless project with no dialog and no notification. The `reset_project`
 * agent tool calls it, having taken consent through `confirm:true`; a batch runs the
 * same steps through `runProjectResetAnswered`.
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

/**
 * The same reset, answered up front by a batch (the projects list's Reset Selected, owner
 * 2026-11-04): no question, and it reports into the batch's window. A running demo is stopped
 * first, as the single reset stops it: only one demo runs at a time, so it is this one.
 */
export async function runProjectResetAnswered(deps: ProjectResetDeps, report: ReportStage): Promise<HandlerResponse> {
    const vscode = await import('vscode');
    if (deps.project.status === 'running' || deps.project.status === 'starting') {
        await vscode.commands.executeCommand('demoBuilder.stopDemo');
    }
    return whileResetting(deps, async () => asHandlerResponse(await runResetSteps(deps, report)));
}
