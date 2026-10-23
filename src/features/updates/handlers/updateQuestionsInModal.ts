/**
 * The questions an update run asks the SC, in the Updates modal's progress window (PL-80).
 *
 * The picker asked them as notifications beside the run; here they pause the run in the
 * window the SC is watching (`askDuringOperation`). The wording is the picker's.
 *
 * @module features/updates/handlers/updateQuestionsInModal
 */

import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { askDuringOperation } from '@/core/vscode/operationPrompt';
import type { UpdateQuestions } from '@/features/updates/services/updateApplyService';
import type { ClashAnswer, ClashQuestion, UnfinishedAnswer } from '@/features/updates/services/updateClash';
import type { UpdateSelections } from '@/features/updates/services/updateSelections';
import { projectsOf, selectionsWhere } from '@/features/updates/services/updateSelectionsByProject';
import type { Project } from '@/types/base';

const FIX_WITH_AI = 'Fix with AI';
const LEAVE_IT = 'Leave it as it is';
const RESET_TO_TEMPLATE = 'Reset to template';
const KEEP_FOR_LATER = 'Keep it for later';
const DROP_THE_FIX = 'Drop the fix';
const REPLACE_BLOCKS = 'Replace blocks';
const KEEP_BLOCKS = 'Keep my blocks';
const STOP_AND_UPDATE = 'Stop and update';
const SKIP = 'Skip';

/** The two questions the shared apply asks, asked in the modal. */
export const questionsInModal: UpdateQuestions = {
    async onClash(project: Project, { track, files, canReset }: ClashQuestion): Promise<ClashAnswer> {
        const noun = files.length === 1 ? 'file' : 'files';
        const update = track === 'boilerplate' ? "Adobe's boilerplate update" : 'The template update';
        const reset = canReset
            ? ` "${RESET_TO_TEMPLATE}" replaces them with the template's version and discards those edits.`
            : '';
        const answer = await askDuringOperation(
            {
                title: 'The update clashes with your edits',
                message:
                    `${getProjectDisplayName(project)}: ${update} clashes with edits in the storefront in ` +
                    `${files.length} ${noun} (${files.join(', ')}). "${FIX_WITH_AI}" opens your AI on the clash; ` +
                    `"${LEAVE_IT}" changes nothing.${reset}`,
            },
            FIX_WITH_AI,
            LEAVE_IT,
            ...(canReset ? [RESET_TO_TEMPLATE] : []),
        );
        if (answer === FIX_WITH_AI) return 'fix';
        return answer === RESET_TO_TEMPLATE && canReset ? 'reset' : 'leave';
    },
    async onUnfinished(project: Project, reason: string): Promise<UnfinishedAnswer> {
        const answer = await askDuringOperation(
            {
                title: 'The fix is not finished',
                message:
                    `${getProjectDisplayName(project)}: the update kept to fix with AI is not ready to finish, ` +
                    `because ${reason}. "${FIX_WITH_AI}" opens your AI on it again; "${DROP_THE_FIX}" puts the ` +
                    'storefront back as it was and offers the update again.',
            },
            FIX_WITH_AI,
            KEEP_FOR_LATER,
            DROP_THE_FIX,
        );
        if (answer === FIX_WITH_AI) return 'fix';
        return answer === DROP_THE_FIX ? 'leave' : 'later';
    },
    async replaceLibraryBlocks(_libraryName: string, _project: Project): Promise<boolean> {
        // Asked under the library's own row, beneath its project, so it names neither:
        // it says what each answer does (owner, 2026-10-21).
        const answer = await askDuringOperation(
            {
                title: 'Replace the blocks?',
                message:
                    `"${REPLACE_BLOCKS}" puts in the new versions, and any edits you made to these blocks are lost. ` +
                    `"${KEEP_BLOCKS}" leaves them as they are.`,
            },
            REPLACE_BLOCKS,
            KEEP_BLOCKS,
        );
        return answer === REPLACE_BLOCKS;
    },
};

/** What the running-demo question leaves to apply, and the sentences for what it left out. */
interface StoppedForUpdate {
    selections: UpdateSelections;
    skipped: string[];
}

/**
 * A project whose demo is running cannot be updated under it (files are locked). Ask,
 * per running project, whether to stop it; a "Skip" leaves that project's updates out.
 *
 * @param selections - what the SC ticked
 * @param currentProjectPath - only the open project's demo can be stopped from here
 * @param stopDemo - stops the open project's demo
 * @returns the selection to apply, and a sentence per project left out
 */
export async function stopRunningDemos(
    selections: UpdateSelections,
    currentProjectPath: string | undefined,
    stopDemo: () => PromiseLike<unknown>,
): Promise<StoppedForUpdate> {
    const skipped: string[] = [];
    const leftOut = new Set<string>();
    for (const project of projectsOf(selections).filter((p) => p.status === 'running')) {
        const name = getProjectDisplayName(project);
        const answer = await askDuringOperation(
            { title: 'Stop the demo to update it?', message: `${name} is running. Stop it to update it?` },
            STOP_AND_UPDATE,
            SKIP,
        );
        if (answer !== STOP_AND_UPDATE) {
            leftOut.add(project.path);
            skipped.push(`${name}: not updated, because its demo is running.`);
        } else if (project.path === currentProjectPath) {
            await stopDemo();
            await sleep(TIMEOUTS.DEMO_STOP_WAIT);
        }
    }
    const selected = leftOut.size === 0 ? selections : selectionsWhere(selections, (p) => !leftOut.has(p.path));
    return { selections: selected, skipped };
}
