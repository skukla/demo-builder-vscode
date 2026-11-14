/**
 * Project Creation — an Edit that points a project holding a datapack at another Commerce instance
 * (step-07 D6, review S4).
 *
 * Such an Edit rebuilds the project, and the datapack stays in the instance it went into, where
 * nothing could uninstall it once the project points elsewhere. So before anything runs, the Edit
 * asks Configure's question (`configureConnectionAnswer.ts`), in a VS Code dialog as an Edit asks
 * its other questions: Change Anyway (it stays there), Uninstall First (removed from the instance it
 * is in, the SC's changes settled first), or Cancel (nothing changes). After Uninstall First the
 * rebuild installs the Edit's datapack on the new instance, as creation does.
 *
 * @module features/project-creation/handlers/executorEditConnection
 */

import * as vscode from 'vscode';
import {
    answerConnectionChange,
    connectionAnswerDeps,
    type ConnectionAnswerDeps,
} from '@/features/dashboard/commands/configureConnectionAnswer';
import type { InstalledDatapackAnswer } from '@/features/dashboard/services/connectionChange';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

/** What the question needs: how the answer is carried out, and the asking. */
export interface EditConnectionDeps {
    answer: (context: HandlerContext) => ConnectionAnswerDeps;
    /** The SC's answer, by the datapack's name; undefined is Cancel. */
    ask: (displayName: string) => Promise<InstalledDatapackAnswer | undefined>;
}

const CHANGE_ANYWAY = 'Change Anyway';
const UNINSTALL_FIRST = 'Uninstall First';

/** Configure's words, in a modal: the question as the title, the line under it. */
async function askInDialog(displayName: string): Promise<InstalledDatapackAnswer | undefined> {
    const chosen = await vscode.window.showWarningMessage(
        'Change the Commerce Connection?',
        {
            modal: true,
            detail: `${displayName} is installed in the current Commerce instance. Uninstall it first, or it stays there.`,
        },
        CHANGE_ANYWAY,
        UNINSTALL_FIRST,
    );
    if (chosen === UNINSTALL_FIRST) return 'uninstall';
    return chosen === CHANGE_ANYWAY ? 'keep' : undefined;
}

const LIVE: EditConnectionDeps = {
    answer: connectionAnswerDeps,
    ask: askInDialog,
};

/**
 * Ask about the datapack before an Edit's rebuild changes the Commerce connection.
 *
 * @param project - the project as it was before the Edit, which Uninstall First removes from
 * @throws Error when the SC cancels, or Uninstall First did not take the datapack out: nothing changed
 */
export async function settleConnectionBeforeRebuild(
    context: HandlerContext,
    config: ProjectCreationConfig,
    project: Project,
    deps: EditConnectionDeps = LIVE,
): Promise<void> {
    const changes = config.componentConfigs ?? {};
    const answering = deps.answer(context);
    const asked = await answerConnectionChange(project, changes, undefined, answering);
    if (!asked) return;
    const answer = await deps.ask(asked.data.installedDatapack);
    if (!answer) throw new Error('Saving changes was cancelled by user. Nothing was changed.');
    await answerConnectionChange(project, changes, answer, answering);
}
