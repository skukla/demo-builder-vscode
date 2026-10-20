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
import type { UpdateSelections } from '@/features/updates/services/updateSelections';
import type { Project } from '@/types/base';

const RESET_TO_TEMPLATE = 'Reset to template';
const KEEP_MY_EDITS = 'Keep my edits';
const REPLACE_BLOCKS = 'Replace blocks';
const KEEP_BLOCKS = 'Keep my blocks';
const STOP_AND_UPDATE = 'Stop and update';
const SKIP = 'Skip';

/** The two questions the shared apply asks, asked in the modal. */
export const questionsInModal: UpdateQuestions = {
    async resetTemplateOnConflict(project: Project, conflicts: string[]): Promise<boolean> {
        const noun = conflicts.length === 1 ? 'file' : 'files';
        const answer = await askDuringOperation(
            `${getProjectDisplayName(project)}: the template update conflicts with your edits in ` +
                `${conflicts.length} ${noun} (${conflicts.join(', ')}). "${RESET_TO_TEMPLATE}" replaces ` +
                `them with the template's version and discards your edits to them.`,
            RESET_TO_TEMPLATE,
            KEEP_MY_EDITS,
        );
        return answer === RESET_TO_TEMPLATE;
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
