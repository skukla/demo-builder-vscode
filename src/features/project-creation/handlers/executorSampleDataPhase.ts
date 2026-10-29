/**
 * Project Creation — Phase 5c: sample data.
 *
 * Installs the datapack the wizard's Sample Data sub-step recorded. This
 * phase never throws (see the docstring on the function). Extracted from
 * `executor.ts` (2026-08-23 god-file decomposition).
 *
 * @module features/project-creation/handlers/executorSampleDataPhase
 */

import type { ProgressTracker } from './shared';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { typesLine } from '@/features/data-installer/services/datapackTypesLine';
import type { HandlerContext } from '@/types/handlers';

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
 *
 * **The recorded pack is settled first** (step 07, `settleArrivingPack`): a pack an
 * imported or copied project names that cannot be read is replaced by the pack it was
 * made from, or by none, and a colleague's own demo pack is copied into this SC's
 * library; the line says which, and the project records the change.
 */
export async function executeSampleDataPhase(
    context: HandlerContext,
    project: import('@/types/base').Project,
    progressTracker: ProgressTracker,
): Promise<void> {
    if (!project.datapack) {
        return;
    }
    await settleRecordedPack(context, project, progressTracker);
    const chosen = project.datapack;
    if (!chosen) {
        return;
    }

    progressTracker(OPERATION_STAGES.installingDatapack.label, 92, `Installing ${chosen.name}`);

    try {
        const { installSampleData } = await import(
            '@/features/data-installer/services/sampleDataInstall'
        );
        const { buildSampleDataDeps } = await import(
            '@/features/data-installer/services/sampleDataInstallDeps'
        );

        const result = await installSampleData(
            project,
            buildSampleDataDeps(context, project, (sd) =>
                // The step stays the step; how far it has got, and the types being
                // installed right now, go on the line under it (progress vocabulary,
                // owner 2026-10-16).
                progressTracker(
                    OPERATION_STAGES.installingDatapack.label,
                    94,
                    typesLine(sd.done, sd.total, sd.processing),
                ),
            ),
        );

        progressTracker(
            OPERATION_STAGES.installingDatapack.label,
            96,
            describeSampleDataResult(chosen.name, result),
        );
    } catch (error) {
        // Belt and braces: installSampleData already swallows its own failures,
        // so reaching here means the wiring broke rather than the import. Still
        // not fatal — see the docstring.
        const reason = error instanceof Error ? error.message : String(error);
        context.logger.warn(`[Sample Data] Phase failed, continuing: ${reason}`);
        progressTracker(
            OPERATION_STAGES.installingDatapack.label,
            96,
            `Datapack could not be installed \u2014 ${reason}`,
        );
    }
}

/** Settle the recorded pack before the install. Never throws: the install then runs as recorded. */
async function settleRecordedPack(
    context: HandlerContext,
    project: import('@/types/base').Project,
    progressTracker: ProgressTracker,
): Promise<void> {
    try {
        const { settleArrivingPack } = await import('@/features/data-installer/services/arrivingPack');
        const { arrivalDepsFor } = await import('@/features/data-installer/handlers/recordedPackHandlers');
        const arrival = await settleArrivingPack(project, arrivalDepsFor(context));
        if (arrival.note) {
            context.logger.info(`[Sample Data] ${arrival.note}`);
            progressTracker(OPERATION_STAGES.installingDatapack.label, 92, arrival.note);
        }
        if (arrival.changed) await context.stateManager.saveProject(project);
    } catch (error) {
        context.logger.warn(`[Sample Data] The recorded pack could not be checked, installing it as recorded: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/** One line for the build log, honest about which of the three outcomes it was. */
function describeSampleDataResult(
    name: string,
    result: { ran: boolean; skipped?: boolean; outcome?: string; reason?: string },
): string {
    if (result.skipped) {
        return `Skipped datapack \u2014 ${result.reason ?? 'nothing to install'}`;
    }
    if (!result.ran) {
        return `Datapack could not be installed \u2014 ${result.reason ?? 'the import did not start'}`;
    }
    if (result.outcome === 'success') {
        return `Installed ${name}`;
    }
    return `Installed ${name} partially \u2014 some data types did not land. Retry from the dashboard.`;
}
