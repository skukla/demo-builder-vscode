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
import type { ClashAnswer, ClashQuestion } from '@/features/updates/services/updateClash';
import type { UpdateSelections } from '@/features/updates/services/updateSelections';
import type { Project } from '@/types/base';

const FIX_WITH_AI = 'Fix with AI';
const LEAVE_IT = 'Leave it as it is';
const RESET_TO_TEMPLATE = 'Reset to template';
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
            `${getProjectDisplayName(project)}: ${update} clashes with edits in the storefront in ` +
                `${files.length} ${noun} (${files.join(', ')}). "${FIX_WITH_AI}" opens your AI on the clash; ` +
                `"${LEAVE_IT}" changes nothing.${reset}`,
            FIX_WITH_AI,
            LEAVE_IT,
            ...(canReset ? [RESET_TO_TEMPLATE] : []),
        );
        if (answer === FIX_WITH_AI) return 'fix';
        return answer === RESET_TO_TEMPLATE && canReset ? 'reset' : 'leave';
    },
    async replaceLibraryBlocks(libraryName: string, project: Project): Promise<boolean> {
        const answer = await askDuringOperation(
            `${libraryName} has new blocks for ${getProjectDisplayName(project)}. Replacing them ` +
                'overwrites any edits you made to this library\'s blocks.',
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
    for (const project of runningProjects(selections)) {
        const name = getProjectDisplayName(project);
        const answer = await askDuringOperation(`${name} is running. Stop it to update it?`, STOP_AND_UPDATE, SKIP);
        if (answer !== STOP_AND_UPDATE) {
            leftOut.add(project.path);
            skipped.push(`${name}: not updated, because its demo is running.`);
        } else if (project.path === currentProjectPath) {
            await stopDemo();
            await sleep(TIMEOUTS.DEMO_STOP_WAIT);
        }
    }
    return { selections: withoutProjects(selections, leftOut), skipped };
}

/** Each running project once, in the order its first update appears. */
function runningProjects(selections: UpdateSelections): Project[] {
    const seen = new Map<string, Project>();
    for (const entry of projectEntries(selections)) {
        if (entry.project.status === 'running' && !seen.has(entry.project.path)) {
            seen.set(entry.project.path, entry.project);
        }
    }
    return [...seen.values()];
}

function projectEntries(selections: UpdateSelections): Array<{ project: Project }> {
    return [
        ...selections.template,
        ...selections.boilerplate,
        ...selections.component,
        ...selections.adobeMcp,
        ...selections.blockLibrary,
        ...selections.blockLibraryInstall,
        ...selections.inspector,
        ...selections.integration,
    ];
}

function withoutProjects(selections: UpdateSelections, paths: Set<string>): UpdateSelections {
    if (paths.size === 0) return selections;
    const keep = <T extends { project: Project }>(list: T[]): T[] => list.filter((e) => !paths.has(e.project.path));
    return {
        forkSync: selections.forkSync,
        template: keep(selections.template),
        boilerplate: keep(selections.boilerplate),
        component: keep(selections.component),
        adobeMcp: keep(selections.adobeMcp),
        blockLibrary: keep(selections.blockLibrary),
        blockLibraryInstall: keep(selections.blockLibraryInstall),
        inspector: keep(selections.inspector),
        integration: keep(selections.integration),
    };
}
