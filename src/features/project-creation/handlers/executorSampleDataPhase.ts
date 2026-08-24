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

    progressTracker('Installing Datapack', 92, `Installing ${chosen.name}\u2026`);

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
                // Three-row contract: count in the title, the types being
                // installed right now in the detail row (pack name until the
                // first type starts).
                progressTracker(
                    `Installing Datapack (${sd.done}/${sd.total})`,
                    94,
                    sd.processing.join(', ') || chosen.name,
                ),
            ),
        );

        progressTracker(
            'Installing Datapack',
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
            'Installing Datapack',
            96,
            `Datapack could not be installed \u2014 ${reason}`,
        );
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
