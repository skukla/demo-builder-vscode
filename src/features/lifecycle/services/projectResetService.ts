/**
 * Project Reset Service
 *
 * Resets headless (non-EDS) projects by deleting and re-cloning components.
 * Two doors, neither with a dialog: a batch's answered run (`runProjectResetAnswered`) and the
 * `reset_project` agent tool (`executeProjectReset`).
 *
 * Reuses:
 * - cloneAllComponents / installAllComponents from componentInstallationOrchestrator
 * - the component definitions read from the saved project (`projectResetComponents`)
 * - a storefront reset's datapack step (`removeAnsweredDatapack`), when a batch or the agent asked
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
import {
    datapackStepLine,
    FailedAfterDatapack,
    removeAnsweredDatapack,
    type AnsweredDatapack,
    type DatapackRemoval,
} from '@/features/eds/services/reset/resetDatapackStep';
import { loadComponentDefinitionsFromProject, type LoadResult } from '@/features/lifecycle/services/projectResetComponents';
import { handleMeshRedeployment } from '@/features/lifecycle/services/projectResetMesh';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
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
// What a reset keeps
// ==========================================================

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
    /** What the datapack step did to the store, when it ran (the agent's reset, step-05 S7). */
    datapackRemoval?: DatapackRemoval;
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

/**
 * The steps, numbered and reported through `show`. Throws on failure; the caller decides who hears.
 * `beforeRebuild` runs once the components are known and before anything is removed (the datapack
 * step), so a reset that cannot read what to rebuild touches nothing; a reason it returns ends the
 * reset there, before anything is removed.
 */
async function runResetSteps(
    deps: ProjectResetDeps,
    show: ReportStage,
    beforeRebuild?: () => Promise<string | undefined>,
): Promise<ProjectResetOutcome> {
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

    const stop = await beforeRebuild?.();
    if (stop !== undefined) return { success: false, error: stop };
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
 * The call's Uninstall Datapack runs as a batch's does (step-05 S7), with one difference: changes
 * nobody answered end the reset before anything is removed, since an agent can ask the user and
 * call again, where a batch row already had its one chance to ask.
 *
 * @param deps - the project, its context and the two services the rebuild uses
 * @param report - told each stage as it starts
 * @param answered - the call's Uninstall Datapack and its answer about the changes
 * @returns the outcome, with what the mesh leg and the datapack step did
 * @throws whatever a step threw, after the project's status is put back; after the datapack step,
 *   as a `FailedAfterDatapack` carrying what it did
 */
export async function executeProjectReset(
    deps: ProjectResetDeps,
    report: ReportStage,
    answered?: AnsweredDatapack,
): Promise<ProjectResetOutcome> {
    return whileResetting(deps, async () => {
        const { outcome, removal } = await resetWithDatapack(deps, report, answered, true);
        return removal ? { ...outcome, datapackRemoval: removal } : outcome;
    });
}

/**
 * The steps with the datapack step before the rebuild. A failure after it throws as a
 * `FailedAfterDatapack`, so the caller can still say what became of the store.
 *
 * @param stopUnanswered - end the reset when the changes had no answer (the agent's door)
 */
async function resetWithDatapack(
    deps: ProjectResetDeps,
    report: ReportStage,
    answered: AnsweredDatapack | undefined,
    stopUnanswered: boolean,
): Promise<{ outcome: ProjectResetOutcome; removal?: DatapackRemoval }> {
    const step: { removal?: DatapackRemoval } = {};
    const removeFirst = async (): Promise<string | undefined> => {
        step.removal = await removeAnsweredDatapack(deps.project, deps.context, report, answered);
        return stopUnanswered && step.removal?.unanswered ? step.removal.kept : undefined;
    };
    try {
        return { outcome: await runResetSteps(deps, report, removeFirst), removal: step.removal };
    } catch (error) {
        // The same failure; after a datapack step it carries what the step did to the store.
        throw step.removal ? new FailedAfterDatapack(error, step.removal) : error;
    }
}

/** What a batch row reads: a failure's reason, or what a reset that finished could not do. */
export interface AnsweredResetOutcome {
    success: boolean;
    error?: string;
    /**
     * In the reset's own words: on a success, the mesh not redeployed and a datapack that did not
     * all come out; on a failure it returns after the datapack step, what that step did to the store.
     */
    warnings?: string[];
}

/** The outcome as the row reads it: a success's `error` is something it finished around. */
function asRowOutcome({ success, error }: ProjectResetOutcome, removal: DatapackRemoval | undefined): AnsweredResetOutcome {
    const warnings: string[] = [];
    if (success && error) warnings.push(error);
    // A clean removal is said only beside a failure: the SC then needs to know the store was emptied.
    if (removal && (!success || removal.kept !== undefined)) warnings.push(datapackStepLine(removal));
    const reason = !success && error ? { error } : {};
    return { success, ...reason, ...(warnings.length > 0 ? { warnings } : {}) };
}

/**
 * The same reset, answered up front by a batch (the projects list's Reset Selected, owner
 * 2026-11-04): no question, and it reports into the batch's window. A running demo is stopped
 * first, as the single reset stops it: only one demo runs at a time, so it is this one.
 *
 * The datapack goes once the components to rebuild are known (a reset that cannot read them
 * touches nothing; review, 2026-11-13) and before anything is removed, as a storefront reset's goes
 * first (`edsResetUI`), though there is no catalog pre-warm here to stale: the demo is already
 * stopped, so nothing serves the catalog while it empties, and the components come back against
 * the catalog the SC is left with. A removal that stops is said on the row and the reset still runs;
 * a reset that fails after it still says what became of the store.
 */
export async function runProjectResetAnswered(
    deps: ProjectResetDeps,
    report: ReportStage,
    answered?: AnsweredDatapack,
): Promise<AnsweredResetOutcome> {
    const vscode = await import('vscode');
    if (deps.project.status === 'running' || deps.project.status === 'starting') {
        await vscode.commands.executeCommand('demoBuilder.stopDemo');
    }
    return whileResetting(deps, async () => {
        // Uninstall Datapack as the batch answered it (step-05 S6, P5-Q3); a removal that stops is
        // said on the row and the reset still runs.
        const { outcome, removal } = await resetWithDatapack(deps, report, answered, false);
        return asRowOutcome(outcome, removal);
    });
}
