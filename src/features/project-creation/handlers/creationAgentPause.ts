/**
 * An agent's creation that paused on a failed step, held between tool calls (F307).
 *
 * The wizard's creation screen asks the SC what to do about a failed step and the run
 * waits for the button. An agent has no screen, so `create_project` answers "paused"
 * with the step, the reason and the answers it can give, while the run goes on waiting.
 * The agent fixes the cause with its tools and answers with `continue_project_creation`,
 * which hands the answer to the run and waits again, for the next pause or the end.
 * Owner, 2026-11-19: the agent uses the same approach as the wizard.
 *
 * Runs are held by project name, as `cancel_project_creation` finds them, and dropped
 * when they end. A run stopped while it waits ends as a stopped creation; its door
 * cleans up as it always did.
 *
 * @module features/project-creation/handlers/creationAgentPause
 */

import { handleCreationPauseAnswer } from './creationPause';
import type { HandlerContext } from '@/types/handlers';
import type { CreationPauseNotice } from '@/types/webview';

/** Where a run stands when the agent hears back: paused on a step, or ended. */
export type AgentRunState<T> = { paused: CreationPauseNotice } | { ended: T };

interface WaitingRun {
    context: HandlerContext;
    ended: Promise<unknown>;
    pause: CreationPauseNotice;
}

const waiting = new Map<string, WaitingRun>();

/**
 * Wait until a creation an agent started ends, or pauses on a failed step.
 *
 * @param context - the run's context: the pause is announced on its shared state
 * @param projectName - the project being created, by which the run is found again
 * @param ended - the run and what its door answers when it ends; it never rejects
 * @param answer - given to the paused run once the listener is in place
 * @returns the pause, or what the door answered
 */
export async function untilPausedOrEnded<T>(
    context: HandlerContext,
    projectName: string,
    ended: Promise<T>,
    answer?: () => void,
): Promise<AgentRunState<T>> {
    const paused = new Promise<CreationPauseNotice>((resolve) => {
        context.sharedState.onCreationPause = resolve;
    });
    answer?.();
    const state = await Promise.race([
        ended.then((value): AgentRunState<T> => ({ ended: value })),
        paused.then((pause): AgentRunState<T> => ({ paused: pause })),
    ]);
    if ('paused' in state) {
        waiting.set(projectName, { context, ended, pause: state.paused });
        void ended.then(() => {
            if (waiting.get(projectName)?.ended === ended) waiting.delete(projectName);
        });
    } else {
        context.sharedState.onCreationPause = undefined;
        waiting.delete(projectName);
    }
    return state;
}

/**
 * Hand an agent's answer to its paused creation, then wait for the next pause or the end.
 *
 * @param projectName - the project being created
 * @param answer - Retry, Check Again or Skip This Step, as the pause offered
 * @returns where the run stands, or why the answer was refused
 */
export async function answerPausedCreation(
    projectName: string,
    answer: string,
): Promise<AgentRunState<unknown> | { error: string }> {
    const run = waiting.get(projectName);
    if (!run) return { error: `No creation of ${projectName} is waiting for an answer.` };
    const offered = [...run.pause.actions, ...(run.pause.canSkip ? ['Skip This Step'] : [])];
    if (!offered.includes(answer)) {
        return {
            error: `${answer} is not an answer to this step. Answer one of: ${offered.join(', ')}.`,
        };
    }
    waiting.delete(projectName);
    return untilPausedOrEnded(run.context, projectName, run.ended, () => {
        void handleCreationPauseAnswer(run.context, { answer });
    });
}
