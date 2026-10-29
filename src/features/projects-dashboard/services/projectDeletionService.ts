/**
 * ProjectDeletionService
 *
 * The delete itself: ask, then remove what the SC chose online, then the local
 * project, inside one progress surface, and report what was cleaned up.
 *
 * The question lives in `deletionConfirmation.ts`, the online removal (GitHub
 * repository, DA.live site, the CDN unpublish) in `edsExternalCleanup.ts`, and
 * the local removal with its retry in `projectFilesDeletion.ts`, and the demo's own
 * library pack, when the SC ticked it, in `demoPackDeletion.ts`.
 */

import * as vscode from 'vscode';
import { confirmPlainDelete, showCleanupConfirmation, type CleanupOptions } from './deletionConfirmation';
import { deleteProjectDemoPack } from './demoPackDeletion';
import { edsCleanupSteps, performEdsCleanup, type DeletionServices } from './edsExternalCleanup';
import { deleteProjectFiles } from './projectFilesDeletion';
import { numberedSteps } from '@/core/utils/numberedSteps';
import { showOneTimeTip } from '@/core/utils/oneTimeTip';
import { deleteOperationId } from '@/core/utils/operationIds';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { withOperationProgress } from '@/core/vscode/withOperationProgress';
import {
    extractEdsMetadata,
    formatCleanupResults,
    type CleanupResultItem,
} from '@/features/eds/services/resourceCleanupHelpers';
import type { Project } from '@/types/base';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

/** Where a delete reports, when a screen started it (PL-59 R1). */
export interface DeleteProgressOptions {
    progress?: 'modal';
    /** The id that screen named the operation by. */
    operationId?: string;
}

/**
 * Ask before deleting: the cleanup question when the project has something beyond its
 * files (an EDS storefront online, or its own library pack), else the plain modal.
 *
 * @returns what to delete beside the files, or null when the SC cancelled
 */
async function askBeforeDelete(
    project: Project,
    edsMetadata: ReturnType<typeof extractEdsMetadata>,
    options?: DeleteProgressOptions,
): Promise<CleanupOptions | null> {
    if (edsMetadata || project.ownDatapack) {
        // Auth is checked lazily in performEdsCleanup when user selects an option
        return showCleanupConfirmation(
            project,
            edsMetadata,
            options?.progress === 'modal' ? (options.operationId ?? deleteOperationId(project.name)) : undefined,
        );
    }
    return (await confirmPlainDelete(project)) ? { deleteGitHubRepo: false, deleteDaLiveSite: false } : null;
}

/**
 * Delete a project with confirmation and cleanup
 *
 * Shows confirmation dialog, stops demo if running, deletes files,
 * and removes from recent projects.
 *
 * For EDS projects, offers optional external resource cleanup.
 */
export async function deleteProject(
    context: HandlerContext,
    project: Project,
    services?: DeletionServices,
    options?: DeleteProgressOptions,
): Promise<HandlerResponse> {
    // Check if this is an EDS project with external resources
    // Null unless the project has an Edge Delivery storefront component to clean up.
    const edsMetadata = extractEdsMetadata(project);

    // Auth is checked lazily in performEdsCleanup when user actually selects an option
    // This avoids slow auth checks before showing the confirmation dialog
    const cleanupOptions = await askBeforeDelete(project, edsMetadata, options);
    if (cleanupOptions === null) {
        return { success: true, data: { success: false, error: 'cancelled' } };
    }
    const ownPack = cleanupOptions.deleteDatapack ? project.ownDatapack : undefined;

    // Collect cleanup results for EDS projects
    const cleanupResults: CleanupResultItem[] = [];
    let stoppedBecause: string | undefined;

    // Where this narrates is the shared routing: the screen's progress modal when
    // a kebab started it, else one notification (PL-59 R1/R2). Titled for the
    // PROJECT — it used to say "Demo Builder", which names the extension rather
    // than what is happening.
    await withOperationProgress(
        {
            id: options?.operationId ?? deleteOperationId(project.name),
            title: `Deleting ${project.name}`,
            inModal: options?.progress === 'modal',
        },
        async (report) => {
            const online = edsMetadata ? edsCleanupSteps(edsMetadata, cleanupOptions) : [];
            // Numbered "(n of N)": the list is known once the SC has said what to remove
            // (progress vocabulary slice 2, owner 2026-10-16). A step that is skipped (a
            // sign-in declined) leaves its number unused and the count moves on.
            const packStep = ownPack ? [OPERATION_STAGES.deletingOwnPack.label] : [];
            const step = numberedSteps([...online, OPERATION_STAGES.removingProjectFiles.label, ...packStep], report);

            // EDS cleanup: Perform external resource cleanup first
            if (edsMetadata) {
                const stopped = await performEdsCleanup(
                    context,
                    edsMetadata,
                    { ...cleanupOptions, projectPath: project.path },
                    cleanupResults,
                    step,
                    services,
                );
                // Pages still live: the project is how a second try finds them (EDS-65).
                if (stopped) {
                    stoppedBecause = stopped;
                    return { success: false, error: stopped };
                }
            }

            step(OPERATION_STAGES.removingProjectFiles.label);

            // Local deletion (stop demo, remove files, drop from recent, clear current).
            await deleteProjectFiles(context, project);

            // The demo's own pack, last, and never a reason the delete fails (step 07).
            if (ownPack) {
                step(OPERATION_STAGES.deletingOwnPack.label);
                cleanupResults.push(await deleteProjectDemoPack(context, ownPack));
            }

            // No "deleted" line on a timer: the modal closes itself and a
            // background run ends with "— done" (PL-59 R6).
            return { success: true };
        },
    );

    if (stoppedBecause) {
        return {
            success: true,
            data: { success: false, projectName: project.name, error: stoppedBecause, cleanupResults },
        };
    }

    // Show cleanup summary for EDS projects
    if (cleanupResults.length > 0) {
        const summary = formatCleanupResults(cleanupResults);
        context.logger.info(`[Delete Project] Cleanup summary:\n${summary}`);
    }

    // Show one-time tip about cleanup settings (only if we showed the QuickPick)
    if (edsMetadata && cleanupResults.length > 0) {
        showOneTimeTip(context.context.globalState, {
            stateKey: 'edsCleanup.settingsTipShown',
            message: 'Tip: You can customize cleanup behavior in Settings → Demo Builder',
            actions: ['Open Settings'],
            onAction: (selection) => {
                if (selection === 'Open Settings') {
                    vscode.commands.executeCommand(
                        'workbench.action.openSettings',
                        'demoBuilder.cleanupBehavior',
                    );
                }
            },
        });
    }

    return {
        success: true,
        data: { success: true, projectName: project.name, cleanupResults },
    };
}
