/**
 * Configure's Save, when it would point a project holding a datapack at another Commerce instance
 * (step-07 D6, owner 2026-11-14). The datapack stays where it went, and from the other instance
 * nothing could uninstall it, so the save asks first:
 *
 * - no answer: nothing is saved, and the screen asks "Change the Commerce Connection?";
 * - `keep` (Change Anyway): the change applies, the datapack stays in the instance it is in;
 * - `uninstall` (Uninstall First): the datapack is uninstalled the way a project delete and an Edit
 *   uninstall it (`removeProjectSampleDataOutcome`, the SC's changes settled first), from the
 *   instance the project still points at, and only once it is all out does the change apply.
 *
 * @module features/dashboard/commands/configureConnectionAnswer
 */

import * as vscode from 'vscode';
import { DATAPACK_OPERATION_ID } from '@/core/utils/operationIds';
import { withOperationProgress } from '@/core/vscode/withOperationProgress';
import {
    datapackLeftByChange,
    type InstalledDatapackAnswer,
    type InstalledDatapackQuestion,
} from '@/features/dashboard/services/connectionChange';
import { recordedInstanceOf } from '@/features/data-installer/handlers/installedElsewhere';
import { heldDisplayName } from '@/features/data-installer/handlers/libraryWriter';
import {
    askSaveAsNameWith,
    removeProjectSampleDataOutcome,
} from '@/features/eds/services/reset/edsResetSampleData';
import type { DatapackRemoval } from '@/features/eds/services/reset/resetDatapackStep';
import type { Project } from '@/types/base';
import type { ProjectDatapack } from '@/types/datapack';
import type { HandlerContext } from '@/types/handlers';
import type { ComponentConfigs } from '@/types/webview';

/** What answering needs: where the record says the datapack is, its name as the SC knows it, and its uninstall. */
export interface ConnectionAnswerDeps {
    recordedInstance: (project: Project) => Promise<string | undefined>;
    displayName: (held: ProjectDatapack) => Promise<string>;
    uninstall: (project: Project, displayName: string) => Promise<DatapackRemoval>;
}

/** Why Uninstall First changed nothing, or undefined when the datapack all came out. */
function notUninstalled(name: string, removal: DatapackRemoval): string | undefined {
    if (removal.leftInStore) {
        const why = removal.note ? `: ${removal.note}` : '.';
        return `Part of ${name} was left in Commerce, so the Commerce connection was not changed${why}`;
    }
    if (removal.kept === undefined) return undefined;
    return `${name} was not uninstalled, so the Commerce connection was not changed: ${removal.kept}`;
}

/**
 * Settle the installed datapack before a save that changes the Commerce connection.
 *
 * @param project - the project as it is, before the save; Uninstall First removes from it
 * @param changes - only the values being saved
 * @param answer - what the SC chose in the confirm; absent before it was shown
 * @returns the question to answer the save with instead of saving, or undefined to go on
 * @throws Error when Uninstall First did not take the datapack out: nothing is changed
 */
export async function answerConnectionChange(
    project: Project,
    changes: ComponentConfigs,
    answer: InstalledDatapackAnswer | undefined,
    deps: ConnectionAnswerDeps,
): Promise<{ success: false; data: InstalledDatapackQuestion } | undefined> {
    const left = answer === 'keep' ? undefined : datapackLeftByChange(project, changes, await deps.recordedInstance(project));
    if (!left) return undefined;
    const name = await deps.displayName(left);
    if (answer !== 'uninstall') return { success: false, data: { installedDatapack: name } };
    const stopped = notUninstalled(name, await deps.uninstall(project, name));
    if (stopped) throw new Error(stopped);
    return undefined;
}

/** The live answer: the library's name for the datapack, and its uninstall behind a notification. */
export function connectionAnswerDeps(context: HandlerContext): ConnectionAnswerDeps {
    return {
        recordedInstance: recordedInstanceOf,
        displayName: (held) => heldDisplayName(context, held),
        uninstall: async (project, displayName) => {
            let removal: DatapackRemoval = {};
            await withOperationProgress(
                { id: DATAPACK_OPERATION_ID, title: `Uninstalling ${displayName}`, inModal: false },
                async (report) => {
                    removal = await removeProjectSampleDataOutcome(
                        project,
                        context,
                        report,
                        askSaveAsNameWith(vscode),
                    );
                    return { success: notUninstalled(displayName, removal) === undefined };
                },
            );
            return removal;
        },
    };
}
