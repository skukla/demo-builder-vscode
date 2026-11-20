/**
 * The end of a creation: the steps a project can live without, then the finish.
 *
 * The datapack, warming product pages, the catalog menu and the AI files run after
 * everything the project needs, and each pauses the run on a failure until the SC fixes
 * it or skips the step (`creationPause.ts`, F307). The AI files used to be written after
 * "Project Created" was on screen, where a failure could only reach the log; they are
 * written now before it, once the project is saved.
 *
 * Split out of `executor.ts`, which sat at its size limit.
 *
 * @module features/project-creation/handlers/creationLastSteps
 */

import type { StepRunner } from './creationPause';
import type { CreationReporter } from './creationProgress';
import { executeSampleDataPhase } from './executorDatapackPhase';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { recordSkippedSteps } from '@/core/utils/skippedSteps';
import { generateAIContextFiles } from '@/features/project-creation/services/aiBundle/aiBundleService';
import { executeCatalogMenuPhase } from '@/features/project-creation/services/catalogMenuPhase';
import { executeCatalogPrewarmPhase } from '@/features/project-creation/services/catalogPrewarmPhase';
import {
    type FinalizationContext,
    finalizeProject,
    reportProjectCreated,
    sendCompletionAndCleanup,
} from '@/features/project-creation/services/projectFinalizationService';
import { type StepFailure, stepFailureOf } from '@/features/project-creation/services/stepFailure';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

/** What the last steps need from the run. */
export interface LastStepsRun {
    context: HandlerContext;
    project: Project;
    progress: CreationReporter;
    /** Runs each step: a failed one pauses until the SC fixes it or skips it. */
    runStep: StepRunner;
    /** The run's step boundary: a stopped run ends here. */
    step: () => void;
    isEdsStack: boolean;
    existingProject?: Project;
    finalization: FinalizationContext;
}

/**
 * Run the optional steps, save the project, write its AI files and say it is created.
 *
 * @param run - the creation run
 * @throws the cancelled error when the run is stopped
 */
export async function runLastSteps(run: LastStepsRun): Promise<void> {
    const { context, project, progress, step, runStep, finalization } = run;

    // After the config files exist, because the credentials the install needs are read from them.
    step();
    await runStep(OPERATION_STAGES.installingDatapack.label, () =>
        executeSampleDataPhase(context, project, progress.report),
    );

    // After sample data: warming a catalog that has not been seeded publishes nothing useful.
    step();
    await runStep(OPERATION_STAGES.warmingProductPages.label, () =>
        executeCatalogPrewarmPhase(context, project, progress.report),
    );

    // After sample data too: the categories the pages are written for arrive with the datapack.
    step();
    if (run.isEdsStack) {
        await runStep(OPERATION_STAGES.addingCatalogMenu.label, () =>
            executeCatalogMenuPhase(context, project, progress.report, run.existingProject),
        );
    }

    step();
    // What the SC skipped becomes a Finish Setup step, with the tile that runs it (F307).
    recordSkippedSteps(project, runStep.skipped ?? []);
    await finalizeProject(finalization);
    await runStep(OPERATION_STAGES.finishingProject.label, () => writeAiFiles(run));
    await reportProjectCreated(
        progress.report,
        project,
        finalization.setupContext.logger,
        'Project creation complete',
    );
    await sendCompletionAndCleanup(finalization);
}

/**
 * The project's AI files, and the freshness stamp they set saved with it: without the stamp
 * the activation sweep refreshes the bundle on every start.
 */
async function writeAiFiles({
    context,
    project,
    finalization,
}: LastStepsRun): Promise<StepFailure | undefined> {
    try {
        await generateAIContextFiles(
            finalization.projectPath,
            project,
            context.context.extensionPath,
        );
        await context.stateManager.saveProjectConfigOnly(project);
        return undefined;
    } catch (err) {
        // Landed hashes must survive a partial failure (Phase-4 review): a retried creation
        // over an existing directory has old ones to keep in step.
        try {
            await context.stateManager.saveProjectConfigOnly(project);
        } catch {
            /* best-effort */
        }
        const reason = err instanceof Error ? err.message : String(err);
        context.logger.warn(
            '[Project Creation] Failed to generate AI context files',
            err instanceof Error ? err : undefined,
        );
        return stepFailureOf(`The AI files could not be written: ${reason}`);
    }
}
