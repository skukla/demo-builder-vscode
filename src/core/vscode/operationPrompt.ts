/**
 * A question the work cannot continue without — asked where the SC is already
 * looking (PL-59, owner 2026-09-20).
 *
 * Republishing Bodea put a progress modal on screen saying "Checking requirements /
 * Your DA.live sign-in", and a NOTIFICATION in the corner asking for that sign-in.
 * Two things talking about one operation, and the modal was spinning on the very
 * question the notification was asking. Answering the notification worked — that is
 * the point: the pause-and-continue was right, the surface was wrong.
 *
 * Eleven guards ask something mid-operation (a credential expired, a prerequisite
 * is missing, a merge needs a decision). Each called `vscode.window.showWarningMessage`
 * directly, which cannot know a modal is up. They ask through here instead, and the
 * question follows the same routing the progress does:
 *
 * - a modal is hosting this operation → the modal asks it, and "Run in background"
 *   becomes Cancel while it waits, because backgrounding an unanswered question
 *   leaves the work stuck with nothing to answer it;
 * - nothing is hosting it → the notification, exactly as before;
 * - under an agent, with no modal → a VS Code MODAL, like the agent's consent
 *   dialogs, plus a phase line so the agent's own notification says what the run
 *   is waiting for. It was the notification until 2026-09-21, when an agent's read
 *   needed Adobe sign-in and the question sat in a corner the owner expected to be
 *   a modal: every other thing an agent asks of the SC is one.
 *
 * The modal owns the FORM too (owner, 2026-09-20: "the modal should own the form
 * elements"). A question that needs something typed — the DA.live namespace, the
 * pasted token — is asked with `askForDetailsDuringOperation`, and the fields render
 * in the modal. Handing a form off to a VS Code input box is the same defect one step
 * along: one question, two surfaces. With no modal up, the caller keeps its own
 * input-box flow, which `modalIsAsking()` is for.
 *
 * @module core/vscode/operationPrompt
 */

import { AsyncLocalStorage } from 'async_hooks';
import * as vscode from 'vscode';
import { heldProgress, pushOperationProgress } from './operationProgress';
import { currentCallTag } from '@/core/logging/callTagContext';
import { hasActivePhaseSinks, reportPhase } from '@/core/utils/agentPhaseChannel';
import type { MessageHandler } from '@/types/handlers';
import type { OperationPrompt, OperationPromptField } from '@/types/webviewPayloads';

/** The operation whose modal is on screen, for anything running inside it. */
const hosting = new AsyncLocalStorage<string>();

/** What the SC did with a question: the action they chose, and anything they typed. */
export interface PromptAnswer {
    action?: string;
    values: Record<string, string>;
}

/** Resolvers for questions waiting on a modal, keyed by operation id. */
const waiting = new Map<string, (answer: PromptAnswer) => void>();

/**
 * Run `work` as the operation a modal is showing, so a guard anywhere inside it can
 * ask through that modal without being handed the id.
 *
 * @param id - the operation id the modal is keyed by
 * @param work - the operation
 */
export async function withModalAsking<T>(id: string, work: () => Promise<T>): Promise<T> {
    try {
        return await hosting.run(id, work);
    } finally {
        // A question can outlive the work that asked it: the Adobe sign-in guard
        // races its own prompt against a timeout, so the run can end with a
        // resolver still sitting here. Left behind, the next run of the same
        // operation would answer the dead one.
        waiting.delete(id);
    }
}

/**
 * Ask the SC something the work cannot continue without.
 *
 * Same shape as `vscode.window.showWarningMessage`, and the same answer: the action
 * they chose, or `undefined` when they dismissed it.
 *
 * @param message - the question, as a sentence
 * @param actions - the answers, the first being the one that continues the work
 * @returns the chosen action, or undefined if dismissed
 */
export async function askDuringOperation(
    message: string,
    ...actions: string[]
): Promise<string | undefined> {
    const id = hosting.getStore();

    if (!id) {
        // Under an agent, say what the run is waiting for — otherwise its narration
        // simply stops mid-operation.
        if (hasActivePhaseSinks()) reportPhase(message);
        // An agent call (every tool call carries a tag, reads included) asks the way
        // the agent's other questions do: a modal. A button press keeps the
        // notification.
        if (currentCallTag() !== undefined) return askAsModal(message, actions);
        return vscode.window.showWarningMessage(message, ...actions);
    }

    return (await askInModal(id, { message, actions })).action;
}

/**
 * The agent's question as a VS Code modal. VS Code gives every modal its own
 * Cancel, so a "Cancel" action is left out rather than shown twice; dismissing
 * answers `undefined`, as a notification's Cancel did.
 */
function askAsModal(message: string, actions: string[]): Thenable<string | undefined> {
    return vscode.window.showWarningMessage(
        message,
        { modal: true, detail: "Demo Builder's agent asked for this." },
        ...actions.filter((action) => action !== 'Cancel'),
    );
}

/**
 * Ask the SC to TYPE what the work needs — a namespace, a pasted token — in the
 * modal that is already narrating it.
 *
 * Only a modal can ask this: a notification has no fields. `modalIsAsking()` says
 * whether one is there, and the caller keeps its own VS Code input-box flow for
 * when none is.
 *
 * Re-asking is how an invalid answer is handled: call it again with the values
 * already typed and a `description` saying what is wrong, and the SC edits rather
 * than starts over.
 *
 * @param prompt - the question, the fields, and the answers
 * @returns the action chosen and everything typed; no action means dismissed
 */
export async function askForDetailsDuringOperation(prompt: {
    message: string;
    fields: OperationPromptField[];
    actions: string[];
}): Promise<PromptAnswer> {
    const id = hosting.getStore();
    if (!id) {
        return { action: undefined, values: {} };
    }
    return askInModal(id, prompt);
}

/** Whether a modal is on screen to ask this operation's questions. */
export function modalIsAsking(): boolean {
    return hosting.getStore() !== undefined;
}

/** Put the question up, wait for the answer, then put the stage back. */
async function askInModal(id: string, prompt: OperationPrompt): Promise<PromptAnswer> {
    const before = heldProgress(id);
    const answer = await new Promise<PromptAnswer>((resolve) => {
        waiting.set(id, resolve);
        void pushOperationProgress({
            ...(before ?? { id, state: 'running' }),
            id,
            state: 'running',
            prompt,
        });
    });
    waiting.delete(id);

    // Back to the stage it paused on, so the modal resumes rather than holding the
    // question after it has been answered.
    if (before) await pushOperationProgress(before);
    return answer;
}

/**
 * The SC answered a question in the modal.
 *
 * @param id - the operation the question belongs to
 * @param answer - the action they chose, or undefined if they dismissed it
 */
export function answerOperationPrompt(
    id: string,
    answer?: string,
    values: Record<string, string> = {},
): void {
    waiting.get(id)?.({ action: answer, values });
}

/** Whether this operation is waiting on an answer — the modal's Cancel state. */
export function isAwaitingAnswer(id: string): boolean {
    return waiting.has(id);
}

/** Handler: `answerOperationPrompt` — the modal handing back what the SC chose. */
export const handleAnswerOperationPrompt: MessageHandler<{
    id?: string;
    answer?: string;
    values?: Record<string, string>;
}> = async (_context, payload) => {
    if (!payload?.id) {
        return { success: false, error: 'No operation id' };
    }
    answerOperationPrompt(payload.id, payload.answer, payload.values);
    return { success: true };
};
