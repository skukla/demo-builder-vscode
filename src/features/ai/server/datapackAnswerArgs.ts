/**
 * The datapack arguments `delete_project` and `reset_project` share (step-05 S7, owner 2026-11-13:
 * the agent's reset gets the window's uninstall choice "with the save answers, as `delete_project`
 * has them"): `removeData`, the Uninstall Datapack box, and `changes` with `saveAs`, the answer
 * about the user's changes in a pack that is not theirs. One reading of them and one refusal, so
 * the two tools cannot drift apart.
 *
 * @module features/ai/server/datapackAnswerArgs
 */

import {
    beginSampleDataRemovalCheck,
    type SaveAsAnswer,
} from '@/features/eds/services/reset/edsResetSampleData';
import {
    datapackStepLine,
    type AnsweredDatapack,
    type DatapackRemoval,
} from '@/features/eds/services/reset/resetDatapackStep';
import type { Project } from '@/types/base';

/** The arguments as a call carries them, unchecked: a tool's handler receives what the agent sent. */
export interface DatapackAnswerArgs {
    removeData?: unknown;
    changes?: unknown;
    saveAs?: { displayName?: unknown };
}

/**
 * What `changes` means, said once for both tools: what the window's answers mean (step-05 S1,
 * Phase 8: agents match the screen). Delete Without Saving sends `drop` for every pack, the SC's own
 * included, so `drop` here does too.
 */
export const CHANGES_DESCRIPTION =
    "With removeData: keep saves the user's changes in the pack as a new datapack named by saveAs; drop loses them, in the user's own pack too. Left out, changes in the user's own pack are saved into it";

/**
 * The call's answer about the user's changes, handed to the removal as given, as the window hands
 * its answer: a name to save them as, or `drop` (which reaches the user's own pack too). None until
 * the call gives one: `keep` without a name is no answer, so the user's own pack is saved into.
 */
export function changesAnswer(args: DatapackAnswerArgs | undefined): SaveAsAnswer {
    if (args?.changes === 'drop') return 'drop';
    const name = args?.saveAs?.displayName;
    return args?.changes === 'keep' && typeof name === 'string' && name.trim()
        ? { saveAs: name.trim() }
        : undefined;
}

/** The call's Uninstall Datapack, as a reset reads it: only `removeData: true` removes anything. */
export function answeredOf(args: DatapackAnswerArgs | undefined): AnsweredDatapack | undefined {
    return args?.removeData === true
        ? { removeDatapack: true, changes: changesAnswer(args) }
        : undefined;
}

/**
 * The refusal when the user's changes had no answer: nothing was done, and how to answer.
 *
 * @param why - what the user changed, in the removal's words
 * @param undone - what was not done, past tense ("deleted", "reset")
 */
export function changesNeedAnswer(
    why: string,
    undone: 'deleted' | 'reset',
): { code: 'CHANGES_NEED_ANSWER'; error: string } {
    return {
        code: 'CHANGES_NEED_ANSWER',
        error: `${why} Nothing was ${undone}. Tell the user, then call again with removeData:true and changes:"keep" with saveAs (the name the user gives the new datapack), or changes:"drop" to lose them.`,
    };
}

/** Said when the call asked to uninstall a datapack the project does not have in a Commerce instance. */
const NONE_TO_UNINSTALL =
    'This project has no datapack in a Commerce instance, so there was none to uninstall.';

/**
 * What a reset did to the datapack, in the window row's words (`datapackStepLine`), for the answer.
 * Nothing when the call did not ask, or when the reset stopped before the step ran.
 */
export async function datapackAnswer(
    project: Project,
    answered: AnsweredDatapack | undefined,
    removal: DatapackRemoval | undefined,
): Promise<{ datapack?: string }> {
    if (!answered) return {};
    if (removal) return { datapack: datapackStepLine(removal) };
    return (await beginSampleDataRemovalCheck(project)) === true
        ? {}
        : { datapack: NONE_TO_UNINSTALL };
}
