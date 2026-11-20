/**
 * A creation step that fails pauses the run until the SC has fixed the problem (F307).
 *
 * Owner, 2026-11-19: "if something fails (such as expected datapack installation), the
 * process should be interrupted and the SC should be guided to a solution. Once the issue
 * is solved, the process should pick up again where it left off and finish correctly."
 * Until then the steps a project can live without (the datapack, warming product pages,
 * the catalog menu, the AI files) showed their failure for a moment on line 2 and the run
 * ended on a clean "Project Created".
 *
 * Now such a step waits on its failure, and so does every other step of a creation and
 * of an Edit (owner, 2026-11-19: "Shouldn't they be allowed to continue?"). Until then a
 * step the project needs ended the run, and the run deleted everything already built.
 * Skip This Step is offered once the project's code is on disk, and only after one Retry
 * or Check Again has failed as well: fixing it is the normal path, and going on without a
 * step the rare one, there so an SC is never blocked from a demo (owner, 2026-11-19).
 * The steps already done stay done. The buttons
 * follow the rule for retrying (`fixWithAi.ts`): Retry while a retry can help, otherwise
 * Fix with AI, which opens the SC's AI on the problem, and Check Again. Retry and Check
 * Again run the step again; once it passes, the run carries on from the next step. Skip
 * This Step goes on without it. Cancel is the run's own stop, which ends this wait and
 * cleans up as before. The run's time limit does not count while it waits
 * (`creationLimit.ts`).
 *
 * In the wizard the question is on the creation screen. Under an agent there is no
 * screen: `create_project` answers "paused" with the step, the reason and the answers,
 * the run waits, and the agent answers with `continue_project_creation`
 * (`creationAgentPause.ts`). The agent's phase line says what the run is waiting for.
 *
 * @module features/project-creation/handlers/creationPause
 */

import * as vscode from 'vscode';
import { creationLimitOf } from './creationLimit';
import type { CreationReporter } from './creationProgress';
import { creationCancelledError } from './creationStop';
import { FIX_WITH_AI, failedButtonLabel } from '@/core/utils/fixWithAi';
import {
    type StepFailure,
    stepFailureOfError,
} from '@/features/project-creation/services/stepFailure';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext } from '@/types/handlers';
import type { CreationPause } from '@/types/webview';

/** Runs the failed step again. */
export const RETRY = 'Retry';
/** Runs the failed step again, after a fix. */
export const CHECK_AGAIN = 'Check Again';
/** Goes on without the failed step. */
export const SKIP_STEP = 'Skip This Step';

/** What a pause needs from the run. */
export interface PauseDeps {
    context: HandlerContext;
    reporter: Pick<CreationReporter, 'pause'>;
    signal?: AbortSignal;
    /** The project's name and the step, for the AI's prompt. */
    projectName: string;
    step: string;
    /** Whether the project can go on without the step: Skip This Step. Default true. */
    canSkip?: boolean;
}

/**
 * Runs one step until it passes, or the SC skips it. Creation and Edit take one, so a
 * step pauses the same way wherever it runs.
 */
export type StepRunner = (
    step: string,
    attempt: () => Promise<StepFailure | undefined>,
    canSkip?: boolean,
) => Promise<void>;

/**
 * A run that cannot pause: each step runs once. A failure the step only reported goes
 * by, as it always did; one it threw ends the run with that error.
 */
export const RUN_ONCE: StepRunner = async (_step, attempt) => {
    const failure = await attempt();
    if (failure?.error !== undefined) throw failure.error;
};

/**
 * The step runner for one run: every step pauses on its failure.
 *
 * @param run - the run, without the step
 * @returns the runner
 */
export function stepRunner(run: Omit<PauseDeps, 'step' | 'canSkip'>): StepRunner {
    return (step, attempt, canSkip = true) => untilDone({ ...run, step, canSkip }, attempt);
}

/**
 * A step that throws, as one that resolves its failure. A stopped run's error still
 * ends the run.
 *
 * @param work - the step
 * @returns the step's attempt
 */
export function caught(work: () => Promise<unknown>): () => Promise<StepFailure | undefined> {
    return async () => {
        try {
            await work();
            return undefined;
        } catch (error) {
            if ((error as { code?: unknown } | undefined)?.code === ErrorCode.CANCELLED) throw error;
            return stepFailureOfError(error);
        }
    };
}

/**
 * Run a step until it passes, or the SC skips it.
 *
 * @param deps - the run
 * @param attempt - the step: resolves its failure, or undefined when it passed
 * @throws the cancelled error when the run is stopped while it waits
 */
export async function untilDone(
    deps: PauseDeps,
    attempt: () => Promise<StepFailure | undefined>,
): Promise<void> {
    for (let retries = 0; ; retries += 1) {
        const failure = await attempt();
        if (!failure) return;
        deps.context.logger.warn(
            `[Project Creation] ${deps.step} failed, waiting for the SC: ${failure.reason}`,
        );
        const answer = await waitForAnswer(deps, failure, retries);
        if (answer === SKIP_STEP) {
            deps.context.logger.info(`[Project Creation] ${deps.step} skipped`);
            return;
        }
    }
}

