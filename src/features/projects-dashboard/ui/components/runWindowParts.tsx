/**
 * The parts a run window draws the same way whichever run it is: the Updates window's and the
 * projects batch window's (step-05 S4). Each row's state as its icon, a question asked in the
 * list, the question's answers as the window's buttons, and a row's status as the shared ending
 * rule reads it.
 *
 * Their own file, out of `UpdatesModal` and `UpdatesRunView`, so the batch window reaches only
 * what it draws: rendered on the project dashboard, it had pulled the Updates window's hook and
 * its three messages, and the Updates headings' classes, into a bundle that shows neither.
 *
 * @module features/projects-dashboard/ui/components/runWindowParts
 */

import React from 'react';
import { OperationPromptForm } from '@/core/ui/components/feedback/OperationPromptForm';
import type { StepStatus } from '@/core/ui/components/feedback/StepStatusIcon';
import type { ActionButton } from '@/core/ui/components/ui/Modal';
import type { EndingRow } from '@/core/ui/utils/runEnding';
import type { UpdateRowState } from '@/types/pendingUpdates';
import type { OperationPrompt } from '@/types/webviewPayloads';

/** A row's state as its icon; the projects batch run draws its rows with it too. */
export const ICON_OF: Record<UpdateRowState, StepStatus> = {
    waiting: 'pending',
    running: 'checking',
    done: 'success',
    failed: 'error',
    skipped: 'warning',
};

/** A question in the list: its sentence, and any fields it needs typed. Its answers are the buttons. */
export function RunQuestion({
    prompt,
    onTyped,
}: {
    prompt: OperationPrompt;
    onTyped: (values: Record<string, string>) => void;
}) {
    return (
        <div className="updates-run-question" role="group" aria-label="Question">
            <p className="updates-run-question-text">{prompt.message}</p>
            {prompt.fields?.length ? <OperationPromptForm fields={prompt.fields} onChange={onTyped} /> : null}
        </div>
    );
}

/**
 * A run row's status as the shared ending rule reads it: anything short of done (failed, skipped,
 * still going, never told) is a problem, and what it says once done is a note. The projects batch
 * run's rows have the same states, so it reads them through this too.
 */
export function endingRowOf(status: { state: UpdateRowState; message?: string } | undefined): EndingRow {
    return { problem: status?.state !== 'done', ...(status?.message ? { note: status.message } : {}) };
}

/**
 * A run's question, answered by the window's buttons: the prompt's answers, its main one last as
 * a dialog's main button goes (a prompt names it first). The projects batch window asks with it too.
 */
export function promptButtons(prompt: OperationPrompt, answer: (chosen?: string) => void): ActionButton[] {
    const main = prompt.destructive ? 'negative' : 'accent';
    const actions = prompt.actions.map((label, index): ActionButton => ({
        label,
        variant: index === 0 ? main : 'secondary',
        onPress: () => answer(label),
    }));
    return [...actions.slice(1), ...actions.slice(0, 1)];
}
