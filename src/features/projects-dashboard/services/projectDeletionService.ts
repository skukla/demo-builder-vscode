/**
 * ProjectDeletionService
 *
 * The delete itself, once answered: the datapack's data in Commerce when the SC ticked
 * Uninstall Datapack (`datapackDataRemoval.ts`, walk F96), then what the SC chose online
 * (the GitHub repository, the DA.live site, the CDN unpublish, `edsExternalCleanup.ts`),
 * then the local project with its retry (`projectFilesDeletion.ts`). The question is asked
 * by the batch window before anything runs (`projectsBatch.ts`). The agent's `delete_project`
 * runs the same delete with `cleanupOptions.nobodyToAsk`, so a sign-in it would ask for is
 * refused instead (PL-104 fix 6).
 */

import { removeDataBeforeDelete } from './datapackDataRemoval';
import {
    edsCleanupSteps,
    performEdsCleanup,
    type CleanupOptions,
    type DeletionServices,
    type EdsCleanupOutcome,
} from './edsExternalCleanup';
import { deleteProjectFiles } from './projectFilesDeletion';
import { numberedSteps } from '@/core/utils/numberedSteps';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import type { ReportStage } from '@/core/vscode/withOperationProgress';
import type { SaveAsAnswering } from '@/features/eds/services/reset/edsResetDatapack';
import { extractEdsMetadata, type CleanupResultItem } from '@/features/eds/services/resourceCleanupHelpers';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

/** What a delete runs with once it has been answered. */
export interface AnsweredDelete {
    cleanupOptions: CleanupOptions;
    /**
     * How a pack with changes is answered when its data goes: given up front by the batch's save
     * question (`GivenSaveAs`).
     */
    askName?: SaveAsAnswering;
    /** Where each cleanup step's result is added. */
    cleanupResults: CleanupResultItem[];
    services?: DeletionServices;
}

/**
 * What the delete did: why it stopped, where the changes went first, whether the datapack
 * had nothing installed to remove, and the storefront teardown's and site code's results.
 */
export interface ProjectDeleteRun extends Omit<EdsCleanupOutcome, 'stopped'> {
    stopped?: string;
    saved?: string;
    /** Removing the datapack's data found nothing of it ever installed (`removeDataBeforeDelete`). */
    nothingInstalled?: true;
}

/**
 * The delete itself, answered: the datapack's data first, when the SC ticked it, then the
 * storefront's online resources, then the files. Run by the batch (`projectsBatch.ts`), a row
 * at a time, reporting into its window, and by the agent's `delete_project`.
 *
 * @returns why it stopped, when the data was not all removed or the storefront's pages are still
 *   live, and the project was kept; else where the changes went first, when they were saved
 */
export async function runProjectDelete(
    context: HandlerContext,
    project: Project,
    answered: AnsweredDelete,
    report: ReportStage,
): Promise<ProjectDeleteRun> {
    const { cleanupOptions, askName, cleanupResults, services } = answered;
    let data: ProjectDeleteRun = {};
    // The data first: while the project is here a second try can find it, so a removal that
    // does not finish keeps the project (walk F96).
    if (cleanupOptions.removeDatapackData) {
        const removal = await removeDataBeforeDelete(context, project, report, askName);
        if (removal.stopped) return { stopped: removal.stopped };
        data = {
            ...(removal.saved ? { saved: removal.saved } : {}),
            ...(removal.nothingInstalled ? { nothingInstalled: true as const } : {}),
        };
    }
    const edsMetadata = extractEdsMetadata(project);
    const onlineSteps = edsMetadata ? edsCleanupSteps(edsMetadata, cleanupOptions) : [];
    // Numbered "(n of N)": the list is known once the SC has said what to remove
    // (progress vocabulary slice 2, owner 2026-10-16). A step that is skipped (a
    // sign-in declined) leaves its number unused and the count moves on.
    const step = numberedSteps([...onlineSteps, OPERATION_STAGES.removingProjectFiles.label], report);

    // EDS cleanup: Perform external resource cleanup first
    let online: EdsCleanupOutcome = {};
    if (edsMetadata) {
        online = await performEdsCleanup(
            context,
            edsMetadata,
            { ...cleanupOptions, projectPath: project.path },
            cleanupResults,
            step,
            services,
        );
        // Pages still live: the project is how a second try finds them (EDS-65).
        if (online.stopped) return { ...data, ...online };
    }

    step(OPERATION_STAGES.removingProjectFiles.label);

    // Local deletion (stop demo, remove files, drop from recent, clear current).
    await deleteProjectFiles(context, project);
    // Where the changes went first, for the batch row (owner, 2026-11-14).
    return { ...data, ...online };
}