/** The main buttons for this failure. */
function actionsFor(failure: StepFailure, retries: number): string[] {
    return failedButtonLabel(retries, failure.retryable ?? false) === RETRY
        ? [RETRY]
        : [FIX_WITH_AI, CHECK_AGAIN];
}

/**
 * Wait for Retry, Check Again or Skip This Step, the limit held meanwhile. The wizard's
 * creation screen asks; with no screen, the agent that started the run is told and
 * answers through `continue_project_creation`. A run nobody can answer does not wait:
 * it goes on as a run that cannot pause would (`RUN_ONCE`).
 */
async function waitForAnswer(
    deps: PauseDeps,
    failure: StepFailure,
    retries: number,
): Promise<string> {
    const { panel, sharedState } = deps.context;
    if (!panel && !sharedState.onCreationPause) {
        if (failure.error !== undefined) throw failure.error;
        return SKIP_STEP;
    }
    const actions = actionsFor(failure, retries);
    const pause: CreationPause = {
        reason: failure.reason,
        // An agent is the AI: it fixes the problem itself, then says Check Again.
        actions: panel ? actions : actions.filter((action) => action !== FIX_WITH_AI),
        // Only once a fix attempt has failed too: a run should finish properly, and going on
        // without a step is the rare way out, so no SC is ever blocked (owner, 2026-11-19).
        canSkip: (deps.canSkip ?? true) && retries > 0,
    };
    const limit = creationLimitOf(deps.signal);
    limit?.hold();
    try {
        return await ask(deps, pause);
    } finally {
        limit?.release();
    }
}

/** Show the pause and wait; Fix with AI opens the AI and keeps waiting. */
async function ask(deps: PauseDeps, pause: CreationPause): Promise<string> {
    const answer = nextAnswer(deps);
    deps.reporter.pause(pause);
    deps.context.sharedState.onCreationPause?.({ ...pause, step: deps.step });
    try {
        for (let next = answer; ; next = nextAnswer(deps)) {
            const pressed = await next;
            if (pressed === SKIP_STEP && !pause.canSkip) continue;
            if (pressed !== FIX_WITH_AI) return pressed;
            await openFixWithAi(deps, pause.reason);
        }
    } finally {
        deps.context.sharedState.creationPauseAnswer = undefined;
        deps.reporter.pause(undefined);
    }
}

/** The next answer given, or the cancelled error when the run is stopped. */
function nextAnswer({ context, signal }: PauseDeps): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        if (signal?.aborted) {
            reject(creationCancelledError());
            return;
        }
        signal?.addEventListener('abort', () => reject(creationCancelledError()), { once: true });
        context.sharedState.creationPauseAnswer = resolve;
    });
}

/**
 * The prompt Fix with AI opens the SC's AI with: the project, the step and the reason.
 *
 * @param projectName - the project being created
 * @param step - the step that failed
 * @param reason - why
 * @returns the prompt
 */
export function creationFixPrompt(projectName: string, step: string, reason: string): string {
    return [
        `Creating the Demo Builder project ${projectName} is paused because a step failed.`,
        `Step: ${step}`,
        `Reason: ${reason}`,
        '',
        'Find the cause and fix it where it lives, using the Demo Builder tools (for a Commerce ' +
            'problem, read with run_commerce_rest and fix with write_commerce_rest). Do not create, ' +
            'delete or cancel the project. Tell me what you found and what you changed, so I can ' +
            'press Check Again in the wizard.',
    ].join('\n');
}

async function openFixWithAi(deps: PauseDeps, reason: string): Promise<void> {
    const prompt = creationFixPrompt(deps.projectName, deps.step, reason);
    await vscode.commands.executeCommand('demoBuilder.openInClaude', { prompt, fresh: true });
    deps.context.logger.info(`[Project Creation] Opened Fix with AI on ${deps.step}`);
}

/**
 * Handler: `creation-pause-answer` — the button the SC pressed on a paused creation.
 *
 * @param context - the wizard's context, whose shared state holds the waiting run
 * @param payload - the button's label
 * @returns whether a paused run took it
 */
export async function handleCreationPauseAnswer(
    context: HandlerContext,
    payload?: { answer?: unknown },
): Promise<{ success: boolean; error?: string }> {
    const answer = typeof payload?.answer === 'string' ? payload.answer : undefined;
    const waiting = context.sharedState.creationPauseAnswer;
    if (!answer || !waiting)
        return { success: false, error: 'No creation is waiting for an answer.' };
    if (answer !== FIX_WITH_AI) context.sharedState.creationPauseAnswer = undefined;
    waiting(answer);
    return { success: true };
}
