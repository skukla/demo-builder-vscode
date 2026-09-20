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
 * - under an agent → the notification, plus a phase line so the agent's own
 *   notification says what the run is waiting for rather than going quiet.
 *
 * Text entry is NOT a question: the DA.live namespace and token still come from
 * VS Code's input boxes, which open over the modal while it says it is waiting.
 *
 * @module core/vscode/operationPrompt
 */

import { AsyncLocalStorage } from 'async_hooks';
import * as vscode from 'vscode';
import { heldProgress, pushOperationProgress } from './operationProgress';
import { hasActivePhaseSinks, reportPhase } from '@/core/utils/agentPhaseChannel';
import type { MessageHandler } from '@/types/handlers';

/** The operation whose modal is on screen, for anything running inside it. */
const hosting = new AsyncLocalStorage<string>();

/** Resolvers for questions waiting on a modal, keyed by operation id. */
const waiting = new Map<string, (answer: string | undefined) => void>();

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
        // No modal: the notification, as before. Under an agent, say what the run is
        // waiting for — otherwise its narration simply stops mid-operation.
        if (hasActivePhaseSinks()) reportPhase(message);
        return vscode.window.showWarningMessage(message, ...actions);
    }

    const before = heldProgress(id);
    const answer = await new Promise<string | undefined>((resolve) => {
        waiting.set(id, resolve);
        void pushOperationProgress({
            ...(before ?? { id, state: 'running' }),
            id,
            state: 'running',
            prompt: { message, actions },
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
export function answerOperationPrompt(id: string, answer?: string): void {
    waiting.get(id)?.(answer);
}

/** Whether this operation is waiting on an answer — the modal's Cancel state. */
export function isAwaitingAnswer(id: string): boolean {
    return waiting.has(id);
}

/** Handler: `answerOperationPrompt` — the modal handing back what the SC chose. */
export const handleAnswerOperationPrompt: MessageHandler<{
    id?: string;
    answer?: string;
}> = async (_context, payload) => {
    if (!payload?.id) {
        return { success: false, error: 'No operation id' };
    }
    answerOperationPrompt(payload.id, payload.answer);
    return { success: true };
};
