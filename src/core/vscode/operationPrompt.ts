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

/** One `withModalAsking` run: its questions are its own to clear when it ends. */
interface AskingRun {
    ended: boolean;
}

/** The run asking, for anything running inside it. */
const asking = new AsyncLocalStorage<AskingRun>();

/** The question on screen for each operation, the run that asked it, and how to answer it. */
const waiting = new Map<string, { resolve: (answer: PromptAnswer) => void; run?: AskingRun }>();

const NO_ANSWER: PromptAnswer = { action: undefined, values: {} };

/**
 * Run `work` as the operation a modal is showing, so a guard anywhere inside it can
 * ask through that modal without being handed the id.
 *
 * @param id - the operation id the modal is keyed by
 * @param work - the operation
 */
export async function withModalAsking<T>(id: string, work: () => Promise<T>): Promise<T> {
    const run: AskingRun = { ended: false };
    try {
        return await hosting.run(id, () => asking.run(run, work));
    } finally {
        // A question can outlive the work that asked it: the Adobe sign-in guard
        // races its own prompt against a timeout, so the run can end with a
        // resolver still sitting here. Left behind, the next run of the same
        // operation would answer the dead one. Only THIS run's: another run of the
        // operation may be asking now (runs side by side, owner 2026-11-04), and
        // clearing its question left it never answered. Answered as dismissed, so
        // the questions queued behind it go on.
        run.ended = true;
        const open = waiting.get(id);
        if (open?.run === run) {
            waiting.delete(id);
            open.resolve(NO_ANSWER);
        }
    }
}

/** A question with buttons: its heading, and the sentence under it. */
export interface Question {
    /** What the SC is asked to do, in a few words: "Sign in to Adobe". The modal's heading. */
    title: string;
    /** Why, and what each answer does. It must stand alone: a notification shows only this. */
    message: string;
    /** A routine step rather than a problem: an information icon, not a warning one. */
    tone?: 'info';
    /**
     * The answer that closing the dialog means ("Skip for now"). Shown as the dialog's own close
     * button, so VS Code adds no Cancel beside it: two buttons that both dismiss read as two
     * different choices (owner, 2026-10-30).
     */
    dismiss?: string;
}

/**
 * Ask the SC something the work cannot continue without.
 *
 * The same answer as `vscode.window.showWarningMessage`: the action they chose, or
 * `undefined` when they dismissed it.
 *
 * @param question - the heading and the sentence
 * @param actions - the answers, the first being the one that continues the work
 * @returns the chosen action, or undefined if dismissed
 */
export async function askDuringOperation(
    question: Question,
    ...actions: string[]
): Promise<string | undefined> {
    const { title, message } = question;
    const id = hosting.getStore();

    if (!id) {
        // Under an agent, say what the run is waiting for — otherwise its narration
        // simply stops mid-operation.
        if (hasActivePhaseSinks()) reportPhase(message);
        // An agent call (every tool call carries a tag, reads included) asks the way
        // the agent's other questions do: a modal. A button press keeps the
        // notification.
        if (currentCallTag() !== undefined) return askAsModal(question, actions);
        return question.tone === 'info'
            ? vscode.window.showInformationMessage(message, ...actions)
            : vscode.window.showWarningMessage(message, ...actions);
    }

    return (await askInModal(id, { title, message, actions })).action;
}

/**
 * The agent's question as a VS Code modal: the title is its heading and the sentence sits under
 * it, as in Demo Builder's own progress modal (owner, 2026-10-30: a paragraph with the action
 * buried in it read badly). VS Code gives every modal its own Cancel, so a "Cancel" action is
 * left out rather than shown twice, and a question with a `dismiss` answer shows that one as the
 * close button instead; dismissing answers `undefined`, as a notification's Cancel did, or the
 * `dismiss` answer.
 */
async function askAsModal({ title, message, tone, dismiss }: Question, actions: string[]): Promise<string | undefined> {
    const items: vscode.MessageItem[] = actions
        .filter((action) => action !== 'Cancel')
        .map((action) => ({ title: action, ...(action === dismiss ? { isCloseAffordance: true } : {}) }));
    const options = { modal: true, detail: `${message}\n\nDemo Builder's agent asked for this.` };
    const chosen = tone === 'info'
        ? await vscode.window.showInformationMessage(title, options, ...items)
        : await vscode.window.showWarningMessage(title, options, ...items);
    return chosen?.title;
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
    /** A heading of its own, for a question that is a task (a sign-in); the window takes it. */
    title?: string;
    message: string;
    steps?: string[];
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

/**
 * Each operation's questions, one after another. A window shows one question, and an operation
 * can ask two at once when its work runs side by side (the projects batch, owner 2026-11-04): the
 * second took the first's place, and the first was never answered.
 */
const turns = new Map<string, Promise<unknown>>();

/** Put the question up when the operation's earlier one is answered, and hand back its answer. */
function askInModal(id: string, prompt: OperationPrompt): Promise<PromptAnswer> {
    const earlier = turns.get(id) ?? Promise.resolve();
    const run = asking.getStore();
    const mine = earlier.then(() => askNow(id, prompt, run));
    const settled = mine.then(
        () => undefined,
        () => undefined,
    );
    turns.set(id, settled);
    void settled.then(() => {
        if (turns.get(id) === settled) turns.delete(id);
    });
    return mine;
}

/** Put the question up, wait for the answer, then put the stage back. */
async function askNow(id: string, prompt: OperationPrompt, run: AskingRun | undefined): Promise<PromptAnswer> {
    // Its run ended while it waited its turn: nobody is left to read the answer.
    if (run?.ended) return NO_ANSWER;
    const before = heldProgress(id);
    const answer = await new Promise<PromptAnswer>((resolve) => {
        waiting.set(id, { resolve, run });
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
    waiting.get(id)?.resolve({ action: answer, values });
}

/**
 * Take this operation's open question down without an answer: the work stopped
 * needing one (the sign-in it was waiting on finished in the browser). The asker
 * reads it as dismissed, so it must check for itself why it was taken down.
 */
export function withdrawQuestion(): void {
    const id = hosting.getStore();
    if (!id) return;
    // Only its own: with runs side by side the question on screen may be another's.
    const open = waiting.get(id);
    if (open && open.run === asking.getStore()) open.resolve(NO_ANSWER);
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
